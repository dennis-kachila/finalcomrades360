import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Heart,
  List,
  MapPin,
  MessageCircle,
  Settings,
  Shield,
  ShoppingBag,
  Star,
  Truck,
  Utensils,
  Flame,
  Users,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { usePersistentFetch } from '../hooks/usePersistentFetch';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useToast } from '../components/ui/use-toast';
import { useWishlist } from '../contexts/WishlistContext';
import { fastFoodService } from '../services/fastFoodService';
import fastFoodPickupPointService from '../services/fastFoodPickupPointService';
import { resolveImageUrl } from '../utils/imageUtils';
import { ensureArray, normalizeIngredient, recursiveParse } from '../utils/parsingUtils';
import Footer from '../components/Footer';
import AdminInquiryModal from '../components/AdminInquiryModal';
import FastFoodCard from '../components/FastFoodCard';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJsonSafe = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const toStringArray = (value) => {
  const parsed = recursiveParse(value);
  if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
  if (typeof parsed === 'string') {
    return parsed
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

const getOptionPrice = (option, fallback = 0) => {
  if (!option || typeof option !== 'object') return fallback;
  const candidates = [
    option.discountPrice,
    option.displayPrice,
    option.basePrice,
    option.price,
    option.amount,
    option.cost,
    option.unitPrice
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return fallback;
};

const getComboItemsLabel = (comboOption) => {
  if (!comboOption || typeof comboOption !== 'object') return 'None';
  const rawItems = comboOption.items ?? comboOption.comboItems ?? comboOption.includes ?? comboOption.contents;
  const parsedItems = recursiveParse(rawItems);

  if (!parsedItems) return 'None';

  if (typeof parsedItems === 'string') {
    return parsedItems.includes(',')
      ? parsedItems.split(',').map((s) => s.trim()).filter(Boolean).join(', ') || 'None'
      : parsedItems;
  }

  if (Array.isArray(parsedItems)) {
    const labels = parsedItems
      .map((entry) => {
        const parsed = recursiveParse(entry);
        if (typeof parsed === 'string') return parsed;
        if (!parsed || typeof parsed !== 'object') return null;
        const name = parsed.name || parsed.item || parsed.itemName || parsed.title;
        const qty = parsed.quantity || parsed.qty || parsed.count;
        return name ? (qty ? `${name} (${qty})` : name) : null;
      })
      .filter(Boolean);

    return labels.length > 0 ? labels.join(', ') : 'None';
  }

  return 'None';
};

const FastFoodDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart, removeFromCart, cart } = useCart();
  const { user } = useAuth();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(null);
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  
  // New: Batch System states
  const [batchSystemEnabled, setBatchSystemEnabled] = useState(false);
  const [activeBatches, setActiveBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const mainCtaRef = useRef(null);
  const [visibleReviewsCount, setVisibleReviewsCount] = useState(3);
  const [activePickupPoints, setActivePickupPoints] = useState([]);
  const [loadingPickupPoints, setLoadingPickupPoints] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const [loadingRelatedItems, setLoadingRelatedItems] = useState(false);
  const [primaryButtonBusy, setPrimaryButtonBusy] = useState(false);
  const [relatedButtonBusyMap, setRelatedButtonBusyMap] = useState({});
  const [debugEvents, setDebugEvents] = useState([]);

  const buyDebugEnabled = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('debugBuy') === '1';
  }, [location.search]);

  const autoAddProcessed = useRef(false);

  const pushDebugEvent = useCallback((label, data = {}) => {
    if (!buyDebugEnabled) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toLocaleTimeString(),
      label,
      data
    };

    console.debug('[FastFoodDetails debug]', label, data);
    setDebugEvents((prev) => [entry, ...prev].slice(0, 30));
  }, [buyDebugEnabled]);

  const fetchFastFoodById = useCallback(async () => {
    const response = await fastFoodService.getFastFoodById(id);
    return response;
  }, [id]);

  const persistentFetchOptions = useMemo(() => ({ staleTime: 5 * 60 * 1000 }), []);

  const { data: fetchResponse, loading: hookLoading, error: hookError } = usePersistentFetch(
    `fastfood_detail_${id}`,
    fetchFastFoodById,
    persistentFetchOptions
  );

  // Fetch Batch System Settings and Active Batches
  useEffect(() => {
    const initBatchSystem = async () => {
      try {
        setLoadingBatches(true);
        // 1. Check if batch system is enabled platform-wide
        const configRes = await fastFoodService.getPublicBatchSystemConfig();
        const enabled = configRes.enabled === true || configRes.value === 'true';
        setBatchSystemEnabled(enabled);

        if (enabled) {
          // 2. Fetch actually active batches
          const batchRes = await fastFoodService.getActiveBatches();
          if (batchRes.success && Array.isArray(batchRes.batches)) {
            setActiveBatches(batchRes.batches);
            
            // Auto-select first batch if none selected and in cart
            if (batchRes.batches.length > 0) {
              // We might want to see if any item already in cart has a batch, 
              // but usually for a new item we want a fresh selection.
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize batch system info:', err);
      } finally {
        setLoadingBatches(false);
      }
    };
    initBatchSystem();
  }, []);

  useEffect(() => {
    const fetchActivePickupPoints = async () => {
      if (item?.pickupAvailable) {
        try {
          setLoadingPickupPoints(true);
          const response = await fastFoodPickupPointService.getActivePickupPoints();
          setActivePickupPoints(response.data || []);
        } catch (error) {
          console.error("Failed to fetch pickup points:", error);
        } finally {
          setLoadingPickupPoints(false);
        }
      }
    };
    fetchActivePickupPoints();
  }, [item?.pickupAvailable]);

  useEffect(() => {
    const fetchRelatedItems = async () => {
      const vendorId = item?.vendor || item?.vendorId || item?.sellerId;

      if (!item?.id || !vendorId) {
        setRelatedItems([]);
        return;
      }

      try {
        setLoadingRelatedItems(true);
        const response = await fastFoodService.getAllFastFoods({
          vendor: vendorId,
          limit: 12,
          page: 1,
          browseAll: 'true'
        });

        const itemsFromSeller = Array.isArray(response?.data) ? response.data : [];
        setRelatedItems(itemsFromSeller.filter((entry) => Number(entry.id) !== Number(item.id)));
      } catch (error) {
        console.error('Failed to fetch related fast food items:', error);
        setRelatedItems([]);
      } finally {
        setLoadingRelatedItems(false);
      }
    };

    fetchRelatedItems();
  }, [item?.id, item?.vendor, item?.vendorId, item?.sellerId]);


  useEffect(() => {
    if (fetchResponse) {
      if (fetchResponse.success) {
        const payload = fetchResponse.data;
        setItem(payload);
        // Important: Update active image for the new item
        setActiveImage(payload.mainImage || (Array.isArray(payload.galleryImages) ? payload.galleryImages[0] : null));
      } else {
        toast({ title: 'Error', description: 'Failed to load item.', variant: 'destructive' });
      }
      setLoading(false);
    } else if (hookLoading) {
      setLoading(true);
    }

    if (hookError) {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
      setLoading(false);
    }
  }, [fetchResponse, hookLoading, hookError, toast]);

  useEffect(() => {
    setVisibleReviewsCount(3);
  }, [item?.id]);

  const handleBack = () => {
    const fromPath = typeof location.state?.from === 'string' ? location.state.from : null;

    // Prefer explicit source route when provided to keep backflow deterministic.
    if (fromPath) {
      const isDetailPath = /^\/fastfood\/\d+$/.test(fromPath);
      if (isDetailPath) {
        navigate(fromPath, { state: { from: '/fastfood' } });
        return;
      }
      navigate(fromPath);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    if (localStorage.getItem('marketing_mode') === 'true') {
      navigate('/marketing');
      return;
    }
    navigate('/fastfood');
  };

  const navigateToFastFoodCart = () => {
    navigate('/cart?scope=fastfood', {
      state: { from: `/fastfood/${id}` }
    });
  };

  const pricing = useMemo(() => {
    const base = toNumber(item?.displayPrice || item?.basePrice || item?.price, 0);
    const discount = toNumber(item?.discountPrice, base);
    const pct = toNumber(item?.discountPercentage, 0);
    const hasDiscount = pct > 0 && discount > 0 && discount < base;
    const finalPrice = discount > 0 ? discount : base;
    return { base, finalPrice, pct, hasDiscount };
  }, [item]);

  const availabilityStatus = useMemo(() => fastFoodService.getAvailabilityStatus(item), [item]);
  const isOpen = !!availabilityStatus?.isAvailable;

  const galleryImages = useMemo(() => {
    const images = [item?.mainImage, ...ensureArray(item?.galleryImages)].filter(Boolean);
    return [...new Set(images)];
  }, [item]);

  const variantOptions = useMemo(() => {
    const parsed = recursiveParse(item?.sizeVariants);
    return Array.isArray(parsed) ? parsed.map((v) => recursiveParse(v)).filter(Boolean) : [];
  }, [item]);

  const comboOptions = useMemo(() => {
    const parsed = recursiveParse(item?.comboOptions);
    return Array.isArray(parsed) ? parsed.map((v) => recursiveParse(v)).filter(Boolean) : [];
  }, [item]);

  const defaultVariantOption = useMemo(() => {
    if (!variantOptions.length) return null;
    return variantOptions.find((variant) => variant?.isAvailable !== false) || variantOptions[0];
  }, [variantOptions]);

  const defaultComboOption = useMemo(() => {
    if (!comboOptions.length) return null;
    return comboOptions.find((combo) => combo?.isAvailable !== false) || comboOptions[0];
  }, [comboOptions]);



  const deliveryZones = useMemo(() => toStringArray(item?.deliveryCoverageZones), [item?.deliveryCoverageZones]);
  const allergens = useMemo(() => toStringArray(item?.allergens), [item?.allergens]);
  const dietaryTags = useMemo(() => toStringArray(item?.dietaryTags), [item?.dietaryTags]);
  const nutritionalInfo = useMemo(() => recursiveParse(item?.nutritionalInfo), [item?.nutritionalInfo]);
  const customizations = useMemo(() => ensureArray(item?.customizations), [item?.customizations]);

  const ingredients = useMemo(() => {
    const parsed = recursiveParse(item?.ingredients);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => normalizeIngredient(entry))
        .filter((entry) => entry?.name);
    }
    if (typeof parsed === 'string' && parsed.trim()) {
      return parsed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ name: line, quantity: '' }));
    }
    return [];
  }, [item?.ingredients]);

  const reviews = useMemo(() => (Array.isArray(item?.reviews) ? item.reviews : []), [item?.reviews]);
  const visibleReviews = useMemo(() => reviews.slice(0, visibleReviewsCount), [reviews, visibleReviewsCount]);
  const hasMoreReviews = visibleReviewsCount < reviews.length;

  const schedule = useMemo(() => {
    const parsed = parseJsonSafe(item?.availabilityDays, item?.availabilityDays);
    return Array.isArray(parsed) ? parsed : [];
  }, [item?.availabilityDays]);

  const nextOpening = useMemo(() => {
    if (isOpen || !schedule.length || item?.availabilityMode === 'CLOSED') return null;
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const todayIndex = now.getDay();
    const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    // Check if it opens later today
    const todayName = days[todayIndex];
    const todaySched = schedule.find(s => (s.day === todayName || s.day === 'All Days') && s.available);
    if (todaySched && todaySched.from > currentTimeStr) {
      return { day: 'today', time: todaySched.from };
    }

    // Look for next available day
    for (let i = 1; i <= 7; i++) {
      const nextIndex = (todayIndex + i) % 7;
      const nextDayName = days[nextIndex];
      const nextSched = schedule.find(s => (s.day === nextDayName || s.day === 'All Days') && s.available);
      if (nextSched) {
        return { day: i === 1 ? 'tomorrow' : nextDayName, time: nextSched.from };
      }
    }
    return null;
  }, [isOpen, schedule, item?.availabilityMode, item?.availableFrom]);

  const canOrder = isOpen;
  const minOrderQty = Math.max(1, toNumber(item?.minOrderQty, 1));
  const maxOrderQty = toNumber(item?.maxOrderQty, 0);
  const isWishlisted = item ? isInWishlist(item.id, 'fastfood') : false;

  const handleWishlistToggle = async () => {
    if (!item?.id) return;

    if (!user) {
      toast({
        title: 'Login Required',
        description: 'Please log in to add this item to your wishlist.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const updated = await toggleWishlist(item.id, 'fastfood');
      if (updated === false) return;
    } catch (_) {
      toast({
        title: 'Error',
        description: 'Failed to update wishlist.',
        variant: 'destructive'
      });
    }
  };

  const normalizeOptionId = (value) => (value === null || value === undefined ? '' : String(value));

  const getSizeVariantId = (variant) => {
    if (!variant) return '';
    if (typeof variant === 'string') return normalizeOptionId(variant);
    
    // Robust ID lookup: Check all common keys used by vendors
    const id = variant.id || variant.name || variant.size || variant.variant || variant.label || variant.sku || variant.title;
    return normalizeOptionId(id);
  };

  const getComboOptionId = (combo) => {
    if (!combo) return '';
    if (typeof combo === 'string') return normalizeOptionId(combo);
    
    const id = combo.id || combo.name || combo.variant || combo.label || combo.sku || combo.title;
    return normalizeOptionId(id);
  };

  const isFastFoodOptionInCart = (variantId = null, comboId = null, batchId = null) => {
    const vId = normalizeOptionId(variantId);
    const cId = normalizeOptionId(comboId);
    const bId = batchId ? String(batchId) : null;

    const cartItems = Array.isArray(cart?.items) ? cart.items : [];
    
    return cartItems.some((cartItem) => {
      // Must be fastfood
      const isFF = String(cartItem?.itemType || '') === 'fastfood' || !!cartItem?.fastFoodId;
      if (!isFF) return false;

      // Must be THIS fastfood item
      const itemMatch = String(cartItem?.fastFoodId || cartItem?.productId || '') === String(item?.id || '');
      if (!itemMatch) return false;

      // Check specific options using STRICT equality
      const cartVariantId = normalizeOptionId(cartItem?.variantId);
      const cartComboId = normalizeOptionId(cartItem?.comboId);
      const cartBatchId = cartItem?.batchId ? String(cartItem.batchId) : null;
      
      return cartVariantId === vId && cartComboId === cId && cartBatchId === bId;
    });
  };

  const isRelatedItemInCart = (fastFoodId) => {
    return (Array.isArray(cart?.items) ? cart.items : []).some((cartItem) => {
      if (String(cartItem?.itemType || '') !== 'fastfood') return false;
      return String(cartItem?.fastFoodId || cartItem?.fastFood?.id || '') === String(fastFoodId);
    });
  };

  const primaryButtonSelection = useMemo(() => {
    if (defaultVariantOption) {
      return {
        variant: defaultVariantOption,
        combo: null,
        variantId: getSizeVariantId(defaultVariantOption),
        comboId: ''
      };
    }

    if (defaultComboOption) {
      return {
        variant: null,
        combo: defaultComboOption,
        variantId: '',
        comboId: getComboOptionId(defaultComboOption)
      };
    }

    return {
      variant: null,
      combo: null,
      variantId: '',
      comboId: ''
    };
  }, [defaultComboOption, defaultVariantOption]);

  const isPrimarySelectionInCart = isFastFoodOptionInCart(
    primaryButtonSelection.variantId,
    primaryButtonSelection.comboId,
    selectedBatchId
  );

  const buildDebugSnapshot = useCallback(() => {
    const fastFoodCartItems = (Array.isArray(cart?.items) ? cart.items : [])
      .filter((cartItem) => String(cartItem?.itemType || '') === 'fastfood')
      .map((cartItem) => ({
        fastFoodId: cartItem.fastFoodId,
        variantId: cartItem.variantId || '',
        comboId: cartItem.comboId || '',
        quantity: cartItem.quantity || 0
      }));

    return {
      itemId: item?.id,
      itemName: item?.name,
      variantCount: variantOptions.length,
      comboCount: comboOptions.length,
      primaryVariantId: primaryButtonSelection.variantId,
      primaryComboId: primaryButtonSelection.comboId,
      isPrimarySelectionInCart,
      primaryButtonBusy,
      cartItemCount: cart?.summary?.itemCount || 0,
      fastFoodCartItems,
      relatedBusyIds: Object.keys(relatedButtonBusyMap)
    };
  }, [
    cart?.items,
    cart?.summary?.itemCount,
    comboOptions.length,
    isPrimarySelectionInCart,
    item?.id,
    item?.name,
    primaryButtonBusy,
    primaryButtonSelection.comboId,
    primaryButtonSelection.variantId,
    relatedButtonBusyMap,
    variantOptions.length
  ]);

  const primaryButtonLabel = primaryButtonBusy
    ? (isPrimarySelectionInCart ? 'REMOVING' : 'ADDING')
    : (isPrimarySelectionInCart ? 'REMOVE' : 'BUY');

  const toggleRelatedItemInCart = async (relatedItem) => {
    const inCart = isRelatedItemInCart(relatedItem.id);

    if (relatedButtonBusyMap[relatedItem.id]) {
      pushDebugEvent('related-click-ignored-busy', {
        relatedItemId: relatedItem.id,
        relatedItemName: relatedItem.name,
        inCart
      });
      return;
    }

    setRelatedButtonBusyMap((prev) => ({ ...prev, [relatedItem.id]: true }));
    pushDebugEvent('related-click', {
      relatedItemId: relatedItem.id,
      relatedItemName: relatedItem.name,
      inCart
    });

    try {
      if (inCart) {
        const cartEntry = (Array.isArray(cart?.items) ? cart.items : []).find((cartItem) => {
          if (String(cartItem?.itemType || '') !== 'fastfood') return false;
          return String(cartItem?.fastFoodId || cartItem?.fastFood?.id || '') === String(relatedItem.id);
        });

        pushDebugEvent('related-remove-start', {
          relatedItemId: relatedItem.id,
          variantId: cartEntry?.variantId || '',
          comboId: cartEntry?.comboId || ''
        });

        await removeFromCart(relatedItem.id, 'fastfood', {
          variantId: cartEntry?.variantId,
          comboId: cartEntry?.comboId,
          batchId: cartEntry?.batchId || null
        });

        pushDebugEvent('related-remove-success', {
          relatedItemId: relatedItem.id,
          relatedItemName: relatedItem.name
        });
        return;
      }

      pushDebugEvent('related-add-start', {
        relatedItemId: relatedItem.id,
        relatedItemName: relatedItem.name
      });

      await addToCart(relatedItem.id, 1, {
        type: 'fastfood',
        product: relatedItem
      });

      pushDebugEvent('related-add-success', {
        relatedItemId: relatedItem.id,
        relatedItemName: relatedItem.name
      });
    } catch (error) {
      pushDebugEvent('related-action-error', {
        relatedItemId: relatedItem.id,
        relatedItemName: relatedItem.name,
        message: error?.response?.data?.message || error?.message || 'Unknown error'
      });
      throw error;
    } finally {
      setRelatedButtonBusyMap((prev) => {
        const next = { ...prev };
        delete next[relatedItem.id];
        return next;
      });
    }
  };

  const addSizeVariantToCart = async (variant) => {
    const variantId = getSizeVariantId(variant);

    if (!variantId) {
      toast({ title: 'Error', description: 'Invalid size variant.', variant: 'destructive' });
      return;
    }

    if (!isOpen) {
      toast({ title: 'Unavailable right now', description: 'This kitchen is currently closed.', variant: 'destructive' });
      return;
    }

    try {
      await addToCart(item.id, 1, {
        type: 'fastfood',
        product: item,
        batchId: null,
        variantId,
        selectedVariant: {
          id: variantId,
          name: variant.name || variant.size || variantId,
          sku: variant.sku,
          basePrice: Number(variant.basePrice || variant.displayPrice || pricing.finalPrice || 0),
          discountPrice: Number(variant.discountPrice || variant.displayPrice || variant.basePrice || pricing.finalPrice || 0),
          stock: Number(variant.stock || 0)
        }
      });
      toast({
        title: 'Added to cart',
        description: `1 x ${variant?.name || variant?.size || item.name} added.`
      });
    } catch (error) {
      console.error('Add to cart error:', error);
      toast({
        title: 'Error',
        description: 'Failed to add item to cart. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const addComboOptionToCart = async (combo) => {
    const comboId = getComboOptionId(combo);

    if (!comboId) {
      toast({ title: 'Error', description: 'Invalid combo option.', variant: 'destructive' });
      return;
    }

    if (!isOpen) {
      toast({ title: 'Unavailable right now', description: 'This kitchen is currently closed.', variant: 'destructive' });
      return;
    }

    try {
      await addToCart(item.id, 1, {
        type: 'fastfood',
        product: item,
        batchId: null,
        comboId,
        selectedCombo: {
          id: comboId,
          name: combo.name || comboId,
          sku: combo.sku,
          basePrice: Number(combo.basePrice || combo.displayPrice || pricing.finalPrice || 0),
          discountPrice: Number(combo.discountPrice || combo.displayPrice || combo.basePrice || pricing.finalPrice || 0)
        }
      });
      toast({
        title: 'Added to cart',
        description: `1 x ${combo?.name || item.name} added.`
      });
    } catch (error) {
      console.error('Add to cart error:', error);
      toast({
        title: 'Error',
        description: 'Failed to add item to cart. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const checkCartConflicts = () => {
    const cartItems = Array.isArray(cart?.items) ? cart.items : [];
    if (!cartItems.length) return { ok: true };

    const vendorId = String(item?.vendor || item?.vendorId || item?.sellerId || '');
    const currentVendorName = item?.vendorDetail?.name || item?.seller?.name || 'this vendor';

    const fastFoodItems = cartItems.filter((cartItem) => cartItem.itemType === 'fastfood' || cartItem.fastFoodId);
    if (!fastFoodItems.length) return { ok: true };

    const firstCartVendor = fastFoodItems.find(Boolean);
    const existingVendorId = String(
      firstCartVendor?.fastFood?.vendor ||
      firstCartVendor?.fastFood?.vendorId ||
      firstCartVendor?.fastFood?.sellerId ||
      firstCartVendor?.product?.vendor ||
      firstCartVendor?.product?.vendorId ||
      firstCartVendor?.product?.sellerId ||
      ''
    );

    if (existingVendorId && vendorId && existingVendorId !== vendorId) {
      return {
        code: 'different-fastfood-seller',
        ok: false,
        reason: `Your cart already has items from another vendor. Fast food checkout must stay with one vendor (${currentVendorName}).`
      };
    }

    return { ok: true };
  };

  const submitAddToCart = async (variant = null, combo = null, goToCart = false, source = 'unknown') => {
    if (!item) return;

    const minOrder = minOrderQty;
    const maxOrder = maxOrderQty;
    const orderQuantity = minOrder;

    if (maxOrder > 0 && orderQuantity > maxOrder) {
      pushDebugEvent('submit-blocked-max-order', {
        source,
        orderQuantity,
        maxOrder
      });
      toast({
        title: 'Maximum quantity exceeded',
        description: `Minimum order (${orderQuantity}) exceeds maximum allowed (${maxOrder}).`,
        variant: 'destructive'
      });
      return;
    }

    if (!isOpen) {
      pushDebugEvent('submit-blocked-closed', {
        source,
        itemId: item.id
      });
      toast({
        title: 'Kitchen Closed',
        description: 'This kitchen is currently closed and not accepting orders.',
        variant: 'destructive'
      });
      return;
    }

    if (batchSystemEnabled && !selectedBatchId) {
      pushDebugEvent('submit-blocked-no-batch', {
        source,
        itemId: item.id
      });
      toast({
        title: 'Batch Selection Required',
        description: 'Please select a delivery batch before adding to cart.',
        variant: 'destructive'
      });
      return;
    }

    const payload = {
      type: 'fastfood',
      batchId: selectedBatchId
    };

    // Clean the product object to avoid sending all variants/combos
    const productClone = { ...item };
    delete productClone.sizeVariants;
    delete productClone.comboOptions;
    payload.product = productClone;

    if (variant) {
      payload.selectedVariant = variant;
      payload.variantId = getSizeVariantId(variant);
    }

    if (combo) {
      payload.selectedCombo = combo;
      payload.comboId = getComboOptionId(combo);
    }

    try {
      pushDebugEvent('submit-add-start', {
        source,
        itemId: item.id,
        itemName: item.name,
        quantity: orderQuantity,
        variantId: payload.variantId || '',
        comboId: payload.comboId || ''
      });

      await addToCart(item.id, orderQuantity, payload);

      pushDebugEvent('submit-add-success', {
        source,
        itemId: item.id,
        quantity: orderQuantity,
        variantId: payload.variantId || '',
        comboId: payload.comboId || ''
      });

      toast({
        title: 'Added to cart',
        description: `${orderQuantity} x ${variant?.name || combo?.name || item.name} added.`
      });

      if (goToCart) navigateToFastFoodCart();
    } catch (error) {
      console.error('[FastFoodDetails] submitAddToCart error:', error);
      toast({
        title: 'Error',
        description: 'Failed to add item to cart. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setPrimaryButtonBusy(false);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky bar only if the main CTA is NOT visible on mobile
        setShowStickyBar(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    if (mainCtaRef.current) {
      observer.observe(mainCtaRef.current);
    }

    return () => {
      if (mainCtaRef.current) observer.unobserve(mainCtaRef.current);
    };
  }, []);

  // Handle auto-add from navigation state
  useEffect(() => {
    if (location.state?.autoAdd && item && !loading && !autoAddProcessed.current) {
      const triggerAutoAdd = async () => {
        if (!isOpen) return;

        // Skip if already in cart to avoid duplicates or flashes
        if (isPrimarySelectionInCart) {
          autoAddProcessed.current = true;
          return;
        }

        try {
          autoAddProcessed.current = true;
          setPrimaryButtonBusy(true);
          
          await submitAddToCart(
            primaryButtonSelection.variant,
            primaryButtonSelection.combo,
            false,
            'auto-add-redirect'
          );
        } catch (err) {
          console.error('[FastFoodDetails] Auto-add failed:', err);
        } finally {
          setPrimaryButtonBusy(false);
        }
      };

      triggerAutoAdd();
    }
  }, [location.state, item, loading, isOpen, isPrimarySelectionInCart, primaryButtonSelection, submitAddToCart]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-orange-50 pt-4">
      <div className="md:container md:mx-auto px-0 md:px-4 py-2 lg:py-8">
        <button
          onClick={handleBack}
          className="flex items-center text-gray-700 hover:text-orange-700 mb-2 md:mb-6 transition-colors ml-4 md:ml-0"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          {(() => {
            const fromPath = location.state?.from;
            const isMarketing = localStorage.getItem('marketing_mode') === 'true';
            if (fromPath) {
              const segments = fromPath.split('/').filter(Boolean);
              if (segments.length > 1) return 'Back to Item';
              if (segments.length === 0) return 'Back to Home';
            }
            return isMarketing ? 'Back to Marketing' : 'Back to Menu';
          })()}
        </button>

        <div className="bg-white md:rounded-3xl shadow-lg overflow-hidden border-0 md:border border-orange-100">
          {buyDebugEnabled && (
            <div className="mx-3 mt-3 md:mx-4 lg:mx-8 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="font-black uppercase tracking-wide">Buy Button Debug</p>
                  <p className="text-[11px] text-sky-700">Query flag enabled with debugBuy=1</p>
                </div>
                <button
                  type="button"
                  onClick={() => pushDebugEvent('manual-snapshot', buildDebugSnapshot())}
                  className="px-2 py-1 rounded border border-sky-300 bg-white hover:bg-sky-100 font-bold"
                >
                  Snapshot
                </button>
                <button
                  type="button"
                  onClick={() => setDebugEvents([])}
                  className="px-2 py-1 rounded border border-sky-300 bg-white hover:bg-sky-100 font-bold"
                >
                  Clear Log
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-white border border-sky-200 p-2">
                  <p className="font-bold">Primary Button</p>
                  <p>busy: {String(primaryButtonBusy)}</p>
                  <p>label: {primaryButtonLabel}</p>
                  <p>inCart: {String(isPrimarySelectionInCart)}</p>
                </div>
                <div className="rounded-lg bg-white border border-sky-200 p-2">
                  <p className="font-bold">Primary Selection</p>
                  <p>variantId: {primaryButtonSelection.variantId || 'none'}</p>
                  <p>comboId: {primaryButtonSelection.comboId || 'none'}</p>
                  <p>cartCount: {cart?.summary?.itemCount || 0}</p>
                </div>
                <div className="rounded-lg bg-white border border-sky-200 p-2">
                  <p className="font-bold">Related Busy</p>
                  <p>{Object.keys(relatedButtonBusyMap).join(', ') || 'none'}</p>
                </div>
              </div>

              <div className="rounded-lg bg-slate-950 text-slate-100 p-2 max-h-56 overflow-auto font-mono text-[11px]">
                {debugEvents.length === 0 ? (
                  <p className="text-slate-400">No debug events yet.</p>
                ) : (
                  debugEvents.map((entry) => (
                    <div key={entry.id} className="pb-2 mb-2 border-b border-slate-800 last:border-b-0 last:mb-0 last:pb-0">
                      <p>
                        <span className="text-sky-300">[{entry.time}]</span> <span className="text-amber-300">{entry.label}</span>
                      </p>
                      <pre className="whitespace-pre-wrap break-words text-slate-300">{JSON.stringify(entry.data, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 px-0 py-3 md:p-4 lg:p-8 border-b border-orange-100">
            <div className="space-y-4 px-0 md:px-0">
              <div className="aspect-square md:rounded-2xl overflow-hidden bg-gray-100 border-0 md:border border-orange-100 relative group">
                <img
                  src={resolveImageUrl(activeImage || item.mainImage)}
                  alt={item.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className={`absolute top-4 left-4 flex flex-col gap-1 z-10`}>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${isOpen ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {isOpen ? 'Kitchen Open' : 'Kitchen Closed'}
                  </div>
                  {!isOpen && nextOpening && (
                    <div className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/90 backdrop-blur-sm text-gray-900 shadow-sm border border-red-100 italic">
                      Opens {nextOpening.day} at {nextOpening.time}
                    </div>
                  )}
                </div>
              </div>

              {galleryImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {galleryImages.slice(0, 6).map((img, idx) => (
                    <button
                      key={`${img}-${idx}`}
                      onClick={() => setActiveImage(img)}
                      className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-all ${activeImage === img ? 'border-orange-500 shadow' : 'border-transparent hover:border-orange-200'}`}
                    >
                      <img src={resolveImageUrl(img)} alt={`gallery-${idx}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="bg-orange-50 rounded-2xl p-3 border border-orange-100 space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex items-end gap-2 flex-wrap">
                    <span className="text-2xl sm:text-3xl font-black text-orange-700">
                      {pricing.finalPrice > 0 ? `KES ${pricing.finalPrice.toLocaleString()}` : 'Contact for price'}
                    </span>
                    {pricing.hasDiscount && (
                      <>
                        <span className="text-sm text-gray-400 line-through">KES {pricing.base.toLocaleString()}</span>
                        <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded font-bold">{pricing.pct}% OFF</span>
                      </>
                    )}
                  </div>

                  <div ref={mainCtaRef}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (primaryButtonBusy) return;

                        setPrimaryButtonBusy(true);
                        try {
                          if (isPrimarySelectionInCart) {
                            await removeFromCart(item.id, 'fastfood', {
                              variantId: primaryButtonSelection.variantId || undefined,
                              comboId: primaryButtonSelection.comboId || undefined,
                              batchId: selectedBatchId
                            });
                            return;
                          }

                          pushDebugEvent('primary-click', {
                            itemId: item.id,
                            itemName: item.name,
                            isPrimarySelectionInCart,
                            variantId: primaryButtonSelection.variantId || '',
                            comboId: primaryButtonSelection.comboId || ''
                          });

                          await submitAddToCart(
                            primaryButtonSelection.variant,
                            primaryButtonSelection.combo,
                            false,
                            'primary-button'
                          );
                        } finally {
                          setPrimaryButtonBusy(false);
                        }
                      }}
                      disabled={!isOpen || primaryButtonBusy}
                      className={`h-11 md:h-10 min-w-[130px] px-6 md:px-5 rounded-xl text-sm font-black md:font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center shrink-0 border-2 ${isPrimarySelectionInCart ? 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200' : 'bg-orange-600 hover:bg-orange-700 text-white border-transparent shadow-sm'}`}
                    >
                      <ShoppingBag className="h-4 w-4 mr-1.5" />
                      {primaryButtonLabel}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Delivery in about {toNumber(item.deliveryTimeEstimateMinutes, 30)} mins from seller kitchen.
                </p>
              </div>
            </div>

            <div className="space-y-4 px-0 md:px-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="w-full min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-black text-gray-900 flex items-center gap-3">
                    {item.name}
                    {toNumber(item.orderCount) > 5 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-700 border border-orange-200 uppercase tracking-tighter">
                         🔥 {item.orderCount}+ Orders
                      </span>
                    )}
                  </h1>
                  {item.shortDescription && <p className="w-full text-orange-700 font-semibold mt-1">{item.shortDescription}</p>}
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleWishlistToggle}
                    className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border transition-colors ${isWishlisted ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-white text-gray-500 border-gray-200 hover:text-red-600 hover:border-red-200'}`}
                    title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                    aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setInquiryModalOpen(true)}
                    className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold whitespace-nowrap"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Contact Us
                  </button>
                </div>
              </div>

              <p className="text-gray-700 leading-relaxed">{item.description || 'No description available.'}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-gray-100 p-2.5 bg-gray-50/50">
                  <p className="text-[10px] uppercase font-bold text-gray-500">Prep Time</p>
                  <p className="font-bold text-sm text-gray-900">{toNumber(item.preparationTimeMinutes, 20)} mins</p>
                </div>
                {item.estimatedServings && (
                  <div className="rounded-xl border border-gray-100 p-2.5 bg-gray-50/50">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Servings</p>
                    <p className="font-bold text-sm text-gray-900 flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-blue-500" /> {item.estimatedServings}</p>
                  </div>
                )}
                {item.spiceLevel && item.spiceLevel !== 'none' && (
                  <div className="rounded-xl border border-gray-100 p-2.5 bg-gray-50/50">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Spice Level</p>
                    <p className={`font-bold text-sm flex items-center gap-1.5 capitalize ${
                        item.spiceLevel === 'hot' || item.spiceLevel === 'extra hot' ? 'text-red-600' :
                        item.spiceLevel === 'medium' ? 'text-orange-600' : 'text-emerald-600'
                      }`}>
                      <Flame className="h-3.5 w-3.5" /> {item.spiceLevel}
                    </p>
                  </div>
                )}
                <div className="rounded-xl border border-gray-100 p-2.5 bg-gray-50/50">
                  <p className="text-[10px] uppercase font-bold text-gray-500">Vendor</p>
                  <p className="font-bold text-sm text-gray-900 truncate">{item.kitchenVendor || item.vendorDetail?.name || item.seller?.name || 'Comrades Kitchen'}</p>
                </div>
              </div>

              {/* Batch Selection Section */}
              {batchSystemEnabled && (
                <div className="mt-4 p-4 rounded-2xl bg-orange-50/30 border border-orange-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                      <Shield className="h-4 w-4 text-orange-600" /> Select Delivery Batch
                    </h3>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-100/50 px-2 py-0.5 rounded-full uppercase">Required</span>
                  </div>

                  {loadingBatches ? (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                       {[1, 2].map(i => <div key={i} className="flex-shrink-0 w-32 h-20 bg-gray-100 animate-pulse rounded-xl" />)}
                    </div>
                  ) : activeBatches.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                      {activeBatches.map((batch) => (
                        <button
                          key={batch.id}
                          type="button"
                          onClick={() => setSelectedBatchId(batch.id)}
                          className={`flex-shrink-0 w-44 h-[72px] p-3 rounded-xl border-2 transition-colors snap-start text-left select-none ${
                            selectedBatchId === batch.id
                              ? 'bg-white border-orange-600 ring-4 ring-orange-50'
                              : 'bg-white border-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${selectedBatchId === batch.id ? 'border-orange-600' : 'border-gray-300'}`}>
                              {selectedBatchId === batch.id && <div className="w-1.5 h-1.5 bg-orange-600 rounded-full" />}
                            </div>
                            <span className="text-xs font-black text-gray-900 truncate">{batch.name}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <Clock className="h-3 w-3" />
                              <span className="text-[10px] font-bold">Orders Period: {batch.startTime} - {batch.endTime}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-orange-600">
                              <Truck className="h-3 w-3" />
                              <span className="text-[10px] font-black uppercase tracking-tighter">Delivery ~ {batch.expectedDelivery}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-white/50 rounded-xl border border-dashed border-orange-200 text-center">
                       <p className="text-xs font-bold text-orange-700 italic">No delivery batches currently available.</p>
                       <p className="text-[10px] text-gray-500 mt-1">Please check back later during operating hours.</p>
                    </div>
                  )}
                </div>
              )}





            </div>
          </div>

          <div className="px-0 py-3 md:px-4 lg:p-8 space-y-6">
            <section className="grid grid-cols-2 md:grid-cols-3 gap-2 px-3 md:px-0">
              <div className="rounded-xl border border-gray-100 p-2.5 bg-gray-50">
                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Min Order</p>
                <p className="font-bold text-sm text-gray-900">{Math.max(1, toNumber(item.minOrderQty, 1))}</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-2.5 bg-gray-50">
                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Max Order</p>
                <p className="font-bold text-sm text-gray-900">{toNumber(item.maxOrderQty, 0) > 0 ? item.maxOrderQty : 'Unlimited'}</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-2.5 bg-gray-50 col-span-2 md:col-span-1">
                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Pickup</p>
                <p className="font-bold text-sm text-gray-900">{item.pickupAvailable ? 'Available' : 'Not available'}</p>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 px-3 md:px-0">
              {variantOptions.length > 0 && (
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 border-b border-gray-100">
                    <h3 className="text-sm sm:text-base font-bold flex items-center gap-2"><List className="h-4 w-4 text-orange-600" /> Size Variants</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {variantOptions.map((variant, index) => {
                      const variantPrice = getOptionPrice(variant, pricing.finalPrice);
                      const variantId = getSizeVariantId(variant);
                      const variantInCart = isFastFoodOptionInCart(variantId, null);
                      return (
                        <div key={`${variant.name || variant.size || 'variant'}-${index}`} className="p-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{variant.name || variant.size || `Variant ${index + 1}`}</p>
                            <p className="text-sm text-orange-700">KES {variantPrice.toLocaleString()}</p>
                          </div>
                          <button
                            disabled={(!isOpen || variant.isAvailable === false) && !variantInCart}
                              onClick={async () => {
                                if (variantInCart) {
                                  await removeFromCart(item.id, 'fastfood', { 
                                    variantId,
                                    batchId: null 
                                  });
                                  return;
                                }
                                await addSizeVariantToCart(variant);
                              }}
                            className={`font-bold rounded-lg px-3 h-9 text-xs sm:text-sm shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantInCart ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-200'}`}
                          >
                            {variantInCart ? 'REMOVE' : 'BUY'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {comboOptions.length > 0 && (
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 border-b border-gray-100">
                    <h3 className="text-sm sm:text-base font-bold flex items-center gap-2"><Settings className="h-4 w-4 text-orange-600" /> Combo Options</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {comboOptions.map((combo, index) => {
                      const comboPrice = getOptionPrice(combo, pricing.finalPrice);
                      const comboId = getComboOptionId(combo);
                      const comboInCart = isFastFoodOptionInCart(null, comboId);
                      return (
                        <div key={`${combo.name || 'combo'}-${index}`} className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">{combo.name || `Combo ${index + 1}`}</p>
                              <p className="text-sm text-orange-700">KES {comboPrice.toLocaleString()}</p>
                            </div>
                            <button
                              disabled={(!isOpen || combo.isAvailable === false) && !comboInCart}
                              onClick={async () => {
                                if (comboInCart) {
                                  await removeFromCart(item.id, 'fastfood', { 
                                    comboId,
                                    batchId: null 
                                  });
                                  return;
                                }
                                await addComboOptionToCart(combo);
                              }}
                              className={`font-bold rounded-lg px-3 h-9 text-xs sm:text-sm shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${comboInCart ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-200'}`}
                            >
                              {comboInCart ? 'REMOVE' : 'BUY'}
                            </button>
                          </div>
                          <p className="text-xs text-gray-500">Includes: {getComboItemsLabel(combo)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 px-3 md:px-0">
              <div className="rounded-2xl border border-gray-100 p-4 sm:p-5">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2 mb-3 sm:mb-4"><Utensils className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" /> Ingredients</h3>
                {ingredients.length > 0 ? (
                  <ul className="space-y-2 text-sm text-gray-700">
                    {ingredients.map((ingredient, index) => (
                      <li key={`${ingredient.name}-${index}`}>
                        <span className="font-semibold">{ingredient.name}</span>
                        {ingredient.quantity ? ` (${ingredient.quantity})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">Ingredients not listed.</p>
                )}

                {dietaryTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {dietaryTags.map((tag, idx) => (
                      <span key={`${tag}-${idx}`} className="px-2 py-1 text-[11px] rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {((nutritionalInfo && Object.values(nutritionalInfo).some(v => v)) || (customizations && customizations.length > 0)) && (
                <div className="space-y-4">
                  {nutritionalInfo && Object.values(nutritionalInfo).some(v => v) && (
                    <div className="rounded-2xl border border-gray-100 p-4 sm:p-5">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                        <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" /> Nutritional Facts
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['calories', 'protein', 'carbs', 'fat'].map(fact => nutritionalInfo[fact] && (
                          <div key={fact} className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-center">
                            <p className="text-[9px] uppercase font-black text-gray-500 tracking-tighter">{fact}</p>
                            <p className="text-sm font-black text-gray-900">{nutritionalInfo[fact]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {customizations && customizations.length > 0 && (
                    <div className="rounded-2xl border border-gray-100 p-4 sm:p-5">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
                        <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" /> Customization Notes
                      </h3>
                      <ul className="space-y-2">
                        {customizations.map((note, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 italic">
                            <div className="mt-1.5 h-1 w-1 rounded-full bg-orange-400 shrink-0" />
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-3 sm:space-y-4">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2"><Shield className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" /> Safety and Delivery</h3>

                <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                  <p className="font-semibold text-red-700 text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Allergen Information</p>
                  {allergens.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {allergens.map((allergen, idx) => (
                        <span key={`${allergen}-${idx}`} className="px-2 py-1 rounded text-[11px] bg-white border border-red-200 text-red-700">
                          {allergen}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-red-700 mt-1">No allergens specified by vendor.</p>
                  )}
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  <p className="font-semibold flex items-center gap-2"><Truck className="h-4 w-4" /> Direct Seller Delivery</p>
                  <p className="mt-1">This order is prepared and delivered directly by the seller kitchen.</p>
                </div>

                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="font-semibold text-sm text-gray-900 flex items-center gap-2"><MapPin className="h-4 w-4" /> Delivery Coverage Zones</p>
                  {deliveryZones.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {deliveryZones.map((zone, idx) => (
                        <span key={`${zone}-${idx}`} className="px-2 py-1 rounded bg-orange-50 border border-orange-100 text-orange-700 text-[11px]">
                          {zone}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">Coverage zones were not published yet.</p>
                  )}
                </div>
              </div>
            </section>



            {reviews.length > 0 && (
              <section className="max-w-4xl mx-auto px-3 md:px-0">
                <h2 className="text-2xl md:text-3xl font-black mb-6 sm:mb-8 text-center">Review and Rating</h2>
                <div className="space-y-4 sm:space-y-5">
                  {visibleReviews.map((review, index) => (
                    <div key={`${review.id || index}`} className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-gray-900">{review.userName || review.customerName || 'Verified Buyer'}</p>
                          <p className="text-xs text-gray-500">{review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Recent review'}</p>
                        </div>
                        <div className="flex gap-1 text-amber-500">
                          {[...Array(5)].map((_, starIndex) => (
                            <Star key={`${index}-${starIndex}`} className={`h-4 w-4 ${starIndex < toNumber(review.rating, 0) ? 'fill-current' : 'opacity-20'}`} />
                          ))}
                        </div>
                      </div>
                      <p className="mt-3 text-gray-700">{review.comment || review.text || 'No comment provided.'}</p>
                    </div>
                  ))}
                </div>

                {hasMoreReviews && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={() => setVisibleReviewsCount((count) => count + 3)}
                      className="h-10 px-6 rounded-lg bg-orange-600 text-white hover:bg-orange-700 font-semibold"
                    >
                      Load More Reviews
                    </button>
                  </div>
                )}
              </section>
            )}

            {(loadingRelatedItems || relatedItems.length > 0) && (
              <section className="px-3 md:px-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black text-gray-900">More From This Seller</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Explore other dishes from {item.kitchenVendor || item.vendorDetail?.name || item.seller?.name || 'this seller'}.
                    </p>
                  </div>
                </div>

                {loadingRelatedItems ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={`related-fastfood-skeleton-${index}`} className="h-64 rounded-lg bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white md:rounded-3xl border-0 md:border border-gray-100 p-0 md:p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                      {relatedItems.map((relatedItem) => (
                        <FastFoodCard
                          key={relatedItem.id}
                          item={relatedItem}
                          navigate={navigate}
                          renderActions={({ handleView: cardHandleView }) => {
                            const inCart = isRelatedItemInCart(relatedItem.id);
                            const relatedBusy = !!relatedButtonBusyMap[relatedItem.id];
                            return (
                              <div className="flex items-center justify-between pt-1 border-t border-gray-100 gap-1">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleRelatedItemInCart(relatedItem);
                                  }}
                                  disabled={relatedBusy}
                                  className={`flex-1 px-1.5 py-2 rounded text-xs font-bold transition-colors whitespace-nowrap flex items-center justify-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed ${inCart ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}
                                >
                                  {relatedBusy ? (inCart ? 'REMOVING' : 'ADDING') : (inCart ? 'REMOVE' : 'BUY NOW')}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cardHandleView(e);
                                  }}
                                  className="flex-1 px-1.5 py-2 text-xs font-bold text-white bg-blue-800 hover:bg-blue-900 rounded transition-colors"
                                >
                                  View
                                </button>
                              </div>
                            );
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-gray-100 p-4 sm:p-5 mx-3 md:mx-0">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2"><Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" /> Weekly Availability</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 sm:gap-2">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                  const dayInfo = schedule.find((entry) => entry.day === day) || schedule.find((entry) => entry.day === 'All Days');
                  const available = dayInfo ? dayInfo.available !== false : day !== 'Sunday';
                  const from = dayInfo?.from || item.availableFrom || '08:00';
                  const to = dayInfo?.to || item.availableTo || '21:00';
                  return (
                    <div key={day} className={`rounded-lg border p-2 text-center ${available ? 'border-emerald-100 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                      <p className="text-[11px] font-semibold text-gray-600">{day.slice(0, 3)}</p>
                      <p className="text-xs font-bold mt-1">{available ? `${from}-${to}` : 'Closed'}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>

      <Footer />

      {/* Mobile Sticky Action Bar */}
      <div className={`fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-orange-100 p-4 pb-6 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] z-[60] md:hidden transition-all duration-300 transform ${showStickyBar ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-black text-gray-500 leading-none mb-1">Total Price</span>
            <span className="text-xl font-black text-orange-700">
              KES {(pricing.finalPrice || 0).toLocaleString()}
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (primaryButtonBusy) return;
              setPrimaryButtonBusy(true);
              try {
                if (isPrimarySelectionInCart) {
                  await removeFromCart(item.id, 'fastfood', {
                    variantId: primaryButtonSelection.variantId || undefined,
                    comboId: primaryButtonSelection.comboId || undefined,
                    batchId: selectedBatchId
                  });
                  return;
                }
                await submitAddToCart(
                  primaryButtonSelection.variant,
                  primaryButtonSelection.combo,
                  false,
                  'sticky-mobile-bar'
                );
              } finally {
                setPrimaryButtonBusy(false);
              }
            }}
            disabled={!isOpen || primaryButtonBusy || (batchSystemEnabled && !selectedBatchId && !isPrimarySelectionInCart)}
            className={`flex-1 h-12 rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50 border-2 ${isPrimarySelectionInCart ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-600 text-white border-transparent'}`}
          >
            <div className="flex items-center gap-2 px-2">
              <ShoppingBag className="h-5 w-5 shrink-0" />
              <span className="whitespace-nowrap inline-block text-center">{primaryButtonLabel}</span>
            </div>
          </button>
        </div>
      </div>

      <AdminInquiryModal
        item={item}
        itemType="fastfood"
        isOpen={inquiryModalOpen}
        onClose={() => setInquiryModalOpen(false)}
        onSuccess={() => {
          toast({
            title: 'Inquiry sent',
            description: 'Your message has been sent to admin support.'
          });
        }}
      />
    </div>
  );
};

export default FastFoodDetails;
