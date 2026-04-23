import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';

// ─── Small stateless components ──────────────────────────────────────────────
const Badge = ({ suspended, deactivated }) => {
  if (deactivated) return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-200 text-red-900 border border-red-300">
      ● Global Deactivated
    </span>
  );
  if (suspended) return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
      ● Suspended
    </span>
  );
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
      ● Active
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const map = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

const Stat = ({ label, value, colour }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
    <div className={`text-2xl font-bold ${colour}`}>{value}</div>
    <div className="text-sm text-gray-500 mt-1">{label}</div>
  </div>
);

const Alert = ({ type, msg, onClose }) => {
  if (!msg) return null;
  const cls = type === 'error'
    ? 'bg-red-50 border-red-300 text-red-700'
    : 'bg-green-50 border-green-300 text-green-700';
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${cls}`}>
      <span className="flex-1 text-sm">{msg}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100">✕</button>
    </div>
  );
};



const PasswordPromptModal = ({ isOpen, onConfirm, onCancel, title, loading }) => {
  const [password, setPassword] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title || 'Confirm Action'}</h3>
        <p className="text-sm text-gray-500 mb-4">Please enter your admin password to authorize this action.</p>
        <input
          type="password"
          autoFocus
          placeholder="Enter your password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all mb-4"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(password)}
            disabled={loading || !password}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Marketer Profile Modal ───────────────────────────────────────────────────
function MarketerProfileModal({ marketer, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/admin/marketing/marketers/${marketer.id}`)
      .then(r => setData(r.data))
      .catch(err => {
        console.error('Error fetching marketer profile:', err);
        setError('Failed to load profile data. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [marketer.id]);

  const profile = data?.profile || {};
  const kpis = data?.kpis || {};
  const performance = data?.productPerformance || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md z-10 flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
              {marketer.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{marketer.name}</h2>
              <p className="text-sm text-gray-500">ID: {marketer.id} · Code: <span className="font-mono bg-gray-100 px-1 rounded">{marketer.referralCode || '—'}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">✕</button>
        </div>

        {loading ? (
          <div className="p-20 text-center text-gray-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            Loading profile information...
          </div>
        ) : error ? (
          <div className="p-20 text-center text-red-500 flex flex-col items-center gap-3">
            <span className="text-4xl">⚠️</span>
            <p className="font-medium text-lg">{error}</p>
            <button 
              onClick={() => {
                setLoading(true);
                setError(null);
                api.get(`/admin/marketing/marketers/${marketer.id}`)
                  .then(r => setData(r.data))
                  .catch(err => setError('Failed to load profile data.'))
                  .finally(() => setLoading(false));
              }}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all font-bold"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {/* KPI Section */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Shares" value={kpis.totalShares ?? 0} colour="text-blue-600" />
              <Stat label="Clicks" value={kpis.totalClicks ?? 0} colour="text-indigo-600" />
              <Stat label="Conversions" value={kpis.totalConversions ?? 0} colour="text-purple-600" />
              <Stat label="CTR" value={`${((kpis.ctr ?? 0) * 100).toFixed(1)}%`} colour="text-orange-500" />
              <Stat label="CVR" value={`${((kpis.cvr ?? 0) * 100).toFixed(1)}%`} colour="text-teal-600" />
              <Stat label="EPC" value={`KES ${(kpis.epc ?? 0).toFixed(2)}`} colour="text-pink-600" />
              <Stat label="Revenue" value={`KES ${(kpis.totalRevenue ?? 0).toFixed(2)}`} colour="text-green-600" />
              <Stat label="Commission" value={`KES ${(kpis.totalCommission ?? 0).toFixed(2)}`} colour="text-yellow-600" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Personal Details */}
              <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>👤</span> Personal Information
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">National ID</span>
                    <span className="font-semibold text-gray-900">{profile.nationalIdNumber || 'Not provided'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Gender</span>
                    <span className="capitalize font-semibold text-gray-900">{profile.gender || 'Not specified'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Date of Birth</span>
                    <span className="font-semibold text-gray-900">{profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : 'Not provided'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Phone</span>
                    <span className="font-semibold text-gray-900">{profile.phone}</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-gray-500">Email</span>
                    <span className="font-semibold text-gray-900">{profile.email}</span>
                  </div>
                </div>
              </div>

              {/* Location Details */}
              <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📍</span> Location & Base
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Campus</span>
                    <span className="font-semibold text-gray-900">{profile.campus || 'General'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">County / Town</span>
                    <span className="font-semibold text-gray-900">{profile.county || '—'}, {profile.town || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Estate / House</span>
                    <span className="font-semibold text-gray-900">{profile.estate || '—'}, {profile.houseNumber || '—'}</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-gray-500">ID Verification</span>
                    <span className={`font-semibold ${profile.nationalIdStatus === 'approved' ? 'text-green-600' : 'text-yellow-600'}`}>
                      {profile.nationalIdStatus?.toUpperCase() || 'NONE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance breakdown */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Item Performance</h3>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Products & FastFood</span>
              </div>
              {performance.length === 0 ? (
                <div className="p-10 text-center border-2 border-dashed border-gray-100 rounded-2xl text-gray-400 text-sm">
                  No tracking data available for this marketer yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Item Name</th>
                        <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="p-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Clicks</th>
                        <th className="p-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Sales</th>
                        <th className="p-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">CVR</th>
                        <th className="p-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Earning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 bg-white">
                      {performance.map((p, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                          <td className="p-4 font-semibold text-gray-900">{p.productName}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              p.itemType === 'fastfood' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {p.itemType}
                            </span>
                          </td>
                          <td className="p-4 text-gray-500">{p.categoryName}</td>
                          <td className="p-4 text-right font-mono">{p.clicks ?? 0}</td>
                          <td className="p-4 text-right font-bold text-purple-600">{p.conversions ?? 0}</td>
                          <td className="p-4 text-right text-blue-600 font-mono text-xs">{((p.cvr ?? 0) * 100).toFixed(1)}%</td>
                          <td className="p-4 text-right font-bold text-green-600">KES {(p.commission ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Performance Tab ──────────────────────────────────────────────────────────
function PerformanceTab({ onViewProfile }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [summary, setSummary] = useState({});
  const [sortBy, setSortBy] = useState('commission');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lr, sr] = await Promise.all([
        api.get(`/admin/marketing/marketers?sortBy=${sortBy}&limit=50`),
        api.get('/admin/marketing/summary'),
      ]);
      setLeaderboard(lr.data.items || []);
      setSummary(sr.data || {});
    } catch { }
    setLoading(false);
  }, [sortBy]);

  useEffect(() => { load(); }, [load]);

  const pct = v => `${((v || 0) * 100).toFixed(1)}%`;
  const kes = v => `KES ${(v || 0).toFixed(2)}`;

  const sortOptions = [
    { value: 'commission', label: 'Commission' },
    { value: 'revenue', label: 'Revenue' },
    { value: 'conversions', label: 'Conversions' },
    { value: 'clicks', label: 'Clicks' },
    { value: 'ctr', label: 'CTR' },
    { value: 'cvr', label: 'CVR' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total Shares" value={summary.totalShares ?? 0} colour="text-blue-600" />
        <Stat label="Total Clicks" value={summary.totalClicks ?? 0} colour="text-indigo-600" />
        <Stat label="Conversions" value={summary.totalConversions ?? 0} colour="text-purple-600" />
        <Stat label="Platform CTR" value={pct(summary.ctr)} colour="text-orange-500" />
        <Stat label="Platform CVR" value={pct(summary.cvr)} colour="text-teal-600" />
        <Stat label="Avg EPC" value={kes(summary.epc)} colour="text-pink-600" />
        <Stat label="Revenue Influenced" value={kes(summary.totalRevenueInfluenced)} colour="text-green-600" />
        <Stat label="Commission Earned" value={kes(summary.totalCommissionEarned)} colour="text-yellow-600" />
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Marketer Leaderboard</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500">Sort by</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading…</div>
        ) : leaderboard.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No performance data yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Marketer</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Clicks</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversions</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CTR</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CVR</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">EPC</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((row, i) => (
                  <tr key={row.marketerId} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-gray-400 font-medium">{i + 1}</td>
                    <td className="p-3">
                      <button
                        onClick={() => onViewProfile({ id: row.marketerId, name: row.user?.name || `#${row.marketerId}`, email: row.user?.email || '', referralCode: '' })}
                        className="text-left hover:text-blue-600 transition-colors"
                      >
                        <div className="font-medium text-gray-900">{row.user?.name || `ID #${row.marketerId}`}</div>
                        <div className="text-xs text-gray-400">{row.user?.email}</div>
                      </button>
                    </td>
                    <td className="p-3 text-right">{row.clicks ?? 0}</td>
                    <td className="p-3 text-right">{row.conversions ?? 0}</td>
                    <td className="p-3 text-right text-orange-500">{pct(row.ctr)}</td>
                    <td className="p-3 text-right text-teal-600">{pct(row.cvr)}</td>
                    <td className="p-3 text-right text-pink-600">{kes(row.epc)}</td>
                    <td className="p-3 text-right font-semibold text-green-600">{kes(row.commission)}</td>
                    <td className="p-3 text-right text-gray-700">{kes(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Commissions Tab ──────────────────────────────────────────────────────────
function CommissionsTab({ marketers }) {
  const [commissions, setCommissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [marketerFilter, setMarketerFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (statusFilter) params.set('status', statusFilter);
      if (marketerFilter) params.set('marketerId', marketerFilter);
      const r = await api.get(`/commissions?${params.toString()}`);
      setCommissions(r.data.commissions || []);
      setTotal(r.data.total || 0);
      setTotalPending(r.data.totalPending || 0);
      setTotalPaid(r.data.totalPaid || 0);
    } catch { }
    setLoading(false);
  }, [statusFilter, marketerFilter]);

  useEffect(() => { load(); }, [load]);

  const payOne = async (id) => {
    setActionLoading(true);
    try {
      await api.post(`/commissions/${id}/pay`);
      setMsg({ type: 'success', text: 'Commission marked as paid.' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to pay.' });
    }
    setActionLoading(false);
  };

  const payAll = async () => {
    if (!window.confirm(`Pay all pending commissions${marketerFilter ? ' for this marketer' : ''}?`)) return;
    setActionLoading(true);
    try {
      const body = marketerFilter ? { marketerId: Number(marketerFilter) } : {};
      const r = await api.post('/commissions/bulk-pay', body);
      setMsg({ type: 'success', text: r.data.message });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Bulk pay failed.' });
    }
    setActionLoading(false);
  };

  const productName = c => c.Product?.name || c.FastFood?.name || (c.productId ? `Product #${c.productId}` : c.fastFoodId ? `Food #${c.fastFoodId}` : `Service #${c.serviceId}`);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Total Records" value={total} colour="text-gray-700" />
        <Stat label={<span className="text-yellow-700">Pending Payout</span>} value={`KES ${totalPending.toFixed(2)}`} colour="text-yellow-600" />
        <Stat label="Total Paid Out" value={`KES ${totalPaid.toFixed(2)}`} colour="text-green-600" />
      </div>

      {/* Filters + Bulk Pay */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-4">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={marketerFilter}
          onChange={e => setMarketerFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Marketers</option>
          {marketers.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <div className="ml-auto">
          <button
            onClick={payAll}
            disabled={actionLoading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {actionLoading ? 'Processing…' : marketerFilter ? 'Pay All for Marketer' : 'Pay All Pending'}
          </button>
        </div>
      </div>

      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: '', text: '' })} />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading commissions…</div>
        ) : commissions.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No commissions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Marketer</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Sale</th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                  <th className="p-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="p-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {commissions.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{c.marketer?.name || `#${c.marketerId}`}</div>
                      <div className="text-xs text-gray-400 font-mono">{c.referralCode}</div>
                    </td>
                    <td className="p-3 text-gray-600">{c.Order?.orderNumber || `#${c.orderId}`}</td>
                    <td className="p-3 text-gray-600 max-w-[150px] truncate">{productName(c)}</td>
                    <td className="p-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono">
                        {c.commissionType}
                      </span>
                    </td>
                    <td className="p-3 text-right text-gray-700">KES {(c.saleAmount || 0).toFixed(2)}</td>
                    <td className="p-3 text-right font-semibold text-green-600">KES {(c.commissionAmount || 0).toFixed(2)}</td>
                    <td className="p-3 text-center"><StatusBadge status={c.status} /></td>
                    <td className="p-3 text-gray-400 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="p-3 text-center">
                      {c.status === 'pending' ? (
                        <button
                          onClick={() => payOne(c.id)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          Pay
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MarketerManagement() {
  const [marketers, setMarketers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('all-marketers');
  const [profileMarketer, setProfileMarketer] = useState(null);

  const clearMsg = () => setMsg({ type: '', text: '' });

  const loadMarketers = async () => {
    try {
      setLoading(true);
      const r = await api.get('/admin/users?role=marketer&limit=1000');
      setMarketers(r.data.users || []);
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.message || 'Failed to load marketers' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMarketers(); }, []);

  const withAction = async (fn, successMsg) => {
    clearMsg();
    try {
      await fn();
      setMsg({ type: 'success', text: successMsg });
      loadMarketers();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || e.response?.data?.message || 'Action failed.' });
    }
  };

  const [securityAction, setSecurityAction] = useState(null); // { type: 'suspend'|'revoke', id: '', title: '' }
  const [securityLoading, setSecurityLoading] = useState(false);

  const performSecurityAction = async (password) => {
    setSecurityLoading(true);
    try {
      if (securityAction.type === 'suspend') {
        await api.post(`/admin/marketers/${securityAction.id}/suspend`, { adminPassword: password });
        setMsg({ type: 'success', text: 'Marketer suspended successfully.' });
      } else if (securityAction.type === 'revoke') {
        await api.post(`/admin/marketers/${securityAction.id}/referral/revoke`, { adminPassword: password });
        setMsg({ type: 'success', text: 'Referral code revoked successfully.' });
      }
      setSecurityAction(null);
      loadMarketers();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.message || 'Security verification failed.' });
    }
    setSecurityLoading(false);
  };

  const suspendMarketer = (id) => setSecurityAction({ type: 'suspend', id, title: 'Suspend Marketer' });
  const revokeReferralCode = (id) => setSecurityAction({ type: 'revoke', id, title: 'Revoke Referral Code' });

  const reactivateMarketer = (id) => withAction(
    () => api.post(`/admin/marketers/${id}/reactivate`),
    'Marketer reactivated.'
  );
  const assignReferralCode = async (id) => {
    const code = window.prompt('Enter new referral code:');
    if (!code) return;
    withAction(() => api.post(`/admin/marketers/${id}/referral/assign`, { code }), 'Code assigned.');
  };

  const tabs = [
    { id: 'all-marketers', label: 'All Marketers', icon: '👥' },
    { id: 'performance', label: 'Performance', icon: '📈' },
    { id: 'commissions', label: 'Commissions', icon: '💰' },
  ];

  // Summary for All-marketers tab
  const totalActive = marketers.filter(m => !m.isMarketerSuspended).length;
  const totalReferrals = marketers.reduce((s, m) => s + (m.referralCount || 0), 0);
  const totalCommission = marketers.reduce((s, m) => s + (m.totalCommission || 0), 0);

  return (
    <div className="space-y-6">
      <PasswordPromptModal
        isOpen={!!securityAction}
        loading={securityLoading}
        title={securityAction?.title}
        onConfirm={performSecurityAction}
        onCancel={() => setSecurityAction(null)}
      />

      {/* Profile Drill-Down Modal */}
      {profileMarketer && (
        <MarketerProfileModal
          marketer={profileMarketer}
          onClose={() => setProfileMarketer(null)}
        />
      )}

      {/* Page Header + Tab Nav */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h1 className="text-2xl font-bold text-gray-900 mb-5">Marketer Management</h1>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Alert type={msg.type} msg={msg.text} onClose={clearMsg} />

      {/* ── All Marketers Tab ── */}
      {activeTab === 'all-marketers' && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Marketers" value={marketers.length} colour="text-blue-600" />
            <Stat label="Active" value={totalActive} colour="text-green-600" />
            <Stat label="Total Referrals" value={totalReferrals} colour="text-purple-600" />
            <Stat label="Total Commission" value={`KES ${totalCommission.toFixed(2)}`} colour="text-yellow-600" />
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">All Marketers</h3>
              <button
                onClick={loadMarketers}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
            {loading ? (
              <div className="p-10 text-center text-gray-400">Loading marketers…</div>
            ) : marketers.length === 0 ? (
              <div className="p-10 text-center text-gray-400">No marketers found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Marketer</th>
                      <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Referral Code</th>
                      <th className="p-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Referrals</th>
                      <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                      <th className="p-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                      <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {marketers.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3">
                          <button
                            onClick={() => setProfileMarketer(m)}
                            className="text-left hover:text-blue-600 transition-colors"
                          >
                            <div className="font-medium text-gray-900">{m.name}</div>
                            <div className="text-xs text-gray-400">{m.email}</div>
                          </button>
                        </td>
                        <td className="p-3">
                          {m.referralCode
                            ? <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{m.referralCode}</span>
                            : <span className="text-gray-400 italic text-xs">No code</span>}
                        </td>
                        <td className="p-3 text-center">
                          <Badge suspended={m.isMarketerSuspended} deactivated={m.isDeactivated} />
                        </td>
                        <td className="p-3 text-right font-medium">{m.referralCount || 0}</td>
                        <td className="p-3 text-right font-semibold text-green-600">
                          KES {(m.totalCommission || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-xs text-gray-400">
                          {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            {m.referralCode ? (
                              <button
                                onClick={() => revokeReferralCode(m.id)}
                                className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors"
                              >
                                Revoke Code
                              </button>
                            ) : (
                              <button
                                onClick={() => assignReferralCode(m.id)}
                                className="px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                Assign Code
                              </button>
                            )}
                            {!m.isMarketerSuspended ? (
                              <button
                                onClick={() => suspendMarketer(m.id)}
                                className="px-2.5 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs font-medium rounded-lg hover:bg-yellow-100 transition-colors"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => reactivateMarketer(m.id)}
                                className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 text-xs font-medium rounded-lg hover:bg-green-100 transition-colors"
                              >
                                Reactivate
                              </button>
                            )}
                            <button
                              onClick={() => setProfileMarketer(m)}
                              className="px-2.5 py-1 bg-gray-50 text-gray-600 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              View Profile
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Performance Tab ── */}
      {activeTab === 'performance' && (
        <PerformanceTab onViewProfile={setProfileMarketer} />
      )}

      {/* ── Commissions Tab ── */}
      {activeTab === 'commissions' && (
        <CommissionsTab marketers={marketers} />
      )}
    </div>
  );
}