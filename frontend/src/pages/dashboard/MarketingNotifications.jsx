import React, { useState, useEffect } from 'react';
import { 
  FaBullhorn, 
  FaComments, 
  FaFilter, 
  FaCheckCircle, 
  FaUtensils, 
  FaBox, 
  FaPaperPlane, 
  FaHistory,
  FaSearch,
  FaCalendarDay,
  FaUser,
  FaClock
} from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';

const MarketingNotifications = () => {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('all'); // all, product, fastfood
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchRecipients();
  }, [filter]);

  const fetchRecipients = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/marketing/potential-recipients?type=${filter}`);
      if (data.success) {
        setRecipients(data.orders);
        setSelectedOrders(data.orders.map(o => o.id)); // Default select all
      }
    } catch (err) {
      toast.error('Failed to fetch potential recipients');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedOrders.length === recipients.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(recipients.map(o => o.id));
    }
  };

  const handleToggleSelect = (id) => {
    if (selectedOrders.includes(id)) {
      setSelectedOrders(selectedOrders.filter(oid => oid !== id));
    } else {
      setSelectedOrders([...selectedOrders, id]);
    }
  };

  const handleSendMessages = async () => {
    if (selectedOrders.length === 0) {
      toast.warning('Please select at least one order');
      return;
    }

    if (!window.confirm(`Send thank you messages to ${selectedOrders.length} customers?`)) return;

    setSending(true);
    try {
      const { data } = await api.post('/admin/marketing/send-bulk-thank-you', {
        orderIds: selectedOrders,
        type: filter
      });
      if (data.success) {
        toast.success(data.message);
        fetchRecipients(); // Refresh list
      }
    } catch (err) {
      toast.error('Failed to send bulk messages');
    } finally {
      setSending(false);
    }
  };

  const filteredRecipients = recipients.filter(r => 
    r.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customerPhone?.includes(searchTerm)
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-2">
            <FaBullhorn className="text-blue-600" />
            Daily Thank You Messages
          </h1>
          <p className="text-sm text-gray-500">Engage customers after successful delivery</p>
        </div>
        <div className="flex bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold items-center gap-2">
          <FaCalendarDay />
          Automated daily at 8:00 PM
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats & Filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6">
            <div className="space-y-2">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <FaFilter className="w-3 h-3" />
                Audience Filter
              </h3>
              <div className="flex flex-col gap-2">
                {[
                  { id: 'all', label: 'All Delivered Today', icon: <FaCheckCircle /> },
                  { id: 'product', label: 'Products Only', icon: <FaBox /> },
                  { id: 'fastfood', label: 'FastFood Only', icon: <FaUtensils /> },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setFilter(item.id)}
                    className={`flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all ${filter === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-[1.02]' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      {item.label}
                    </span>
                    {filter === item.id && <FaCheckCircle className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <div className="bg-blue-50 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between text-xs font-bold text-blue-600">
                  <span>Selected</span>
                  <span>{selectedOrders.length} / {recipients.length}</span>
                </div>
                <button
                  onClick={handleSendMessages}
                  disabled={sending || selectedOrders.length === 0}
                  className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-200"
                >
                  {sending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FaPaperPlane />}
                  Send Bulk Now
                </button>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
            <h4 className="text-[11px] font-black text-amber-600 uppercase tracking-widest mb-2">Pro Tip</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              Manual triggers are great for early engagement, but the system will automatically process all remaining delivered orders at 8:00 PM tonight.
            </p>
          </div>
        </div>

        {/* Recipients List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by customer or order #..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border-transparent rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
              <button 
                onClick={handleToggleSelectAll}
                className="text-xs font-black text-blue-600 hover:text-blue-700 uppercase tracking-tight px-2"
              >
                {selectedOrders.length === recipients.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-20 flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-10 h-10 border-4 border-gray-100 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-sm font-bold uppercase tracking-widest">Scanning Deliveries...</p>
                </div>
              ) : filteredRecipients.length === 0 ? (
                <div className="p-20 text-center space-y-4">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                    <FaHistory className="w-8 h-8 text-gray-300" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-700">No delivered orders found</p>
                    <p className="text-xs text-gray-400 max-w-[200px] mx-auto">Either no deliveries happened today or all messages have been sent.</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredRecipients.map(order => (
                    <div 
                      key={order.id}
                      onClick={() => handleToggleSelect(order.id)}
                      className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors ${selectedOrders.includes(order.id) ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedOrders.includes(order.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200'}`}>
                        {selectedOrders.includes(order.id) && <FaCheckCircle className="w-3 h-3" />}
                      </div>
                      
                      <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                        {order.itemType === 'fastfood' ? <FaUtensils className="w-4 h-4 text-orange-500" /> : <FaBox className="w-4 h-4 text-blue-500" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900 truncate">{order.customerName}</h4>
                          <span className="text-[10px] font-black text-gray-400 font-mono">#{order.orderNumber}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500">
                          <span className="flex items-center gap-1"><FaUser className="w-2.5 h-2.5" /> {order.customerPhone}</span>
                          <span className="flex items-center gap-1"><FaClock className="w-2.5 h-2.5" /> {new Date(order.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${order.itemType === 'fastfood' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                          {order.itemType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default MarketingNotifications;
