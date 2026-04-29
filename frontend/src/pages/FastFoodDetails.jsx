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
  CheckCircle2,
  Zap
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { usePersistentFetch } from '../hooks/usePersistentFetch';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useToast } from '../components/ui/use-toast';
import { useWishlist } from '../contexts/WishlistContext';
import { fastFoodService } from '../services/fastFoodService';
import fastFoodPickupPointService from '../services/fastFoodPickupPointService';
import { resolveImageUrl, getResizedImageUrl } from '../utils/imageUtils';
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
  const rawItems = comboOption.items ?? comboOption.comboItems ?? comboOption.includes ?? comboOption.contents ?? comboOption.description;
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

  // New: Batch System states
  const [batchSystemEnabled, setBatchSystemEnabled] = useState(false);
  const [activeBatches, setActiveBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [visibleReviewsCount, setVisibleReviewsCount] = useState(3);
  const [activePickupPoints, setActivePickupPoints] = useState([]);
  const [loadingPickupPoints, setLoadingPickupPoints] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const [loadingRelatedItems, setLoadingRelatedItems] = useState(false);
  const [primaryButtonBusy, setPrimaryButtonBusy] = useState(false);
  const [relatedButtonBusyMap, setRelatedButtonBusyMap] = useState({});
  const relatedScrollRef = useRef(null);

  const scrollRelated = (direction) => {
    if (relatedScrollRef.current) {
      const { scrollLeft, clientWidth } = relatedScrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;
      relatedScrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };
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

  const navigateToCheckout = () => {
    navigate(`/checkout?scope=fastfood`, {
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

  const isBaseItemInCart = isFastFoodOptionInCart(null, null, selectedBatchId);


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
    } else {
      payload.variantId = null;
    }

    if (combo) {
      payload.selectedCombo = combo;
      payload.comboId = getComboOptionId(combo);
    } else {
      payload.comboId = null;
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

      if (goToCart) navigateToCheckout();
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

  const handleRemoveFromCart = async (variantId = null, comboId = null) => {
    if (!item) return;

    setPrimaryButtonBusy(true);
    const vId = normalizeOptionId(variantId);
    const cId = normalizeOptionId(comboId);
    const bId = selectedBatchId ? String(selectedBatchId) : null;

    try {
      pushDebugEvent('submit-remove-start', {
        itemId: item.id,
        variantId: vId || '',
        comboId: cId || '',
        batchId: bId || ''
      });

      await removeFromCart(item.id, 'fastfood', {
        variantId: vId || null,
        comboId: cId || null,
        batchId: bId
      });

      toast({
        title: 'Removed from cart',
        description: `Item removed from cart.`
      });
    } catch (error) {
      console.error('[FastFoodDetails] handleRemoveFromCart error:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove item. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setPrimaryButtonBusy(false);
    }
  };

  // Handle auto-add from navigation state
  useEffect(() => {
    if (location.state?.autoAdd && item && !loading && !autoAddProcessed.current) {
      const triggerAutoAdd = async () => {
        if (!isOpen) return;

        // Skip if already in cart to avoid duplicates or flashes
        if (isBaseItemInCart) {
          autoAddProcessed.current = true;
          return;
        }

        try {
          autoAddProcessed.current = true;
          setPrimaryButtonBusy(true);
          
          await submitAddToCart(
            null,
            null,
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
      <div className="w-full px-0 md:px-6 lg:px-12 py-2 lg:py-8">
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

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-12 px-0 py-3 md:p-4 lg:p-8 border-b border-orange-100">
            <div className="lg:col-span-5 space-y-4 px-0 md:px-0">
              <div className="aspect-square md:rounded-2xl overflow-hidden bg-gray-100 border-0 md:border border-orange-100 relative group">
                <img
                  src={getResizedImageUrl(resolveImageUrl(activeImage || item.mainImage), { width: 800, quality: 80 })}
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
                      <img src={getResizedImageUrl(resolveImageUrl(img), { width: 800, quality: 80 })} alt={`gallery-${idx}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Simplified Price and Action Box - Now always in left column below gallery */}
              <div className="bg-orange-50 rounded-2xl p-3 border border-orange-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <span className="text-2xl sm:text-3xl font-black text-orange-700 leading-none">
                        {pricing.finalPrice > 0 ? `KES ${pricing.finalPrice.toLocaleString()}` : 'Contact for price'}
                      </span>
                      {pricing.hasDiscount && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-400 line-through">KES {pricing.base.toLocaleString()}</span>
                          <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">{pricing.pct}% OFF</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                      <button
                        onClick={() => isBaseItemInCart ? handleRemoveFromCart(null, null) : submitAddToCart(null, null, false, 'base-add-global')}
                        disabled={!isOpen || primaryButtonBusy}
                        className={`flex-1 sm:flex-none h-9 px-6 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                          isBaseItemInCart 
                            ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                            : 'bg-blue-50 text-blue-700 border-2 border-blue-100 hover:bg-blue-100'
                        }`}
                      >
                        <ShoppingBag className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{isBaseItemInCart ? 'Remove' : 'Add to Cart'}</span>
                      </button>
                    </div>
                  </div>
                  {!isOpen && (
                     <p className="text-[10px] text-red-600 font-bold mt-2 text-center sm:text-right uppercase tracking-tighter">Kitchen is currently closed</p>
                  )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Delivery in about {toNumber(item.deliveryTimeEstimateMinutes, 30)} mins from seller kitchen.
              </p>
            </div>

            <div className="lg:col-span-7 space-y-6 px-0 md:px-0">
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

              {/* Variants and Combos Moved Independent Action Section */}
              <div className="space-y-4">
                {variantOptions.length > 0 && (
                  <div className="rounded-2xl border border-orange-100 overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-3 bg-orange-50/50 border-b border-orange-100">
                      <h3 className="text-sm font-black flex items-center gap-2 uppercase tracking-tight text-gray-900">
                        <List className="h-4 w-4 text-orange-600" /> Choose Size
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {variantOptions.map((variant, index) => {
                        const variantPrice = getOptionPrice(variant, pricing.finalPrice);
                        const vId = getSizeVariantId(variant);
                        const variantInCart = isFastFoodOptionInCart(vId, null, selectedBatchId);
                        
                        return (
                          <div key={`${vId}-${index}`} className="p-4 flex items-center justify-between gap-3 hover:bg-orange-50/30 transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-gray-900 text-sm truncate uppercase tracking-tighter">
                                {variant.name || variant.size || `Size ${index + 1}`}
                              </p>
                              <p className="text-xs font-black text-orange-600">KES {variantPrice.toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              {variantInCart && (
                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">In Cart</span>
                              )}
                              <button
                                onClick={() => variantInCart ? handleRemoveFromCart(vId, null) : submitAddToCart(variant, null, false, 'variant-add')}
                                disabled={!isOpen || primaryButtonBusy || variant.isAvailable === false}
                                className={`h-9 px-4 rounded-xl border-2 text-[10px] font-black uppercase tracking-tight transition-all disabled:opacity-50 ${
                                  variantInCart 
                                    ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                                    : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'
                                }`}
                              >
                                {variantInCart ? 'Remove' : 'Add'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {comboOptions.length > 0 && (
                  <div className="rounded-2xl border border-orange-100 overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-3 bg-orange-50/50 border-b border-orange-100">
                      <h3 className="text-sm font-black flex items-center gap-2 uppercase tracking-tight text-gray-900">
                        <Settings className="h-4 w-4 text-orange-600" /> Choose Combo
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {comboOptions.map((combo, index) => {
                        const comboPrice = getOptionPrice(combo, pricing.finalPrice);
                        const cId = getComboOptionId(combo);
                        const comboInCart = isFastFoodOptionInCart(null, cId, selectedBatchId);
                        
                        return (
                          <div key={`${cId}-${index}`} className="p-4 space-y-2 hover:bg-orange-50/30 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-gray-900 text-sm truncate uppercase tracking-tighter" title={combo.name || combo.label || `Combo ${index + 1}`}>
                                  {combo.name || combo.label || `Combo ${index + 1}`}
                                </p>
                                <p className="text-xs font-black text-orange-600">KES {comboPrice.toLocaleString()}</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => comboInCart ? handleRemoveFromCart(null, cId) : submitAddToCart(null, combo, false, 'combo-add')}
                                  disabled={!isOpen || primaryButtonBusy || combo.isAvailable === false}
                                  className={`flex-1 h-9 px-4 rounded-xl border-2 text-[10px] font-black uppercase tracking-tight transition-all disabled:opacity-50 ${
                                    comboInCart 
                                      ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                                      : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'
                                  }`}
                                >
                                  {comboInCart ? 'Remove' : 'Add'}
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] font-bold text-gray-500 italic">Includes: {getComboItemsLabel(combo)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
          <div className="px-0 py-6 md:px-4 lg:p-8 space-y-12 w-full">
            {/* Structured details section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left detail column - order info and availability */}
              <div className="lg:col-span-4 space-y-8">
                <section>
                  <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <Shield className="h-4 w-4 text-orange-600" /> Order Limits
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-gray-100 p-4 bg-gray-50/50">
                      <p className="text-[10px] uppercase font-black text-gray-500 tracking-wider mb-1">Minimum</p>
                      <p className="font-black text-base text-gray-900">{Math.max(1, toNumber(item.minOrderQty, 1))}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 p-4 bg-gray-50/50">
                      <p className="text-[10px] uppercase font-black text-gray-500 tracking-wider mb-1">Maximum</p>
                      <p className="font-black text-base text-gray-900">{toNumber(item.maxOrderQty, 0) > 0 ? item.maxOrderQty : 'Unlimited'}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-gray-100 p-4 bg-emerald-50/30 flex items-center justify-between">
                    <p className="text-[10px] uppercase font-black text-gray-500 tracking-wider">Pickup Support</p>
                    <p className="font-black text-xs text-emerald-700">{item.pickupAvailable ? 'Available' : 'Not available'}</p>
                  </div>
                </section>

                <section className="rounded-3xl border border-gray-100 p-6 bg-white shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wider"><Clock className="h-4 w-4 text-orange-600" /> Kitchen Hours</h3>
                  <div className="space-y-3">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                      const dayInfo = schedule.find((entry) => entry.day === day) || schedule.find((entry) => entry.day === 'All Days');
                      const available = dayInfo ? dayInfo.available !== false : day !== 'Sunday';
                      const from = dayInfo?.from || item.availableFrom || '08:00';
                      const to = dayInfo?.to || item.availableTo || '21:00';
                      return (
                        <div key={day} className="flex items-center justify-between text-xs">
                          <span className={`font-bold ${available ? 'text-gray-900' : 'text-gray-400'}`}>{day}</span>
                          <span className={`font-black ${available ? 'text-emerald-600' : 'text-red-400'}`}>
                            {available ? `${from} - ${to}` : 'Closed'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Right detail column - ingredients and nutrition */}
              <div className="lg:col-span-8 space-y-8">
                <section className="rounded-3xl border border-orange-100 p-6 md:p-8 bg-white shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 mb-4"><Utensils className="h-5 w-5 text-orange-600" /> Ingredients</h3>
                      {ingredients.length > 0 ? (
                        <div className="flex flex-wrap gap-x-6 gap-y-3">
                          {ingredients.map((ingredient, index) => {
                            const name = typeof ingredient.name === 'object' ? (ingredient.name?.name || JSON.stringify(ingredient.name)) : String(ingredient.name || 'Unnamed Ingredient');
                            const qty = typeof ingredient.quantity === 'object' ? (ingredient.quantity?.value || JSON.stringify(ingredient.quantity)) : String(ingredient.quantity || '');
                            
                            return (
                              <div key={`${name}-${index}`} className="flex items-center gap-2 text-sm text-gray-700">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                <span className="font-bold">{name}</span>
                                {qty && <span className="text-gray-400 text-xs">({qty})</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">Ingredients not listed.</p>
                      )}

                      {dietaryTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-6">
                          {dietaryTags.map((tag, idx) => {
                            const tagLabel = typeof tag === 'object' ? (tag.name || tag.label || JSON.stringify(tag)) : String(tag);
                            return (
                              <span key={`${tagLabel}-${idx}`} className="px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                {tagLabel}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      {nutritionalInfo && Object.values(nutritionalInfo).some(v => v) && (
                        <div>
                          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-4 uppercase tracking-wider">
                            <Activity className="h-4 w-4 text-orange-600" /> Nutritional Facts
                          </h3>
                          <div className="grid grid-cols-2 gap-2">
                            {['calories', 'protein', 'carbs', 'fat'].map(fact => nutritionalInfo[fact] && (
                              <div key={fact} className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                                <span className="text-[10px] uppercase font-black text-gray-500 tracking-tight">{fact}</span>
                                <span className="text-xs font-black text-gray-900">{nutritionalInfo[fact]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {customizations && customizations.length > 0 && (
                        <div>
                          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-3 uppercase tracking-wider">
                            <CheckCircle2 className="h-4 w-4 text-orange-600" /> Notes
                          </h3>
                          <ul className="space-y-2">
                            {customizations.map((note, idx) => {
                              const noteText = typeof note === 'object' 
                                ? (note.name || note.label || note.title || JSON.stringify(note)) 
                                : String(note);
                              const notePrice = (typeof note === 'object' && note.price) ? ` (KES ${note.price})` : '';
                              
                              return (
                                <li key={idx} className="flex items-start gap-2 text-xs text-gray-600 italic">
                                  <div className="mt-1.5 h-1 w-1 rounded-full bg-orange-400 shrink-0" />
                                  {noteText}{notePrice}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>

            {/* Reviews section stays more centered and controlled */}
            <div className="max-w-6xl mx-auto w-full">

            {reviews.length > 0 && (
              <section className="px-3 md:px-0 mt-8">
                <h2 className="text-2xl md:text-3xl font-black mb-8 text-center uppercase tracking-tight">Review and Rating</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleReviews.map((review, index) => (
                    <div key={`${review.id || index}`} className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-gray-900">{review.userName || review.customerName || 'Verified Buyer'}</p>
                          <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest">{review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Recent review'}</p>
                        </div>
                        <div className="flex gap-0.5 text-amber-400">
                          {[...Array(5)].map((_, starIndex) => (
                            <Star key={`${index}-${starIndex}`} className={`h-3.5 w-3.5 ${starIndex < toNumber(review.rating, 0) ? 'fill-current' : 'opacity-20'}`} />
                          ))}
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-gray-600 leading-relaxed italic">"{review.comment || review.text || 'No comment provided.'}"</p>
                    </div>
                  ))}
                </div>

                {hasMoreReviews && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={() => setVisibleReviewsCount((count) => count + 4)}
                      className="h-11 px-8 rounded-2xl bg-orange-600 text-white hover:bg-orange-700 font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-100 transition-all"
                    >
                      Load More Reviews
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

        {/* More From This Seller Section (Outside main card for full width) */}
        {(loadingRelatedItems || relatedItems.length > 0) && (
          <div className="mt-12 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="px-4 mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-gray-900">More From This Seller</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Explore other dishes from {item.kitchenVendor || item.vendorDetail?.name || item.seller?.name || 'this seller'}.
                </p>
              </div>
              <div className="hidden md:flex gap-2">
                <button 
                  onClick={() => scrollRelated('left')}
                  className="w-10 h-10 rounded-full bg-white border border-orange-100 flex items-center justify-center text-orange-600 hover:bg-orange-50 transition-colors shadow-sm"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => scrollRelated('right')}
                  className="w-10 h-10 rounded-full bg-white border border-orange-100 flex items-center justify-center text-orange-600 hover:bg-orange-50 transition-colors shadow-sm"
                >
                  <ArrowLeft className="h-5 w-5 rotate-180" />
                </button>
              </div>
            </div>

            <div className="bg-orange-50/50 md:rounded-3xl p-3 md:p-6 border border-orange-100/50 relative group">
              {loadingRelatedItems ? (
                <div className="flex gap-4 overflow-hidden">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={`related-fastfood-skeleton-${index}`} className="h-64 w-[160px] sm:w-[180px] md:w-[200px] flex-shrink-0 rounded-lg bg-white/50 animate-pulse border border-orange-100" />
                  ))}
                </div>
              ) : (
                <div 
                  ref={relatedScrollRef}
                  className="flex overflow-x-auto gap-4 pb-4 no-scrollbar snap-x snap-mandatory scroll-smooth pt-1 px-1"
                >
                  {relatedItems.map((relatedItem) => (
                    <div key={relatedItem.id} className="w-[160px] sm:w-[180px] md:w-[200px] flex-shrink-0 snap-start">
                      <FastFoodCard
                        item={relatedItem}
                        navigate={navigate}
                        renderActions={({ handleView: cardHandleView }) => {
                          const inCart = isRelatedItemInCart(relatedItem.id);
                          const relatedBusy = !!relatedButtonBusyMap[relatedItem.id];
                          return (
                            <div className="flex flex-col border-t border-gray-100 gap-1 pt-2">
                              <div className="flex items-center justify-between px-1 mb-1">
                                {inCart && (
                                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">In Cart</span>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleRelatedItemInCart(relatedItem);
                                  }}
                                  disabled={relatedBusy}
                                  className={`flex-1 min-w-0 px-1 py-1.5 sm:py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all disabled:opacity-60 border-2 ${
                                    inCart 
                                      ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                                      : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'
                                  }`}
                                >
                                  {relatedBusy ? '...' : (inCart ? 'Remove' : 'Add')}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cardHandleView(e);
                                  }}
                                  className="flex-1 min-w-0 px-1 py-1.5 sm:py-2 text-[10px] font-black uppercase tracking-tight text-white bg-blue-800 hover:bg-blue-900 rounded-xl transition-all shadow-sm"
                                >
                                  View
                                </button>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </div>
                  ))}
                  
                  {/* View All Card Link */}
                  {relatedItems.length >= 10 && (
                    <div 
                      onClick={() => navigate(`/fastfood?vendorId=${item.vendor || item.vendorId || item.sellerId}`)}
                      className="w-[150px] sm:w-[170px] md:w-[190px] flex-shrink-0 snap-start flex flex-col items-center justify-center bg-white/40 rounded-2xl border-2 border-dashed border-orange-200 hover:bg-white/60 hover:border-orange-400 transition-all cursor-pointer p-4 text-center group"
                    >
                      <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                        <ArrowLeft className="h-6 w-6 text-orange-600 rotate-180" />
                      </div>
                      <h4 className="font-black text-gray-900 text-sm mb-1 uppercase tracking-tight">View All</h4>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Dishes from this kitchen</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />

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
