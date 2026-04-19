import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaArrowLeft, FaExclamationTriangle, FaCheckCircle, FaTimesCircle, FaClock, FaMapMarkerAlt, FaCreditCard, FaBox } from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { resolveImageUrl, FALLBACK_IMAGE } from '../utils/imageUtils';
import { formatPrice } from '../utils/currency';

export default function CancelOrder() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState(null);

  // Cancellation reasons
  const cancellationReasons = [
    { id: 'changed_mind', label: 'Changed my mind', description: 'I no longer want this order' },
    { id: 'better_price', label: 'Found better price elsewhere', description: 'Found a better deal' },
    { id: 'wrong_product', label: 'Wrong product selected', description: 'This is not what I wanted' },
    { id: 'wrong_address', label: 'Wrong delivery address', description: 'Delivery address is incorrect' },
    { id: 'delivery_time', label: 'Delivery time too long', description: 'Cannot wait for delivery' },
    { id: 'payment_issues', label: 'Payment issues', description: 'Having trouble with payment' },
    { id: 'other', label: 'Other', description: 'Other reason' }
  ];

  const [selectedReason, setSelectedReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [customReason, setCustomReason] = useState('');

  useEffect(() => {
    loadOrderDetails();
  }, [orderId]);

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      // Get order details - you might need to create this endpoint
      const response = await api.get(`/orders/my`);
      const userOrders = response.data;
      const foundOrder = userOrders.find(o => o.id == orderId);

      if (!foundOrder) {
        setError('Order not found');
        return;
      }

      setOrder(foundOrder);
    } catch (err) {
      console.error('Failed to load order:', err);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const canCancelOrder = (order) => {
    if (!order) return false;

    const isFoodOrder = order.OrderItems?.some(item => item.itemType === 'fastfood' || item.fastFoodId);
    // Food orders can only be cancelled at order_placed (backend rejects later statuses)
    const allowedStatuses = isFoodOrder
      ? ['order_placed']
      : ['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'processing'];

    const normalizedStatus = order.status == null ? '' : String(order.status).toLowerCase();

    if (!allowedStatuses.includes(normalizedStatus)) return false;

    const orderTime = new Date(order.createdAt);
    const now = new Date();
    const timeDiffMinutes = (now - orderTime) / (1000 * 60);
    const windowMinutes = isFoodOrder ? 10 : 24 * 60;

    console.log(`🕐 Frontend - Cancel Check for Order ${order.id}:`);
    console.log(`  Order createdAt: ${order.createdAt}`);
    console.log(`  Order time: ${orderTime.toISOString()}`);
    console.log(`  Current time: ${now.toISOString()}`);
    console.log(`  Time diff: ${timeDiffMinutes.toFixed(2)} minutes`);
    console.log(`  isFoodOrder: ${isFoodOrder}, window: ${windowMinutes} minutes`);
    console.log(`  Can cancel: ${timeDiffMinutes <= windowMinutes}`);

    return timeDiffMinutes <= windowMinutes;
  };

  const handleCancelOrder = async () => {
    if (!selectedReason) {
      alert('Please select a reason for cancellation');
      return;
    }

    // Validate custom reason if "Other" is selected
    if (selectedReason === 'other' && !customReason.trim()) {
      alert('Please specify your reason for cancellation');
      return;
    }

    if (!window.confirm('Are you sure you want to cancel this order? This action cannot be undone.')) {
      return;
    }

    try {
      setCancelling(true);
      setError(null);

      let fullReason;
      if (selectedReason === 'other') {
        fullReason = customReason.trim();
      } else {
        const reasonText = cancellationReasons.find(r => r.id === selectedReason)?.label || selectedReason;
        fullReason = additionalNotes ? `${reasonText}: ${additionalNotes}` : reasonText;
      }

      const response = await api.post(`/orders/${orderId}/cancel`, {
        reason: fullReason,
        cancelledBy: 'customer'
      });

      if (response.data.success) {
        setCancelled(true);
        setOrder(prev => ({ ...prev, status: 'Cancelled' }));
      } else {
        setError(response.data.message || 'Failed to cancel order');
      }
    } catch (err) {
      console.error('Cancel order error:', err);
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to cancel order. Please try again.');
    } finally {
      setCancelling(false);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading order details...</span>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-0 md:px-4">
          <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-8 text-center">
            <FaTimesCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
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

  if (!order) return null;

  if (cancelled) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-8 text-center">
            <FaCheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Cancelled Successfully</h2>
            <p className="text-gray-600 mb-4">
              Your order #{order.orderNumber} has been cancelled.
            </p>
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-blue-800">
                <strong>What happens next?</strong><br />
                • Your order has been cancelled<br />
                • Product stock has been restored<br />
                • Any payment will be refunded within 3-5 business days<br />
                • You'll receive a confirmation email/SMS
              </p>
            </div>
            <Link
              to="/customer/orders"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <FaArrowLeft className="mr-2" />
              Back to Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCancellable = canCancelOrder(order);
  const isFoodOrder = order?.OrderItems?.some(item => item.itemType === 'fastfood' || item.fastFoodId);
  const cancellationWindowLabel = isFoodOrder ? '10 minutes' : '24 hours';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-0 md:px-4">
        {/* Header */}
        <div className="mb-8 px-4 md:px-0">
          <Link
            to="/customer/orders"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <FaArrowLeft className="mr-2" />
            Back to Orders
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Cancel Order</h1>
          <p className="mt-2 text-gray-600">Review order details and confirm cancellation</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4 md:px-0">
          {/* Order Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Summary */}
            <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Order #{order.orderNumber}
                </h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${order.status === 'Pending Payment' ? 'bg-yellow-100 text-yellow-800' :
                  order.status === 'Processing' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                  {order.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Order Date</p>
                  <p className="font-medium">{formatDate(order.createdAt)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Total Amount</p>
                  <p className="font-medium text-lg">{formatPrice(order.total)}</p>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>
              <div className="space-y-4">
                {order.OrderItems?.map((item) => (
                  <div key={item.id} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                      <img
                        src={resolveImageUrl(item.image)}
                        alt={item.name}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onError={(e) => {
                          console.error('❌ CancelOrder.jsx - Image failed to load:', item.image);
                          e.currentTarget.style.border = '2px solid red';
                          e.currentTarget.style.backgroundColor = '#fee';
                          e.currentTarget.alt = 'Image failed to load';
                          e.currentTarget.src = FALLBACK_IMAGE;
                        }}
                        onLoad={(e) => {
                          console.log('✅ CancelOrder.jsx - Image loaded:', item.image);
                        }}
                        crossOrigin="anonymous"
                      />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{item.name}</h4>
                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{formatPrice(item.total)}</p>
                      <p className="text-sm text-gray-600">{formatPrice(item.price)} each</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cancellation Reason Selection */}
            {isCancellable && (
              <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Reason for Cancellation</h3>
                <p className="text-gray-600 mb-4">Please select the main reason for cancelling this order:</p>

                <div className="space-y-3 mb-6">
                  {cancellationReasons.map((reason) => (
                    <label key={reason.id} className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="cancelReason"
                        value={reason.id}
                        checked={selectedReason === reason.id}
                        onChange={(e) => setSelectedReason(e.target.value)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{reason.label}</div>
                        <div className="text-sm text-gray-600">{reason.description}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Custom Reason Input - Only show when "Other" is selected */}
                {selectedReason === 'other' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Please specify your reason *
                    </label>
                    <textarea
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Please explain why you want to cancel this order..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="3"
                      required={selectedReason === 'other'}
                    />
                  </div>
                )}

                {/* Additional Notes - Show for all reasons except "Other" */}
                {selectedReason && selectedReason !== 'other' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Notes (Optional)
                    </label>
                    <textarea
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      placeholder="Provide any additional details..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="3"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cancellation Summary & Actions */}
          <div className="space-y-6">
            {/* Cancellation Eligibility */}
            <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancellation Policy</h3>

              {!isCancellable ? (
                <div className="text-center py-4">
                  <FaTimesCircle className="mx-auto h-12 w-12 text-red-500 mb-3" />
                  <p className="text-red-600 font-medium">Order cannot be cancelled</p>
                  <p className="text-sm text-gray-600 mt-2">
                    {['shipped', 'delivered'].includes(String(order.status).toLowerCase())
                      ? 'Order has already been shipped or delivered'
                      : String(order.status).toLowerCase() === 'cancelled'
                        ? 'Order is already cancelled'
                        : `Cancellation window has expired (${cancellationWindowLabel})`}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center text-green-600">
                    <FaCheckCircle className="mr-2" />
                    <span className="text-sm">Within cancellation window ({cancellationWindowLabel})</span>
                  </div>
                  <div className="flex items-center text-green-600">
                    <FaCheckCircle className="mr-2" />
                    <span className="text-sm">Stock will be restored</span>
                  </div>
                  {order.paymentConfirmed && (
                    <div className="flex items-center text-blue-600">
                      <FaCreditCard className="mr-2" />
                      <span className="text-sm">Refund will be processed</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* What Happens Next */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h4 className="font-medium text-blue-900 mb-3">What happens when you cancel?</h4>
              <ul className="text-sm text-blue-800 space-y-2">
                <li className="flex items-start">
                  <FaBox className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>Product stock is restored immediately</span>
                </li>
                <li className="flex items-start">
                  <FaCreditCard className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>Prepaid orders are refunded within 3-5 days</span>
                </li>
                <li className="flex items-start">
                  <FaClock className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>Order status changes to "Cancelled"</span>
                </li>
                <li className="flex items-start">
                  <FaMapMarkerAlt className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>Delivery is cancelled if not yet dispatched</span>
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {isCancellable ? (
                <>
                  <button
                    onClick={handleCancelOrder}
                    disabled={cancelling || !selectedReason || (selectedReason === 'other' && !customReason.trim())}
                    className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {cancelling ? 'Cancelling Order...' : 'Confirm Cancellation'}
                  </button>
                  <Link
                    to="/customer/orders"
                    className="w-full bg-gray-200 text-gray-800 py-3 px-4 rounded-lg hover:bg-gray-300 text-center block font-medium"
                  >
                    Keep Order
                  </Link>
                </>
              ) : (
                <Link
                  to="/customer/orders"
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 text-center block font-medium"
                >
                  Back to Orders
                </Link>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <FaExclamationTriangle className="text-red-500 mr-2" />
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}