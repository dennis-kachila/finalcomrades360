import React, { useEffect, useState } from 'react';
import api from '../../services/api';

export default function CommissionManagement() {
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const resetAlerts = () => { setError(''); setSuccess(''); };

  const loadCommissions = async () => {
    try {
      const r = await api.get('/admin/commissions');
      setCommissions(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load commissions');
    }
  };

  useEffect(() => {
    loadCommissions();
  }, []);

  const bulkPayCommissions = async (commissionIds) => {
    if (!window.confirm(`Pay ${commissionIds.length} commission(s)?`)) return;
    resetAlerts();
    setLoading(true);
    try {
      await api.post('/admin/commissions/pay-bulk', { commissionIds });
      setSuccess('Commissions paid successfully');
      loadCommissions();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to pay commissions');
    } finally {
      setLoading(false);
    }
  };

  const bulkCancelCommissions = async (commissionIds) => {
    if (!window.confirm(`Cancel ${commissionIds.length} commission(s)?`)) return;
    resetAlerts();
    setLoading(true);
    try {
      await api.post('/admin/commissions/cancel-bulk', { commissionIds });
      setSuccess('Commissions cancelled');
      loadCommissions();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to cancel commissions');
    } finally {
      setLoading(false);
    }
  };

  const filteredCommissions = commissions.filter(c => {
    if (filterStatus === 'all') return true;
    return c.status === filterStatus;
  });

  const pendingCommissions = filteredCommissions.filter(c => c.status === 'pending');
  const totalPending = pendingCommissions.reduce((sum, c) => sum + (c.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Commission Management</h1>
        <div className="flex gap-2">
          <select
            className="border rounded p-2"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Commissions</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="btn" onClick={loadCommissions}>Refresh</button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="p-3 rounded bg-red-100 text-red-700">{error}</div>}
      {success && <div className="p-3 rounded bg-green-100 text-green-700">{success}</div>}

      {/* Bulk Actions */}
      {pendingCommissions.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Bulk Actions</div>
              <div className="text-sm text-gray-600">
                {pendingCommissions.length} pending commissions totaling KES {totalPending.toFixed(2)}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-success"
                disabled={loading}
                onClick={() => bulkPayCommissions(pendingCommissions.map(c => c.id))}
              >
                {loading ? 'Processing...' : 'Pay All Pending'}
              </button>
              <button
                className="btn btn-danger"
                disabled={loading}
                onClick={() => bulkCancelCommissions(pendingCommissions.map(c => c.id))}
              >
                Cancel All Pending
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredCommissions.length === 0 ? (
        <div className="card p-6 text-center text-gray-600">No commissions found.</div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-3">Commission ID</th>
                  <th className="p-3">Seller</th>
                  <th className="p-3">Order</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Rate</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommissions.map(commission => (
                  <tr key={commission.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono font-medium">#{commission.id}</td>
                    <td className="p-3">
                      {commission.Seller ? `${commission.Seller.name} (${commission.Seller.email})` : commission.sellerId}
                    </td>
                    <td className="p-3">
                      {commission.Order ? (
                        <span className="font-mono">{commission.Order.orderNumber}</span>
                      ) : commission.orderId}
                    </td>
                    <td className="p-3">
                      {commission.Product ? commission.Product.name : commission.productId}
                    </td>
                    <td className="p-3 font-semibold text-green-600">
                      KES {commission.amount?.toFixed(2) || '0.00'}
                    </td>
                    <td className="p-3">{commission.rate || 0}%</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs border ${commission.commissionType === 'primary_60'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : commission.commissionType === 'secondary_40'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                        {commission.commissionType === 'primary_60' ? 'Primary (60%)' :
                          commission.commissionType === 'secondary_40' ? 'Secondary (40%)' :
                            'Full (100%)'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${commission.status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : commission.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                        {commission.status}
                      </span>
                    </td>
                    <td className="p-3">{new Date(commission.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      {commission.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            className="btn-success btn-xs"
                            onClick={() => bulkPayCommissions([commission.id])}
                          >
                            Pay
                          </button>
                          <button
                            className="btn-danger btn-xs"
                            onClick={() => bulkCancelCommissions([commission.id])}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{commissions.length}</div>
          <div className="text-gray-600">Total Commissions</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">
            {commissions.filter(c => c.status === 'pending').length}
          </div>
          <div className="text-gray-600">Pending</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            KES {commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + (c.amount || 0), 0).toFixed(2)}
          </div>
          <div className="text-gray-600">Total Paid</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">
            KES {commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + (c.amount || 0), 0).toFixed(2)}
          </div>
          <div className="text-gray-600">Pending Amount</div>
        </div>
      </div>
    </div>
  );
}