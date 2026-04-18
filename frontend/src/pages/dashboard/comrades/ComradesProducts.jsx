import React, { useState, useEffect, useCallback, useMemo, memo, Suspense } from 'react';
import { resolveImageUrl } from '../../../utils/imageUtils';
import { FALLBACK_IMAGE } from '../../../utils/imageUtils';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Plus, Box, Clock, XCircle, ArrowLeft, Edit, Trash2, Search,
  Loader2, ChevronDown, ChevronUp, PackageSearch, EyeOff, Ban, AlertCircle, RefreshCw
} from 'lucide-react';
import { useToast } from '../../../components/ui/use-toast';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { getSellerProductPrice } from '../../../utils/priceDisplay';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { productExists, getAllProductIds } from '../../../utils/productUtils';
import DeleteConfirmationModal from '../../../components/modals/DeleteConfirmationModal';

// Skeleton component for loading states
const ProductCardSkeleton = memo(() => (
  <Card className="overflow-hidden animate-pulse">
    <div className="p-4">
      <div className="flex justify-between items-start">
        <div className="flex space-x-4">
          <div className="h-20 w-20 flex-shrink-0 bg-gray-200 rounded-md border border-gray-200"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded mb-2 w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded mb-2 w-1/2"></div>
            <div className="h-5 bg-gray-200 rounded w-16"></div>
          </div>
        </div>
        <div className="text-right">
          <div className="h-6 bg-gray-200 rounded mb-2 w-20"></div>
          <div className="flex space-x-1 justify-end">
            <div className="h-6 w-16 bg-gray-200 rounded"></div>
            <div className="h-6 w-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  </Card>
));

// Memoized Product Card Component
const ProductCard = memo(({
  product,
  expandedProductId,
  toggleExpand,
  getStatusVariant,
  onHide,
  onSuspend,
  onUnhide,
  onUnsuspend,
  onDelete
}) => (
  <Card className="overflow-hidden">
    <div className="p-4">
      <div className="flex justify-between items-start">
        <div className="flex space-x-4">
          <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
            <img
              src={resolveImageUrl(product.thumbnail || FALLBACK_IMAGE)}
              alt={product.name}
              className="h-full w-full object-cover object-center"
              loading="lazy"
            />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{product.name}</h3>
            <p className="text-sm text-gray-500">{product.sku}</p>
            {product.seller && (
              <p className="text-xs text-gray-400">
                Seller: {product.seller.name} ({product.seller.email})
              </p>
            )}
            <Badge variant={getStatusVariant(product.status)} className="mt-1">
              {product.status || 'N/A'}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-medium">
            KES {getSellerProductPrice(product).toFixed(2)}
            {product.displayPrice && product.displayPrice > getSellerProductPrice(product) && (
              <span className="ml-2 text-sm text-green-600">
                (Customer: KES {Number(product.displayPrice).toFixed(2)})
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1 justify-end">
            <button className="btn-ghost btn-xs" onClick={() => toggleExpand(product.id)}>
              {expandedProductId === product.id ? '📄 Less' : '📋 More'} Details
              {expandedProductId === product.id ? (
                <ChevronUp className="ml-1 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-1 h-4 w-4" />
              )}
            </button>

            {/* Action buttons based on product status */}
            {product.status === 'active' && (
              <>
                <Link to={`/dashboard/products/comrades/${product.id}/edit`} className="btn btn-xs">
                  <Edit className="h-4 w-4 mr-1" /> ✏️ Edit
                </Link>
                <button
                  className="btn-ghost btn-xs text-gray-600 hover:text-gray-800"
                  onClick={() => onHide && onHide(product.id)}
                  title="Hide product"
                >
                  <EyeOff className="h-4 w-4 mr-1" /> Hide
                </button>
                <button
                  className="btn-ghost btn-xs text-orange-600 hover:text-orange-800"
                  onClick={() => onSuspend && onSuspend(product.id)}
                  title="Suspend product"
                >
                  <Ban className="h-4 w-4 mr-1" /> Suspend
                </button>
              </>
            )}

            {product.status === 'pending' && (
              <>
                <Link to={`/dashboard/products/comrades/${product.id}/edit`} className="btn btn-xs">
                  <Edit className="h-4 w-4 mr-1" /> ✏️ Edit
                </Link>
                <Link to={`/dashboard/products/comrades/list/${product.id}`} className="btn btn-xs">
                  <Box className="h-4 w-4 mr-1" /> 📋 List
                </Link>
              </>
            )}

            {product.status === 'hidden' && (
              <>
                <Link to={`/dashboard/products/comrades/${product.id}/edit`} className="btn btn-xs">
                  <Edit className="h-4 w-4 mr-1" /> ✏️ Edit
                </Link>
                <button
                  className="btn-ghost btn-xs text-green-600 hover:text-green-800"
                  onClick={() => onUnhide && onUnhide(product.id)}
                  title="Unhide product"
                >
                  <EyeOff className="h-4 w-4 mr-1" /> Unhide
                </button>
                <button
                  className="btn-ghost btn-xs text-orange-600 hover:text-orange-800"
                  onClick={() => onSuspend && onSuspend(product.id)}
                  title="Suspend product"
                >
                  <Ban className="h-4 w-4 mr-1" /> Suspend
                </button>
              </>
            )}

            {product.status === 'suspended' && (
              <>
                <Link to={`/dashboard/products/comrades/${product.id}/edit`} className="btn btn-xs">
                  <Edit className="h-4 w-4 mr-1" /> ✏️ Edit
                </Link>
                <button
                  className="btn-ghost btn-xs text-green-600 hover:text-green-800"
                  onClick={() => onUnsuspend && onUnsuspend(product.id)}
                  title="Unsuspend product"
                >
                  <Ban className="h-4 w-4 mr-1" /> Unsuspend
                </button>
                <button
                  className="btn-ghost btn-xs text-gray-600 hover:text-gray-800"
                  onClick={() => onHide && onHide(product.id)}
                  title="Hide product"
                >
                  <EyeOff className="h-4 w-4 mr-1" /> Hide
                </button>
              </>
            )}

            <button
              className="btn-ghost btn-xs text-red-600 hover:text-red-800"
              onClick={() => onDelete && onDelete(product)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> 🗑️ Delete
            </button>
          </div>
        </div>
      </div>
      {expandedProductId === product.id && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Category</p>
              <p>{product.category?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Subcategory</p>
              <p>{product.subcategory?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Base Price (Your Cost)</p>
              <div className="flex items-center">
                <span className="font-medium">KES {getSellerProductPrice(product).toFixed(2)}</span>
                {product.displayPrice && product.displayPrice > getSellerProductPrice(product) && (
                  <span className="ml-2 text-xs text-green-600">
                    (Customer: KES {Number(product.displayPrice).toFixed(2)})
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Stock</p>
              <p>{product.stock || 0} units</p>
            </div>
            {product.seller && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Seller</p>
                <p>{product.seller.name}</p>
                <p className="text-xs text-gray-500">{product.seller.email}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </Card>
));

const ComradesProducts = ({ status: initialStatus }) => {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // State management
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus || 'all');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [showProducts, setShowProducts] = useState(false);
  const [flash, setFlash] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    sortBy: 'newest'
  });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, product: null });

  const PRODUCTS_PER_PAGE = 15;

  // Memoized filtered products for better performance
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(product =>
        product.name?.toLowerCase().includes(searchLower) ||
        product.sku?.toLowerCase().includes(searchLower) ||
        product.seller?.name?.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(product => product.status === statusFilter);
    }

    return filtered;
  }, [products, searchTerm, statusFilter]);

  // Memoized grouped products (recent/older) for performance
  const groupedProducts = useMemo(() => {
    if (filteredProducts.length === 0) {
      return { recent: [], older: [] };
    }

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const recent = filteredProducts.filter(p => new Date(p.createdAt) >= twoWeeksAgo);
    const older = filteredProducts.filter(p => new Date(p.createdAt) < twoWeeksAgo);

    return { recent, older };
  }, [filteredProducts]);

  // Optimized handler functions
  const handleHideProduct = useCallback(async (productId) => {
    try {
      await api.put(`/products/${productId}`, { status: 'hidden' });
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, status: 'hidden' } : p
      ));

      toast({
        title: 'Success',
        description: 'Product hidden successfully',
        variant: 'default'
      });
    } catch (error) {
      console.error('❌ Error hiding product:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to hide product',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const handleSuspendProduct = useCallback(async (productId) => {
    try {
      await api.put(`/products/${productId}`, { status: 'suspended' });
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, status: 'suspended' } : p
      ));

      toast({
        title: 'Success',
        description: 'Product suspended successfully',
        variant: 'default'
      });
    } catch (error) {
      console.error('❌ Error suspending product:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to suspend product',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const handleUnhideProduct = useCallback(async (productId) => {
    try {
      await api.put(`/products/${productId}`, { status: 'active' });
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, status: 'active' } : p
      ));

      toast({
        title: 'Success',
        description: 'Product made visible successfully',
        variant: 'default'
      });
    } catch (error) {
      console.error('❌ Error unhiding product:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to unhide product',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const handleUnsuspendProduct = useCallback(async (productId) => {
    try {
      await api.put(`/products/${productId}`, { status: 'active' });
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, status: 'active' } : p
      ));

      toast({
        title: 'Success',
        description: 'Product unsuspended successfully',
        variant: 'default'
      });
    } catch (error) {
      console.error('❌ Error unsuspending product:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to unsuspend product',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const handleDeleteClick = useCallback((product) => {
    setDeleteModal({ isOpen: true, product });
  }, []);

  const handleConfirmedDelete = async (productId, reason, password) => {
    try {
      const config = { data: { password, reason } };
      await api.delete(`/products/${productId}`, config);

      // Update local state
      setProducts(prev => prev.filter(p => p.id !== productId));

      toast({
        title: 'Success',
        description: 'Product deleted successfully',
        variant: 'default'
      });

      // Background refresh to ensure sync
      fetchProducts(currentPage, true);

    } catch (error) {
      console.error('❌ Error deleting product:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete product',
        variant: 'destructive'
      });
    }
  };

  const toggleExpand = useCallback((productId) => {
    setExpandedProductId(prev => prev === productId ? null : productId);
  }, []);

  const getStatusVariant = useCallback((status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'rejected':
        return 'destructive';
      case 'hidden':
        return 'outline';
      case 'suspended':
        return 'destructive';
      default:
        return 'outline';
    }
  }, []);

  const handleSearchChange = useCallback((e) => setSearchTerm(e.target.value), []);
  const handleFilterChange = useCallback((e) =>
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value })), []);

  // Optimized API call with pagination
  const fetchProducts = useCallback(async (page = 1, refresh = false) => {
    try {
      if (page === 1) {
        setLoading(true);
        setError('');
      } else {
        setIsLoadingMore(true);
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: PRODUCTS_PER_PAGE.toString(),
        search: searchTerm,
        status: statusFilter
      });

      const response = await api.get(`/products/admin?${params}`);

      const newProducts = response.data.products || [];

      if (refresh || page === 1) {
        setProducts(newProducts);
      } else {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueNewProducts = newProducts.filter(p => !existingIds.has(p.id));
          return [...prev, ...uniqueNewProducts];
        });
      }

      setHasMore(newProducts.length === PRODUCTS_PER_PAGE);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products. Please try again.');

      if (err.response?.status === 404) {
        setProducts([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [searchTerm, statusFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    if (showProducts) {
      fetchProducts(1, true);
    }
  }, [searchTerm, statusFilter, filters.sortBy, showProducts, fetchProducts]);

  // Load products when showProducts changes
  useEffect(() => {
    if (showProducts && products.length === 0) {
      fetchProducts();
    }
  }, [showProducts, products.length, fetchProducts]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const nextPage = currentPage + 1;
          setCurrentPage(nextPage);
          fetchProducts(nextPage);
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
  }, [hasMore, isLoadingMore, currentPage, fetchProducts]);

  // Pick up success state from navigation
  useEffect(() => {
    if (location.state?.updated) {
      setFlash({
        message: location.state.message || 'Product updated successfully!',
        changes: Array.isArray(location.state.changes) ? location.state.changes : []
      });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Memoized cards configuration
  const cards = useMemo(() => [
    {
      title: 'Create Product',
      description: 'Add a new product to the platform',
      icon: <Plus className="h-6 w-6 text-green-500" />,
      link: '/dashboard/products/comrades/new',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      title: 'Our Products',
      description: 'View and manage all your products',
      icon: <Box className="h-6 w-6 text-blue-500" />,
      onClick: async () => {
        const newShowState = !showProducts;
        setShowProducts(newShowState);
        if (newShowState && products.length === 0) {
          await fetchProducts();
        }
      },
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      isActive: showProducts
    },
    {
      title: 'Pending Approval',
      description: 'Products waiting for admin approval',
      icon: <Clock className="h-6 w-6 text-yellow-500" />,
      link: '/dashboard/products/comrades/pending',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
    },
    {
      title: 'Rejected Products',
      description: 'Products that need revision',
      icon: <XCircle className="h-6 w-6 text-red-500" />,
      link: '/dashboard/products/comrades/rejected',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
  ], [showProducts, products.length, fetchProducts]);

  const isRootPath = location.pathname === '/dashboard/products/comrades';

  return (
    <div className="p-2 sm:p-6">
      {flash && (
        <div className="mb-4 p-4 border-l-4 border-green-500 bg-green-50 rounded">
          <div className="font-semibold text-green-800">{flash.message}</div>
          {flash.changes.length > 0 && (
            <div className="mt-2">
              <div className="text-sm font-medium text-green-900 mb-2">Changes made</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-green-900">
                      <th className="py-1 pr-4">Field</th>
                      <th className="py-1 pr-4">Before</th>
                      <th className="py-1">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flash.changes.map((c, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-1 pr-4 font-medium">{c.field}</td>
                        <td className="py-1 pr-4 text-green-900/80 whitespace-pre-wrap break-words">{String(c.oldValue ?? '—')}</td>
                        <td className="py-1 text-green-900 whitespace-pre-wrap break-words">{String(c.newValue ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Cards */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.history.back()}
              className="h-8 w-8 p-0"
              title="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, index) => (
              <div key={index} className="block" onClick={card.onClick}>
                <Link to={card.onClick ? '#' : card.link} className="block">
                  <Card className={`p-6 border-2 ${card.borderColor} ${card.bgColor} hover:shadow-md transition-shadow h-full ${card.onClick ? 'cursor-pointer' : ''} ${card.isActive ? 'ring-2 ring-blue-500' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-lg">{card.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{card.description}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-white bg-opacity-50">
                        {card.icon}
                      </div>
                    </div>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Products Modal */}
      {showProducts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b p-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Our Products</h2>
              <div className="flex space-x-2">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setShowProducts(false)}
                >
                  ✕ Close
                </button>
                <button
                  className="btn-comrades btn-sm"
                  onClick={() => window.location.href = '/dashboard/products/comrades/new'}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Product
                </button>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="p-4 border-b">
              <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="pl-8 w-full border rounded p-2 text-sm"
                  />
                </div>
                <select
                  name="status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border rounded p-2 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="hidden">Hidden</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select
                  name="sortBy"
                  value={filters.sortBy}
                  onChange={handleFilterChange}
                  className="border rounded p-2 text-sm"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="name_desc">Name (Z-A)</option>
                  <option value="price_asc">Price (Low to High)</option>
                  <option value="price_desc">Price (High to Low)</option>
                </select>
              </div>
            </div>

            {/* Products List */}
            <div className="flex-1 overflow-auto p-4">
              {/* Loading State */}
              {loading && products.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {[...Array(6)].map((_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">Loading products...</span>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="space-y-4 p-4">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error Loading Products</AlertTitle>
                    <AlertDescription>
                      {error}
                    </AlertDescription>
                  </Alert>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError('');
                      fetchProducts(1, true);
                    }}
                    className="mt-4"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && filteredProducts.length === 0 && (
                <div className="text-center py-12">
                  <PackageSearch className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {searchTerm || statusFilter !== 'all'
                      ? 'Try adjusting your search or filter to find what you\'re looking for.'
                      : 'Get started by adding a new product.'}
                  </p>
                  <div className="mt-6">
                    <Link to="/dashboard/products/comrades/new">
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Product
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {/* Products List */}
              {filteredProducts.length > 0 && (
                <div className="space-y-6">
                  {/* Recently Added Products */}
                  {groupedProducts.recent.length > 0 && (
                    <div>
                      <div className="flex items-center mb-4 pb-2 border-b-2 border-green-500">
                        <div className="bg-green-100 p-2 rounded-lg mr-3">
                          <Clock className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Recently Added</h3>
                          <p className="text-sm text-gray-500">Products added within the last 2 weeks ({groupedProducts.recent.length})</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <Suspense fallback={<ProductCardSkeleton />}>
                          {groupedProducts.recent.map((product) => (
                            <ProductCard
                              key={product.id}
                              product={product}
                              expandedProductId={expandedProductId}
                              toggleExpand={toggleExpand}
                              getStatusVariant={getStatusVariant}
                              onHide={handleHideProduct}
                              onSuspend={handleSuspendProduct}
                              onDelete={handleDeleteClick}
                            />
                          ))}
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* Other Products */}
                  {groupedProducts.older.length > 0 && (
                    <div>
                      <div className="flex items-center mb-4 pb-2 border-b-2 border-blue-500">
                        <div className="bg-blue-100 p-2 rounded-lg mr-3">
                          <Box className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Other Products</h3>
                          <p className="text-sm text-gray-500">Products added more than 2 weeks ago ({groupedProducts.older.length})</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <Suspense fallback={<ProductCardSkeleton />}>
                          {groupedProducts.older.map((product) => (
                            <ProductCard
                              key={product.id}
                              product={product}
                              expandedProductId={expandedProductId}
                              toggleExpand={toggleExpand}
                              getStatusVariant={getStatusVariant}
                              onHide={handleHideProduct}
                              onSuspend={handleSuspendProduct}
                              onDelete={handleDeleteClick}
                            />
                          ))}
                        </Suspense>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Infinite Scroll Sentinel */}
              {hasMore && !loading && !error && (
                <div id="infinite-scroll-sentinel" className="h-10 flex items-center justify-center mt-6">
                  {isLoadingMore ? (
                    <div className="flex space-x-2">
                      <ProductCardSkeleton />
                      <ProductCardSkeleton />
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const nextPage = currentPage + 1;
                        setCurrentPage(nextPage);
                        fetchProducts(nextPage);
                      }}
                    >
                      <Loader2 className="mr-2 h-4 w-4" />
                      Load More Products
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Outlet />
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, product: null })}
        product={deleteModal.product}
        onConfirm={handleConfirmedDelete}
      />
    </div>
  );
};

export default ComradesProducts;
