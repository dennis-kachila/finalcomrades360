import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import api from '../../services/api'
import { resolveImageUrl, FALLBACK_IMAGE } from '../../utils/imageUtils';
import DeleteConfirmationModal from '../../components/modals/DeleteConfirmationModal';
import { useToast } from '../../components/ui/use-toast'
import { useAuth } from '../../contexts/AuthContext';
import { isSellerProfileComplete } from '../../utils/sellerUtils';

// ── Diagnostic timing helper ──────────────────────────────────────────────────
const timed = async (label, fn) => {
  const t0 = performance.now();
  console.log(`⏱ [Overview] START: ${label}`);
  try {
    const result = await fn();
    console.log(`✅ [Overview] DONE:  ${label} — ${(performance.now() - t0).toFixed(0)}ms`);
    return result;
  } catch (err) {
    console.error(`❌ [Overview] FAIL:  ${label} — ${(performance.now() - t0).toFixed(0)}ms`, err?.response?.status, err?.message);
    throw err;
  }
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms))
  ]);

export default function SellerOverview() {
  const { user } = useAuth()
  const location = useLocation()
  const scrollRef = useRef(null)

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };
  
  // Secondary check for profile completeness
  if (user && !isSellerProfileComplete(user)) {
    return <Navigate to="/seller/business-location" state={{ from: location, incompleteProfile: true }} replace />;
  }
  const [products, setProducts] = useState([])
  const [fastFoods, setFastFoods] = useState([])
  const [orders, setOrders] = useState([])
  const [serverKpis, setServerKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [kpisLoading, setKpisLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('')
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, product: null });
  const [loadError, setLoadError] = useState(null);
  const { toast } = useToast();
  const fetchingRef = useRef(false)

  const fileBase = useMemo(() => {
    const base = api.defaults.baseURL || ''
    return base.replace(/\/?api\/?$/, '')
  }, [])

  useEffect(() => {
    let alive = true;

    const loadAll = async () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setLoadError(null);

      const overallT0 = performance.now();
      console.log('═══════════════════════════════════════════');
      console.log('🔄 [Overview] Starting data fetch...');

      try {
        // ── Try the single optimized endpoint first ──────────────────────────
        try {
          const res = await timed('GET /seller/overview (single call)', () =>
            withTimeout(api.get('/seller/overview'), 10000, '/seller/overview')
          );
          if (!alive) return;
          const { products: p, fastFoods: f, orders: o, kpis } = res.data;
          setProducts(p || []);
          setFastFoods(f || []);
          setOrders(o || []);
          setServerKpis(kpis || null);
          setLoading(false);
          setKpisLoading(false);
          console.log(`🏁 [Overview] TOTAL via /overview: ${(performance.now() - overallT0).toFixed(0)}ms`);
          return; // Success — done
        } catch (overviewErr) {
          // 404 means backend not restarted — fall back to 4 individual calls
          const is404 = overviewErr?.response?.status === 404;
          if (is404) {
            console.warn('⚠️ [Overview] /sellers/overview not found — backend may need restart. Falling back to 4 individual calls...');
          } else {
            console.warn('⚠️ [Overview] /sellers/overview failed:', overviewErr.message, '— falling back...');
          }
        }

        // ── Fallback: 4 parallel calls with individual 10s timeouts ─────────
        console.log('📡 [Overview] Running 4 parallel API calls with 10s timeouts each...');

        const [pRes, oRes, fRes, kRes] = await Promise.allSettled([
          timed('GET /seller/products?pageSize=6', () =>
            withTimeout(api.get('/seller/products?page=1&pageSize=6'), 10000, 'products')
          ),
          timed('GET /seller/orders?pageSize=6', () =>
            withTimeout(api.get('/seller/orders?page=1&pageSize=6'), 10000, 'orders')
          ),
          timed('GET /fastfood/vendor/me?pageSize=6', () =>
            withTimeout(api.get('/fastfood/vendor/me?page=1&pageSize=6'), 10000, 'fastfood')
          ),
          timed('GET /seller/kpis', () =>
            withTimeout(api.get('/seller/kpis'), 10000, 'kpis')
          ),
        ]);

        if (!alive) return;

        if (pRes.status === 'fulfilled') {
          const list = Array.isArray(pRes.value.data) ? pRes.value.data : (pRes.value.data?.data || []);
          setProducts(list);
        } else { console.error('Products failed:', pRes.reason?.message); }

        if (oRes.status === 'fulfilled') {
          const list = Array.isArray(oRes.value.data) ? oRes.value.data : (oRes.value.data?.data || []);
          setOrders(list);
        } else { console.error('Orders failed:', oRes.reason?.message); }

        if (fRes.status === 'fulfilled') {
          const list = Array.isArray(fRes.value.data) ? fRes.value.data : (fRes.value.data?.data || []);
          setFastFoods(list);
        } else { console.error('FastFood failed:', fRes.reason?.message); }

        if (kRes.status === 'fulfilled') {
          setServerKpis(kRes.value.data);
        } else { console.error('KPIs failed:', kRes.reason?.message); }

        console.log(`🏁 [Overview] TOTAL via fallback: ${(performance.now() - overallT0).toFixed(0)}ms`);
        console.log('Breakdown: products=', pRes.status, '| orders=', oRes.status, '| meals=', fRes.status, '| kpis=', kRes.status);

      } catch (e) {
        console.error('[Overview] Fatal error:', e);
        if (alive) setLoadError(e.message);
      } finally {
        fetchingRef.current = false;
        if (alive) { setLoading(false); setKpisLoading(false); }
        console.log('═══════════════════════════════════════════');
      }
    };

    loadAll();
    const interval = setInterval(loadAll, 2 * 60 * 1000);
    return () => { alive = false; clearInterval(interval); };
  }, [])

  const kpis = useMemo(() => {
    // If server KPIs are available, use them directly for the numbers
    if (serverKpis) return serverKpis;

    // Fallback/Draft calculation during loading
    const awaitingProducts = products.filter(p => !p.approved && (!p.reviewStatus || p.reviewStatus === 'pending')).length
    const awaitingMeals = fastFoods.filter(f => !f.approved && (!f.reviewStatus || f.reviewStatus === 'pending')).length

    const rejectedProducts = products.filter(p => p.reviewStatus === 'rejected').length
    const rejectedMeals = fastFoods.filter(f => f.reviewStatus === 'rejected').length

    const pendingStatuses = ['pending', 'processing', 'order_placed', 'seller_confirmed', 'en_route_to_warehouse', 'at_warehouse']
    const pendingOrders = orders.filter(o => pendingStatuses.includes((o.status || '').toLowerCase())).length

    const todayStr = new Date().toISOString().slice(0, 10)
    const paidStatuses = new Set(['paid', 'delivered', 'completed'])
    const todaySales = orders
      .filter(o => paidStatuses.has((o.status || '').toLowerCase()) && String(o.createdAt || '').slice(0, 10) === todayStr)
      .reduce((sum, o) => sum + (o.sellerTotal || 0), 0)

    return {
      todayEarnings: todaySales,
      pendingOrdersCount: pendingOrders,
      lowStockCount: products.filter(p => (p.stock || 0) <= 3).length,
      awaitingApprovalCount: awaitingProducts + awaitingMeals,
      rejectedCount: rejectedProducts + rejectedMeals
    }
  }, [products, orders, fastFoods, serverKpis]);

  const displayKpis = {
    todaySales: kpis.todayEarnings ?? 0,
    pendingOrders: kpis.pendingOrdersCount ?? 0,
    lowStock: kpis.lowStockCount ?? 0,
    awaitingApproval: kpis.awaitingApprovalCount ?? 0,
    rejected: kpis.rejectedCount ?? 0
  };

  const formatKES = useMemo(() => (val) => {
    const n = Number(val || 0)
    return new Intl.NumberFormat('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
  }, [])

  const handleConfirmedDelete = async (productId, reason, password, isApproved) => {
    try {
      if (isApproved) {
        await api.post('/products/request-deletion', {
          productId,
          reason,
          password
        });
        toast({ title: 'Success', description: 'Deletion request submitted to admin for approval.' });
      } else {
        await api.delete(`/products/${productId}`, { data: { password, reason } });
        setProducts(prev => prev.filter(item => item.id !== productId));
        toast({ title: 'Success', description: 'Product deleted successfully.' });
      }
    } catch (error) {
      const msg = error?.response?.data?.message || 'Failed to process deletion.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      throw new Error(msg);
    }
  };

  console.log('[SellerOverview] Render Stage:', {
    loading,
    kpisLoading,
    productsCount: products.length,
    ordersCount: orders.length,
    mealsCount: fastFoods.length,
    activeFilter
  });

  return (
    <div className="w-full p-0 sm:p-6">
      {/* Page Header with Navigation Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white md:p-4 rounded-xl md:border md:border-gray-100 md:shadow-sm">
        <div className="hidden md:block">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight">Seller Overview</h1>
          <p className="text-sm text-gray-500">Manage your business performance and orders.</p>
        </div>
        <div className="flex items-center gap-3">
          {(user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'super_admin' || user?.roles?.some(r => ['admin', 'superadmin', 'super_admin'].includes(r))) && (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg hover:bg-black transition-all border border-gray-800"
            >
              <span>⬅️</span>
              <span>Admin Dashboard</span>
            </Link>
          )}
          <Link
            to="/"
            className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-gray-50 transition-all border border-gray-200"
          >
            <span>🏠</span>
            <span>Exit Home</span>
          </Link>
        </div>
      </div>

      <div className="relative group/kpi">
        {/* Mobile Scroll Arrows */}
        <button 
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white/90 shadow-md rounded-full p-2 text-blue-600 md:hidden opacity-0 group-hover/kpi:opacity-100 transition-opacity"
          aria-label="Scroll Left"
        >
          <FaChevronLeft size={14} />
        </button>
        <button 
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white/90 shadow-md rounded-full p-2 text-blue-600 md:hidden opacity-100 md:opacity-0 group-hover/kpi:opacity-100 transition-opacity"
          aria-label="Scroll Right"
        >
          <FaChevronRight size={14} />
        </button>

        <div className="absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-[#F8FAFC] to-transparent pointer-events-none z-10 md:hidden" />
        
        <div 
          ref={scrollRef}
          className="flex flex-nowrap overflow-x-auto gap-3 pb-4 mb-2 no-scrollbar snap-x md:grid md:grid-cols-6 md:gap-4 md:mb-6 md:pb-0 scroll-smooth"
        >
        <button className={`card text-left transition-all min-w-[140px] flex-shrink-0 snap-start ${kpisLoading ? 'opacity-50 grayscale' : ''} ${activeFilter === 'today' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setActiveFilter(activeFilter === 'today' ? '' : 'today')}>
          <div className="text-sm text-gray-500">Today Earnings (Base)</div>
          <div className="text-xl font-bold">
            {kpisLoading ? <span className="text-gray-400 animate-pulse">...</span> : `KES ${formatKES(displayKpis.todaySales)}`}
          </div>
        </button>

        <button className={`card text-left transition-all min-w-[140px] flex-shrink-0 snap-start ${kpisLoading ? 'opacity-50 grayscale' : ''} ${activeFilter === 'pendingOrders' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setActiveFilter(activeFilter === 'pendingOrders' ? '' : 'pendingOrders')}>
          <div className="text-sm text-gray-500">Pending Orders</div>
          <div className="text-xl font-bold">
            {kpisLoading ? <span className="text-gray-400 animate-pulse">...</span> : displayKpis.pendingOrders}
          </div>
        </button>

        <button className={`card text-left transition-all min-w-[140px] flex-shrink-0 snap-start ${kpisLoading ? 'opacity-50 grayscale' : ''} ${activeFilter === 'lowStock' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setActiveFilter(activeFilter === 'lowStock' ? '' : 'lowStock')}>
          <div className="text-sm text-gray-500">Low Stock</div>
          <div className="text-xl font-bold">
            {kpisLoading ? <span className="text-gray-400 animate-pulse">...</span> : displayKpis.lowStock}
          </div>
        </button>

        <button className={`card text-left transition-all min-w-[140px] flex-shrink-0 snap-start ${kpisLoading ? 'opacity-50 grayscale' : ''} ${activeFilter === 'rejected' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setActiveFilter(activeFilter === 'rejected' ? '' : 'rejected')}>
          <div className="text-sm text-gray-500">Total Rejected</div>
          <div className="text-xl font-bold">
            {kpisLoading ? <span className="text-gray-400 animate-pulse">...</span> : displayKpis.rejected}
          </div>
        </button>

        <button className={`card text-left transition-all min-w-[140px] flex-shrink-0 snap-start ${kpisLoading ? 'opacity-50 grayscale' : ''} ${activeFilter === 'awaiting' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setActiveFilter(activeFilter === 'awaiting' ? '' : 'awaiting')}>
          <div className="text-sm text-gray-500">Awaiting Approval</div>
          <div className="text-xl font-bold">
            {kpisLoading ? <span className="text-gray-400 animate-pulse">...</span> : displayKpis.awaitingApproval}
          </div>
        </button>
      </div>
    </div>

      {/* Filtered details panel */}
      {activeFilter && (
        <div className="card p-4 mb-6 relative">
          <button 
            onClick={() => setActiveFilter('')}
            className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors z-10"
            title="Close Details"
          >
            <span className="text-xl font-bold">×</span>
          </button>
          {activeFilter === 'today' && (
            <div>
              <div className="text-lg font-semibold mb-2">Today’s Paid Orders</div>
              {orders.filter(o => ['paid', 'delivered', 'completed'].includes((o.status || '').toLowerCase()) && String(o.createdAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length === 0 ? (
                <div className="text-gray-600">No paid orders today.</div>
              ) : (
                <ul className="space-y-2">
                  {orders.filter(o => ['paid', 'delivered', 'completed'].includes((o.status || '').toLowerCase()) && String(o.createdAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).map(o => (
                    <li key={o.id} className="border rounded p-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium">Order #{o.orderNumber || o.id}</div>
                        <div className="text-xs text-gray-600">{new Date(o.createdAt).toLocaleString()} · Status: {o.status}</div>
                      </div>
                      <div className="font-bold">KES {formatKES(o.sellerTotal || 0)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {activeFilter === 'pendingOrders' && (
            <div>
              <div className="text-lg font-semibold mb-2">Pending/Processing Orders</div>
              {orders.filter(o => ['pending', 'processing', 'order_placed', 'seller_confirmed', 'en_route_to_warehouse', 'at_warehouse'].includes((o.status || '').toLowerCase())).length === 0 ? (
                <div className="text-gray-600">No pending orders.</div>
              ) : (
                <div className="card p-0 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="text-left p-3">Order #</th>

                        <th className="text-left p-3">Status</th>
                        <th className="text-right p-3">Items</th>
                        <th className="text-right p-3">Total (KES)</th>
                        <th className="text-left p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.filter(o => ['pending', 'processing', 'order_placed', 'seller_confirmed', 'en_route_to_warehouse', 'at_warehouse'].includes((o.status || '').toLowerCase())).map(o => (
                        <tr key={o.id} className="border-t">
                          <td className="p-3">{o.orderNumber}</td>

                          <td className="p-3 capitalize">{o.status}</td>
                          <td className="p-3 text-right">{(o.OrderItems || []).reduce((a, b) => a + (b.quantity || 0), 0)}</td>
                          <td className="p-3 text-right font-semibold">{o.sellerTotal}</td>
                          <td className="p-3">{new Date(o.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {activeFilter === 'lowStock' && (
            <div>
              <div className="text-lg font-semibold mb-2">Low Stock Products (≤ 3)</div>
              {products.filter(p => (p.stock || 0) <= 3).length === 0 ? (
                <div className="text-gray-600">No low stock products.</div>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {products.filter(p => (p.stock || 0) <= 3).map(p => (
                    <li key={p.id} className="border rounded p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-600">Stock: {p.stock || 0}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {activeFilter === 'awaiting' && (
            <div>
              <div className="text-lg font-semibold mb-2">Awaiting Approval (Products & Meals)</div>
              {products.filter(p => !p.approved && (!p.reviewStatus || p.reviewStatus === 'pending')).length === 0 && fastFoods.filter(f => !f.approved && (!f.reviewStatus || f.reviewStatus === 'pending')).length === 0 ? (
                <div className="text-gray-600">No items awaiting approval.</div>
              ) : (
                <div className="space-y-4">
                  {products.filter(p => !p.approved && (!p.reviewStatus || p.reviewStatus === 'pending')).length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Products</h4>
                      <ul className="space-y-2">
                        {products.filter(p => !p.approved && (!p.reviewStatus || p.reviewStatus === 'pending')).map(p => (
                          <li key={p.id} className="border rounded p-3 bg-white">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-gray-600">Submitted: {new Date(p.createdAt).toLocaleString()}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {fastFoods.filter(f => !f.approved && (!f.reviewStatus || f.reviewStatus === 'pending')).length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-orange-500 uppercase mb-2">Hot Meals</h4>
                      <ul className="space-y-2">
                        {fastFoods.filter(f => !f.approved && (!f.reviewStatus || f.reviewStatus === 'pending')).map(f => (
                          <li key={f.id} className="border border-orange-100 rounded p-3 bg-orange-50">
                            <div className="font-medium">{f.name}</div>
                            <div className="text-xs text-gray-600">Submitted: {new Date(f.createdAt).toLocaleString()}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {activeFilter === 'rejected' && (
            <div>
              <div className="text-lg font-semibold mb-2">Rejected Items</div>
              {products.filter(p => p.reviewStatus === 'rejected').length === 0 && fastFoods.filter(f => f.reviewStatus === 'rejected').length === 0 ? (
                <div className="text-gray-600">No rejected items.</div>
              ) : (
                <div className="space-y-4">
                  {products.filter(p => p.reviewStatus === 'rejected').length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Products</h4>
                      <ul className="space-y-2">
                        {products.filter(p => p.reviewStatus === 'rejected').map(p => (
                          <li key={p.id} className="border rounded p-3 bg-white">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-gray-600">Reason: {p.reviewNotes || 'Rejected by admin'}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {fastFoods.filter(f => f.reviewStatus === 'rejected').length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-red-500 uppercase mb-2">Hot Meals</h4>
                      <ul className="space-y-2">
                        {fastFoods.filter(f => f.reviewStatus === 'rejected').map(f => (
                          <li key={f.id} className="border border-red-100 rounded p-3 bg-red-50">
                            <div className="font-medium">{f.name}</div>
                            <div className="text-xs text-gray-600">Reason: {f.reviewNotes || f.rejectionReason || 'Rejected by admin'}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {activeFilter === 'fastFoodPending' && (
            <div>
              <div className="text-lg font-semibold mb-2">Pending Fast Food Items</div>
              {fastFoods.filter(f => !f.approved).length === 0 ? (
                <div className="text-gray-600">No fast food items awaiting approval.</div>
              ) : (
                <ul className="space-y-2">
                  {fastFoods.filter(f => !f.approved).map(f => (
                    <li key={f.id} className="border rounded p-3">
                      <div className="flex items-center gap-3">
                        <img src={resolveImageUrl(f.mainImage)} alt={f.name} className="w-12 h-12 object-cover rounded" onError={(e) => { e.target.src = FALLBACK_IMAGE; }} />
                        <div className="flex-grow">
                          <div className="font-medium">{f.name}</div>
                          <div className="text-xs text-gray-600">Submitted: {new Date(f.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link to={`/seller/fast-food/edit/${f.id}`} className="text-xs bg-white border border-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-50 font-medium">Edit</Link>
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete pending item "${f.name}"?`)) {
                                api.delete(`/fastfood/${f.id}`).then(() => {
                                  setFastFoods(prev => prev.filter(item => item.id !== f.id));
                                }).catch(err => alert('Failed to delete item'));
                              }
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Delete Item"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* PRODUCTS SECTION */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 hidden md:block">Your Products</h2>
          <div className="flex gap-2">
            <Link to="/seller/products/add" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors shadow-sm">
              + Add Product
            </Link>
            <Link to="/seller/products" className="text-sm text-blue-600 hover:text-blue-800 font-medium py-1.5">
              View All
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500 border border-gray-100">
            No approved products yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
            {products.slice(0, 6).map(p => (
              <div key={p.id} className="group w-full bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 flex flex-col overflow-hidden">
                <div className="relative h-28 sm:h-40 md:h-48 overflow-hidden bg-gray-100">
                  <img
                    src={resolveImageUrl((p.images || [])[0])}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => { e.target.src = FALLBACK_IMAGE; }}
                  />
                  {/* Status Badges */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${p.approved && p.reviewStatus === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : p.reviewStatus === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : p.reviewStatus === 'draft'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                      {p.approved && p.reviewStatus === 'approved'
                        ? 'Active'
                        : p.reviewStatus === 'rejected'
                          ? 'Rejected'
                          : p.reviewStatus === 'draft'
                            ? 'Draft'
                            : (p.reviewStatus || 'Pending')}
                    </span>
                    {/* Re-Review badge removed due to missing schema column */}
                  </div>
                </div>

                <div className="flex flex-col flex-grow">
                  <h3 className="font-medium text-gray-900 mb-1 line-clamp-2 text-sm h-10 leading-tight">
                    {p.name}
                  </h3>

                  <div className="px-2 sm:px-3 mb-3 flex flex-col items-start gap-1">
                    <div className="text-blue-600 font-bold text-sm sm:text-base">KES {formatKES(p.basePrice || 0)}</div>
                  </div>

                  <div className="mt-auto flex gap-2 pt-2 border-t border-gray-50">
                    <Link
                      to={`/seller/products/view/${p.id}`}
                      className="flex-1 flex items-center justify-center gap-1 bg-blue-50 text-blue-600 hover:bg-blue-100 py-1.5 rounded text-xs font-semibold transition-colors"
                      title="View Details"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, product: p })}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Delete Product"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, product: null })}
        product={deleteModal.product}
        onConfirm={handleConfirmedDelete}
      />

      {/* FAST FOOD SECTION */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 hidden md:block">Your Fast Food Items</h2>
          <Link to="/seller/fast-food/new" className="text-sm text-orange-600 hover:text-orange-800 font-medium">
            + Create Item
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          </div>
        ) : fastFoods.length === 0 ? (
          <div className="bg-orange-50 rounded-lg p-8 text-center text-gray-500 border border-orange-100">
            No fast food items yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-2 sm:gap-4">
            {fastFoods.filter(f => f && f.id).slice(0, 6).map(f => (
              <div key={f.id} className="group w-full bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 flex flex-col overflow-hidden">
                <div className="relative h-28 sm:h-40 md:h-48 overflow-hidden bg-gray-100">
                  <img
                    src={resolveImageUrl(f.mainImage)}
                    alt={f.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => { e.target.src = FALLBACK_IMAGE; }}
                  />
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${f.approved && f.reviewStatus === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : f.reviewStatus === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : f.reviewStatus === 'draft'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                      {f.approved && f.reviewStatus === 'approved'
                        ? 'Live'
                        : f.reviewStatus === 'rejected'
                          ? 'Rejected'
                          : f.reviewStatus === 'draft'
                            ? 'Draft'
                            : 'Pending'}
                    </span>
                    {/* Re-Review badge removed due to missing schema column */}
                  </div>
                </div>

                <div className="flex flex-col flex-grow">
                  <h3 className="font-medium text-gray-900 mb-1 line-clamp-2 text-sm h-10 leading-tight">
                    {f.name}
                  </h3>

                  <div className="mb-3 flex flex-col items-start gap-1">
                    <div className="text-blue-600 font-bold text-sm">KES {formatKES(f.basePrice || 0)}</div>
                  </div>

                  <div className="mt-auto flex gap-2 pt-2 border-t border-gray-50">
                    <Link
                      to={`/seller/fast-food/view/${f.id}`}
                      className="flex-1 flex items-center justify-center gap-1 bg-orange-50 text-orange-600 hover:bg-orange-100 py-1.5 rounded text-xs font-semibold transition-colors"
                      title="View Details"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${f.name}"?`)) {
                          api.delete(`/fastfood/${f.id}`).then(() => {
                            setFastFoods(prev => prev.filter(item => item.id !== f.id));
                          }).catch(err => alert('Failed to delete item'));
                        }
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Delete Item"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hidden md:flex gap-3 flex-wrap">
        <Link to="/seller/products/add" className="btn btn-primary">Create Retail Product</Link>
        <Link to="/seller/products" className="btn">Manage Products</Link>
        <Link to="/seller/orders" className="btn">My Sales</Link>
        <Link to="/seller/fast-food" className="btn border border-orange-600 text-orange-600 hover:bg-orange-50">Manage Fast Food</Link>
      </div>
    </div>
  )
}
