import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import ComradesProductForm from './comrades/ComradesProductForm';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  FaPlus,
  FaList,
  FaClock,
  FaTimesCircle,
  FaEdit,
  FaBox,
  FaArrowLeft,
  FaSpinner
} from 'react-icons/fa';
import DeleteConfirmationModal from '../../components/modals/DeleteConfirmationModal';
import { productApi } from '../../services/api';
import serviceApi from '../../services/serviceApi';
import { fastFoodService } from '../../services/fastFoodService';
import HomeProductCard from '../../components/HomeProductCard';
import { useToast } from '../../components/ui/use-toast';
import { useQuery } from '@tanstack/react-query';

// Lazy load components
const ProductCardSkeleton = lazy(() => import('../../components/ProductCardSkeleton'));
// const ComradesProductForm = lazy(() => import('./comrades/ComradesProductForm'));
const ServiceForm = lazy(() => import('../../components/services/ServiceForm'));
const FastFoodForm = lazy(() => import('./FastFoodForm'));
const InventoryManagement = lazy(() => import('./components/InventoryManagement'));
const PricingPromotions = lazy(() => import('./components/PricingPromotions'));
const ProductAnalytics = lazy(() => import('./components/ProductAnalytics'));
const BulkOperations = lazy(() => import('./components/BulkOperations'));
const ProductListingView = lazy(() => import('./components/ProductListingView'));
const EnhancedCategories = lazy(() => import('./EnhancedCategories'));

const Products = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useParams();
  const { toast } = useToast();

  // State management
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [hubVisible, setHubVisible] = useState(!location.state?.activeView);
  const [activeView, setActiveView] = useState('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [displayedProducts, setDisplayedProducts] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, product: null });

  // Hub Navigation Scrolling State
  const hubScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const PRODUCTS_PER_PAGE = 20;

  // Optimized products query with instant rendering
  const { data: queryData, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['products', 'paginated', currentPage],
    queryFn: async () => {
      // Use admin endpoint to ensure we get ALL products (hidden, suspended, etc.)
      const response = await productApi.getAllAdmin({
        page: currentPage,
        limit: PRODUCTS_PER_PAGE,
        lite: true
      });

      return response.data || { products: [], pagination: {} };
    },
    enabled: activeView === 'list' || activeView === 'my-products',
    placeholderData: (previousData) => previousData,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const products = useMemo(() => queryData?.products || [], [queryData?.products]);
  const pagination = queryData?.pagination || {};

  // Sync activeView with URL location
  useEffect(() => {
    const path = location.pathname;
    const segments = path.split('/').filter(Boolean);

    // Path structure: /dashboard/products or /dashboard/products/:view or /dashboard/products/:view/:id
    if (segments.length === 2 && segments[1] === 'products') {
      setActiveView('list');
    } else if (segments.length >= 3 && segments[1] === 'products') {
      const view = segments[2];
      const validViews = ['create', 'edit', 'view', 'my-products', 'product-listing', 'inventory', 'pricing', 'analytics', 'bulk-actions', 'categories'];
      if (validViews.includes(view)) {
        setActiveView(view);
      }
    }
  }, [location.pathname]);

  // Update displayed products when new data arrives or view changes
  useEffect(() => {
    const isListView = activeView === 'list' || activeView === 'my-products';

    if (isListView && queryData?.products) {
      const newProducts = queryData.products;
      if (currentPage === 1) {
        setDisplayedProducts(newProducts);
      } else if (newProducts.length > 0) {
        setDisplayedProducts(prev => {
          // Avoid duplicates
          const combined = [...prev, ...newProducts];
          return Array.from(new Map(combined.map(p => [p.id, p])).values());
        });
      }
      setHasMore(newProducts.length === PRODUCTS_PER_PAGE);
    }
    setIsLoadingMore(false);
  }, [queryData?.products, currentPage, PRODUCTS_PER_PAGE, activeView]); // Added activeView to re-sync if view changes and data is cached

  // Helper function to check if a product was added by super admin
  const isSuperAdminProduct = useCallback((product) => {
    return product.seller && (product.seller.role === 'superadmin' || product.seller.role === 'admin' || product.seller.role === 'super_admin');
  }, []);

  // Memoized product statistics
  const productStats = useMemo(() => {
    const stats = {
      total: pagination.totalProducts || displayedProducts.length,
      active: displayedProducts.filter(p => p.approved).length,
      lowStock: displayedProducts.filter(p => p.stock <= 10 && p.stock > 0).length,
      outOfStock: displayedProducts.filter(p => p.stock === 0).length,
      recent: [],
      older: []
    };

    if (displayedProducts.length > 0) {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      stats.recent = displayedProducts.filter(p => new Date(p.createdAt) >= twoWeeksAgo);
      stats.older = displayedProducts.filter(p => new Date(p.createdAt) < twoWeeksAgo);
    }

    return stats;
  }, [displayedProducts, pagination.totalProducts]);

  // Optimized filtering
  const filteredProducts = useMemo(() => {
    if (activeView === 'my-products') {
      return displayedProducts.filter(isSuperAdminProduct);
    }
    return displayedProducts;
  }, [displayedProducts, activeView, isSuperAdminProduct]);

  // Handle view change
  const handleViewChange = useCallback(async (view, product = null) => {
    // Basic normalization of the product to ensure id is always present
    const normalizedProduct = product ? {
      ...product,
      id: product.id || product._id,
      itemType: product.itemType || 'product'
    } : null;

    setActiveView(view);

    // Navigate to the appropriate route
    if (view === 'list') {
      navigate('/dashboard/products');
    } else if (view && view !== 'view') {
      navigate(`/dashboard/products/${view}${normalizedProduct ? `/${normalizedProduct.id}` : ''}`);
    }

    if (view === 'view' && normalizedProduct?.id) {
      try {
        let fetchedData;

        // Determine which API to use based on itemType
        if (normalizedProduct.itemType === 'service') {
          const response = await serviceApi.getServiceById(normalizedProduct.id);
          fetchedData = { ...response, id: response.id || response._id, itemType: 'service' };
        } else if (normalizedProduct.itemType === 'fastfood') {
          const response = await fastFoodService.getFastFoodById(normalizedProduct.id);
          fetchedData = response.success ? { ...response.data, id: response.data.id || response.data._id, itemType: 'fastfood' } : normalizedProduct;
        } else {
          // Default to product API
          const response = await productApi.getById(normalizedProduct.id);
          fetchedData = { ...response.data, id: response.data.id || response.data._id, itemType: 'product' };
        }

        setSelectedProduct(fetchedData);
      } catch (error) {
        console.error('Error fetching updated data:', error);
        // Fallback to the product data we already have
        setSelectedProduct(normalizedProduct);
      }
    } else if (normalizedProduct) {
      setSelectedProduct(normalizedProduct);
    }
  }, [navigate]);

  // Handle listing a product
  const handleListProduct = useCallback(async (product) => {
    try {
      setIsLoadingMore(true);
      await productApi.update(product.id, { status: 'active' });

      toast({
        title: 'Success',
        description: 'Product has been listed successfully',
      });

      navigate('/dashboard/comrades/products');
      await refetch();
    } catch (error) {
      console.error('Error listing product:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to list product',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [navigate, toast, refetch]);

  // Reset pagination when activeView changes to something other than list
  useEffect(() => {
    if (activeView !== 'list' && activeView !== 'my-products') {
      setCurrentPage(1);
      setDisplayedProducts([]);
      setHasMore(true);
    } else if (currentPage !== 1) {
      // If we are coming back to a list view, reset to page 1 for freshness
      setCurrentPage(1);
    }
  }, [activeView]);

  // Product cards for the sidebar
  const productCards = useMemo(() => [
    {
      id: 'create-product',
      title: 'Create Product',
      description: 'Add new products to the catalog',
      icon: <FaPlus className="text-white" />,
      bgColor: 'bg-green-500',
      borderColor: 'border-green-200',
      hoverColor: 'hover:border-green-500',
      to: 'create',
      action: 'Create'
    },
    {
      id: 'product-listing',
      title: 'Product Listing',
      description: 'Review and approve seller products for publication',
      icon: <FaList className="text-white" />,
      bgColor: 'bg-orange-500',
      borderColor: 'border-orange-200',
      hoverColor: 'hover:border-orange-500',
      to: 'product-listing',
      action: 'Review'
    },
    {
      id: 'my-products',
      title: 'My Products',
      description: 'View and manage products added by super admin',
      icon: <FaBox className="text-white" />,
      bgColor: 'bg-blue-500',
      borderColor: 'border-blue-200',
      hoverColor: 'hover:border-blue-500',
      to: 'my-products',
      action: 'View'
    },
    {
      id: 'inventory',
      title: 'Inventory Management',
      description: 'Update stock levels and track inventory',
      icon: <FaList className="text-white" />,
      bgColor: 'bg-purple-500',
      borderColor: 'border-purple-200',
      hoverColor: 'hover:border-purple-500',
      to: 'inventory',
      action: 'Manage'
    },
    {
      id: 'pricing',
      title: 'Pricing & Promotions',
      description: 'Set prices, discounts, and flash sales',
      icon: <FaClock className="text-white" />,
      bgColor: 'bg-indigo-500',
      borderColor: 'border-indigo-200',
      hoverColor: 'hover:border-indigo-500',
      to: 'pricing',
      action: 'Configure'
    },
    {
      id: 'analytics',
      title: 'Product Analytics',
      description: 'View performance metrics and insights',
      icon: <FaTimesCircle className="text-white" />,
      bgColor: 'bg-orange-500',
      borderColor: 'border-orange-200',
      hoverColor: 'hover:border-orange-500',
      to: 'analytics',
      action: 'Analyze'
    },
    {
      id: 'bulk-actions',
      title: 'Bulk Operations',
      description: 'Update multiple products at once',
      icon: <FaEdit className="text-white" />,
      bgColor: 'bg-teal-500',
      borderColor: 'border-teal-200',
      hoverColor: 'hover:border-teal-500',
      to: 'bulk-actions',
      action: 'Process'
    },
    {
      id: 'categories',
      title: 'Category Manager',
      description: 'Organize and manage product categories',
      icon: <FaList className="text-white" />,
      bgColor: 'bg-pink-500',
      borderColor: 'border-pink-200',
      hoverColor: 'hover:border-pink-500',
      to: 'categories',
      action: 'Organize'
    },
    {
      id: 'settings',
      title: 'Product Settings',
      description: 'Configure global product rules and attributes',
      icon: <FaTimesCircle className="text-white" />,
      bgColor: 'bg-gray-500',
      borderColor: 'border-gray-200',
      hoverColor: 'hover:border-gray-500',
      to: 'settings',
      action: 'Set'
    }
  ], []);

  // Handle Hub Navigation Scrolling
  const checkScroll = useCallback(() => {
    if (hubScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = hubScrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, productCards, hubVisible]);

  const scrollHub = (direction) => {
    if (hubScrollRef.current) {
      const scrollAmount = 300;
      hubScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Infinite scroll for loading more products
  const loadMoreProducts = useCallback(() => {
    if (hasMore && !isLoadingMore && !isPending && !isFetching) {
      setIsLoadingMore(true);
      setCurrentPage(prev => prev + 1);
    }
  }, [hasMore, isLoadingMore, isPending, isFetching]);

  // Recovery effect to load product if ID is in URL but selectedProduct is null
  useEffect(() => {
    const isEditingOrViewing = activeView === 'edit' || activeView === 'view';
    if (isEditingOrViewing && !selectedProduct) {
      const path = location.pathname;
      const segments = path.split('/').filter(Boolean);
      const urlId = segments[3];

      if (urlId && urlId !== 'null' && urlId !== 'undefined') {
        const recoverData = async () => {
          try {
            // Priority 1: Check in current list
            const inList = products.find(p => p.id === urlId || p._id === urlId);
            if (inList) {
              handleViewChange(segments[2], inList);
              return;
            }

            // Priority 2: Generic fetch to find item type
            // Try product first
            try {
              const p = await productApi.getById(urlId);
              if (p.data) {
                handleViewChange(segments[2], { ...p.data, itemType: 'product' });
                return;
              }
            } catch (e) { /* next */ }

            try {
              const s = await serviceApi.getServiceById(urlId);
              if (s) {
                handleViewChange(segments[2], { ...s, itemType: 'service' });
                return;
              }
            } catch (e) { /* next */ }

            try {
              const f = await fastFoodService.getFastFoodById(urlId);
              if (f.success) {
                handleViewChange(segments[2], { ...f.data, itemType: 'fastfood' });
                return;
              }
            } catch (e) { /* next */ }

          } catch (error) {
            console.error('Recovery failed:', error);
          }
        };

        recoverData();
      }
    }
  }, [activeView, selectedProduct, location.pathname, products, handleViewChange]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreProducts();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const sentinel = document.getElementById('infinite-scroll-sentinel');
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [hasMore, loadMoreProducts]);

  // Handle form close
  const handleCloseForm = useCallback(() => {
    handleViewChange('list');
  }, [handleViewChange]);

  // Handle back button
  const handleBack = useCallback(() => {
    handleViewChange('list');
  }, [handleViewChange]);

  // Handle form success
  const handleFormSuccess = useCallback((data) => {
    refetch(); // Refresh the list
    handleCloseForm(); // Go back to list
  }, [refetch, handleCloseForm]);

  // Handle card click
  const handleCardClick = useCallback((card) => {
    switch (card.to) {
      case 'create':
        handleViewChange('create');
        break;
      case 'product-listing':
        handleViewChange('product-listing');
        break;
      case 'my-products':
        handleViewChange('my-products');
        break;
      case 'inventory':
        handleViewChange('inventory');
        break;
      case 'pricing':
        handleViewChange('pricing');
        break;
      case 'analytics':
        handleViewChange('analytics');
        break;
      case 'bulk-actions':
        handleViewChange('bulk-actions');
        break;
      case 'categories':
        handleViewChange('categories');
        break;
      default:
        return;
    }
  }, [handleViewChange]);

  // Handle confirmed delete
  const handleConfirmedDelete = async (productId, reason, password) => {
    try {
      const config = {
        data: {
          password,
          reason
        }
      };

      await productApi.delete(productId, config);

      // Optimistic Update: Remove from local state immediately
      setDisplayedProducts(prev => prev.filter(p => (p.id || p._id) !== productId));

      toast({
        title: 'Success',
        description: 'Product deleted successfully',
      });

      // Background refetch to ensure server sync
      refetch();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete product',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Memoized product card renderer
  const renderProductCard = useCallback((product) => {
    const handleHide = async (e) => {
      e.stopPropagation();
      try {
        await productApi.toggleVisibility(product.id);
        toast({
          title: 'Success',
          description: `Product ${product.hidden ? 'shown' : 'hidden'} successfully`,
        });
        refetch();
      } catch (error) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to toggle product visibility',
          variant: 'destructive',
        });
      }
    };

    const handleDelete = (e) => {
      e.stopPropagation();
      setDeleteModal({ isOpen: true, product });
    };

    const handleSuspend = async (e) => {
      e.stopPropagation();
      try {
        await productApi.suspend(product.id);
        toast({
          title: 'Success',
          description: `Product ${product.suspended ? 'unsuspended' : 'suspended'} successfully`,
        });
        refetch();
      } catch (error) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to suspend product',
          variant: 'destructive',
        });
      }
    };

    return (
      <div className="w-full" key={product.id}>
        <Suspense fallback={<ProductCardSkeleton />}>
          <HomeProductCard
            product={product}
            isInCart={false}
            onView={(p) => handleViewChange('view', p)}
            user={null}
            navigate={navigate}
            renderActions={({ handleView }) => (
              // Admin view - management actions
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 gap-1">
                <button
                  onClick={handleView}
                  className="flex-1 px-2 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                >
                  View
                </button>
                <button
                  onClick={handleHide}
                  className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                  title={product.hidden ? 'Show product' : 'Hide product'}
                >
                  {product.hidden ? 'Show' : 'Hide'}
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-2 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                  title="Delete product"
                >
                  Del
                </button>
                <button
                  onClick={handleSuspend}
                  className="flex-1 px-2 py-1.5 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded transition-colors"
                  title={product.suspended ? 'Unsuspend product' : 'Suspend product'}
                >
                  {product.suspended ? 'Unsuspend' : 'Suspend'}
                </button>
              </div>
            )}
          />
        </Suspense>
      </div>
    );
  }, [handleViewChange, navigate, toast, refetch]);

  // Optimized product grid renderer for instant rendering
  const renderProductGrid = useCallback(() => {
    if (error) {
      return (
        <div className="text-center py-10 text-red-600">
          <p>Failed to load products</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            🔄 Retry Loading Products
          </button>
        </div>
      );
    }

    return (
      <div className="w-full min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">

          {filteredProducts.length > 0 ? (
            filteredProducts.map(renderProductCard)
          ) : isPending ? (
            // Show skeletons while loading initial data
            [...Array(12)].map((_, i) => (
              <ProductCardSkeleton key={`skeleton-${i}`} />
            ))
          ) : null}
        </div>

        {hasMore && (
          <div className="mt-8 mb-12 flex flex-col items-center justify-center gap-4">
            <button
              onClick={loadMoreProducts}
              disabled={isLoadingMore || isPending}
              className={`px-6 py-2 sm:px-8 sm:py-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 flex items-center gap-2 shadow-lg ${isLoadingMore || isPending
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 active:scale-95'
                }`}
            >
              {isLoadingMore ? (
                <>
                  <FaSpinner className="animate-spin" />
                  Loading More...
                </>
              ) : (
                <>
                  <FaPlus />
                  Load More Products
                </>
              )}
            </button>
            <p className="text-xs text-gray-400 font-medium italic">
              Showing {filteredProducts.length} of {productStats.total} products
            </p>
            <div id="infinite-scroll-sentinel" className="h-4 w-full" />
          </div>
        )}

        {!hasMore && filteredProducts.length > 0 && (
          <div className="py-12 text-center">
            <div className="inline-block px-4 py-2 bg-gray-100 rounded-full text-xs text-gray-500 font-bold uppercase tracking-wider">
              ✨ You've reached the end
            </div>
          </div>
        )}

        {!hasMore && filteredProducts.length === 0 && !isPending && (
          <div className="text-center py-12">
            <FaBox className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No products available to display.
            </p>
          </div>
        )}
      </div>
    );
  }, [filteredProducts, isPending, error, hasMore, isLoadingMore, renderProductCard, loadMoreProducts, refetch]);

  // Render the main content
  const renderContent = useCallback(() => {
    // Handle session recovery or missing data
    // Unified view for Forms (Create, Edit, View)
    if (activeView === 'create' || activeView === 'edit' || activeView === 'view') {
      const itemType = (activeView === 'edit' || activeView === 'view') ? (selectedProduct?.itemType || 'product') : 'product';

      // Handle session recovery or missing data for edit/view
      if ((activeView === 'edit' || activeView === 'view') && !selectedProduct) {
        return (
          <div className="flex flex-col items-center justify-center p-20 bg-white rounded-lg shadow-sm">
            <FaSpinner className="animate-spin text-blue-500 text-3xl mb-4" />
            <p className="text-gray-600 font-medium">Recovering item details...</p>
            <p className="text-xs text-gray-400 mt-2">Checking various catalogs for the requested ID.</p>
          </div>
        );
      }

      let formTitle = '';
      if (activeView === 'view') {
        formTitle = itemType === 'service' ? 'Service Details' : itemType === 'fastfood' ? 'Fast Food Details' : 'Product Details';
      } else if (activeView === 'edit') {
        formTitle = itemType === 'service' ? 'Edit Service' : itemType === 'fastfood' ? 'Edit Fast Food' : 'Edit Product';
      } else {
        formTitle = 'Create New Product';
      }

      return (
        <div className="bg-white rounded-lg shadow-lg h-full max-w-7xl mx-auto w-full flex flex-col overflow-hidden border">
          <div className="flex items-center justify-between p-6 border-b bg-gray-50/50">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                aria-label="Go back"
              >
                <FaArrowLeft className="text-lg text-gray-600" />
              </button>
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  {formTitle}
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  {activeView === 'view' ? 'View comprehensive item information' : 'Manage your product details and settings'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 overflow-auto p-2 md:p-4 scrollbar-thin scrollbar-thumb-gray-200">
            <div className="w-full max-w-5xl ml-0 mr-auto">
              {itemType === 'service' ? (
                <ServiceForm
                  onSuccess={handleFormSuccess}
                  onAfterSave={() => {
                    refetch();
                  }}
                  initialData={selectedProduct}
                  isEditing={activeView === 'edit'}
                  mode={activeView}
                  onEdit={() => handleViewChange('edit', selectedProduct)}
                />
              ) : itemType === 'fastfood' ? (
                <FastFoodForm
                  onSuccess={() => handleFormSuccess({ itemType: 'fastfood' })}
                  onAfterSave={() => {
                    refetch();
                  }}
                  onCancel={handleCloseForm}
                  product={selectedProduct}
                  id={selectedProduct?.id}
                  mode={activeView}
                  onEdit={() => handleViewChange('edit', selectedProduct)}
                />
              ) : (
                <ComradesProductForm
                  onSuccess={handleFormSuccess}
                  onAfterSave={() => {
                    refetch();
                  }}
                  product={activeView === 'create' ? null : selectedProduct}
                  id={activeView === 'create' ? undefined : selectedProduct?.id}
                  mode={activeView}
                  onEdit={() => handleViewChange('edit', selectedProduct)}
                  strictMode={true}
                  taxonomyType="product"
                />
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeView === 'inventory') {
      return <InventoryManagement onBack={handleBack} />;
    }

    if (activeView === 'pricing') {
      return <PricingPromotions onBack={handleBack} />;
    }

    if (activeView === 'analytics') {
      return <ProductAnalytics onBack={handleBack} />;
    }

    if (activeView === 'bulk-actions') {
      return <BulkOperations onBack={handleBack} />;
    }

    if (activeView === 'categories') {
      return (
        <div className="h-full">
          <EnhancedCategories />
        </div>
      );
    }

    if (activeView === 'product-listing') {
      return (
        <ProductListingView
          onBack={handleBack}
          onViewProduct={handleViewChange}
          onListProduct={handleListProduct}
        />
      );
    }

    if (activeView === 'my-products' || activeView === 'list') {
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">
                {activeView === 'my-products' ? 'Super Admin Products' : 'All Products'}
              </h2>
              <p className="text-sm text-gray-500">
                {activeView === 'my-products'
                  ? 'Products added by super admin'
                  : 'Browse all available products'}
              </p>
            </div>
          </div>

          {renderProductGrid()}
        </div>
      );
    }

    return (
      <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <FaBox className="mx-auto text-gray-300 text-5xl mb-4" />
        <h3 className="text-xl font-medium text-gray-900 mb-2">Select a management view</h3>
        <p className="text-gray-500 max-w-sm mx-auto">
          Choose one of the specialized management cards above to start managing your products.
          (DEBUG: view={activeView})
        </p>
      </div>
    );
  }, [
    activeView, selectedProduct, handleBack, handleCloseForm, handleViewChange,
    handleListProduct, renderProductGrid, productStats, productCards
  ]);

  return (
    <div className="h-full flex flex-col min-w-0">
      {!hubVisible && (
        <div className="mb-4 md:mb-6 flex justify-end items-center gap-3">
          <button
            onClick={() => setHubVisible(true)}
            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center text-sm whitespace-nowrap"
            title="Show Product Management Hub"
          >
            <FaList className="mr-2" />
            Show Hub
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-4 md:gap-6 relative min-h-0 min-w-0">
        {/* Product Management Hub - Refactored as Topbar */}
        {hubVisible && (
          <div className="w-full bg-white rounded-lg shadow p-2 md:p-3 sticky top-0 z-10 min-w-0">
            <div className="flex flex-wrap items-center justify-between mb-2 md:mb-3 px-1 md:px-2 gap-2">
              <h3 className="font-bold text-gray-800 text-xl md:text-2xl flex items-center">
                <FaList className="mr-2 text-blue-600" />
                Product Hub
              </h3>
              <div className="flex items-center gap-2 md:gap-6 text-xs md:text-sm">
                <div className="flex gap-2 md:gap-4 flex-wrap">
                  <span className="text-gray-500">Total: <span className="font-bold text-gray-900">{productStats.total}</span></span>
                  <span className="text-gray-500">Active: <span className="font-bold text-green-600">{productStats.active}</span></span>
                  <span className="text-gray-500">Low Stock: <span className="font-bold text-yellow-600">{productStats.lowStock}</span></span>
                </div>
                <button
                  onClick={() => setHubVisible(false)}
                  className="bg-red-50 text-red-600 p-1 rounded-full hover:bg-red-100 transition-colors flex-shrink-0"
                  title="Hide Product Management Hub"
                >
                  <FaTimesCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              </div>
            </div>

            <div className="relative w-full min-w-0">
              {/* Left Arrow */}
              {canScrollLeft && (
                <button
                  onClick={() => scrollHub('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-[5] bg-white/90 shadow-lg border border-gray-200 rounded-full p-2 md:p-2.5 text-blue-600 hover:bg-blue-600 hover:text-white transition-all duration-300 ml-0.5 md:ml-1 opacity-80 md:opacity-0 md:group-hover/nav:opacity-100 flex items-center justify-center transform hover:scale-110 active:scale-95"
                >
                  <FaArrowLeft className="w-3 h-3 md:w-3.5 md:h-3.5" />
                </button>
              )}

              {/* Right Arrow */}
              {canScrollRight && (
                <button
                  onClick={() => scrollHub('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-[5] bg-white/90 shadow-lg border border-gray-200 rounded-full p-2 md:p-2.5 text-blue-600 hover:bg-blue-600 hover:text-white transition-all duration-300 mr-0.5 md:mr-1 opacity-80 md:opacity-0 md:group-hover/nav:opacity-100 flex items-center justify-center transform hover:scale-110 active:scale-95"
                >
                  <FaArrowLeft className="w-3 h-3 md:w-3.5 md:h-3.5 rotate-180" />
                </button>
              )}

              {/* Fade Indicators */}
              <div className={`absolute left-0 top-0 bottom-4 w-12 bg-gradient-to-r from-white via-white/40 to-transparent z-[2] pointer-events-none transition-opacity duration-300 ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`} />
              <div className={`absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-white via-white/40 to-transparent z-[2] pointer-events-none transition-opacity duration-300 ${canScrollRight ? 'opacity-100' : 'opacity-0'}`} />

              <div
                ref={hubScrollRef}
                onScroll={checkScroll}
                className="flex flex-row flex-nowrap overflow-x-auto gap-2 md:gap-4 pb-3 md:pb-4 px-1 scroll-smooth scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-transparent min-w-0"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'thin'
                }}
                onWheel={(e) => {
                  if (e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
              >
                {productCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => handleCardClick(card)}
                    className={`flex-shrink-0 w-[140px] md:w-[170px] flex items-center p-2 md:p-3 rounded-lg border transition-all duration-200 ${(activeView === card.to || (card.to === 'create' && activeView === 'create'))
                      ? 'bg-blue-50 border-blue-500 shadow-md scale-[1.02]'
                      : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md hover:scale-[1.01]'
                      }`}
                  >
                    <div className={`${card.bgColor} p-2 md:p-2.5 rounded-lg mr-2 md:mr-3 shadow-sm flex-shrink-0 text-base md:text-lg`}>
                      {card.icon}
                    </div>
                    <div className="text-left overflow-hidden">
                      <h4 className="font-bold text-gray-800 text-[10px] md:text-xs truncate leading-tight mb-0.5 md:mb-1">{card.title}</h4>
                      <span className="text-[9px] md:text-[11px] text-blue-700 font-bold px-1.5 md:px-2 py-0.5 bg-blue-100/50 rounded-md border border-blue-200/50">
                        {card.action}
                      </span>
                    </div>
                  </button>
                ))}
                <div className="flex-shrink-0 w-4 md:w-8 h-full" aria-hidden="true" />
              </div>
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto w-full pb-10" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          <Suspense
            fallback={(
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
              </div>
            )}
          >
            {renderContent()}
          </Suspense>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, product: null })}
        product={deleteModal.product}
        onConfirm={handleConfirmedDelete}
      />
    </div>
  );
};

export default Products;
