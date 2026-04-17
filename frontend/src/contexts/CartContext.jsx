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
    existingVariantLabel: '',
    attemptedVariantLabel: '',
    replace: false,
    append: false
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
    // All users are now restricted to personal cart; no marketing mode bypass
    return 'personal';
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

  const openVariantConflictDialog = useCallback(({ existingVariantLabel, attemptedVariantLabel }) => {
    return new Promise((resolve) => {
      variantConflictResolverRef.current = resolve;
      setVariantConflictDialog({
        open: true,
        existingVariantLabel,
        attemptedVariantLabel,
        replace: false,
        append: false
      });
    });
  }, []);

  const closeVariantConflictDialog = useCallback((choice = 'cancel') => {
    const resolver = variantConflictResolverRef.current;
    variantConflictResolverRef.current = null;
    setVariantConflictDialog((prev) => ({ ...prev, open: false }));
    if (resolver) resolver(choice);
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
                const dbItem = resp.data;
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
    let variantId = options.variantId || (typeof options.selectedVariant === 'string' ? options.selectedVariant : (options.selectedVariant?.id || options.selectedVariant?.name || options.selectedVariant?.size));
    const comboId = options.comboId || (typeof options.selectedCombo === 'string' ? options.selectedCombo : (options.selectedCombo?.id || options.selectedCombo?.name));
    const batchId = options.batchId || null;

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
      if (exists) return prevCart;
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

    setCart({ items: [], summary: { subtotal: 0, deliveryFee: 0, totalCommission: 0, total: 0, itemCount: 0 } });
    setCount(0);
    try {
      if (localStorage.getItem('token')) {
        await api.delete(`/cart?cartType=${cartType}`);
        await refresh(true);
      } else {
        localStorage.removeItem(`cartState_${cartType}`);
      }
    } catch (error) {
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
    let variantId = options.variantId || options.selectedVariant?.id || options.selectedVariant?.name || options.selectedVariant?.size;
    const comboId = options.comboId || options.selectedCombo?.id || options.selectedCombo?.name;

    // If this is a product with variants and caller didn't pass a variant, auto-pick a default one.
    if (itemType === 'product' && !variantId) {
      const variants = getProductVariants(productData);
      if (variants.length > 0) {
        const defaultVariant = variants.find((v) => Number(v?.stock ?? 1) > 0) || variants[0];
        variantId = getVariantIdentifier(defaultVariant) || null;
        selectedVariant = defaultVariant;
      }
    }

    // Auto-pick default variant/combo for fastfood if missing
    if (itemType === 'fastfood' && !variantId && !comboId) {
      const variants = parseMaybeJson(productData.sizeVariants, []);
      const combos = parseMaybeJson(productData.comboOptions, []);
      
      if (Array.isArray(variants) && variants.length > 0) {
        const defaultVariant = variants.find(v => v?.isAvailable !== false) || variants[0];
        variantId = typeof defaultVariant === 'string' ? defaultVariant : (defaultVariant?.id || defaultVariant?.name || defaultVariant?.size);
        selectedVariant = defaultVariant;
      } else if (Array.isArray(combos) && combos.length > 0) {
        const defaultCombo = combos.find(c => c?.isAvailable !== false) || combos[0];
        const comboIdInternal = typeof defaultCombo === 'string' ? defaultCombo : (defaultCombo?.id || defaultCombo?.name);
        return addToCartInternal(productId, quantity, { ...options, comboId: comboIdInternal, selectedCombo: defaultCombo });
      }
    }

    // If a different variant of same product exists, offer a choice: replace existing or keep both.
    if (itemType === 'product' && variantId) {
      const existingDifferentVariant = cart?.items?.find((item) => {
        if (Number(item.productId) !== productIdNum) return false;
        const existingVariant = String(item.variantId || '');
        return existingVariant && existingVariant !== String(variantId);
      });

      if (existingDifferentVariant) {
        const existingVariantLabel = existingDifferentVariant.variantName || getVariantLabel(existingDifferentVariant.variantId);
        const attemptedVariantLabel = getVariantLabel(selectedVariant) || getVariantLabel(variantId);

        const choice = await openVariantConflictDialog({
          existingVariantLabel,
          attemptedVariantLabel
        });

        if (choice === 'replace') {
          // Remove existing variant first, then continue adding the new variant.
          setCart(prevCart => {
            if (!prevCart) return prevCart;
            const updatedItems = prevCart.items.filter(item => !(
              item.itemType === 'product' &&
              Number(item.productId) === productIdNum &&
              String(item.variantId || '') === String(existingDifferentVariant.variantId || '')
            ));
            return { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
          });

          if (localStorage.getItem('token')) {
            try {
              const query = `type=product&cartType=${cartType}&variantId=${encodeURIComponent(existingDifferentVariant.variantId || '')}`;
              await api.delete(`/cart/${productIdNum}?${query}`);
            } catch (e) {
              await refresh(true);
              toast({
                title: 'Could not replace variant',
                description: 'Failed to remove existing variant. Please try again.',
                variant: 'destructive'
              });
              return;
            }
          } else {
            // Guest user: remove from local storage
            setCart(prevCart => {
              if (!prevCart) return prevCart;
              const updatedItems = prevCart.items.filter(item => !(
                item.itemType === 'product' &&
                Number(item.productId) === productIdNum &&
                String(item.variantId || '') === String(existingDifferentVariant.variantId || '')
              ));
              const newCart = { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
              localStorage.setItem(`cartState_${cartType}`, JSON.stringify(newCart));
              return newCart;
            });
          }

          toast({
            title: 'Variant Replaced',
            description: `Replacing ${existingVariantLabel} with ${attemptedVariantLabel}.`
          });
        } else if (choice === 'append') {
          toast({
            title: 'Adding another variant',
            description: `${attemptedVariantLabel} will be added alongside ${existingVariantLabel}.`
          });
        } else {
          toast({
            title: 'No changes made',
            description: 'Current cart variant kept unchanged.'
          });
          return;
        }
      }
    }

    // For fastfood options, mirror product-style append/replace when adding a different option of the same item.
    if (itemType === 'fastfood' && (variantId || comboId)) {
      const targetVariant = String(variantId || '');
      const targetCombo = String(comboId || '');

      const existingDifferentOption = cart?.items?.find((item) => {
        if (!(item.itemType === 'fastfood' || !!item.fastFoodId)) return false;
        if (Number(item.fastFoodId) !== productIdNum) return false;

        const itemVariant = String(item.variantId || '');
        const itemCombo = String(item.comboId || '');

        return itemVariant !== targetVariant || itemCombo !== targetCombo;
      });

      if (existingDifferentOption) {
        const existingOptionLabel = existingDifferentOption.comboName || existingDifferentOption.variantName || existingDifferentOption.comboId || existingDifferentOption.variantId || 'Existing Option';
        const attemptedOptionLabel = options.selectedCombo?.name || options.selectedVariant?.name || options.selectedVariant?.size || comboId || variantId || 'New Option';

        const choice = await openVariantConflictDialog({
          existingVariantLabel: existingOptionLabel,
          attemptedVariantLabel: attemptedOptionLabel
        });

        if (choice === 'replace') {
          setCart(prevCart => {
            if (!prevCart) return prevCart;
            const updatedItems = prevCart.items.filter(item => !(
              (item.itemType === 'fastfood' || !!item.fastFoodId) &&
              Number(item.fastFoodId) === productIdNum &&
              String(item.variantId || '') === String(existingDifferentOption.variantId || '') &&
              String(item.comboId || '') === String(existingDifferentOption.comboId || '')
            ));
            return { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
          });

          if (localStorage.getItem('token')) {
            try {
              const params = new URLSearchParams({
                type: 'fastfood',
                cartType,
                variantId: existingDifferentOption.variantId || '',
                comboId: existingDifferentOption.comboId || ''
              });
              await api.delete(`/cart/${productIdNum}?${params.toString()}`);
            } catch (e) {
              await refresh(true);
              toast({
                title: 'Could not replace option',
                description: 'Failed to remove existing option. Please try again.',
                variant: 'destructive'
              });
              return;
            }
          } else {
            // Guest user: remove from local storage
            setCart(prevCart => {
              if (!prevCart) return prevCart;
              const updatedItems = prevCart.items.filter(item => !(
                (item.itemType === 'fastfood' || !!item.fastFoodId) &&
                Number(item.fastFoodId) === productIdNum &&
                String(item.variantId || '') === String(existingDifferentOption.variantId || '') &&
                String(item.comboId || '') === String(existingDifferentOption.comboId || '')
              ));
              const newCart = { ...prevCart, items: updatedItems, summary: calculateSummary(updatedItems) };
              localStorage.setItem(`cartState_${cartType}`, JSON.stringify(newCart));
              return newCart;
            });
          }

          toast({
            title: 'Option Replaced',
            description: `Replacing ${existingOptionLabel} with ${attemptedOptionLabel}.`
          });
        } else if (choice === 'append') {
          toast({
            title: 'Adding another option',
            description: `${attemptedOptionLabel} will be added alongside ${existingOptionLabel}.`
          });
        } else {
          toast({
            title: 'No changes made',
            description: 'Current cart option kept unchanged.'
          });
          return;
        }
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
          if (!open) closeVariantConflictDialog('cancel');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Variant Already In Cart</DialogTitle>
            <DialogDescription>
              You already have <span className="font-semibold text-gray-900">{variantConflictDialog.existingVariantLabel}</span> in cart.
              New variant: <span className="font-semibold text-gray-900">{variantConflictDialog.attemptedVariantLabel}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={variantConflictDialog.replace}
                onCheckedChange={(checked) => setVariantConflictDialog((prev) => ({ ...prev, replace: !!checked, append: checked ? false : prev.append }))}
              />
              <span className="text-sm text-gray-700">Replace existing variant with the new one</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={variantConflictDialog.append}
                onCheckedChange={(checked) => setVariantConflictDialog((prev) => ({ ...prev, append: !!checked, replace: checked ? false : prev.replace }))}
              />
              <span className="text-sm text-gray-700">Append another variant (keep both in cart)</span>
            </label>
          </div>

          <DialogFooter>
            <button
              type="button"
              className="px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
              onClick={() => closeVariantConflictDialog('cancel')}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-orange-600 text-white hover:bg-orange-700"
              onClick={() => {
                const choice = variantConflictDialog.replace ? 'replace' : (variantConflictDialog.append ? 'append' : 'cancel');
                closeVariantConflictDialog(choice);
              }}
            >
              Continue
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
