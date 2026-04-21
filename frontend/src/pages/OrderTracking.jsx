import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { resolveImageUrl, FALLBACK_IMAGE, getProductMainImage } from '../utils/imageUtils';
import { ensureArray, normalizeIngredient } from '../utils/parsingUtils';
import { FaBox, FaTruck, FaCheckCircle, FaClock, FaMapMarkerAlt, FaCreditCard, FaArrowLeft, FaRoute, FaUser, FaUserTie } from 'react-icons/fa';
import DeliveryTrackingMap from '../components/DeliveryTrackingMap';

export default function OrderTracking() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [handoverCodeInput, setHandoverCodeInput] = useState('');
  const [handoverCodeError, setHandoverCodeError] = useState('');
  const [handoverCodeSuccess, setHandoverCodeSuccess] = useState('');

  useEffect(() => {
    loadOrderTracking();

    // Auto-refresh tracking for active orders (every 20s)
    let interval = null;
    if (tracking && ['processing', 'shipped', 'in_transit', 'in_transit', 'ready_for_pickup'].includes(tracking.status?.toLowerCase().replace(' ', '_'))) {
      interval = setInterval(loadOrderTracking, 20000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [orderId, tracking?.status]);

  const loadOrderTracking = async () => {
    try {
      setLoading(true);
      const [trackingRes, orderRes] = await Promise.all([
        api.get(`/orders/${orderId}/tracking`),
        api.get(`/orders/${orderId}`)
      ]);
      setTracking(trackingRes.data);
      setOrder(orderRes.data);
    } catch (err) {
      console.error('Failed to load tracking:', err);
      setError('Failed to load order tracking information');
    } finally {
      setLoading(false);
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

  const getStatusColor = (status) => {
    const colors = {
      'Pending Payment': 'text-yellow-600',
      'Processing': 'text-blue-600',
      'Shipped': 'text-purple-600',
      'Ready for Pickup': 'text-sky-600',
      'Delivered': 'text-green-600',
      'Cancelled': 'text-red-600'
    };
    return colors[status] || 'text-gray-600';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'Pending Payment': FaClock,
      'Processing': FaClock,
      'Shipped': FaTruck,
      'Ready for Pickup': FaBox,
      'Delivered': FaCheckCircle,
      'Cancelled': FaClock
    };
    return icons[status] || FaClock;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-0 md:px-4">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading tracking information...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-0 md:px-4">
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <FaClock className="mx-auto h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600 mb-6">{error || 'Tracking information not available'}</p>
            <Link
              to="/customer/orders"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <FaArrowLeft className="mr-2" />
              Back to Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(tracking.status);

  // Extract location data for map
  const pickupLocation = tracking.pickup?.lat ? tracking.pickup : null;
  const dropoffLocation = tracking.destination?.lat ? tracking.destination : {
    name: order?.deliveryAddress || 'Delivery Address'
  };
  const agentLocation = tracking.deliveryAgent?.location || null;
  const pois = tracking.pois || { warehouse: null, pickupStation: null };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-0 md:px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/customer/orders"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <FaArrowLeft className="mr-2" />
            Back to Orders
          </Link>
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Order Tracking</h1>
              <div className="flex items-center gap-3">
                <p className="mt-2 text-gray-600">Track your order #{tracking.orderNumber}</p>
                {(order?.isMarketingOrder || order?.marketerId) && (
                  <span className="mt-2 flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-black uppercase rounded-lg border border-blue-200">
                    <FaUserTie size={10} /> Marketer Order
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Map Integration */}
        {['processing', 'shipped', 'in_transit', 'in_transit', 'delivered'].includes(tracking.status?.toLowerCase().replace(' ', '_')) && (
          <div className="mb-8">
            <DeliveryTrackingMap
              status={tracking.status?.toLowerCase().replace(' ', '_')}
              pickupLocation={pickupLocation}
              dropoffLocation={dropoffLocation}
              agentLocation={agentLocation}
              pois={pois}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Order Summary */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Status */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Current Status</h2>
                {(() => {
                  const getCustomerFriendlyStatus = (rawStatus, orderObj) => {
                    if (!rawStatus) return 'Processing';
                    const s = rawStatus.toLowerCase().replace(/ /g, '_');
                    
                    if (['delivered', 'completed'].includes(s)) return 'Delivered';
                    if (['cancelled', 'failed', 'returned'].includes(s)) return 'Cancelled';

                    const tasks = Array.isArray(orderObj?.deliveryTasks) ? orderObj.deliveryTasks : [];
                    const isTerminalLeg = tasks.some(task => {
                        const isToCustomer = ['seller_to_customer', 'warehouse_to_customer', 'pickup_station_to_customer'].includes(task.deliveryType);
                        const isToStation = orderObj?.deliveryMethod === 'pick_station' && ['seller_to_pickup_station', 'warehouse_to_pickup_station'].includes(task.deliveryType);
                        return (isToCustomer || isToStation) && task.status === 'in_progress';
                    }) || ['in_transit'].includes(s);

                    if (isTerminalLeg || (['in_transit', 'shipped'].includes(s) && isTerminalLeg)) {
                        return 'In Transit';
                    }
                    
                    if (s === 'order_placed') return 'Order Placed';
                    if (s === 'ready_for_pickup' && orderObj?.deliveryMethod === 'pick_station') return 'Ready for Pickup';
                    if (['at_warehouse', 'at_warehouse', 'en_route_to_warehouse', 'shipped', 'in_transit'].includes(s)) return 'Shipped';
                    
                    return 'Processing';
                  };
                  const displayStatus = getCustomerFriendlyStatus(tracking.status, order);
                  const displayColor = getStatusColor(displayStatus);
                  const DisplayIcon = getStatusIcon(displayStatus);

                  return (
                    <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${displayColor} bg-opacity-10`}>
                      <DisplayIcon className="mr-2 h-4 w-4" />
                      {displayStatus}
                    </div>
                  );
                })()}
              </div>

              {tracking.trackingNumber && (
                <div className="mb-4">
                  <p className="text-sm text-gray-600">Tracking Number</p>
                  <p className="font-mono font-medium">{tracking.trackingNumber}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {tracking.estimatedDelivery && (
                  <div>
                    <p className="text-gray-600">Estimated Delivery</p>
                    <p className="font-medium">{formatDate(tracking.estimatedDelivery)}</p>
                  </div>
                )}
                {tracking.actualDelivery && (
                  <div>
                    <p className="text-gray-600">Actual Delivery</p>
                    <p className="font-medium">{formatDate(tracking.actualDelivery)}</p>
                  </div>
                )}
              </div>

              {/* Handover Code Input: Show if tracking.handoverCode exists, even before status is 'delivered' */}
              {tracking.handoverCode && (
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-blue-900 mb-2">Enter Handover Code</h4>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={handoverCodeInput}
                      onChange={e => setHandoverCodeInput(e.target.value)}
                      placeholder="Enter code provided by agent"
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                      onClick={async () => {
                        setHandoverCodeError('');
                        setHandoverCodeSuccess('');
                        try {
                          const res = await api.post('/handover/confirm', { 
                            code: handoverCodeInput,
                            orderId: parseInt(orderId),
                            handoverType: 'agent_to_customer'
                          });
                          if (res.data && res.data.success) {
                            setHandoverCodeSuccess('Code accepted! Order completed.');
                            loadOrderTracking();
                          } else {
                            setHandoverCodeError(res.data?.message || 'Invalid code. Please try again.');
                          }
                        } catch (err) {
                          setHandoverCodeError('Invalid code or server error. Please try again.');
                        }
                      }}
                      disabled={!handoverCodeInput}
                    >
                      Submit
                    </button>
                  </div>
                  {handoverCodeError && <p className="text-red-600 text-sm mt-2">{handoverCodeError}</p>}
                  {handoverCodeSuccess && <p className="text-green-600 text-sm mt-2">{handoverCodeSuccess}</p>}
                </div>
              )}
            </div>

            {/* Tracking Timeline */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                <FaRoute className="mr-2 text-blue-600" />
                Tracking Updates
              </h3>

              {tracking.trackingUpdates && tracking.trackingUpdates.length > 0 ? (
                <div className="space-y-4">
                  {tracking.trackingUpdates.map((update, index) => (
                    <div key={index} className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <FaCheckCircle className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">{update.message}</p>
                          <p className="text-sm text-gray-500">{formatDate(update.timestamp)}</p>
                        </div>
                        {update.location && (
                          <p className="text-sm text-gray-600 flex items-center mt-1">
                            <FaMapMarkerAlt className="mr-1 h-3 w-3" />
                            {update.location}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FaClock className="mx-auto h-12 w-12 mb-4" />
                  <p>No tracking updates available yet</p>
                </div>
              )}
            </div>

            {/* Order Items */}
            {order && order.OrderItems && order.OrderItems.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>
                <div className="space-y-3">
                  {order.OrderItems.map((item) => {
                    const ff = item.FastFood || item.fastFood;
                    const p = item.Product || item.product;
                    const imageUrl = ff ? resolveImageUrl(ff.mainImage || ff.image) : getProductMainImage(p);
                    const itemName = item.itemLabel || item.name || p?.name || ff?.name || 'Order Item';

                    return (
                      <div key={item.id} className="flex items-start space-x-4 p-3 bg-gray-50 rounded-lg">
                        <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden border">
                          <img
                            src={imageUrl}
                            alt={itemName}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                            crossOrigin="anonymous"
                          />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{itemName}</h4>
                          <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>

                          {/* Fast Food Details */}
                          {item.FastFood && (
                            <div className="mt-1 space-y-1">
                              {ensureArray(item.FastFood.ingredients).length > 0 && (
                                <p className="text-[10px] text-gray-400 leading-tight">
                                  <strong>Ingredients:</strong> {ensureArray(item.FastFood.ingredients).map(i => {
                                    const { name } = normalizeIngredient(i);
                                    return name;
                                  }).filter(Boolean).join(', ')}
                                </p>
                              )}
                              {ensureArray(item.FastFood.allergens).length > 0 && (
                                <p className="text-[10px] text-red-500 font-medium">
                                  Allergens: {ensureArray(item.FastFood.allergens).join(', ')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">{(item.price * item.quantity).toLocaleString()} KES</p>
                          <p className="text-xs text-gray-500">{item.price.toLocaleString()} each</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Delivery Information */}
          <div className="space-y-6">
            {/* Delivery Agent */}
            {tracking.deliveryAgent && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <FaUser className="mr-2 text-blue-600" />
                  Delivery Agent
                </h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Name:</strong> {tracking.deliveryAgent.name}</p>
                  <p><strong>Email:</strong> {tracking.deliveryAgent.email}</p>
                  {tracking.deliveryAgent.phone && (
                    <p><strong>Phone:</strong> {tracking.deliveryAgent.phone}</p>
                  )}
                </div>
              </div>
            )}

            {/* Marketer Information */}
            {(order?.isMarketingOrder || order?.marketerId || order?.marketer) && (
              <div className="bg-blue-50 rounded-lg shadow-sm p-6 border border-blue-100">
                <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                  <FaUserTie className="mr-2 text-blue-600" />
                  Marketer Information
                </h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Name:</strong> {order?.marketer?.name || (order?.isMarketingOrder ? 'Authorized Marketer' : 'System Marketer')}</p>
                  {order?.marketer?.phone ? (
                    <p><strong>Phone:</strong> {order.marketer.phone}</p>
                  ) : (order?.isMarketingOrder && (
                    <p className="text-xs text-gray-400 italic">Phone contact not provided</p>
                  ))}
                  {order?.marketer?.email && (
                    <p><strong>Email:</strong> {order.marketer.email}</p>
                  )}
                  <div className="mt-4 p-2 bg-blue-100/50 rounded text-blue-700 text-xs font-medium text-center">
                    This order was placed on your behalf by an authorized marketer.
                  </div>
                </div>
              </div>
            )}

            {/* Delivery Details */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <FaMapMarkerAlt className="mr-2 text-blue-600" />
                Delivery Information
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">Delivery Method</p>
                  <p className="font-medium">{order?.deliveryMethod === 'home_delivery' ? 'Home Delivery' : 'Pick Station'}</p>
                </div>
                {order?.deliveryAddress && (
                  <div>
                    <p className="text-gray-600">Address</p>
                    <p className="font-medium">{order.deliveryAddress}</p>
                  </div>
                )}
                {tracking.deliveryAttempts > 0 && (
                  <div>
                    <p className="text-gray-600">Delivery Attempts</p>
                    <p className="font-medium">{tracking.deliveryAttempts}</p>
                  </div>
                )}
                {tracking.lastDeliveryAttempt && (
                  <div>
                    <p className="text-gray-600">Last Attempt</p>
                    <p className="font-medium">{formatDate(tracking.lastDeliveryAttempt)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Notes */}
            {tracking.deliveryNotes && (
              <div className="bg-yellow-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">Delivery Notes</h3>
                <p className="text-yellow-800 text-sm">{tracking.deliveryNotes}</p>
              </div>
            )}

            {/* Order Total */}
            {order && (
              <div className="bg-blue-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Order Total</h3>
                <p className="text-2xl font-bold text-blue-600">{order.total?.toFixed(2)} KES</p>
                <p className="text-sm text-blue-700 mt-1">Payment: {order.paymentMethod}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}