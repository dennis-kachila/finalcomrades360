import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp,
  User,
  Headphones
} from 'lucide-react';
import api from '../../services/api';

export default function MyInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchInquiries();
  }, []);

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      const res = await api.get('/contact/my-messages');
      setInquiries(res.data.messages || []);
    } catch (error) {
      console.error('Error fetching inquiries:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <Clock className="text-yellow-500" size={18} />;
      case 'replied': return <CheckCircle className="text-green-500" size={18} />;
      case 'closed': return <AlertCircle className="text-gray-500" size={18} />;
      default: return <MessageSquare className="text-blue-500" size={18} />;
    }
  };

  const getStatusBadge = (status) => {
    const baseClasses = "px-2.5 py-0.5 rounded-full text-xs font-medium capitalize";
    switch (status) {
      case 'pending': return <span className={`${baseClasses} bg-yellow-50 text-yellow-700 border border-yellow-100`}>Pending</span>;
      case 'replied': return <span className={`${baseClasses} bg-green-50 text-green-700 border border-green-100`}>Replied</span>;
      case 'closed': return <span className={`${baseClasses} bg-gray-50 text-gray-700 border border-gray-100`}>Closed</span>;
      default: return <span className={`${baseClasses} bg-blue-50 text-blue-700 border border-blue-100`}>{status}</span>;
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>My Support Inquiries | Comrades360</title>
      </Helmet>

      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center mb-8">
          <div className="bg-blue-600 p-3 rounded-xl text-white mr-4">
            <Headphones size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Support Inquiries</h1>
            <p className="text-gray-600 text-sm">View and track your messages to the support team</p>
          </div>
        </div>

        {inquiries.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <MessageSquare size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No inquiries yet</h2>
            <p className="text-gray-500 mb-6">If you need help, reach out to us via the Contact page.</p>
            <a 
              href="/contact" 
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition"
            >
              Contact Support
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {inquiries.map((inquiry) => (
              <div 
                key={inquiry.id} 
                className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                  expandedId === inquiry.id ? 'ring-2 ring-blue-500 border-transparent shadow-md' : 'border-gray-100 shadow-sm hover:border-blue-200'
                }`}
              >
                <div 
                  className="p-5 cursor-pointer flex items-center justify-between" 
                  onClick={() => toggleExpand(inquiry.id)}
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="bg-gray-50 p-2 rounded-lg">
                      {getStatusIcon(inquiry.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-gray-900 truncate">
                        {inquiry.subject || 'General Inquiry'}
                      </h3>
                      <div className="flex items-center mt-1 space-x-3">
                        <span className="text-xs text-gray-400">
                          {new Date(inquiry.createdAt).toLocaleDateString(undefined, {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </span>
                        {getStatusBadge(inquiry.status)}
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 text-gray-400">
                    {expandedId === inquiry.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {expandedId === inquiry.id && (
                      {/* Message History Thread */}
                      <div className="pt-4 space-y-4 border-t border-gray-100 mt-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Conversation History</p>
                        
                        {/* Original Message */}
                        <div className="flex flex-col items-start">
                          <div className="bg-blue-600 text-white p-3 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm">
                            <p className="text-sm pb-1 border-b border-blue-500/30 mb-1 font-medium">You</p>
                            <p className="text-sm whitespace-pre-wrap">{inquiry.message}</p>
                            <p className="text-[10px] text-blue-200 mt-1 text-right">{new Date(inquiry.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                          </div>
                        </div>

                        {/* Replies Thread */}
                        {inquiry.replies?.map((reply) => (
                          <div key={reply.id} className={`flex flex-col ${reply.isAdminReply ? 'items-start' : 'items-end'}`}>
                            <div className={`${reply.isAdminReply ? 'bg-white border border-gray-100 text-gray-800' : 'bg-blue-600 text-white'} p-3 rounded-2xl ${reply.isAdminReply ? 'rounded-tl-none' : 'rounded-tr-none'} max-w-[85%] shadow-sm`}>
                              <p className={`text-xs pb-1 border-b mb-1 font-bold ${reply.isAdminReply ? 'text-green-600 border-gray-100' : 'text-blue-100 border-blue-500/30'}`}>
                                {reply.isAdminReply ? 'Support Agent' : 'You'}
                              </p>
                              <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
                              <p className={`text-[10px] mt-1 text-right ${reply.isAdminReply ? 'text-gray-400' : 'text-blue-200'}`}>
                                {new Date(reply.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Reply Form */}
                      {inquiry.status !== 'closed' && (
                        <div className="mt-8 pt-6 border-t border-gray-100">
                          <div className="flex items-start space-x-3">
                            <div className="flex-1">
                              <textarea
                                placeholder="Type your reply here..."
                                className="w-full bg-white border border-gray-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                                rows="3"
                                id={`reply-input-${inquiry.id}`}
                              ></textarea>
                              <div className="flex justify-end mt-2">
                                <button 
                                  onClick={async () => {
                                    const input = document.getElementById(`reply-input-${inquiry.id}`);
                                    const content = input.value.trim();
                                    if (!content) return;
                                    
                                    try {
                                      await api.post(`/contact/${inquiry.id}/reply`, { content });
                                      input.value = '';
                                      fetchInquiries(); // Refresh to show new message
                                    } catch (err) {
                                      alert("Failed to send reply. Please try again.");
                                    }
                                  }}
                                  className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-100"
                                >
                                  Send Reply
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
