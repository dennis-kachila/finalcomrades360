import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { 
  FaSearch, 
  FaReply, 
  FaCalendarAlt, 
  FaUser, 
  FaCheckCircle,
  FaClock,
  FaEnvelope
} from 'react-icons/fa';

const ContactMessages = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [responseData, setResponseData] = useState({
    status: 'replied',
    adminResponse: ''
  });

  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });

  // Fetch messages
  const fetchMessages = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(filters);
      const response = await api.get(`/contact/admin/all?${params}`);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Error fetching contact messages:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update message status and response
  const handleResponseSubmit = async () => {
    if (!responseData.adminResponse.trim()) {
      alert('Response is required');
      return;
    }
    try {
      setLoading(true);
      // Send the reply
      await api.post(`/contact/${selectedMessage.id}/reply`, {
        content: responseData.adminResponse
      });

      // Update status if changed
      if (responseData.status !== selectedMessage.status) {
        await api.put(`/contact/admin/${selectedMessage.id}`, {
          status: responseData.status
        });
      }

      alert('Response saved successfully');
      fetchMessages();
      setShowResponseModal(false);
      setResponseData({ status: 'replied', adminResponse: '' });
    } catch (error) {
      console.error('Error updating message:', error);
      alert('Failed to save response');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case 'replied':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Replied</span>;
      case 'closed':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Closed</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{status}</span>;
    }
  };

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
    fetchMessages();
  }, [filters]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Contact Messages</h1>
        <p className="text-gray-600">Manage general inquiries from the public Contact Us form</p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search by name, email, or message..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="w-full md:w-48">
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="replied">Replied</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Messages List */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sender</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center">Loading...</td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No messages found</td>
                </tr>
              ) : (
                messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{msg.name}</div>
                      <div className="text-sm text-gray-500">{msg.email}</div>
                      {msg.userId && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Registered User
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 font-medium truncate max-w-xs">{msg.subject || 'No Subject'}</div>
                      <div className="text-sm text-gray-500 line-clamp-2 max-w-md">{msg.message}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(msg.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <FaCalendarAlt className="mr-2 opacity-50" />
                        {formatDate(msg.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedMessage(msg);
                          setResponseData({
                            status: msg.status === 'pending' ? 'replied' : msg.status,
                            adminResponse: msg.adminResponse || ''
                          });
                          setShowResponseModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 flex items-center"
                      >
                        <FaReply className="mr-1" />
                        {msg.status === 'pending' ? 'Respond' : 'Edit Response'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Response Modal */}
      {showResponseModal && selectedMessage && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative mx-auto p-6 border w-full max-w-2xl shadow-lg rounded-xl bg-white">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <FaEnvelope className="mr-2 text-blue-600" />
              Respond to {selectedMessage.name}
            </h3>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100 max-h-60 overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <div className="pb-3 border-b border-gray-200">
                  <p className="text-xs font-bold text-blue-600 mb-1">Original Inquiry ({formatDate(selectedMessage.createdAt)})</p>
                  <p className="text-sm text-gray-800">{selectedMessage.message}</p>
                </div>
                
                {selectedMessage.replies?.map((reply) => (
                  <div key={reply.id} className={`pb-3 border-b border-gray-100 ${reply.isAdminReply ? 'pl-4 border-l-2 border-green-400' : 'pl-4 border-l-2 border-blue-400'}`}>
                    <p className="text-xs font-bold mb-1 flex justify-between">
                      <span className={reply.isAdminReply ? 'text-green-600' : 'text-blue-600'}>
                        {reply.isAdminReply ? 'Support Team' : 'Customer'} ({reply.sender?.name || 'User'})
                      </span>
                      <span className="text-gray-400 font-normal">{formatDate(reply.createdAt)}</span>
                    </p>
                    <p className="text-sm text-gray-700">{reply.content}</p>
                  </div>
                ))}

                {!selectedMessage.replies?.length && selectedMessage.adminResponse && (
                  <div className="pb-3 border-b border-gray-100 pl-4 border-l-2 border-green-400">
                    <p className="text-xs font-bold mb-1 text-green-600">Legacy Response</p>
                    <p className="text-sm text-gray-700">{selectedMessage.adminResponse}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                <select
                  value={responseData.status}
                  onChange={(e) => setResponseData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="replied">Replied</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Response Content</label>
                <textarea
                  value={responseData.adminResponse}
                  onChange={(e) => setResponseData(prev => ({ ...prev, adminResponse: e.target.value }))}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Type your response here..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8">
              <button
                onClick={() => setShowResponseModal(false)}
                className="px-6 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleResponseSubmit}
                className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition"
              >
                Save Response
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactMessages;
