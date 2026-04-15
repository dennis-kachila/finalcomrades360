import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { 
  FaSearch, 
  FaFilter, 
  FaEye, 
  FaReply, 
  FaCalendarAlt, 
  FaUser, 
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaTimesCircle
} from 'react-icons/fa';

const SupportTickets = () => {
  const { user } = useAuth();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [responseData, setResponseData] = useState({
    status: 'in_progress',
    priority: 'medium',
    response: ''
  });

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    search: ''
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Fetch inquiries
  const fetchInquiries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });

      const response = await api.get(`/product-inquiries/admin/all?${params}`);
      setInquiries(response.data.inquiries);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        totalPages: response.data.pagination.totalPages
      }));
    } catch (error) {
      console.error('Error fetching inquiries:', error);
      alert('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  // Update inquiry status and response
  const updateInquiry = async (inquiryId, updateData) => {
    try {
      const response = await api.put(`/product-inquiries/admin/${inquiryId}`, updateData);
      alert('Inquiry updated successfully');
      fetchInquiries();
      setShowResponseModal(false);
      setResponseData({ status: 'in_progress', priority: 'medium', response: '' });
    } catch (error) {
      console.error('Error updating inquiry:', error);
      alert('Failed to update inquiry');
    }
  };

  // Handle response submission
  const handleResponseSubmit = async () => {
    if (!responseData.response.trim()) {
      alert('Response is required');
      return;
    }
    
    try {
      setLoading(true);
      // Send the reply
      await api.post(`/product-inquiries/${selectedInquiry.id}/reply`, {
        content: responseData.response
      });

      // Update status and priority if changed
      if (responseData.status !== selectedInquiry.status || responseData.priority !== selectedInquiry.priority) {
        await api.put(`/product-inquiries/admin/${selectedInquiry.id}`, {
          status: responseData.status,
          priority: responseData.priority
        });
      }

      alert('Response sent successfully');
      fetchInquiries();
      setShowResponseModal(false);
      setResponseData({ status: 'in_progress', priority: 'medium', response: '' });
    } catch (error) {
      console.error('Error sending response:', error);
      alert('Failed to send response');
    } finally {
      setLoading(false);
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <FaClock className="text-yellow-500" />;
      case 'in_progress':
        return <FaExclamationTriangle className="text-blue-500" />;
      case 'resolved':
        return <FaCheckCircle className="text-green-500" />;
      case 'closed':
        return <FaTimesCircle className="text-gray-500" />;
      default:
        return <FaClock className="text-gray-500" />;
    }
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'low':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    fetchInquiries();
  }, [filters, pagination.page]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Support Tickets</h1>
        <p className="text-gray-600">Manage customer product inquiries and support requests</p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                placeholder="Search by subject, customer name, or product..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FaExclamationTriangle className="text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Inquiries</p>
              <p className="text-2xl font-bold text-gray-900">{pagination.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <FaClock className="text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-gray-900">
                {inquiries.filter(i => i.status === 'pending').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FaExclamationTriangle className="text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <p className="text-2xl font-bold text-gray-900">
                {inquiries.filter(i => i.status === 'in_progress').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <FaCheckCircle className="text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Resolved</p>
              <p className="text-2xl font-bold text-gray-900">
                {inquiries.filter(i => i.status === 'resolved').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Inquiries Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticket
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status & Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
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
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  </td>
                </tr>
              ) : inquiries.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No inquiries found
                  </td>
                </tr>
              ) : (
                inquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          #{inquiry.id} - {inquiry.subject}
                        </div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {inquiry.message}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <FaUser className="text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {inquiry.Customer?.name || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {inquiry.Customer?.email || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {inquiry.Product?.name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="flex items-center">
                          {getStatusIcon(inquiry.status)}
                          <span className="ml-2 text-sm text-gray-900 capitalize">
                            {inquiry.status.replace('_', ' ')}
                          </span>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(inquiry.priority)}`}>
                          {inquiry.priority}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <FaCalendarAlt className="mr-2" />
                        {formatDate(inquiry.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedInquiry(inquiry);
                          setResponseData({
                            status: inquiry.status,
                            priority: inquiry.priority,
                            response: inquiry.response || ''
                          });
                          setShowResponseModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <FaReply className="inline mr-1" />
                        Respond
                      </button>
                      <button
                        onClick={() => {
                          // View details logic
                          alert(`Viewing details for inquiry #${inquiry.id}`);
                        }}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <FaEye className="inline mr-1" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                disabled={pagination.page === pagination.totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing page <span className="font-medium">{pagination.page}</span> of{' '}
                  <span className="font-medium">{pagination.totalPages}</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Response Modal */}
      {showResponseModal && selectedInquiry && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Respond to Inquiry #{selectedInquiry.id}
              </h3>
              
              {/* Inquiry Details & History */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg max-h-60 overflow-y-auto custom-scrollbar">
                <div className="space-y-4">
                  <div className="pb-3 border-b border-gray-200">
                    <p className="text-xs font-bold text-blue-600 mb-1">Customer Message ({formatDate(selectedInquiry.createdAt)})</p>
                    <p className="text-sm text-gray-800">{selectedInquiry.message}</p>
                  </div>
                  
                  {selectedInquiry.replies?.map((reply) => (
                    <div key={reply.id} className={`pb-3 border-b border-gray-100 ${reply.isAdminReply ? 'pl-4 border-l-2 border-green-400' : 'pl-4 border-l-2 border-blue-400'}`}>
                      <p className="text-xs font-bold mb-1 flex justify-between">
                        <span className={reply.isAdminReply ? 'text-green-600' : 'text-blue-600'}>
                          {reply.isAdminReply ? 'Support Team' : 'Customer'} ({reply.sender?.name})
                        </span>
                        <span className="text-gray-400 font-normal">{formatDate(reply.createdAt)}</span>
                      </p>
                      <p className="text-sm text-gray-700">{reply.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Response Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={responseData.status}
                      onChange={(e) => setResponseData(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={responseData.priority}
                      onChange={(e) => setResponseData(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Response *</label>
                  <textarea
                    value={responseData.response}
                    onChange={(e) => setResponseData(prev => ({ ...prev, response: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your response to the customer..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowResponseModal(false);
                    setResponseData({ status: 'in_progress', priority: 'medium', response: '' });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResponseSubmit}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Send Response
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportTickets;