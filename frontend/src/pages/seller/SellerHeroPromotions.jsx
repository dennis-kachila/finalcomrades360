import React, { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { uploadFile } from '../../services/upload'

export default function SellerHeroPromotions() {
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState([])
  const [durationDays, setDurationDays] = useState(7)
  const [slotsCount, setSlotsCount] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [mine, setMine] = useState([])
  const [message, setMessage] = useState('')
  const [promoTitle, setPromoTitle] = useState('')
  const [promoSubtitle, setPromoSubtitle] = useState('')
  const [uploadingId, setUploadingId] = useState(null)
  const [paymentProofUrl, setPaymentProofUrl] = useState('')
  const [proofUploading, setProofUploading] = useState(false)
  const [rates, setRates] = useState({ perDay: 500, perProduct: 100, instructions: '' })
  const [loading, setLoading] = useState(true)

  const editApp = async (item) => {
    try {
      const productIdsStr = prompt('Update Product IDs (comma-separated) or leave blank to keep same:', (item.productIds || []).join(','))
      const durationDaysStr = prompt('Update Duration days (blank to keep):', String(item.durationDays || ''))
      const slotsCountStr = prompt('Update Slots count (blank to keep):', String(item.slotsCount || ''))
      const payload = {}
      if (productIdsStr !== null && productIdsStr.trim() !== '') {
        const productIds = productIdsStr.split(',').map(x => Number(x.trim())).filter(Boolean)
        if (productIds.length) payload.productIds = productIds
      }
      if (durationDaysStr !== null && durationDaysStr.trim() !== '') payload.durationDays = Number(durationDaysStr)
      if (slotsCountStr !== null && slotsCountStr.trim() !== '') payload.slotsCount = Number(slotsCountStr)
      if (Object.keys(payload).length === 0) return
      await api.patch(`/hero-promotions/${item.id}`, payload)
      api.get('/hero-promotions/mine').then(r => setMine(r.data?.items || [])).catch(() => { })
      setMessage('Application updated.')
    } catch (e) {
      setMessage(e?.response?.data?.error || 'Failed to update')
    }
  }

  const deleteApp = async (item) => {
    if (!window.confirm('Delete this application? If already paid, this will request a refund.')) return
    try {
      const reason = prompt('Optional reason:', '')
      const { data } = await api.delete(`/hero-promotions/${item.id}`, { data: reason ? { reason } : {} })
      api.get('/hero-promotions/mine').then(r => setMine(r.data?.items || [])).catch(() => { })
      const promotion = data?.promotion || item
      const msg = promotion?.paymentStatus === 'refund_requested' ? 'Refund requested.' : 'Application cancelled.'
      setMessage(msg)
    } catch (e) {
      setMessage(e?.response?.data?.error || 'Failed to delete')
    }
  }

  const requestRefund = async (item) => {
    try {
      const reason = prompt('Reason for refund (optional):', '')
      await api.post(`/hero-promotions/${item.id}/refund`, reason ? { reason } : {})
      api.get('/hero-promotions/mine').then(r => setMine(r.data?.items || [])).catch(() => { })
      setMessage('Refund requested.')
    } catch (e) {
      setMessage(e?.response?.data?.error || 'Failed to request refund')
    }
  }

  // Resolve backend file URLs (e.g., /uploads/...) to absolute using API base
  const fileBase = useMemo(() => {
    const base = api.defaults.baseURL || ''
    return base.replace(/\/?api\/?$/, '')
  }, [])
  const resolveFileUrl = (url) => {
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return `${fileBase}/${String(url).replace(/^\/+/, '')}`
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        await Promise.all([
          api.get('/seller/products').then(r => {
            const list = Array.isArray(r.data) ? r.data : (r.data?.data || [])
            setProducts(list)
          }),
          api.get('/hero-promotions/mine').then(r => setMine(r.data?.items || [])),
          api.get('/hero-promotions/rates').then(r => {
            if (r.data) setRates(r.data)
          })
        ])
      } catch (e) { } finally { setLoading(false) }
    }
    loadData()
  }, [])

  const onToggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const submitProof = async (appId, file) => {
    if (!file) return
    try {
      setUploadingId(appId)
      const url = await uploadFile(file)
      await api.post(`/hero-promotions/${appId}/payment-proof`, { paymentProofUrl: url })
      setMessage('Payment proof submitted for review.')
      api.get('/hero-promotions/mine').then(r => setMine(r.data?.items || [])).catch(() => { })
    } catch (e) {
      setMessage(e?.response?.data?.error || 'Failed to submit payment proof')
    } finally {
      setUploadingId(null)
    }
  }

  const estAmount = useMemo(() => {
    return (Number(durationDays) || 0) * ((rates.perDay || 0) + (selected.length * (rates.perProduct || 0)))
  }, [durationDays, selected, rates])

  const submit = async () => {
    if (selected.length === 0) { setMessage('Select at least one product'); return }
    if (!promoTitle.trim()) { setMessage('Please provide a preferred banner heading.'); return }
    if (!promoSubtitle.trim()) { setMessage('Please provide a preferred subheading.'); return }
    if (!paymentProofUrl) { setMessage('Please upload payment proof before submitting.'); return }
    setSubmitting(true)
    setMessage('')
    try {
      const { data } = await api.post('/hero-promotions/apply', { productIds: selected, durationDays, slotsCount, title: promoTitle, subtitle: promoSubtitle })
      const appId = data?.promotion?.id
      if (appId && paymentProofUrl) {
        try { await api.post(`/hero-promotions/${appId}/payment-proof`, { paymentProofUrl }) } catch (_) { }
      }
      setMessage(`Application submitted. Amount due: KES ${data?.promotion?.amount || estAmount}. Status: ${data?.promotion?.status}. Payment proof attached.`)
      setSelected([])
      setPaymentProofUrl('')
      setPromoTitle('')
      setPromoSubtitle('')
      api.get('/hero-promotions/mine').then(r => setMine(r.data?.items || [])).catch(() => { })
    } catch (e) {
      setMessage(e?.response?.data?.error || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600 font-medium">Loading promotion details...</p>
      </div>
    )
  }

  return (
    <div className="p-0 sm:p-4">
      <h2 className="text-lg font-semibold mb-3">Apply for Hero Banner Promotion</h2>
      <div className="card p-4 mb-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-2">Select Products</div>
            <div className="max-h-64 overflow-auto border rounded mb-4">
              {products.map(p => (
                <label key={p.id} className="flex items-center gap-2 p-2 border-b">
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => onToggle(p.id)} />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
              {products.length === 0 && <div className="p-3 text-sm text-gray-500">No products yet.</div>}
            </div>
            
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Banner Heading <span className="text-red-500">*</span></label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="e.g. FLASH SALE - ELECTRONICS" value={promoTitle} onChange={e => setPromoTitle(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Subheading <span className="text-red-500">*</span></label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="e.g. Get up to 50% off amazing gadgets!" value={promoSubtitle} onChange={e => setPromoSubtitle(e.target.value)} />
                <p className="text-xs text-gray-500 mt-1">Our marketing team will review these for quality before publishing.</p>
              </div>
            </div>
          </div>
          <div>
            <div className="flex gap-4 mb-3">
              <label className="flex flex-col text-sm">Duration (days)
                <input type="number" min={1} className="border rounded px-2 py-1" value={durationDays} onChange={e => setDurationDays(e.target.value)} />
              </label>
              <label className="flex flex-col text-sm">Slots Count
                <input type="number" min={1} className="border rounded px-2 py-1" value={slotsCount} onChange={e => setSlotsCount(e.target.value)} />
              </label>
            </div>
            <div className="mb-3">
              <div className="text-sm font-medium mb-1">Payment Proof</div>
              <div className="flex items-center gap-2 text-sm">
                <label className="px-3 py-1 border rounded cursor-pointer bg-gray-50 hover:bg-gray-100">
                  {proofUploading ? 'Uploading...' : (paymentProofUrl ? 'Replace Proof' : 'Upload Proof')}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      try {
                        setProofUploading(true)
                        const url = await uploadFile(f)
                        setPaymentProofUrl(url)
                        setMessage('Payment proof uploaded. You can now submit your application.')
                      } catch (err) {
                        setMessage(err?.response?.data?.error || 'Failed to upload proof')
                      } finally {
                        setProofUploading(false)
                      }
                    }}
                    disabled={proofUploading}
                  />
                </label>
                {paymentProofUrl && (
                  <a href={resolveFileUrl(paymentProofUrl)} target="_blank" rel="noreferrer" className="text-blue-600 underline">View</a>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">Upload your payment receipt/screenshot before submitting the application.</div>
            </div>
            {rates.instructions && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded text-sm text-blue-800">
                <div className="font-bold mb-1">Payment Instructions:</div>
                {rates.instructions}
              </div>
            )}
            <div className="text-sm text-gray-600 mb-3">
              Official Rates: <span className="font-medium">KES {rates.perDay} base daily</span> + <span className="font-medium">KES {rates.perProduct} per product/day</span>
              <br />
              Total Amount: <span className="font-bold text-blue-600">KES {estAmount}</span>
            </div>
            <button disabled={submitting || !paymentProofUrl} onClick={submit} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 w-full md:w-auto">{submitting ? 'Submitting...' : 'Submit Application & Proof'}</button>
            {message && <div className="mt-3 text-sm font-medium p-2 bg-gray-50 rounded">{message}</div>}
          </div>
        </div>
      </div>

      <h3 className="text-md font-semibold mb-2">My Hero Promotion Applications</h3>
      {(() => {
        const isHistory = (x) => x.paymentStatus === 'refunded' || (['expired', 'cancelled', 'rejected'].includes(x.status) && x.paymentStatus !== 'refund_requested')
        const current = (mine || []).filter(x => !isHistory(x))
        const history = (mine || []).filter(isHistory)
        return (
          <>
            <h4 className="text-sm font-semibold mb-1">Current</h4>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {current.map(m => (
                <div key={m.id} className="card p-3">
                  <div className="text-sm">ID: {m.id}</div>
                  <div className="text-sm">Status: <span className="font-medium">{m.status}</span> | Payment: {m.paymentStatus}</div>
                  <div className="text-sm">Products: {(m.productIds || []).join(', ')}</div>
                  <div className="text-sm">Duration: {m.durationDays} day(s), Slots: {m.slotsCount}</div>
                  {m.startAt && <div className="text-sm">Scheduled: {new Date(m.startAt).toLocaleString()} → {new Date(m.endAt).toLocaleString()}</div>}
                  <div className="text-sm">Amount: KES {m.amount}</div>
                  {m.paymentProofUrl && (
                    <div className="text-sm">Payment Proof: <a href={resolveFileUrl(m.paymentProofUrl)} target="_blank" rel="noreferrer" className="text-blue-600 underline">View</a></div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {['approved', 'scheduled', 'active'].includes(m.status) ? null : (
                      <>
                        <button className="px-3 py-1 border rounded" onClick={() => editApp(m)}>Edit</button>
                        <button className="px-3 py-1 border rounded" onClick={() => deleteApp(m)}>{m.paymentStatus === 'paid' ? 'Delete (Request Refund)' : 'Delete'}</button>
                        {m.paymentStatus === 'paid' && <button className="px-3 py-1 border rounded" onClick={() => requestRefund(m)}>Request Refund</button>}
                      </>
                    )}
                  </div>
                  {m.paymentStatus !== 'paid' && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <label className="px-3 py-1 border rounded cursor-pointer bg-gray-50 hover:bg-gray-100">
                        {uploadingId === m.id ? 'Uploading...' : 'Upload Payment Proof'}
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => submitProof(m.id, e.target.files?.[0])} disabled={uploadingId === m.id} />
                      </label>
                      <span className="text-gray-500">Attach receipt/screenshot; admin will verify and mark as paid.</span>
                    </div>
                  )}
                </div>
              ))}
              {current.length === 0 && <div className="text-sm text-gray-500">No current applications.</div>}
            </div>

            <h4 className="text-sm font-semibold mb-1">History</h4>
            <div className="grid grid-cols-2 gap-3">
              {history.map(m => (
                <div key={m.id} className="card p-3">
                  <div className="text-sm">ID: {m.id}</div>
                  <div className="text-sm">Status: <span className="font-medium">{m.status}</span> | Payment: {m.paymentStatus}</div>
                  <div className="text-sm">Products: {(m.productIds || []).join(', ')}</div>
                  <div className="text-sm">Duration: {m.durationDays} day(s), Slots: {m.slotsCount}</div>
                  {m.endAt && <div className="text-sm">Ended: {new Date(m.endAt).toLocaleString()}</div>}
                  <div className="text-sm">Amount: KES {m.amount}</div>
                </div>
              ))}
              {history.length === 0 && <div className="text-sm text-gray-500">No history yet.</div>}
            </div>
          </>
        )
      })()}
    </div>
  )
}
