import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FaTruck,
  FaMapMarkedAlt,
  FaClipboardCheck,
  FaClock,
  FaCheckCircle,
  FaExclamationCircle,
  FaBox,
  FaChevronDown,
  FaChevronUp,
  FaMotorcycle,
  FaStore,
  FaComments,
  FaLocationArrow,
  FaSearch,
  FaMobileAlt
} from 'react-icons/fa';
import { useOutletContext, Link } from 'react-router-dom';
import api from '../../../services/api';
import { resolveImageUrl } from '../../../utils/imageUtils';
import { formatPrice } from '../../../utils/currency';
import CollectionConfirmationModal from '../../../components/delivery/CollectionConfirmationModal';
import PaymentVerificationModal from '../../../components/delivery/PaymentVerificationModal';
import DeliveryChat from '../../../components/delivery/DeliveryChat';
import DeliveryTaskConsole from '../../../components/delivery/DeliveryTaskConsole';
import HandoverCodeWidget from '../../../components/delivery/HandoverCodeWidget';

const getLatestTask = (order) => {
  if (!order.deliveryTasks || order.deliveryTasks.length === 0) return null;
  return [...order.deliveryTasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
};

const DeliveryAgentOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);

  // Delivery & Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatOrder, setChatOrder] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [autoGenerateCodeOrderId, setAutoGenerateCodeOrderId] = useState(null);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [isBulkHandover, setIsBulkHandover] = useState(false);

  const [agentSharePercent, setAgentSharePercent] = useState(70);
  const [blockingReason, setBlockingReason] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [activeTab, setActiveTab] = useState('in_progress'); // 'in_progress', 'completed', 'cancelled'
  
  // Deterministic color generation for grouping
  const getRouteColor = (pickup, destination) => {
    if (!pickup || !destination) return '#CBD5E1'; // Slate-300
    const str = `${pickup}-${destination}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 70%, 45%)`;
  };

  const getEffectiveDeliveryType = (order) => {
    const task = getLatestTask(order);
    const taskType = task?.deliveryType;
    const orderType = order.deliveryType;
    const status = order.status;
    const routing = order.adminRoutingStrategy;
    
    // Core correction: if it's an early stage but task says Leg 2+, override to Leg 1
    const isEarlyStage = ['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse', 'assigned', 'accepted', 'arrived_at_pickup', 'request_pending', 'requested', 'processing', 'awaiting_delivery_assignment', 'in_transit'].includes(status);
    if (isEarlyStage && routing === 'warehouse') return 'seller_to_warehouse';
    if (isEarlyStage && (routing === 'pick_station' || routing === 'fastfood_pickup_point')) return 'seller_to_pickup_station';
    if (isEarlyStage && routing === 'direct_delivery') return 'seller_to_customer';

    return taskType || orderType || 'seller_to_warehouse';
  };

  const getPickupLabel = (order) => {
    const type = getEffectiveDeliveryType(order);
    if (type?.startsWith('warehouse')) return order.Warehouse?.name || 'Warehouse';
    if (type?.startsWith('pickup_station')) return order.PickupStation?.name || 'Station';
    return order.seller?.businessName || order.seller?.name || 'Seller';
  };

  const getDestinationLabel = (order) => {
    const type = getEffectiveDeliveryType(order);
    if (type?.endsWith('warehouse')) return order.DestinationWarehouse?.name || 'Warehouse';
    if (type?.endsWith('pickup_station')) return (order.DestinationPickStation?.name || order.PickupStation?.name || 'Station');
    return 'Customer';
  };
  const [searchQuery, setSearchQuery] = useState('');
  const activeTabRef = React.useRef('in_progress'); // Ref to avoid stale closures in polling
  
  // Real-time context from DeliveryAgentDashboard Shell
  const { lastUpdate } = useOutletContext() || {};

  const isPollingRef = React.useRef(false);
  const failureCountRef = React.useRef(0);
  const intervalRef = React.useRef(null);
  const locationPushRef = useRef(null);
  const latestLocRef = useRef(null);

  // Silently push GPS location to backend every 15s when an active task exists
  const startLocationPush = () => {
    if (locationPushRef.current) return; // already running
    if (!('geolocation' in navigator) || window._geoDenied) return;

    navigator.geolocation.watchPosition(
      (pos) => { latestLocRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      (err) => { if (err.code === 1) window._geoDenied = true; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    locationPushRef.current = setInterval(async () => {
      const loc = latestLocRef.current;
      if (!loc) return;
      try { await api.patch('/delivery/profile/location', loc); } catch (_) {}
    }, 15000);
  };

  const stopLocationPush = () => {
    if (locationPushRef.current) { clearInterval(locationPushRef.current); locationPushRef.current = null; }
  };

  useEffect(() => {
    loadMyDeliveries();
    loadFinanceConfig();
    return () => stopLocationPush();
  }, []); // Initial load

  // React to socket updates — use activeTabRef to avoid stale closure
  useEffect(() => {
    if (lastUpdate && lastUpdate !== null) {
      loadMyDeliveries(false, activeTabRef.current);
    }
  }, [lastUpdate]);

  // Removed aggressive 30s polling; relying entirely on real-time sockets context (lastUpdate).

  // Start/stop GPS push based on whether there are in-progress orders
  useEffect(() => {
    const hasActiveTask = orders.some(o => {
      const task = getLatestTask(o);
      return task && ['assigned', 'in_progress', 'arrived_at_pickup'].includes(task.status);
    });
    if (hasActiveTask) startLocationPush();
    else stopLocationPush();
  }, [orders]);

  const loadFinanceConfig = useCallback(async () => {
    try {
      const res = await api.get('/finance/config');
      if (res.data?.agentShare != null) {
        setAgentSharePercent(parseFloat(res.data.agentShare));
      }
    } catch (err) {
      console.warn('Failed to load agent share config, using fallback');
    }
  }, []);

  const loadMyDeliveries = useCallback(async (showLoading = true, tab = activeTab) => {
    try {
      if (showLoading) setLoading(true);
      
      let endpoint = `/delivery/orders?tab=${tab}`;
      if (tab === 'completed') {
        endpoint = '/delivery/orders?history=true';
      } else if (tab === 'cancelled') {
        endpoint = '/delivery/orders?cancelled=true';
      }

      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      
      const res = await api.get(`${endpoint}${params.toString() ? (endpoint.includes('?') ? '&' : '?') + params.toString() : ''}`);
      setOrders(res.data.data || []);
      setBlockingReason(res.data.blockingReason || null);
      setMissingFields(res.data.missingFields || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load deliveries:', err);
      if (showLoading) setError('Failed to load your assignments. Please try again.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [activeTab, searchQuery]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      loadMyDeliveries(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    activeTabRef.current = tab; // Keep ref in sync
    setVisibleCount(20); // Reset to default page size
    loadMyDeliveries(true, tab);
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      const res = await api.patch(`/delivery/orders/${orderId}/status`, { status: newStatus });
      if (res.data) {
        setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      }
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.message || err.message));
    }
  };

  const openDeliveryFlow = (order) => {
    setSelectedOrder(order);
    // Force payment verification if it's COD and not yet paid
    const isCOD = order.paymentType === 'cash_on_delivery';
    const isPaid = order.paymentConfirmed;

    if (isCOD && !isPaid) {
      setShowPaymentModal(true);
    }
  };

  const handleBulkHandover = () => {
    if (selectedOrders.length < 2) return;
    
    // Check if they all belong to the same route for bulk processing
    const firstOrder = orders.find(o => o.id === selectedOrders[0]);
    if (!firstOrder) return;

    const p1 = getPickupLabel(firstOrder);
    const d1 = getDestinationLabel(firstOrder);
    
    const mismatched = selectedOrders.some(id => {
      const o = orders.find(ord => ord.id === id);
      return getPickupLabel(o) !== p1 || getDestinationLabel(o) !== d1;
    });

    if (mismatched) {
      alert('Bulk Handover is only available for orders with the SAME pickup and destination points. Please refine your selection.');
      return;
    }

    // Set the representative order for the handover UI
    setSelectedOrder(firstOrder);
    setIsBulkHandover(true); 
    setShowHandoverModal(true); 
  };

  const handlePaymentVerified = () => {
    if (selectedOrder?.id) {
      const paidOrderId = selectedOrder.id;
      setOrders(prev => prev.map(o => o.id === paidOrderId ? { ...o, paymentConfirmed: true } : o));
      setSelectedOrder(prev => prev ? { ...prev, paymentConfirmed: true } : prev);
      setAutoGenerateCodeOrderId(paidOrderId);
    }
    setShowPaymentModal(false);
    alert('Payment confirmed. Delivery code is now generated for customer confirmation.');
    loadMyDeliveries(false);
  };

  const handleHandoverConfirmed = useCallback(() => {
    alert('Handover confirmed!');
    loadMyDeliveries();
  }, [loadMyDeliveries]);

  const handleDropoffHandoverConfirmed = useCallback(() => {
    setAutoGenerateCodeOrderId(null);
    loadMyDeliveries();
  }, [loadMyDeliveries]);
  
  const handleQuickPush = async (order) => {
    if (!order.customerPhone) {
      alert('Customer phone number missing for M-Pesa Push');
      return;
    }
    try {
      const res = await api.post('/payments/mpesa/initiate', {
        orderId: order.id,
        phoneNumber: order.customerPhone,
        amount: order.total
      });
      if (res.data.success) {
        alert(`M-Pesa Push sent to ${order.customerPhone}. Waiting for confirmation...`);
        setSelectedOrder(order);
        setShowPaymentModal(true);
      }
    } catch (err) {
      alert('Push failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleAcceptTask = async (taskId) => {
    try {
      await api.post(`/delivery/tasks/${taskId}/accept`);
      loadMyDeliveries();
    } catch (err) {
      alert('Failed to accept task: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleRejectTask = async (taskId) => {
    const reason = prompt("Please provide a reason for rejection:");
    if (!reason) return;
    try {
      await api.post(`/delivery/tasks/${taskId}/reject`, { reason });
      loadMyDeliveries();
    } catch (err) {
      alert('Failed to reject task: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleConfirmCollection = async (taskId, notes) => {
    try {
      const res = await api.post(`/delivery/tasks/${taskId}/confirm-collection`, {
        notes,
        location: null
      });

      if (res.data.success) {
        alert('Collection confirmed successfully!');
        loadMyDeliveries();
      }
    } catch (err) {
      console.error('Failed to confirm collection:', err);
      throw err;
    }
  };

  const handleMarkArrived = async (taskId) => {
    try {
      const res = await api.post(`/delivery/tasks/${taskId}/mark-arrived`);
      if (res.data.success) {
        alert('Arrival confirmed!');
        loadMyDeliveries();
      }
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleHubArrival = async (task) => {
    const isWarehouse = task.deliveryType.includes('warehouse');
    const destinationName = isWarehouse ? 'warehouse' : 'pickup station';

    if (!confirm(`Confirm that the item has arrived at the ${destinationName}?`)) return;
    try {
      await api.patch(`/delivery/tasks/${task.id}/status`, {
        status: 'completed',
        agentNotes: `Item delivered to ${destinationName}`
      });
      alert(`Arrival confirmed! Order is now at ${destinationName}.`);
      loadMyDeliveries();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const openCollectionModal = (task, parentOrder) => {
    const enrichedTask = { ...task, order: parentOrder };
    setSelectedTask(enrichedTask);
    setShowCollectionModal(true);
  };

  const toggleExpand = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const handleSelectOrder = (orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleBulkStatusChange = async (targetAction) => {
    if (selectedOrders.length === 0) return;
    if (targetAction === 'delivered') {
      alert('Bulk delivered is disabled. Each order must be completed with a unique customer confirmation code.');
      return;
    }
    setBulkProcessing(true);
    try {
      for (const orderId of selectedOrders) {
        const order = orders.find(o => o.id === orderId);
        const task = order ? getLatestTask(order) : null;
        if (!task) continue;
        const taskId = task.id;

        if (targetAction === 'accept') {
          if (task.status === 'assigned') {
            await api.post(`/delivery/tasks/${taskId}/accept`);
          }
        } else if (targetAction === 'reject') {
          if (task.status === 'assigned') {
             // For bulk rejection, we use a default reason or could prompt
             await api.post(`/delivery/tasks/${taskId}/reject`, { reason: 'Bulk rejection by agent' });
          }
        } else if (targetAction === 'arrived') {
          if (task.status === 'accepted') {
            await api.post(`/delivery/tasks/${taskId}/mark-arrived`);
          }
        } else if (targetAction === 'collected') {
          if (task.status === 'arrived_at_pickup') {
            await api.post(`/delivery/tasks/${taskId}/confirm-collection`, { notes: 'Bulk collection confirmed' });
          }
        }
      }
      alert(`Bulk action "${targetAction}" completed for ${selectedOrders.length} orders.`);
      setSelectedOrders([]);
      loadMyDeliveries();
    } catch (err) {
      alert('One or more bulk updates failed. Please refresh and try individual updates.');
    } finally {
      setBulkProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {activeTab === 'in_progress' ? 'Active Assignments' : activeTab === 'completed' ? 'Delivery History' : 'Cancelled Assignments'}
            </h2>
            <p className="text-sm text-gray-500">
              {activeTab === 'in_progress' ? 'Manage your active pickups and deliveries' : activeTab === 'completed' ? 'View your past successful deliveries' : 'History of failed or rejected assignments'}
            </p>
          </div>

          <div className="w-full md:flex-1 md:max-w-md px-0 md:px-4 mt-4 md:mt-0">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search order # or tracking #..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto mt-4 md:mt-0">
            <button
              onClick={() => handleTabChange('in_progress')}
              className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'in_progress' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              In Progress
            </button>
            <button
              onClick={() => handleTabChange('completed')}
              className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'completed' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Completed
            </button>
            <button
              onClick={() => handleTabChange('cancelled')}
              className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'cancelled' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Cancelled
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center">
              <FaExclamationCircle className="mr-2" /> {error}
            </div>
          )}

          {/* Bulk Agent Action Bar */}
          {selectedOrders.length > 0 && (
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-lg border border-blue-400/30 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 relative">
              <div className="flex items-center gap-3">
                <div className="bg-white text-blue-700 px-3 py-1 rounded-full text-sm font-black shadow-inner">
                  {selectedOrders.length}
                </div>
                <div className="text-white">
                  <p className="text-sm font-black leading-none italic">Bulk Agent Operations</p>
                  <p className="text-[10px] text-blue-100 font-bold uppercase tracking-wider mt-1 opacity-80">Action multiple shipments at once</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {(() => {
                  const selTasks = selectedOrders.map(id => {
                    const o = orders.find(ord => ord.id === id);
                    return o ? getLatestTask(o) : null;
                  });
                  const hasAssigned = selTasks.some(t => t?.status === 'assigned');
                  const hasAccepted = selTasks.some(t => t?.status === 'accepted');
                  const hasArrived = selTasks.some(t => t?.status === 'arrived_at_pickup');
                  
                  return (
                    <>
                      {hasAssigned && (
                        <>
                          <button
                            onClick={() => handleBulkStatusChange('accept')}
                            disabled={bulkProcessing}
                            className="px-4 py-2 bg-emerald-500/30 hover:bg-emerald-500/50 text-white border border-emerald-400/50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                          >
                            <FaClipboardCheck className="h-3 w-3" /> Accept All
                          </button>
                          <button
                            onClick={() => handleBulkStatusChange('reject')}
                            disabled={bulkProcessing}
                            className="px-4 py-2 bg-red-500/30 hover:bg-red-500/50 text-white border border-red-400/50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                          >
                            <FaExclamationCircle className="h-3 w-3" /> Reject All
                          </button>
                        </>
                      )}
                      
                      {hasAccepted && (
                        <button
                          onClick={() => handleBulkStatusChange('arrived')}
                          disabled={bulkProcessing}
                          className="px-4 py-2 bg-indigo-500/30 hover:bg-indigo-500/50 text-white border border-indigo-400/50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                          <FaMapMarkedAlt className="h-3 w-3" /> Mark Arrived
                        </button>
                      )}

                      {hasArrived && (
                         <button
                          onClick={() => handleBulkStatusChange('collected')}
                          disabled={bulkProcessing}
                          className="px-4 py-2 bg-green-500/30 hover:bg-green-500/50 text-white border border-green-400/50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                          <FaBox className="h-3 w-3" /> Confirm Collected
                        </button>
                      )}

                      {(hasArrived || selTasks.some(t => t?.status === 'in_progress')) && selectedOrders.length >= 2 && (
                         <button
                          onClick={() => handleBulkHandover()}
                          disabled={bulkProcessing}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg"
                        >
                          <FaCheckCircle className="h-3 w-3" /> Bulk Handover ({selectedOrders.length})
                        </button>
                      )}
                    </>
                  );
                })()}
                
                <button
                  onClick={() => setSelectedOrders([])}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
              </div>

              {bulkProcessing && (
                <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 text-white font-black text-xs uppercase animate-pulse">
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Syncing Assignments...
                  </div>
                </div>
              )}
            </div>
          )}

          {blockingReason ? (
            <div className="text-center py-12 bg-red-50 rounded-lg border-2 border-dashed border-red-200">
              <FaCheckCircle className="mx-auto h-12 w-12 text-red-400 mb-4 rotate-180" />
              <h3 className="text-lg font-medium text-red-900">Access Restricted</h3>
              <p className="mt-2 text-sm text-red-600 max-w-md mx-auto">{blockingReason}</p>
              {missingFields.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {missingFields.map(f => (
                    <span key={f} className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded uppercase tracking-wider">{f}</span>
                  ))}
                </div>
              )}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => loadMyDeliveries()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Check Status Again
                </button>
                <Link
                  to="/delivery/account"
                  className="inline-flex items-center px-4 py-2 border border-red-200 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  Set Delivery Profile
                </Link>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FaTruck className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p>
                {searchQuery
                 ? 'No assignments match your search.'
                 : activeTab === 'in_progress' ? 'No active assignments found.' :
                 activeTab === 'completed' ? 'No completed deliveries found.' :
                 'No cancelled or failed assignments.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-8">
              {(() => {
                const filtered = orders.filter(o => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
                    (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q)) ||
                    (o.user?.name && o.user.name.toLowerCase().includes(q)) ||
                    (o.user?.county && o.user.county.toLowerCase().includes(q)) ||
                    (o.user?.town && o.user.town.toLowerCase().includes(q)) ||
                    (o.user?.estate && o.user.estate.toLowerCase().includes(q)) ||
                    (o.user?.houseNumber && o.user.houseNumber.toLowerCase().includes(q)) ||
                    (o.deliveryAddress && o.deliveryAddress.toLowerCase().includes(q)) ||
                    (o.addressDetails && o.addressDetails.toLowerCase().includes(q))
                  );
                });

                // Group by Route
                const groups = {};
                filtered.forEach(order => {
                  const pickup = getPickupLabel(order);
                  const destination = getDestinationLabel(order);
                  const key = `${pickup} → ${destination}`;
                  if (!groups[key]) groups[key] = { items: [], color: getRouteColor(pickup, destination), pickup, destination };
                  groups[key].items.push(order);
                });

                return Object.entries(groups).map(([routeKey, group]) => (
                  <div key={routeKey} className="space-y-4">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: group.color }}></div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                          Route: <span className="text-gray-900">{routeKey}</span>
                          <span className="ml-2 text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full lowercase font-bold tracking-normal">
                            {group.items.length} shipment{group.items.length !== 1 ? 's' : ''}
                          </span>
                        </h4>
                      </div>
                      <button 
                        onClick={() => {
                          const allIds = group.items.map(o => o.id);
                          const allSelected = allIds.every(id => selectedOrders.includes(id));
                          if (allSelected) {
                            setSelectedOrders(prev => prev.filter(id => !allIds.includes(id)));
                          } else {
                            setSelectedOrders(prev => [...new Set([...prev, ...allIds])]);
                          }
                        }}
                        className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 transition-all"
                      >
                        {group.items.every(o => selectedOrders.includes(o.id)) ? 'Deselect Group' : 'Select Group'}
                      </button>
                    </div>

                    <div className="grid gap-4">
                      {group.items.slice(0, visibleCount).map((order) => {
                         const task = getLatestTask(order);
                         if (!task) return null;
                         
                         const effectiveType = getEffectiveDeliveryType(order);
                         
                         let collectHandoverType = 'seller_to_agent';
                         if (effectiveType?.startsWith('warehouse')) collectHandoverType = 'warehouse_to_agent';
                         else if (effectiveType?.startsWith('pickup_station')) collectHandoverType = 'station_to_agent';

                         let dropoffHandoverType = 'agent_to_customer';
                         let isCustomerDropoff = true;
                         if (effectiveType?.endsWith('_to_warehouse')) { dropoffHandoverType = 'agent_to_warehouse'; isCustomerDropoff = false; }
                         else if (effectiveType?.endsWith('_to_station')) { dropoffHandoverType = 'agent_to_station'; isCustomerDropoff = false; }

                         return (
                        <DeliveryTaskConsole
                          key={order.id}
                          order={order}
                          agentSharePercent={agentSharePercent}
                          isExpanded={expandedOrderId === order.id}
                          onToggleExpand={() => toggleExpand(order.id)}
                          groupColor={group.color}
                          isSelected={selectedOrders.includes(order.id)}
                          checkbox={
                            <input
                              type="checkbox"
                              checked={selectedOrders.includes(order.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleSelectOrder(order.id);
                              }}
                              style={{ accentColor: group.color }}
                              className="w-4 h-4 rounded border-gray-300 transition-all cursor-pointer"
                            />
                          }
                        >
                           <div className="flex gap-2 w-full justify-end flex-wrap">
                              {/* Chat */}
                              {['accepted', 'in_transit', 'arrived_at_pickup', 'in_progress'].includes(task.status) && (
                                <button onClick={(e) => { e.stopPropagation(); setChatOrder(order); setShowChatModal(true); }} className="px-4 py-2 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-100 border border-blue-200 flex items-center gap-2">
                                  <FaComments /> Chat
                                </button>
                              )}
                              
                              {/* Accept/Reject */}
                              {task.status === 'assigned' ? (
                                <div className="flex gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); handleAcceptTask(task.id); }} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700">Accept</button>
                                  <button onClick={(e) => { e.stopPropagation(); handleRejectTask(task.id); }} className="px-4 py-2 bg-red-100 text-red-700 text-xs font-bold rounded-lg">Reject</button>
                                </div>
                              ) : (
                                <>
                                  {task.status === 'accepted' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleMarkArrived(task.id); }} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg flex items-center gap-2">
                                      <FaMapMarkedAlt /> Arrived
                                    </button>
                                  )}

                                  {/* Pickup Flow */}
                                  {['accepted', 'arrived_at_pickup'].includes(task.status) && (
                                    <div className="w-full mt-2">
                                      {task.status === 'arrived_at_pickup' && (
                                        <HandoverCodeWidget mode="receiver" handoverType={collectHandoverType} orderId={order.id} taskId={task.id} onConfirmed={handleHandoverConfirmed} />
                                      )}
                                    </div>
                                  )}

                                  {/* Dropoff Flow */}
                                  {task.status === 'in_progress' && (
                                    <div className="w-full mt-2">
                                       <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                                          {isCustomerDropoff && order.paymentType === 'cash_on_delivery' && !order.paymentConfirmed ? (
                                             <div className="flex flex-col gap-2">
                                                <p className="text-xs text-amber-700 font-bold bg-amber-50 rounded-lg px-3 py-1">💰 Payment required</p>
                                                <div className="flex gap-2">
                                                   <button onClick={(e) => { e.stopPropagation(); openDeliveryFlow(order); }} className="flex-1 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg">Verify Payment</button>
                                                   <button onClick={(e) => { e.stopPropagation(); handleQuickPush(order); }} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2"><FaMobileAlt /> Push M-Pesa</button>
                                                </div>
                                             </div>
                                          ) : (
                                             <HandoverCodeWidget mode="giver" handoverType={dropoffHandoverType} orderId={order.id} taskId={task.id} buttonLabel={isCustomerDropoff ? "Mark Delivered" : "Dispatch"} autoGenerate={autoGenerateCodeOrderId === order.id} onConfirmed={handleDropoffHandoverConfirmed} />
                                          )}
                                       </div>
                                    </div>
                                  )}
                                </>
                              )}
                           </div>
                        </DeliveryTaskConsole>
                      )})}
                    </div>
                  </div>
                ));
              })()}

              {/* Load More */}
              {orders.length > visibleCount && (
                <div className="text-center pt-6">
                  <button onClick={() => setVisibleCount(c => c + 20)} className="px-6 py-2.5 bg-blue-50 text-blue-700 font-bold text-sm rounded-xl border border-blue-200">
                    Load More ({orders.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <CollectionConfirmationModal
        isOpen={showCollectionModal}
        task={selectedTask}
        onClose={() => { setShowCollectionModal(false); setSelectedTask(null); }}
        onConfirm={handleConfirmCollection}
      />

      <PaymentVerificationModal
        isOpen={showPaymentModal}
        order={selectedOrder}
        onClose={() => { setShowPaymentModal(false); setSelectedOrder(null); }}
        onPaymentVerified={handlePaymentVerified}
      />

      {showChatModal && chatOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <FaComments className="text-xl" />
                <div>
                  <h3 className="font-bold">Chat with Admin</h3>
                  <p className="text-[10px] text-blue-100 italic">Order #{chatOrder.orderNumber}</p>
                </div>
              </div>
              <button onClick={() => setShowChatModal(false)} className="text-white hover:text-blue-100 text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <DeliveryChat orderId={chatOrder.id} receiverId={1} receiverName="System Administrator" />
            </div>
            <div className="p-4 bg-gray-50 border-t text-center">
              <button onClick={() => setShowChatModal(false)} className="text-xs font-bold text-gray-500 hover:text-gray-700">Close Chat</button>
            </div>
          </div>
        </div>
      )}

      {/* Add the Bulk Handover Modal/Widget Container */}
      {showHandoverModal && selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                  <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
                      <h3 className="font-black uppercase tracking-widest text-sm">Bulk Handover ({selectedOrders.length} Orders)</h3>
                      <button onClick={() => setShowHandoverModal(false)} className="text-xl font-bold">&times;</button>
                  </div>
                  <div className="p-6">
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Route</p>
                          <p className="text-xs font-bold text-gray-800">{getPickupLabel(selectedOrder)} → {getDestinationLabel(selectedOrder)}</p>
                      </div>
                      <HandoverCodeWidget
                          mode={getLatestTask(selectedOrder)?.status === 'arrived_at_pickup' ? 'receiver' : 'giver'}
                          handoverType={(() => {
                              const task = getLatestTask(selectedOrder);
                              if (task?.status === 'arrived_at_pickup') {
                                  if (task.deliveryType?.startsWith('warehouse')) return 'warehouse_to_agent';
                                  if (task.deliveryType?.startsWith('pickup_station')) return 'station_to_agent';
                                  return 'seller_to_agent';
                              }
                              if (task?.deliveryType?.endsWith('_to_warehouse')) return 'agent_to_warehouse';
                              if (task?.deliveryType?.endsWith('_to_station')) return 'agent_to_station';
                              return 'agent_to_customer';
                          })()}
                          orderIds={selectedOrders}
                          onConfirmed={() => {
                              alert('Bulk Handover Successful!');
                              setShowHandoverModal(false);
                              setSelectedOrders([]);
                              loadMyDeliveries();
                          }}
                      />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default DeliveryAgentOrders;
