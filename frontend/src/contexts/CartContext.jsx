import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { 
  normalizeVariants as unifyVariants, 
  getVariantId as unifiedGetVariantId, 
  getVariantLabel as unifiedGetVariantLabel 
} from '../utils/variantUtils';

const CartContext = createContext({
  count: 0,
  cart: null,
  loading: false,
  addingToCart: new Set(),
  refresh: () => { },
  addToCart: () => { },
  updateCartItem: () => { },
  removeFromCart: () => { },
  clearCart: () => { },
  updatingItems: new Set()
});

export function CartProvider({ children }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [count, setCount] = useState(0);
  const [cart, setCart] = useState({ items: [], summary: { itemCount: 0, subtotal: 0, deliveryFee: 0, total: 0 } });
  const [loading, setLoading] = useState(false);
  const [addingToCart, setAddingToCart] = useState(new Set()); // Track which products are being added
  const [updatingItems, setUpdatingItems] = useState(new Set()); // NEW: Track which items are being updated
  const [variantConflictDialog, setVariantConflictDialog] = useState({
    open: false,
    existingItems: [], // New: List of { id, label, isExactMatch }
    attemptedVariantLabel: '',
    selectedIds: new Set(), // New: Set of cart item IDs to replace
    isDuplicate: false
  });
  const [fastFoodConflictDialog, setFastFoodConflictDialog] = useState({
    open: false,
    existingSellerName: '',
    existingItemId: null,
    newItemName: '',
    newItemData: null
  });
  const [queuedItems, setQueuedItems] = useState(() => {
    const saved = localStorage.getItem('queued_fastfood_items');
    return saved ? JSON.parse(saved) : [];
  });
  const mergingRef = useRef(false); // Ref to safely prevent double-merges
  const refreshingRef = useRef(false); // Ref to prevent duplicate simultaneous refresh calls
  const pendingAuthRefreshRef = useRef(false); // Ref to track that a merge-refresh is waiting for an in-progress refresh to finish
  const variantConflictResolverRef = useRef(null);
  const fastFoodConflictResolverRef = useRef(null);

  const getActiveCartType = useCallback(() => {
    return localStorage.getItem('marketing_mode') === 'true' ? 'marketing' : 'personal';
  }, []);

  const calculateSummary = useCallback((items) => {
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
    const deliveryFee = items.reduce((sum, item) => {
      let unitFee = 0;
      const productData = item.fastFood || item.service || item.product || {};
      unitFee = parseFloat(productData.deliveryFee || 0);
      return sum + (unitFee * (item.quantity || 0));
    }, 0);

    const totalCommission = items.reduce((sum, item) => {
      if (typeof item.itemCommission === 'number') return sum + item.itemCommission;
      const productData = item.fastFood || item.service || item.product || {};
      const commission = parseFloat(productData.marketingCommission || 0);
      return sum + (commission * (item.quantity || 0));
    }, 0);

    return {
      subtotal,
      deliveryFee,
      totalCommission,
      total: subtotal + deliveryFee,
      itemCount: items.length
    };
  }, []);

  const parseMaybeJson = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const getProductVariants = (productData = {}) => {
    const normalized = unifyVariants(productData);
    return normalized;
  };

  const getVariantIdentifier = (variant) => {
    const finalId = unifiedGetVariantId(variant);
    
    console.log('[CartContext] getVariantIdentifier debug:', { 
      input: variant, 
      final: finalId 
    });

    return finalId;
  };

  const getVariantLabel = (variantOrId) => {
    return unifiedGetVariantLabel(variantOrId);
  };

  const openVariantConflictDialog = useCallback(({ existingItems, attemptedVariantLabel, isDuplicate = false }) => {
    return new Promise((resolve) => {
      variantConflictResolverRef.current = resolve;
      setVariantConflictDialog({
        open: true,
        existingItems,
        attemptedVariantLabel,
        isDuplicate,
        selectedIds: new Set()
      });
    });
  }, []);

  const closeVariantConflictDialog = useCallback((result = { action: 'cancel' }) => {
    const resolver = variantConflictResolverRef.current;
    variantConflictResolverRef.current = null;
    setVariantConflictDialog((prev) => ({ ...prev, open: false }));
    if (resolver) resolver(result);
  }, []);

  const openFastFoodConflictDialog = useCallback(({ existingSellerName, existingItemId, newItemName, newItemData }) => {
    return new Promise((resolve) => {
      fastFoodConflictResolverRef.current = resolve;
      setFastFoodConflictDialog({
        open: true,
        existingSellerName,
        existingItemId,
        newItemName,
        newItemData
      });
    });
  }, []);

  const closeFastFoodConflictDialog = useCallback((choice = 'cancel') => {
    const resolver = fastFoodConflictResolverRef.current;
    fastFoodConflictResolverRef.current = null;
    setFastFoodConflictDialog((prev) => ({ ...prev, open: false }));
    if (resolver) resolver(choice);
  }, []);

  const addToQueue = useCallback((item) => {
    setQueuedItems(prev => {
      const next = [...prev, item];
      localStorage.setItem('queued_fastfood_items', JSON.stringify(next));
      return next;
    });
    toast({
      title: 'Item Queued',
      description: `${item.product?.name || 'Item'} has been queued and will be added after your current order is placed.`,
    });
  }, [toast]);

  const refresh = useCallback(async (silent = false) => {
    // Prevent duplicate simultaneous refresh calls.
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    // Clear pending flag now that this refresh is actually running.
    pendingAuthRefreshRef.current = false;

    const cartType = getActiveCartType();
    const storageKey = `cartState_${cartType}`;

    try {
      if (user) {
        // 1. Check for any guest cart (personal or marketing) to merge
        const guestCartKeys = ['cartState_personal', 'cartState_marketing'];
        let guestCartToMerge = null;
        let guestCartKeyFound = null;

        for (const key of guestCartKeys) {
          const savedGuestCart = localStorage.getItem(key);
          if (savedGuestCart) {
            try {
              const parsedCart = JSON.parse(savedGuestCart);
              if (parsedCart && parsedCart.items && parsedCart.items.length > 0) {
                guestCartToMerge = parsedCart;
                guestCartKeyFound = key;
                break; // Found a guest cart, no need to check others
              }
            } catch (e) {
              console.error(`Failed to parse guest cart from ${key}:`, e);
              localStorage.removeItem(key); // Clear corrupted data
            }
          }
        }

        if (guestCartToMerge && !mergingRef.current) {
          mergingRef.current = true;
          try {
            await api.post('/cart/merge', { items: guestCartToMerge.items, cartType });
            if (guestCartKeyFound) {
              localStorage.removeItem(guestCartKeyFound);
            }
            // Clear all guest cart storage after successful merge to prevent "Merge Loops" or stale hydration
            localStorage.removeItem('cartState_personal');
            localStorage.removeItem('cartState_marketing');
          } catch (e) {
            console.error('Failed to merge guest cart:', e);
            // If merge fails, keep the guest cart in local storage for potential retry or user intervention
          } finally {
            mergingRef.current = false;
          }
        } else if (!guestCartToMerge) {
          // No guest cart was found — safe to clear any stale keys
          localStorage.removeItem('cartState_personal');
          localStorage.removeItem('cartState_marketing');
        }
        // If mergingRef.current is true (another merge is already in progress),
        // do NOT clear localStorage — the in-progress merge still needs that data.

        if (!silent && (!cart.items || cart.items.length === 0)) setLoading(true);

        try {
          const response = await api.get(`/cart?cartType=${cartType}`);
          const cartData = response.data;
          setCart(cartData || { items: [], summary: { itemCount: 0 } });
          setCount(cartData?.summary?.itemCount || 0);
        } catch (error) {
          console.warn('Failed to refresh cart:', error);
          setCart({ items: [], summary: { itemCount: 0 } });
          setCount(0);
        } finally {
          if (!silent) setLoading(false);
        }
        return;
      }

      // GUEST USER LOGIC
      const savedCart = localStorage.getItem(storageKey);
      if (savedCart) {
        try {
          const guestCart = JSON.parse(savedCart);
          if (guestCart && guestCart.items && guestCart.items.length > 0) {
            const rehydratedItems = await Promise.all(guestCart.items.map(async (item) => {
              try {
                const endpoint = item.itemType === 'fastfood' ? `/fastfood/${item.fastFoodId || item.id}` :
                  item.itemType === 'service' ? `/services/${item.serviceId || item.id}` :
                    `/products/${item.productId || item.id}`;
                const resp = await api.get(endpoint);
                const dbItem = resp?.data?.data || resp?.data;
                if (dbItem) {
                  let unitPrice = Number(dbItem.discountPrice || dbItem.displayPrice || dbItem.basePrice || dbItem.price || item.price || 0);
                  const unitDeliveryFee = Number(dbItem.deliveryFee || 0);
                  const unitCommission = dbItem.marketingEnabled ? Number(dbItem.marketingCommission || 0) : 0;
                  return {
                    ...item,
                    price: unitPrice,
                    total: unitPrice * item.quantity,
                    deliveryFee: unitDeliveryFee * item.quantity,
                    itemCommission: unitCommission * item.quantity,
                    product: item.itemType === 'product' ? dbItem : item.product,
                    fastFood: item.itemType === 'fastfood' ? dbItem : item.fastFood,
                    service: item.itemType === 'service' ? { ...dbItem, name: dbItem.title || dbItem.name } : item.service
                  };
                }
              } catch (e) {
                console.warn(`[CART] Rehydration failed:`, e.message);
              }
              return item;
            }));

            const updatedCart = { ...guestCart, items: rehydratedItems, summary: calculateSummary(rehydratedItems) };
            setCart(updatedCart);
            setCount(updatedCart.summary?.itemCount || 0);
          } else {
            setCart({ items: [], summary: { itemCount: 0 } });
            setCount(0);
            localStorage.removeItem(storageKey); // Clear empty or invalid guest cart
          }
        } catch (e) {
          console.error('Failed to parse saved guest cart:', e);
          setCart({ items: [], summary: { itemCount: 0 } });
          setCount(0);
          localStorage.removeItem(storageKey); // Clear corrupted data
        }
      } else {
        setCart({ items: [], summary: { itemCount: 0 } });
        setCount(0);
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [user?.id, calculateSummary, getActiveCartType]); // Removed cart.items.length to prevent dependency loop

  // Listen to realtime updates
  useEffect(() => {
    const onRealtimeUpdate = (event) => {
      const scope = event?.detail?.payload?.scope;
      if (['cart', 'orders', 'payments', 'inventory'].includes(scope)) {
        refresh(true);
      }
    };

    window.addEventListener('realtime:data-updated', onRealtimeUpdate);
    return () => window.removeEventListener('realtime:data-updated', onRealtimeUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only set up listener once, not when refresh changes


  const addToCartInternal = useCallback(async (productId, quantity = 1, options = {}) => {
    const productIdNum = Number(productId);
    const itemType = options.type || 'product';
    const cartType = getActiveCartType();
    const productData = options.product || {};
    let unitPrice = Number(productData.discountPrice || productData.displayPrice || productData.basePrice || productData.price || 0);
    let selectedVariant = options.selectedVariant || null;
    let variantId = options.variantId !== undefined ? options.variantId : (typeof options.selectedVariant === 'string' ? options.selectedVariant : (options.selectedVariant?.id || options.selectedVariant?.name || options.selectedVariant?.size));
    const comboId = options.comboId !== undefined ? options.comboId : (typeof options.selectedCombo === 'string' ? options.selectedCombo : (options.selectedCombo?.id || options.selectedCombo?.name));
    const batchId = options.batchId !== undefined ? options.batchId : null;

    setAddingToCart(prev => new Set(prev).add(productIdNum));

    if (itemType === 'fastfood' && options.selectedVariant) unitPrice = Number(options.selectedVariant.discountPrice || unitPrice);
    if (itemType === 'fastfood' && options.selectedCombo) unitPrice = Number(options.selectedCombo.discountPrice || unitPrice);
    if (itemType === 'product' && selectedVariant) {
      unitPrice = Number(selectedVariant.discountPrice || selectedVariant.displayPrice || selectedVariant.basePrice || unitPrice);
    }

    const optimisticItem = {
      id: `temp-${itemType}-${productId}-${Date.now()}`,
      productId: itemType === 'product' ? productIdNum : null,
      fastFoodId: itemType === 'fastfood' ? productIdNum : null,
      serviceId: itemType === 'service' ? productIdNum : null,
      quantity,
      price: unitPrice,
      total: unitPrice * quantity,
      deliveryFee: Number(productData.deliveryFee || 0) * quantity,
      itemCommission: (productData.marketingEnabled ? Number(productData.marketingCommission || 0) : 0) * quantity,
      itemType,
      variantId,
      comboId,
      batchId,
      product: itemType === 'product' ? productData : null,
      fastFood: itemType === 'fastfood' ? productData : null,
      service: itemType === 'service' ? productData : null
    };

    setCart(prevCart => {
      if (!prevCart) return { items: [optimisticItem], summary: calculateSummary([optimisticItem]) };
      
      const exists = prevCart.items.some(item => {
        const sameTypeAndId =
          (itemType === 'product' && Number(item.productId) === productIdNum) ||
          (itemType === 'fastfood' && Number(item.fastFoodId) === productIdNum) ||
          (itemType === 'service' && Number(item.serviceId) === productIdNum);

        if (!sameTypeAndId) return false;

        const itemVariant = item.variantId ?? null;
        const itemCombo = item.comboId ?? null;
        const itemBatch = item.batchId ?? null;
        const targetVariant = variantId ?? null;
        const targetCombo = comboId ?? null;
        const targetBatch = batchId ?? null;

        return itemVariant === targetVariant && itemCombo === targetCombo && itemBatch === targetBatch;
      });

      if (exists) {
        // If it exists, we increment the quantity
        const updatedItems = prevCart.items.map(item => {
          const sameTypeAndId =
            (itemType === 'product' && Number(item.productId) === productIdNum) ||
            (itemType === 'fastfood' && Number(item.fastFoodId) === productIdNum) ||
            (itemType === 'service' && Number(item.serviceId) === productIdNum);

          if (!sameTypeAndId) return item;

          const itemVariant = item.variantId ?? null;
          const itemCombo = item.comboId ?? null;
          const itemBatch = item.batchId ?? null;
          const targetVariant = variantId ?? null;
          const targetCombo = comboId ?? null;
          const targetBatch = batchId ?? null;

          if (itemVariant === targetVariant && itemCombo === targetCombo && itemBatch === targetBatch) {
            const newQty = (item.quantity || 0) + quantity;
            return { ...item, quantity: newQty, total: item.price * newQty };
          }
          return item;
        });
        return { items: updatedItems, summary: calculateSummary(updatedItems) };
      }
      const updatedItems = [...prevCart.items, optimisticItem];
      return { items: updatedItems, summary: calculateSummary(updatedItems) };
    });

    try {
      if (localStorage.getItem('token')) {
        const payload = { quantity, type: itemType, cartType, variantId, comboId, batchId };
        if (itemType === 'fastfood') payload.fastFoodId = productIdNum;
        else if (itemType === 'service') payload.serviceId = productIdNum;
        else payload.productId = productIdNum;

        const response = await api.post('/cart', payload);

        if (response.data.items && response.data.summary) {
          setCart({ items: response.data.items, summary: response.data.summary });
          setCount(response.data.summary.itemCount || 0);
        } else if (response.data.alreadyInCart) {
          await refresh(true);
        } else {
          await refresh(true);
        }
      } else {
        // For guest users, update local storage immediately
        setCart(prev => {
          const updatedItems = prev.items.map(item => {
            // Find the optimistic item and replace its temp ID if needed, or just ensure it's there
            if (item.id === optimisticItem.id) return { ...optimisticItem, id: `${itemType}-${productIdNum}-${variantId || comboId || ''}` };
            return item;
          });
          const newCart = { items: updatedItems, summary: calculateSummary(updatedItems) };
          const currentCartType = getActiveCartType();
          localStorage.setItem(`cartState_${currentCartType}`, JSON.stringify(newCart));
          return newCart;
        });
      }
    } catch (error) {
      toast({ title: "Error", description: error.response?.data?.message || "Failed to add to cart", variant: "destructive" });
      await refresh(true);
    } finally {
      setAddingToCart(prev => { const next = new Set(prev); next.delete(productIdNum); return next; });
    }
  }, [refresh, calculateSummary, getActiveCartType, toast]);

  const clearCart = useCallback(async () => {
    const cartType = getActiveCartType();

    // 1. Reset in-memory state immediately
    setCart({ items: [], summary: { subtotal: 0, deliveryFee: 0, totalCommission: 0, total: 0, itemCount: 0 } });
    setCount(0);

    // 2. Clear all possible local storage keys for guests
    localStorage.removeItem('cartState_personal');
    localStorage.removeItem('cartState_marketing');
    localStorage.removeItem('queued_fastfood_items');

    try {
      if (localStorage.getItem('token')) {
        // 3. Clear backend cart for logged in users
        await api.delete(`/cart?cartType=${cartType}`);
        // Silent refresh to sync with backend state
        await refresh(true);
      }
    } catch (error) {
      console.error('[CartContext] Failed to clear backend cart:', error);
      if (localStorage.getItem('token')) await refresh(true);
    }
  }, [refresh, getActiveCartType]);

  const addToCart = useCallback(async (productId, quantity = 1, options = {}) => {
    const productIdNum = Number(productId);
    if (!Number.isFinite(productIdNum)) {
      toast({ title: 'Error', description: 'Invalid item id', variant: 'destructive' });
      return;
    }
    const itemType = options.type || 'product';
    const cartType = getActiveCartType();
    const productData = options.product || {};
    let unitPrice = Number(productData.discountPrice || productData.displayPrice || productData.basePrice || productData.price || 0);
    let selectedVariant = options.selectedVariant || null;
    let variantId = options.variantId !== undefined ? options.variantId : (options.selectedVariant?.id || options.selectedVariant?.name || options.selectedVariant?.size);
    const comboId = options.comboId !== undefined ? options.comboId : (options.selectedCombo?.id || options.selectedCombo?.name);
    const batchId = options.batchId !== undefined ? options.batchId : null;

    // Auto-pick default variant for product if missing (keep this as products usually require variants)
    if (itemType === 'product' && !variantId) {
      const variants = getProductVariants(productData);
      if (variants.length > 0) {
        const defaultVariant = variants.find((v) => Number(v?.stock ?? 1) > 0) || variants[0];
        variantId = getVariantIdentifier(defaultVariant) || null;
        selectedVariant = defaultVariant;
      }
    }

    // If different variants of same product exist, offer a choice: replace existing or keep both.
    if (itemType === 'product' && variantId) {
      const existingVariants = cart?.items?.filter((item) => {
        if (Number(item.productId) !== productIdNum) return false;
        const existingVariant = String(item.variantId || '');
        return existingVariant && existingVariant !== String(variantId);
      }) || [];

      if (existingVariants.length > 0) {
        const attemptedVariantLabel = getVariantLabel(selectedVariant) || getVariantLabel(variantId);
        const itemsForDialog = existingVariants.map(entry => ({
          id: entry.id,
          label: entry.variantName || getVariantLabel(entry.variantId) || 'Standard',
          variantId: entry.variantId
        }));

        const result = await openVariantConflictDialog({
          existingItems: itemsForDialog,
          attemptedVariantLabel
        });

        if (result.action === 'continue') {
          const idsToRemove = result.selectedIds || new Set();
          if (idsToRemove.size > 0) {
            // Remove selected variants
            setCart(prevCart => {
              if (!prevCart) return prevCart;
              const updatedItems = prevCart.items.filter(item => !idsToRemove.has(item.id));
              return { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
            });

            if (localStorage.getItem('token')) {
              for (const id of idsToRemove) {
                const itemToRemove = existingVariants.find(ev => ev.id === id);
                if (itemToRemove) {
                  try {
                    const query = `type=product&cartType=${cartType}&variantId=${encodeURIComponent(itemToRemove.variantId || '')}`;
                    await api.delete(`/cart/${productIdNum}?${query}`);
                  } catch (e) {
                    console.error('Failed to remove variant during replacement:', e);
                  }
                }
              }
            } else {
              // Guest user removal already handled by setCart above for state, 
              // persist to local storage below.
              const currentCartType = getActiveCartType();
              const savedCart = localStorage.getItem(`cartState_${currentCartType}`);
              if (savedCart) {
                const guestCart = JSON.parse(savedCart);
                const updatedGuestItems = guestCart.items.filter(item => !idsToRemove.has(item.id));
                localStorage.setItem(`cartState_${currentCartType}`, JSON.stringify({ ...guestCart, items: updatedGuestItems }));
              }
            }

            toast({
              title: 'Variants Replaced',
              description: `Successfully updated your selection.`
            });
          }
        } else if (result.action === 'cancel') {
          return; // User dismissed — do nothing
        }
        // 'append' falls through to addToCartInternal below
      }
    }

    // For fastfood, check for ANY existing version of this product in cart (same or different variant/combo/batch)
    if (itemType === 'fastfood') {
      const targetVariant = String(variantId || '');
      const targetCombo = String(comboId || '');
      const targetBatch = batchId ? String(batchId) : null;

      const existingEntries = cart?.items?.filter((item) => {
        if (!(item.itemType === 'fastfood' || !!item.fastFoodId)) return false;
        return Number(item.fastFoodId) === productIdNum;
      }) || [];

      if (existingEntries.length > 0) {
        const exactMatch = existingEntries.find(entry => {
          const itemVariant = String(entry.variantId || '');
          const itemCombo = String(entry.comboId || '');
          const itemBatch = entry.batchId ? String(entry.batchId) : null;
          return itemVariant === targetVariant && itemCombo === targetCombo && itemBatch === targetBatch;
        });

        const isExactMatch = !!exactMatch;
        const attemptedOptionLabel = options.selectedCombo?.name || options.selectedVariant?.name || options.selectedVariant?.size || comboId || variantId || 'Standard';
        const batchLabelStr = (bId) => bId ? ` (Batch ${bId})` : '';

        const itemsForDialog = existingEntries.map(entry => ({
          id: entry.id,
          label: `${entry.comboName || entry.variantName || entry.comboId || entry.variantId || 'Standard'}${batchLabelStr(entry.batchId)}`,
          variantId: entry.variantId,
          comboId: entry.comboId,
          batchId: entry.batchId,
          isExactMatch: entry.id === exactMatch?.id
        }));

        const result = await openVariantConflictDialog({
          existingItems: itemsForDialog,
          attemptedVariantLabel: `${attemptedOptionLabel}${batchLabelStr(targetBatch)}`,
          isDuplicate: isExactMatch
        });

        if (result.action === 'continue') {
          const idsToRemove = result.selectedIds || new Set();
          if (idsToRemove.size > 0) {
            setCart(prevCart => {
              if (!prevCart) return prevCart;
              const updatedItems = prevCart.items.filter(item => !idsToRemove.has(item.id));
              return { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
            });

            if (localStorage.getItem('token')) {
              for (const id of idsToRemove) {
                const itemToRemove = existingEntries.find(ee => ee.id === id);
                if (itemToRemove) {
                  try {
                    const params = new URLSearchParams({
                      type: 'fastfood',
                      cartType,
                      variantId: itemToRemove.variantId || '',
                      comboId: itemToRemove.comboId || '',
                      batchId: itemToRemove.batchId || ''
                    });
                    await api.delete(`/cart/${productIdNum}?${params.toString()}`);
                  } catch (e) {
                    console.error('Failed to remove fastfood item during replacement:', e);
                  }
                }
              }
            } else {
              // Guest removal logic handled by state + effect
            }

            toast({
              title: idsToRemove.has(exactMatch?.id) && idsToRemove.size === 1 && isExactMatch ? 'Item Reset' : 'Cart Updated',
              description: 'Successfully updated your cart selection.'
            });
            
            // If we removed the exact match, we continue to add a fresh one (quantity 1).
            // If we didn't remove it but it was an exact match, the internal add will increment it.
          }
        } else if (result.action === 'cancel') {
          return; // User dismissed — do nothing
        }
        // 'append' falls through to addToCartInternal below
      }
    }

    // FAST FOOD SELLER CONFLICT CHECK
    if (itemType === 'fastfood') {
      const sellerId = productData.vendor || productData.sellerId;
      const existingFastFoodItem = cart?.items?.find(item => (item.itemType === 'fastfood' || !!item.fastFoodId));

      if (existingFastFoodItem) {
        const existingSellerId = existingFastFoodItem.fastFood?.vendor || existingFastFoodItem.product?.sellerId || existingFastFoodItem.sellerId;
        
        if (existingSellerId && String(existingSellerId) !== String(sellerId)) {
          const existingSellerName = existingFastFoodItem.sellerBusinessName || existingFastFoodItem.fastFood?.vendorDetail?.businessName || existingFastFoodItem.fastFood?.vendorDetail?.name || existingFastFoodItem.product?.seller?.businessName || existingFastFoodItem.product?.seller?.name || existingFastFoodItem.kitchenVendor || 'Another Seller';
          const existingItemId = existingFastFoodItem.fastFoodId || existingFastFoodItem.productId || existingFastFoodItem.id;
          const newItemName = productData.name || 'New Item';

          const choice = await openFastFoodConflictDialog({
            existingSellerName,
            existingItemId,
            newItemName,
            newItemData: { productId, quantity, options }
          });

          if (choice === 'redirect') {
            if (existingItemId) {
                window.location.href = `/fastfood/${existingItemId}`;
            }
            return;
          } else if (choice === 'clear_and_add') {
            await clearCart();
            await addToCartInternal(productId, quantity, options);
            window.location.href = `/fastfood/${productId}`;
            return;
          } else {
            return; // Cancel
          }
        }
      }
    }

    // ORIGINAL ADDTOCART LOGIC (now calling internal)
    return addToCartInternal(productId, quantity, { ...options, variantId, selectedVariant });
  }, [refresh, calculateSummary, getActiveCartType, cart?.items, toast, openVariantConflictDialog, openFastFoodConflictDialog, clearCart, addToQueue, addToCartInternal]);

  const processQueue = useCallback(async () => {
    if (queuedItems.length === 0) return;

    toast({
      title: 'Processing Queue',
      description: `Adding ${queuedItems.length} queued items to your cart...`,
    });

    for (const item of queuedItems) {
      try {
        await addToCart(item.productId || item.fastFoodId || item.id, item.quantity, {
          type: item.itemType || 'fastfood',
          product: item.product || item.fastFood,
          variantId: item.variantId,
          comboId: item.comboId
        });
      } catch (error) {
        console.error('Failed to add queued item:', error);
      }
    }

    setQueuedItems([]);
    localStorage.removeItem('queued_fastfood_items');
  }, [queuedItems, addToCart, toast]);

  const updateCartItem = useCallback(async (productId, quantity, type = 'product', options = {}) => {
    const cartType = getActiveCartType();
    const updateKey = `${type}-${productId}-${options.variantId || ''}-${options.comboId || ''}`;
    setUpdatingItems(prev => new Set(prev).add(updateKey));

    setCart(prevCart => {
      if (!prevCart) return prevCart;
      const updatedItems = prevCart.items.map(item => {
        const isMatch = (type === 'fastfood' && item.fastFoodId === parseInt(productId) && (item.variantId || null) === (options.variantId || null) && (item.comboId || null) === (options.comboId || null)) ||
          (type === 'service' && item.serviceId === parseInt(productId)) ||
          (type === 'product' && item.productId === parseInt(productId) && (item.variantId || null) === (options.variantId || null));
        if (isMatch) {
          const unitPrice = Number(item.price || 0);
          const productData = item.fastFood || item.service || item.product || {};
          const unitFee = Number(productData.deliveryFee || 0);
          return { ...item, quantity, total: unitPrice * quantity, deliveryFee: unitFee * quantity };
        }
        return item;
      });
      const newCart = { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
      if (!user) { // For guest users, persist to local storage
        localStorage.setItem(`cartState_${cartType}`, JSON.stringify(newCart));
      }
      return newCart;
    });

    try {
      if (localStorage.getItem('token')) {
        await api.put('/cart/update', { productId, quantity, type, cartType, variantId: options.variantId, comboId: options.comboId });
        await refresh(true);
      }
    } catch (error) {
      if (localStorage.getItem('token')) await refresh(true);
    } finally {
      setUpdatingItems(prev => { const next = new Set(prev); next.delete(updateKey); return next; });
    }
  }, [refresh, calculateSummary, getActiveCartType, user]);

  const removeFromCart = useCallback(async (productId, type = 'product', options = {}) => {
    const cartType = getActiveCartType();

    setCart(prevCart => {
      if (!prevCart) return prevCart;
      const updatedItems = prevCart.items.filter(item => {
        const isMatch = (type === 'fastfood' && item.fastFoodId === parseInt(productId) && (item.variantId || null) === (options.variantId || null) && (item.comboId || null) === (options.comboId || null)) ||
          (type === 'service' && item.serviceId === parseInt(productId)) ||
          (type === 'product' && item.productId === parseInt(productId) && (item.variantId || null) === (options.variantId || null));
        return !isMatch;
      });
      const newCart = { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
      if (!user) { // For guest users, persist to local storage
        if (newCart.items.length > 0) {
          localStorage.setItem(`cartState_${cartType}`, JSON.stringify(newCart));
        } else {
          localStorage.removeItem(`cartState_${cartType}`);
        }
      }
      return newCart;
    });

    try {
      if (localStorage.getItem('token')) {
        const params = new URLSearchParams({
          type,
          cartType,
          variantId: options.variantId || '',
          comboId: options.comboId || '',
          batchId: options.batchId || ''
        });
        await api.delete(`/cart/${productId}?${params.toString()}`);
        await refresh(true);
      }
    } catch (error) {
      if (localStorage.getItem('token')) await refresh(true);
    }
  }, [refresh, calculateSummary, getActiveCartType, user]);

  // How long (ms) to wait before retrying refresh() when a previous run was
  // already in flight at the time the user authenticated.  300 ms is enough for
  // the typical guest-rehydration API round-trip to complete while still being
  // imperceptible to the user.
  const REFRESH_RETRY_DELAY_MS = 300;

  // Load cart on mount and when user changes.
  // When the user authenticates while a previous guest-refresh is still running,
  // the refreshingRef guard would silently drop the merge call.  We work around
  // this by scheduling a single retry so the guest cart is merged correctly.
  useEffect(() => {
    if (refreshingRef.current) {
      // A refresh is already running (e.g. guest rehydration on mount).
      // Only queue one retry — if pendingAuthRefreshRef is already set, a retry
      // is already scheduled and we should not create a second one.
      if (pendingAuthRefreshRef.current) return;
      pendingAuthRefreshRef.current = true;
      const retryTimer = setTimeout(() => {
        refresh();
      }, REFRESH_RETRY_DELAY_MS);
      return () => clearTimeout(retryTimer);
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes, not when refresh changes

  // NEW: Persist guest cart to localStorage
  useEffect(() => {
    if (!user) {
      const cartType = getActiveCartType();
      const storageKey = `cartState_${cartType}`;
      if (cart && cart.items && cart.items.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(cart));
      } else if (cart && (!cart.items || cart.items.length === 0)) {
        // If cart is empty, clean up localStorage to avoid re-hydrating stale empty objects
        localStorage.removeItem(storageKey);
      }
    }
  }, [cart, user, getActiveCartType]);

  useEffect(() => { setCount(cart?.summary?.itemCount || 0); }, [cart]);

  const contextValue = useMemo(() => ({
    count,
    cart,
    loading,
    addingToCart,
    updatingItems,
    refresh,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    queuedItems,
    processQueue
  }), [
    count,
    cart,
    loading,
    addingToCart,
    updatingItems,
    refresh,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    queuedItems,
    processQueue
  ]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}

      <Dialog
        open={variantConflictDialog.open}
        onOpenChange={(open) => {
          if (!open) closeVariantConflictDialog({ action: 'cancel' });
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-orange-700">Item Already In Cart</DialogTitle>
            <DialogDescription>
              You are adding <span className="font-semibold text-gray-900">{variantConflictDialog.attemptedVariantLabel}</span>.
              Choose how to handle the existing item(s) below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">

            {/* ── SECTION 1: REPLACE ── */}
            <div className="rounded-2xl border border-orange-100 overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-orange-700 uppercase tracking-tight">Section 1 — Replace</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Check items to remove before adding the new one.</p>
                </div>
              </div>
              <div className="divide-y divide-gray-50 max-h-40 overflow-y-auto">
                {(variantConflictDialog.existingItems || []).map((cartItem) => (
                  <label
                    key={cartItem.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-orange-50/40 transition-colors cursor-pointer"
                  >
                    <Checkbox
                      checked={variantConflictDialog.selectedIds.has(cartItem.id)}
                      onCheckedChange={(checked) => {
                        setVariantConflictDialog((prev) => {
                          const next = new Set(prev.selectedIds);
                          if (checked) next.add(cartItem.id);
                          else next.delete(cartItem.id);
                          return { ...prev, selectedIds: next };
                        });
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-black text-gray-900 truncate uppercase tracking-tighter">
                        {cartItem.label}
                      </span>
                      <span className="text-[10px] text-gray-400">Currently in cart — check to replace</span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="px-4 py-3 bg-orange-50/50 border-t border-orange-100">
                <button
                  type="button"
                  disabled={variantConflictDialog.selectedIds.size === 0}
                  className="w-full h-9 rounded-xl bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40 font-black text-xs uppercase tracking-widest transition-all shadow-sm"
                  onClick={() => closeVariantConflictDialog({ action: 'continue', selectedIds: variantConflictDialog.selectedIds })}
                >
                  Replace Selected &amp; Add New
                </button>
              </div>
            </div>

            {/* ── SECTION 2: APPEND ── */}
            <div className="rounded-2xl border border-blue-100 overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-black text-blue-700 uppercase tracking-tight">Section 2 — Append</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Keep all existing items and add the new one alongside them.</p>
              </div>
              <div className="px-4 py-3">
                <div className="mb-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                  <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Adding:</p>
                  <p className="text-xs font-bold text-gray-900">{variantConflictDialog.attemptedVariantLabel}</p>
                </div>
                <button
                  type="button"
                  className="w-full h-9 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-sm"
                  onClick={() => closeVariantConflictDialog({ action: 'append' })}
                >
                  Add Alongside Existing
                </button>
              </div>
            </div>

          </div>

          <DialogFooter className="pt-1">
            <button
              type="button"
              className="w-full px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-xs uppercase tracking-wide transition-colors"
              onClick={() => closeVariantConflictDialog({ action: 'cancel' })}
            >
              Cancel — Do Nothing
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={fastFoodConflictDialog.open}
        onOpenChange={(open) => {
          if (!open) closeFastFoodConflictDialog('cancel');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-orange-600">Fast Food Seller Restriction</DialogTitle>
            <DialogDescription className="space-y-2">
              <p>
                You can only buy fast food from one source (one seller) at a time to ensure prompt delivery.
              </p>
              <p className="p-3 bg-orange-50 rounded-lg border border-orange-100 text-orange-800 text-sm">
                Your cart currently has items from <span className="font-bold">{fastFoodConflictDialog.existingSellerName}</span>.
                Adding <span className="font-bold">{fastFoodConflictDialog.newItemName}</span> would violate this restriction.
              </p>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <button
              onClick={() => closeFastFoodConflictDialog('redirect')}
              className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-orange-100 bg-orange-50 hover:bg-orange-100 transition-all group"
            >
              <div className="text-left">
                <span className="block font-bold text-orange-700">View {fastFoodConflictDialog.existingSellerName}'s Item</span>
                <span className="text-xs text-orange-600">Go to the detail page of the item already in your cart.</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-orange-700 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </button>

            <button
              onClick={() => closeFastFoodConflictDialog('clear_and_add')}
              className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-red-100 bg-red-50 hover:bg-red-100 transition-all group"
            >
              <div className="text-left">
                <span className="block font-bold text-red-700">Clear cart &amp; add this item</span>
                <span className="text-xs text-red-600">Remove all current items and start fresh with <span className="font-semibold">{fastFoodConflictDialog.newItemName}</span>.</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center text-red-700 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
            </button>
          </div>

          <DialogFooter>
            <button
              type="button"
              className="w-full px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
              onClick={() => closeFastFoodConflictDialog('cancel')}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CartContext.Provider>
  );
}

export function useCart() { return useContext(CartContext); }
