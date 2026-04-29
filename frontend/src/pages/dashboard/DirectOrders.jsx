import React, { useState, useEffect, useCallback } from 'react';
import { orderApi } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { 
  ClipboardList, Send, CheckCircle2, AlertCircle, Loader2, Phone, MapPin, 
  ShoppingCart, UserCheck, UserPlus, ArrowRight, RefreshCw, Package,
  Clock, ChevronDown, ChevronRight, PlusCircle, ListOrdered, Store, User, Shield, Mail
} from 'lucide-react';
import { toast } from '../../components/ui/use-toast';

const STATUS_COLORS = {
  order_placed:    { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Placed' },
  confirmed:       { bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'Confirmed' },
  processing:      { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Processing' },
  in_transit:      { bg: 'bg-purple-50', text: 'text-purple-700', label: 'In Transit' },
  delivered:       { bg: 'bg-green-50',  text: 'text-green-700',  label: 'Delivered' },
  cancelled:       { bg: 'bg-red-50',    text: 'text-red-700',    label: 'Cancelled' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_COLORS[status] || { bg: 'bg-gray-50', text: 'text-gray-700', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
};

const OrderRow = ({ order, showMarketer = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [showSourceBlock, setShowSourceBlock] = useState(false);
  const items = order.OrderItems || [];
  const customer = order.user;
  const seller = order.seller;
  const marketer = order.marketer;
  const date = new Date(order.createdAt).toLocaleString();

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      <button 
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm text-gray-900 font-mono">{order.orderNumber}</p>
            <p className="text-[11px] text-gray-500 truncate">
              {customer?.name || order.customerName || 'Guest'} · {order.customerPhone}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-[9px] font-black text-gray-400 uppercase">Seller</span>
            <span className="text-[10px] font-bold text-gray-700 truncate max-w-[100px]">{seller?.businessName || seller?.name || '—'}</span>
          </div>

          {showMarketer && marketer && (
            <div className="hidden lg:flex flex-col items-end mr-4">
              <span className="text-[9px] font-black text-amber-400 uppercase">Placed By</span>
              <span className="text-[10px] font-bold text-amber-600 truncate max-w-[100px]">{marketer.name}</span>
            </div>
          )}

          <StatusBadge status={order.status} />
          <span className="text-xs font-bold text-gray-700 hidden sm:block">KES {parseFloat(order.total || 0).toLocaleString()}</span>
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-50 bg-gray-50/50 p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] mb-0.5">Customer</p>
              <p className="font-semibold text-gray-800">{customer?.name || order.customerName || 'Guest'}</p>
              <p className="text-gray-500">{order.customerPhone}</p>
              {order.customerEmail && <p className="text-gray-500 italic">{order.customerEmail}</p>}
            </div>
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] mb-0.5">Seller Information</p>
              <p className="font-semibold text-gray-800">{seller?.businessName || seller?.name || '—'}</p>
              <p className="text-gray-500">{seller?.phone || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] mb-0.5">Delivery Address</p>
              <p className="font-semibold text-gray-800">{order.deliveryAddress || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] mb-0.5">
                {marketer ? 'Placed By Marketer' : 'Placed By'}
              </p>
              <p className="font-semibold text-gray-800">{marketer ? marketer.name : 'System Admin'}</p>
              <p className="text-gray-500">{date}</p>
            </div>
          </div>

          <div>
            <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] mb-2">Order Items</p>
            <div className="space-y-1">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No items found</p>
              ) : items.map((item, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                  <div>
                    <span className="text-xs font-bold text-gray-800">{item.name}</span>
                    {item.variantId && <span className="ml-1 text-[10px] text-blue-500">({item.variantId})</span>}
                    {item.comboId && <span className="ml-1 text-[10px] text-purple-500">(Combo)</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>x{item.quantity}</span>
                    <span className="font-bold text-gray-800">KES {parseFloat(item.total || 0).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-100">
            <div>
              {order.originalTextBlock && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowSourceBlock(true); }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-600 rounded-md hover:bg-amber-100 transition-colors font-bold uppercase text-[9px]"
                >
                  <ClipboardList className="w-3 h-3" />
                  View Source Block
                </button>
              )}
            </div>
            <span className="font-black text-gray-900">Total Amount: KES {parseFloat(order.total || 0).toLocaleString()}</span>
          </div>

          {/* Source Block Modal */}
          {showSourceBlock && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowSourceBlock(false)}>
              <div 
                className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-amber-500" />
                      Original Order Block
                    </h3>
                    <button onClick={() => setShowSourceBlock(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                      <Trash2 className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 relative group">
                    <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap leading-relaxed">
                      {order.originalTextBlock}
                    </pre>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(order.originalTextBlock);
                        toast({ title: 'Copied!', description: 'Original block copied to clipboard.' });
                      }}
                      className="absolute top-3 right-3 p-2 bg-white shadow-sm border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button 
                    onClick={() => setShowSourceBlock(false)}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DirectOrders = () => {
  const { user: currentUser } = useAuth();
  const role = currentUser?.role;
  const roles = currentUser?.roles || [];
  
  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(role) || roles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));
  const isMarketer = role === 'marketer' || roles.includes('marketer');
  const canPlace = isAdmin || isMarketer;

  const [activeTab, setActiveTab] = useState(canPlace ? 'new' : 'manage');
  const [manageSubTab, setManageSubTab] = useState('admin');

  // --- New Order State ---
  const [textBlock, setTextBlock] = useState('');
  const [type, setType] = useState('fastfood');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('input');
  const [parsedData, setParsedData] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [userExists, setUserExists] = useState(false);
  const [suggestedPickupStation, setSuggestedPickupStation] = useState(null);
  const [orderResult, setOrderResult] = useState(null);

  // --- Manage Orders State ---
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const { data } = await orderApi.listDirect();
      if (data.success) setOrders(data.orders || []);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to fetch direct orders.', variant: 'destructive' });
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'manage') fetchOrders();
  }, [activeTab, fetchOrders]);

  const handleParse = async () => {
    if (!textBlock.trim()) {
      toast({ title: 'Error', description: 'Please paste the order text block.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await orderApi.parseDirect({ textBlock, type });
      if (data.success) {
        setParsedData(data.parsedData);
        setMatches(data.matches);
        setUserExists(data.userExists);
        setSuggestedPickupStation(data.suggestedPickupStation);
        setSelectedItemId(data.matches.length === 1 ? data.matches[0].id : null);
        setStep('review');
      }
    } catch (error) {
      toast({ title: 'Parsing Failed', description: error.response?.data?.message || 'Check format: Item(Qty)\nPhone\nAddress', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshMatches = async () => {
    if (!parsedData?.itemName) return;
    setLoading(true);
    try {
      const { data } = await orderApi.parseDirect({ textBlock: parsedData.itemName, type });
      if (data.success) {
        setMatches(data.matches);
        setSelectedItemId(data.matches.length === 1 ? data.matches[0].id : null);
        toast({ title: 'Matches Updated', description: `Found ${data.matches.length} items for "${parsedData.itemName}"` });
      }
    } catch (error) {
      toast({ title: 'Search Failed', description: 'Could not refresh item matches.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedItemId) {
      toast({ title: 'Selection Required', description: 'Please select the correct item from the matches.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await orderApi.confirmDirect({
        itemId: selectedItemId,
        type,
        quantity: parsedData.quantity,
        customerPhone: parsedData.customerPhone,
        deliveryAddress: parsedData.deliveryAddress,
        pickupStationId: suggestedPickupStation?.id,
        customerName: parsedData.customerName,
        customerEmail: parsedData.customerEmail,
        originalTextBlock: textBlock
      });
      if (data.success) {
        setOrderResult(data);
        setStep('success');
        toast({ title: 'Success', description: 'Order placed successfully!' });
      }
    } catch (error) {
      toast({ title: 'Order Failed', description: error.response?.data?.message || 'Could not place order.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('input');
    setTextBlock('');
    setParsedData(null);
    setMatches([]);
    setSelectedItemId(null);
    setOrderResult(null);
  };

  const allFilteredOrders = orders.filter(o =>
    !searchTerm || 
    o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customerPhone?.includes(searchTerm) ||
    o.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.user?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.seller?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.seller?.businessName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.marketer?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const adminPlacedOrders = allFilteredOrders.filter(o => 
    o.marketerId === null || 
    (o.marketer?.role && ['admin', 'superadmin', 'super_admin'].includes(o.marketer.role)) ||
    (o.marketer?.roles && o.marketer.roles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r)))
  );
  
  const marketerPlacedOrders = allFilteredOrders.filter(o => 
    o.marketerId !== null && 
    !(o.marketer?.role && ['admin', 'superadmin', 'super_admin'].includes(o.marketer.role)) &&
    !(o.marketer?.roles && o.marketer.roles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r)))
  );

  const displayOrders = isAdmin 
    ? (manageSubTab === 'admin' ? adminPlacedOrders : marketerPlacedOrders)
    : allFilteredOrders;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-2">
            <ClipboardList className="w-8 h-8 text-blue-600" />
            Direct Orders
          </h1>
          <p className="text-sm text-gray-500">Rapid order placement · Track & manage</p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
          {canPlace && (
            <button
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'new' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <PlusCircle className="w-4 h-4" /> New Order
            </button>
          )}
          <button
            onClick={() => setActiveTab('manage')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'manage' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <ListOrdered className="w-4 h-4" /> Manage Orders
          </button>
        </div>
      </div>

      {activeTab === 'new' && canPlace && (
        <>
          {step === 'input' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Paste Order Block</label>
                  <div className="flex bg-gray-100 p-0.5 rounded-lg text-xs">
                    <button onClick={() => setType('fastfood')} className={`px-3 py-1 rounded-md font-bold transition-all ${type === 'fastfood' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Fast Food</button>
                    <button onClick={() => setType('product')} className={`px-3 py-1 rounded-md font-bold transition-all ${type === 'product' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Product</button>
                  </div>
                </div>

                <textarea
                  value={textBlock}
                  onChange={e => setTextBlock(e.target.value)}
                  placeholder={"Example:\nOmena(2)\nJohn Doe\n0757588395\nNyayo 1"}
                  className="w-full h-44 p-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono text-sm resize-none"
                />

                <button
                  onClick={handleParse}
                  disabled={loading || !textBlock.trim()}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  Parse &amp; Review Order
                </button>
              </div>
              <div className="bg-amber-50 p-3 border-t border-amber-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium">Supports multiple lines. The system will auto-detect Name, Phone, Email and Address.</p>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer & Address</h3>
                    <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">Editable</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        <User className="w-3 h-3" />
                      </div>
                      <input
                        type="text"
                        value={parsedData.customerName || ''}
                        onChange={(e) => setParsedData({ ...parsedData, customerName: e.target.value })}
                        placeholder="Customer Name (Optional)"
                        className="flex-1 text-sm font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        <Phone className="w-3 h-3" />
                      </div>
                      <input
                        type="text"
                        value={parsedData.customerPhone || ''}
                        onChange={(e) => setParsedData({ ...parsedData, customerPhone: e.target.value })}
                        placeholder="Phone Number"
                        className="flex-1 text-sm font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      {userExists && <span className="text-[9px] text-green-600 font-bold shrink-0">Existing</span>}
                    </div>
                    <div className="flex items-start gap-2 pt-1">
                      <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                        <MapPin className="w-3 h-3" />
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={parsedData.deliveryAddress || ''}
                          onChange={(e) => setParsedData({ ...parsedData, deliveryAddress: e.target.value })}
                          placeholder="Delivery Address"
                          rows={2}
                          className="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                        />
                        {suggestedPickupStation && <p className="text-[10px] text-green-600 font-bold mt-1">→ Suggested: {suggestedPickupStation.name}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order Details</h3>
                    <span className="text-[9px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-bold uppercase">Editable</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                        <ShoppingCart className="w-3 h-3" />
                      </div>
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={parsedData.itemName || ''}
                          onChange={(e) => setParsedData({ ...parsedData, itemName: e.target.value })}
                          placeholder="Item Name"
                          className="flex-1 text-sm font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                        />
                        <button 
                          onClick={handleRefreshMatches}
                          disabled={loading}
                          className="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shrink-0"
                          title="Refresh Matches"
                        >
                          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        <ListOrdered className="w-3 h-3" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-bold uppercase">Qty:</span>
                        <input
                          type="number"
                          value={parsedData.quantity || 1}
                          onChange={(e) => setParsedData({ ...parsedData, quantity: parseInt(e.target.value, 10) || 1 })}
                          className="w-16 text-sm font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                      </div>
                      <span className="text-[10px] font-black text-blue-600 uppercase ml-auto">Cash on Delivery</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button onClick={handlePlaceOrder} disabled={loading || !selectedItemId} className="flex-1 py-4 bg-green-600 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-green-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Finalize Order
                  </button>
                  <button onClick={() => setStep('input')} className="py-3 bg-gray-100 text-gray-600 rounded-2xl text-xs font-bold hover:bg-gray-200 transition-all">
                    ← Edit Block
                  </button>
                </div>
              </div>

              {/* Item Matching */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    Item Matches {matches.length > 0 && <span className="bg-gray-100 text-gray-600 px-2 rounded-full text-[10px]">{matches.length}</span>}
                  </h2>
                </div>

                {matches.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto"><AlertCircle className="w-7 h-7" /></div>
                    <p className="font-bold text-gray-800">No matching items found</p>
                    <p className="text-xs text-gray-500">Ensure the item name matches exactly or try a different keyword.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {matches.map((item, index) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${selectedItemId === item.id ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-white border flex items-center justify-center font-black text-xs text-gray-400">{index + 1}</div>
                          <div>
                            <p className="font-bold text-sm text-gray-900">{item.name}</p>
                            <p className="text-xs text-blue-600 font-black">KES {item.price}</p>
                          </div>
                        </div>
                        {selectedItemId === item.id && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="max-w-md mx-auto py-12 text-center space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900 uppercase">Order Confirmed!</h2>
                <p className="text-gray-500 text-sm mt-1">The direct order has been placed successfully.</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order Number:</span>
                  <span className="font-black text-gray-900 font-mono">{orderResult?.orderNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer:</span>
                  <span className="font-bold text-gray-900">{parsedData.customerName || parsedData.customerPhone}</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={reset} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:shadow-lg transition-all">Place Another Order</button>
                <button onClick={() => { reset(); setActiveTab('manage'); fetchOrders(); }} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                  View All Direct Orders <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button onClick={fetchOrders} disabled={ordersLoading} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {isAdmin && (
            <div className="flex items-center justify-between border-b border-gray-100 px-1">
              <div className="flex">
                <button
                  onClick={() => setManageSubTab('admin')}
                  className={`px-4 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${manageSubTab === 'admin' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Admin Managed
                </button>
                <button
                  onClick={() => setManageSubTab('marketers')}
                  className={`px-4 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${manageSubTab === 'marketers' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Marketers Direct Orders
                </button>
              </div>
              <div className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-full uppercase">
                Admin Mode
              </div>
            </div>
          )}

          {ordersLoading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading orders...</p>
            </div>
          ) : displayOrders.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <ClipboardList className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-bold text-gray-700">{searchTerm ? 'No matching orders' : 'No direct orders here yet'}</p>
              <p className="text-xs text-gray-400">Orders will appear here once they are placed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 font-bold px-1">{displayOrders.length} order{displayOrders.length !== 1 ? 's' : ''} found</p>
              {displayOrders.map(order => (
                <OrderRow 
                  key={order.id} 
                  order={order} 
                  showMarketer={isAdmin && manageSubTab === 'marketers'} 
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DirectOrders;
