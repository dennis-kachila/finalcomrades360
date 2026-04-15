import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { 
  FaPhone, 
  FaEnvelope, 
  FaClock, 
  FaUser, 
  FaChartLine, 
  FaHeadset,
  FaTicketAlt,
  FaCog,
  FaUsers,
  FaComments,
  FaStar
} from 'react-icons/fa';

const CustomerService = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalInquiries: 0,
    pendingInquiries: 0,
    avgResponseTime: 0,
    customerSatisfaction: 0
  });
  const [loading, setLoading] = useState(true);

  // Fetch statistics
  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/product-inquiries/admin/stats');
      const inquiryStats = response.data;
      
      setStats({
        totalInquiries: inquiryStats.totalInquiries || 0,
        pendingInquiries: inquiryStats.pendingInquiries || 0,
        avgResponseTime: inquiryStats.avgResponseTime || 0,
        customerSatisfaction: inquiryStats.customerSatisfaction || 0
      });
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Customer Service</h1>
        <p className="text-gray-600">Manage customer support operations and service performance</p>
      </div>

      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FaTicketAlt className="text-blue-600 text-xl" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Inquiries</p>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? '...' : stats.totalInquiries}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <FaClock className="text-yellow-600 text-xl" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending Inquiries</p>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? '...' : stats.pendingInquiries}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg">
              <FaChartLine className="text-green-600 text-xl" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? '...' : `${stats.avgResponseTime}h`}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-lg">
              <FaStar className="text-purple-600 text-xl" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Customer Satisfaction</p>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? '...' : `${stats.customerSatisfaction}/5`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Service Management Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Support Channels */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Support Channels</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <FaPhone className="text-green-600 text-lg mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Phone Support</p>
                  <p className="text-sm text-gray-600">+254 700 000 000</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                Active
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <FaEnvelope className="text-blue-600 text-lg mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Email Support</p>
                  <p className="text-sm text-gray-600">support@comrades360.com</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                Active
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <FaHeadset className="text-purple-600 text-lg mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Live Chat</p>
                  <p className="text-sm text-gray-600">Product Inquiry System</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Service Hours */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Hours</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Monday - Friday</span>
              <span className="font-medium text-gray-900">8:00 AM - 6:00 PM</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Saturday</span>
              <span className="font-medium text-gray-900">9:00 AM - 4:00 PM</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Sunday</span>
              <span className="font-medium text-gray-900">10:00 AM - 2:00 PM</span>
            </div>
            <div className="pt-3 border-t">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Emergency Support</span>
                <span className="font-medium text-green-600">24/7</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Metrics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Average First Response</span>
              <span className="font-medium">{stats.avgResponseTime || '2.4'} hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Average Resolution Time</span>
              <span className="font-medium">24.8 hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">First Response Rate</span>
              <span className="font-medium">98.5%</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Feedback</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Satisfaction Score</span>
              <span className="font-medium text-green-600">{stats.customerSatisfaction || '4.5'}/5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Resolution Rate</span>
              <span className="font-medium">92.3%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Reopened Tickets</span>
              <span className="font-medium">3.2%</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Volume Trends</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Today's Inquiries</span>
              <span className="font-medium">12</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">This Week</span>
              <span className="font-medium">87</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">This Month</span>
              <span className="font-medium">342</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors">
            <div className="text-center">
              <FaTicketAlt className="text-gray-400 text-xl mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">View All Tickets</p>
            </div>
          </button>

          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors">
            <div className="text-center">
              <FaComments className="text-gray-400 text-xl mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">Response Templates</p>
            </div>
          </button>

          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors">
            <div className="text-center">
              <FaUsers className="text-gray-400 text-xl mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">Team Management</p>
            </div>
          </button>

          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors">
            <div className="text-center">
              <FaCog className="text-gray-400 text-xl mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">Settings</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerService;