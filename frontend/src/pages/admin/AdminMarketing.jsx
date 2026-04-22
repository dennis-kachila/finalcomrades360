import React, { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'

export default function AdminMarketing(){
  const [activeTab, setActiveTab] = useState('commissions') // commissions | analytics | marketers | rates | audit
  
  // shared state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // commissions state
  const [commissions, setCommissions] = useState([])
  const [filter, setFilter] = useState({ status: '', marketerId: '', productId: '' })
  const [selectedIds, setSelectedIds] = useState(new Set())

  // analytics state
  const [analytics, setAnalytics] = useState({ totals: {}, byMarketer: [], byProduct: [], byPlatform: [], byDevice: [] })

  // marketers state
  const [marketers, setMarketers] = useState([])

  // rates state
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])

  // audit state
  const [audit, setAudit] = useState([])

  const resetAlerts = () => { setError(''); setSuccess(''); }

  // loads
  const loadCommissions = async () => {
    try {
      const params = {}
      if (filter.status) params.status = filter.status
      if (filter.marketerId) params.marketerId = filter.marketerId
      if (filter.productId) params.productId = filter.productId
      const r = await api.get('/admin/commissions', { params })
      setCommissions(r.data || [])
      setSelectedIds(new Set())
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load commissions')
    }
  }

  const loadAnalytics = async () => {
    try {
      const r = await api.get('/admin/referrals/analytics')
      setAnalytics(r.data || { totals: {}, byMarketer: [], byProduct: [], byPlatform: [], byDevice: [] })
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load analytics')
    }
  }

  const loadMarketers = async () => {
    try {
      const r = await api.get('/admin/marketers')
      setMarketers(r.data || [])
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load marketers')
    }
  }

  const loadRatesData = async () => {
    try {
      const [pr, cr] = await Promise.all([
        api.get('/admin/products'),
        api.get('/categories')
      ])
      setProducts(pr.data || [])
      setCategories(cr.data || [])
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load products/categories')
    }
  }

  const loadAudit = async () => {
    try {
      const r = await api.get('/admin/audit')
      setAudit(r.data || [])
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load audit log')
    }
  }

  useEffect(()=>{
    if (activeTab==='commissions') loadCommissions()
    if (activeTab==='analytics') loadAnalytics()
    if (activeTab==='marketers') loadMarketers()
    if (activeTab==='rates') loadRatesData()
    if (activeTab==='audit') loadAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // commission actions
  const bulkAction = async (action) => {
    if (selectedIds.size === 0) return
    resetAlerts(); setLoading(true)
    try {
      const ids = Array.from(selectedIds)
      if (action === 'pay') {
        await api.post('/admin/commissions/pay-bulk', { ids })
      } else if (action === 'cancel') {
        await api.post('/admin/commissions/cancel-bulk', { ids })
      } else {
        throw new Error('Unsupported action')
      }
      setSuccess(`Commissions ${action}ed`)
      loadCommissions()
    } catch (e) {
      setError(e.response?.data?.message || `Failed to ${action} commissions`)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allSelected = useMemo(()=> commissions.length>0 && commissions.every(c=>selectedIds.has(c.id)), [commissions, selectedIds])
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(commissions.map(c=>c.id)))
  }

  // marketer actions
  const suspendMarketer = async (id) => { resetAlerts(); try{ await api.post(`/admin/marketers/${id}/suspend`); setSuccess('Marketer suspended'); loadMarketers() }catch(e){ setError(e.response?.data?.message||'Failed to suspend') } }
  const reactivateMarketer = async (id) => { resetAlerts(); try{ await api.post(`/admin/marketers/${id}/reactivate`); setSuccess('Marketer reactivated'); loadMarketers() }catch(e){ setError(e.response?.data?.message||'Failed to reactivate') } }
  const revokeReferral = async (id) => { resetAlerts(); try{ await api.post(`/admin/marketers/${id}/referral/revoke`); setSuccess('Referral code revoked'); loadMarketers() }catch(e){ setError(e.response?.data?.message||'Failed to revoke referral code') } }
  const assignReferral = async (id) => { resetAlerts(); const code = window.prompt('Assign referral code (leave blank to auto-generate)')
    if (code === null) return; try{ await api.post(`/admin/marketers/${id}/referral/assign`, code ? { code } : {}); setSuccess('Referral code assigned'); loadMarketers() }catch(e){ setError(e.response?.data?.message||'Failed to assign referral code') } }

  // rate actions
  const updateProductRate = async (productId) => {
    resetAlerts()
    const rateStr = window.prompt('Set commission rate (%) for this product')
    if (rateStr === null) return
    const rate = Number(rateStr)
    if (Number.isNaN(rate)) { setError('Invalid rate'); return }
    try {
      await api.patch(`/admin/products/${productId}/commission-rate`, { rate })
      setSuccess('Product commission rate updated')
      loadRatesData()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update product rate')
    }
  }

  const updateCategoryRates = async (categoryId) => {
    resetAlerts()
    const rateStr = window.prompt('Set commission rate (%) for all products in this category')
    if (rateStr === null) return
    const rate = Number(rateStr)
    if (Number.isNaN(rate)) { setError('Invalid rate'); return }
    try {
      await api.patch(`/admin/categories/${categoryId}/commission-rate`, { rate })
      setSuccess('Category commission rates updated')
      loadRatesData()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update category rates')
    }
  }

  return (
    <div className="py-0">
      <div className="flex gap-2 mb-4">
        <button className={`px-3 py-1 rounded ${activeTab==='commissions'?'bg-blue-600 text-white':'bg-gray-100'}`} onClick={()=>setActiveTab('commissions')}>Commissions</button>
        <button className={`px-3 py-1 rounded ${activeTab==='analytics'?'bg-blue-600 text-white':'bg-gray-100'}`} onClick={()=>setActiveTab('analytics')}>Analytics</button>
        <button className={`px-3 py-1 rounded ${activeTab==='marketers'?'bg-blue-600 text-white':'bg-gray-100'}`} onClick={()=>setActiveTab('marketers')}>Marketers</button>
        <button className={`px-3 py-1 rounded ${activeTab==='rates'?'bg-blue-600 text-white':'bg-gray-100'}`} onClick={()=>setActiveTab('rates')}>Rates</button>
        <button className={`px-3 py-1 rounded ${activeTab==='audit'?'bg-blue-600 text-white':'bg-gray-100'}`} onClick={()=>setActiveTab('audit')}>Audit</button>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}
      {success && <div className="mb-4 p-3 rounded bg-green-100 text-green-700">{success}</div>}

      {activeTab==='commissions' && (
        <div className="card p-4">
          <div className="flex flex-wrap gap-2 items-end mb-3">
            <div>
              <label className="block text-sm">Status</label>
              <select className="border rounded p-1" value={filter.status} onChange={(e)=>setFilter(prev=>({...prev, status: e.target.value}))}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm">Marketer ID</label>
              <input className="border rounded p-1" placeholder="ID" value={filter.marketerId} onChange={(e)=>setFilter(prev=>({...prev, marketerId: e.target.value}))} />
            </div>
            <div>
              <label className="block text-sm">Product ID</label>
              <input className="border rounded p-1" placeholder="ID" value={filter.productId} onChange={(e)=>setFilter(prev=>({...prev, productId: e.target.value}))} />
            </div>
            <button className="btn" onClick={loadCommissions}>Apply Filters</button>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <button className="btn" disabled={loading || selectedIds.size===0} onClick={()=>bulkAction('approve')}>{loading? 'Working...' : 'Approve'}</button>
            <button className="btn" disabled={loading || selectedIds.size===0} onClick={()=>bulkAction('pay')}>{loading? 'Working...' : 'Pay'}</button>
            <button className="btn bg-red-600 text-white" disabled={loading || selectedIds.size===0} onClick={()=>bulkAction('cancel')}>{loading? 'Working...' : 'Cancel'}</button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} /></th>
                  <th className="p-2">ID</th>
                  <th className="p-2">Marketer</th>
                  <th className="p-2">Product</th>
                  <th className="p-2">Order</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map(c => (
                  <tr key={c.id} className="border-b">
                    <td className="p-2"><input type="checkbox" checked={selectedIds.has(c.id)} onChange={()=>toggleSelect(c.id)} /></td>
                    <td className="p-2">{c.id}</td>
                    <td className="p-2">{c.Marketer ? `${c.Marketer.name} (${c.Marketer.id})` : c.marketerId}</td>
                    <td className="p-2">{c.Product ? `${c.Product.name} (${c.Product.id})` : c.productId}</td>
                    <td className="p-2">{c.orderId || '-'}</td>
                    <td className="p-2">{Number(c.amount || 0).toFixed(2)}</td>
                    <td className="p-2">{c.status}</td>
                    <td className="p-2">{new Date(c.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==='analytics' && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded border"><div className="text-gray-500 text-sm">Shares</div><div className="text-xl font-semibold">{analytics.totals?.shares ?? 0}</div></div>
            <div className="p-3 rounded border"><div className="text-gray-500 text-sm">Clicks</div><div className="text-xl font-semibold">{analytics.totals?.clicks ?? 0}</div></div>
            <div className="p-3 rounded border"><div className="text-gray-500 text-sm">Conversions</div><div className="text-xl font-semibold">{analytics.totals?.conversions ?? 0}</div></div>
            <div className="p-3 rounded border"><div className="text-gray-500 text-sm">Earned (KES)</div><div className="text-xl font-semibold">{Number(analytics.totals?.earned || 0).toFixed(2)}</div></div>
          </div>
          <div className="card p-4">
            <h2 className="font-semibold mb-2">By Marketer</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b"><th className="p-2">Marketer</th><th className="p-2">Clicks</th><th className="p-2">Conversions</th><th className="p-2">Earned</th></tr></thead>
                <tbody>
                  {analytics.byMarketer.map(row=> (
                    <tr key={row.marketerId} className="border-b">
                      <td className="p-2">{row.name} ({row.marketerId})</td>
                      <td className="p-2">{row.clicks}</td>
                      <td className="p-2">{row.conversions}</td>
                      <td className="p-2">{Number(row.earned || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="font-semibold mb-2">By Product</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b"><th className="p-2">Product</th><th className="p-2">Clicks</th><th className="p-2">Conversions</th></tr></thead>
                  <tbody>{analytics.byProduct.map(row=> (
                    <tr key={row.productId} className="border-b"><td className="p-2">{row.name} ({row.productId})</td><td className="p-2">{row.clicks}</td><td className="p-2">{row.conversions}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            <div className="card p-4">
              <h2 className="font-semibold mb-2">By Platform</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b"><th className="p-2">Platform</th><th className="p-2">Clicks</th><th className="p-2">Conversions</th></tr></thead>
                  <tbody>{analytics.byPlatform.map(row=> (
                    <tr key={row.platform} className="border-b"><td className="p-2">{row.platform}</td><td className="p-2">{row.clicks}</td><td className="p-2">{row.conversions}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab==='marketers' && (
        <div className="card p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b"><th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Referral Code</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr>
              </thead>
              <tbody>
                {marketers.map(m => (
                  <tr key={m.id} className="border-b">
                    <td className="p-2">{m.id}</td>
                    <td className="p-2">{m.name}</td>
                    <td className="p-2">{m.email}</td>
                    <td className="p-2">{m.referralCode || '-'}</td>
                    <td className="p-2">{m.isDeactivated ? 'suspended' : 'active'}</td>
                    <td className="p-2 flex flex-wrap gap-2">
                      {m.isDeactivated ? (
                        <button className="btn" onClick={()=>reactivateMarketer(m.id)}>Reactivate</button>
                      ) : (
                        <button className="btn bg-amber-500 text-white" onClick={()=>suspendMarketer(m.id)}>Suspend</button>
                      )}
                      <button className="btn" onClick={()=>revokeReferral(m.id)}>Revoke Referral</button>
                      <button className="btn" onClick={()=>assignReferral(m.id)}>Assign Referral</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==='rates' && (
        <div className="grid gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">Products</h2><button className="btn" onClick={loadRatesData}>Refresh</button></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b"><th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Current Rate (%)</th><th className="p-2">Actions</th></tr></thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="border-b">
                      <td className="p-2">{p.id}</td>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2">{p.commissionRate ?? '-'}</td>
                      <td className="p-2"><button className="btn" onClick={()=>updateProductRate(p.id)}>Set Rate</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card p-4">
            <h2 className="font-semibold mb-2">Categories</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b"><th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Actions</th></tr></thead>
                <tbody>
                  {categories.map(c => (
                    <tr key={c.id} className="border-b">
                      <td className="p-2">{c.id}</td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2"><button className="btn" onClick={()=>updateCategoryRates(c.id)}>Set Category Rate</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab==='audit' && (
        <div className="card p-4">
          <p className="text-sm text-gray-600">Audit log endpoint not available yet. This section will show commission and marketer lifecycle events once the backend provides <code>/api/admin/audit</code>.</p>
        </div>
      )}
    </div>
  )
}
