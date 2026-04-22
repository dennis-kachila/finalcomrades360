import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminApi, supportApi } from '../services/api';
import { validateKenyanPhone, PHONE_VALIDATION_ERROR, formatKenyanPhoneInput } from '../utils/validation';
import {
  FaUsers,
  FaUser,
  FaShieldAlt,
  FaLock,
  FaComments,
  FaChartBar,
  FaEdit,
  FaSearch,
  FaFilter,
  FaEye,
  FaUserCheck,
  FaUserTimes,
  FaBan,
  FaCheck,
  FaTimes,
  FaDownload,
  FaPlus,
  FaSync,
  FaBell,
  FaEnvelope,
  FaSms,
  FaPhone,
  FaFilePdf,
  FaFileCsv,
  FaFileExcel,
  FaArrowLeft,
  FaSave,
  FaTrash,
  FaTrashRestore
} from 'react-icons/fa';

// Support Messaging Modal Component
const SupportModal = ({ isOpen, onClose, user }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadHistory();
      const interval = setInterval(loadHistory, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [isOpen, user]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const response = await supportApi.getHistory(user.id);
      setMessages(response.data.data);
    } catch (err) {
      console.error('Error loading chat history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      setSending(true);
      await supportApi.sendMessage({
        receiverId: user.id,
        message: newMessage,
        type: 'admin_to_user',
        subject: 'Support Message'
      });
      setNewMessage('');
      loadHistory(); // Refresh chat
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col h-[600px]">
        <div className="p-4 border-b flex justify-between items-center bg-blue-600 text-white rounded-t-lg">
          <h3 className="text-lg font-bold flex items-center">
            <FaComments className="mr-2" /> Chat with {user?.name}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 py-10">
              No messages yet. Start a conversation!
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.type === 'admin_to_user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${msg.type === 'admin_to_user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'
                    }`}
                >
                  <p className="text-sm">{msg.message}</p>
                  <span className={`text-[10px] mt-1 block ${msg.type === 'admin_to_user' ? 'text-blue-100' : 'text-gray-400'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t bg-white rounded-b-lg">
          <div className="flex space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Bulk Message Modal Component
const BulkMessageModal = ({ isOpen, onClose, selectedUserIds, onSuccess }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || selectedUserIds.length === 0) return;

    try {
      setSending(true);
      await supportApi.sendBulkMessages({
        userIds: selectedUserIds,
        message,
        subject: 'Administrative Announcement'
      });
      setMessage('');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error sending bulk messages:', err);
      alert('Failed to send bulk messages');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-blue-600 text-white">
          <h3 className="text-lg font-bold flex items-center">
            <FaEnvelope className="mr-2" /> Bulk Message ({selectedUserIds.length} Users)
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Message Content</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message to all selected users..."
              className="w-full border rounded-xl px-4 py-3 h-40 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              required
              disabled={sending}
            ></textarea>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition"
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition shadow-lg shadow-blue-100"
            >
              {sending ? 'Sending...' : 'Send Bulk Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Tab Navigation Component
const TabNavigation = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'list', label: 'User List', icon: FaUsers },
    { id: 'archived', label: 'Archived Users', icon: FaUserTimes },
    { id: 'profile', label: 'User Profile', icon: FaUser },
    { id: 'verification', label: 'Verified Users', icon: FaShieldAlt },
    { id: 'security', label: 'Security', icon: FaLock },
    { id: 'communication', label: 'Communication', icon: FaComments },
    { id: 'reports', label: 'Reports', icon: FaChartBar }
  ];

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

// Super Admin Password Verification Dialog Component
const SuperAdminPasswordDialog = ({
  isOpen,
  onClose,
  onPasswordVerified,
  userToFreeze,
  action // 'freeze' or 'unfreeze'
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetAlerts = () => { setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    resetAlerts();

    try {
      // First verify the super admin password
      const verifyResponse = await adminApi.verifyAdminPassword(password);

      if (verifyResponse.data.verified) {
        // Password verified, now perform the freeze/unfreeze action
        const freezeAction = action === 'freeze';
        const updateResponse = await adminApi.updateUserFrozen(userToFreeze.id, freezeAction, password);

        // Notify parent component
        onPasswordVerified(userToFreeze, freezeAction);
        setPassword('');
        onClose();
      } else {
        setError('Invalid password. Please try again.');
      }
    } catch (err) {
      console.error('Password verification or freeze failed:', err);
      if (err.response?.status === 401) {
        setError('Invalid password. Please try again.');
      } else {
        setError(err.response?.data?.message || 'Operation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">
              Verify Super Admin Password
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>

          {/* Alert */}
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex">
              <FaShieldAlt className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">
                  {action === 'freeze' ? 'Freeze User' : 'Unfreeze User'}
                </p>
                <p>
                  You are about to {action === 'freeze' ? 'freeze' : 'unfreeze'} <strong>{userToFreeze?.name}</strong>.
                  This action requires super admin password verification.
                </p>
                {action === 'freeze' && (
                  <p className="mt-2 text-xs">
                    ⚠️ Frozen users cannot access any part of the system.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Super Admin Password *
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  resetAlerts();
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your super admin password"
                required
                disabled={loading}
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                Required to verify your super admin privileges
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !password.trim()}
                className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 ${action === 'freeze'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
                  } disabled:opacity-50`}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {action === 'freeze' ? 'Freezing...' : 'Unfreezing...'}
                  </>
                ) : (
                  <>
                    <FaShieldAlt className="w-4 h-4" />
                    {action === 'freeze' ? 'Freeze User' : 'Unfreeze User'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Edit User Modal Component
const EditUserModal = ({ isOpen, onClose, user, onUserUpdated }) => {
  // adminApi is already imported at the top level
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    gender: '',
    campus: '',
    role: 'customer',
    roles: ['customer'],
    status: 'active',
    emailVerified: false,
    phoneVerified: false,
    accessRestrictions: {
      marketplace: false,
      sellerPortal: false,
      marketingTools: false,
      commissionAccess: false,
      adminPanel: false
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        gender: user.gender || '',
        campus: user.campus || '',
        role: user.role || 'customer',
        roles: Array.isArray(user.roles) ? user.roles : [user.role || 'customer'],
        status: user.isFrozen ? 'frozen' : 'active',
        emailVerified: user.emailVerified || false,
        phoneVerified: user.phoneVerified || false,
        accessRestrictions: user.accessRestrictions || {
          marketplace: true,
          sellerPortal: false,
          marketingTools: false,
          commissionAccess: false,
          adminPanel: false
        }
      });
    }
  }, [user]);

  const resetAlerts = () => { setError(''); setSuccess(''); };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    resetAlerts();
  };

  const handleAccessRestrictionChange = (key) => {
    setFormData(prev => ({
      ...prev,
      accessRestrictions: {
        ...prev.accessRestrictions,
        [key]: !prev.accessRestrictions[key]
      }
    }));
  };

  const handleRoleCheckboxChange = (roleValue) => {
    setFormData(prev => {
      const currentRoles = [...prev.roles];
      const index = currentRoles.indexOf(roleValue);

      if (index === -1) {
        currentRoles.push(roleValue);
      } else {
        // Don't allow removing 'customer' if it's the last role
        if (roleValue === 'customer' && currentRoles.length === 1) return prev;
        currentRoles.splice(index, 1);
      }

      // If no roles left, default back to customer
      const finalRoles = currentRoles.length === 0 ? ['customer'] : currentRoles;

      return {
        ...prev,
        roles: finalRoles,
        // Set primary role based on the new selection
        role: finalRoles[finalRoles.length - 1]
      };
    });
    resetAlerts();
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Name is required';
    if (!formData.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'Please enter a valid email';
    if (!formData.phone.trim()) return 'Phone number is required';
    if (!validateKenyanPhone(formData.phone)) return PHONE_VALIDATION_ERROR;
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    resetAlerts();

    try {
      // Prepare data for different API endpoints
      const basicInfoData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        gender: formData.gender,
        campus: formData.campus
      };

      const statusData = {
        isFrozen: formData.status === 'frozen',
        banReason: formData.status === 'frozen' ? 'Admin action' : null
      };

      const verificationData = {
        emailVerified: formData.emailVerified,
        phoneVerified: formData.phoneVerified
      };

      const accessData = {
        accessRestrictions: formData.accessRestrictions
      };

      // Call the comprehensive updateUser endpoint that handles everything
      const updateData = {
        ...basicInfoData,
        role: formData.role,
        roles: formData.roles,
        ...statusData,
        ...verificationData,
        ...accessData
      };

      await adminApi.updateUser(user.id, updateData);

      setSuccess('User updated successfully!');
      onUserUpdated({ id: user.id, ...updateData });

    } catch (err) {
      console.error('Error updating user:', err);
      setError(err.response?.data?.message || 'Failed to update user. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: FaUser },
    { id: 'role', label: 'Role & Permissions', icon: FaShieldAlt },
    { id: 'status', label: 'Status', icon: FaBan },
    { id: 'verification', label: 'Verification', icon: FaCheck },
    { id: 'access', label: 'Access Control', icon: FaLock }
  ];

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Edit User: {user.name}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-200 text-green-700 rounded-lg">
              {success}
            </div>
          )}

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info Tab */}
            {activeTab === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onInput={(e) => e.target.value = formatKenyanPhoneInput(e.target.value)}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 0712345678, 0123456789, or +254712345678"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                    Gender
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="campus" className="block text-sm font-medium text-gray-700 mb-1">
                    Campus/Location
                  </label>
                  <input
                    type="text"
                    id="campus"
                    name="campus"
                    value={formData.campus}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="University or campus name"
                  />
                </div>
              </div>
            )}

            {/* Role & Permissions Tab */}
            {activeTab === 'role' && (
              <div>
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-3">
                    Assigned Roles (Multi-select)
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-white p-4 border border-gray-200 rounded-lg shadow-sm">
                    {[
                      { value: 'customer', label: 'Customer', color: 'blue' },
                      { value: 'marketer', label: 'Marketer', color: 'purple' },
                      { value: 'seller', label: 'Seller', color: 'green' },
                      { value: 'delivery_agent', label: 'Delivery Agent', color: 'orange' },
                      { value: 'service_provider', label: 'Service Provider', color: 'indigo' },
                      { value: 'ops_manager', label: 'Ops Manager', color: 'red' },
                      { value: 'logistics_manager', label: 'Logistics Manager', color: 'yellow' },
                      { value: 'finance_manager', label: 'Finance Manager', color: 'emerald' },
                      { value: 'admin', label: 'Admin', color: 'gray' },
                      { value: 'super_admin', label: 'Super Admin', color: 'black' }
                    ].map((roleOption) => (
                      <label
                        key={roleOption.value}
                        className={`flex items-center p-2 rounded-md border cursor-pointer transition-all ${formData.roles.includes(roleOption.value)
                          ? `border-${roleOption.color}-500 bg-${roleOption.color}-50 ring-1 ring-${roleOption.color}-500`
                          : 'border-gray-200 hover:bg-gray-50'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.roles.includes(roleOption.value) || roleOption.value === 'customer'}
                          onChange={() => roleOption.value !== 'customer' && handleRoleCheckboxChange(roleOption.value)}
                          disabled={roleOption.value === 'customer'}
                          className={`rounded border-gray-300 text-${roleOption.color}-600 focus:ring-${roleOption.color}-500 mr-3 h-4 w-4 ${roleOption.value === 'customer' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        <span className={`text-sm font-medium ${formData.roles.includes(roleOption.value) || roleOption.value === 'customer' ? `text-${roleOption.color}-700` : 'text-gray-700'}`}>
                          {roleOption.label} {roleOption.value === 'customer' && <span className="text-[10px] font-normal text-gray-400">(Mandatory)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 italic">
                    The user will have access to dashboards for all selected roles simultaneously.
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FaShieldAlt className="text-blue-500" /> Active Permissions Summary
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
                    {formData.roles.includes('customer') && (
                      <div className="flex gap-2"><span>•</span> <span>Browse products, wishlist & profile</span></div>
                    )}
                    {formData.roles.includes('service_provider') && (
                      <div className="flex gap-2"><span>•</span> <span>Manage service listings & bookings</span></div>
                    )}
                    {formData.roles.includes('seller') && (
                      <div className="flex gap-2"><span>•</span> <span>Create products, manage inventory & sales</span></div>
                    )}
                    {formData.roles.includes('marketer') && (
                      <div className="flex gap-2"><span>•</span> <span>Share products & track affiliate commissions</span></div>
                    )}
                    {formData.roles.includes('delivery_agent') && (
                      <div className="flex gap-2"><span>•</span> <span>Accept assignments & update delivery status</span></div>
                    )}
                    {formData.roles.includes('admin') && (
                      <div className="flex gap-2"><span>•</span> <span>User management & content moderation</span></div>
                    )}
                    {formData.roles.includes('ops_manager') && (
                      <div className="flex gap-2"><span>•</span> <span>Operations oversight & staff management</span></div>
                    )}
                    {formData.roles.includes('logistics_manager') && (
                      <div className="flex gap-2"><span>•</span> <span>Logistics coordination & supply chain</span></div>
                    )}
                    {formData.roles.includes('finance_manager') && (
                      <div className="flex gap-2"><span>•</span> <span>Financial oversight & commission payments</span></div>
                    )}
                    {formData.roles.includes('super_admin') && (
                      <div className="flex gap-2"><span className="text-red-600">★</span> <span className="font-bold">Full system access & root configuration</span></div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Status Tab */}
            {activeTab === 'status' && (
              <div>
                <div className="mb-4">
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Account Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="frozen">Frozen</option>
                  </select>
                </div>

                {formData.status === 'frozen' && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">
                      ⚠️ Setting status to frozen will freeze the user and prevent them from accessing the system.
                    </p>
                  </div>
                )}

                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Current Status Info</h4>
                  <div className="text-sm text-gray-600">
                    <p>Status: <span className={formData.status === 'active' ? 'text-green-600' : 'text-red-600'}>
                      {formData.status === 'active' ? 'Active' : 'Frozen'}
                    </span></p>
                    <p>Last Login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</p>
                    <p>Account Created: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Verification Tab */}
            {activeTab === 'verification' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">Email Verification</h4>
                    <p className="text-sm text-gray-600">User's email address verification status</p>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="emailVerified"
                      checked={formData.emailVerified}
                      onChange={handleInputChange}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Verified</span>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">Phone Verification</h4>
                    <p className="text-sm text-gray-600">User's phone number verification status</p>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="phoneVerified"
                      checked={formData.phoneVerified}
                      onChange={handleInputChange}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Verified</span>
                  </label>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Verification Actions</h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await adminApi.updateUserVerification(user.id, {
                            sendVerificationEmail: true
                          });
                          setSuccess('Verification email sent successfully!');
                        } catch (err) {
                          setError('Failed to send verification email');
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Send Email Verification
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await adminApi.updateUserVerification(user.id, {
                            sendVerificationSms: true
                          });
                          setSuccess('Verification SMS sent successfully!');
                        } catch (err) {
                          setError('Failed to send verification SMS');
                        }
                      }}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      Send SMS Verification
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Access Control Tab */}
            {activeTab === 'access' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  Control user access to different platform features and sections.
                </p>

                <div className="space-y-3">
                  {Object.entries({
                    marketplace: 'Marketplace Access',
                    sellerPortal: 'Seller Portal',
                    marketingTools: 'Marketing Tools',
                    commissionAccess: 'Commission Access',
                    adminPanel: 'Admin Panel'
                  }).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div>
                        <h5 className="font-medium text-gray-900">{label}</h5>
                        <p className="text-sm text-gray-600">
                          {key === 'marketplace' && 'Can browse and purchase products'}
                          {key === 'sellerPortal' && 'Can manage products and sales'}
                          {key === 'marketingTools' && 'Can share products and use marketing tools'}
                          {key === 'commissionAccess' && 'Can view earnings and commissions'}
                          {key === 'adminPanel' && 'Can access administrative features'}
                        </p>
                      </div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.accessRestrictions[key]}
                          onChange={() => handleAccessRestrictionChange(key)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {formData.accessRestrictions[key] ? 'Allowed' : 'Restricted'}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <FaSave className="w-4 h-4" />
                    Update User
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Add User Dialog Component
const AddUserDialog = ({ isOpen, onClose, onUserCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    role: 'customer',
    roles: ['customer'],
    superAdminPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const resetAlerts = () => { setError(''); setSuccess(''); };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    resetAlerts();
  };

  const handleRoleCheckboxChange = (roleValue) => {
    setFormData(prev => {
      const currentRoles = [...prev.roles];
      const index = currentRoles.indexOf(roleValue);

      if (index === -1) {
        currentRoles.push(roleValue);
      } else {
        if (roleValue === 'customer' && currentRoles.length === 1) return prev;
        currentRoles.splice(index, 1);
      }

      const finalRoles = currentRoles.length === 0 ? ['customer'] : currentRoles;

      return {
        ...prev,
        roles: finalRoles,
        role: finalRoles[finalRoles.length - 1]
      };
    });
    resetAlerts();
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Name is required';
    if (!formData.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'Please enter a valid email';
    if (!formData.password) return 'Password is required';
    if (formData.password.length < 6) return 'Password must be at least 6 characters';
    if (formData.password !== formData.confirmPassword) return 'Passwords do not match';
    if (!formData.phone.trim()) return 'Phone number is required';
    if (!validateKenyanPhone(formData.phone)) return PHONE_VALIDATION_ERROR;
    return null;
    if (!formData.superAdminPassword) return 'Super admin password is required';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    resetAlerts();

    try {
      const response = await adminApi.createUser({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        phone: formData.phone.trim(),
        role: formData.role,
        roles: formData.roles,
        superAdminPassword: formData.superAdminPassword
      });

      setSuccess('User created successfully!');
      onUserCreated(response.data.user);

      // Reset form
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        role: 'customer',
        roles: ['customer'],
        superAdminPassword: ''
      });

    } catch (err) {
      console.error('Error creating user:', err);
      setError(err.response?.data?.message || 'Failed to create user. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Create New User</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-200 text-green-700 rounded-lg">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter full name"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter email address"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onInput={(e) => e.target.value = formatKenyanPhoneInput(e.target.value)}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 0712345678, 0123456789, or +254712345678"
                  required
                />
              </div>

              {/* Roles (Multi-select) */}
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  Assign Roles (Select all that apply) *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-gray-50 p-4 border border-gray-200 rounded-lg">
                  {[
                    { value: 'customer', label: 'Customer', color: 'blue' },
                    { value: 'marketer', label: 'Marketer', color: 'purple' },
                    { value: 'seller', label: 'Seller', color: 'green' },
                    { value: 'delivery_agent', label: 'Delivery Agent', color: 'orange' },
                    { value: 'service_provider', label: 'Service Provider', color: 'indigo' },
                    { value: 'ops_manager', label: 'Ops Manager', color: 'red' },
                    { value: 'logistics_manager', label: 'Logistics Manager', color: 'yellow' },
                    { value: 'finance_manager', label: 'Finance Manager', color: 'emerald' },
                    { value: 'admin', label: 'Admin', color: 'gray' },
                    { value: 'super_admin', label: 'Super Admin', color: 'black' }
                  ].map((roleOption) => (
                    <label
                      key={roleOption.value}
                      className={`flex items-center p-2 rounded-md border cursor-pointer transition-all ${formData.roles.includes(roleOption.value) || roleOption.value === 'customer'
                        ? `border-${roleOption.color}-500 bg-white ring-1 ring-${roleOption.color}-500`
                        : 'border-gray-200 hover:bg-white bg-transparent'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.roles.includes(roleOption.value) || roleOption.value === 'customer'}
                        onChange={() => roleOption.value !== 'customer' && handleRoleCheckboxChange(roleOption.value)}
                        disabled={roleOption.value === 'customer'}
                        className={`rounded border-gray-300 text-${roleOption.color}-600 focus:ring-${roleOption.color}-500 mr-3 h-4 w-4 ${roleOption.value === 'customer' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      <span className={`text-xs font-medium ${formData.roles.includes(roleOption.value) || roleOption.value === 'customer' ? `text-${roleOption.color}-700` : 'text-gray-600'}`}>
                        {roleOption.label} {roleOption.value === 'customer' && <span className="text-[8px] font-normal text-gray-400 mt-1">(Default)</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-gray-500 italic">
                  New users will have access to all selected dashboards after verification.
                </p>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter password"
                  required
                />
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Confirm password"
                  required
                />
              </div>
            </div>

            {/* Super Admin Password */}
            <div>
              <label htmlFor="superAdminPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Super Admin Password *
              </label>
              <input
                type="password"
                id="superAdminPassword"
                name="superAdminPassword"
                value={formData.superAdminPassword}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your super admin password"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Required to verify administrative privileges
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <FaPlus className="w-4 h-4" />
                    Create User
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// View User Modal Component
const ViewUserModal = ({ isOpen, onClose, user }) => {
  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">User Profile: {user.name}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>

          {/* User Info */}
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Basic Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Name:</span>
                  <span className="ml-2 font-medium">{user.name}</span>
                </div>
                <div>
                  <span className="text-gray-600">Email:</span>
                  <span className="ml-2 font-medium">{user.email}</span>
                </div>
                <div>
                  <span className="text-gray-600">Phone:</span>
                  <span className="ml-2 font-medium">{user.phone}</span>
                </div>
                <div>
                  <span className="text-gray-600">Gender:</span>
                  <span className="ml-2 font-medium">{user.gender || 'Not specified'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Campus:</span>
                  <span className="ml-2 font-medium">{user.campus || 'Not specified'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Roles:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.isArray(user.roles) ? user.roles.map(r => (
                      <span key={r} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                        {r}
                      </span>
                    )) : (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                        {user.role}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Account Status */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Account Status</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Status:</span>
                  <span className={`ml-2 font-medium ${user.isDeactivated ? 'text-red-600' : 'text-green-600'}`}>
                    {user.isDeactivated ? 'Inactive' : 'Active'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Email Verified:</span>
                  <span className={`ml-2 font-medium ${user.emailVerified ? 'text-green-600' : 'text-red-600'}`}>
                    {user.emailVerified ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Phone Verified:</span>
                  <span className={`ml-2 font-medium ${user.phoneVerified ? 'text-green-600' : 'text-red-600'}`}>
                    {user.phoneVerified ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Last Login:</span>
                  <span className="ml-2 font-medium">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Joined:</span>
                  <span className="ml-2 font-medium">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            {/* Activity Summary */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Activity Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{user.orders?.length || 0}</div>
                  <div className="text-gray-600">Orders</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    ${user.orders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0}
                  </div>
                  <div className="text-gray-600">Total Spent</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{user.wishlist?.length || 0}</div>
                  <div className="text-gray-600">Wishlist Items</div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// User List Tab Component
const UserListTab = ({ forcedStatus, activeTab }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [filter, setFilter] = useState(forcedStatus || searchParams.get('status') || 'all');
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || 'all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [showViewUserDialog, setShowViewUserDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [userToFreeze, setUserToFreeze] = useState(null);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedUserForMessage, setSelectedUserForMessage] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const observer = React.useRef();
  const lastUserElementRef = React.useCallback(node => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  // Consolidate filters and pagination into a single loading effect to prevent race conditions and duplicates
  useEffect(() => {
    loadUsers(page === 1);
  }, [searchTerm, filter, roleFilter, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setHasMore(true);
  }, [searchTerm, filter, roleFilter]);

  // Sync state with URL params
  useEffect(() => {
    const status = searchParams.get('status');
    const role = searchParams.get('role');
    const search = searchParams.get('search');

    if (status && !forcedStatus) setFilter(status);
    if (role) setRoleFilter(role);
    if (search) setSearchTerm(search);
  }, [searchParams, forcedStatus]);

  // Sync filter with forcedStatus prop when it changes (essential for tab switching)
  useEffect(() => {
    if (forcedStatus) {
      setFilter(forcedStatus);
    } else if (activeTab === 'list') {
      // Only reset to 'all' or URL status if we're specifically on the general list tab
      setFilter(searchParams.get('status') || 'all');
    }
  }, [forcedStatus, activeTab, searchParams]);

  const loadUsers = async (initial = false) => {
    try {
      if (initial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError('');

      // Build params object, excluding empty values
      const params = {
        page: initial ? 1 : page,
        limit: 20
      };
      if (searchTerm && searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      if (filter !== 'all') {
        params.status = filter;
      }
      if (roleFilter !== 'all') {
        params.role = roleFilter;
      }

      const response = await adminApi.getAllUsers(params);
      const newUsers = response.data.users || [];
      const pagination = response.data.pagination || {};

      if (initial) {
        setUsers(newUsers);
      } else {
        setUsers(prev => {
          // De-duplicate users by ID
          const existingIds = new Set(prev.map(u => u.id));
          const uniqueNewUsers = newUsers.filter(u => !existingIds.has(u.id));
          return [...prev, ...uniqueNewUsers];
        });
      }

      setTotalUsers(pagination.total || 0);
      setHasMore(newUsers.length > 0 && pagination.page < pagination.totalPages);
    } catch (e) {
      console.error('Failed to load users:', e);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;
    return user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const resetAlerts = () => { setError(''); setSuccess(''); };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setShowEditUserDialog(true);
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setShowViewUserDialog(true);
  };

  const handleBanUser = async (user) => {
    // Only super_admin can freeze/unfreeze users
    if (userToFreeze?.role === 'super_admin') {
      setError('Cannot freeze/unfreeze super_admin accounts');
      return;
    }

    const action = user.isFrozen ? 'unfreeze' : 'freeze';

    setUserToFreeze(user);
    setShowPasswordDialog(true);
  };

  const handlePasswordVerified = async (user, isFrozen) => {
    try {
      setSuccess(`User ${isFrozen ? 'frozen' : 'unfrozen'} successfully!`);
      setShowPasswordDialog(false);
      setUserToFreeze(null);
      loadUsers(); // Refresh the list
    } catch (err) {
      console.error('Error updating user status:', err);
      setError(err.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleOpenSupportModal = (user) => {
    setSelectedUserForMessage(user);
    setShowSupportModal(true);
  };

  const handleDeleteUser = async (user) => {
    const isSuperAdmin = user.role === 'super_admin' || user.roles?.includes('super_admin');
    if (isSuperAdmin) {
      alert('Super Admins cannot be deleted for safety. Please downgrade their role first if absolutely necessary.');
      return;
    }

    if (!window.confirm(`⚠️ WARNING: Are you sure you want to ARCHIVE user "${user.name}"? \n\nThis will block their access and move them to the Archived tab. Past orders and records will be preserved.`)) {
      return;
    }

    const password = window.prompt('For security, please enter your SUPER ADMIN password to confirm this deletion:');
    if (!password) return;

    try {
      setLoading(true);
      // Verify password first (using existing endpoint)
      const verifyResponse = await adminApi.verifyAdminPassword(password);
      if (!verifyResponse.data?.verified) {
        setError('Invalid password. Deletion aborted.');
        setLoading(false);
        return;
      }

      await adminApi.deleteUser(user.id);
      setSuccess('User archived successfully');
      loadUsers();
    } catch (err) {
      console.error('Deletion failed:', err);
      setError(err.response?.data?.message || 'Failed to delete user');
      setLoading(false);
    }
  };

  const handleRestoreUser = async (user) => {
    if (!window.confirm(`Are you sure you want to RESTORE user "${user.name}"? \n\nThey will regain access to the system immediately.`)) {
      return;
    }

    try {
      setLoading(true);
      await adminApi.restoreUser(user.id);
      setSuccess('User restored successfully');
      loadUsers();
    } catch (err) {
      console.error('Restoration failed:', err);
      setError(err.response?.data?.message || 'Failed to restore user');
      setLoading(false);
    }
  };

  const handleUserUpdated = async (userData) => {
    // The API call is already done in EditUserModal
    // Just refresh the list and update UI state
    await loadUsers();

    // Update local state immediately for better UX
    setUsers(prevUsers => prevUsers.map(u =>
      u.id === userData.id ? { ...u, ...userData } : u
    ));

    setShowEditUserDialog(false);
    setSelectedUser(null);
  };

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        resetAlerts();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleToggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = filteredUsers.map((u) => u.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkFreeze = async (freeze) => {
    if (selectedUserIds.length === 0) return;

    const affectedUsers = users.filter((u) => selectedUserIds.includes(u.id));
    if (affectedUsers.length === 0) return;

    const actionLabel = freeze ? 'freeze' : 'unfreeze';
    const confirmMessage = `Are you sure you want to ${actionLabel} ${affectedUsers.length} selected user(s)?`;
    if (!window.confirm(confirmMessage)) return;

    const password = window.prompt('Enter super admin password to continue');
    if (!password) return;

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const verifyResponse = await adminApi.verifyAdminPassword(password);
      if (!verifyResponse.data?.verified) {
        setError('Invalid password. Please try again.');
        return;
      }

      await Promise.all(
        affectedUsers.map((user) =>
          adminApi.updateUserFrozen(user.id, freeze, password)
        )
      );

      setSuccess(`Successfully ${freeze ? 'frozen' : 'unfrozen'} ${affectedUsers.length} user(s).`);
      setSelectedUserIds([]);
      await loadUsers();
    } catch (err) {
      console.error('Bulk freeze/unfreeze failed:', err);
      setError(err.response?.data?.message || 'Bulk operation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
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

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search users..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={!!forcedStatus}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Roles</option>
            <option value="customer">Customers</option>
            <option value="seller">Sellers</option>
            <option value="marketer">Marketers</option>
            <option value="delivery_agent">Delivery Agents</option>
            <option value="service_provider">Service Providers</option>
            <option value="admin">Administrators</option>
            <option value="ops_manager">Ops Managers</option>
            <option value="logistics_manager">Logistics Managers</option>
            <option value="finance_manager">Finance Managers</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadUsers}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <FaSync className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddUserDialog(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <FaPlus className="w-4 h-4" />
            Add User
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <FaDownload className="w-4 h-4" />
            Export ({filteredUsers.length})
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          {selectedUserIds.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-sm text-yellow-800">
              <span>{selectedUserIds.length} user(s) selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkFreeze(true)}
                  className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-xs"
                >
                  Freeze Selected
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkFreeze(false)}
                  className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 text-xs"
                >
                  Unfreeze Selected
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs flex items-center gap-1"
                >
                  <FaComments className="w-3 h-3" />
                  Message Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUserIds([])}
                  className="px-3 py-1 rounded border border-yellow-300 text-yellow-800 bg-white text-xs hover:bg-yellow-100"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    onChange={handleSelectAllVisible}
                    checked={
                      filteredUsers.length > 0 &&
                      filteredUsers.every((u) => selectedUserIds.includes(u.id))
                    }
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  R.Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => {
                  const isLastElement = filteredUsers.length === index + 1;
                  return (
                    <tr
                      key={user.id}
                      ref={isLastElement ? lastUserElementRef : null}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={() => handleToggleUserSelection(user.id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <FaUser className="w-5 h-5 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                            <div className="text-sm text-gray-500">{user.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.referralCode || '—'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {Array.isArray(user.roles) && user.roles.length > 0 ? (
                            user.roles.map((r, i) => (
                              <span key={i} className="px-2 inline-flex text-[10px] leading-4 font-semibold rounded-full bg-blue-100 text-blue-800">
                                {r}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              {user.role}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isFrozen ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                          {user.isFrozen ? 'Frozen' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewUser(user)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View User Details"
                          >
                            <FaEye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditUser(user)}
                            className="text-green-600 hover:text-green-900"
                            title="Edit User"
                          >
                            <FaEdit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenSupportModal(user)}
                            className="text-blue-500 hover:text-blue-700"
                            title="Message User"
                          >
                            <FaComments className="w-4 h-4" />
                          </button>
                          
                          {forcedStatus === 'deleted' ? (
                            <button
                              onClick={() => handleRestoreUser(user)}
                              className="text-green-600 hover:text-green-900"
                              title="Restore User"
                            >
                              <FaTrashRestore className="w-4 h-4" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleBanUser(user)}
                                className={user.isFrozen ? "text-green-600 hover:text-green-900" : "text-red-600 hover:text-red-900"}
                                title={user.isFrozen ? "Unfreeze User" : "Freeze User"}
                              >
                                <FaBan className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user)}
                                className="text-red-600 hover:text-red-900"
                                title="Archive/Delete User"
                              >
                                <FaTrash className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {loadingMore && (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      <span className="text-sm text-gray-500">Loading more users...</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={showEditUserDialog}
        onClose={() => setShowEditUserDialog(false)}
        user={selectedUser}
        onUserUpdated={handleUserUpdated}
      />

      {/* View User Modal */}
      <ViewUserModal
        isOpen={showViewUserDialog}
        onClose={() => setShowViewUserDialog(false)}
        user={selectedUser}
      />

      {/* Add User Dialog */}
      <AddUserDialog
        isOpen={showAddUserDialog}
        onClose={() => setShowAddUserDialog(false)}
        onUserCreated={(newUser) => {
          setUsers([newUser, ...users]);
          setShowAddUserDialog(false);
          setSuccess('User created successfully and added to the list!');
          // Auto-refresh the list
          loadUsers();
        }}
      />

      {/* Super Admin Password Dialog */}
      <SuperAdminPasswordDialog
        isOpen={showPasswordDialog}
        onClose={() => {
          setShowPasswordDialog(false);
          setUserToFreeze(null);
        }}
        onPasswordVerified={handlePasswordVerified}
        userToFreeze={userToFreeze}
        action={userToFreeze?.isFrozen ? 'unfreeze' : 'freeze'}
      />

      <SupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        user={selectedUserForMessage}
      />

      <BulkMessageModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        selectedUserIds={selectedUserIds}
        onSuccess={() => {
          setSuccess(`Message sent to ${selectedUserIds.length} users successfully!`);
          setSelectedUserIds([]);
        }}
      />
    </div>
  );
};

// Communication Tab Component
const CommunicationTab = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 20000); // Poll conversation list every 20s
    return () => clearInterval(interval);
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await supportApi.getSummary();
      // Group by other user
      const grouped = response.data.data.reduce((acc, msg) => {
        const otherUser = msg.type === 'admin_to_user' ? msg.receiver : msg.sender;
        if (!acc[otherUser.id]) {
          acc[otherUser.id] = {
            user: otherUser,
            lastMessage: msg.message,
            timestamp: msg.createdAt,
            unreadCount: msg.type === 'user_to_admin' && !msg.isRead ? 1 : 0
          };
        } else {
          if (msg.type === 'user_to_admin' && !msg.isRead) {
            acc[otherUser.id].unreadCount++;
          }
        }
        return acc;
      }, {});
      setConversations(Object.values(grouped));
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const openChat = (user) => {
    setSelectedUser(user);
    setShowChat(true);
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h3 className="text-lg font-bold text-gray-900">Active Conversations</h3>
      </div>

      <div className="divide-y">
        {loading ? (
          <div className="p-10 text-center">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No active conversations found.</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.user.id}
              onClick={() => openChat(conv.user)}
              className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  {conv.user.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">{conv.user.name}</h4>
                  <p className="text-sm text-gray-500 truncate max-w-md">{conv.lastMessage}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">{new Date(conv.timestamp).toLocaleDateString()}</p>
                {conv.unreadCount > 0 && (
                  <span className="inline-block bg-red-500 text-white text-[10px] px-2 py-1 rounded-full mt-1">
                    {conv.unreadCount} new
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <SupportModal
        isOpen={showChat}
        onClose={() => {
          setShowChat(false);
          loadConversations();
        }}
        user={selectedUser}
      />
    </div>
  );
};

// Main UserManagement Component
export default function UserManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('list');
  const [loading, setLoading] = useState(false);

  // Tab content renderer
  const renderTabContent = () => {
    switch (activeTab) {
      case 'list':
        return <UserListTab activeTab={activeTab} />;
      case 'archived':
        return <UserListTab forcedStatus="deleted" activeTab={activeTab} />;
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Profile Management</h3>
              <p className="text-gray-600">This feature is coming soon. You'll be able to manage detailed user profiles here.</p>
            </div>
          </div>
        );
      case 'verification':
        return <UserListTab forcedStatus="verified" activeTab={activeTab} />;
      case 'security':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Settings</h3>
              <p className="text-gray-600">This feature is coming soon. You'll be able to manage security settings here.</p>
            </div>
          </div>
        );
      case 'communication':
        return <CommunicationTab />;
      case 'reports':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Reports & Analytics</h3>
              <p className="text-gray-600">This feature is coming soon. You'll be able to generate reports here.</p>
            </div>
          </div>
        );
      default:
        return <UserListTab activeTab={activeTab} />;
    }
  };

  const roleTitle = searchParams.get('role');
  const getPageTitle = () => {
    if (!roleTitle || roleTitle === 'all') return 'User Management';
    return `${roleTitle.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Management`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <FaArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{getPageTitle()}</h1>
              <p className="mt-2 text-gray-600">
                Comprehensive user administration and management
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500">
                  Logged in as: <span className="font-medium text-gray-900">{user?.name}</span>
                </div>
                <div className={`w-3 h-3 rounded-full ${user?.role === 'admin' || user?.role === 'super_admin' ? 'bg-green-500' : 'bg-yellow-500'
                  }`}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          ) : (
            <div className="p-6">
              {renderTabContent()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}