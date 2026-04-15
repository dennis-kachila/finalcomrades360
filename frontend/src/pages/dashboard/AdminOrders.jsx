import React, { useEffect, useState, useRef } from 'react';
import { FaBox, FaTruck, FaCheckCircle, FaClock, FaMapMarkerAlt, FaCreditCard, FaLock, FaUserPlus, FaEye, FaTimes, FaEdit, FaSearch, FaFilter, FaDownload, FaUser, FaCalendarAlt, FaMoneyBillWave, FaComments, FaPlus, FaMinus, FaInbox, FaWarehouse, FaStore, FaRoute, FaUndo, FaUserMinus, FaUtensils } from 'react-icons/fa';
import api from '../../services/api';
import { resolveImageUrl, FALLBACK_IMAGE } from '../../utils/imageUtils';
import { formatPrice } from '../../utils/currency';
import { recursiveParse, ensureArray, normalizeIngredient } from '../../utils/parsingUtils';
import { DeliveryTaskBadge, DeliveryTypeBadge, getOrderDeliveryTask } from '../../components/delivery/DeliveryTaskComponents';
import DeliveryAssignmentModal from '../../components/delivery/DeliveryAssignmentModal';
import DeliveryChat from '../../components/delivery/DeliveryChat';
import LogisticsDestination from '../../components/delivery/LogisticsDestination';
import WarehouseReceiptModal from '../../components/delivery/WarehouseReceiptModal';
import { getSocket, joinAdminRoom } from '../../services/socket';
import { buildOrderLifecycleSteps } from '../../utils/orderLifecycle';

const ORDERS_REQUEST_DEDUPE_WINDOW_MS = 1500;
const DRIVERS_REQUEST_DEDUPE_WINDOW_MS = 10000;
const recentOrdersRequestAt = new Map();
let recentDriversRequestAt = 0;

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [orderToAssign, setOrderToAssign] = useState(null);
  const [isBulkAssign, setIsBulkAssign] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [backendStats, setBackendStats] = useState(null);
  // Admin routing state
  const [routingStrategy, setRoutingStrategy] = useState('');
  const [routingWarehouseId, setRoutingWarehouseId] = useState('');
  const [routingPickStationId, setRoutingPickStationId] = useState('');
  const [routingFastFoodPickupPointId, setRoutingFastFoodPickupPointId] = useState('');
  const [routingNotes, setRoutingNotes] = useState('');
  const [pickupPointAutoFilled, setPickupPointAutoFilled] = useState(false);
  const [orderAnalysis, setOrderAnalysis] = useState(null);
  const [routingWarehouses, setRoutingWarehouses] = useState([]);
  const [routingPickStations, setRoutingPickStations] = useState([]);
  const [routingFastFoodPickupPoints, setRoutingFastFoodPickupPoints] = useState([]);
  const [routingLoading, setRoutingLoading] = useState(false);
  
  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500); // 500ms delay
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const pageSize = 20;

  // Stability refs
  const selectedOrderRef = useRef(selectedOrder);
  useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  const abortControllerRef = useRef(null);

  // Order status configuration
  const orderStatuses = {
    'order_placed': { icon: FaClock, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Order Placed' },
    'seller_confirmed': { icon: FaBox, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Seller Confirmed' },
    'super_admin_confirmed': { icon: FaCheckCircle, color: 'text-indigo-600', bg: 'bg-indigo-100', label: 'Super Admin Confirmed' },
    'en_route_to_warehouse': { icon: FaTruck, color: 'text-indigo-600', bg: 'bg-indigo-100', label: 'En Route to Warehouse' },
    'at_warehouse': { icon: FaInbox, color: 'text-teal-700', bg: 'bg-teal-50', label: 'Received at Hub' },
    'ready_for_pickup': { icon: FaBox, color: 'text-sky-600', bg: 'bg-sky-100', label: 'Ready for Pickup' },
    'awaiting_delivery_assignment': { icon: FaUserPlus, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Awaiting Agent' },
    'processing': { icon: FaClock, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Processing' },
    'in_transit': { icon: FaTruck, color: 'text-orange-600', bg: 'bg-orange-100', label: 'In Transit' },
    'en_route_to_pick_station': { icon: FaRoute, color: 'text-purple-600', bg: 'bg-purple-100', label: 'To Station' },
    'at_pick_station': { icon: FaWarehouse, color: 'text-purple-700', bg: 'bg-purple-50', label: 'At Station' },
    'delivered': { icon: FaCheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Delivered' },
    'completed': { icon: FaCheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Completed' },
    'failed': { icon: FaTimes, color: 'text-red-600', bg: 'bg-red-100', label: 'Failed' },
    'cancelled': { icon: FaTimes, color: 'text-red-600', bg: 'bg-red-100', label: 'Cancelled' },
    'returned': { icon: FaUndo, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Returned' }
  };

  // Filter options
  const filterOptions = [
    { key: 'all', label: 'All Orders', count: backendStats?.all ?? '...' },
    { key: 'pending', label: 'Pending Orders', count: backendStats?.pending ?? '...' },
    { key: 'processing', label: 'In Transit', count: backendStats?.processing ?? '...' },
    { key: 'delivered', label: 'Delivered', count: backendStats?.delivered ?? '...' },
    { key: 'completed', label: 'Completed', count: backendStats?.completed ?? '...' },
    { key: 'cancelled', label: 'Cancelled Orders', count: backendStats?.cancelled ?? '...' }
];

  // Logistics Categories
  const logisticsCategories = {
    'inbound': {
      label: 'Inbound Logistics (Seller to Hub)',
      stages: ['new', 'awaiting_collection', 'en_route_to_warehouse']
    },
    'hub': {
      label: 'Hub Management',
      stages: ['at_warehouse']
    },
    'outbound': {
      label: 'Outbound Logistics (Hub to Customer)',
      stages: ['dispatch_ready', 'last_mile', 'completed']
    }
  };

  // Logistics Workflow Stages
  const logisticsStages = {
    'all': { label: 'All Orders', statuses: [], icon: FaBox },
    'new': {
      label: 'New Orders',
      statuses: ['order_placed'],
      description: 'Awaiting initial processing.',
      icon: FaClock
    },
    'awaiting_collection': {
      label: 'Awaiting Pickup',
      statuses: ['seller_confirmed', 'super_admin_confirmed'],
      description: 'Sellers have confirmed; items need agent pickup.',
      icon: FaUserPlus
    },
    'en_route_to_warehouse': {
      label: 'Handed to Agent',
      statuses: ['en_route_to_warehouse'],
      description: 'Items are currently with agents moving to hub.',
      icon: FaTruck
    },
    'at_warehouse': {
      label: 'Arrived at Hub',
      statuses: ['at_warehouse'],
      description: 'Items physically at the sorting center.',
      icon: FaBox
    },
    'dispatch_ready': {
      label: 'Ready for Dispatch',
      statuses: ['ready_for_pickup'],
      description: 'Sorted and ready for last-mile delivery.',
      icon: FaCheckCircle
    },
    'last_mile': {
      label: 'Last Mile / In Transit',
      statuses: ['in_transit'],
      description: 'Currently on the way to the customer.',
      icon: FaMapMarkerAlt
    },
    'completed': {
      label: 'Delivered',
      statuses: ['delivered', 'completed'],
      description: 'Finished cycles.',
      icon: FaCheckCircle
    }
  };

  const [workflowFilter, setWorkflowFilter] = useState('all');

  // Seller payout should always reconcile with item-level seller earnings.
  const getItemSellerUnitBasePrice = (item) => {
    const explicitBase = Number(
      item?.basePrice ??
      item?.Product?.basePrice ??
      item?.FastFood?.basePrice ??
      0
    );
    if (explicitBase > 0) return explicitBase;

    const quantity = Math.max(1, Number(item?.quantity || 1));
    const itemTotal = Number(item?.total || 0);
    if (itemTotal > 0) return itemTotal / quantity;

    return Number(item?.price || 0);
  };

  const getItemSellerEarning = (item) => {
    if (item?.commissionAmount !== undefined && item?.commissionAmount !== null) {
      return Number(item.total || 0) - Number(item.commissionAmount || 0);
    }
    const quantity = Math.max(1, Number(item?.quantity || 1));
    return getItemSellerUnitBasePrice(item) * quantity;
  };

  const getOrderSellerPayout = (order) => {
    if (order?.totalCommission !== undefined && order?.totalCommission !== null && order?.total) {
      return Number(order.total || 0) - Number(order.deliveryFee || 0) - Number(order.totalCommission || 0);
    }
    const items = Array.isArray(order?.OrderItems) ? order.OrderItems : [];
    if (items.length === 0) return Number(order?.totalBasePrice || 0);

    const computed = items.reduce((sum, item) => sum + getItemSellerEarning(item), 0);
    if (computed >= 0) return computed;

    return Number(order?.totalBasePrice || 0);
  };

  const isFastFoodOnlyOrder = (order) => {
    const items = Array.isArray(order?.OrderItems) ? order.OrderItems : [];
    if (!items.length) return false;

    const hasFastFood = items.some((item) => !!item?.FastFood || String(item?.itemType || '').toLowerCase() === 'fastfood');
    const hasNonFastFood = items.some((item) => {
      if (item?.Product) return true;
      const itemType = String(item?.itemType || '').toLowerCase();
      return itemType && itemType !== 'fastfood';
    });

    return hasFastFood && !hasNonFastFood;
  };

  // Date filter options
  const dateOptions = [
    { key: 'all', label: 'All Time' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'quarter', label: 'This Quarter' }
  ];

  const loadOrders = async (showLoading = true, isLoadMore = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      if (showLoading) setLoading(true);
      const currentPage = isLoadMore ? page + 1 : 1;
      const orderRequestKey = JSON.stringify({
        page: currentPage,
        pageSize,
        workflowFilter: workflowFilter !== 'all' ? workflowFilter : '',
        dateFilter: dateFilter !== 'all' ? dateFilter : '',
        q: debouncedSearch || ''
      });
      const lastOrderRequest = recentOrdersRequestAt.get(orderRequestKey) || 0;
      if (!isLoadMore && Date.now() - lastOrderRequest < ORDERS_REQUEST_DEDUPE_WINDOW_MS) {
        return;
      }
      recentOrdersRequestAt.set(orderRequestKey, Date.now());

      const response = await api.get('/orders', {
        params: {
          page: currentPage,
          pageSize,
          workflowFilter: workflowFilter !== 'all' ? workflowFilter : undefined,
          dateFilter: dateFilter !== 'all' ? dateFilter : undefined,
          q: debouncedSearch || undefined
        },
        signal: abortControllerRef.current.signal
      });

      const newOrders = Array.isArray(response.data.orders) ? response.data.orders : (Array.isArray(response.data) ? response.data : []);
      const stats = response.data.stats || null;
      const totalPages = parseInt(response.headers['x-total-pages'] || '1', 10);

      if (stats) setBackendStats(stats);
      setOrders(prev => isLoadMore ? [...prev, ...newOrders] : newOrders);
      setHasMore(currentPage < totalPages);
      setPage(currentPage);

    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') return;
      console.error('Failed to load orders:', error);
    } finally {
      if (showLoading) setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const loadDrivers = async (showLoading = true) => {
    try {
      const now = Date.now();
      if (drivers.length > 0 && (now - recentDriversRequestAt) < DRIVERS_REQUEST_DEDUPE_WINDOW_MS) {
        return;
      }
      recentDriversRequestAt = now;

      // Drivers usually load fast and don't change often, but we can silence this too
      const response = await api.get('/admin/delivery/agents');
      setDrivers(response.data || []);
    } catch (error) {
      console.error('Failed to load drivers:', error);
    }
  };

  const loadReturns = async () => {
    try {
        setLoading(true);
        const res = await api.get('/returns/admin/all', {
            params: {
                status: statusFilter !== 'all' ? statusFilter : undefined,
                q: debouncedSearch || undefined
            }
        });
        setReturns(res.data);
    } catch (error) {
        console.error('Failed to load returns:', error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    // Join admin room for real-time updates
    joinAdminRoom();

    // Listen for order updates
    const socket = getSocket();
    const handleOrderUpdate = (data) => {
      console.log('Received real-time order update:', data);

      setOrders(prevOrders => prevOrders.map(order => {
        if (order.id === data.orderId) {
          if (data.event === 'agent_arrived' && data.task) {
            const updatedTasks = order.deliveryTasks ?
              order.deliveryTasks.map(t => t.id === data.task.id ? data.task : t) :
              [data.task];
            return { ...order, deliveryTasks: updatedTasks };
          }
        }
        return order;
      }));

      // Use ref to avoid re-triggering effect
      if (selectedOrderRef.current && selectedOrderRef.current.id === data.orderId) {
        if (data.event === 'agent_arrived' && data.task) {
          setSelectedOrder(prev => {
            const updatedTasks = prev.deliveryTasks ?
              prev.deliveryTasks.map(t => t.id === data.task.id ? data.task : t) :
              [data.task];
            return { ...prev, deliveryTasks: updatedTasks };
          });
        } else {
          loadCommunicationLog(data.orderId);
        }
      }
    };

    const handleOrderStatusUpdate = (data) => {
      console.log('Received real-time order status update:', data);
      setOrders(prevOrders => prevOrders.map(order =>
        order.id === data.orderId ? { ...order, ...data } : order
      ));

      if (selectedOrderRef.current && selectedOrderRef.current.id === data.orderId) {
        setSelectedOrder(prev => ({ ...prev, ...data }));
      }
    };

    const handleOrderMessage = (data) => {
      console.log('Received real-time order message:', data);
      if (selectedOrderRef.current && selectedOrderRef.current.id === data.orderId) {
        loadCommunicationLog(data.orderId);
      }
    };

    socket.on('orderUpdate', handleOrderUpdate);
    socket.on('orderStatusUpdate', handleOrderStatusUpdate);
    socket.on('deliveryRequestUpdate', handleOrderStatusUpdate); // Can reuse same order update logic
    socket.on('handover:confirmed', handleOrderStatusUpdate); // Can reuse same order update logic
    socket.on('orderMessage', handleOrderMessage);

    // Set up polling interval for real-time updates - silent background refresh
    const interval = setInterval(() => {
      // Only poll if on first page to prevent overwriting paginated results
      // WebSocket handles individual updates for any visible order
      if (page === 1) {
        loadOrders(false);
      }
    }, 30000); // 30 seconds

    return () => {
      clearInterval(interval);
      socket.off('orderUpdate', handleOrderUpdate);
      socket.off('orderStatusUpdate', handleOrderStatusUpdate);
      socket.off('deliveryRequestUpdate', handleOrderStatusUpdate);
      socket.off('handover:confirmed', handleOrderStatusUpdate);
      socket.off('orderMessage', handleOrderMessage);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []); // NO dependencies — the polling logic stays stable

  useEffect(() => {
    if (isAssignModalOpen && drivers.length === 0) {
      loadDrivers(false);
    }
  }, [isAssignModalOpen, drivers.length]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper for assignment status & countdown
  const AssignmentIndicator = ({ order }) => {
    const activeTask = order.deliveryTasks?.find(t => t.status === 'assigned');
    const [timeLeft, setTimeLeft] = useState(null);

    useEffect(() => {
      if (!activeTask) return;

      const calculateTimeLeft = () => {
        const assignedAt = new Date(activeTask.assignedAt);
        const expiryTime = new Date(assignedAt.getTime() + 30 * 60 * 1000); // 30 mins
        const now = new Date();
        const diff = expiryTime - now;

        if (diff <= 0) return 'Expired';
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      };

      setTimeLeft(calculateTimeLeft());
      const timer = setInterval(() => {
        const remaining = calculateTimeLeft();
        setTimeLeft(remaining);
        if (remaining === 'Expired') clearInterval(timer);
      }, 1000);

      return () => clearInterval(timer);
    }, [activeTask]);

    if (!activeTask) {
      const isAccepted = order.deliveryTasks?.some(t => ['accepted', 'in_progress', 'arrived_at_pickup'].includes(t.status));
      if (isAccepted) {
        return (
          <div className="flex items-center gap-1.5 text-[9px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">
            <FaCheckCircle className="h-2 w-2" /> AGENT ACTIVE
          </div>
        );
      }
      return null;
    }

    return (
      <div className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded border ${timeLeft === 'Expired' ? 'text-red-600 bg-red-50 border-red-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>
        <FaClock className={`h-2 w-2 ${timeLeft !== 'Expired' && 'animate-pulse'}`} />
        {timeLeft === 'Expired' ? 'TIMEOUT: REASSIGN' : `WAITING: ${timeLeft}`}
      </div>
    );
  };

  const getStatusInfo = (status) => {
    return orderStatuses[status] || orderStatuses['order_placed'];
  };

  // Handle filter changes to reset pagination
  useEffect(() => {
    loadOrders(true);
  }, [workflowFilter, dateFilter, debouncedSearch]);

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      loadOrders(false, true);
    }
  };

  // Route Grouping Helper
  const getRouteGroupings = (orderIds) => {
    const selected = orders.filter(o => orderIds.includes(o.id));
    const groups = {};

    selected.forEach(order => {
      let routeKey = 'Unknown Route';
      let routeLabel = 'Location Undefined';

      if (workflowFilter === 'awaiting_collection') {
        const sellerName = order.seller?.name || order.seller?.businessName || 'Multiple Sellers';
        routeKey = `seller-${order.sellerId}`;
        routeLabel = `Pickup from ${sellerName}`;
      } else if (workflowFilter === 'dispatch_ready' || workflowFilter === 'last_mile') {
        routeKey = order.pickupStationId ? `station-${order.pickupStationId}` : 'door-delivery';
        routeLabel = order.PickupStation?.name ? `Route: ${order.PickupStation.name}` : `Route: Door Delivery`;
      }

      if (!groups[routeKey]) {
        groups[routeKey] = { label: routeLabel, orders: [] };
      }
      groups[routeKey].orders.push(order);
    });

    return groups;
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      !debouncedSearch ||
      order.orderNumber?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      order.User?.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      order.User?.email?.toLowerCase().includes(debouncedSearch.toLowerCase());

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    let matchesDate = true;
    if (dateFilter !== 'all') {
      const orderDate = new Date(order.createdAt);
      const now = new Date();
      if (dateFilter === 'today') {
        matchesDate = orderDate.toDateString() === now.toDateString();
      } else if (dateFilter === 'week') {
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        matchesDate = orderDate >= startOfWeek;
      } else if (dateFilter === 'month') {
        matchesDate = orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  // Grouping logic for multi-seller orders
  const groupedOrders = (() => {
    const groups = {};
    const result = [];

    filteredOrders.forEach(order => {
      if (order.checkoutOrderNumber) {
        if (!groups[order.checkoutOrderNumber]) {
          groups[order.checkoutOrderNumber] = [];
        }
        groups[order.checkoutOrderNumber].push(order);
      } else {
        result.push({ ...order, isStandalone: true });
      }
    });

    Object.entries(groups).forEach(([groupNumber, subOrders]) => {
      if (subOrders.length > 1) {
        // Find the "primary" or just use the first one as representative for the parent row
        // Using a representative that has common info (customer, total from checkout if available)
        result.push({
          id: `group-${groupNumber}`,
          orderNumber: groupNumber,
          isGroup: true,
          subOrders: subOrders,
          total: subOrders.reduce((sum, o) => sum + parseFloat(o.total), 0),
          createdAt: subOrders[0].createdAt,
          user: subOrders[0].User || subOrders[0].user,
          User: subOrders[0].User || subOrders[0].user,
          status: subOrders.every(o => o.status === subOrders[0].status) ? subOrders[0].status : 'mixed',
          paymentConfirmed: subOrders.every(o => o.paymentConfirmed),
          checkoutOrderNumber: groupNumber
        });
      } else {
        result.push({ ...subOrders[0], isStandalone: true });
      }
    });

    // Sort by date desc
    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  })();

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );
      alert('Order status updated successfully');
    } catch (error) {
      console.error('Failed to update order status:', error);
      alert('Failed to update order status');
    }
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedOrders.length === 0) return;
    if (!window.confirm(`Are you sure you want to update ${selectedOrders.length} orders to "${newStatus}"?`)) return;
    try {
      setBulkLoading(true);
      await api.patch('/orders/bulk-status', { orderIds: selectedOrders, status: newStatus });
      await loadOrders(false);
      setSelectedOrders([]);
      alert(`Updated ${selectedOrders.length} orders successfully`);
    } catch (error) {
      alert('Failed to update orders: ' + (error.response?.data?.error || error.message));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkAdminConfirm = async () => {
    if (selectedOrders.length === 0) return;
    if (!window.confirm(`Confirm ${selectedOrders.length} orders as Admin?`)) return;
    try {
      setBulkLoading(true);
      await api.patch('/orders/bulk-status', { orderIds: selectedOrders, status: 'super_admin_confirmed' });
      await loadOrders(false);
      setSelectedOrders([]);
      alert(`Confirmed ${selectedOrders.length} orders successfully`);
    } catch (error) {
      alert('Failed to confirm orders: ' + (error.response?.data?.error || error.message));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkApproveRequests = async (requestedOrderIds) => {
    if (requestedOrderIds.length === 0) return;
    if (!window.confirm(`Approve agent requests for ${requestedOrderIds.length} orders?`)) return;
    try {
      setBulkLoading(true);
      const selectedOrderObjects = orders.filter(o => requestedOrderIds.includes(o.id));
      const taskIds = selectedOrderObjects
        .map(o => getOrderDeliveryTask(o)?.id)
        .filter(id => !!id);

      if (taskIds.length === 0) {
          alert('No valid requests found in selection.');
          return;
      }

      await api.post('/admin/delivery/requests/bulk-approve', { requestIds: taskIds });
      await loadOrders(false);
      setSelectedOrders([]);
      alert(`Approved ${taskIds.length} requests successfully`);
    } catch (error) {
      alert('Failed to approve requests: ' + (error.response?.data?.error || error.message));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkRejectRequests = async (requestedOrderIds) => {
    if (requestedOrderIds.length === 0) return;
    const reason = window.prompt(`Reject agent requests for ${requestedOrderIds.length} orders? Provide a reason (optional):`);
    if (reason === null) return;

    try {
      setBulkLoading(true);
      const selectedOrderObjects = orders.filter(o => requestedOrderIds.includes(o.id));
      const taskIds = selectedOrderObjects
        .map(o => getOrderDeliveryTask(o)?.id)
        .filter(id => !!id);

      if (taskIds.length === 0) {
          alert('No valid requests found in selection.');
          return;
      }

      await api.post('/admin/delivery/requests/bulk-reject', { requestIds: taskIds, reason });
      await loadOrders(false);
      setSelectedOrders([]);
      alert(`Rejected ${taskIds.length} requests successfully`);
    } catch (error) {
      alert('Failed to reject requests: ' + (error.response?.data?.error || error.message));
    } finally {
      setBulkLoading(false);
    }
  };


  const handleBulkAssignDriverUI = () => {
    if (selectedOrders.length === 0) return;
    // Create a dummy order object for the modal to use for common info
    const representative = orders.find(o => o.id === selectedOrders[0]);
    setOrderToAssign(representative);
    setIsBulkAssign(true);
    setIsAssignModalOpen(true);
  };

  const handleWarehouseReceived = async (orderId) => {
    try {
      const res = await api.post(`/orders/${orderId}/warehouse-received`);
      if (res.data.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'at_warehouse', warehouseArrivalDate: new Date() } : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(prev => ({ ...prev, ...(res.data.order || {}) }));
        }
        alert('Order marked as received at warehouse');
      }
    } catch (error) {
      alert('Failed: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleAdminConfirm = async (orderId) => {
    if (orderAnalysis?.isMixedOrder) {
      alert(orderAnalysis.routingBlockedReason || 'This order mixes product and fastfood items and cannot be routed together.');
      return;
    }
    if (!routingStrategy) {
      alert('Please select a routing strategy before confirming.');
      return;
    }
    if (routingStrategy === 'warehouse' && !routingWarehouseId) {
      alert('Please select a destination warehouse.');
      return;
    }
    if (routingStrategy === 'pick_station' && !routingPickStationId) {
      alert('Please select a destination pick station.');
      return;
    }
    if (routingStrategy === 'fastfood_pickup_point' && !routingFastFoodPickupPointId) {
      alert('Please select a fastfood pickup point.');
      return;
    }
    try {
      const res = await api.post(`/orders/${orderId}/super-admin-confirm`, {
        adminRoutingStrategy: routingStrategy,
        destinationWarehouseId: routingStrategy === 'warehouse' ? routingWarehouseId : null,
        destinationPickStationId: routingStrategy === 'pick_station' ? routingPickStationId : null,
        destinationFastFoodPickupPointId: routingStrategy === 'fastfood_pickup_point' ? routingFastFoodPickupPointId : null,
        adminRoutingNotes: routingNotes || null
      });
      if (res.data.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...res.data.order } : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(prev => ({ ...prev, ...(res.data.order || {}) }));
        }
        setRoutingStrategy('');
        setRoutingWarehouseId('');
        setRoutingPickStationId('');
        setRoutingFastFoodPickupPointId('');
        setRoutingNotes('');
          setPickupPointAutoFilled(false);
        setOrderAnalysis(null);
        alert('Order confirmed by Admin with routing assigned');
      }
    } catch (error) {
      alert('Failed: ' + (error.response?.data?.error || error.response?.data?.message || error.message));
    }
  };

  const handleViewDetails = async (order) => {
    if (selectedOrder?.id === order.id) {
       setSelectedOrder(null);
       return;
    }
    
    try {
      setSelectedOrderLoading(true);
      // Fetch fresh details from the dedicated endpoint
      const res = await api.get(`/orders/${order.id}`);
      setSelectedOrder(res.data);
    } catch (error) {
      alert('Failed to load order details: ' + (error.response?.data?.message || error.message));
    } finally {
      setSelectedOrderLoading(false);
    }
  };

  const handleAssignDriver = async (orderId, assignmentData) => {
    try {
      let res;
      if (isBulkAssign) {
        res = await api.patch('/orders/bulk-assign', {
          ...assignmentData,
          orderIds: selectedOrders
        });
      } else {
        res = await api.patch(`/orders/${orderId}/assign`, assignmentData);
      }

      if (res.data.success) {
        await loadOrders(false);
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(prev => ({ ...prev, ...(res.data.order || {}) }));
        }
        setSelectedOrders([]);
        setIsBulkAssign(false);
        alert(isBulkAssign ? 'Drivers assigned to selected orders' : 'Driver assigned successfully');
      }
    } catch (error) {
      alert('Failed: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUnassignDriver = async (orderId) => {
    if (!window.confirm('Are you sure you want to unassign the delivery agent from this order? Any active tasks will be cancelled.')) return;
    try {
      setBulkLoading(true);
      const res = await api.patch(`/orders/${orderId}/unassign`);
      if (res.data.success) {
        await loadOrders(false);
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(prev => ({ ...prev, ...(res.data.order || {}) }));
        }
        alert('Agent unassigned successfully.');
      }
    } catch (error) {
      console.error('Failed to unassign agent:', error);
      alert(error.response?.data?.error || 'Failed to unassign delivery agent.');
    } finally {
      setBulkLoading(false);
    }
  };

  const [message, setMessage] = useState('');
  const [communicationLog, setCommunicationLog] = useState([]);

  const loadCommunicationLog = async (orderId) => {
    try {
      const res = await api.get(`/orders/${orderId}/communication`);
      if (res.data.success) {
        setCommunicationLog(res.data.log || []);
      }
    } catch (error) {
      console.error('Failed to load communication log:', error);
    }
  };

  const handleSendMessage = async (orderId) => {
    if (!message.trim()) return;
    try {
      const res = await api.post(`/orders/${orderId}/message`, { message });
      if (res.data.success) {
        setCommunicationLog(res.data.log || []);
        setMessage('');
      }
    } catch (error) {
      alert('Failed to send message: ' + (error.response?.data?.message || error.message));
    }
  };

  useEffect(() => {
    if (selectedOrder) {
      loadCommunicationLog(selectedOrder.id);
      // Load routing analysis and options when viewing an order_placed order
      if (selectedOrder.status === 'order_placed') {
        setRoutingLoading(true);
        setOrderAnalysis(null);
        setRoutingStrategy('');
        setRoutingWarehouseId('');
        setRoutingPickStationId('');
        setRoutingFastFoodPickupPointId('');
        setRoutingNotes('');
        Promise.all([
          api.get(`/orders/${selectedOrder.id}/analysis`),
          api.get('/warehouses?active=true'),
          api.get('/pickup-stations?activeOnly=true'),
          api.get('/fastfood/pickup-points/admin/all')
        ]).then(([analysisRes, whRes, psRes, ffpsRes]) => {
          const analysis = analysisRes.data.analysis;
          setOrderAnalysis(analysis);
          setRoutingWarehouses(whRes.data.warehouses || []);
          setRoutingPickStations(psRes.data.stations || []);
          setRoutingFastFoodPickupPoints(ffpsRes.data.data || []);

          if (analysis?.defaultRoutingStrategy) {
            setRoutingStrategy(analysis.defaultRoutingStrategy);
          }
            // Auto-populate fastfood pickup point from customer's selected station
            if (analysis?.isFastFoodOnlyOrder && analysis?.isPickStation && analysis?.pickStation) {
              const allPickupPoints = ffpsRes.data.data || [];
              const customerLabel = analysis.pickStation || '';
              const matched = allPickupPoints.find(fp => {
                const label = `${fp.name} - ${fp.address}`;
                const labelAlt = `${fp.name} - ${fp.location || fp.address}`;
                return label === customerLabel || labelAlt === customerLabel || fp.name === customerLabel;
              });
              if (matched) {
                setRoutingFastFoodPickupPointId(String(matched.id));
                setPickupPointAutoFilled(true);
              }
            }
        }).catch(err => {
          console.error('Failed to load routing data:', err);
        }).finally(() => setRoutingLoading(false));
      } else if (selectedOrder.adminRoutingStrategy) {
        // Show existing routing for already-confirmed orders
        setOrderAnalysis(null); // not needed for display
      }
    }
  }, [selectedOrder]);


  const handleSelectOrder = (orderId, subOrderIds = []) => {
    setSelectedOrders(prev => {
      const allToAdd = [orderId, ...subOrderIds];
      const allPresent = allToAdd.every(id => prev.includes(id));

      if (allPresent) {
        return prev.filter(id => !allToAdd.includes(id));
      } else {
        return [...new Set([...prev, ...allToAdd])];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(order => order.id));
    }
  };

  const toggleGroup = (groupNumber) => {
    setExpandedGroups(prev =>
      prev.includes(groupNumber)
        ? prev.filter(g => g !== groupNumber)
        : [...prev, groupNumber]
    );
  };

  const exportOrders = () => {
    const csvContent = [
      ['Order Number', 'Customer', 'Email', 'Status', 'Total', 'Date', 'Payment Status'],
      ...filteredOrders.map(order => [
        order.orderNumber,
        order.User?.name || 'N/A',
        order.User?.email || 'N/A',
        order.status.replace('_', ' ').toUpperCase(),
        order.total,
        formatDate(order.createdAt),
        order.paymentConfirmed ? 'Paid' : 'Pending'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const acquireLock = async (orderId, actionLabel) => {
    try {
      await api.post(`/orders/${orderId}/lock`, { action: actionLabel });
      return true;
    } catch (error) {
      if (error.response?.status === 409) {
        alert(error.response.data.message || "This order is currently being processed by another admin.");
      } else {
        console.error('Lock Error:', error);
      }
      return false;
    }
  };

  const releaseLock = async (orderId) => {
    try {
      await api.post(`/orders/${orderId}/unlock`);
    } catch (error) {
      console.warn('Failed to release lock:', error);
    }
  };

  // Removed full-page blocking loader for immediate UI shell accessibility
  // if (loading) {
  //   return (
  //     <div className="flex items-center justify-center h-64">
  //       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  //       <span className="ml-2 text-gray-600">Loading orders...</span>
  //     </div>
  //   );
  // }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
        <button
          onClick={exportOrders}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <FaDownload className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Workflow Navigation */}
      <div className="space-y-4">
        {Object.entries(logisticsCategories).map(([catKey, category]) => (
          <div key={catKey} className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 px-2">{category.label}</h3>
            <div className="flex sm:flex-wrap gap-2 overflow-x-auto pb-2 no-scrollbar">
              {category.stages.map(key => {
                const stage = logisticsStages[key];
                const isActive = workflowFilter === key;
                const count = key === 'all' ? (backendStats?.all ?? '...') : (backendStats?.[`wf_${key}`] ?? '...');

                return (
                  <button
                    key={key}
                    onClick={() => {
                      setWorkflowFilter(key);
                      setStatusFilter('all');
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm border ${isActive
                      ? 'bg-orange-600 text-white border-orange-700 shadow-orange-100 scale-105'
                      : 'bg-white text-gray-600 hover:bg-orange-50 border-gray-100'
                      }`}
                  >
                    {stage.icon && <stage.icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />}
                    {stage.label}
                    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex justify-start pt-2">
          <button
            onClick={() => {
              setWorkflowFilter('all');
              setStatusFilter('all');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${workflowFilter === 'all' ? 'bg-gray-800 text-white border-gray-900' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
          >
            <FaFilter className="h-3 w-3" /> View All Orders
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filterOptions.slice(1).map((option) => {
          const isActive = statusFilter === option.key ||
            (option.key === 'pending' && statusFilter === 'order_placed,seller_confirmed,super_admin_confirmed,en_route_to_warehouse,at_warehouse,at_warehouse') ||
            (option.key === 'processing' && statusFilter === 'ready_for_pickup,in_transit');
          return (
            <button
              key={option.key}
              onClick={() => {
                setWorkflowFilter('all');
                if (option.key === 'pending') {
                  setStatusFilter('order_placed,seller_confirmed,super_admin_confirmed,en_route_to_warehouse,at_warehouse,at_warehouse');
                } else if (option.key === 'processing') {
                  setStatusFilter('ready_for_pickup,in_transit');
                } else {
                  setStatusFilter(option.key);
                }
              }}
              className={`p-4 rounded-lg shadow border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${isActive ? 'bg-blue-600 border-blue-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${isActive ? 'text-blue-100' : 'text-gray-600'}`}>{option.label}</p>
                  <p className="text-2xl font-bold">{option.count}</p>
                </div>
                <div className={`${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                  <FaBox className="h-8 w-8" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by order number, customer name, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="min-w-[150px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              {Object.entries(orderStatuses).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="min-w-[150px]">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {dateOptions.map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results Counter & Global Search Info */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
              <span className="text-sm font-medium text-gray-500">Showing </span>
              <span className="text-sm font-bold text-blue-600">{orders.length}</span>
              <span className="text-sm font-medium text-gray-500"> orders</span>
            </div>
            {searchTerm && (
              <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-100 animate-pulse">
                <FaSearch className="h-3 w-3" />
                GLOBAL DATABASE SEARCH ACTIVE
              </div>
            )}
          </div>
          {loading && <span className="text-[10px] text-blue-500 animate-pulse font-bold uppercase tracking-widest">Refreshing...</span>}
        </div>

        {/* Bulk Actions */}
        {selectedOrders.length > 0 && (() => {
          const selectedOrderObjects = orders.filter(o => selectedOrders.includes(o.id));
          const statusCounts = selectedOrderObjects.reduce((acc, o) => {
            acc[o.status] = (acc[o.status] || 0) + 1;
            return acc;
          }, {});
          const statuses = Object.keys(statusCounts);
          const isHomogeneous = statuses.length === 1;
          const currentStatus = isHomogeneous ? statuses[0] : 'mixed';

          // NEW: Identify assigned vs unassigned in selection
          const assignedOrders = selectedOrderObjects.filter(o =>
            o.deliveryTasks?.some(t => ['assigned', 'accepted', 'in_progress'].includes(t.status))
          );
          const unassignedOrders = selectedOrderObjects.filter(o =>
            !o.deliveryTasks?.some(t => ['assigned', 'accepted', 'in_progress'].includes(t.status))
          );

          const hasAssigned = assignedOrders.length > 0;
          const hasUnassigned = unassignedOrders.length > 0;
          const isMixedAssignment = hasAssigned && hasUnassigned;

          const routeGroups = getRouteGroupings(selectedOrders);
          const groupArray = Object.values(routeGroups);

          return (
            <div className="flex flex-col gap-4 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 shadow-xl transition-all animate-in fade-in slide-in-from-top-4 relative overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-blue-100/50 pb-3">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-black shadow-lg">
                    {selectedOrders.length}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-blue-900">Manage Selected Shipments</h4>
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">
                      Current Stage: {logisticsStages[workflowFilter]?.label || 'General Management'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrders([])}
                  className="p-2 hover:bg-white rounded-full text-blue-400 hover:text-blue-600 transition-colors shadow-sm"
                >
                  <FaTimes />
                </button>
              </div>

              {/* Grouping Insights */}
              {isMixedAssignment ? (
                <div className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-center gap-3">
                  <div className="bg-red-500 text-white p-2 rounded-lg shadow-sm">
                    <FaLock className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-red-900 leading-tight">
                    Selection Mixed: <span className="underline">{assignedOrders.length} assigned</span> and <span className="underline">{unassignedOrders.length} unassigned</span> orders.
                    Please select either assigned or unassigned items only for bulk dispatch.
                  </p>
                </div>
              ) : !isHomogeneous ? (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-xl flex flex-wrap gap-2 items-center">
                  <FaFilter className="text-yellow-600 h-3 w-3" />
                  <span className="text-[11px] font-bold text-yellow-800">Mixed Selection:</span>
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <span key={status} className="px-2 py-0.5 bg-white border border-yellow-100 rounded text-[9px] font-black text-gray-600 uppercase">
                      {count} {orderStatuses[status]?.label}
                    </span>
                  ))}
                </div>
              ) : groupArray.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {groupArray.map(group => (
                    <div key={group.label} className="px-3 py-1.5 bg-white/60 border border-blue-100 rounded-lg text-[10px] font-bold text-blue-700 flex items-center gap-2">
                      <FaMapMarkerAlt className="h-2 w-2" />
                      {group.label} ({group.orders.length})
                    </div>
                  ))}
                  <div className="ml-auto text-[10px] font-black text-indigo-400 italic">
                    Detected {groupArray.length} distinct routes
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600 bg-white/60 px-3 py-2 rounded-xl border border-blue-100 w-fit">
                  <FaCheckCircle className="h-3 w-3" />
                  All selected items belong to: <span className="underline decoration-indigo-300 decoration-2">{groupArray[0]?.label || 'Same Workflow'}</span>
                </div>
              )}

              {/* Actions Section */}
              <div className="flex flex-wrap gap-3 items-center pt-2">
                {/* INBOUND FLOW */}
                {workflowFilter === 'new' && isHomogeneous && (
                  <button
                    onClick={handleBulkAdminConfirm}
                    disabled={bulkLoading || hasAssigned}
                    className={`group px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 ${hasAssigned ? 'bg-gray-400 text-gray-200 cursor-not-allowed shadow-none' : 'bg-green-600 text-white hover:bg-green-700 shadow-green-100'}`}
                  >
                    <FaCheckCircle className="group-hover:rotate-12 transition-transform" />
                    {hasAssigned ? 'Already Grouped' : 'Confirm Batch for Fulfillment'}
                  </button>
                )}
                {/* ALL STAGES: Assignment is the only bulk action allowed now */}
                {(workflowFilter === 'awaiting_collection' || workflowFilter === 'at_warehouse' || workflowFilter === 'dispatch_ready' || workflowFilter === 'cancelled' || workflowFilter === 'all') && (
                  <div className="flex flex-wrap gap-2">
                    {/* Manual Assignment Button (Existing) */}
                    <button
                      onClick={handleBulkAssignDriverUI}
                      disabled={bulkLoading || hasAssigned}
                      className={`group px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 ${hasAssigned ? 'bg-gray-400 text-gray-200 cursor-not-allowed shadow-none' : 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-100'}`}
                    >
                      <FaTruck className="group-hover:translate-x-1 transition-transform" />
                      {hasAssigned ? 'Review Assignment' : 'Manual Bulk Assign'}
                    </button>

                    {/* NEW: Bulk Approve Requested */}
                    {(() => {
                        const requestedOrderIds = selectedOrderObjects
                            .filter(o => getOrderDeliveryTask(o)?.status === 'requested')
                            .map(o => o.id);
                        if (requestedOrderIds.length > 0) {
                            return (
                                <>
                                    <button
                                        onClick={() => handleBulkApproveRequests(requestedOrderIds)}
                                        disabled={bulkLoading}
                                        className="group px-5 py-2.5 bg-green-600 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-green-100 hover:bg-green-700 transition-all active:scale-95"
                                    >
                                        <FaCheckCircle className="group-hover:scale-110 transition-transform" />
                                        Approve {requestedOrderIds.length} Requests
                                    </button>
                                    <button
                                        onClick={() => handleBulkRejectRequests(requestedOrderIds)}
                                        disabled={bulkLoading}
                                        className="group px-5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-red-100 transition-all active:scale-95"
                                    >
                                        <FaTimes className="group-hover:rotate-90 transition-transform" />
                                        Reject {requestedOrderIds.length}
                                    </button>
                                </>
                            );
                        }
                        return null;
                    })()}
                  </div>
                )}


                {/* GLOBAL ACTIONS */}
                <div className="flex items-center gap-2 ml-auto">
                  {!isHomogeneous && (
                    <p className="text-[10px] font-black text-red-400 bg-red-50 px-3 py-2 rounded-lg border border-red-100 max-w-[200px] leading-tight flex items-center gap-2">
                      <FaLock /> Filter by Stage to execute logistics steps.
                    </p>
                  )}
                  <button
                    onClick={() => alert(`Generating ${selectedOrders.length} Manifests...`)}
                    className="px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-black hover:bg-gray-50 flex items-center gap-2 transition-all active:scale-95"
                  >
                    <FaDownload className="h-3 w-3" /> Print Labels
                  </button>
                </div>
              </div>

              {bulkLoading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-2xl z-20 transition-all">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                    <span className="text-sm font-black text-blue-900 animate-pulse tracking-widest uppercase">Synchronizing Logistics...</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Route
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total (KES)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sales (KES)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                      <div className="space-y-1">
                        <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Loading orders...</p>
                        <p className="text-[10px] text-gray-400 font-bold">Connecting to logistics database</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-6 py-12 text-center text-gray-500">
                    No orders found for this filter.
                  </td>
                </tr>
              ) : (
                <>
                </>
              )}
              {groupedOrders.map((item) => {
                const isGroup = item.isGroup;
                const ordersToRender = isGroup ? [item, ...(expandedGroups.includes(item.checkoutOrderNumber) ? item.subOrders : [])] : [item];

                return ordersToRender.map((order, idx) => {
                  const isParentRow = isGroup && idx === 0;
                  const isChildRow = isGroup && idx > 0;
                  const StatusIcon = order.status === 'mixed' ? FaFilter : getStatusInfo(order.status).icon;
                  const isSelected = isParentRow
                    ? order.subOrders.every(so => selectedOrders.includes(so.id))
                    : selectedOrders.includes(order.id);

                  return (
                    <tr
                      key={order.id}
                      className={`transition-colors whitespace-nowrap ${isParentRow ? 'bg-orange-50 font-bold border-l-4 border-orange-500' : isChildRow ? 'bg-gray-50/50' : 'hover:bg-gray-50'
                        }`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => isParentRow ? handleSelectOrder(null, order.subOrders.map(so => so.id)) : handleSelectOrder(order.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {isParentRow && (
                            <button
                              onClick={() => toggleGroup(order.checkoutOrderNumber)}
                              className="p-1 hover:bg-orange-200 rounded transition-colors text-orange-600"
                            >
                              {expandedGroups.includes(order.checkoutOrderNumber) ?
                                <FaMinus className="h-3 w-3" /> :
                                <FaPlus className="h-3 w-3" />
                              }
                            </button>
                          )}
                          {isChildRow && <div className="ml-6 border-l-2 border-gray-200 pl-2 text-xs text-gray-400">Split</div>}
                          <div>
                            <div className={`text-sm ${isParentRow ? 'text-orange-900' : 'text-gray-900'}`}>
                              #{order.orderNumber}
                              {isParentRow && (
                                <span className="ml-2 text-[10px] bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full uppercase">
                                  {order.subOrders.length} Sellers
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {isParentRow ? 'Total Consolidated Items' : `${order.OrderItems?.length || 0} item${order.OrderItems?.length !== 1 ? 's' : ''}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {order.customerName || (order.user?.name || order.User?.name) || 'N/A'}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {order.customerEmail || (order.user?.email || order.User?.email) || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase transition-all ${order.status === 'mixed' ? 'bg-orange-100 text-orange-700' : `${getStatusInfo(order.status).bg} ${getStatusInfo(order.status).color}`}`}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {order.status === 'mixed' ? 'Mixed Status' : getStatusInfo(order.status).label}
                          </div>
                          {!isParentRow && <AssignmentIndicator order={order} />}
                          {!isParentRow && order.deliveryType && <DeliveryTypeBadge deliveryType={order.deliveryType} />}
                          {!isParentRow && getOrderDeliveryTask(order) && <DeliveryTaskBadge task={getOrderDeliveryTask(order)} />}
                          {!isParentRow && order.processingBy && new Date(order.processingTimeout) > new Date() && (
                            <div className="flex items-center gap-1.5 text-[9px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 animate-pulse">
                              <FaLock className="h-2 w-2" /> {order.processingAction?.toUpperCase() || 'PROCESSING'}...
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isParentRow ?
                          <div className="text-[10px] text-orange-700 font-medium">Consolidated Destinations</div> :
                          <LogisticsDestination order={order} condensed={true} />
                        }
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${order.paymentConfirmed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                          {order.paymentConfirmed ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-sm font-bold ${isParentRow ? 'text-orange-900' : 'text-gray-900'}`}>
                        {formatPrice(order.total)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-blue-600">
                        {isParentRow ? 'N/A' : formatPrice(getOrderSellerPayout(order))}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        {!isParentRow ? (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleViewDetails(order)}
                              disabled={selectedOrderLoading && selectedOrder?.id !== order.id}
                              className={`p-2 ${selectedOrderLoading && selectedOrder?.id === order.id ? 'animate-pulse' : ''} text-blue-600 hover:bg-blue-50 rounded-full transition-colors`}
                              title="View Details"
                            >
                              {selectedOrderLoading && selectedOrder?.id === order.id ? (
                                <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                              ) : (
                                <FaEye className="h-4 w-4" />
                              )}
                            </button>

                            {!['delivered', 'completed', 'cancelled'].includes(order.status) && (() => {
                              const activeTask = getOrderDeliveryTask(order);
                              const isAtHub = ['at_warehouse', 'at_warehouse', 'at_pick_station', 'ready_for_pickup'].includes(order.status);
                              const isLocked = !isAtHub && activeTask && ['accepted', 'in_progress'].includes(activeTask.status) && !['failed', 'cancelled'].includes(order.status);
                              const isWarehouseRoute = !['direct_delivery', 'fastfood_direct_delivery', 'fastfood_pickup_point'].includes(order.adminRoutingStrategy) && order.orderCategory !== 'fastfood' && order.shippingType === 'shipped_from_seller';
                              // If current task failed, we shouldn't lock the warehouse state; we need to re-assign
                              // Also, if a task is already specifically 'assigned' (but not yet accepted), we should NOT be locked from re-assigning it.
                              const isLockedForWarehouse = isWarehouseRoute && !isAtHub && !['failed', 'assigned', 'rejected'].includes(activeTask?.status);
                              // Allow assign if status is confirmed OR if it's at the hub ready for the next leg
                              // Enforcement: Seller must confirm before assignment is allowed
                              // Exception: Already assigned orders (re-assignment) or orders at hub (next leg)
                              const canAssign = order.sellerConfirmed || !!order.deliveryAgentId || !!activeTask?.agentId || isAtHub;
                              const isButtonDisabled = isLocked || isLockedForWarehouse || !canAssign;

                              return (
                                <>
                                  <button
                                    onClick={async () => {
                                      if (isButtonDisabled) return;
                                      const success = await acquireLock(order.id, 'assigning');
                                      if (!success) return;
                                      setOrderToAssign(order);
                                      setIsBulkAssign(false);
                                      setIsAssignModalOpen(true);
                                    }}
                                    disabled={isButtonDisabled}
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 ${isButtonDisabled
                                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                      : order.deliveryAgentId
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                      } rounded-lg text-[10px] font-bold shadow-sm transition-all active:scale-95`}
                                    title={
                                      isLocked
                                        ? "Cannot re-assign: Agent has already accepted/started"
                                        : !canAssign
                                          ? "Waiting for seller confirmation"
                                          : isLockedForWarehouse
                                            ? "Locked: Awaiting warehouse arrival for seller-shipped items"
                                            : order.deliveryAgentId ? "Reassign Driver" : "Assign Driver"
                                    }
                                  >
                                    {isLocked ? (
                                      <><FaLock className="h-3 w-3" /> Locked</>
                                    ) : (
                                      <><FaTruck className="h-3 w-3" /> {isButtonDisabled ? 'Locked' : (order.deliveryAgentId || activeTask?.deliveryAgentId) ? 'Reassign' : 'Assign'}</>
                                    )}
                                  </button>
                                  {(order.deliveryAgentId || activeTask?.deliveryAgentId) && !isLocked && (
                                    <button
                                      onClick={() => handleUnassignDriver(order.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                      title="Unassign delivery agent"
                                    >
                                      <FaUserMinus className="h-4 w-4" />
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => toggleGroup(order.checkoutOrderNumber)}
                              className="text-xs font-bold text-orange-600 hover:text-orange-800 underline"
                            >
                              {expandedGroups.includes(order.checkoutOrderNumber) ? 'Hide Splits' : 'View Splits'}
                            </button>

                            {/* Consolidated Dispatch Button - Only if all items are at warehouse or beyond */}
                            {['at_warehouse', 'ready_for_pickup'].includes(order.status) && (
                              <button
                                onClick={async () => {
                                  // Lock the first one as representative for the action
                                  const success = await acquireLock(order.subOrders[0].id, 'consolidating');
                                  if (!success) return;
                                  const subIds = order.subOrders.map(so => so.id);
                                  setSelectedOrders(subIds);
                                  setIsBulkAssign(true);
                                  setOrderToAssign(order.subOrders[0]); // Use first as template
                                  setIsAssignModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white hover:bg-orange-700 rounded-lg text-[10px] font-bold shadow-sm transition-all active:scale-95"
                                title="Assign a single agent for all items in this group"
                              >
                                <FaUserPlus className="h-3 w-3" /> Consolidate & Dispatch
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>

        {/* Load More Button */}
        {hasMore && orders.length > 0 && (
          <div className="p-4 flex justify-center bg-gray-50 border-t">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className={`px-6 py-2 rounded-xl text-sm font-black flex items-center gap-2 transition-all active:scale-95 ${loading
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
                }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                  Loading Batch...
                </>
              ) : (
                <>
                  <FaPlus className="h-3 w-3" />
                  Load More Orders
                </>
              )}
            </button>
          </div>
        )}

      </div>

      {/* Driver Assignment Modal */}
      <DeliveryAssignmentModal
        isOpen={isAssignModalOpen}
        order={orderToAssign}
        isBulk={isBulkAssign}
        selectedOrderIds={selectedOrders}
        onClose={() => {
          setIsAssignModalOpen(false);
          if (orderToAssign?.id) {
            releaseLock(orderToAssign.id);
          }
          setOrderToAssign(null);
          setIsBulkAssign(false);
        }}
        onAssign={async (id, data) => {
          await handleAssignDriver(id, data);
          // Lock is released in onClose since we clear state there
        }}
      />


      {/* Order Details Modal */}
      {
        selectedOrder && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Order Details - #{selectedOrder.orderNumber}</h3>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes className="h-6 w-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Info */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <FaUser className="mr-2 text-gray-500" />
                    Customer Information
                  </h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><strong>Name:</strong> {(selectedOrder.user?.name || selectedOrder.User?.name) || 'N/A'}</p>
                    <p><strong>Email:</strong> {(selectedOrder.user?.email || selectedOrder.User?.email) || 'N/A'}</p>
                    <p><strong>Phone:</strong> {(selectedOrder.user?.phone || selectedOrder.User?.phone) || 'N/A'}</p>
                  </div>
                </div>

                {/* Order Info */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <FaCalendarAlt className="mr-2 text-gray-500" />
                    Order Information
                  </h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><strong>Order Date:</strong> {formatDate(selectedOrder.createdAt)}</p>
                    <p><strong>Status:</strong> {getStatusInfo(selectedOrder.status).label}</p>
                    <p><strong>Payment:</strong> {selectedOrder.paymentConfirmed ? 'Paid' : 'Pending'}</p>
                    <p><strong>Method:</strong> {selectedOrder.paymentMethod} {selectedOrder.paymentSubType ? `(${selectedOrder.paymentSubType})` : ''}</p>
                    <p><strong>Total:</strong> {formatPrice(selectedOrder.total)}</p>
                    {selectedOrder.paymentProofUrl && (
                      <div className="mt-2 text-xs">
                        <strong>Payment Proof:</strong>
                        <a 
                          href={resolveImageUrl(selectedOrder.paymentProofUrl)} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <FaEye /> View Screenshot
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Special Prep / Batch Info Blocks */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {selectedOrder.deliveryInstructions && (
                    <div className="bg-orange-50 border-2 border-orange-200 p-4 rounded-xl shadow-sm">
                      <h4 className="font-black text-orange-900 text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FaUtensils size={14} className="text-orange-600" />
                        Special Prep Instructions
                      </h4>
                      <p className="text-sm font-bold text-orange-800 leading-relaxed bg-white/50 p-3 rounded-lg border border-orange-100 italic">
                        "{selectedOrder.deliveryInstructions}"
                      </p>
                    </div>
                  )}

                  {selectedOrder.batch && (
                    <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl shadow-sm">
                      <h4 className="font-black text-blue-900 text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FaClock className="text-blue-600" />
                        Fast Food Fulfillment Batch
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/50 p-2 rounded-lg border border-blue-100">
                          <p className="text-[10px] text-blue-600 font-bold uppercase">Batch Name</p>
                          <p className="text-sm font-black text-blue-900">{selectedOrder.batch.name}</p>
                        </div>
                        <div className="bg-white/50 p-2 rounded-lg border border-blue-100">
                          <p className="text-[10px] text-blue-600 font-bold uppercase">Expected Delivery</p>
                          <p className="text-sm font-black text-blue-900">{selectedOrder.batch.expectedDelivery}</p>
                        </div>
                        <div className="bg-white/50 p-2 rounded-lg border border-blue-100 col-span-2">
                          <p className="text-[10px] text-blue-600 font-bold uppercase">Preparation Window</p>
                          <p className="text-sm font-black text-blue-900">{selectedOrder.batch.startTime} - {selectedOrder.batch.endTime}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin Routing Section */}
                {selectedOrder.status === 'order_placed' && (
                  <div className="md:col-span-2 bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-xl border-2 border-amber-200 shadow-sm">
                    <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                      <FaRoute className="text-amber-600" />
                      Admin Routing Decision
                      <span className="text-[9px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-black uppercase animate-pulse">Required</span>
                    </h4>

                    {routingLoading ? (
                      <div className="text-center py-4 text-sm text-gray-500">Loading order analysis...</div>
                    ) : orderAnalysis ? (
                      <div className="space-y-4">
                        {/* Order Composition Analysis */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-lg border border-amber-100">
                            <p className="text-[10px] text-amber-600 font-black uppercase mb-1">Order Type</p>
                            <div className="flex items-center gap-2">
                              {orderAnalysis?.orderCategory === 'fastfood' ? (
                                <>
                                  <FaStore className="text-orange-600" />
                                  <span className="text-sm font-bold text-orange-700">Fastfood Order</span>
                                </>
                              ) : orderAnalysis?.orderCategory === 'mixed' ? (
                                <>
                                  <FaRoute className="text-red-600" />
                                  <span className="text-sm font-bold text-red-700">Mixed Order</span>
                                </>
                              ) : (
                                <>
                                  <FaWarehouse className="text-blue-600" />
                                  <span className="text-sm font-bold text-blue-700">Product Order</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-amber-100">
                            <p className="text-[10px] text-amber-600 font-black uppercase mb-1">Seller Structure</p>
                            <div className="flex items-center gap-2">
                              {orderAnalysis.isSingleSeller ? (
                                <>
                                  <FaStore className="text-green-600" />
                                  <span className="text-sm font-bold text-green-700">Single Seller</span>
                                </>
                              ) : (
                                <>
                                  <FaStore className="text-orange-600" />
                                  <span className="text-sm font-bold text-orange-700">Multi-Seller ({orderAnalysis.sellerCount} sellers)</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-amber-100">
                            <p className="text-[10px] text-amber-600 font-black uppercase mb-1">Customer Preference</p>
                            <div className="flex items-center gap-2">
                              {orderAnalysis.isHomeDelivery ? (
                                <>
                                  <FaTruck className="text-blue-600" />
                                  <span className="text-sm font-bold text-blue-700">Home Delivery</span>
                                </>
                              ) : (
                                <>
                                  <FaMapMarkerAlt className="text-purple-600" />
                                  <span className="text-sm font-bold text-purple-700">Pick Station</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Delivery Address */}
                        <div className="bg-white p-3 rounded-lg border border-amber-100">
                          <p className="text-[10px] text-amber-600 font-black uppercase mb-1">
                            {orderAnalysis.isHomeDelivery ? 'Delivery Address' : 'Pick Station'}
                          </p>
                          <p className="text-sm font-medium text-gray-800">
                            {orderAnalysis.isHomeDelivery
                              ? (selectedOrder.deliveryAddress || 'Not provided')
                              : (selectedOrder.pickStation || 'Not selected')
                            }
                          </p>
                        </div>

                        {orderAnalysis?.isMixedOrder ? (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-[10px] text-red-700 font-black uppercase mb-1">Routing Unavailable</p>
                            <p className="text-sm font-semibold text-red-800">This order contains both product and fastfood items.</p>
                            <p className="text-[12px] text-red-700 mt-1">
                              {orderAnalysis.routingBlockedReason || 'Separate the order by type before selecting a routing strategy.'}
                            </p>
                          </div>
                        ) : (
                          <>

                          {/* Routing Options */}
                          {orderAnalysis?.isFastFoodOnlyOrder ? (
                            /* Fastfood: strategy is auto-determined from customer preference */
                            <div>
                              <p className="text-[10px] text-amber-800 font-black uppercase mb-2">Confirmed Routing Strategy</p>
                              <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 flex items-center gap-3">
                                {routingStrategy === 'fastfood_pickup_point' ? (
                                  <FaStore className="text-orange-500 text-xl flex-shrink-0" />
                                ) : (
                                  <FaTruck className="text-green-500 text-xl flex-shrink-0" />
                                )}
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-gray-800">
                                    {routingStrategy === 'fastfood_pickup_point' ? 'Fastfood Pickup Point' : 'Fastfood Direct Delivery'}
                                  </p>
                                  <p className="text-[11px] text-gray-500 mt-0.5">Auto-set from customer's delivery preference. You may still change the destination below if needed.</p>
                                </div>
                                <span className="text-[9px] bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-bold uppercase">Auto</span>
                              </div>
                            </div>
                          ) : (
                            /* Product orders: manual strategy selection */
                            <div>
                              <p className="text-[10px] text-amber-800 font-black uppercase mb-2">
                                Select Product Routing Strategy
                              </p>
                              <p className="text-[11px] text-amber-700 mb-2">
                                Showing only product routing options for this order.
                              </p>
                              <div className="grid grid-cols-1 gap-2">
                                {orderAnalysis?.allowedRoutingStrategies?.includes('warehouse') && (
                                  <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all ${routingStrategy === 'warehouse' ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-200 bg-white hover:border-blue-200 cursor-pointer'}`}>
                                    <input
                                      type="radio"
                                      name="routingStrategy"
                                      value="warehouse"
                                      checked={routingStrategy === 'warehouse'}
                                      onChange={() => setRoutingStrategy('warehouse')}
                                      className="mt-1"
                                    />
                                    <div>
                                      <div className="font-bold text-sm flex items-center gap-2">
                                        <FaWarehouse className="text-blue-600" /> Warehouse Route
                                      </div>
                                      <p className="text-[11px] text-gray-500">Sellers deliver items to a central warehouse. Items consolidate before final delivery.</p>
                                    </div>
                                  </label>
                                )}

                                {orderAnalysis?.allowedRoutingStrategies?.includes('pick_station') && (
                                  <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all ${routingStrategy === 'pick_station' ? 'border-purple-500 bg-purple-50 cursor-pointer' : 'border-gray-200 bg-white hover:border-purple-200 cursor-pointer'}`}>
                                    <input
                                      type="radio"
                                      name="routingStrategy"
                                      value="pick_station"
                                      checked={routingStrategy === 'pick_station'}
                                      onChange={() => setRoutingStrategy('pick_station')}
                                      className="mt-1"
                                    />
                                    <div>
                                      <div className="font-bold text-sm flex items-center gap-2">
                                        <FaMapMarkerAlt className="text-purple-600" /> Pick Station Route
                                      </div>
                                      <p className="text-[11px] text-gray-500">Sellers deliver items to a designated pick station for customer pickup or onward dispatch.</p>
                                    </div>
                                  </label>
                                )}

                                {orderAnalysis?.allowedRoutingStrategies?.includes('direct_delivery') && (
                                  <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all ${!orderAnalysis.directDeliveryEligible ? 'opacity-50 cursor-not-allowed border-gray-100 bg-gray-50' : routingStrategy === 'direct_delivery' ? 'border-green-500 bg-green-50 cursor-pointer' : 'border-gray-200 bg-white hover:border-green-200 cursor-pointer'}`}>
                                    <input
                                      type="radio"
                                      name="routingStrategy"
                                      value="direct_delivery"
                                      checked={routingStrategy === 'direct_delivery'}
                                      onChange={() => setRoutingStrategy('direct_delivery')}
                                      disabled={!orderAnalysis.directDeliveryEligible}
                                      className="mt-1"
                                    />
                                    <div>
                                      <div className="font-bold text-sm flex items-center gap-2">
                                        <FaTruck className="text-green-600" /> Direct Delivery
                                        {!orderAnalysis.directDeliveryEligible && (
                                          <span className="text-[9px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                                            {!orderAnalysis.isSingleSeller ? 'Multi-seller' : 'Not home delivery'}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-gray-500">
                                        Admin assigns a driver to collect from seller and deliver directly to customer. Only for single-seller home delivery orders.
                                      </p>
                                    </div>
                                  </label>
                                )}
                              </div>
                            </div>
                          )}

                        {/* Warehouse Selector */}
                        {routingStrategy === 'warehouse' && (
                          <div className="bg-white p-3 rounded-lg border border-blue-200">
                            <label className="block text-[10px] font-black text-blue-800 uppercase mb-2">Select Destination Warehouse</label>
                            <select
                              value={routingWarehouseId}
                              onChange={(e) => setRoutingWarehouseId(e.target.value)}
                              className="w-full p-2.5 border-2 border-blue-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none"
                            >
                              <option value="">-- Choose Warehouse --</option>
                              {routingWarehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name} — {w.address || w.town}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Pick Station Selector */}
                        {routingStrategy === 'pick_station' && (
                          <div className="bg-white p-3 rounded-lg border border-purple-200">
                            <label className="block text-[10px] font-black text-purple-800 uppercase mb-2">Select Destination Pick Station</label>
                            <select
                              value={routingPickStationId}
                              onChange={(e) => setRoutingPickStationId(e.target.value)}
                              className="w-full p-2.5 border-2 border-purple-200 rounded-lg text-sm font-bold focus:border-purple-500 outline-none"
                            >
                              <option value="">-- Choose Pick Station --</option>
                              {routingPickStations.map(ps => (
                                <option key={ps.id} value={ps.id}>{ps.name} — {ps.location}</option>
                              ))}
                            </select>
                          </div>
                        )}


                          {/* Fastfood Pickup Point Selector */}
                          {routingStrategy === 'fastfood_pickup_point' && (
                            <div className={`bg-white p-3 rounded-lg border border-orange-200 ${pickupPointAutoFilled ? 'bg-green-50/50' : ''}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <label className="text-[10px] font-black text-orange-800 uppercase">Fastfood Pickup Point</label>
                                {pickupPointAutoFilled && (
                                  <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold shadow-sm flex items-center gap-1">
                                    <FaLock className="h-2 w-2" /> CUSTOMER'S CHOICE (LOCKED)
                                  </span>
                                )}
                              </div>
                              <select
                                value={routingFastFoodPickupPointId}
                                onChange={(e) => { setRoutingFastFoodPickupPointId(e.target.value); setPickupPointAutoFilled(false); }}
                                disabled={pickupPointAutoFilled}
                                className={`w-full p-2.5 border-2 border-orange-200 rounded-lg text-sm font-bold focus:border-orange-500 outline-none transition-all ${pickupPointAutoFilled ? 'bg-gray-50 text-green-700 opacity-90 cursor-not-allowed border-green-200' : ''}`}
                              >
                                <option value="">-- Choose Fastfood Pickup Point --</option>
                                {routingFastFoodPickupPoints.map(fp => (
                                  <option key={fp.id} value={fp.id}>{fp.name} — {fp.address}</option>
                                ))}
                              </select>
                              {pickupPointAutoFilled && (
                                <p className="text-[10px] text-green-600 mt-2 italic font-medium">This pickup point was pre-selected by the customer during checkout.</p>
                              )}
                            </div>
                          )}

                        {/* Direct Delivery Info */}
                        {routingStrategy === 'direct_delivery' && (
                          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                            <p className="text-[10px] font-black text-green-800 uppercase mb-1">Direct to Customer</p>
                            <p className="text-sm text-green-700 font-medium">{selectedOrder.deliveryAddress || 'Address pending'}</p>
                            <p className="text-[10px] text-green-600 mt-1 italic">A driver will be assigned to collect from seller and deliver to this address.</p>
                          </div>
                        )}

                        {/* Routing Notes */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Routing Notes (visible to sellers)</label>
                          <textarea
                            value={routingNotes}
                            onChange={(e) => setRoutingNotes(e.target.value)}
                            className="w-full p-2 border rounded-lg text-sm"
                            rows="2"
                            placeholder="Special routing instructions..."
                          />
                        </div>

                        {/* Confirm Button */}
                        <button
                          onClick={() => handleAdminConfirm(selectedOrder.id)}
                          disabled={!routingStrategy || (routingStrategy === 'warehouse' && !routingWarehouseId) || (routingStrategy === 'pick_station' && !routingPickStationId) || (routingStrategy === 'fastfood_pickup_point' && !routingFastFoodPickupPointId)}
                          className={`w-full py-3 rounded-lg font-bold text-white transition-all ${(!routingStrategy || (routingStrategy === 'warehouse' && !routingWarehouseId) || (routingStrategy === 'pick_station' && !routingPickStationId) || (routingStrategy === 'fastfood_pickup_point' && !routingFastFoodPickupPointId))
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-amber-600 hover:bg-amber-700 active:scale-[0.98] shadow-lg'
                          }`}
                        >
                          Confirm Order &amp; Set Routing
                        </button>
                      </>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-red-500">Failed to load order analysis</div>
                    )}
                  </div>
                )}

                {/* Show current routing for already-confirmed orders */}
                {selectedOrder.adminRoutingStrategy && selectedOrder.status !== 'order_placed' && (
                  <div className="md:col-span-2 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                    <h4 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
                      <FaRoute className="text-emerald-600" />
                      Admin Routing (Confirmed)
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-emerald-600 font-black uppercase">Strategy</p>
                        <p className="text-sm font-bold text-emerald-800 capitalize">{selectedOrder.adminRoutingStrategy.replace(/_/g, ' ')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-emerald-600 font-black uppercase">Destination</p>
                        <p className="text-sm font-bold text-emerald-800">
                          {selectedOrder.adminRoutingStrategy === 'warehouse' && (selectedOrder.DestinationWarehouse?.name || 'Warehouse')}
                          {selectedOrder.adminRoutingStrategy === 'pick_station' && (selectedOrder.DestinationPickStation?.name || 'Pick Station')}
                          {selectedOrder.adminRoutingStrategy === 'fastfood_pickup_point' && (selectedOrder.DestinationFastFoodPickupPoint?.name || 'Fastfood Pickup Point')}
                          {selectedOrder.adminRoutingStrategy === 'direct_delivery' && 'Direct to Customer'}
                        </p>
                        {selectedOrder.adminRoutingStrategy === 'warehouse' && selectedOrder.DestinationWarehouse?.address && (
                          <p className="text-[10px] text-emerald-600">{selectedOrder.DestinationWarehouse.address}</p>
                        )}
                        {selectedOrder.adminRoutingStrategy === 'pick_station' && selectedOrder.DestinationPickStation?.location && (
                          <p className="text-[10px] text-emerald-600">{selectedOrder.DestinationPickStation.location}</p>
                        )}
                        {selectedOrder.adminRoutingStrategy === 'fastfood_pickup_point' && selectedOrder.DestinationFastFoodPickupPoint?.address && (
                          <p className="text-[10px] text-emerald-600">{selectedOrder.DestinationFastFoodPickupPoint.address}</p>
                        )}
                      </div>
                    </div>
                    {selectedOrder.adminRoutingNotes && (
                      <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                        <p className="text-[10px] text-emerald-600 font-bold uppercase">Routing Notes</p>
                        <p className="text-xs text-gray-700">{selectedOrder.adminRoutingNotes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Status Lifecycle */}
                <div className="md:col-span-2">
                  <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
                    Status Lifecycle
                  </h4>
                  {(() => {
                    const steps = buildOrderLifecycleSteps(selectedOrder);

                    return (
                      <div className="flex flex-wrap gap-4 items-start justify-between relative before:absolute before:h-0.5 before:bg-gray-100 before:top-4 before:left-0 before:right-0 before:-z-10">
                        {steps.map((step, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1 bg-white px-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}>
                              {step.done ? '✓' : idx + 1}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${step.done ? 'text-green-700' : 'text-gray-400'}`}>{step.label}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* OMS Logistics Info */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <FaTruck className="mr-2 text-gray-500" />
                    Logistics & Status
                  </h4>
                  <div className="mb-4">
                    <LogisticsDestination order={selectedOrder} />
                  </div>
                  <div className="text-sm text-gray-600 space-y-1 mb-4">
                    <p><strong>Logistics Type:</strong> {selectedOrder.shippingType ? selectedOrder.shippingType.replace(/_/g, ' ') : 'N/A'}</p>
                    <p><strong>Seller Confirmed:</strong> {selectedOrder.sellerConfirmed ? 'Yes' : 'No'}</p>
                    <p><strong>At Warehouse:</strong> {selectedOrder.warehouseArrivalDate ? formatDate(selectedOrder.warehouseArrivalDate) : 'No'}</p>
                    {selectedOrder.selfDispatcherName && (
                      <div className="mt-2 p-2 bg-indigo-50 border border-indigo-100 rounded text-[11px]">
                        <p className="font-bold text-indigo-800 border-b border-indigo-100 mb-1 flex items-center gap-1">
                          <FaUser className="text-[10px]" /> Internal Dispatcher Details:
                        </p>
                        <div className="flex justify-between items-start">
                          <div>
                            <p><strong>Name:</strong> {selectedOrder.selfDispatcherName}</p>
                            <p><strong>Contact:</strong> {selectedOrder.selfDispatcherContact}</p>
                            <p><strong>ETA:</strong> {selectedOrder.expectedWarehouseArrival ? formatDate(selectedOrder.expectedWarehouseArrival) : 'N/A'}</p>
                          </div>
                          <button
                            onClick={() => setActiveChat({
                              orderId: selectedOrder.id,
                              receiverId: selectedOrder.sellerId,
                              receiverName: `Dispatcher (${selectedOrder.selfDispatcherName})`
                            })}
                            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                            title="Chat with Dispatcher (routed to Seller)"
                          >
                            <FaComments size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Delivery Agent Info */}
                  {(selectedOrder.deliveryAgent || getOrderDeliveryTask(selectedOrder)) && (() => {
                    const task = getOrderDeliveryTask(selectedOrder);
                    const assignedAgent = selectedOrder.deliveryAgent || task?.deliveryAgent;
                    return (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2 flex items-center pt-4 border-t border-gray-100">
                          <FaTruck className="mr-2 text-blue-500" />
                          Assigned Delivery Agent
                        </h4>
                        <div className="text-sm text-gray-600 space-y-1 bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                          {assignedAgent ? (
                            <>
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <p className="flex justify-between gap-4"><strong>Name:</strong> <span>{assignedAgent.name}</span></p>
                                  <p className="flex justify-between gap-4">
                                    <strong>Phone:</strong>
                                    <span className="text-blue-600 font-bold">
                                      {assignedAgent.phone || assignedAgent.businessPhone || assignedAgent.additionalPhone || 'N/A'}
                                    </span>
                                  </p>
                                  <p className="flex justify-between gap-4"><strong>Email:</strong> <span>{assignedAgent.email}</span></p>
                                </div>
                                <button
                                  onClick={() => setActiveChat({
                                    orderId: selectedOrder.id,
                                    receiverId: assignedAgent.id,
                                    receiverName: assignedAgent.name
                                  })}
                                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                  title="Chat with Delivery Agent"
                                >
                                  <FaComments size={14} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <p className="italic text-gray-400">Driver assigned but details pending...</p>
                          )}

                          {/* Show task status if available */}
                          {task && (
                            <div className="mt-2 pt-2 border-t border-blue-100 flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Task Status:</span>
                              <DeliveryTaskBadge task={task} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* OMS Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {/* Manual Warehouse Receipt button removed to enforce code-based entry */}
                    {(selectedOrder.status === 'seller_confirmed' || selectedOrder.status === 'super_admin_confirmed') && (selectedOrder.shippingType === 'collected_from_seller' || selectedOrder.deliveryType === 'seller_to_warehouse') && (() => {
                      const pickupTask = getOrderDeliveryTask(selectedOrder);
                      const agentConfirmedCollection = pickupTask && ['in_progress', 'completed'].includes(pickupTask.status);
                      return (
                        <button
                          onClick={() => handleStatusUpdate(selectedOrder.id, 'en_route_to_warehouse')}
                          disabled={!agentConfirmedCollection}
                          className={`px-3 py-2 text-xs rounded font-medium ${agentConfirmedCollection
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          title={agentConfirmedCollection
                            ? 'Mark item as picked up and en route to warehouse'
                            : 'Locked: Waiting for delivery agent to confirm collection'
                          }
                        >
                          {agentConfirmedCollection ? 'Mark as Picked Up (En Route)' : '🔒 Picked Up (Awaiting Agent)'}
                        </button>
                      );
                    })()}
                    {selectedOrder.status === 'at_warehouse' && (
                      <div className="w-full">
                        <p className="text-xs text-green-600 font-medium mb-1">Item is at warehouse. Assign a driver to proceed.</p>
                      </div>
                    )}
                    {(selectedOrder.shippingType === 'shipped_from_seller'
                      && ['seller_confirmed', 'en_route_to_warehouse'].includes(selectedOrder.status)
                      && !(
                        isFastFoodOnlyOrder(selectedOrder)
                        || selectedOrder.orderCategory === 'fastfood'
                        || ['direct_delivery', 'fastfood_direct_delivery', 'fastfood_pickup_point'].includes(selectedOrder.adminRoutingStrategy)
                      )) && (
                      <div className="w-full p-2 bg-yellow-50 border border-yellow-100 rounded text-[10px] text-yellow-700 italic mb-2">
                        Assignment Locked: Waiting for item to arrive at warehouse (Seller is shipping to hub).
                      </div>
                    )}
                    {((selectedOrder.status === 'at_warehouse' || selectedOrder.status === 'at_warehouse' || selectedOrder.status === 'ready_for_pickup' || ['cancelled', 'failed'].includes(selectedOrder.status))
                      || (
                        ['seller_confirmed', 'super_admin_confirmed'].includes(selectedOrder.status)
                        && (
                          isFastFoodOnlyOrder(selectedOrder)
                          || selectedOrder.orderCategory === 'fastfood'
                          || ['direct_delivery', 'fastfood_direct_delivery', 'fastfood_pickup_point'].includes(selectedOrder.adminRoutingStrategy)
                          || ['cancelled', 'failed'].includes(selectedOrder.status)
                        )
                      )) && (() => {
                      const activeTask = getOrderDeliveryTask(selectedOrder);
                      // An order at_warehouse or ready_for_pickup is always re-assignable — old task is done
                      const isAtHub = ['at_warehouse', 'at_warehouse', 'ready_for_pickup'].includes(selectedOrder.status);
                      // Admins can ALWAYS override/re-assign even if an agent has accepted (to fix stuck processing orders)
                      const isLocked = false; 

                      return (
                        <div className="w-full">
                          <label className="block text-xs font-bold mb-1">Logistics Control:</label>
                          <button
                            onClick={() => {
                              setOrderToAssign(selectedOrder);
                              setIsAssignModalOpen(true);
                            }}
                            disabled={isLocked}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded transition-all ${isLocked
                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                              }`}
                          >
                            {isLocked ? (
                              <><FaLock size={12} /> Re-assignment Locked (Agent Active)</>
                            ) : (
                              <><FaUserPlus size={12} /> {(selectedOrder.deliveryAgentId || activeTask?.deliveryAgentId) ? 'Change assigned agent' : 'Assign delivery agent'}</>
                            )}
                          </button>
                          {(selectedOrder.deliveryAgentId || activeTask?.deliveryAgentId) && !isLocked && (
                            <button
                              onClick={() => handleUnassignDriver(selectedOrder.id)}
                              className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded bg-red-50 text-red-600 hover:bg-red-100 transition-all border border-red-200"
                            >
                              <FaUserMinus size={12} /> Unassign Delivery Agent
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Chat / Communication Log */}
                <div className="md:col-span-2 mt-4 border-t pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-medium text-gray-900">Admin-Seller Communication</h4>
                    <button
                      onClick={() => setActiveChat({
                        orderId: selectedOrder.id,
                        receiverId: selectedOrder.sellerId,
                        receiverName: `Seller (${selectedOrder.seller?.name || 'Unknown'})`
                      })}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <FaComments /> Open Chat with Seller
                    </button>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border h-48 overflow-y-auto mb-2 flex flex-col gap-2">
                    {communicationLog.length === 0 ? (
                      <p className="text-xs text-gray-500 italic text-center mt-4">No messages yet. Click "Open Chat" to start a conversation.</p>
                    ) : (
                      communicationLog.map((msg, i) => (
                        <div key={i} className={`max-w-[80%] p-2 rounded ${msg.sender === 'admin' ? 'bg-blue-100 self-end ml-auto' : 'bg-white border self-start'}`}>
                          <div className="flex justify-between gap-4 text-[10px] mb-1">
                            <span className="font-bold">{msg.senderName}</span>
                            <span className="text-gray-400">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-xs">{msg.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Related Orders from this Checkout */}
              {selectedOrder.checkoutGroupId && (() => {
                const groupOrders = orders.filter(o => o.checkoutGroupId === selectedOrder.checkoutGroupId);
                const relatedOrders = groupOrders.filter(o => o.id !== selectedOrder.id);
                if (relatedOrders.length === 0) return null;
                const uniqueSellersCount = new Set(groupOrders.map(o => o.seller?.id || o.sellerId)).size;
                return (
                <div className="mt-6 col-span-1 md:col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="font-bold text-gray-900 border-l-4 border-orange-500 pl-3">Checkout Group Orders</h4>
                    {uniqueSellersCount > 1 && (
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">MULTI-SELLER SHIPMENT</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {relatedOrders.map(related => (
                      <div
                        key={related.id}
                        onClick={() => setSelectedOrder(related)}
                        className="p-3 bg-orange-50 border border-orange-100 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors group relative overflow-hidden"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-orange-800">#{related.orderNumber}</span>
                          <div className="flex items-center gap-1">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${orderStatuses[related.status]?.bg || 'bg-gray-100'} ${orderStatuses[related.status]?.color || 'text-gray-600'}`}>
                              {orderStatuses[related.status]?.label || related.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-600 truncate">Seller: {related.seller?.name || 'Unknown'}</p>
                        <p className="text-xs font-bold text-gray-900 mt-1">{formatPrice(related.total)}</p>
                        <div className="absolute bottom-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <FaEye size={10} className="text-orange-400" />
                        </div>
                      </div>
                    ))}
                    <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center opacity-60">
                      <p className="text-[10px] font-bold text-gray-400">CURRENT SELECTION</p>
                      <p className="text-[9px] text-gray-400">#{selectedOrder.orderNumber}</p>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Order Items Tabulated View */}
              {selectedOrder.OrderItems && selectedOrder.OrderItems.length > 0 && (
                <div className="mt-8 col-span-1 md:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-gray-900 border-l-4 border-blue-600 pl-3">Order Items Breakdown</h4>
                    <span className="text-xs text-gray-500 italic">Individual item logistics & pricing</span>
                  </div>
                  <div className="overflow-x-auto border rounded-xl shadow-sm bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product Info</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Seller Details</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Marketer</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customer Total</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Seller Earning</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 italic-last-row">
                        {selectedOrder.OrderItems.map((item) => {
                          const seller = item.seller || item.Product?.seller || item.FastFood?.vendorDetail || selectedOrder.seller;
                          const sellerItemEarning = getItemSellerEarning(item);
                          const itemComm = (selectedOrder.Commissions || []).find(c =>
                            (item.productId && c.productId === item.productId) ||
                            (item.fastFoodId && c.fastFoodId === item.fastFoodId)
                          );
                          const marketer = itemComm?.marketer;

                          // Use the delivery fee stored in the database
                          const itemDeliveryFee = Number(item.deliveryFee || 0);

                          return (
                            <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                              {/* Product Info */}
                              <td className="px-4 py-4 min-w-[200px]">
                                <div className="flex gap-3">
                                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden border">
                                    <img
                                      src={resolveImageUrl(item.Product?.coverImage || item.Product?.images?.[0] || item.FastFood?.mainImage)}
                                      alt={item.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                                      crossOrigin="anonymous"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="text-sm font-bold text-gray-900 leading-tight flex items-center gap-2">
                                      {item.itemLabel || item.name}
                                      {item.returnStatus && item.returnStatus !== 'none' && (
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter ${
                                          item.returnStatus === 'requested' ? 'bg-orange-100 text-orange-700' :
                                          item.returnStatus === 'approved' ? 'bg-indigo-100 text-indigo-700' :
                                          item.returnStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                                          'bg-green-100 text-green-700'
                                        }`}>
                                          Return: {item.returnStatus}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-gray-500 font-medium">
                                      Qty: <span className="text-blue-600">{item.quantity}</span>
                                    </div>
                                    {/* Specific Details */}
                                    {item.FastFood && (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {ensureArray(item.FastFood.ingredients).slice(0, 3).map((ing, idx) => {
                                          const { name } = normalizeIngredient(ing);
                                          return name && (
                                            <span key={idx} className="bg-gray-100 text-[9px] px-1 rounded text-gray-600 whitespace-nowrap">
                                              {name}
                                            </span>
                                          );
                                        })}
                                        {ensureArray(item.FastFood.ingredients).length > 3 && (
                                          <span className="text-[9px] text-gray-400">+{ensureArray(item.FastFood.ingredients).length - 3} more</span>
                                        )}
                                      </div>
                                    )}
                                    {item.FastFood && ensureArray(item.FastFood.allergens).length > 0 && (
                                      <div className="mt-1 text-[9px] text-red-500 font-bold uppercase tracking-tight">
                                        Allergens: {ensureArray(item.FastFood.allergens).join(', ')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Seller Details */}
                              <td className="px-4 py-4">
                                <div className="space-y-0.5">
                                  <div className="text-xs font-bold text-gray-800">{seller?.name || 'N/A'}</div>
                                  <div className="text-[10px] text-gray-500 break-all max-w-[120px]">{seller?.email || 'N/A'}</div>
                                  <div className="mt-1">
                                    <span className="text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                      {item.itemType === 'fastfood' ? 'Food Vendor' : 'Product Seller'}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Marketer */}
                              <td className="px-4 py-4">
                                {marketer ? (
                                  <div className="space-y-0.5">
                                    <div className="text-xs font-bold text-indigo-600">{marketer.name}</div>
                                    <div className="text-[10px] text-indigo-400">Code: <span className="font-bold">{itemComm.referralCode}</span></div>
                                    <div className="text-[9px] text-gray-400">Comm: {formatPrice(itemComm.commissionAmount)}</div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-300 italic">Organic Sale</span>
                                )}
                              </td>

                              {/* Customer Prices */}
                              <td className="px-4 py-4 text-right">
                                <div className="text-sm font-bold text-gray-900">
                                  {formatPrice((item.total || (item.price * item.quantity)) + itemDeliveryFee)}
                                </div>
                              </td>

                              {/* Seller Earning */}
                              <td className="px-4 py-4 text-right">
                                <div className="text-sm font-bold text-green-600">
                                  {formatPrice(sellerItemEarning)}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Sub-totals summary in the item list section */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                    <div className="bg-blue-50 p-2 rounded border border-blue-100">
                      <p className="text-[9px] uppercase text-blue-600 font-bold">Total Customer Pay</p>
                      <p className="text-sm font-black text-blue-900">{formatPrice(selectedOrder.total)}</p>
                    </div>
                    <div className="bg-green-50 p-2 rounded border border-green-100">
                      <p className="text-[9px] uppercase text-green-600 font-bold">Total Seller Payout</p>
                      <p className="text-sm font-black text-green-900">{formatPrice(getOrderSellerPayout(selectedOrder))}</p>
                    </div>
                    <div className="bg-amber-50 p-2 rounded border border-amber-100">
                      <p className="text-[9px] uppercase text-amber-600 font-bold">Total D. Fees</p>
                      <p className="text-sm font-black text-amber-900">{formatPrice(selectedOrder.deliveryFee || 0)}</p>
                    </div>
                    <div className="bg-indigo-50 p-2 rounded border border-indigo-100">
                      <p className="text-[9px] uppercase text-indigo-600 font-bold">Gross Platform Margin</p>
                      <p className="text-sm font-black text-indigo-900">{formatPrice(selectedOrder.total - getOrderSellerPayout(selectedOrder) - (selectedOrder.deliveryFee || 0))}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }

      {/* Chat Overlay Modal */}
      {
        activeChat && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
              <div className="relative">
                <button
                  onClick={() => setActiveChat(null)}
                  className="absolute top-3 right-4 z-10 p-1.5 bg-white/80 hover:bg-white rounded-full text-gray-400 hover:text-gray-600 shadow-sm transition-colors border border-gray-100"
                >
                  <FaTimes size={16} />
                </button>
                <DeliveryChat
                  orderId={activeChat.orderId}
                  receiverId={activeChat.receiverId}
                  receiverName={activeChat.receiverName}
                />
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}