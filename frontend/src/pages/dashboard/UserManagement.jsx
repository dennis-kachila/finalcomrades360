import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { FaSync, FaUser, FaUserCheck, FaUserTimes, FaUserShield, FaTrash } from 'react-icons/fa';

const StatCard = ({ icon: Icon, title, value, color, onClick }) => (
  <div 
    onClick={onClick}
    className={`p-6 rounded-lg shadow-md cursor-pointer transition-all hover:shadow-lg ${color} text-white`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <div className="p-3 rounded-full bg-white bg-opacity-20">
        <Icon className="w-6 h-6" />
      </div>
    </div>
  </div>
);

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    admins: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || 'all';
  const role = searchParams.get('role') || '';

  const resetAlerts = () => { setError(''); setSuccess(''); };

  const loadUsers = async () => {
    try {
      setLoading(true);
      resetAlerts();
      
      // Build query params
      const params = new URLSearchParams();
      if (status !== 'all') params.append('status', status);
      if (role) params.append('role', role);
      
      const response = await api.get(`/api/admin/users?${params.toString()}`);
      const usersData = response.data.users || [];
      
      setUsers(usersData);
      
      // Update stats
      setStats({
        total: response.data.total || 0,
        active: usersData.filter(u => !u.isDeactivated).length,
        inactive: usersData.filter(u => u.isDeactivated).length,
        admins: usersData.filter(u => ['admin', 'super_admin'].includes(u.role)).length
      });
      
    } catch (e) {
      console.error('Error loading users:', e);
      setError(e.response?.data?.message || 'Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [status, role]);

  const handleRoleChange = async (userId, newRole) => {
    if (!userId || !newRole) return;
    
    resetAlerts();
    try {
      await api.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      setSuccess('User role updated successfully');
      loadUsers();
    } catch (e) {
      console.error('Error updating role:', e);
      setError(e.response?.data?.message || 'Failed to update user role');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${userName}"? This action cannot be undone.`)) {
      return;
    }

    resetAlerts();
    try {
      setLoading(true);
      await api.delete(`/api/admin/users/${userId}`);
      setSuccess(`User ${userName} deleted successfully`);
      loadUsers();
    } catch (e) {
      console.error('Error deleting user:', e);
      setError(e.response?.data?.message || 'Failed to delete user');
      setLoading(false);
    }
  };

  const handleStatusFilter = (newStatus) => {
    const params = new URLSearchParams(searchParams);
    if (newStatus === 'all') {
      params.delete('status');
    } else {
      params.set('status', newStatus);
    }
    setSearchParams(params);
  };

  const roleOptions = [
    'customer', 'marketer', 'seller',
    'delivery_agent', 'service_provider',
    'ops_manager', 'logistics_manager', 'finance_manager',
    'admin', 'super_admin'
  ];

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
          <p className="text-sm text-gray-500">Manage user accounts and permissions</p>
        </div>
        <button 
          onClick={loadUsers}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          disabled={loading}
        >
          <FaSync className={`${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={FaUser} 
          title="Total Users" 
          value={stats.total} 
          color="bg-blue-500 hover:bg-blue-600"
          onClick={() => handleStatusFilter('all')}
        />
        <StatCard 
          icon={FaUserCheck} 
          title="Active Users" 
          value={stats.active} 
          color="bg-green-500 hover:bg-green-600"
          onClick={() => handleStatusFilter('active')}
        />
        <StatCard 
          icon={FaUserTimes} 
          title="Inactive Users" 
          value={stats.inactive} 
          color="bg-yellow-500 hover:bg-yellow-600"
          onClick={() => handleStatusFilter('inactive')}
        />
        <StatCard 
          icon={FaUserShield} 
          title="Admins" 
          value={stats.admins} 
          color="bg-purple-500 hover:bg-purple-600"
          onClick={() => {
            const params = new URLSearchParams(searchParams);
            params.set('role', 'admin');
            setSearchParams(params);
          }}
        />
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-md bg-red-100 border border-red-200 text-red-700">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-4 rounded-md bg-green-100 border border-green-200 text-green-700">
          {success}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  R.Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          {user.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{user.name || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.referralCode || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.isDeactivated 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {user.isDeactivated ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.role || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        <select
                          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          disabled={user.role === 'super_admin'}
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </option>
                          ))}
                        </select>

                        {user.role !== 'super_admin' && (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Delete User"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}