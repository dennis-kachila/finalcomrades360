import React, { useEffect, useState } from 'react';
import { FaBox, FaTruck, FaCheckCircle, FaClock, FaMapMarkerAlt, FaCreditCard, FaEye, FaTimes, FaEdit, FaMotorcycle, FaStore, FaHistory, FaUndo } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { getSocket, joinUserRoom } from '../../services/socket';
import { useAuth } from '../../contexts/AuthContext';
import { resolveImageUrl, FALLBACK_IMAGE } from '../../utils/imageUtils';
import { formatPrice } from '../../utils/currency';
import { recursiveParse, ensureArray, normalizeIngredient } from '../../utils/parsingUtils';
import HandoverCodeWidget from '../../components/delivery/HandoverCodeWidget';

// Compute order totals for the breakdown section
const computeOrderTotals = (order) => {
  if (order.isGroup) {
    const totals = order.orders.reduce((acc, o) => {
      const t = computeOrderTotals(o);
      acc.itemsTotal += t.itemsTotal;
      acc.deliveryTotal += t.deliveryTotal;
      acc.orderTotal += t.orderTotal;
      return acc;
    }, { itemsTotal: 0, deliveryTotal: 0, orderTotal: 0 });
    return totals;
  }

  const items = order.OrderItems || [];
  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.total) || ((item.price || 0) * (item.quantity || 1))), 0);

  // Display source-of-truth delivery fee persisted on order at checkout/placement time.
  const itemDeliveryFeeSum = items.reduce((sum, item) => sum + (Number(item.deliveryFee) || 0), 0);
  const deliveryTotal = (order.deliveryFee != null && Number.isFinite(Number(order.deliveryFee)))
    ? Number(order.deliveryFee)
    : itemDeliveryFeeSum;

  const orderTotal = order.total || (itemsTotal + deliveryTotal);
  return { itemsTotal, deliveryTotal, orderTotal };
};

const hasActiveFinalCustomerTask = (order) => {
  const tasks = Array.isArray(order?.deliveryTasks) ? order.deliveryTasks : [];
  return tasks.some((task) => {
    const isToCustomer = ['seller_to_customer', 'warehouse_to_customer', 'pickup_station_to_customer'].includes(task.deliveryType);
    const isToStation = order?.deliveryMethod === 'pick_station' && ['seller_to_pickup_station', 'warehouse_to_pickup_station'].includes(task.deliveryType);
    return (isToCustomer || isToStation) && task.status === 'in_progress';
  });
};

export default function CustomerOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Helper function to extract image from order item based on type
  const getOrderItemImage = (item) => {
    // Detailed logging for debugging in browser console
    if (process.env.NODE_ENV !== 'production') {
      console.log('Resolving image for item:', item.id, {
        itemType: item.itemType,
        hasFastFood: !!(item.FastFood || item.fastFood),
        hasProduct: !!(item.Product || item.product)
      });
    }

    // Try to get image from FastFood (check both casings)
    const ff = item.FastFood || item.fastFood;
    if (ff) {
      return ff.mainImage || ff.image || ff.coverImage;
    }

    // Try to get image from Product (check both casings)
    const p = item.Product || item.product;
    if (p) {
      return (
        p.coverImage ||
        p.mainImage ||
        p.image ||
        (Array.isArray(p.images) && p.images[0]) ||
        (Array.isArray(p.galleryImages) && p.galleryImages[0]) ||
        (typeof p.images === 'string' && p.images.startsWith('[') ? JSON.parse(p.images)[0] : null)
      );
    }

    // Fallback to item.name if it might be an image path (unlikely but safe)
    if (item.name && (item.name.includes('/') || item.name.includes('.'))) {
      return item.name;
    }

    return null;
  };

  // ─── Simplified customer-facing status ──────────────────────────────────────
  const getCustomerStatus = (order) => {
    const actualStatus = (order.status || '').toLowerCase();
    const finalCustomerTaskActive = hasActiveFinalCustomerTask(order);

    const isFastFood = (order.OrderItems || []).every(i => i.itemType === 'fastfood') ||
      (order.isGroup && order.orders?.every(o => (o.OrderItems || []).every(i => i.itemType === 'fastfood')));

    const isPickStation = order.deliveryMethod === 'pick_station' ||
      (order.isGroup && order.orders?.some(o => o.deliveryMethod === 'pick_station'));

    // Return statuses (Override others if active)
    if (order.returnStatus && order.returnStatus !== 'none') {
      const returnStatusMap = {
        requested: { label: 'Return in Progress', icon: FaUndo, color: 'text-orange-600', bg: 'bg-orange-50', step: 5 },
        approved: { label: 'Return Approved', icon: FaCheckCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', step: 6 },
        rejected: { label: 'Return Rejected', icon: FaTimes, color: 'text-red-600', bg: 'bg-red-50', step: 0 },
        item_collected: { label: 'Item Picked Up', icon: FaTruck, color: 'text-orange-600', bg: 'bg-orange-50', step: 7 },
        item_received: { label: 'Received at WH', icon: FaStore, color: 'text-purple-600', bg: 'bg-purple-50', step: 8 },
        partially_returned: { label: 'Partially Returned', icon: FaUndo, color: 'text-emerald-600', bg: 'bg-emerald-50', step: 9 },
        returned: { label: 'Returned', icon: FaCheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-100', step: 10 }
      };
      if (returnStatusMap[order.returnStatus]) return returnStatusMap[order.returnStatus];
    }

    if (actualStatus === 'return_in_progress') {
      return { label: 'Return in Progress', icon: FaUndo, color: 'text-orange-600', bg: 'bg-orange-100', step: 5 };
    }

    // Terminal / error statuses
    if (['delivered', 'completed'].includes(actualStatus)) {
      return { label: 'Delivered', icon: FaCheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100', step: 4 };
    }
    
    // In-transit check: show "In Transit" ONLY if moving to customer
    const isTerminalLeg = finalCustomerTaskActive || ['in_transit'].includes(actualStatus) || 
                          (['in_transit', 'shipped'].includes(actualStatus) && finalCustomerTaskActive);
                          
    if (isTerminalLeg) {
      return { label: 'In Transit', icon: FaTruck, color: 'text-orange-600', bg: 'bg-orange-100', step: 3 };
    }

    if (actualStatus === 'cancelled') {
      return { label: 'Cancelled', icon: FaTimes, color: 'text-red-600', bg: 'bg-red-100', step: 0 };
    }
    if (['failed', 'returned'].includes(actualStatus)) {
      return { label: actualStatus === 'returned' ? 'Returned' : 'Failed', icon: FaTimes, color: 'text-red-600', bg: 'bg-red-100', step: 0 };
    }

    // Step 1: just placed
    if (actualStatus === 'order_placed') {
      return { label: 'Order Placed', icon: FaClock, color: 'text-yellow-600', bg: 'bg-yellow-100', step: 1 };
    }

    // Processing states
    if (['seller_confirmed', 'super_admin_confirmed', 'processing'].includes(actualStatus)) {
        return { label: 'Processing', icon: FaBox, color: 'text-blue-600', bg: 'bg-blue-100', step: 2 };
    }

    // Logistics nodes before final leg: show as Shipped on customer side
    if (
      ['at_warehouse', 'at_warehouse', 'en_route_to_warehouse', 'en_route_to_pick_station', 'at_pick_station', 'shipped'].includes(actualStatus) ||
      (['in_transit'].includes(actualStatus) && !isTerminalLeg)
    ) {
      return { label: 'Shipped', icon: FaTruck, color: 'text-purple-600', bg: 'bg-purple-100', step: 2 };
    }


    // Pick station: customer collection
    if (actualStatus === 'ready_for_pickup') {
      if (isPickStation) {
        return { label: 'Shipped', icon: FaTruck, color: 'text-purple-600', bg: 'bg-purple-100', step: 3 };
      } else {
        // Awaiting home delivery driver assignment at warehouse
        return { label: 'Shipped', icon: FaTruck, color: 'text-purple-600', bg: 'bg-purple-100', step: 2 };
      }
    }

    // Default Fallback
    return { label: 'Processing', icon: FaBox, color: 'text-blue-600', bg: 'bg-blue-100', step: 2 };
  };

  // Filter options for customer UI
  const filterOptions = [
    { key: 'all', label: 'All Orders', statuses: null },
    { key: 'pending', label: 'Pending', statuses: ['order_placed'] },
    { key: 'processing', label: 'Processing', statuses: ['seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse', 'at_warehouse', 'ready_for_pickup', 'in_transit', 'in_transit', 'Processing', 'Shipped'] },
    { key: 'delivered', label: 'Delivered', statuses: ['delivered', 'completed', 'Delivered'] },
    { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'failed', 'returned'] },
    { key: 'returning', label: 'Returning', statuses: ['return_in_progress'] },
  ];


  useEffect(() => {
    loadOrders();

    // Set up real-time updates
    const socketInstance = getSocket();

    // Join user room for real-time updates
    if (user?.id) {
      joinUserRoom(user.id);
    }

    // Listen for order status updates
    socketInstance.on('orderStatusUpdate', (data) => {
      console.log('Real-time order status update:', data);
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === data.orderId
            ? { ...order, status: data.status }
            : order
        )
      );
    });

    return () => {
      socketInstance.off('orderStatusUpdate');
    };
  }, [user?.id]);

  useEffect(() => {
    const handleRealtimeUpdate = (event) => {
      const scope = event?.detail?.payload?.scope;
      const eventName = event?.detail?.eventName;
      if (scope === 'orders' || scope === 'payments' || eventName === 'orderStatusUpdate') {
        loadOrders(false);
      }
    };

    window.addEventListener('realtime:data-updated', handleRealtimeUpdate);
    return () => window.removeEventListener('realtime:data-updated', handleRealtimeUpdate);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadOrders(false);
    }, 10000);

    return () => clearInterval(interval);
  }, []);


  const loadOrders = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await api.get('/orders/my');
      console.log('🔍 Loaded orders:', response.data);

      // Group orders by checkoutGroupId
      const rawOrders = response.data || [];
      const groupedMap = {};
      const standalone = [];

      rawOrders.forEach(order => {
        if (order.checkoutGroupId) {
          if (!groupedMap[order.checkoutGroupId]) {
            groupedMap[order.checkoutGroupId] = {
              id: `group-${order.checkoutGroupId}`,
              isGroup: true,
              checkoutGroupId: order.checkoutGroupId,
              orderNumber: order.checkoutOrderNumber || order.orderNumber,
              createdAt: order.createdAt,
              status: order.status,
              paymentMethod: order.paymentMethod,
              paymentType: order.paymentType,
              paymentConfirmed: Boolean(order.paymentConfirmed),
              total: 0,
              orders: []
            };
          }
          groupedMap[order.checkoutGroupId].orders.push(order);
          groupedMap[order.checkoutGroupId].total += Number(order.total || 0);

          // Status aggregation logic
          // If all orders in group have same status, use it
          // Otherwise, if any is at_warehouse/ready/in_transit, show closest to delivery
          const group = groupedMap[order.checkoutGroupId];
          const statuses = group.orders.map(o => o.status);
          const uniqueStatuses = [...new Set(statuses)];

          if (uniqueStatuses.length === 1) {
            group.status = uniqueStatuses[0];
          } else {
            // In a group, if ANY package is still active, the group is still active.
            // Terminal states (delivered/completed) should only be the group state if EVERY package is terminal.
            const priority = ['in_transit', 'in_transit', 'ready_for_pickup', 'at_warehouse', 'at_warehouse', 'en_route_to_warehouse', 'processing', 'seller_confirmed', 'order_placed', 'delivered', 'completed'];
            const activeStatuses = uniqueStatuses.filter(s => s !== 'cancelled' && s !== 'failed');
            if (activeStatuses.length > 0) {
              group.status = priority.find(p => activeStatuses.includes(p)) || activeStatuses[0];
            } else {
              group.status = uniqueStatuses[0]; // All cancelled/failed
            }
          }

          const hasCodDelivered = group.orders.some((o) =>
            o.paymentType === 'cash_on_delivery' &&
            ['delivered', 'completed'].includes(String(o.status || '').toLowerCase())
          );
          group.paymentConfirmed = group.orders.every((o) => Boolean(o.paymentConfirmed)) || hasCodDelivered;
        } else {
          standalone.push({ ...order, isGroup: false });
        }
      });

      const finalOrders = [...Object.values(groupedMap), ...standalone].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(finalOrders);
    } catch (error) {
      console.error('❌ Failed to load orders:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusInfo = (order) => {
    return getCustomerStatus(order);
  };

  // Check if order can be cancelled based on order type:
  // - Food orders: within 10 minutes
  // - Product orders: within 24 hours
  const canCancelOrder = (order) => {
    const orderTime = new Date(order.createdAt);
    const now = new Date();
    const timeDiffMinutes = (now - orderTime) / (1000 * 60);

    const isFoodOrder = (order.OrderItems || []).some(item => item.itemType === 'fastfood' || item.fastFoodId);
    const windowMinutes = isFoodOrder ? 10 : 24 * 60;

    const canCancel = timeDiffMinutes <= windowMinutes &&
      ['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'processing'].includes(order.status);

    console.log(`🕐 CustomerOrders.jsx - Cancel Check for Order ${order.id}:`);
    console.log(`  Order createdAt: ${order.createdAt}`);
    console.log(`  Order time: ${orderTime.toISOString()}`);
    console.log(`  Current time: ${now.toISOString()}`);
    console.log(`  Time diff: ${timeDiffMinutes.toFixed(2)} minutes`);
    console.log(`  Status: ${order.status}`);
    console.log(`  isFoodOrder: ${isFoodOrder}, window: ${windowMinutes} minutes`);
    console.log(`  Can cancel: ${canCancel}`);

    return canCancel;
  };

  // Check if address can be updated
  const canUpdateAddress = (order) => {
    const canUpdate = ['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'processing'].includes(order.status);
    console.log(`Order ${order.id}: status=${order.status}, canUpdate=${canUpdate}`);
    return canUpdate;
  };

  // Handle order cancellation with reason selection
  const handleCancelOrder = async (order) => {
    // Show reason selection modal
    const reasons = [
      'Changed my mind',
      'Found better price elsewhere',
      'Wrong product selected',
      'Wrong delivery address',
      'Delivery time too long',
      'Payment issues',
      'Other'
    ];

    const reason = prompt(
      'Please select a reason for cancellation:\n\n' +
      reasons.map((r, i) => `${i + 1}. ${r}`).join('\n') +
      '\n\nEnter the number (1-7):'
    );

    if (!reason) return; // User cancelled

    const reasonIndex = parseInt(reason) - 1;
    if (isNaN(reasonIndex) || reasonIndex < 0 || reasonIndex >= reasons.length) {
      alert('Invalid selection. Please try again.');
      return;
    }

    const selectedReason = reasons[reasonIndex];

    // Additional confirmation
    if (!window.confirm(`Are you sure you want to cancel this order?\n\nReason: ${selectedReason}\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      const response = await api.post(`/orders/${order.id}/cancel`, {
        reason: selectedReason,
        cancelledBy: 'customer'
      });

      if (response.data.success) {
        const refundMessage = response.data.refundMessage ?
          `\n\n${response.data.refundMessage}` : '';
        alert(`Order cancelled successfully.${refundMessage}`);
        // Refresh orders list
        loadOrders();
      } else {
        alert('Failed to cancel order: ' + response.data.message);
      }
    } catch (error) {
      console.error('Cancel order error:', error);
      alert(error.response?.data?.error || error.response?.data?.message || 'Failed to cancel order. Please try again.');
    }
  };

  // Handle address update
  const handleUpdateAddress = (order) => {
    navigate(`/customer/orders/${order.id}/update-address`);
  };

  // Removed full-page blocking loader for immediate UI shell accessibility
  /* if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading orders...</span>
      </div>
    );
  } */

  // Filter orders based on selected filter
  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(order => {
      const filterOption = filterOptions.find(opt => opt.key === filter);
      return filterOption && filterOption.statuses ? filterOption.statuses.includes(order.status) : true;
    });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg sm:text-2xl font-black text-gray-900 uppercase tracking-tight">My Orders</h2>

        <div className="flex overflow-x-auto no-scrollbar pb-2 sm:pb-0 sm:flex-wrap gap-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => setFilter(option.key)}
              className={`flex-shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${filter === option.key
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 scale-105'
                : 'bg-white text-gray-400 border border-gray-100 hover:border-blue-200 hover:text-blue-600'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>


      {loading && orders.length === 0 ? (
        <div className="card p-12 text-center bg-white/50 border-dashed border-2 border-gray-100">
          <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-black animate-pulse uppercase tracking-widest text-[10px] sm:text-xs">Connecting to logistics...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card p-8 text-center bg-white shadow-sm border border-gray-100">
          <FaBox className="mx-auto h-16 w-16 text-gray-200 mb-4" />
          <h3 className="text-lg font-black text-gray-900 mb-2 uppercase tracking-tight">
            {filter === 'all' ? 'No orders yet' : `No ${filterOptions.find(opt => opt.key === filter)?.label.toLowerCase()}`}
          </h3>
          <p className="text-gray-500 text-sm font-medium">
            {filter === 'all'
              ? 'When you place your first order, it will appear here.'
              : `No orders match the selected filter.`
            }
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const statusInfo = getStatusInfo(order);
            const StatusIcon = statusInfo.icon || FaClock;

            return (
              <div key={order.id} className="card overflow-hidden">
                {/* Order Header */}
                <div className="p-3 sm:p-5 border-b border-gray-100 cursor-pointer hover:bg-gray-50/80 transition-all group" onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <div className={`p-2.5 sm:p-3 rounded-2xl ${statusInfo.bg} shadow-sm group-hover:scale-110 transition-transform`}>
                        <StatusIcon className={`h-4 w-4 sm:h-6 sm:w-6 ${statusInfo.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <button className="text-sm sm:text-base font-black text-blue-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">
                            Order #{order.orderNumber}
                          </button>
                          {/* Track Order button for eligible statuses */}
                          {['in_transit', 'in_transit', 'processing', 'shipped', 'ready_for_pickup', 'at_pick_station', 'en_route_to_pick_station', 'at_warehouse', 'at_warehouse', 'Processing', 'Shipped'].includes(order.status) && (
                            <button
                              className="ml-2 px-2 py-1 text-[10px] sm:text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors uppercase tracking-wider"
                              onClick={e => {
                                e.stopPropagation();
                                navigate(`/customer/orders/${order.id}/track`);
                              }}
                            >
                              Track Order
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-wider">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end sm:text-right gap-4 pt-3 sm:pt-0 border-t sm:border-0 border-gray-50">
                      <div className={`inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[9px] sm:text-xs font-black uppercase tracking-widest ${statusInfo.bg} ${statusInfo.color} shadow-sm`}>
                        <StatusIcon className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
                        {statusInfo.label || order.status.replace('_', ' ').toUpperCase()}
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="text-base sm:text-xl font-black text-gray-900 tracking-tight">
                          {formatPrice(order.total)}
                        </p>
                        <p className="text-[8px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest sm:hidden">Total Amount</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Order Details */}
                {selectedOrder?.id === order.id && (
                  <>
                    {/* Order Actions */}
                    <div className="px-3 py-4 sm:px-6 sm:py-5 bg-blue-50/50 border-b border-gray-100">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Handover Confirmation Call to Action(s) */}
                          {(order.isGroup ? order.orders : [order])
                            .filter(subOrder => {
                              const s = (subOrder.status || '').toLowerCase();
                              return ['in_transit', 'in_transit', 'shipped', 'ready_for_pickup', 'at_pick_station', 'en_route_to_pick_station', 'at_warehouse', 'at_warehouse'].includes(s) || hasActiveFinalCustomerTask(subOrder);
                            })
                            .map((activeSubOrder, index) => {
                              const isStationPickup = activeSubOrder.deliveryMethod === 'pick_station' && activeSubOrder.status === 'ready_for_pickup' && !hasActiveFinalCustomerTask(activeSubOrder);
                              return (
                                <div key={activeSubOrder.id} className="w-full mt-2">
                                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-3">
                                    <p className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-1 flex items-center justify-between">
                                      <span>{isStationPickup ? '📦 Order at Pick Station!' : '🛵 Order On the Way!'}</span>
                                      {order.isGroup && (
                                          <span className="text-[10px] bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
                                            {activeSubOrder.seller?.name || `Package ${index + 1}`}
                                          </span>
                                      )}
                                    </p>
                                    <p className="text-[11px] text-indigo-600 font-medium">
                                      {isStationPickup
                                        ? 'Ask the station attendant for your pickup code and enter it below to confirm collection.'
                                        : 'The delivery agent will give you a 5-digit code upon arrival. Enter it below to confirm receipt.'}
                                    </p>
                                  </div>
                                  <HandoverCodeWidget
                                    orderId={activeSubOrder.id}
                                    handoverType={isStationPickup ? 'station_to_customer' : 'agent_to_customer'}
                                    mode="receiver"
                                    onConfirmed={() => {
                                      loadOrders();
                                    }}
                                  />
                                </div>
                              );
                            })}
                        </div>

                        {/* Show available actions info */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-blue-100 pt-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {canCancelOrder(order) && canUpdateAddress(order) ? (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUpdateAddress(order); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors uppercase tracking-wider"
                                >
                                  <FaEdit /> Edit Address
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCancelOrder(order); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-100 hover:bg-red-200 rounded-lg transition-colors uppercase tracking-wider"
                                >
                                  <FaTimes /> Cancel Order
                                </button>
                              </>
                            ) : (
                              <>
                                {(order.status === 'delivered' || order.status === 'completed') ? (
                                  (!order.returnStatus || order.returnStatus === 'none' || order.returnStatus === 'rejected') && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); navigate(`/customer/orders/${order.id}/return`); }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors uppercase tracking-wider"
                                    >
                                      <FaUndo /> Initiate Return
                                    </button>
                                  )
                                ) : (
                                  <div className="flex items-center gap-2 text-[9px] sm:text-[10px] text-blue-600 font-bold uppercase tracking-wider bg-blue-100/50 px-3 py-1.5 rounded-full">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                                    </span>
                                    {(order.status === 'delivered' || order.status === 'cancelled') ? "History Only" : "In Progress"}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          <div className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest text-right">
                            Placed {formatDate(order.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Order Details */}
                    <div className="p-3 sm:p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        {/* Delivery Information */}
                        <div>
                          <h4 className="text-[10px] sm:text-xs font-black text-gray-400 mb-2.5 uppercase tracking-widest flex items-center">
                            <FaMapMarkerAlt className="mr-2" />
                            Delivery Information
                          </h4>
                          <div className="text-[10px] sm:text-sm text-gray-600 space-y-2 bg-gray-50/50 p-3 sm:p-4 rounded-2xl border border-gray-100">
                            {(() => {
                              // Derive correct delivery method, accounting for grouped orders
                              const getM = (o) => o.deliveryMethod || o.orders?.[0]?.deliveryMethod;
                              const actualMethod = getM(order);
                              const isHome = actualMethod === 'home_delivery' || actualMethod === 'seller_to_customer' || actualMethod === 'direct_delivery';
                              // Derive address explicitly
                              const actualAddress = order.deliveryAddress || order.orders?.[0]?.deliveryAddress || 'Address pending';
                              // Derive pick station explicitly
                              const pStationName = order.PickupStation?.name || order.pickStation || order.orders?.[0]?.PickupStation?.name || order.orders?.[0]?.pickStation || 'Station pending';
                              const pStationLoc = order.PickupStation?.location || order.PickupStation?.address || order.orders?.[0]?.PickupStation?.location || order.orders?.[0]?.PickupStation?.address;

                              return (
                                <>
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-400 font-medium">Method</span>
                                    <span className="font-bold text-gray-900">{isHome ? '🏠 Home Delivery' : '🏪 Pick Station'}</span>
                                  </div>

                                  {isHome ? (
                                    <div className="pt-2">
                                      <span className="text-gray-400 font-medium block mb-0.5">Delivery Address</span>
                                      <span className="font-medium text-gray-800 break-words">{actualAddress}</span>
                                    </div>
                                  ) : (
                                    <div className="space-y-2 pt-2 border-t border-gray-100 mt-2">
                                      <div>
                                        <span className="text-gray-400 font-medium block mb-0.5">Pick Station</span>
                                        <span className="font-bold text-blue-600 block">{pStationName}</span>
                                      {pStationLoc && (
                                        <span className="text-xs text-gray-500 block mt-0.5 italic">{pStationLoc}</span>
                                      )}
                                    </div>
                                    {actualAddress && (
                                      <div className="pt-2 border-t border-gray-200">
                                        <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Billing Address</span>
                                        <span className="text-xs text-gray-500 block truncate">{actualAddress}</span>
                                      </div>
                                    )}
                                  </div>
                                  )}
                                </>
                              );
                            })()}

                            {(order.warehouse || (order.isGroup && order.orders.some(o => o.warehouse))) && (
                              <div className="flex justify-between items-center pt-1">
                                <span className="text-[10px] text-blue-500 font-bold uppercase">Logistics Status</span>
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">Distributed</span>
                              </div>
                            )}

                            {/* Batch Expected Delivery Time */}
                            {(() => {
                              const batch = order.batch || (order.isGroup ? order.orders.find(o => o.batch)?.batch : null);
                              if (!batch?.expectedDelivery) return null;
                              return (
                                <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-100">
                                  <div className="flex items-center gap-1.5">
                                    <FaClock className="text-orange-500 text-[10px]" />
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Expected Delivery</span>
                                  </div>
                                  <span className="text-[11px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-100">
                                    {batch.expectedDelivery}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Payment Information */}
                        <div>
                          <h4 className="text-[10px] sm:text-xs font-black text-gray-400 mb-2.5 uppercase tracking-widest flex items-center">
                            <FaCreditCard className="mr-2" />
                            Payment Information
                          </h4>
                          <div className="text-[10px] sm:text-sm text-gray-600 space-y-2 bg-gray-50/50 p-3 sm:p-4 rounded-2xl border border-gray-100">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-medium">Method</span>
                              <span className="font-black text-gray-900 uppercase">{order.paymentMethod}</span>
                            </div>
                            {(() => {
                              const paymentSettled = order.isGroup
                                ? order.orders.every((o) => Boolean(o.paymentConfirmed)) ||
                                  order.orders.some((o) =>
                                    o.paymentType === 'cash_on_delivery' &&
                                    ['delivered', 'completed'].includes(String(o.status || '').toLowerCase())
                                  )
                                : Boolean(order.paymentConfirmed) ||
                                  (order.paymentType === 'cash_on_delivery' &&
                                    ['delivered', 'completed'].includes(String(order.status || '').toLowerCase()));

                              return (
                            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                              <span className="text-gray-400 font-medium">Status</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${paymentSettled ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                {paymentSettled ? 'Paid' : 'Pending'}
                              </span>
                            </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Order Items */}
                      {(() => {
                        const { itemsTotal, deliveryTotal, orderTotal } = computeOrderTotals(order);
                        const isPickStation = order.deliveryMethod === 'pick_station';
                        const DeliveryIcon = isPickStation ? FaStore : FaMotorcycle;
                        const deliveryLabel = isPickStation ? 'Pick Station Fee' : 'Home Delivery Fee';
                        const allItems = order.isGroup
                          ? order.orders.reduce((acc, o) => [...acc, ...(o.OrderItems || [])], [])
                          : (order.OrderItems || []);

                        if (allItems.length === 0) return null;

                        return (
                          <div className="mt-6 pt-6 border-t border-gray-200">
                            <h4 className="text-[10px] sm:text-xs font-black text-gray-400 mb-3 uppercase tracking-widest">Order Items ({allItems.length})</h4>
                            <div className="space-y-3">
                              {allItems.map((item) => {
                                const itemDeliveryFee = Number(item.deliveryFee) || 0;
                                return (
                                  <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 bg-gray-50/50 rounded-2xl border border-gray-100">
                                    <div className="flex items-center gap-4 w-full sm:w-auto">
                                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-200 rounded-xl flex-shrink-0 overflow-hidden shadow-sm">
                                        <img
                                          src={resolveImageUrl(getOrderItemImage(item))}
                                          alt={item.name}
                                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                          onError={(e) => {
                                            e.currentTarget.src = FALLBACK_IMAGE;
                                          }}
                                        />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h5 className="text-[10px] sm:text-xs font-black text-gray-900 uppercase tracking-tight line-clamp-2">
                                          {item.itemLabel || item.name || item.Product?.name || item.product?.name || item.FastFood?.name || item.fastFood?.name || 'Order Item'}
                                        </h5>
                                        {item.returnStatus && item.returnStatus !== 'none' && (
                                          <div className="mt-1">
                                            <span className={`text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                                              item.returnStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700 shadow-sm'
                                            }`}>
                                              {item.returnStatus === 'requested' ? 'Return Requested' : 
                                               item.returnStatus === 'approved' ? 'Return Approved' :
                                               item.returnStatus === 'completed' ? 'Returned' : 
                                               `Return: ${item.returnStatus}`}
                                            </span>
                                          </div>
                                        )}
                                        <p className="text-[8px] sm:text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Qty: {item.quantity}</p>

                                        {/* Seller Info */}
                                        {(item.Product?.seller?.name || item.product?.seller?.name || item.FastFood?.vendorDetail?.name || item.fastFood?.vendorDetail?.name || order.seller?.name) && (
                                          <p className="text-[8px] sm:text-[10px] text-blue-600 mt-1 font-black uppercase tracking-wider flex items-center gap-1">
                                            <FaStore className="text-[10px]" />
                                            {item.Product?.seller?.name || item.product?.seller?.name || item.FastFood?.vendorDetail?.name || item.fastFood?.vendorDetail?.name || order.seller?.name}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between w-full sm:w-auto sm:ml-auto gap-4 pt-2 sm:pt-0 border-t sm:border-0 border-gray-100">
                                      <div className="flex flex-col sm:items-end">
                                        <p className="text-xs sm:text-sm font-black text-gray-900 tracking-tight">{formatPrice(item.price * item.quantity)}</p>
                                        <p className="text-[8px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest">{formatPrice(item.price)} × {item.quantity}</p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Order Totals Breakdown */}
                            <div className="mt-4 pt-3 border-t border-dashed border-gray-300">
                              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                                <div className="flex justify-between items-center text-sm text-gray-600">
                                  <span>Items Total</span>
                                  <span>{formatPrice(itemsTotal)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="flex items-center gap-1 text-gray-600">
                                    <DeliveryIcon className={isPickStation ? 'text-green-500' : 'text-blue-500'} size={12} />
                                    {isPickStation ? 'Pick Station Fee' : 'Delivery Fee'}
                                  </span>
                                  {deliveryTotal > 0 ? (
                                    <span className="text-gray-700">{formatPrice(deliveryTotal)}</span>
                                  ) : (
                                    <span className="text-green-600 font-medium">Free</span>
                                  )}
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                  <span className="font-semibold text-gray-900">Order Total</span>
                                  <span className="font-bold text-gray-900 text-base">{formatPrice(orderTotal)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
