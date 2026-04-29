import React, { useState, useEffect } from 'react';
import { FaBox, FaHamburger, FaSearch, FaUserTie } from 'react-icons/fa';
import api from '../../../services/api';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

const AdminCreatedItemsTable = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/inventory/on-behalf-items');
      if (res.data.success) {
        setItems(res.data.data);
      } else {
        setError(res.data.message || 'Failed to fetch items');
      }
    } catch (err) {
      console.error('Error fetching admin created items:', err);
      setError(err.response?.data?.message || 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.createdBy.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center justify-center">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header & Controls */}
      <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Creation History</h2>
          <p className="text-sm text-gray-500">Items created by admins on behalf of sellers</p>
        </div>
        
        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Search items, sellers, or admins..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all"
          />
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider font-semibold border-b border-gray-100">
            <tr>
              <th className="px-6 py-4">Item Name</th>
              <th className="px-6 py-4">Owner (Seller)</th>
              <th className="px-6 py-4">Created By (Admin)</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Date Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <FaUserTie className="w-8 h-8 text-gray-300" />
                    <p>No items found</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map(item => (
                <tr key={`${item.itemType}-${item.id}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${item.itemType === 'product' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                        {item.itemType === 'product' ? <FaBox size={16} /> : <FaHamburger size={16} />}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-500 capitalize">{item.itemType}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-900 font-medium">{item.owner}</div>
                    <div className="text-xs text-gray-500">ID: {item.ownerId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-900 font-medium">{item.createdBy}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">{item.creatorRole?.replace('_', ' ')}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                      item.isActive || item.status === 'active' || item.status === 'approved'
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {item.status || (item.isActive ? 'Active' : 'Pending')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(item.createdAt).toLocaleDateString(undefined, { 
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminCreatedItemsTable;
