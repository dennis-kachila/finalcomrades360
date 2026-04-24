import React, { useEffect, useState, useRef } from 'react'
import api from '../../services/api'
import { getSocket } from '../../services/socket'
import { recursiveParse, ensureArray, normalizeIngredient } from '../../utils/parsingUtils'
import DispatchDetailsModal from '../../components/seller/DispatchDetailsModal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/use-toast'
import LogisticsDestination from '../../components/delivery/LogisticsDestination'
import { resolveImageUrl, FALLBACK_IMAGE } from '../../utils/imageUtils'
import HandoverCodeWidget from '../../components/delivery/HandoverCodeWidget'
import { FaUtensils, FaClock } from 'react-icons/fa'

import { buildOrderLifecycleSteps } from '../../utils/orderLifecycle';
export default function SellerOrders() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [message, setMessage] = useState('')
  const [communicationLog, setCommunicationLog] = useState([])
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [shippingType, setShippingType] = useState('shipped_from_seller')
  const [warehouses, setWarehouses] = useState([])
  const [pickupStations, setPickupStations] = useState([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [selectedPickupStationId, setSelectedPickupStationId] = useState('')
  const [destinationType, setDestinationType] = useState('warehouse') // 'warehouse' or 'pickup_station'
  const [submissionDeadline, setSubmissionDeadline] = useState(null)
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [activeTab, setActiveTab] = useState('pending')
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 })
  const [currentPage, setCurrentPage] = useState(1)
  const [processingOrderId, setProcessingOrderId] = useState(null)
  const hasFetchedRef = useRef(false)
  const pageSize = 15;

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

  const PENDING_STATUSES = [
    'order_placed', 'seller_confirmed', 'en_route_to_warehouse',
    'at_warehouse', 'ready_for_pickup', 'in_transit',
    'processing', 'super_admin_confirmed'
  ]
  const COMPLETED_STATUSES = ['delivered', 'failed', 'cancelled']
  const FINALIZED_STATUSES = ['completed']
  const RETURN_STATUSES = [
    'return_approved', 'return_at_pick_station', 'return_in_transit', 
    'return_at_warehouse', 'returned', 'return_rejected'
  ]

  // Filtered rows are now fetched directly from server based on activeTab
  const filteredRows = rows;

  useEffect(() => {
    let alive = true
    const loadLogisticsData = async () => {
      try {
        const [wRes, pRes] = await Promise.all([
          api.get('/warehouses?active=true'),
          api.get('/pickup-stations?activeOnly=true')
        ])
        if (alive) {
          setWarehouses(wRes.data.warehouses || [])
          setPickupStations(pRes.data.stations || [])
        }
      } catch (e) {
        console.error('Failed to load logistics data:', e)
      }
    }
    loadLogisticsData()
    return () => { alive = false }
  }, [])

  const isFetchingRef = useRef(false);

  useEffect(() => {
    let alive = true

    const loadOrders = async (showLoading = true) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        if (showLoading) setLoading(true)
        const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Orders Timeout')), ms));

        // Map activeTab to status parameter
        let statuses = '';
        if (activeTab === 'pending') statuses = [...new Set(PENDING_STATUSES)].join(',');
        else if (activeTab === 'completed') statuses = [...new Set(COMPLETED_STATUSES)].join(',');
        else if (activeTab === 'finalized') statuses = [...new Set(FINALIZED_STATUSES)].join(',');
        else if (activeTab === 'returns') statuses = [...new Set(RETURN_STATUSES)].join(',');

        const url = `/seller/orders?status=${statuses}&page=${currentPage}&pageSize=${pageSize}`;
        const res = await Promise.race([api.get(url), timeout(30000)]);

        if (alive) {
          const dataObj = res.data;
          const list = Array.isArray(dataObj.data) ? dataObj.data : (dataObj.data?.data || []);
          const metaData = dataObj.meta || { total: list.length, page: 1, totalPages: 1 };

          setRows(list);
          setMeta(metaData);
        }
      } catch (e) {
        console.error('Failed to load orders:', e)
        if (showLoading && alive) {
          toast({ title: 'Load Error', description: 'The server is taking too long to respond.', variant: 'destructive' });
        }
      } finally {
        if (alive && showLoading) setLoading(false)
        isFetchingRef.current = false;
      }
    }

    loadOrders(true)

    // Polling every 30 seconds as fallback
    const interval = setInterval(() => {
      loadOrders(false);
    }, 30000);

    return () => {
      alive = false;
      clearInterval(interval);
      isFetchingRef.current = false;
    }
  }, [activeTab, currentPage])

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  useEffect(() => {
    const socket = getSocket()
    const handleStatusUpdate = (data) => {
      // data: { orderId, status, orderNumber, warehouseId, pickupStationId, shippingType ... }
      setRows(prevRows => prevRows.map(order =>
        order.id === data.orderId ? { ...order, ...data } : order
      ))

      // Update selectedOrder if it's currently being viewed in a modal
      setSelectedOrder(current => {
        if (current && current.id === data.orderId) {
          return { ...current, ...data };
        }
        return current;
      });
    }

    socket.on('orderStatusUpdate', handleStatusUpdate)
    
    const handleNewOrder = (data) => {
      // If we receive a new order notification, we should ideally re-fetch or add it if it belongs to this seller
      // For now, simpler to just trigger a silent refresh of the pending list
      console.log('🔔 Real-time new order notification:', data);
      if (activeTab === 'pending') {
        loadOrders(false); // Silent refresh
      }
    };
    socket.on('orderNotification', handleNewOrder);

    const handleOrderMessage = (data) => {
      console.log('Received real-time order message:', data);
      if (selectedOrder && selectedOrder.id === data.orderId) {
        loadCommunicationLog(data.orderId);
      }
    }
    socket.on('orderMessage', handleOrderMessage)
    socket.on('handover:generated', handleHandoverGenerated)

    return () => {
      socket.off('orderStatusUpdate', handleStatusUpdate)
      socket.off('orderNotification', handleNewOrder)
      socket.off('orderMessage', handleOrderMessage)
      socket.off('handover:generated', handleHandoverGenerated)
    }
  }, [selectedOrder, activeTab])

  const handleHandoverGenerated = (data) => {
    // data: { orderId, orderNumber, handoverType, label ... }
    setRows(prevRows => prevRows.map(order =>
      order.id === data.orderId ? { ...order, activeHandoverCode: true } : order
    ))
    toast({ title: 'New Handover Code', description: `A code for ${data.label} has been generated.` })
  }

  // Sync modal local state with selectedOrder's logistics data (handles group consolidation sync)
  useEffect(() => {
    if (selectedOrder) {
      if (selectedOrder.destinationWarehouseId || selectedOrder.warehouseId) {
        setSelectedWarehouseId(selectedOrder.destinationWarehouseId || selectedOrder.warehouseId);
        setDestinationType('warehouse');
      }
      if (selectedOrder.destinationPickStationId || selectedOrder.pickupStationId) {
        setSelectedPickupStationId(selectedOrder.destinationPickStationId || selectedOrder.pickupStationId);
        setDestinationType('pickup_station');
      }
      if (selectedOrder.shippingType) {
        setShippingType(selectedOrder.shippingType);
      }
    }
  }, [selectedOrder])

  const handleUpdateStatus = async (orderId, newStatus, notes = '') => {
    if (processingOrderId === orderId) return
    setProcessingOrderId(orderId)
    try {
      const res = await api.patch(`/orders/${orderId}/seller-status`, {
        status: newStatus,
        notes: notes
      })
      if (res.data.success) {
        setRows(rows.map(order =>
          order.id === orderId ? { ...order, status: newStatus } : order
        ))
        toast({ title: 'Status Updated', description: `Order updated to ${newStatus.replace(/_/g, ' ')}` })
      }
    } catch (error) {
      toast({ title: 'Update Failed', description: error.response?.data?.error || error.message, variant: 'destructive' })
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleConfirmOrder = async (orderId) => {
    if (processingOrderId === orderId) return
    setProcessingOrderId(orderId)
    try {
      const fastFoodOnly = isFastFoodOnlyOrder(selectedOrder);

      const res = await api.post(`/orders/${orderId}/seller-confirm`, {
        shippingType: fastFoodOnly ? null : shippingType,
        warehouseId: fastFoodOnly ? null : ((shippingType === 'shipped_from_seller' && destinationType === 'warehouse') ? selectedWarehouseId : null),
        pickupStationId: fastFoodOnly ? null : ((shippingType === 'shipped_from_seller' && destinationType === 'pickup_station') ? selectedPickupStationId : null),
        submissionDeadline: fastFoodOnly ? null : (shippingType === 'shipped_from_seller' ? submissionDeadline : null),
        message: message || null
      })
      if (res.data.success) {
        // Update the order status in the list
        setRows(rows.map(order =>
          order.id === orderId
            ? { ...order, ...res.data.order }
            : order
        ))
        setShowConfirmModal(false)
        setMessage('')
        setShippingType('shipped_from_seller') // Reset
        setSelectedWarehouseId('')
        setSelectedPickupStationId('')
        setDestinationType('warehouse')
        setSubmissionDeadline(null)
        toast({ title: 'Confirmed', description: 'Order confirmed successfully!' })
      }
    } catch (error) {
      toast({ title: 'Error', description: error.response?.data?.message || error.message, variant: 'destructive' })
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleSendMessage = async (orderId) => {
    try {
      const res = await api.post(`/orders/${orderId}/message`, {
        message: message
      })
      if (res.data.success) {
        // Ideally append to local log instead of reload if possible, but reload is safer
        const newMsg = { sender: 'seller', senderName: 'Me', message, timestamp: new Date() }
        setCommunicationLog([...communicationLog, newMsg])
        setMessage('')
        // setShowMessageModal(false) // Keep open for chat flow?
      }
    } catch (error) {
      alert('Failed to send message: ' + (error.response?.data?.message || error.message))
    }
  }

  const handleHandover = async (orderId) => {
    if (!window.confirm('Confirm that this order has been collected from you?')) return;
    if (processingOrderId === orderId) return
    setProcessingOrderId(orderId)
    try {
      const res = await api.post(`/orders/${orderId}/seller-handover`);
      if (res.data.success) {
        setRows(rows.map(order =>
          order.id === orderId ? { ...order, sellerHandoverConfirmed: true, sellerHandoverConfirmedAt: res.data.order.sellerHandoverConfirmedAt } : order
        ));
        toast({ title: 'Handover Confirmed', description: 'Handover confirmed successfully!' });
      }
    } catch (error) {
      toast({ title: 'Handover Failed', description: error.response?.data?.error || error.message, variant: 'destructive' });
    } finally {
      setProcessingOrderId(null)
    }
  };

  const getOrderItemImage = (item) => {
    if (!item) return null;

    if (item.FastFood || item.fastFood) {
      const f = item.FastFood || item.fastFood;
      return f.mainImage || f.image || f.coverImage;
    }

    if (item.Product || item.product) {
      const p = item.Product || item.product;

      const firstImage = (imgField) => {
        if (!imgField) return null;
        if (Array.isArray(imgField)) return imgField[0];
        if (typeof imgField === 'string' && imgField.startsWith('[')) {
          try { return JSON.parse(imgField)[0]; } catch (e) { return null; }
        }
        return imgField;
      };

      return (
        p.coverImage ||
        p.mainImage ||
        firstImage(p.images) ||
        firstImage(p.galleryImages) ||
        p.image
      );
    }

    if (item.Service || item.service) {
      const s = item.Service || item.service;
      return s.mainImage || s.image || s.coverImage;
    }

    return item.image || item.imageUrl || null;
  };

  const loadCommunicationLog = async (orderId) => {
    try {
      const res = await api.get(`/orders/${orderId}/communication`)
      if (res.data.success) {
        setCommunicationLog(res.data.communicationLog || [])
      }
    } catch (error) {
      console.error('Failed to load communication log:', error)
      setCommunicationLog([])
    }
  }

  const getStatusBadge = (status) => {
    const statusColors = {
      'order_placed': 'bg-yellow-100 text-yellow-800',
      'seller_confirmed': 'bg-blue-100 text-blue-800 border border-blue-200',
      'en_route_to_warehouse': 'bg-indigo-100 text-indigo-800 border border-indigo-200',
      'at_warehouse': 'bg-teal-100 text-teal-800 border border-teal-200',
      'super_admin_confirmed': 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      'processing': 'bg-purple-100 text-purple-800 border border-purple-200',
      'ready_for_pickup': 'bg-sky-100 text-sky-800 border border-sky-200',
      'in_transit': 'bg-orange-100 text-orange-800 border border-orange-200',
      'delivered': 'bg-green-100 text-green-800 border border-green-200',
      'completed': 'bg-green-600 text-white shadow-sm',
      'failed': 'bg-red-600 text-white shadow-sm',
      'cancelled': 'bg-red-100 text-red-800 border border-red-200',
      'returned': 'bg-teal-600 text-white shadow-sm',
      'return_approved': 'bg-pink-100 text-pink-800 border border-pink-200',
      'return_at_pick_station': 'bg-pink-100 text-pink-800 border border-pink-200',
      'return_in_transit': 'bg-pink-100 text-pink-800 border border-pink-200',
      'return_at_warehouse': 'bg-pink-100 text-pink-800 border border-pink-200',
      'return_rejected': 'bg-gray-100 text-gray-800 border border-gray-200'
    }
    return statusColors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-0 sm:p-6 flex flex-col flex-1">
      <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight mb-6">My Sales Management</h1>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => handleTabChange('pending')}
          className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === 'pending' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Pending Sales
        </button>
        <button
          onClick={() => handleTabChange('completed')}
          className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === 'completed' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Delivered Sales
        </button>
        <button
          onClick={() => handleTabChange('finalized')}
          className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === 'finalized' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Finalized Sales
        </button>
        <button
          onClick={() => handleTabChange('returns')}
          className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === 'returns' ? 'border-b-2 border-pink-600 text-pink-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Returns
        </button>
      </div>

      <div className="card p-0 min-h-[400px]">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left p-3">Order #</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Items</th>
              <th className="text-right p-3">Total (KES)</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                    <span className="text-xs font-bold animate-pulse text-blue-600 uppercase tracking-widest">Loading Sales...</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-12 text-center text-gray-500 font-medium italic">
                  No {activeTab} sales found.
                </td>
              </tr>
            ) : (
              <></>
            )}
              {filteredRows.map(o => {
                const directDeliveryOrder = o.adminRoutingStrategy === 'direct_delivery' || isFastFoodOnlyOrder(o);
                return (
                <tr key={o.id} className="border-t">
                  <td className="p-3 font-medium">{o.orderNumber}</td>

                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(o.status)}`}>
                      {o.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-right">{(o.OrderItems || []).reduce((a, b) => a + (b.quantity || 0), 0)}</td>
                  <td className="p-3 text-right font-semibold">{o.sellerTotal}</td>
                  <td className="p-3">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {o.status === 'order_placed' && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 text-xs rounded font-bold">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                          Awaiting Admin Confirmation
                        </span>
                      )}
                      {o.status === 'super_admin_confirmed' && !o.sellerConfirmed && (
                        <button
                          onClick={() => {
                            setSelectedOrder(o)
                            // Pre-populate routing from admin decision
                            if (o.adminRoutingStrategy === 'warehouse' && o.destinationWarehouseId) {
                              setShippingType('shipped_from_seller')
                              setDestinationType('warehouse')
                              setSelectedWarehouseId(o.destinationWarehouseId)
                            } else if (o.adminRoutingStrategy === 'pick_station' && o.destinationPickStationId) {
                              setShippingType('shipped_from_seller')
                              setDestinationType('pickup_station')
                              setSelectedPickupStationId(o.destinationPickStationId)
                            } else if (directDeliveryOrder) {
                              setShippingType('collected_from_seller')
                            } else {
                              setShippingType('shipped_from_seller')
                            }
                            const dl = new Date()
                            dl.setHours(dl.getHours() + 24)
                            setSubmissionDeadline(dl.toISOString())
                            setShowConfirmModal(true)
                          }}
                          className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                        >
                          Confirm
                        </button>
                      )}
                      {o.status !== 'order_placed' && directDeliveryOrder && !o.sellerHandoverConfirmed && (
                        (o.deliveryTasks || []).some(t => ['arrived_at_pickup', 'in_progress', 'completed'].includes(t.status))
                          ? <div className="flex flex-col gap-1">
                              <HandoverCodeWidget
                                mode="giver"
                                handoverType="seller_to_agent"
                                orderId={o.id}
                                taskId={(o.deliveryTasks || []).find(t => ['arrived_at_pickup', 'in_progress', 'completed'].includes(t.status))?.id}
                                buttonLabel="Generate Handover Code"
                                onConfirmed={() => {
                                  setRows(rows.map(order =>
                                    order.id === o.id ? { ...order, sellerHandoverConfirmed: true } : order
                                  ));
                                  toast({ title: '✅ Handover Confirmed', description: 'The delivery agent has confirmed collection.' });
                                }}
                              />
                            </div>
                          : <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-2 text-center">
                              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">⏳ Waiting for agent…</span>
                            </div>
                      )}

                      {o.status !== 'order_placed' && o.shippingType === 'collected_from_seller' && !directDeliveryOrder && !o.sellerHandoverConfirmed && (
                        (o.deliveryTasks || []).some(t => ['arrived_at_pickup', 'in_progress'].includes(t.status))
                          ? <HandoverCodeWidget
                              mode="giver"
                              handoverType="seller_to_agent"
                              orderId={o.id}
                              buttonLabel="Confirm"
                              taskId={(o.deliveryTasks || []).find(t => ['arrived_at_pickup', 'in_progress'].includes(t.status))?.id}
                              onConfirmed={() => {
                                setRows(rows.map(order =>
                                  order.id === o.id ? { ...order, sellerHandoverConfirmed: true } : order
                                ));
                                toast({ title: '✅ Handover Confirmed', description: 'The delivery agent has confirmed collection.' });
                              }}
                            />
                          : <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-2 text-center">
                              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">⏳ Waiting for agent…</span>
                            </div>
                      )}
                      {o.status === 'seller_confirmed' && o.shippingType === 'shipped_from_seller' && !directDeliveryOrder && (
                        <div className="flex flex-col items-center">
                          {(() => {
                            const task = (o.deliveryTasks || []).find(t => ['accepted', 'in_progress'].includes(t.status));
                            
                            if (task) {
                              return (
                                <HandoverCodeWidget
                                  mode="giver"
                                  handoverType="seller_to_agent"
                                  orderId={o.id}
                                  taskId={task.id}
                                  buttonLabel="Handover to Driver"
                                  onConfirmed={() => {
                                    setRows(rows.map(order =>
                                      order.id === o.id ? { ...order, sellerHandoverConfirmed: true } : order
                                    ));
                                    toast({ title: '✅ Handover Confirmed', description: 'The delivery agent has confirmed collection.' });
                                  }}
                                />
                              );
                            }

                            return (
                              <>
                                {!o.selfDispatcherName && (
                                  <span className="text-[10px] text-orange-600 font-bold mb-1 animate-pulse">Waiting for Driver...</span>
                                )}
                                <button
                                  disabled={processingOrderId === o.id}
                                  onClick={() => {
                                    setSelectedOrder(o);
                                    setShowDispatchModal(true);
                                  }}
                                  className={`px-3 py-1 text-white text-xs rounded font-bold transition-all bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-gray-400`}
                                  title="Click when you have dispatched the item to the warehouse"
                                >
                                  {processingOrderId === o.id ? 'Processing...' : 'Dispatch'}
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {o.status === 'en_route_to_warehouse' && o.shippingType === 'shipped_from_seller' && (
                        <HandoverCodeWidget
                          orderId={o.id}
                          handoverType={((o.deliveryTasks || []).some(t => ['accepted', 'in_progress'].includes(t.status))) ? "seller_to_agent" : "seller_to_warehouse"}
                          mode="giver"
                          buttonLabel="Handover code"
                          title="Collection Confirmation"
                          containerClass="rounded-xl border-2 border-teal-100 bg-teal-50"
                        />
                      )}
                      <button
                        onClick={() => {
                          setSelectedOrder(o)
                          setShowMessageModal(true)
                          loadCommunicationLog(o.id)
                        }}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => {

                          setSelectedOrder(o)
                          setShowDetailsModal(true)
                        }}
                        className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                      >
                        Details
                      </button>
                    </div>
                  </td>
                </tr>

              )})}
            </tbody>
          </table>
        </div>

        {/* Mobile Grid View */}
        <div className="md:hidden p-2">
          {loading && rows.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-[10px] font-bold animate-pulse text-blue-600 uppercase tracking-widest">Loading Sales...</span>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-gray-500 font-medium italic text-sm">
              No {activeTab} sales found.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredRows.map(o => {
                const directDeliveryOrder = o.adminRoutingStrategy === 'direct_delivery' || isFastFoodOnlyOrder(o);
                return (
                  <div key={o.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex flex-col relative active:scale-[0.98] transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[11px] font-black text-gray-900">#{o.orderNumber}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${getStatusBadge(o.status)}`}>
                        {o.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex-1 mb-3">
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-[10px] text-gray-400 font-bold uppercase">Total:</span>
                        <span className="text-xs font-black text-blue-600">KES {o.sellerTotal}</span>
                      </div>
                      <div className="text-[9px] text-gray-400 font-bold uppercase">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-1 gap-1.5 pt-2 border-t border-gray-50">
                      {o.status === 'super_admin_confirmed' && !o.sellerConfirmed && (
                        <button
                          onClick={() => {
                            setSelectedOrder(o)
                            if (o.adminRoutingStrategy === 'warehouse' && o.destinationWarehouseId) {
                              setShippingType('shipped_from_seller'); setDestinationType('warehouse'); setSelectedWarehouseId(o.destinationWarehouseId);
                            } else if (o.adminRoutingStrategy === 'pick_station' && o.destinationPickStationId) {
                              setShippingType('shipped_from_seller'); setDestinationType('pickup_station'); setSelectedPickupStationId(o.destinationPickStationId);
                            } else if (directDeliveryOrder) {
                              setShippingType('collected_from_seller');
                            }
                            const dl = new Date(); dl.setHours(dl.getHours() + 24); setSubmissionDeadline(dl.toISOString());
                            setShowConfirmModal(true);
                          }}
                          className="w-full py-2 bg-green-600 text-white text-[10px] font-black uppercase rounded-lg shadow-sm"
                        >
                          Confirm Order
                        </button>
                      )}

                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setSelectedOrder(o); setShowMessageModal(true); loadCommunicationLog(o.id);
                          }}
                          className="flex-1 py-1.5 bg-blue-50 text-blue-600 text-[9px] font-black uppercase rounded-lg border border-blue-100"
                        >
                          Chat
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOrder(o); setShowDetailsModal(true);
                          }}
                          className="flex-1 py-1.5 bg-gray-50 text-gray-600 text-[9px] font-black uppercase rounded-lg border border-gray-100"
                        >
                          Details
                        </button>
                      </div>

                      {/* Specialized Action (Handover/Dispatch) */}
                      {o.status === 'seller_confirmed' && o.shippingType === 'shipped_from_seller' && !directDeliveryOrder && (
                        <button
                          onClick={() => { setSelectedOrder(o); setShowDispatchModal(true); }}
                          className="w-full py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg"
                        >
                          Dispatch
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {meta.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {[...Array(meta.totalPages)].map((_, i) => {
              const page = i + 1;
              if (page === 1 || page === meta.totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${currentPage === page ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    {page}
                  </button>
                );
              } else if (page === currentPage - 2 || page === currentPage + 2) {
                return <span key={page} className="px-1 text-gray-400">...</span>;
              }
              return null;
            })}
          </div>
          <button
            disabled={currentPage === meta.totalPages}
            onClick={() => setCurrentPage(prev => Math.min(meta.totalPages, prev + 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Confirm Order Modal */}
      {showConfirmModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            {(() => {
              const fastFoodOnly = isFastFoodOnlyOrder(selectedOrder);
              const requiresHubDestination = !fastFoodOnly && shippingType === 'shipped_from_seller' && selectedOrder.adminRoutingStrategy !== 'direct_delivery';
              return (
                <>
            <h3 className="text-lg font-semibold mb-4">Confirm Order {selectedOrder.orderNumber}</h3>

            {/* Admin Routing Info Banner */}
            {selectedOrder.adminRoutingStrategy && (
              <div className="mb-4 p-3 bg-emerald-50 border-2 border-emerald-200 rounded-lg">
                <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Admin Has Set Delivery Routing
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase">Customer Preference</p>
                    <p className="font-bold text-gray-800">
                      {selectedOrder.deliveryMethod === 'home_delivery' ? '🏠 Home Delivery' : '🏪 Pick Station'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase">Routing Strategy</p>
                    <p className="font-bold text-gray-800 capitalize">{selectedOrder.adminRoutingStrategy.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                {selectedOrder.adminRoutingStrategy === 'warehouse' && selectedOrder.DestinationWarehouse && (
                  <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                    <p className="text-[10px] font-bold text-blue-700 uppercase">Destination Warehouse</p>
                    <p className="text-sm font-bold">{selectedOrder.DestinationWarehouse.name}</p>
                    <p className="text-[10px] text-gray-500">{selectedOrder.DestinationWarehouse.address}</p>
                  </div>
                )}
                {selectedOrder.adminRoutingStrategy === 'pick_station' && selectedOrder.DestinationPickStation && (
                  <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                    <p className="text-[10px] font-bold text-purple-700 uppercase">Destination Pick Station</p>
                    <p className="text-sm font-bold">{selectedOrder.DestinationPickStation.name}</p>
                    <p className="text-[10px] text-gray-500">{selectedOrder.DestinationPickStation.location}</p>
                  </div>
                )}
                {selectedOrder.adminRoutingStrategy === 'direct_delivery' && (
                  <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                    <p className="text-[10px] font-bold text-green-700 uppercase">Direct Delivery to Customer</p>
                    <p className="text-sm font-bold">{selectedOrder.deliveryAddress || 'Customer address'}</p>
                    <p className="text-[10px] text-gray-500 italic">A driver will be assigned to collect from you.</p>
                  </div>
                )}
                {selectedOrder.adminRoutingNotes && (
                  <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-100">
                    <p className="text-[10px] font-bold text-amber-700 uppercase">Admin Notes</p>
                    <p className="text-xs text-gray-700">{selectedOrder.adminRoutingNotes}</p>
                  </div>
                )}
              </div>
            )}

            {selectedOrder.adminRoutingStrategy === 'direct_delivery' || fastFoodOnly ? (
              <div className="mb-4 p-4 bg-green-50 rounded-xl border-2 border-green-200">
                <p className="text-[10px] font-black text-green-800 uppercase tracking-widest mb-1">Direct Delivery Order</p>
                <p className="text-sm text-gray-700">A driver will be assigned to collect items from you and deliver directly to the customer.</p>
                <p className="text-sm font-bold mt-2">📍 {selectedOrder.deliveryAddress || 'Customer address on file'}</p>
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Logistics Method (To Warehouse):</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 border p-2 rounded cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="shippingType"
                      value="shipped_from_seller"
                      checked={shippingType === 'shipped_from_seller'}
                      onChange={(e) => setShippingType(e.target.value)}
                    />
                    <div>
                      <div className="font-medium">Deliver to Warehouse</div>
                      <div className="text-xs text-gray-500">I will bring the item to the central warehouse myself</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 border p-2 rounded cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="shippingType"
                      value="collected_from_seller"
                      checked={shippingType === 'collected_from_seller'}
                      onChange={(e) => setShippingType(e.target.value)}
                    />
                    <div>
                      <div className="font-medium">Request Collection</div>
                      <div className="text-xs text-gray-500">I need the admin to arrange collection (Cost logic TBD)</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {requiresHubDestination && (
              <div className="mb-4 p-4 bg-blue-50 rounded-2xl border-2 border-blue-100 shadow-sm">
                <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-3">Target Destination:</label>

                {/* Destination Toggle */}
                <div className="flex bg-white/50 p-1 rounded-xl border border-blue-200 mb-4">
                  <button
                    onClick={() => setDestinationType('warehouse')}
                    disabled={!!selectedOrder.destinationWarehouseId || !!selectedOrder.destinationPickStationId || !!selectedOrder.warehouseId || !!selectedOrder.pickupStationId}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${destinationType === 'warehouse' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-600 hover:bg-blue-50'}`}
                  >
                    Warehouse
                  </button>
                  <button
                    onClick={() => setDestinationType('pickup_station')}
                    disabled={!!selectedOrder.destinationWarehouseId || !!selectedOrder.destinationPickStationId || !!selectedOrder.warehouseId || !!selectedOrder.pickupStationId}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${destinationType === 'pickup_station' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-600 hover:bg-blue-50'}`}
                  >
                    Pickup Station
                  </button>
                </div>

                {(selectedOrder.adminRoutingStrategy) && (
                  <div className="mb-3 flex items-center gap-2 px-2 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                    <span className="text-[10px] font-black uppercase">Admin Assigned</span>
                    <p className="text-[9px] font-bold leading-tight">
                      Destination set by admin. Cannot be changed.
                    </p>
                  </div>
                )}

                {destinationType === 'warehouse' ? (
                  <select
                    className="w-full p-3 border-2 border-blue-200/50 rounded-xl bg-white text-sm font-bold text-gray-900 focus:border-blue-500 outline-none transition-all"
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    disabled={!!selectedOrder.destinationWarehouseId || !!selectedOrder.warehouseId || !!selectedOrder.pickupStationId}
                    required
                  >
                    <option value="">-- Choose Warehouse --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} - {w.town || w.address}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="w-full p-3 border-2 border-blue-200/50 rounded-xl bg-white text-sm font-bold text-gray-900 focus:border-blue-500 outline-none transition-all"
                    value={selectedPickupStationId}
                    onChange={(e) => setSelectedPickupStationId(e.target.value)}
                    disabled={!!selectedOrder.destinationPickStationId || !!selectedOrder.warehouseId || !!selectedOrder.pickupStationId}
                    required
                  >
                    <option value="">-- Choose Pickup Station --</option>
                    {pickupStations.map(ps => (
                      <option key={ps.id} value={ps.id}>{ps.name} ({ps.location})</option>
                    ))}
                  </select>
                )}

                {(selectedOrder.warehouseId || selectedOrder.pickupStationId) && (
                  <div className="mt-3 flex items-center gap-2 px-2 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                    <span className="text-[10px] font-black uppercase animate-pulse">Synced!</span>
                    <p className="text-[9px] font-bold leading-tight uppercase">
                      Destination locked because it was selected for another item in this order group.
                    </p>
                  </div>
                )}
                <div className="mt-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Submission Deadline</span>
                  <div className="text-sm font-black text-red-600">
                    {new Date(submissionDeadline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Please ensure the item reaches the hub by this time.</p>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Note to Admin (Optional):</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-2 border rounded"
                rows="2"
                placeholder="Any special instructions..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmOrder(selectedOrder.id)}
                disabled={processingOrderId === selectedOrder.id || (requiresHubDestination && !(destinationType === 'warehouse' ? selectedWarehouseId : selectedPickupStationId))}
                className={`px-4 py-2 rounded font-bold text-white transition-all ${processingOrderId === selectedOrder.id || (requiresHubDestination && !(destinationType === 'warehouse' ? selectedWarehouseId : selectedPickupStationId))
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 active:scale-95'}`}
              >
                {processingOrderId === selectedOrder.id ? 'Processing...' : 'Confirm & Proceed'}
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Message Modal */}
      {showMessageModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-semibold mb-4">Chat with Admin - Order #{selectedOrder.orderNumber}</h3>

            {/* Communication Log */}
            <div className="flex-1 overflow-y-auto mb-4 border rounded p-3 bg-gray-50 min-h-[200px]">
              {communicationLog.length === 0 ? (
                <p className="text-gray-500 text-center italic mt-10">No messages yet. Start the conversation!</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {communicationLog.map((msg, index) => {
                    const isMe = msg.sender === 'seller' || msg.senderId === user?.id; // broad check
                    return (
                      <div key={index} className={`max-w-[80%] p-2 rounded-lg ${isMe ? 'bg-blue-100 self-end ml-auto' : 'bg-white border self-start'}`}>
                        <div className="flex justify-between items-baseline gap-4 mb-1">
                          <span className="text-xs font-bold text-gray-700">{msg.senderName || msg.sender}</span>
                          <span className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm dark:text-gray-900">{msg.message}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* New Message */}
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1 p-2 border rounded"
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === 'Enter' && message.trim() && handleSendMessage(selectedOrder.id)}
              />
              <button
                onClick={() => handleSendMessage(selectedOrder.id)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={!message.trim()}
              >
                Send
              </button>
            </div>

            <button
              onClick={() => setShowMessageModal(false)}
              className="mt-2 text-sm text-gray-500 hover:text-gray-700 underline self-center"
            >
              Close Chat
            </button>
          </div>
        </div>
      )}
      {showDetailsModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Order Details #{selectedOrder.orderNumber}</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-500">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Financial Summary
                </h4>
                {(() => {
                  const actualTotalEarning = (selectedOrder.OrderItems || []).reduce((sum, item) => sum + ((item.Product?.basePrice || item.FastFood?.basePrice || 0) * item.quantity), 0);
                  return (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-900 flex justify-between"><strong>Date:</strong> <span>{new Date(selectedOrder.createdAt).toLocaleString()}</span></p>
                      <p className="text-sm text-gray-900 flex justify-between font-bold border-t pt-1 mt-1">
                        <strong>Total Seller Earning:</strong>
                        <span className="text-green-600">KES {actualTotalEarning.toLocaleString()}</span>
                      </p>
                      <p className="text-[10px] text-gray-500 italic text-right">Base price only. Fees not included.</p>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100/50">
                <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                  Logistics Context
                </h4>
                <div className="space-y-1 text-sm">
                  <p className="flex justify-between"><strong>Shipping Mode:</strong> <span className="capitalize">{selectedOrder.shippingType?.replace(/_/g, ' ') || 'N/A'}</span></p>
                  <p className="flex justify-between"><strong>Delivery Target:</strong> <span>{selectedOrder.adminRoutingStrategy === 'fastfood_pickup_point' ? 'Pickup Point' : (selectedOrder.deliveryMethod === 'pick_station' ? 'Pickup Station' : 'Customer Address')}</span></p>

                  {selectedOrder.warehouse && (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="font-bold text-[11px] text-blue-700 uppercase">Target Warehouse</p>
                      <p className="text-sm">{selectedOrder.warehouse.name}</p>
                      <p className="text-[10px] text-gray-500">{selectedOrder.warehouse.address}</p>
                    </div>
                  )}

                  {selectedOrder.submissionDeadline && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded">
                      <p className="text-[10px] font-bold text-red-700 uppercase">Collection/Drop-off Deadline</p>
                      <p className="text-sm font-black text-red-600">{new Date(selectedOrder.submissionDeadline).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Special Prep / Batch Info Blocks */}
              {(selectedOrder.deliveryInstructions || selectedOrder.batch) && (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedOrder.deliveryInstructions && (
                    <div className="bg-orange-50 border-2 border-orange-200 p-4 rounded-xl shadow-sm">
                      <h4 className="font-black text-orange-900 text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2">
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
                      <h4 className="font-black text-blue-900 text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FaClock size={14} className="text-blue-600" />
                        Fulfillment Batch
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/50 p-2 rounded-lg border border-blue-100">
                          <p className="text-[9px] text-blue-600 font-bold uppercase">Name</p>
                          <p className="text-xs font-black text-blue-900">{selectedOrder.batch.name}</p>
                        </div>
                        <div className="bg-white/50 p-2 rounded-lg border border-blue-100">
                          <p className="text-[9px] text-blue-600 font-bold uppercase">Expected Delivery</p>
                          <p className="text-xs font-black text-blue-900">{selectedOrder.batch.expectedDelivery}</p>
                        </div>
                        <div className="bg-white/50 p-2 rounded-lg border border-blue-100 col-span-2">
                          <p className="text-[9px] text-blue-600 font-bold uppercase">Preparation Window</p>
                          <p className="text-xs font-black text-blue-900">{selectedOrder.batch.startTime} - {selectedOrder.batch.endTime}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Admin Routing Info */}
              {selectedOrder.adminRoutingStrategy && (
                <div className="md:col-span-2 bg-emerald-50/50 p-4 rounded-lg border border-emerald-100">
                  <h4 className="font-bold text-emerald-800 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-600 rounded-full"></span>
                    Admin Routing Decision
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] text-emerald-600 font-bold uppercase">Routing Strategy</p>
                      <p className="font-bold capitalize">{selectedOrder.adminRoutingStrategy.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-600 font-bold uppercase">Customer Preference</p>
                      <p className="font-bold">{selectedOrder.deliveryMethod === 'home_delivery' ? '🏠 Home Delivery' : '🏪 Pickup'}</p>
                    </div>
                  </div>
                  {selectedOrder.adminRoutingStrategy === 'warehouse' && selectedOrder.DestinationWarehouse && (
                    <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                      <p className="text-[10px] font-bold text-blue-700 uppercase">Destination Warehouse</p>
                      <p className="text-sm font-bold">{selectedOrder.DestinationWarehouse.name}</p>
                      <p className="text-[10px] text-gray-500">{selectedOrder.DestinationWarehouse.address}</p>
                    </div>
                  )}
                  {selectedOrder.adminRoutingStrategy === 'pick_station' && selectedOrder.DestinationPickStation && (
                    <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                      <p className="text-[10px] font-bold text-purple-700 uppercase">Destination Pick Station</p>
                      <p className="text-sm font-bold">{selectedOrder.DestinationPickStation.name}</p>
                      <p className="text-[10px] text-gray-500">{selectedOrder.DestinationPickStation.location}</p>
                    </div>
                  )}
                  {selectedOrder.adminRoutingStrategy === 'direct_delivery' && (
                    <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                      <p className="text-[10px] font-bold text-green-700 uppercase">Direct Delivery</p>
                      <p className="text-sm font-bold">{selectedOrder.deliveryAddress || 'Customer address'}</p>
                    </div>
                  )}
                  {selectedOrder.adminRoutingNotes && (
                    <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-100">
                      <p className="text-[10px] font-bold text-amber-700 uppercase">Admin Notes</p>
                      <p className="text-xs text-gray-700">{selectedOrder.adminRoutingNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Status Timeline */}
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

              {/* Driver / Dispatcher Info */}
              {(selectedOrder.selfDispatcherName || (selectedOrder.deliveryTasks && selectedOrder.deliveryTasks.length > 0)) && (
                <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-3 border-b pb-1">Transport Details</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Internal Dispatcher (Seller's choice) */}
                    {selectedOrder.selfDispatcherName && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase">Independent Dispatcher</p>
                        <p className="text-sm"><strong>Name:</strong> {selectedOrder.selfDispatcherName}</p>
                        <p className="text-sm"><strong>Contact:</strong> {selectedOrder.selfDispatcherContact}</p>
                        {selectedOrder.expectedWarehouseArrival && (
                          <p className="text-sm"><strong>ETA:</strong> {new Date(selectedOrder.expectedWarehouseArrival).toLocaleString()}</p>
                        )}
                      </div>
                    )}

                    {/* Assigned System Agents */}
                    {(selectedOrder.deliveryTasks || []).filter(t => t.status !== 'cancelled').map((task, idx) => (
                      <div key={idx} className="space-y-1">
                        <p className="text-[10px] font-bold text-blue-600 uppercase">
                          Leg: {(() => {
                            const type = task.deliveryType;
                            const routing = selectedOrder.adminRoutingStrategy;
                            const oStatus = selectedOrder.status;

                            if (type === 'seller_to_warehouse') return 'Leg 1: Seller to Warehouse';
                            if (type === 'warehouse_to_customer') return 'Leg 2: Warehouse to Customer';
                            if (type === 'warehouse_to_pickup_station') return 'Leg 2: Warehouse to Pick Station';
                            if (type === 'pickup_station_to_customer') return 'Leg 3: Pick Station to Customer';
                            if (type === 'seller_to_pickup_station') return 'Leg 1: Seller to Pick Station';
                            if (type === 'seller_to_customer') return 'Direct: Seller to Customer';
                            
                            // Context fallback
                            if (routing === 'warehouse') {
                                if (['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse'].includes(oStatus)) return 'Leg 1: Seller to Warehouse';
                                if (['at_warehouse', 'at_warehouse'].includes(oStatus)) return 'Leg 2: Warehouse to Customer';
                            }

                            return type?.replace(/_/g, ' ').toUpperCase() || 'DELIVERY LEG';
                          })()}
                        </p>
                        {task.deliveryAgent ? (
                          <>
                            <p className="text-sm text-gray-900 font-medium">{task.deliveryAgent.name}</p>
                            {task.deliveryAgent.phone && (
                              <p className="text-xs text-gray-600 font-bold">📞 {task.deliveryAgent.phone || task.deliveryAgent.businessPhone}</p>
                            )}
                            <p className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 inline-block font-bold">STATUS: {task.status.toUpperCase()}</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Agent assignment pending...</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <h4 className="font-bold text-gray-900 border-l-4 border-blue-600 pl-3">Order Information</h4>
            <div className="mt-4">
              <LogisticsDestination order={selectedOrder} />
            </div>
            <div className="mt-4 space-y-3 font-medium">
              {(selectedOrder.OrderItems || []).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-4">
                    {/* Item Image */}
                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                      <img
                        src={resolveImageUrl(getOrderItemImage(item))}
                        alt={item.itemLabel || item.name || item.Product?.name || item.FastFood?.name || 'Item'}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                      />
                    </div>

                    <div>
                      <h5 className="font-bold text-gray-900 text-base">{item.itemLabel || item.name || item.Product?.name || item.FastFood?.name || 'Unknown Item'}</h5>
                      <p className="text-sm text-gray-600">Quantity: <span className="font-semibold">{item.quantity}</span></p>

                      {/* Fast Food Details */}
                      {item.FastFood && (
                        <div className="mt-1 space-y-1">
                          {ensureArray(item.FastFood.ingredients).length > 0 && (
                            <p className="text-[10px] text-gray-500 line-clamp-2">
                              <strong>Ingredients:</strong> {ensureArray(item.FastFood.ingredients).map(i => {
                                const { name, quantity } = normalizeIngredient(i);
                                return quantity ? `${name} (${quantity})` : name;
                              }).filter(Boolean).join(', ')}
                            </p>
                          )}
                          {ensureArray(item.FastFood.allergens).length > 0 && (
                            <p className="text-[10px] text-red-500">
                              <strong>Allergens:</strong> {ensureArray(item.FastFood.allergens).join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {/* Display SELLER EARNINGS (Base Price), not Customer Price */}
                    <p className="font-bold text-blue-600 text-lg">
                      KES {((item.Product?.basePrice || item.FastFood?.basePrice || 0) * item.quantity).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      KES {(item.Product?.basePrice || item.FastFood?.basePrice || 0).toLocaleString()} per unit
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Details Modal */}
      <DispatchDetailsModal
        isOpen={showDispatchModal}
        onClose={() => setShowDispatchModal(false)}
        order={selectedOrder}
        initialEta={selectedOrder?.submissionDeadline}
        onConfirm={async (data) => {
          try {
            const res = await api.patch(`/orders/${selectedOrder.id}/seller-status`, {
              status: 'en_route_to_warehouse',
              ...data
            });
            if (res.data.success) {
              setRows(rows.map(order => order.id === selectedOrder.id ? { ...order, status: 'en_route_to_warehouse' } : order));
              alert('Order dispatched with internal details!');
              setShowDispatchModal(false);
            }
          } catch (err) {
            alert('Failed: ' + (err.response?.data?.error || err.message));
          }
        }}
      />
      </div>
    </div>
  )
}

