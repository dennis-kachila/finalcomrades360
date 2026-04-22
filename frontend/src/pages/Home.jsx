import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import serviceApi from '../services/serviceApi';
import { productApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useWishlist } from '../contexts/WishlistContext';
import { useCategories } from '../contexts/CategoriesContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Footer from '../components/Footer';
import HomeProductCard from '../components/HomeProductCard';
import ServiceCard from '../components/ServiceCard';
import FastFoodSection from '../components/FastFoodSection';
import HeroBanner from '../components/HeroBanner';
import { resolveImageUrl, FALLBACK_IMAGE } from '../utils/imageUtils';
import { isFastFoodOpen } from '../utils/availabilityUtils';
import { usePersistentFetch } from '../hooks/usePersistentFetch';
import useRealtimeSync from '../hooks/useRealtimeSync';
import { useToast } from '../components/ui/use-toast';

// Main Home component with performance optimizations
function Home({ isMarketingMode: propMarketingMode = false }) {
  // Determine effective marketing mode: Prop (priority) OR Session Storage
  // Determine if in marketing mode
  const isMarketingMode = localStorage.getItem('marketing_mode') === 'true';
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToCart, removeFromCart, refresh, cart } = useCart();
  const { categories: allCategories } = useCategories();
  const { toggleWishlist, isInWishlist: checkWishlist } = useWishlist();
  const { toast } = useToast();

  // Services and categories state
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fastFoodData, setFastFoodData] = useState([]);
  const [heroPromotions, setHeroPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking'); // checking, connected, failed

  // Helper function to filter items for marketing mode
  const filterMarketingItems = useCallback((items, type) => {
    if (!isMarketingMode) return items;

    const filtered = items.filter(item => {
      // Check if item has marketing commission > 1 (Strict Requirement)
      const commission = parseFloat(item.marketingCommission || 0);

      if (commission <= 1) {
        // if (type === 'service') {
        //   console.log(`❌ [MarketingFilter] REJECTED Service: "${item.title || item.name}" (ID: ${item.id}). Commission: ${commission} (<= 1)`);
        // }
        return false;
      }

      // Check approval and visibility based on type
      if (type === 'product') {
        const pass = item.approved &&
          item.visibilityStatus !== 'hidden' &&
          !item.suspended &&
          item.isActive !== false;
        return pass;
      } else if (type === 'service') {
        const isApproved = (item.status === 'approved' || item.status === 'active');
        // In marketing mode, we show it even if closed (isAvailable: false)
        const availabilityPass = isMarketingMode || item.isAvailable !== false;

        const finalPass = isApproved && availabilityPass;
        // if (finalPass) {
        //   console.log(`✅ [MarketingFilter] ALLOWED Service: "${item.title || item.name}" (ID: ${item.id}). Commission: ${commission}`);
        // } else {
        //   console.log(`❌ [MarketingFilter] REJECTED Service: "${item.title || item.name}" (ID: ${item.id}). Status: ${item.status}, Available: ${item.isAvailable}`);
        // }
        return finalPass;
      } else if (type === 'fastfood') {
        // Show all active fastfood items (open and closed) — closed ones display the Closed badge
        return item.status === 'active' && item.isActive !== false;
      }
      return false;
    });

    // if (filtered.length < items.length) {
    //   console.log(`[MarketingFilter] Filtered out ${items.length - filtered.length} ${type} items with commission <= 1`);
    // }

    return filtered;
  }, [isMarketingMode]);

  // Multi-category state: Map of categoryId -> { products, displayedProducts, page, hasMore, loadingMore, totalCount }
  const [categorySections, setCategorySections] = useState(new Map());
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const backgroundPrefetchStartedRef = useRef(false);

  const [servicesPage, setServicesPage] = useState(1);
  const [hasMoreServices, setHasMoreServices] = useState(true);
  const [selectedServiceSubcategory, setSelectedServiceSubcategory] = useState(null);
  const [loadingMoreServices, setLoadingMoreServices] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const servicesPrefetchStartedRef = useRef(false);

  // Helper to get items per row based on current layout
  const getItemsPerRow = useCallback(() => {
    const width = window.innerWidth;
    if (width >= 1280) return 6; // xl
    if (width >= 1024) return 5; // lg
    if (width >= 768) return 4;  // md
    if (width >= 640) return 3;  // sm
    return 2; // mobile
  }, []);

  // Maintenance Visibility Logic
  const [maintenance, setMaintenance] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('maintenance_settings') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const handleUpdate = (e) => {
      const data = e.detail || (e.key === 'maintenance_settings' ? JSON.parse(e.newValue || '{}') : null);
      if (data) setMaintenance(data);
    };
    window.addEventListener('maintenance-settings-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('maintenance-settings-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const isAdmin = useMemo(() => {
    const adminRoles = ['admin', 'super_admin', 'superadmin'];
    return adminRoles.includes(user?.role) || user?.roles?.some(r => adminRoles.includes(r));
  }, [user]);

  const isSectionVisible = (sectionKey) => {
    if (isAdmin) return true;
    const settings = maintenance.sections?.[sectionKey];
    return !settings?.enabled;
  };

  // Track which categories are currently initializing
  const [initializingCategories, setInitializingCategories] = useState(new Set());
  const observerSentinel = useRef(null);

  // Initialization effect to set up sections when categories load
  // Updated: Now primarily used for dynamic category syncing if categories change
  useEffect(() => {
    if (categories.length > 0) {
      setCategorySections(prev => {
        const newMap = new Map(prev);

        // Ensure "All Products" section exists
        if (!newMap.has('all')) {
          newMap.set('all', {
            id: 'all',
            name: 'All Products',
            products: [],
            displayedProducts: [],
            page: 1,
            hasMore: true,
            loadingMore: false,
            totalCount: 0,
            initialized: false
          });
        }

        // Initialize sections for any new categories not in the batch
        categories.forEach(cat => {
          if (!newMap.has(cat.id)) {
            newMap.set(cat.id, {
              id: cat.id,
              name: cat.name,
              products: [],
              displayedProducts: [],
              page: 1,
              hasMore: true,
              loadingMore: false,
              loading: false, // Don't block UI with skeletons for secondary sections
              totalCount: cat.productCount || 0,
              initialized: false
            });
          }
        });
        return newMap;
      });
    }
  }, [categories]);

  const loadSectionProducts = async (categoryId, isLoadMore = false) => {
    const sectionId = categoryId || 'all';
    const itemsPerRow = getItemsPerRow();
    const limit = itemsPerRow * 3; // Always append exactly 3 rows per load

    // Get current section data and calculate page BEFORE updating state
    const currentSectionState = categorySections.get(sectionId);
    if (!currentSectionState) return;

    const currentCount = currentSectionState.products?.length || 0;
    const page = isLoadMore ? Math.ceil(currentCount / limit) + 1 : 1;

    // Set loading state
    setCategorySections(prev => {
      const newMap = new Map(prev);
      const section = newMap.get(sectionId);
      if (section) {
        newMap.set(sectionId, {
          ...section,
          loadingMore: isLoadMore,
          loading: !isLoadMore
        });
      }
      return newMap;
    });

    try {
      const isUltraFast = sectionId === 'all' && page === 1;
      const client = isUltraFast ? api : productApi.client;

      const marketingParam = isMarketingMode ? '&marketing=true' : '';

      const url = isUltraFast
        ? `ultra-fast/homepage?limit=${limit}${isMarketingMode ? '&marketing=true' : ''}`
        : `?limit=${limit}&page=${page}${sectionId !== 'all' ? `&categoryId=${sectionId}` : ''}${marketingParam}`;

      const response = await client.get(url, { timeout: 5000 });

      let newProducts = response.data.products || [];
      const totalCount = response.data.pagination?.totalProducts || response.data.totalCount || 0;

      // Apply marketing filter if in marketing mode
      newProducts = filterMarketingItems(newProducts, 'product');

      setCategorySections(prev => {
        const newMap = new Map(prev);
        const currentSection = newMap.get(sectionId);

        if (currentSection) {
          // If we loaded 48 products in the batch (page 1), the first "Load More" (page 2) 
          // should probably fetch starting from a higher offset if the limit is small.
          // However, the cleanest way is to ensure we don't duplicate.

          const updatedProducts = isLoadMore
            ? [...currentSection.displayedProducts, ...newProducts.filter(np => !currentSection.displayedProducts.some(cp => cp.id === np.id))]
            : newProducts;

          newMap.set(sectionId, {
            ...currentSection,
            products: updatedProducts,
            displayedProducts: updatedProducts,
            page: page,
            hasMore: totalCount > updatedProducts.length && newProducts.length > 0,
            loadingMore: false,
            loading: false,
            initialized: true,
            totalCount: totalCount
          });
        }
        return newMap;
      });

    } catch (error) {
      console.error(`Failed to load products for ${sectionId}`, error);
      setCategorySections(prev => {
        const newMap = new Map(prev);
        const section = newMap.get(sectionId);
        if (section) {
          newMap.set(sectionId, { ...section, loading: false, loadingMore: false });
        }
        return newMap;
      });
    }
  };

  const hydrateAllProductsInBackground = useCallback(async () => {
    if (backgroundPrefetchStartedRef.current) return;

    const allSection = categorySections.get('all');
    if (!allSection || !allSection.initialized) return;

    const itemsPerRow = getItemsPerRow();
    const limit = itemsPerRow * 4;
    const currentLoaded = allSection.products?.length || 0;
    const totalExpected = Number(allSection.totalCount || 0);

    // If everything already loaded (or no more data expected), skip.
    if (totalExpected > 0 && currentLoaded >= totalExpected) return;

    backgroundPrefetchStartedRef.current = true;

    try {
      let page = Math.floor(currentLoaded / limit) + 1;
      let loaded = currentLoaded;
      const maxBackgroundRecords = Math.max(96, limit * 6); // cap to keep startup lightweight

      while (loaded < maxBackgroundRecords) {
        page += 1;

        const marketingParam = isMarketingMode ? '&marketing=true' : '';
        const response = await productApi.client.get(`/?limit=${limit}&page=${page}${marketingParam}`, { timeout: 15000 });
        let incoming = response?.data?.products || [];
        incoming = filterMarketingItems(incoming, 'product');

        if (!incoming.length) break;

        setCategorySections(prev => {
          const next = new Map(prev);
          const section = next.get('all');
          if (!section) return next;

          const existing = section.products || [];
          const merged = [...existing];
          const seen = new Set(existing.map((p) => String(p.id)));

          incoming.forEach((p) => {
            const key = String(p.id);
            if (!seen.has(key)) {
              merged.push(p);
              seen.add(key);
            }
          });

          const expected = Number(section.totalCount || response?.data?.pagination?.totalProducts || merged.length);
          next.set('all', {
            ...section,
            products: merged,
            displayedProducts: merged,
            hasMore: merged.length < expected
          });
          return next;
        });

        loaded += incoming.length;

        if (totalExpected > 0 && loaded >= totalExpected) break;
      }
    } catch (error) {
      console.warn('Background hydration for home products failed:', error?.message || error);
    }
  }, [categorySections, filterMarketingItems, getItemsPerRow, isMarketingMode]);

  const handleLoadMore = (categoryId) => {
    loadSectionProducts(categoryId, true);
  };

  // Handlers required for Product Cards
  // Handlers required for Product Cards
  const isInCart = useCallback((productId, itemType = 'product') => {
    return cart?.items?.some(item => {
      if (itemType === 'fastfood') return String(item.fastFoodId || item.fastFood?.id || '') === String(productId);
      if (itemType === 'service') return String(item.serviceId || item.service?.id || '') === String(productId);
      return String(item.productId || item.product?.id || '') === String(productId);
    });
  }, [cart]);

  const isInWishlist = useCallback((productId) => {
    return checkWishlist(productId);
  }, [checkWishlist]);

  const handleAddToCart = useCallback(async (productId, itemType = 'product') => {
    if (!user) { navigate('/login'); return; }
    try {
      const isProductInCart = cart?.items?.some(item => {
        if (itemType === 'fastfood') return String(item.fastFoodId || item.fastFood?.id || '') === String(productId);
        if (itemType === 'service') return String(item.serviceId || item.service?.id || '') === String(productId);
        return String(item.productId || item.product?.id || '') === String(productId);
      });

      if (isProductInCart) {
        if (itemType === 'product') {
          // Find all cart items for this product and remove them
          const productItems = cart?.items?.filter(item => 
            String(item.productId || item.product?.id || '') === String(productId)
          );

          if (productItems && productItems.length > 0) {
            for (const item of productItems) {
              await removeFromCart(productId, 'product', { variantId: item.variantId });
            }
          } else {
            await removeFromCart(productId, 'product');
          }
        } else {
          await removeFromCart(productId, itemType);
        }
        toast({ title: "Removed from cart", description: "Item removed from your cart" });
      } else {
        await addToCart(productId, 1, { type: itemType });
        toast({ title: "Added to cart", description: "Item added to your cart" });
      }
      // Optimistic updates are handled in context, no need to force heavy refresh here unless error
      // await refresh(); 
    } catch (error) { console.error('Cart op failed:', error); }
  }, [user, navigate, cart, addToCart, removeFromCart, toast]);

  const handleViewProduct = useCallback((product) => navigate(`/product/${product.id}`), [navigate]);

  const handleWishlistToggle = useCallback(async (productId) => {
    if (!user) { navigate('/login'); return; }
    try { await toggleWishlist(productId); }
    catch (error) { console.error('Wishlist failed:', error); }
  }, [user, navigate, toggleWishlist]);

  // Get subcategories for specifically 'Student Services'
  const getStudentServiceSubcategories = () => {
    const studentServicesCategory = allCategories.find(
      cat => cat.name === 'Student Services'
    );
    return studentServicesCategory?.subcategories || [];
  };

  const studentSubcategories = getStudentServiceSubcategories();

  // Handle subcategory selection for services
  const handleServiceSubcategorySelect = (subcategory) => {
    setSelectedServiceSubcategory(subcategory);
    setServicesPage(1);
    setServices([]); // Clear current services
    // Reload services with new filter
    loadServicesWithFilter(subcategory);
  };

  const clearServiceSubcategoryFilter = () => {
    setSelectedServiceSubcategory(null);
    setServicesPage(1);
    setServices([]);
    loadServicesWithFilter(null);
  };

  const loadServicesWithFilter = useCallback(async (subcategory) => {
    try {
      setLoadingServices(true);
      const itemsPerRow = getItemsPerRow();
      const initialLimit = itemsPerRow * 3;

      const currentMarketingMode = localStorage.getItem('marketing_mode') === 'true';

      const params = {
        status: 'approved',
        limit: initialLimit,
        page: 1,
        ...(currentMarketingMode && { marketing: 'true' })
      };

      if (subcategory) {
        params.subcategoryId = subcategory.id;
      } else {
        // When loading "All Services", filter by the Student Services category
        const studentServicesCategory = allCategories.find(cat => cat.name === 'Student Services');
        if (studentServicesCategory) {
          params.categoryId = studentServicesCategory.id;
        }
      }

      const servicesResponse = await serviceApi.getServices(params);
      const servicesData = servicesResponse.services || servicesResponse || [];
      const filteredServices = filterMarketingItems(servicesData, 'service');
      const totalServices = servicesResponse.totalCount || servicesData.length;

      setServices(filteredServices);
      setHasMoreServices(filteredServices.length < totalServices);
      setServicesPage(1);
    } catch (error) {
      console.error('Failed to load services with filter:', error);
    } finally {
      setLoadingServices(false);
    }
  }, [allCategories, getItemsPerRow, setHasMoreServices, setServices, setLoadingServices, setServicesPage]);



  const handleLoadMoreServices = async () => {
    try {
      setLoadingMoreServices(true);
      const itemsPerRow = getItemsPerRow();
      const limit = itemsPerRow * 3; // Always append exactly 3 rows per load
      const nextPage = servicesPage + 1;

      const currentMarketingMode = localStorage.getItem('marketing_mode') === 'true';

      const params = {
        status: 'approved',
        limit: limit,
        page: nextPage,
        ...(currentMarketingMode && { marketing: 'true' })
      };

      if (selectedServiceSubcategory) {
        params.subcategoryId = selectedServiceSubcategory.id;
      } else {
        const studentServicesCategory = allCategories.find(cat => cat.name === 'Student Services');
        if (studentServicesCategory) {
          params.categoryId = studentServicesCategory.id;
        }
      }

      const response = await serviceApi.getServices(params);
      let newServices = response.services || response || [];
      const totalCount = response.totalCount || newServices.length;

      newServices = filterMarketingItems(newServices, 'service');

      if (newServices.length > 0) {
        setServices(prev => [...prev, ...newServices.filter(ns => !prev.some(ps => ps.id === ns.id))]);
        setServicesPage(nextPage);
        // Be robust here: if we got exactly 'limit' items, there is likely more
        setHasMoreServices(newServices.length >= limit || (services.length + newServices.length < totalCount));
      } else {
        setHasMoreServices(false);
      }
    } catch (error) {
      console.error('Failed to load more services:', error);
    } finally {
      setLoadingMoreServices(false);
    }
  };

  const retryLoadProducts = async () => {
    setError(null);
    setApiStatus('checking');
    await loadData();
  };

  const loadDataLegacy = useCallback(async () => {
    try {
      const itemsPerRow = getItemsPerRow();
      const initialLimit = itemsPerRow * 3;

      const currentMarketingMode = localStorage.getItem('marketing_mode') === 'true';
      const [servicesResponse, categoriesResponse] = await Promise.all([
        serviceApi.getServices({
          status: 'approved',
          limit: initialLimit,
          page: 1,
          ...(currentMarketingMode && { marketing: 'true' })
        }),
        api.get('/categories/with-counts', { timeout: 30000 })
      ]);

      const servicesData = servicesResponse.services || servicesResponse || [];
      const filteredServices = filterMarketingItems(servicesData, 'service');
      setServices(filteredServices);
      setCategories(categoriesResponse.data || []);
      setHasMoreServices(filteredServices.length >= initialLimit);
    } catch (e) {
      console.error('Legacy fallback also failed:', e);
    }
  }, [api, filterMarketingItems, getItemsPerRow]);

  // Helper to clean data before caching (remove heavy base64 images)
  const cleanHomeDataForCache = useCallback((data) => {
    if (!data) return data;
    const cleanItem = (item) => {
      const newItem = { ...item };

      if (typeof newItem.coverImage === 'string' && newItem.coverImage.trim().startsWith('data:')) {
        newItem.coverImage = null;
      }

      if (Array.isArray(newItem.images)) {
        newItem.images = newItem.images.filter((image) => typeof image !== 'string' || !image.trim().startsWith('data:'));
      }

      return newItem;
    };

    return {
      ...data,
      products: data.products?.map(cleanItem),
      services: data.services?.map(cleanItem),
      fastFood: data.fastFood?.map(cleanItem),
      // Preserve other fields
      heroPromotions: data.heroPromotions,
      categories: data.categories,
      pagination: data.pagination
    };
  }, []);

  // Instant Loading Implementation
  const batchUrl = isMarketingMode ? `/ultra-fast/batch?marketing=true` : `/ultra-fast/batch`;
  const { data: homeBatchData, loading: hookLoading, error: hookError, refresh: refreshHomeData } = usePersistentFetch(
    // FORCE CACHE BUST FROM V15 -> V16
    `home_data_v19_critical_refresh_${isMarketingMode ? 'marketing' : 'personal'}`,
    batchUrl,
    {
      staleTime: 5 * 60 * 1000, // 5 minutes stale time
      transform: cleanHomeDataForCache
    }
  );

  // Sync hook data to component state
  useEffect(() => {
    if (homeBatchData) {
      processHomeData(homeBatchData);
      setLoading(false);
    } else if (hookLoading) {
      // Only set loading true if we're initially loading
      setLoading(true);
    }

    if (hookError) {
      console.error('Home data load failed:', hookError);
      // Fallback is handled inside the hook or we can trigger legacy here if needed
      if (!homeBatchData) setError('Failed to load data');
      setLoading(false);
    }
  }, [homeBatchData, hookLoading, hookError]);


  const processHomeData = useCallback((data) => {
    const { products, categories, services: batchServices, fastFood, heroPromotions } = data;

    // Get items per row for consistent 3-row display across all sections
    const itemsPerRow = getItemsPerRow();
    const initialDisplayLimit = Math.max(itemsPerRow * 3, 12); // Consistently use minimum 12

    // 1. Set Categories
    setCategories(categories || []);

    // 2. Set Services (with marketing filter if needed) - Limit to 2 rows initially to ensure Load More button shows
    const filteredServices = filterMarketingItems(batchServices || [], 'service');
    const servicesLimit = Math.min(filteredServices.length, itemsPerRow * 2);
    const initialServices = filteredServices.slice(0, Math.max(servicesLimit, 12));

    const totalServices = data.pagination?.totalServices || filteredServices.length;

    setServices(initialServices);
    // Show Load More if total count in DB > currently shown initial items
    const hasMore = totalServices > initialServices.length;
    
    setHasMoreServices(hasMore);
    setServicesPage(1);

    // 3. Set Fast Food (with marketing filter if needed) - Limit to 2 rows initially to ensure Load More button shows
    const filteredFastFood = filterMarketingItems(fastFood || [], 'fastfood');
    const fastFoodLimit = Math.min(filteredFastFood.length, itemsPerRow * 2);
    const initialFastFood = filteredFastFood.slice(0, Math.max(fastFoodLimit, 12));
    setFastFoodData(initialFastFood);

    // 4. Set Hero Promotions — allow those with marketing-eligible products OR those with a custom banner image
    const validPromos = (heroPromotions || []).filter(p => {
      // If we're in marketing mode, the backend already filters p.products 
      // but we apply additional safety check here for consistency.
      const products = p.products || [];
      const hasValidItems = products.length > 0;
      const isSystemBanner = p.isSystem || p.isDefault || (p.customImageUrl && p.customImageUrl.length > 0);
      
      return hasValidItems || isSystemBanner;
    });
    setHeroPromotions(validPromos);


    // 5. Initialize Product Category Sections (with marketing filter if needed)
    const filteredProducts = filterMarketingItems(products || [], 'product');

    setCategorySections(prev => {
      const newMap = new Map(prev);

      // "All Products" section from batch - 3 rows
      const initialProducts = filteredProducts.slice(0, initialDisplayLimit);

      newMap.set('all', {
        id: 'all',
        name: 'All Products',
        products: initialProducts,
        displayedProducts: initialProducts,
        page: 1,
        hasMore: filteredProducts.length > 0,
        loadingMore: false,
        loading: false,
        totalCount: data.pagination?.totalProducts || filteredProducts.length,
        initialized: true
      });

      if (categories) {
        categories.forEach(cat => {
          const catProducts = filteredProducts.filter(p => p.categoryId === cat.id);
          newMap.set(cat.id, {
            id: cat.id,
            name: cat.name,
            products: catProducts,
            displayedProducts: catProducts,
            page: 1,
            hasMore: true,
            loadingMore: false,
            loading: false,
            totalCount: cat.productCount || catProducts.length,
            initialized: catProducts.length > 0
          });
        });
      }
      return newMap;
    });

    setApiStatus('connected');
  }, [filterMarketingItems, getItemsPerRow, loadServicesWithFilter]);

  const hydrateServicesInBackground = useCallback(async () => {
    if (servicesPrefetchStartedRef.current) return;
    if (selectedServiceSubcategory) return;

    servicesPrefetchStartedRef.current = true;

    try {
      const itemsPerRow = getItemsPerRow();
      const limit = itemsPerRow * 3;
      const nextPage = servicesPage + 1;
      const currentMarketingMode = localStorage.getItem('marketing_mode') === 'true';

      const params = {
        status: 'approved',
        limit,
        page: nextPage,
        ...(currentMarketingMode && { marketing: 'true' })
      };

      // Keep service universe aligned with current home service filter context.
      const studentServicesCategory = allCategories.find(cat => cat.name === 'Student Services');
      if (studentServicesCategory) {
        params.categoryId = studentServicesCategory.id;
      }

      const response = await serviceApi.getServices(params);
      const fetchedServices = response.services || response || [];
      const filtered = filterMarketingItems(fetchedServices, 'service');

      if (filtered.length > 0) {
        setServices(prev => {
          const merged = [...prev];
          const seen = new Set(prev.map((s) => String(s.id)));
          filtered.forEach((s) => {
            const key = String(s.id);
            if (!seen.has(key)) {
              merged.push(s);
              seen.add(key);
            }
          });
          return merged;
        });
        setServicesPage(nextPage);

        const totalServices = response.totalCount || filtered.length;
        const estimatedCount = (services.length || 0) + filtered.length;
        setHasMoreServices(estimatedCount < totalServices);
      }
    } catch (error) {
      console.warn('Background hydration for services failed:', error?.message || error);
    }
  }, [allCategories, filterMarketingItems, getItemsPerRow, selectedServiceSubcategory, services.length, servicesPage]);

  useEffect(() => {
    if (services.length === 0 && !homeBatchData) return;
    if (selectedServiceSubcategory) return;

    // Don't auto-hydrate services - let user control loading more items via Load More button
    // const timer = setTimeout(() => {
    //   hydrateServicesInBackground();
    // }, 350);

    // return () => clearTimeout(timer);
  }, [homeBatchData, services.length, selectedServiceSubcategory, hydrateServicesInBackground]);

  // Progressive enhancement: after first paint, silently hydrate more real products in the background.
  useEffect(() => {
    const allSection = categorySections.get('all');
    if (!allSection?.initialized) return;

    // Don't auto-hydrate products - let user control loading more items via Load More button
    // const timer = setTimeout(() => {
    //   hydrateAllProductsInBackground();
    // }, 250);

    // return () => clearTimeout(timer);
  }, [categorySections, hydrateAllProductsInBackground]);

  // Keep loadData for manual retry, but mapped to refresh
  const loadData = refreshHomeData;

  // Real-time synchronization: refresh the homepage content when related items are modified
  useRealtimeSync(['products', 'services', 'fastfood', 'maintenance', 'platform_settings'], loadData);

  // Initial load handled by hook
  // useEffect(() => {
  //   loadData();
  // }, []);




  // useEffect(() => {
  //   loadData();
  // }, []);



  /* 
   * Updated toggleCategorySelection:
   * Sets the selected category to display in the single product area.
   */
  const toggleCategorySelection = (category) => {
    const categoryId = category.id;
    setSelectedCategoryId(categoryId);

    // Check if we need to load data for this section
    setCategorySections(prev => {
      const section = prev.get(categoryId);
      if (section && !section.initialized && !section.loading && !section.loadingMore) {
        // Trigger load in next tick to avoid state update during render if called from setup
        setTimeout(() => loadSectionProducts(categoryId), 0);
      }
      return prev;
    });
  };

  /* 
   * NOTE: The following logic (useMemo productList, loadCategoryProducts) is largely 
   * replaced by section-based logic but kept to avoid breaking pending references 
   * if any remain. The UI now primarily uses CategorySection.
   */


  // Render loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md">
            <div className="text-yellow-600 mb-3">⚠️</div>
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">Connection Issue</h3>
            <p className="text-sm text-yellow-700 mb-4">{error}</p>
            <div className="space-y-2">
              <button
                onClick={() => loadData()}
                className="w-full px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Internal render function (not component) to avoid re-mounting on every render
  const renderCategorySection = (sectionId) => {
    const section = categorySections.get(sectionId);
    if (!section) return null;

    const { name, displayedProducts, hasMore, loading, loadingMore, products, totalCount } = section;

    // Hide the section completely if it's empty (like FastFoodSection)
    if (!loading && !loadingMore && displayedProducts.length === 0) {
        return null;
    }

    return (
      <div key={`category-section-${sectionId}`} id={`category-${sectionId}`} className="sm:mb-3 mb-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{name}</h3>
            <p className="text-gray-500 text-sm mt-2">
              {!loading && `${totalCount.toLocaleString()} products found`}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              to="/products"
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center group gap-1"
            >
              View all
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            {/* Loading Skeleton */}
            {(loading && displayedProducts.length === 0) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
                    <div className="aspect-[3/4] bg-gray-100 animate-pulse"></div>
                    <div className="p-3 flex-grow flex flex-col">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
                      <div className="mt-auto pt-2">
                        <div className="h-8 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Actual Products and Pagination Skeletons */}
            <MemoizedProductList
              products={displayedProducts}
              onProductClick={handleViewProduct}
              onAddToCart={handleAddToCart}
              onWishlistToggle={handleWishlistToggle}
              isInCart={isInCart}
              isInWishlist={isInWishlist}
              user={user}
              navigate={navigate}
            />

            {/* Show skeletons while loading more items to maintain continuity */}
            {loadingMore && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 mt-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`loading-more-skeleton-${index}`} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
                    <div className="aspect-[3/4] bg-gray-100 animate-pulse"></div>
                    <div className="p-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && displayedProducts.length === 0 && (
              <div className="text-center py-10 text-gray-500">
                <p>No products found in {name}.</p>
              </div>
            )}
          </div>

          {/* Load More and View All Buttons */}
          {!loading && displayedProducts.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 sm:mt-6 mt-3 mb-1">
              {hasMore && !loadingMore && (
                <button
                  onClick={() => handleLoadMore(sectionId)}
                  className="px-4 py-2 sm:px-8 sm:py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-colors shadow-md flex items-center space-x-2 text-xs sm:text-base animate-in fade-in zoom-in duration-300"
                >
                  <span>Load More</span>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              <Link
                to="/products"
                className="px-4 py-2 sm:px-8 sm:py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md flex items-center space-x-2 text-xs sm:text-base"
              >
                <span>View All</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render main content
  return (
    <div className="min-h-screen flex flex-col">
      <HeroBanner
        apiStatus={apiStatus}
        onRetry={retryLoadProducts}
        promotions={heroPromotions}
        onAddToCart={handleAddToCart}
      />

      <div data-testid="homepage-content" className="w-full px-1 sm:px-4 pt-4 md:pt-8 pb-2">
        {/* Quick Navigation Buttons */}
        <div className="mb-6 flex items-center justify-center px-1 sm:px-0">
          <div className="flex flex-row gap-2 w-full max-w-xl">
            {isSectionVisible('products') && (
              <a href="/products" className="flex-1 px-1 py-1 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 text-white font-medium text-xs sm:text-base shadow hover:scale-105 hover:shadow-lg transition-all flex flex-row items-center justify-center min-w-[60px] sm:min-w-[90px] h-8 sm:h-auto">
                <span className="text-base sm:text-xl mr-1">🛒</span>
                <span>Products</span>
              </a>
            )}
            {isSectionVisible('fastfood') && (
              <a href="/fastfood" className="flex-1 px-1 py-1 rounded-md bg-gradient-to-br from-orange-400 to-amber-500 text-white font-medium text-xs sm:text-base shadow hover:scale-105 hover:shadow-lg transition-all flex flex-row items-center justify-center min-w-[60px] sm:min-w-[90px] h-8 sm:h-auto">
                <span className="text-base sm:text-xl mr-1">🍔</span>
                <span>Fastfood</span>
              </a>
            )}
            {isSectionVisible('services') && (
              <a href="/services" className="flex-1 px-1 py-1 rounded-md bg-gradient-to-br from-purple-500 to-violet-700 text-white font-medium text-xs sm:text-base shadow hover:scale-105 hover:shadow-lg transition-all flex flex-row items-center justify-center min-w-[60px] sm:min-w-[90px] h-8 sm:h-auto">
                <span className="text-base sm:text-xl mr-1">🛠️</span>
                <span>Services</span>
              </a>
            )}
          </div>
        </div>

        {/* Product Category Filter Navigation */}
        {isSectionVisible('products') && (
          <div className="bg-white border rounded-none sm:rounded-lg shadow-sm mb-6 mt-4">
            <div className="px-2 sm:px-4 py-4">
              <div className="flex items-center justify-end mb-2">
                {selectedCategoryId !== 'all' && (
                  <button
                    onClick={() => toggleCategorySelection({ id: 'all' })}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center font-medium"
                  >
                    Show All
                  </button>
                )}
              </div>

              <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide">
                {/* All Products Button */}
                <button
                  onClick={() => toggleCategorySelection({ id: 'all' })}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg border font-medium transition-colors ${selectedCategoryId === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:text-blue-600'
                    }`}
                >
                  All Products
                </button>

                {/* Category Buttons */}
                {allCategories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => toggleCategorySelection(category)}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg border font-medium transition-colors ${selectedCategoryId === category.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:text-blue-600'
                      }`}
                  >
                    <span className="mr-2">{category.emoji || '📦'}</span>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Single Category Section Display Area stack */}
        {isSectionVisible('products') && (
        <div className="space-y-4">
          <div className="space-y-4">
            {renderCategorySection(selectedCategoryId)}
          </div>
        </div>
        )}
      </div>

      {/* Services Section */}
      {isSectionVisible('services') && ((!loading && !loadingServices && services.length === 0 && !selectedServiceSubcategory) ? null : (
      <div className="w-full px-1 sm:px-4 sm:py-4 py-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Best Services</h2>
          </div>
          <Link
            to="/services"
            className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 group"
          >
            View all
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Subcategory Filter Navigation */}
        <div className="bg-white border rounded-none sm:rounded-lg shadow-sm mb-6">
          <div className="px-2 sm:px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Filter by Service Type</h4>
              {selectedServiceSubcategory && (
                <button
                  onClick={clearServiceSubcategoryFilter}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                >
                  Clear Filter
                </button>
              )}
            </div>

            <div className="flex space-x-3 overflow-x-auto pb-2">
              {/* All Services Button */}
              <button
                onClick={() => handleServiceSubcategorySelect(null)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg border font-medium transition-colors ${!selectedServiceSubcategory
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:text-blue-600'
                  }`}
              >
                All Services
              </button>

              {/* Subcategory Buttons */}
              {studentSubcategories.map(subcategory => (
                <button
                  key={subcategory.id}
                  onClick={() => handleServiceSubcategorySelect(subcategory)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg border font-medium transition-colors ${selectedServiceSubcategory?.id === subcategory.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:text-blue-600'
                    }`}
                >
                  <span className="mr-2">{subcategory.emoji || '🛠️'}</span>
                  {subcategory.name}
                </button>
              ))}
            </div>

            {selectedServiceSubcategory && (
              <div className="mt-3 text-sm text-gray-600">
                Showing services in <span className="font-medium">{selectedServiceSubcategory.name}</span> type
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {(loadingServices && services.length === 0) ? (
            Array.from({ length: 12 }).map((_, index) => (
              <div key={`init-service-skeleton-${index}`} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden h-64 animate-pulse">
                <div className="h-40 bg-gray-200"></div>
                <div className="p-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))
          ) : services.length > 0 ? (
            services.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                user={user}
                navigate={navigate}
              />
            ))
          ) : (!loading && !loadingServices) ? (
            <div className="col-span-full text-center py-10 text-gray-500">
              <p>No services available at the moment.</p>
            </div>
          ) : null}

          {/* Loading More Services Skeleton */}
          {loadingMoreServices && Array.from({ length: getItemsPerRow() * 2 }).map((_, index) => (
            <div key={`service-skeleton-${index}`} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden h-64 animate-pulse">
              <div className="h-40 bg-gray-200"></div>
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Load More and View All Services Buttons */}
        {services.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:mt-4 mt-2 mb-0">
            {hasMoreServices && !loadingMoreServices && (
              <button
                onClick={handleLoadMoreServices}
                className="px-4 py-2 sm:px-8 sm:py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-colors shadow-md flex items-center space-x-2 text-xs sm:text-base animate-in fade-in zoom-in duration-300"
              >
                <span>Load More</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}

            <Link
              to="/services"
              className="px-4 py-2 sm:px-8 sm:py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md flex items-center space-x-2 text-xs sm:text-base"
            >
              <span>View All</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        )}
      </div>
      ))}

      {/* Fast Food Section */}
      {isSectionVisible('fastfood') && (
        <FastFoodSection 
          initialData={fastFoodData} 
          initialTotal={homeBatchData?.pagination?.totalFastFood || 0}
        />
      )}

      {/* Spacer to push footer to bottom */}
      <div className="flex-grow"></div>

      {/* Footer */}
      <Footer />


    </div >
  );
}

// Lazy load heavy components that aren't immediately needed

const CategoryCard = React.memo(({ category, onClick, isSelected }) => {

  const handleClick = useCallback((e) => {
    e.preventDefault();
    onClick(category);
  }, [category, onClick]);

  return (
    <div
      data-testid="category-card"
      onClick={handleClick}
      className={`flex-shrink-0 sm:w-48 w-36 px-3 py-3 sm:p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${isSelected
        ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500/20'
        : 'border-gray-100 bg-white hover:border-blue-200 hover:shadow-lg hover:-translate-y-1'
        }`}
      aria-selected={isSelected}
    >
      {/* Horizontal layout with icon on the left */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="text-2xl sm:text-3xl flex-shrink-0" aria-hidden="true">{category.emoji || '📦'}</div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-medium text-xs sm:text-sm md:text-base ${isSelected ? 'text-blue-900' : 'text-gray-900'
            } truncate`}>
            {category.name || 'Unnamed Category'}
          </h3>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if these props change
  return (
    prevProps.category.id === nextProps.category.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.category.productCount === nextProps.category.productCount &&
    prevProps.category.subcategoryCount === nextProps.category.subcategoryCount
  );
});

const SubcategoryCard = React.memo(({ subcategory, onClick, isSelected }) => {

  const handleClick = useCallback((e) => {
    e.preventDefault();
    onClick(subcategory);
  }, [subcategory, onClick]);

  return (
    <div
      onClick={handleClick}
      className={`flex-shrink-0 w-44 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${isSelected
        ? 'border-green-500 bg-green-50 shadow-md ring-1 ring-green-500/20'
        : 'border-gray-100 bg-white hover:border-green-200 hover:shadow-lg hover:-translate-y-1'
        }`}
      aria-selected={isSelected}
    >
      <div className="text-2xl mb-2" aria-hidden="true">{subcategory.emoji || '📁'}</div>
      <h4 className="font-medium text-gray-900 text-sm">{subcategory.name || 'Unnamed Subcategory'}</h4>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if these props change
  return (
    prevProps.subcategory.id === nextProps.subcategory.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.subcategory.productCount === nextProps.subcategory.productCount
  );
});

// Memoized product list to prevent unnecessary re-renders
const MemoizedProductList = React.memo(({ products, onProductClick, onAddToCart, onWishlistToggle, isInCart, isInWishlist, user, navigate }) => {

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
      {products.map((product) => (
        <HomeProductCard
          key={product.id}
          product={product}
          onView={onProductClick}
          onAddToCart={onAddToCart}
          onWishlistToggle={onWishlistToggle}
          isInCart={isInCart(product.id)}
          isInWishlist={isInWishlist(product.id)}
          user={user}
          navigate={navigate}
          className="w-full"
        />
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if critical props change
  return (
    prevProps.products === nextProps.products &&
    prevProps.user === nextProps.user &&
    prevProps.navigate === nextProps.navigate &&
    prevProps.isInCart === nextProps.isInCart &&
    prevProps.isInWishlist === nextProps.isInWishlist
  );
});

export default Home;
