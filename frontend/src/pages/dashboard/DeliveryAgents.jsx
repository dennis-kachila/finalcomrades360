import React, { useEffect, useState, useMemo } from 'react';
import api from '../../services/api';
import AdminPasswordDialog from '../../components/AdminPasswordDialog';
import { 
  Users, 
  Car, 
  MapPin, 
  Star, 
  CheckCircle, 
  Clock, 
  History, 
  BarChart2, 
  Info, 
  X, 
  ChevronRight, 
  Phone, 
  Mail, 
  CreditCard, 
  Calendar,
  AlertCircle,
  Shield,
  Truck,
  Bike,
  Navigation,
  Search,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend, 
  Filler 
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ─── Delivery History List (Inner Table) ─────────────────────────────────────
const DeliveryHistoryList = ({ agentId }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    orderNumber: '',
    status: '',
  });
  const pageSize = 10;

  const loadHistory = useCallback(async (isMore = false) => {
    if (isMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const currentPage = isMore ? page + 1 : 1;
      const params = new URLSearchParams({
        page: currentPage,
        pageSize,
        orderNumber: filters.orderNumber,
        status: filters.status,
      });

      const res = await api.get(`/admin/delivery/agents/${agentId}/history?${params.toString()}`);
      if (res.data.tasks) {
        if (isMore) {
          setTasks(prev => [...prev, ...res.data.tasks]);
        } else {
          setTasks(res.data.tasks);
        }
        setTotal(res.data.meta?.total || 0);
        setPage(currentPage);
      }
    } catch (err) {
      console.error('Failed to load delivery history:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [agentId, page, filters]);

  useEffect(() => {
    loadHistory();
  }, [agentId, filters.status]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    loadHistory(false);
  };

  return (
    <div className="bg-blue-50/50 p-4 border-t border-b border-blue-100 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
          <Truck className="w-4 h-4" /> Delivery History
          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-black">{total} TOTAL</span>
        </h4>

        {/* Filters */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
            <input
              type="text"
              name="orderNumber"
              placeholder="Order #..."
              value={filters.orderNumber}
              onChange={handleFilterChange}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none w-32"
            />
          </div>
          <select
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Status</option>
            <option value="assigned">Assigned</option>
            <option value="accepted">Accepted</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="submit"
            className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Filter size={12} />
          </button>
        </form>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-xs bg-white/50 rounded-xl border border-dashed border-gray-200">
          No delivery history found matching criteria.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50/50">
                <tr className="border-b border-gray-100">
                  <th className="p-3 text-left font-bold text-gray-500 uppercase">Order #</th>
                  <th className="p-3 text-left font-bold text-gray-500 uppercase">Type</th>
                  <th className="p-3 text-right font-bold text-gray-500 uppercase">Total Fee</th>
                  <th className="p-3 text-right font-bold text-gray-500 uppercase">Fee Share</th>
                  <th className="p-3 text-center font-bold text-gray-500 uppercase">Status</th>
                  <th className="p-3 text-right font-bold text-gray-500 uppercase">Completed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-600">{t.order?.orderNumber || `#${t.id}`}</td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900 uppercase tracking-tighter">
                        {t.deliveryType?.split('_').join(' ')}
                      </div>
                    </td>
                    <td className="p-3 text-right text-gray-500">KES {(t.deliveryFee || 0).toFixed(2)}</td>
                    <td className="p-3 text-right font-black text-green-600">KES {(t.agentEarnings || 0).toFixed(2)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        t.status === 'completed' ? 'bg-green-100 text-green-700' : 
                        t.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-right text-gray-400">
                      {t.completedAt ? new Date(t.completedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tasks.length < total && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => loadHistory(true)}
                disabled={loadingMore}
                className="px-6 py-2 bg-white border border-blue-200 text-blue-600 rounded-xl text-xs font-bold shadow-sm hover:bg-blue-50 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore ? (
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>Load More History</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function DeliveryAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [agentDetail, setAgentDetail] = useState(null);
  const [agentHistory, setAgentHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('profile'); // profile, history, stats
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [expandedAgentId, setExpandedAgentId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedAgentId(expandedAgentId === id ? null : id);
  };

  // Filter states
  const [filters, setFilters] = useState({
    vehicleType: '',
    location: '',
    isActive: '',
    minRating: ''
  });

  const loadAgents = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.vehicleType) queryParams.append('vehicleType', filters.vehicleType);
      if (filters.location) queryParams.append('location', filters.location);
      if (filters.isActive !== '') queryParams.append('isActive', filters.isActive);
      if (filters.minRating) queryParams.append('minRating', filters.minRating);

      const res = await api.get(`/admin/delivery/agents?${queryParams.toString()}`);
      setAgents(Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const openAgent = (agentId) => {
    setSelectedAgentId(agentId);
    setDrawerOpen(true);
    setActiveTab('profile');
    loadAgentDetail(agentId);
  };

  const loadAgentDetail = async (id) => {
    try {
      const res = await api.get(`/admin/delivery/agents/${id}/detail`);
      setAgentDetail(res.data);
    } catch (e) {
      setError('Failed to load agent details');
    }
  };

  const loadAgentHistory = async (id, page = 1) => {
    try {
      setHistoryLoading(true);
      const res = await api.get(`/admin/delivery/agents/${id}/history?page=${page}&pageSize=10`);
      setAgentHistory(res.data.tasks || []);
      setHistoryTotal(res.data.meta?.total || 0);
      setHistoryPage(page);
    } catch (e) {
      console.error('History Error:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (drawerOpen && selectedAgentId && activeTab === 'history') {
      loadAgentHistory(selectedAgentId, 1);
    }
  }, [drawerOpen, selectedAgentId, activeTab]);

  const toggleStatus = async (agentId, currentSuspendedStatus) => {
    try {
      const isSuspending = !currentSuspendedStatus;
      if (isSuspending) {
        const password = window.prompt('Please enter admin password to suspend this delivery agent:');
        if (!password) return;
        await adminApi.suspendDeliveryAgent(agentId, { adminPassword: password });
        setSuccess('Delivery agent suspended from dashboard access');
      } else {
        await adminApi.reactivateDeliveryAgent(agentId);
        setSuccess('Delivery agent reactivated');
      }
      
      // Refresh local state
      if (agentDetail && agentDetail.agent.id === agentId) {
        setAgentDetail({
          ...agentDetail,
          agent: {
            ...agentDetail.agent,
            isDeliverySuspended: isSuspending
          }
        });
      }
      loadAgents();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update suspension status');
    }
  };

  const stats = useMemo(() => {
    const total = agents.length;
    const active = agents.filter(a => a.deliveryProfile?.isActive).length;
    const tasks = agents.reduce((sum, a) => sum + (a.activeTasks || 0), 0);
    const completed = agents.reduce((sum, a) => sum + (a.deliveryProfile?.completedDeliveries || 0), 0);
    
    return { total, active, tasks, completed };
  }, [agents]);

  const chartData = useMemo(() => {
    if (!agentDetail?.stats) return null;
    // Mocking a simple chart if backend doesn't provide time-series admin data yet
    // Actually getAgentStats (agent side) has this, but we'll show a simple distribution for now
    return {
      labels: ['Completed', 'Failed', 'In Progress'],
      datasets: [{
        label: 'Task Volume',
        data: [agentDetail.stats.completedTasks, agentDetail.stats.failedTasks, agentDetail.agent.activeTasks || 0],
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        fill: true,
        tension: 0.4
      }]
    };
  }, [agentDetail]);

  const isAgentAvailableNow = (agent) => {
    const prof = agent?.deliveryProfile || {};
    if (!prof.isActive) return false;
    let av = null;
    try { av = prof.availability ? (typeof prof.availability === 'string' ? JSON.parse(prof.availability) : prof.availability) : null } catch (_) { }
    if (!av) return true; // Default to available if no schedule set

    const now = new Date();
    const days = Array.isArray(av?.days) ? av.days : [];
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const cur = dayMap[now.getDay()];
    if (days.length && !days.includes(cur)) return false;
    
    if (av?.from && av?.to) {
      const [fh, fm] = av.from.split(':').map(n => parseInt(n, 10));
      const [th, tm] = av.to.split(':').map(n => parseInt(n, 10));
      const mins = now.getHours() * 60 + now.getMinutes();
      const fromM = (fh || 0) * 60 + (fm || 0);
      const toM = (th || 0) * 60 + (tm || 0);
      if (!(mins >= fromM && mins <= toM)) return false;
    }
    return true;
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen relative overflow-hidden">
      {/* Header & Stats Cards */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <Users className="w-8 h-8 text-blue-600" />
            Delivery Force
          </h1>
          <p className="text-gray-500 mt-1">Monitor and manage your logistics network</p>
        </div>
        <button 
          onClick={loadAgents}
          disabled={loading}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-all"
        >
          <Clock className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users />} label="Total Agents" value={stats.total} color="blue" />
        <StatCard icon={<Navigation />} label="Active Now" value={stats.active} color="green" />
        <StatCard icon={<Clock />} label="Current Tasks" value={stats.tasks} color="amber" />
        <StatCard icon={<CheckCircle />} label="Lifetime Deliveries" value={stats.completed} color="purple" />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 sticky top-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              Advanced Filters
            </h3>
            
            <div className="space-y-4">
              <FilterGroup label="Vehicle Type">
                <select 
                  className="w-full bg-gray-50 border-none rounded-lg p-2.5 text-sm ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 transition-all"
                  value={filters.vehicleType}
                  onChange={(e) => setFilters({...filters, vehicleType: e.target.value})}
                >
                  <option value="">All Vehicles</option>
                  <option value="bike">Bicycle</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="car">Car</option>
                  <option value="van">Van</option>
                  <option value="truck">Truck</option>
                </select>
              </FilterGroup>

              <FilterGroup label="Location">
                <input 
                  type="text"
                  placeholder="e.g. Nairobi"
                  className="w-full bg-gray-50 border-none rounded-lg p-2.5 text-sm ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 transition-all"
                  value={filters.location}
                  onChange={(e) => setFilters({...filters, location: e.target.value})}
                />
              </FilterGroup>

              <FilterGroup label="Status">
                <select 
                  className="w-full bg-gray-50 border-none rounded-lg p-2.5 text-sm ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 transition-all"
                  value={filters.isActive}
                  onChange={(e) => setFilters({...filters, isActive: e.target.value})}
                >
                  <option value="">All Agents</option>
                  <option value="true">Active Only</option>
                  <option value="false">Inactive Only</option>
                </select>
              </FilterGroup>

              <div className="pt-2 flex gap-2">
                <button 
                  onClick={loadAgents}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-md active:scale-95"
                >
                  Apply
                </button>
                <button 
                  onClick={() => { setFilters({vehicleType: '', location: '', isActive: '', minRating: ''}); setTimeout(loadAgents, 10); }}
                  className="px-3 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table Area */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {error && (
              <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-3 text-red-600 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Agent Name</th>
                    <th className="px-6 py-4 text-center">Vehicle</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4 text-center">Deliveries</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agents.map((agent) => {
                    const prof = agent.deliveryProfile || {};
                    const isAvailable = isAgentAvailableNow(agent);
                    
                    return (
                      <React.Fragment key={agent.id}>
                        <tr 
                          className={`hover:bg-blue-50/30 transition-colors cursor-pointer group ${expandedAgentId === agent.id ? 'bg-blue-50/50' : ''}`}
                          onClick={() => toggleExpand(agent.id)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400">
                                {expandedAgentId === agent.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </span>
                              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold border-2 border-white shadow-sm overflow-hidden uppercase">
                                {agent.profileImage ? (
                                  <img src={agent.profileImage} alt="" className="w-full h-full object-cover" />
                                ) : agent.name?.charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{agent.name}</div>
                                <div className="text-xs text-gray-500 font-medium">{agent.phone || 'No phone'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col items-center gap-1">
                              <AgentVehicleIcon type={prof.vehicleType} color={prof.isActive ? 'blue' : 'gray'} />
                              <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">
                                {prof.vehiclePlate || 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              {prof.location || 'Unknown'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="text-lg font-bold text-gray-800 leading-none">{prof.completedDeliveries || 0}</span>
                              <span className="text-xs text-gray-400 font-medium mt-1">Total</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge 
                              isActive={prof.isActive} 
                              isSuspended={agent.isDeliverySuspended} 
                              isDeactivated={agent.isDeactivated}
                              isAvailable={isAvailable} 
                            />
                          </td>
                          <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={() => openAgent(agent.id)}
                              className="p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-400 hover:text-blue-600"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                        {expandedAgentId === agent.id && (
                          <tr>
                            <td colSpan="6" className="p-0">
                              <DeliveryHistoryList agentId={agent.id} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {agents.length === 0 && !loading && (
                    <tr>
                      <td colSpan="6" className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center">
                          <Users className="w-12 h-12 text-gray-200 mb-2" />
                          <p className="text-gray-400 font-medium">No delivery agents found matching criteria</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Side Slider Drawer */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity duration-300 ${drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setDrawerOpen(false)}
      >
        <div 
          className={`absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl transition-transform duration-300 ease-out border-l border-gray-100 flex flex-col ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="relative h-48 bg-gradient-to-br from-blue-600 to-indigo-700 p-6 flex items-end">
            <button 
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-all backdrop-blur-sm"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-4 text-white">
              <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 p-1">
                <div className="w-full h-full bg-white rounded-xl flex items-center justify-center text-blue-700 text-3xl font-extrabold shadow-inner overflow-hidden uppercase">
                  {agentDetail?.agent?.profileImage ? (
                    <img src={agentDetail.agent.profileImage} alt="" className="w-full h-full object-cover" />
                  ) : agentDetail?.agent?.name?.charAt(0) || '?'}
                </div>
              </div>
              <div className="pb-1">
                <h2 className="text-2xl font-bold leading-tight">{agentDetail?.agent?.name || 'Loading Agent...'}</h2>
                <div className="flex items-center gap-3 mt-1 opacity-90 text-sm font-medium">
                  <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> ID #{agentDetail?.agent?.id || '--'}</span>
                  <span className="w-1 h-1 bg-white/50 rounded-full"></span>
                  <span>Joined {agentDetail?.agent?.createdAt ? new Date(agentDetail.agent.createdAt).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Status Bar */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${!agentDetail?.agent?.isDeliverySuspended ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                {agentDetail?.agent?.isDeliverySuspended ? 'Access Suspended' : 'Access Active'}
              </span>
            </div>
            <button 
              onClick={() => toggleStatus(agentDetail.agent.id, agentDetail.agent.isDeliverySuspended)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${
                !agentDetail?.agent?.isDeliverySuspended 
                  ? 'bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-100' 
                  : 'bg-green-50 text-green-600 hover:bg-green-100 ring-1 ring-green-100'
              }`}
            >
              {agentDetail?.agent?.isDeliverySuspended ? 'Activate Access' : 'Suspend Access'}
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-4 flex gap-6 text-sm font-bold text-gray-400 border-b border-gray-100">
            <TabHeader id="profile" icon={<Info />} label="Profile Info" active={activeTab} onClick={setActiveTab} />
            <TabHeader id="history" icon={<History />} label="Deliveries" active={activeTab} onClick={setActiveTab} />
            <TabHeader id="stats" icon={<BarChart2 />} label="Analytics" active={activeTab} onClick={setActiveTab} />
          </div>

          {/* Drawer Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
            {activeTab === 'profile' && (
              <div className="space-y-8 pb-10">
                <Section label="Contact Details">
                  <InfoItem icon={<Mail className="text-blue-500" />} label="Email Address" value={agentDetail?.agent?.email} />
                  <InfoItem icon={<Phone className="text-green-500" />} label="Mobile Number" value={agentDetail?.agent?.phone} />
                  <InfoItem icon={<Navigation className="text-indigo-500" />} label="Location / Zone" value={agentDetail?.agent?.deliveryProfile?.location} />
                </Section>

                <Section label="Asset / Vehicle Info">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem label="Type" value={agentDetail?.agent?.deliveryProfile?.vehicleType} upper />
                    <InfoItem label="Plate Number" value={agentDetail?.agent?.deliveryProfile?.vehiclePlate} upper />
                    <InfoItem label="Model" value={agentDetail?.agent?.deliveryProfile?.vehicleModel} />
                    <InfoItem label="Capacity" value={agentDetail?.agent?.deliveryProfile?.maxLoadCapacity ? `${agentDetail.agent.deliveryProfile.maxLoadCapacity} kg` : null} />
                  </div>
                  <InfoItem icon={<Shield className="text-amber-500" />} label="License Number" value={agentDetail?.agent?.deliveryProfile?.licenseNumber} />
                  <InfoItem icon={<Clock className="text-red-500" />} label="Insurance Expiry" value={agentDetail?.agent?.deliveryProfile?.insuranceExpiry ? new Date(agentDetail.agent.deliveryProfile.insuranceExpiry).toLocaleDateString() : 'N/A'} />
                </Section>

                <Section label="Payment & Settlement">
                  <div className="bg-gray-50 p-4 rounded-xl ring-1 ring-gray-100">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-gray-400 uppercase">Provider</span>
                      <span className="text-sm font-bold text-blue-600 uppercase">{agentDetail?.agent?.deliveryProfile?.mobileMoneyProvider || agentDetail?.agent?.deliveryProfile?.paymentMethod || 'M-PESA'}</span>
                    </div>
                    <InfoItem icon={<CreditCard className="text-purple-500" />} label="Account / Number" value={agentDetail?.agent?.deliveryProfile?.mobileMoneyNumber || agentDetail?.agent?.deliveryProfile?.accountNumber} />
                    <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <div className="text-[10px] uppercase font-bold text-gray-400">Total Delivery Fee Share</div>
                        <div className="text-lg font-extrabold text-blue-600">KES {agentDetail?.stats?.totalEarnings?.toLocaleString() || '0'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] uppercase font-bold text-gray-400">Wallet Balance</div>
                        <div className="text-lg font-extrabold text-green-600">KES {agentDetail?.stats?.walletBalance?.toLocaleString() || '0'}</div>
                      </div>
                    </div>
                  </div>
                </Section>

                <Section label="Operations">
                   <div className="flex flex-wrap gap-2">
                     <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold ring-1 ring-blue-100">
                       Max Distance: {agentDetail?.agent?.deliveryProfile?.maxDeliveryDistance || '10'} km
                     </span>
                     <span className="px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-bold ring-1 ring-green-100">
                       Rating: ⭐ {agentDetail?.agent?.deliveryProfile?.rating?.toFixed(1) || '5.0'}
                     </span>
                   </div>
                   <div className="mt-2 text-xs text-gray-400 italic">Preferred Zones: {agentDetail?.agent?.deliveryProfile?.preferredZones || 'Anywhere'}</div>
                </Section>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4 pb-10">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Delivery Tasks</h4>
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-bold text-gray-500">{historyTotal} Total</span>
                </div>
                
                {historyLoading ? (
                  <div className="py-10 text-center text-gray-400 animate-pulse">Fetching history...</div>
                ) : agentHistory.length > 0 ? (
                  agentHistory.map((task) => (
                    <div key={task.id} className="p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all bg-white relative group">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-gray-800 flex items-center gap-2">
                            Order #{task.order?.orderNumber || '---'}
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                              {task.deliveryType?.split('_').join(' ')}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(task.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold text-green-600 text-sm">KES {task.agentEarnings?.toLocaleString()}</div>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            task.status === 'completed' ? 'bg-green-500 text-white' : 
                            task.status === 'failed' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                          }`}>
                            {task.status}
                          </span>
                        </div>
                      </div>
                      {task.rejectionReason && (
                        <div className="mt-2 text-[10px] text-red-500 font-medium p-2 bg-red-50 rounded italic border-l-2 border-red-500">
                          Rejection: "{task.rejectionReason}"
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center">
                    <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 font-medium">No history found for this agent</p>
                  </div>
                )}

                {historyTotal > agentHistory.length && (
                   <div className="flex gap-2 pt-4 justify-center">
                      <button 
                        disabled={historyPage <= 1}
                        onClick={() => loadAgentHistory(selectedAgentId, historyPage - 1)}
                        className="p-2 border rounded hover:bg-gray-50 disabled:opacity-30"
                      >
                         Prev
                      </button>
                      <button 
                         disabled={historyPage * 10 >= historyTotal}
                         onClick={() => loadAgentHistory(selectedAgentId, historyPage + 1)}
                         className="p-2 border rounded hover:bg-gray-50 disabled:opacity-30"
                      >
                         Next
                      </button>
                   </div>
                )}
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-8 pb-10">
                <div className="grid grid-cols-2 gap-4">
                  <StatMini label="Completion Rate" value={`${agentDetail?.stats?.completionRate}%`} sub="Across all time" trend="+2%" />
                  <StatMini label="Avg Rating" value={`⭐ ${agentDetail?.agent?.deliveryProfile?.rating?.toFixed(1) || '5.0'}`} sub="Based on feedback" />
                  <StatMini label="Completed" value={agentDetail?.stats?.completedTasks} sub="Tasks successful" color="green" />
                  <StatMini label="Aborted/Rejected" value={agentDetail?.stats?.failedTasks} sub="Tasks not finished" color="red" />
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl ring-1 ring-gray-100">
                  <h4 className="text-sm font-bold text-gray-800 mb-6 flex items-center justify-between">
                    Performance Breakdown
                    <span className="text-[10px] text-blue-600 bg-blue-100 px-2 py-1 rounded">Live Distribution</span>
                  </h4>
                  <div className="h-48 relative">
                    {chartData ? <Line data={chartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }} /> : <div className="animate-pulse bg-gray-200 h-full rounded"></div>}
                  </div>
                  <div className="mt-6 flex justify-between text-center pt-6 border-t border-gray-200">
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Success %</div>
                      <div className="text-xl font-black text-gray-800">{agentDetail?.stats?.completionRate}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Avg Earnings</div>
                      <div className="text-xl font-black text-gray-800">KES {(agentDetail?.stats?.totalEarnings / (agentDetail?.stats?.completedTasks || 1)).toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Total Volume</div>
                      <div className="text-xl font-black text-gray-800">{agentDetail?.stats?.totalTasks}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AdminPasswordDialog 
        isOpen={false} // Managed by higher level if needed, but here we can keep it for manual overrides
        onClose={() => {}}
        onConfirm={() => {}}
        title="Admin Authorization"
      />
    </div>
  );
}

// Sub-components
function StatCard({ icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-600 text-blue-100 shadow-blue-200',
    green: 'bg-emerald-600 text-emerald-100 shadow-emerald-200',
    amber: 'bg-amber-600 text-amber-100 shadow-amber-200',
    purple: 'bg-indigo-600 text-indigo-100 shadow-indigo-200'
  };
  
  return (
    <div className={`p-5 rounded-2xl shadow-lg ${colors[color]} relative overflow-hidden group`}>
      <div className="absolute -right-2 -top-2 opacity-10 scale-150 rotate-12 group-hover:scale-125 transition-transform duration-500">
        {React.cloneElement(icon, { size: 100 })}
      </div>
      <div className="relative z-10 flex flex-col items-start h-full justify-between">
        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm mb-3">
          {React.cloneElement(icon, { size: 20 })}
        </div>
        <div>
          <div className="text-3xl font-black mb-1">{value?.toLocaleString() || '0'}</div>
          <div className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</div>
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, value, sub, color = 'blue', trend }) {
  const colors = {
    blue: 'text-blue-600 border-blue-50 bg-blue-50/20',
    green: 'text-emerald-600 border-emerald-50 bg-emerald-50/20',
    red: 'text-red-600 border-red-50 bg-red-50/20'
  };
  
  return (
    <div className={`p-4 rounded-2xl border ${colors[color]} flex flex-col justify-between`}>
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wide">{label}</span>
        {trend && <span className="text-[10px] font-black">{trend}</span>}
      </div>
      <div className="mt-1">
        <div className="text-xl font-extrabold text-gray-800">{value}</div>
        <div className="text-[10px] text-gray-400 font-medium">{sub}</div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ isActive, isSuspended, isDeactivated, isAvailable }) {
  if (isDeactivated) return (
    <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-[10px] font-bold border border-red-200 uppercase tracking-wide">
      Deactivated
    </span>
  );
  if (isSuspended) return (
    <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-bold border border-red-100 uppercase tracking-wide">
      Suspended
    </span>
  );
  if (!isActive) return (
    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold border border-gray-200 uppercase tracking-wide">
      Inactive
    </span>
  );
  if (isAvailable) return (
    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100 uppercase tracking-wide">
      Available
    </span>
  );
  return (
    <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold border border-amber-100 uppercase tracking-wide">
      On Shift
    </span>
  );
}

function AgentVehicleIcon({ type, color }) {
  const icons = {
    bike: <Bike />,
    motorcycle: <Navigation />,
    car: <Car />,
    van: <Truck />,
    truck: <Truck />
  };
  
  const colors = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    gray: 'bg-gray-100 text-gray-400 ring-gray-100'
  };

  return (
    <div className={`p-1.5 rounded-lg ring-1 ${colors[color || 'blue']}`}>
      {React.cloneElement(icons[type] || <Truck />, { size: 16 })}
    </div>
  );
}

function TabHeader({ id, icon, label, active, onClick }) {
  const isActive = active === id;
  return (
    <button 
      onClick={() => onClick(id)}
      className={`pb-3 flex items-center gap-2 transition-all relative ${isActive ? 'text-blue-600' : 'hover:text-gray-600'}`}
    >
      {React.cloneElement(icon, { size: 14, className: isActive ? 'text-blue-500' : 'text-gray-300' })}
      {label}
      {isActive && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full"></div>}
    </button>
  );
}

function Section({ label, children }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">{label}</h4>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value, upper = false }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5">{React.cloneElement(icon, { size: 14 })}</div>}
      <div className="flex-1">
        <div className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">{label}</div>
        <div className={`text-sm font-semibold text-gray-800 ${upper ? 'uppercase' : ''}`}>{value || '--'}</div>
      </div>
    </div>
  );
}
