import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveImageUrl, FALLBACK_IMAGE } from '../../../utils/imageUtils';
import { FaBox, FaExclamationTriangle, FaCheckCircle, FaTimesCircle, FaArrowLeft as FaBack, FaEdit, FaSave, FaTimes, FaFilter, FaSearch, FaSync, FaEnvelope, FaPaperPlane, FaUtensils } from 'react-icons/fa';
import { adminApi, productApi } from '../../../services/api';
import debounce from 'lodash/debounce'; // kept for any future debounce usage
import { Edit, Eye, EyeOff, Trash2, Clock, Ban, Utensils, CheckSquare, Loader2, Check, CheckCircle } from 'lucide-react';
import { fastFoodService } from '../../../services/fastFoodService';
import AdminPasswordDialog from '../../../components/AdminPasswordDialog';
import ConfirmationDialog from '../../../components/ConfirmationDialog';

import { useAuth } from '../../../contexts/AuthContext';


const ITEMS_PER_PAGE = 10;

const getInventoryItemImage = (item) => item.coverImage || item.mainImage || item.image || item.images?.[0] || FALLBACK_IMAGE;

const normalizeLegacyProductItem = (product) => ({
  ...product,
  itemType: 'product',
  stockTracked: true,
  stock: Number(product.stock || 0),
  lowStockThreshold: Number(product.lowStockThreshold || 5),
  seller: product.seller || null,
  coverImage: product.coverImage || product.images?.[0] || null,
  images: Array.isArray(product.images)
    ? product.images
    : [product.coverImage, ...(Array.isArray(product.galleryImages) ? product.galleryImages : [])].filter(Boolean)
});

const normalizeLegacyFastFoodItem = (item) => ({
  ...item,
  itemType: 'fastfood',
  stockTracked: false,
  stock: null,
  lowStockThreshold: null,
  seller: item.vendorDetail || null,
  mainImage: item.mainImage || item.galleryImages?.[0] || null,
  images: [item.mainImage, ...(Array.isArray(item.galleryImages) ? item.galleryImages : [])].filter(Boolean)
});

const computeOverviewFromItems = (items) => {
  const trackedItems = items.filter(item => item.stockTracked);
  const untrackedItems = items.filter(item => !item.stockTracked);

  return trackedItems.reduce((overview, item) => {
    if (item.stock === 0) {
      overview.outOfStock += 1;
    } else if (item.stock <= item.lowStockThreshold) {
      overview.lowStock += 1;
    } else {
      overview.inStock += 1;
    }

    overview.totalProducts = trackedItems.length + untrackedItems.length;
    overview.totalTracked = trackedItems.length;
    overview.stockUntracked = untrackedItems.length;
    overview.fastFoodItems = untrackedItems.filter(entry => entry.itemType === 'fastfood').length;
    return overview;
  }, {
    totalProducts: items.length,
    totalTracked: trackedItems.length,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0,
    stockUntracked: untrackedItems.length,
    fastFoodItems: untrackedItems.filter(entry => entry.itemType === 'fastfood').length
  });
};

const sortInventoryItems = (items, sortBy, sortOrder) => {
  const direction = sortOrder === 'desc' ? -1 : 1;
  return [...items].sort((left, right) => {
    if (sortBy === 'stock') {
      const leftValue = left.stockTracked ? Number(left.stock || 0) : Number.MAX_SAFE_INTEGER;
      const rightValue = right.stockTracked ? Number(right.stock || 0) : Number.MAX_SAFE_INTEGER;
      return (leftValue - rightValue) * direction;
    }

    if (sortBy === 'dateAdded') {
      const leftValue = new Date(left.createdAt || 0).getTime();
      const rightValue = new Date(right.createdAt || 0).getTime();
      return (leftValue - rightValue) * direction;
    }

    return String(left.name || '').localeCompare(String(right.name || '')) * direction;
  });
};

const filterInventoryItems = (items, filters) => {
  const searchTerm = String(filters.search || '').trim().toLowerCase();

  return items.filter((item) => {
    // Strict item type isolation
    if (filters.itemType !== 'all') {
      if (item.itemType !== filters.itemType) {
        return false;
      }
    }

    if (searchTerm) {
      const sellerName = item.seller?.name || '';
      const matchesSearch = [item.name, sellerName, item.id].some((value) => String(value || '').toLowerCase().includes(searchTerm));
      if (!matchesSearch) {
        return false;
      }
    }

    if (filters.stockStatus === 'untracked') {
      return !item.stockTracked;
    }

    if (!item.stockTracked) {
      return filters.stockStatus === 'all';
    }

    if (filters.stockStatus === 'inStock') {
      return item.stock > item.lowStockThreshold;
    }

    if (filters.stockStatus === 'lowStock') {
      return item.stock > 0 && item.stock <= item.lowStockThreshold;
    }

    if (filters.stockStatus === 'outOfStock') {
      return item.stock === 0;
    }

    return true;
  });
};

const InventoryManagement = ({ onBack }) => {
  const navigate = useNavigate();
  const [inventoryData, setInventoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ stock: '', lowStockThreshold: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState({
    itemType: 'product', // all, product, fastfood
    search: '',
    stockStatus: 'all', // all, inStock, lowStock, outOfStock
    sortBy: 'name', // name, stock, dateAdded
    sortOrder: 'asc' // asc, desc
  });

  const [passwordDialog, setPasswordDialog] = useState({
    isOpen: false,
    actionDescription: '',
    requiresReason: false,
    reasonLabel: 'Reason',
    onConfirm: null
  });

  const [expandedRows, setExpandedRows] = useState([]);
  const [confirmationDialog, setConfirmationDialog] = useState({
    isOpen: false,
    success: true,
    title: '',
    message: ''
  });

  const [products, setProducts] = useState([]);
  const [allInventoryItems, setAllInventoryItems] = useState([]);
  const [usingLegacyInventoryFallback, setUsingLegacyInventoryFallback] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  const requirePassword = (actionDescription, requiresReason = false, reasonLabel = 'Reason') => {
    return new Promise((resolve, reject) => {
      setPasswordDialog({
        isOpen: true,
        actionDescription,
        requiresReason,
        reasonLabel,
        onConfirm: resolve,
        onCancel: reject
      });
    });
  };

  const handleFFOptimisticUpdate = async (item, updates, successMsg, errorMsg) => {
    const itemName = item.name;
    let actionDesc = '';
    let requiresReason = false;
    let reasonLabel = 'Reason';

    if (updates.isActive === false) {
      actionDesc = `Suspend/Hide "${itemName}"`;
      requiresReason = true;
      reasonLabel = 'Reason for suspension';
    } else if (updates.isActive === true) {
      actionDesc = `Activate/Show "${itemName}"`;
    } else if (updates.availabilityMode) {
      actionDesc = `Set "${itemName}" to ${updates.availabilityMode} mode`;
    } else {
      actionDesc = `Update "${itemName}"`;
    }

    let reason = '';
    try {
      reason = await requirePassword(actionDesc, requiresReason, reasonLabel);
    } catch {
      return; // User cancelled
    }

    const previousProducts = products;
    const previousAllItems = allInventoryItems;

    // Update local state optimistically
    const updateFn = prev => prev.map(f => f.id === item.id ? { ...f, ...updates } : f);
    setProducts(updateFn);
    setAllInventoryItems(updateFn);

    try {
      const payload = reason ? { ...updates, reason } : updates;
      await fastFoodService.updateFastFood(item.id, payload);
      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: 'Success',
        message: successMsg || `"${itemName}" updated successfully.`
      });
    } catch (err) {
      setProducts(previousProducts); // Rollback
      setAllInventoryItems(previousAllItems);
      setConfirmationDialog({
        isOpen: true,
        success: false,
        title: 'Action Failed',
        message: errorMsg || err.message || `Failed to update "${itemName}".`
      });
    }
  };

  const handleFFDelete = async (item) => {
    let reason = '';
    try {
      reason = await requirePassword(`Delete "${item.name}" permanently`, true, 'Reason for deletion');
    } catch {
      return;
    }

    const previousProducts = products;
    const previousAllItems = allInventoryItems;

    const filterFn = prev => prev.filter(f => f.id !== item.id);
    setProducts(filterFn);
    setAllInventoryItems(filterFn);

    try {
      await fastFoodService.deleteFastFood(item.id, reason);
      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: 'Deleted',
        message: `"${item.name}" has been deleted.`
      });
    } catch (err) {
      setProducts(previousProducts);
      setAllInventoryItems(previousAllItems);
      setConfirmationDialog({
        isOpen: true,
        success: false,
        title: 'Delete Failed',
        message: err.message || 'Failed to delete item.'
      });
    }
  };

  // Bulk Actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAvailabilityMode, setBulkAvailabilityMode] = useState('AUTO');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Handle individual selection
  const handleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Handle select all for current filtered list
  const handleSelectAll = (items) => {
    const fastFoodItems = items.filter(item => !item.stockTracked);
    if (selectedIds.length === fastFoodItems.length && fastFoodItems.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(fastFoodItems.map(item => item.id));
    }
  };

  // Bulk operation logic
  const handleBulkAction = async (action) => {
    if (selectedIds.length === 0) return;

    const itemsToProcess = products.filter(item => selectedIds.includes(item.id));
    const count = selectedIds.length;
    const itemWord = count === 1 ? 'item' : 'items';

    const actionDescriptions = {
      delete: `Delete ${count} ${itemWord}`,
      hide: `Hide ${count} ${itemWord} from menu`,
      show: `Show ${count} ${itemWord} on menu`,
      suspend: `Suspend ${count} ${itemWord}`,
      unsuspend: `Unsuspend ${count} ${itemWord}`
    };

    const requiresReason = action === 'delete' || action === 'suspend';
    const reasonLabel = action === 'delete' ? 'Reason for deletion' : 'Reason for suspension';

    let reason = '';
    try {
      reason = await requirePassword(
        actionDescriptions[action] || `Perform "${action}" on ${count} ${itemWord}`,
        requiresReason,
        reasonLabel
      );
    } catch {
      return; // User cancelled
    }

    if (action === 'delete') {
      setBulkLoading(true);
      try {
        await Promise.all(itemsToProcess.map(item => fastFoodService.deleteFastFood(item.id, reason)));
        setConfirmationDialog({
          isOpen: true,
          success: true,
          title: 'Bulk Delete Successful',
          message: `Successfully deleted ${selectedIds.length} item(s).`
        });
        setSelectedIds([]);
        loadInitialData(); // Refresh list to remove deleted items completely from state
      } catch (err) {
        setConfirmationDialog({
          isOpen: true,
          success: false,
          title: 'Bulk Delete Failed',
          message: err.message || 'Failed to delete some items. Please try again.'
        });
      } finally {
        setBulkLoading(false);
      }
      return;
    }

    // Optimistic Update for other actions
    setBulkLoading(true);
    const previousProducts = products;
    const previousAllItems = allInventoryItems;

    let updates = {};
    if (action === 'hide') updates = { isActive: false };
    else if (action === 'show') updates = { isActive: true };
    else if (action === 'suspend') updates = { status: 'suspended' }; // Uses status for backend, though in UI we might rely on isActive
    else if (action === 'unsuspend') updates = { status: 'active' };

    const updateFn = prev => prev.map(f =>
      selectedIds.includes(f.id) ? { ...f, ...updates } : f
    );
    setProducts(updateFn);
    setAllInventoryItems(updateFn);

    try {
      const promises = selectedIds.map(id => {
        const payload = (action === 'suspend' && reason) ? { ...updates, reason } : updates;
        return fastFoodService.updateFastFood(id, payload);
      });
      await Promise.all(promises);

      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: `Bulk ${action.charAt(0).toUpperCase() + action.slice(1)} Successful`,
        message: `Successfully acted on ${selectedIds.length} item(s).`
      });
      setSelectedIds([]);
    } catch (err) {
      setProducts(previousProducts);
      setAllInventoryItems(previousAllItems);
      setConfirmationDialog({
        isOpen: true,
        success: false,
        title: `Bulk Action Failed`,
        message: err.message || `Failed to ${action} some items.`
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkAvailabilityMode = async () => {
    if (selectedIds.length === 0) return;
    try {
      await requirePassword(`Change availability mode to ${bulkAvailabilityMode} for ${selectedIds.length} items`);
    } catch {
      return;
    }

    setBulkLoading(true);
    const previousProducts = products;
    const previousAllItems = allInventoryItems;

    const updateFn = prev => prev.map(f =>
      selectedIds.includes(f.id) ? { ...f, availabilityMode: bulkAvailabilityMode } : f
    );
    setProducts(updateFn);
    setAllInventoryItems(updateFn);

    try {
      await Promise.all(selectedIds.map(id => fastFoodService.updateFastFood(id, { availabilityMode: bulkAvailabilityMode })));
      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: 'Mode Updated',
        message: `Successfully set ${selectedIds.length} items to ${bulkAvailabilityMode}.`
      });
      setSelectedIds([]);
    } catch (err) {
      setProducts(previousProducts);
      setAllInventoryItems(previousAllItems);
      setConfirmationDialog({
        isOpen: true,
        success: false,
        title: 'Bulk Update Failed',
        message: err.message || 'Failed to apply availability mode.'
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // Contact Seller State
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedSellerForContact, setSelectedSellerForContact] = useState(null);
  const [contactMessage, setContactMessage] = useState('');

  const hasLoadedInitialDataRef = useRef(false);
  const initialLoadCompleteRef = useRef(false);
  const prevFiltersRef = useRef(null);
  const filterDebounceRef = useRef(null);

  useEffect(() => {
    // Guard duplicate initial fetches in React.StrictMode dev mounts.
    if (hasLoadedInitialDataRef.current) return;
    hasLoadedInitialDataRef.current = true;
    loadInitialData();
  }, []);

  useEffect(() => {
    // Skip until initial load is done
    if (!initialLoadCompleteRef.current) return;

    // Also skip if filters haven't actually changed (prevents re-run after initial load)
    const prev = prevFiltersRef.current;
    const filtersKey = JSON.stringify(filters);
    if (prev === filtersKey) return;
    prevFiltersRef.current = filtersKey;

    // Debounce - immediate for itemType changes, delayed for search
    const delay = prev !== null && filters.search !== JSON.parse(prev || '{}').search ? 400 : 0;
    clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      setProducts([]);
      loadProducts(1);
    }, delay);

    return () => clearTimeout(filterDebounceRef.current);
  }, [filters]);

  const applyClientInventoryPage = useCallback((items, nextFilters, page) => {
    const filtered = sortInventoryItems(filterInventoryItems(items, nextFilters), nextFilters.sortBy, nextFilters.sortOrder);
    const offset = (page - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(offset, offset + ITEMS_PER_PAGE);

    setProducts(paginated);
    setHasMore(offset + ITEMS_PER_PAGE < filtered.length);
    setCurrentPage(page);
  }, []);

  const loadLegacyInventorySnapshot = useCallback(async () => {
    const [productsResponse, fastFoodResponse] = await Promise.all([
      productApi.getAllAdmin({ page: 1, limit: 5000, withSeller: true }),
      productApi.get('/fastfood', { params: { page: 1, limit: 5000, includeInactive: 'true' } })
    ]);

    const legacyProducts = (productsResponse.data.products || []).map(normalizeLegacyProductItem);
    const fastFoodRows = Array.isArray(fastFoodResponse.data?.data)
      ? fastFoodResponse.data.data
      : Array.isArray(fastFoodResponse.data)
        ? fastFoodResponse.data
        : [];
    const legacyFastFoods = fastFoodRows.map(normalizeLegacyFastFoodItem);

    return [...legacyProducts, ...legacyFastFoods];
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      try {
        const [overviewRes, alertsRes, itemsResponse] = await Promise.all([
          adminApi.getInventoryOverview(),
          adminApi.getLowStockAlerts(),
          adminApi.getInventoryItems({
            page: 1,
            limit: ITEMS_PER_PAGE,
            itemType: filters.itemType,
            search: filters.search,
            stockStatus: filters.stockStatus === 'all' ? undefined : filters.stockStatus,
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder
          })
        ]);

        setUsingLegacyInventoryFallback(false);
        setAllInventoryItems([]);
        setInventoryData({
          overview: overviewRes.data.overview,
          alerts: alertsRes.data
        });

        const initialProducts = itemsResponse.data.items || [];
        setProducts(initialProducts);
        setHasMore((itemsResponse.data.pagination?.currentPage || 1) < (itemsResponse.data.pagination?.totalPages || 1));
        setCurrentPage(1);
      } catch (endpointError) {
        if (endpointError?.response?.status !== 404) {
          throw endpointError;
        }

        const [alertsRes, legacyItems] = await Promise.all([
          adminApi.getLowStockAlerts(),
          loadLegacyInventorySnapshot()
        ]);

        setUsingLegacyInventoryFallback(true);
        setAllInventoryItems(legacyItems);
        setInventoryData({
          overview: computeOverviewFromItems(legacyItems),
          alerts: alertsRes.data
        });
        // Filter legacy items by active itemType to prevent mixing
        const filteredLegacy = filters.itemType === 'all'
          ? legacyItems
          : legacyItems.filter(item => item.itemType === filters.itemType);
        applyClientInventoryPage(filteredLegacy, filters, 1);
      }
    } catch (err) {
      setError('Failed to load inventory data');
      console.error('Inventory load error:', err);
    } finally {
      setLoading(false);
      // Mark initial load complete so filter-change effect can now run
      initialLoadCompleteRef.current = true;
    }
  };

  const loadProducts = async (page) => {
    try {
      if (usingLegacyInventoryFallback) {
        // Filter by itemType to strictly isolate the two tables even in legacy mode
        const scopedItems = filters.itemType === 'all'
          ? allInventoryItems
          : allInventoryItems.filter(item => item.itemType === filters.itemType);
        applyClientInventoryPage(scopedItems, filters, page);
        return;
      }

      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = {
        page,
        limit: ITEMS_PER_PAGE,
        itemType: filters.itemType,
        search: filters.search,
        stockStatus: filters.stockStatus === 'all' ? undefined : filters.stockStatus,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      };

      const response = await adminApi.getInventoryItems(params);
      const newProducts = response.data.items || [];

      setProducts(prev => page === 1 ? newProducts : [...prev, ...newProducts]);
      setHasMore((response.data.pagination?.currentPage || page) < (response.data.pagination?.totalPages || page));
      setCurrentPage(page);
    } catch (err) {
      if (err?.response?.status === 404) {
        try {
          const legacyItems = allInventoryItems.length > 0 ? allInventoryItems : await loadLegacyInventorySnapshot();
          setUsingLegacyInventoryFallback(true);
          setAllInventoryItems(legacyItems);
          setInventoryData(prev => ({
            ...prev,
            overview: computeOverviewFromItems(legacyItems),
            alerts: prev?.alerts || []
          }));
          // Filter by itemType to prevent mixing in fallback
          const scopedLegacy = filters.itemType === 'all'
            ? legacyItems
            : legacyItems.filter(item => item.itemType === filters.itemType);
          applyClientInventoryPage(scopedLegacy, filters, page);
          return;
        } catch (fallbackError) {
          setError('Failed to load products');
          console.error('Products load error:', fallbackError);
        }
      } else {
        setError('Failed to load products');
        console.error('Products load error:', err);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadProducts(currentPage + 1);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const resetFilters = () => {
    setFilters({
      itemType: filters.itemType, // Keep the current tab
      search: '',
      stockStatus: 'all',
      sortBy: 'name',
      sortOrder: 'asc'
    });
  };

  const handleEditStock = (product, variantKey = null, optionName = null) => {
    if (!product.stockTracked) return;
    
    let currentStock = product.stock || 0;
    if (variantKey && optionName && product.variants) {
      const variant = product.variants.find(v => v.variantKey === variantKey || v.id === variantKey);
      if (variant && variant.optionDetails?.[optionName]) {
        currentStock = variant.optionDetails[optionName].stock || 0;
      }
    }

    setEditingProduct({
      ...product,
      variantKey,
      optionName
    });
    
    setEditForm({
      stock: currentStock,
      lowStockThreshold: product.lowStockThreshold || 5
    });
  };

  const { user: currentUser } = useAuth();

  const handleSaveStock = async () => {
    if (!editingProduct) return;

    try {
      const isOwnProduct = editingProduct.seller?.id === currentUser?.id;
      const isAdmin = ['superadmin', 'super_admin', 'admin'].includes(String(currentUser?.role || '').toLowerCase());

      if (!isOwnProduct && !isAdmin) {
        setError('You can only update stock for your own products');
        return;
      }

      const updatePayload = {
        ...editForm,
        variantKey: editingProduct.variantKey,
        optionName: editingProduct.optionName
      };

      await adminApi.updateStockLevels(editingProduct.id, updatePayload);
      setEditingProduct(null);

      // Refresh data to show aggregated total and updated variant stock
      loadProducts(currentPage);
      
      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: 'Stock Updated',
        message: 'Inventory levels updated successfully.'
      });
    } catch (err) {
      setError('Failed to update stock levels');
      console.error('Update stock error:', err);
    }
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setEditForm({ stock: '', lowStockThreshold: '' });
  };

  const handleSendContactMessage = async () => {
    if (!selectedSellerForContact || !contactMessage.trim()) {
      alert('Please enter a message');
      return;
    }

    setIsSendingReminder(true);
    try {
      await adminApi.notifySellerForProduct(selectedSellerForContact.productId, {
        type: 'CUSTOM_MESSAGE',
        title: `Admin Message regarding ${selectedSellerForContact.productName}`,
        message: contactMessage
      });

      alert('Message sent successfully!');
      setIsContactModalOpen(false);
      setContactMessage('');
      setSelectedSellerForContact(null);
    } catch (err) {
      setError('Failed to send message');
      console.error('Send message error:', err);
    } finally {
      setIsSendingReminder(false);
    }
  };

  // Deprecated: Old handleSendReminder replaced by contact modal
  // const handleSendReminder = async (product) => { ... }

  const renderStockStatus = (stock, threshold) => {
    if (stock === null || threshold === null || stock === undefined) return 'Not Tracked';
    if (stock === 0) return 'Out of Stock';
    if (stock <= threshold) return 'Low Stock';
    return 'In Stock';
  };

  const getStatusClass = (stock, threshold) => {
    if (stock === null || threshold === null || stock === undefined) return 'bg-slate-100 text-slate-700';
    if (stock === 0) return 'bg-red-100 text-red-800';
    if (stock <= threshold) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6 h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button onClick={onBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
              <FaBack className="text-lg text-gray-500" />
            </button>
            <div>
              <h2 className="text-xl md:text-2xl font-semibold">Inventory Management</h2>
              <p className="text-sm text-gray-500">Track and update product stock levels</p>
            </div>
          </div>
        </div>
        <div className="text-center py-12">
          <FaTimesCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Error Loading Inventory</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button onClick={loadInitialData} className="mt-4 btn">Try Again</button>
        </div>
      </div>
    );
  }

  // Guard against null data if loading is false but data isn't ready
  if (!inventoryData) {
    return (
      <div className="bg-white rounded-lg shadow p-6 h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const { overview, alerts } = inventoryData;

  return (
    <div className="w-full h-full p-0 sm:p-6 overflow-y-auto pb-32">
      <div className={`hidden md:block p-3 md:p-4 rounded-xl mb-4 md:mb-8 transition-colors duration-500 border-l-4 ${filters.itemType === 'fastfood' ? 'bg-orange-50 border-orange-500' : 'bg-blue-50 border-blue-500'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={onBack} className="mr-4 p-2 rounded-full hover:bg-white/50 transition-colors">
              <FaBack className={`text-lg ${filters.itemType === 'fastfood' ? 'text-orange-600' : 'text-blue-600'}`} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                {filters.itemType === 'fastfood' ? (
                  <FaUtensils className="text-2xl text-orange-600" />
                ) : (
                  <FaBox className="text-2xl text-blue-600" />
                )}
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">
                  {filters.itemType === 'fastfood' ? 'Fast Food Inventory' : 'Product Inventory'}
                </h2>
                <span className={`ml-2 px-2 py-0.5 text-xs font-bold uppercase rounded-full ${filters.itemType === 'fastfood' ? 'bg-orange-200 text-orange-800' : 'bg-blue-200 text-blue-800'}`}>
                  {filters.itemType}
                </span>
              </div>
              <p className="text-sm text-gray-600 font-medium">
                {filters.itemType === 'fastfood'
                  ? 'Manage your food menu, availability, and active items'
                  : 'Track stock levels, set thresholds, and manage regular products'}
              </p>
            </div>
          </div>
          <button onClick={loadInitialData} className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50 transition-colors">
            <FaSync className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stock Overview Cards */}
      <div className="hidden md:grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {filters.itemType !== 'fastfood' ? (
          <>
            <div
              onClick={() => setFilters(prev => ({ ...prev, stockStatus: prev.stockStatus === 'inStock' ? 'all' : 'inStock' }))}
              className={`rounded-lg p-4 cursor-pointer transition-all duration-200 border-2 ${filters.stockStatus === 'inStock' ? 'bg-green-100 border-green-500 scale-105 shadow-md' : 'bg-green-50 border-transparent hover:border-green-200 hover:shadow-sm'}`}
            >
              <div className="flex items-center">
                <FaCheckCircle className="text-green-600 text-2xl mr-3" />
                <div>
                  <div className="text-2xl font-bold text-green-600">{overview.inStock}</div>
                  <div className="text-sm text-gray-600 text-xs font-bold uppercase">Standard In Stock</div>
                </div>
              </div>
            </div>

            <div
              onClick={() => setFilters(prev => ({ ...prev, stockStatus: prev.stockStatus === 'lowStock' ? 'all' : 'lowStock' }))}
              className={`rounded-lg p-4 cursor-pointer transition-all duration-200 border-2 ${filters.stockStatus === 'lowStock' ? 'bg-yellow-100 border-yellow-500 scale-105 shadow-md' : 'bg-yellow-50 border-transparent hover:border-yellow-200 hover:shadow-sm'}`}
            >
              <div className="flex items-center">
                <FaExclamationTriangle className="text-yellow-600 text-2xl mr-3" />
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{overview.lowStock}</div>
                  <div className="text-sm text-gray-600 text-xs font-bold uppercase">Standard Low Stock</div>
                </div>
              </div>
            </div>

            <div
              onClick={() => setFilters(prev => ({ ...prev, stockStatus: prev.stockStatus === 'outOfStock' ? 'all' : 'outOfStock' }))}
              className={`rounded-lg p-4 cursor-pointer transition-all duration-200 border-2 ${filters.stockStatus === 'outOfStock' ? 'bg-red-100 border-red-500 scale-105 shadow-md' : 'bg-red-50 border-transparent hover:border-red-200 hover:shadow-sm'}`}
            >
              <div className="flex items-center">
                <FaTimesCircle className="text-red-600 text-2xl mr-3" />
                <div>
                  <div className="text-2xl font-bold text-red-600">{overview.outOfStock}</div>
                  <div className="text-sm text-gray-600 text-xs font-bold uppercase">Standard Out Stock</div>
                </div>
              </div>
            </div>

            <div
              onClick={() => setFilters(prev => ({ ...prev, stockStatus: 'all' }))}
              className={`rounded-lg p-4 cursor-pointer transition-all duration-200 border-2 ${filters.stockStatus === 'all' && filters.itemType === 'product' ? 'bg-blue-100 border-blue-500 scale-105 shadow-md' : 'bg-blue-50 border-transparent hover:border-blue-200 hover:shadow-sm'}`}
            >
              <div className="flex items-center">
                <FaBox className="text-blue-600 text-2xl mr-3" />
                <div>
                  <div className="text-2xl font-bold text-blue-600">{overview.totalTracked}</div>
                  <div className="text-sm text-gray-600 text-xs font-bold uppercase">Total Tracked Products</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Fast Food Specific Cards */}
            <div className={`col-span-1 md:col-span-2 rounded-lg p-4 bg-orange-50 border-2 border-orange-500 shadow-md`}>
              <div className="flex items-center">
                <FaUtensils className="text-orange-600 text-2xl mr-3" />
                <div>
                  <div className="text-2xl font-bold text-orange-600">{overview.fastFoodItems}</div>
                  <div className="text-sm text-gray-600 text-xs font-bold uppercase">Active Menu Items</div>
                </div>
              </div>
            </div>
            <div className={`col-span-1 md:col-span-3 rounded-lg p-4 bg-gray-50 border-2 border-transparent border-dashed`}>
              <div className="flex items-center">
                <FaExclamationTriangle className="text-gray-400 text-2xl mr-3" />
                <div>
                  <div className="text-lg font-semibold text-gray-600 underline decoration-orange-300">Fast Food Isolation Mode</div>
                  <div className="text-sm text-gray-500">Numerical stock tracking is disabled for menu items. Monitor availability instead.</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className={`p-1 bg-gray-200/50 rounded-2xl mb-8 w-fit flex gap-1 border border-gray-200 shadow-inner`}>
        <button
          onClick={() => {
            setFilters(prev => ({ ...prev, itemType: 'product' }));
            setCurrentPage(1);
            setProducts([]);
          }}
          className={`px-8 py-3 text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-3 ${filters.itemType === 'product'
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105'
            : 'text-gray-500 hover:text-gray-700 hover:bg-white/80'
            }`}
        >
          <FaBox className={filters.itemType === 'product' ? 'text-white' : 'text-gray-400'} />
          STAFF PRODUCTS
        </button>
        <button
          onClick={() => {
            setFilters(prev => ({ ...prev, itemType: 'fastfood' }));
            setCurrentPage(1);
            setProducts([]);
          }}
          className={`px-8 py-3 text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-3 ${filters.itemType === 'fastfood'
            ? 'bg-orange-600 text-white shadow-lg shadow-orange-200 scale-105'
            : 'text-gray-500 hover:text-gray-700 hover:bg-white/80'
            }`}
        >
          <FaUtensils className={filters.itemType === 'fastfood' ? 'text-white' : 'text-gray-400'} />
          FAST FOOD MENU
        </button>
      </div>
      {/* Product List with Filters */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <div className="w-full sm:w-1/3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaSearch className="text-gray-400" />
              </div>
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                placeholder={`Search ${filters.itemType === 'all' ? 'inventory' : filters.itemType === 'fastfood' ? 'fast food' : 'products'}...`}
                className="pl-10 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              <FaFilter />
              <span>Filters</span>
            </button>
            <button
              onClick={resetFilters}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Status</label>
                <select
                  name="stockStatus"
                  value={filters.stockStatus}
                  onChange={handleFilterChange}
                  className="w-full border rounded-md p-2"
                >
                  <option value="all">All {filters.itemType === 'fastfood' ? 'Fast Food' : 'Products'}</option>
                  <option value="inStock">In Stock</option>
                  <option value="lowStock">Low Stock</option>
                  <option value="outOfStock">Out of Stock</option>
                  <option value="untracked">Stock Not Tracked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <select
                  name="sortBy"
                  value={filters.sortBy}
                  onChange={handleFilterChange}
                  className="w-full border rounded-md p-2"
                >
                  <option value="name">Name</option>
                  <option value="stock">Stock Level</option>
                  <option value="dateAdded">Date Added</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <select
                  name="sortOrder"
                  value={filters.sortOrder}
                  onChange={handleFilterChange}
                  className="w-full border rounded-md p-2"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Section Heading Badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-bold uppercase tracking-widest ${filters.itemType === 'fastfood' ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'}`}>
          {filters.itemType === 'fastfood' ? <FaUtensils /> : <FaBox />}
          {filters.itemType === 'fastfood' ? 'Fast Food Catalog' : 'Standard Product Catalog'}
        </div>

        {/* Bulk Actions Bar (Parity with FastFoodManagement) */}
        {selectedIds.length > 0 && filters.itemType === 'fastfood' && (
          <div className="bg-orange-600 text-white rounded-lg shadow-lg p-4 mb-4 flex flex-wrap items-center justify-between sticky top-0 z-10 animate-in slide-in-from-top duration-300">
            <div className="flex items-center mb-2 sm:mb-0">
              <div className="bg-white/20 p-2 rounded-lg mr-4">
                <CheckSquare size={20} />
              </div>
              <div className="text-sm">
                <span className="font-bold">{selectedIds.length}</span> items selected
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 mr-2">Bulk Actions:</span>
              <button
                onClick={() => handleBulkAction('show')}
                disabled={bulkLoading}
                className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50"
              >
                <Eye size={14} className="mr-1.5" /> Show
              </button>
              <button
                onClick={() => handleBulkAction('hide')}
                disabled={bulkLoading}
                className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50"
              >
                <EyeOff size={14} className="mr-1.5" /> Hide
              </button>
              <div className="w-[1px] h-4 bg-white/20 mx-1" />
              <button
                onClick={() => handleBulkAction('unsuspend')}
                disabled={bulkLoading}
                className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50"
              >
                <Check size={14} className="mr-1.5" /> Unsuspend
              </button>
              <button
                onClick={() => handleBulkAction('suspend')}
                disabled={bulkLoading}
                className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50"
              >
                <Ban size={14} className="mr-1.5" /> Suspend
              </button>
              <div className="w-[1px] h-4 bg-white/20 mx-1" />
              <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg">
                <select
                  value={bulkAvailabilityMode}
                  onChange={(e) => setBulkAvailabilityMode(e.target.value)}
                  disabled={bulkLoading}
                  className="bg-transparent border-none text-[10px] font-bold text-white outline-none cursor-pointer"
                >
                  <option value="AUTO" className="text-gray-900">AUTO</option>
                  <option value="OPEN" className="text-gray-900">OPEN</option>
                  <option value="CLOSED" className="text-gray-900">CLOSED</option>
                </select>
                <button
                  onClick={handleBulkAvailabilityMode}
                  disabled={bulkLoading}
                  className="hover:text-orange-200 transition-colors"
                >
                  <CheckCircle size={14} />
                </button>
              </div>
              <div className="w-[1px] h-4 bg-white/20 mx-1" />
              <button
                onClick={() => handleBulkAction('delete')}
                disabled={bulkLoading}
                className="flex items-center px-3 py-1.5 bg-red-500 hover:bg-red-400 rounded-lg text-[10px] font-bold transition-all border border-red-400/50 disabled:opacity-50"
              >
                <Trash2 size={14} className="mr-1.5" /> Delete
              </button>
              <button
                onClick={() => setSelectedIds([])}
                disabled={bulkLoading}
                className="ml-2 p-1.5 hover:bg-white/10 rounded-full transition-all"
              >
                <FaTimes size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Products List - Desktop Table / Mobile Grid */}
        <div className={`bg-white rounded-b-lg rounded-r-lg border-2 shadow-sm transition-colors duration-500 ${filters.itemType === 'fastfood' ? 'border-orange-500' : 'border-blue-500'}`}>
          {/* Unified Table View for all screens */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {filters.itemType === 'fastfood' && (
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                        checked={selectedIds.length === products.filter(p => !p.stockTracked).length && products.filter(p => !p.stockTracked).length > 0}
                        onChange={() => handleSelectAll(products)}
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {filters.itemType === 'fastfood' ? 'Item' : 'Product'}
                  </th>
                  {currentUser?.role !== 'seller' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {filters.itemType === 'fastfood' ? 'Availability' : 'Stock'}
                  </th>
                  {filters.itemType !== 'fastfood' && currentUser?.role !== 'seller' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Threshold</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  const colCount = 4 +
                    (filters.itemType === 'fastfood' ? 1 : 0) +
                    (currentUser?.role !== 'seller' ? 2 : 0); // Seller column hide = -1, Threshold hide = -1, total = -2 if seller

                  if (loading && products.length === 0) {
                    return (
                      <tr>
                        <td colSpan={colCount} className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (products.length === 0) {
                    return (
                      <tr>
                        <td colSpan={colCount} className="px-6 py-4 text-center text-gray-500">
                          No products found. Try adjusting your filters.
                        </td>
                      </tr>
                    );
                  }

                  return products
                    .filter(product => {
                      if (filters.itemType === 'product') return product.stockTracked === true;
                      if (filters.itemType === 'fastfood') return product.stockTracked === false;
                      return true;
                    })
                    .map((product) => (
                        <React.Fragment key={product.id}>
                          <tr className={`hover:bg-gray-50 ${selectedIds.includes(product.id) ? 'bg-orange-50' : ''} ${expandedRows.includes(product.id) ? 'bg-blue-50/50' : ''}`}>
                            {!product.stockTracked && (
                              <td className="px-6 py-4">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                                  checked={selectedIds.includes(product.id)}
                                  onChange={() => handleSelect(product.id)}
                                />
                              </td>
                            )}
                            {product.stockTracked && filters.itemType === 'fastfood' && (
                              <td className="px-6 py-4"></td> // Spacer for non-fastfood if mixed
                            )}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {product.variants && product.variants.length > 0 && (
                                  <button 
                                    onClick={() => setExpandedRows(prev => prev.includes(product.id) ? prev.filter(id => id !== product.id) : [...prev, product.id])}
                                    className="mr-2 text-gray-400 hover:text-blue-600 transition-colors"
                                  >
                                    {expandedRows.includes(product.id) ? '▼' : '▶'}
                                  </button>
                                )}
                                <div className="flex-shrink-0 h-10 w-10">
                                  {getInventoryItemImage(product) !== FALLBACK_IMAGE ? (
                                    <img
                                      className="h-10 w-10 rounded-md object-cover"
                                      src={resolveImageUrl(getInventoryItemImage(product))}
                                      alt={product.name}
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded-md bg-gray-200 flex items-center justify-center">
                                      <FaBox className="text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">{product.name}</div>
                                  {filters.itemType === 'all' && (
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">{product.itemType === 'fastfood' ? 'Fast Food' : 'Product'}</div>
                                  )}
                                  <div className="text-sm text-gray-500 text-[10px] italic">ID: {product.id || 'N/A'}</div>
                                </div>
                              </div>
                            </td>
                            {currentUser?.role !== 'seller' && (
                              <td className="px-6 py-4 whitespace-nowrap">
                                {product.seller ? (
                                  <div className="text-xs">
                                    <div className="text-gray-500">ID: {product.seller.id}</div>
                                    <div className="font-medium text-gray-900 truncate max-w-[120px]">{product.seller.name || 'N/A'}</div>
                                    <div className="text-gray-500 truncate max-w-[120px]">{product.seller.email || 'N/A'}</div>
                                  </div>
                                ) : (
                                  <span className="text-gray-500 text-xs text-xs italic">Unknown</span>
                                )}
                              </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {product.stockTracked && editingProduct?.id === product.id && !editingProduct?.variantKey ? (
                                <input
                                  type="number"
                                  value={editForm.stock}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
                                  className="w-16 px-1.5 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-400"
                                  min="0"
                                />
                              ) : !product.stockTracked ? (
                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${product.isAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {product.isAvailable ? 'Available' : 'Unavailable'}
                                </span>
                              ) : (
                                <span className={`text-sm font-bold ${product.stock === 0 ? 'text-red-600' : product.stock <= (product.lowStockThreshold || 5) ? 'text-yellow-600' : 'text-green-600'}`}>
                                  {product.stock}
                                  {product.variants && product.variants.length > 0 && <span className="ml-1 text-[10px] text-gray-400 font-normal">(Total)</span>}
                                </span>
                              )}
                            </td>
                            {filters.itemType !== 'fastfood' && currentUser?.role !== 'seller' && (
                              <td className="px-6 py-4 whitespace-nowrap">
                                {product.stockTracked && editingProduct?.id === product.id && !editingProduct?.variantKey ? (
                                  <input
                                    type="number"
                                    value={editForm.lowStockThreshold}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, lowStockThreshold: parseInt(e.target.value) || 0 }))}
                                    className="w-16 px-1.5 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-400"
                                    min="0"
                                  />
                                ) : !product.stockTracked ? (
                                  <span className="text-gray-400">-</span>
                                ) : (
                                  <span className="text-gray-600 font-medium text-sm">{product.lowStockThreshold || 5}</span>
                                )}
                              </td>
                            )}
                            <td className="px-6 py-4">
                              {product.stockTracked ? (
                                <span className={`px-2 py-1 text-[10px] font-black uppercase rounded-full ${getStatusClass(product.stock, product.lowStockThreshold || 5)}`}>
                                  {renderStockStatus(product.stock, product.lowStockThreshold || 5)}
                                </span>
                              ) : (() => {
                                const isPending = product.reviewStatus === 'pending';
                                const isSuspended = !product.isActive && product.reviewStatus !== 'pending';
                                const isHidden = product.isActive === false;
                                const availability = fastFoodService.getAvailabilityStatus(product);
                                const isOpen = availability.state === 'OPEN';

                                return (
                                  <div className="flex flex-col items-start space-y-1">
                                    <span className={`px-2 py-0.5 text-[9px] font-black rounded-full border shadow-sm ${isPending ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                      isSuspended ? 'bg-red-600 text-white border-red-700' :
                                        'bg-green-100 text-green-700 border-green-200'
                                      }`}>
                                      {product.reviewStatus?.toUpperCase() || 'ACTIVE'}
                                    </span>
                                    <div className="flex flex-col items-start">
                                      <span className={`px-2 py-0.5 text-[9px] font-black rounded-md flex items-center gap-1 transition-all ${isOpen
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-200 text-gray-500'
                                        }`}>
                                        <div className={`w-1 h-1 rounded-full ${isOpen ? 'bg-white' : 'bg-gray-400'}`} />
                                        {availability.state || 'CLOSED'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center space-x-3">
                                {product.stockTracked && editingProduct?.id === product.id && !editingProduct?.variantKey ? (
                                  <>
                                    <button onClick={handleSaveStock} className="text-green-600 hover:text-green-800 transition-colors" title="Save"><FaSave /></button>
                                    <button onClick={handleCancelEdit} className="text-gray-600 hover:text-gray-800 transition-colors" title="Cancel"><FaTimes /></button>
                                  </>
                                ) : (
                                  <>
                                    {product.stockTracked && (
                                      <button onClick={() => handleEditStock(product)} className="text-blue-600 hover:text-blue-800 transition-colors" title="Edit Master Stock"><FaEdit /></button>
                                    )}
                                    {currentUser?.role !== 'seller' && product.seller && product.itemType === 'product' && (
                                      <button onClick={() => {
                                        setSelectedSellerForContact({ id: product.seller.id, name: product.seller.name, email: product.seller.email, productId: product.id, productName: product.name });
                                        setContactMessage(`Regarding your product: ${product.name}`);
                                        setIsContactModalOpen(true);
                                      }} className="text-yellow-600 hover:text-yellow-800 transition-colors" title="Contact Seller"><FaEnvelope /></button>
                                    )}
                                    {!product.stockTracked && (
                                      <div className="flex gap-2">
                                        <button onClick={() => {
                                          if (currentUser?.role === 'seller') navigate(`/seller/fast-food/edit/${product.id}`);
                                          else navigate(`/dashboard/fastfood?search=${encodeURIComponent(product.name)}&action=edit`);
                                        }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-all"><Edit size={16} /></button>
                                        <button onClick={() => handleFFDelete(product)} className="p-1.5 text-red-600 hover:bg-white rounded-lg transition-all"><Trash2 size={16} /></button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Variant View */}
                          {expandedRows.includes(product.id) && product.variants && product.variants.length > 0 && (
                            <tr className="bg-blue-50/30 border-b-2 border-blue-100">
                              <td colSpan={colCount} className="px-6 py-4">
                                <div className="pl-10 space-y-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">Stock for Variants</h4>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {product.variants.map((variant) => (
                                      <div key={variant.id} className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">{variant.variantKey}</div>
                                        <div className="space-y-2">
                                          {Object.entries(variant.optionDetails || {}).map(([optionName, details]) => {
                                            const isEditingThis = editingProduct?.id === product.id && 
                                                                 editingProduct?.variantKey === variant.variantKey && 
                                                                 editingProduct?.optionName === optionName;
                                            
                                            return (
                                              <div key={optionName} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                                                <span className="text-sm font-medium text-gray-700">{optionName}</span>
                                                <div className="flex items-center gap-3">
                                                  {isEditingThis ? (
                                                    <div className="flex items-center gap-2">
                                                      <input
                                                        type="number"
                                                        value={editForm.stock}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
                                                        className="w-16 px-1.5 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-400"
                                                        autoFocus
                                                      />
                                                      <button onClick={handleSaveStock} className="text-green-600 text-sm"><FaSave /></button>
                                                      <button onClick={handleCancelEdit} className="text-gray-400 text-sm"><FaTimes /></button>
                                                    </div>
                                                  ) : (
                                                    <div className="flex items-center gap-3">
                                                      <span className={`text-sm font-bold ${details.stock === 0 ? 'text-red-600' : details.stock <= 5 ? 'text-yellow-600' : 'text-blue-600'}`}>
                                                        {details.stock || 0}
                                                      </span>
                                                      <button 
                                                        onClick={() => handleEditStock(product, variant.variantKey, optionName)}
                                                        className="text-gray-400 hover:text-blue-600 transition-colors"
                                                      >
                                                        <FaEdit size={12} />
                                                      </button>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                    ));
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Load More Button */}
        {hasMore && !loading && products.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>

      {/* Contact Seller Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Contact Seller</h3>
            <div className="mb-4">
              <label className="block text-sm font-bold mb-1">To:</label>
              <div className="text-gray-700">{selectedSellerForContact?.name} ({selectedSellerForContact?.email})</div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-bold mb-1">Product:</label>
              <div className="text-gray-700">{selectedSellerForContact?.productName}</div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2">Message:</label>
              <textarea
                className="w-full border rounded p-2 h-32"
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder="Enter your message here..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSendContactMessage}
                disabled={isSendingReminder}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {isSendingReminder ? <FaSync className="animate-spin mr-2" /> : <FaPaperPlane className="mr-2" />}
                Send Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automated Alerts Configuration - Admin Only */}
      {currentUser?.role !== 'seller' && (
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Automated Stock Alerts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Email Notifications</h4>
              <p className="text-sm text-gray-600 mb-3">
                Automatically send email alerts to sellers when products go below stock threshold.
              </p>
              <div className="flex items-center space-x-3">
                <input type="checkbox" id="email-alerts" className="rounded" defaultChecked />
                <label htmlFor="email-alerts" className="text-sm">Enable email alerts</label>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Dashboard Alerts</h4>
              <p className="text-sm text-gray-600 mb-3">
                Show low stock warnings in the admin dashboard.
              </p>
              <div className="flex items-center space-x-3">
                <input type="checkbox" id="dashboard-alerts" className="rounded" defaultChecked />
                <label htmlFor="dashboard-alerts" className="text-sm">Show dashboard alerts</label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Dialog */}
      <AdminPasswordDialog
        isOpen={passwordDialog.isOpen}
        onClose={() => {
          setPasswordDialog(prev => ({ ...prev, isOpen: false }));
          if (passwordDialog.onCancel) passwordDialog.onCancel();
        }}
        onConfirm={async (password, reason) => {
          setPasswordDialog(prev => ({ ...prev, isOpen: false }));
          if (passwordDialog.onConfirm) {
            // FastFoodManagement dialog passes (reason) because the generic dialog expects (password, reason) mostly but we can pass both if needed. Wait! AdminPasswordDialog actually passes (password, reason). The requirePassword resolve will receive them.
            await passwordDialog.onConfirm(reason || password); // Usually FastFoodManagement only passes reason from the dialog because it's a specific wrapper but AdminPasswordDialog provides both.
          }
        }}
        actionDescription={passwordDialog.actionDescription}
        requiresReason={passwordDialog.requiresReason}
        reasonLabel={passwordDialog.reasonLabel}
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmationDialog.isOpen}
        onClose={() => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))}
        success={confirmationDialog.success}
        title={confirmationDialog.title}
        message={confirmationDialog.message}
      />
    </div >
  );
};

export default InventoryManagement;