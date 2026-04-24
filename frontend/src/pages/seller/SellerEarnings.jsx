import React, { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'

export default function SellerEarnings(){
  const [orders,setOrders]=useState([])
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      try{
        const os = await api.get('/seller/orders')
        if (!alive) return
        setOrders(os.data||[])
      }catch(e){} finally{ if(alive) setLoading(false) }
    }
    load()
    return ()=>{ alive=false }
  },[])

  const kpis = useMemo(()=>{
    const paid = new Set(['paid','delivered'])
    const pendingSet = new Set(['pending','processing'])
    const todayStr = new Date().toISOString().slice(0,10)
    const total = orders.filter(o=> paid.has(o.status)).reduce((s,o)=> s + (o.sellerTotal||0),0)
    const today = orders.filter(o=> paid.has(o.status) && String(o.createdAt||'').slice(0,10)===todayStr)
      .reduce((s,o)=> s + (o.sellerTotal||0),0)
    const pending = orders.filter(o=> pendingSet.has(o.status)).reduce((s,o)=> s + (o.sellerTotal||0),0)
    return { total, today, pending }
  },[orders])

  const formatKES = useMemo(()=> (val)=>{
    const n = Number(val||0)
    return new Intl.NumberFormat('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
  }, [])

  return (
    <div className="p-0 sm:p-6 w-full">
      <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight mb-1">Earnings</h1>
      <div className="text-sm text-gray-500 mb-6">Calculated from base prices of your products.</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card"><div className="text-sm text-gray-500">Today (Base)</div><div className="text-xl font-bold">KES {formatKES(kpis.today)}</div></div>
        <div className="card"><div className="text-sm text-gray-500">Pending (Base)</div><div className="text-xl font-bold">KES {formatKES(kpis.pending)}</div></div>
        <div className="card"><div className="text-sm text-gray-500">Lifetime (Base)</div><div className="text-xl font-bold">KES {formatKES(kpis.total)}</div></div>
        <div className="card"><div className="text-sm text-gray-500">Withdrawable</div><div className="text-xl font-bold">KES 0</div></div>
      </div>

      {loading ? (
        <div className="text-gray-600">Loading...</div>
      ) : (
        <div className="card p-4 text-gray-700">
          <div className="font-semibold mb-2">Withdrawal History</div>
          <div className="text-sm text-gray-500">Coming soon</div>
        </div>
      )}
    </div>
  )
}
