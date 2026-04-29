import React, { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  FaUser, FaLock, FaBell, FaCreditCard, FaMapMarkerAlt,
  FaHistory, FaSignOutAlt, FaCog, FaPhone, FaEnvelope,
  FaIdCard, FaUniversity, FaShieldAlt, FaMoneyBillWave,
  FaFileAlt, FaQuestionCircle, FaTrashAlt, FaToggleOn,
  FaToggleOff, FaEdit, FaPlus, FaCheck, FaTimes, FaSpinner, FaWallet, FaHeart, FaArrowLeft,
  FaExclamationTriangle, FaCheckCircle, FaMobile, FaDesktop, FaEye, FaEyeSlash, FaClock
} from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import userService from '../../services/userService';
import { toast } from 'react-toastify';
import Addresses from './Addresses';
import ProfileComponent from '../../components/ProfileComponent';
import PhoneVerification from '../../components/PhoneVerification';
import ProfileSettings from './ProfileSettings';

const AccountSettings = () => {
  const { user: authUser, logout, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // State for user data and UI
  const [userData, setUserData] = useState(authUser || null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState({
    profile: true,
    wallet: true,
    transactions: true,
    notifications: true
  });
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'account',
    priority: 'medium',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cameFromVerification, setCameFromVerification] = useState(false);

  // Verification state
  const [verifyEmailStep, setVerifyEmailStep] = useState('status'); // 'status' | 'verify'
  const [verifyPhoneStep, setVerifyPhoneStep] = useState('status'); // 'status' | 'verify'
  const [emailToken, setEmailToken] = useState('');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Security & Password State
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [securityData, setSecurityData] = useState({
    loginHistory: [],
    activeSessions: [],
    lastPasswordChange: null,
    securityQuestion: '',
    twoFactorEnabled: false
  });

  // Menu items for the sidebar
  const menuItems = [
    {
      id: 'profile',
      name: 'Profile',
      path: '/customer/settings',
      icon: <FaUser />,
      roles: ['customer', 'seller', 'admin', 'superadmin']
    },
    {
      id: 'contact',
      name: 'Contact',
      path: '/customer/settings',
      icon: <FaPhone />,
      roles: ['customer', 'seller', 'admin', 'superadmin']
    },
    {
      id: 'verification',
      name: 'Account Verification',
      path: '/customer/account-verification',
      icon: <FaShieldAlt />,
      roles: ['customer', 'seller', 'admin', 'superadmin']
    },
    {
      id: 'addresses',
      name: 'Addresses',
      path: '/customer/settings',
      icon: <FaMapMarkerAlt />,
      roles: ['customer', 'seller', 'admin', 'superadmin']
    },
    {
      id: 'security',
      name: 'Security',
      path: '/customer/settings',
      icon: <FaLock />,
      roles: ['customer', 'seller', 'admin', 'superadmin']
    },
    {
      id: 'wallet',
      name: 'Wallet',
      path: '/customer/settings',
      icon: <FaWallet />,
      roles: ['customer', 'seller']
    },
    {
      id: 'support',
      name: 'Support',
      path: '/customer/settings',
      icon: <FaQuestionCircle />,
      roles: ['customer', 'seller', 'admin', 'superadmin']
    },
    {
      id: 'account',
      name: 'Account Control',
      path: '/customer/settings',
      icon: <FaCog />,
      roles: ['customer', 'seller', 'admin', 'superadmin']
    }
  ];

  // Fetch user profile data
  const fetchUserProfile = useCallback(async () => {
    if (!authUser) return;
    try {
      setLoading(prev => ({ ...prev, profile: true }));
      const profile = await userService.getFullProfile();
      setUserData(profile);
      // Sync with global auth context
      updateUser(profile);
      return profile;
    } catch (error) {
      toast.error('Failed to load profile data');
      console.error('Error fetching profile:', error);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, profile: false }));
    }
  }, [authUser, updateUser]);

  // Sync local userData with authUser when it changes globally
  useEffect(() => {
    if (authUser) {
      setUserData(authUser);
    }
  }, [authUser]);

  // Fetch wallet data
  const fetchWalletData = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, wallet: true }));
      const balance = await userService.getWalletBalance();
      setWalletBalance(balance);

      const txns = await userService.getTransactions();
      setTransactions(txns);
    } catch (error) {
      toast.error('Failed to load wallet data');
      console.error('Error fetching wallet data:', error);
    } finally {
      setLoading(prev => ({ ...prev, wallet: false, transactions: false }));
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, notifications: true }));
      const notifs = await userService.getNotifications();
      setNotifications(notifs);
    } catch (error) {
      toast.error('Failed to load notifications');
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(prev => ({ ...prev, notifications: false }));
    }
  }, []);


  // Function to copy referral code to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Referral code copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy referral code');
    });
  };

  // Fetch security data
  const fetchSecurityData = useCallback(async () => {
    /* Temporarily disabled - route missing in backend
    try {
      const security = await userService.getSecurityData();
      setSecurityData(security);
    } catch (error) {
      console.error('Error fetching security data:', error);
    }
    */
  }, []);

  // Handle password change form submission
  const handlePasswordSubmit = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setPasswordChanging(true);
    const success = await handlePasswordChange(passwordForm.currentPassword, passwordForm.newPassword);
    setPasswordChanging(false);

    if (success) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      fetchSecurityData(); // Refresh security data (e.g. last password change)
    }
  };

  // Toggle 2FA
  const toggleTwoFactor = async () => {
    toast.info('Two-Factor Authentication is coming soon!');
    /*
    try {
      await userService.toggleTwoFactor(!securityData.twoFactorEnabled);
      setSecurityData(prev => ({ ...prev, twoFactorEnabled: !prev.twoFactorEnabled }));
      toast.success(`Two-Factor Authentication ${!securityData.twoFactorEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to update 2FA status');
    }
    */
  };

  // Handle navigation state from other pages
  useEffect(() => {
    if (location.state?.tab || location.state?.isEditing) {
      if (location.state.tab) {
        setActiveTab(location.state.tab);
        // Track that user came from verification page
        setCameFromVerification(true);
      }

      if (location.state.isEditing) {
        setActiveTab('profile');
        setIsEditing(true);
        // If userData is available use it, otherwise use authUser fallback
        setEditForm(userData || authUser || {});
      }

      // If navigating to security with verification focus, trigger the verification flow
      if (location.state.tab === 'security' && location.state.verificationFocus) {
        // Small delay to ensure tab is switched first
        setTimeout(() => {
          if (location.state.verificationFocus === 'email') {
            setVerifyEmailStep('status');
          } else if (location.state.verificationFocus === 'phone') {
            setVerifyPhoneStep('status');
          }
        }, 100);
      }

      // Clear the state after handling to prevent re-triggering on subsequent renders
      const newState = { ...location.state };
      delete newState.tab;
      delete newState.isEditing;
      navigate(location.pathname, { replace: true, state: newState });
    }
  }, [location.state, navigate, userData, authUser]);

  // Load data based on active tab
  useEffect(() => {
    const loadTabData = async () => {
      switch (activeTab) {
        case 'profile':
          await fetchUserProfile();
          break;
        case 'wallet':
          await fetchWalletData();
          break;
        case 'security':
          await fetchSecurityData();
          break;
        default:
          break;
      }
    };

    loadTabData();
  }, [activeTab]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const [isSaved, setIsSaved] = useState(false);

  // Handle profile update
  const handleSaveProfile = async () => {
    // Use editForm which contains the modified data
    if (!editForm) return;

    setSaveError('');
    try {
      // Pass editForm explicitly to update profile with new values
      const updatedUser = await userService.updateProfile(editForm);
      toast.success('Profile updated successfully');

      // Update local user data with the response from server to ensure sync
      const userToSet = updatedUser.user || updatedUser;
      setUserData(userToSet);
      updateUser(userToSet); // Sync global auth context too
      // setEditForm({}); // Keep form populated

      // Stay in edit mode but mark as saved (locked)
      setIsSaved(true);

      // Automatically move to the next step if in verification flow
      if (cameFromVerification) {
        setTimeout(() => {
          setActiveTab('addresses');
          setIsSaved(false); // Reset saved state for the next tab if applicable
          setIsEditing(false); // Close edit mode for the next tab
        }, 1500);
      }

    } catch (error) {
      const backendMessage = error.response?.data?.message || error.response?.data?.error;
      const finalMsg = backendMessage || 'Failed to update profile';
      setSaveError(finalMsg);
      toast.error(finalMsg);
      console.error('Error updating profile:', error);
    }
  };

  // Legacy function for backward compatibility
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!userData) return;

    try {
      await userService.updateProfile(userData);
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      toast.error('Failed to update profile');
      console.error('Error updating profile:', error);
    }
  };

  // Handle password change
  const handlePasswordChange = async (currentPassword, newPassword) => {
    try {
      await userService.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to change password');
      return false;
    }
  };

  // Handle email verification request
  const handleEmailVerificationRequest = async (e) => {
    e?.preventDefault();
    const emailToVerify = newEmailInput || userData?.email;
    console.log('handleEmailVerificationRequest called for', emailToVerify);
    if (!emailToVerify) {
      toast.error('Please enter an email address to verify.');
      return;
    }
    
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToVerify)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    try {
      console.log('Setting isVerifying to true');
      setIsVerifying(true);
      console.log('Calling userService.requestEmailChange for:', emailToVerify);
      const res = await userService.requestEmailChange(emailToVerify);
      console.log('userService response:', res);
      toast.success(res.message || 'Verification token sent to your email');
      setVerifyEmailStep('verify');
    } catch (error) {
      console.error('Error in email verification request:', error);
      toast.error(error.response?.data?.message || 'Failed to send verification token');
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle email verification
  const handleEmailVerification = async () => {
    try {
      setIsVerifying(true);
      await userService.confirmEmailChange(emailToken);
      toast.success('Email verified successfully');
      setVerifyEmailStep('status');
      setEmailToken('');
      const profile = await fetchUserProfile();

      // Automatically move to next step
      if (cameFromVerification) {
        if (!profile.phoneVerified) {
          toast.info('Email verified! Moving to Phone verification...');
          setTimeout(() => {
            setVerifyPhoneStep('status');
            setActiveTab('security');
          }, 2000);
        } else if (profile.emailVerified && profile.phoneVerified) {
          toast.info('All basic verifications complete! Moving to ID Upload...');
          setTimeout(() => {
            navigate('/customer/id-upload');
          }, 2000);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid or expired token');
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle phone verification request
  const handlePhoneVerificationRequest = async () => {
    console.log('handlePhoneVerificationRequest called');
    if (!userData?.phone) {
      toast.error('Please set your phone number first in the Profile tab');
      return;
    }
    try {
      setIsVerifying(true);
      await userService.requestPhoneOtp(userData.phone);
      toast.success('Verification code sent to your phone via WhatsApp');
      setVerifyPhoneStep('verify');
    } catch (error) {
      console.error('Error in phone verification request:', error);
      toast.error(error.response?.data?.message || 'Failed to send verification code');
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle phone verification
  const handlePhoneVerification = async () => {
    try {
      setIsVerifying(true);
      await userService.verifyPhoneOtp(phoneOtp);
      toast.success('Phone number verified successfully');
      setVerifyPhoneStep('status');
      setPhoneOtp('');
      const profile = await fetchUserProfile();

      // Automatically move to next step
      if (cameFromVerification) {
        if (!profile.emailVerified) {
          toast.info('Phone verified! Moving to Email verification...');
          setTimeout(() => {
            setVerifyEmailStep('status');
            setActiveTab('security');
          }, 2000);
        } else if (profile.emailVerified && profile.phoneVerified) {
          toast.info('All basic verifications complete! Moving to ID Upload...');
          setTimeout(() => {
            navigate('/customer/id-upload');
          }, 2000);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle notification settings update
  const handleNotificationSettingsUpdate = async (settings) => {
    try {
      await userService.updateNotificationSettings(settings);
      toast.success('Notification settings updated');
      return true;
    } catch (error) {
      toast.error('Failed to update notification settings');
      return false;
    }
  };

  // Handle support ticket submission
  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await userService.submitSupportTicket(ticketForm);
      setTicketSubmitted(true);
      setTicketForm({
        subject: '',
        category: 'account',
        priority: 'medium',
        message: ''
      });

      // Hide success message after 5 seconds
      setTimeout(() => setTicketSubmitted(false), 5000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit support ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle account deletion request
  const handleAccountDeletionRequest = async (reason) => {
    try {
      await userService.requestAccountDeletion(reason);
      toast.success('Account deletion request submitted. Our team will review it shortly.');
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit deletion request');
      return false;
    }
  };

  if (!authUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please Login</h2>
          <Link
            to="/login"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Login to Your Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Header with Back Button and Navigation Bar (Non-sticky) */}
              <div className="mb-8 bg-gray-100 py-4 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 border-b border-gray-200 flex items-center gap-4">
                <button
                  onClick={() => navigate(cameFromVerification ? '/customer/account-verification' : '/customer')}
                  className="inline-flex items-center justify-center p-3 border border-gray-100 rounded-2xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 hover:text-blue-600 transition-all active:scale-95 flex-shrink-0"
                  title={cameFromVerification ? 'Back to Verification' : 'Back to Dashboard'}
                >
                  <FaArrowLeft size={16} />
                </button>

                <nav className="flex overflow-x-auto gap-2 sm:gap-3 pb-2 scrollbar-hide no-scrollbar flex-1">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.path === '/wishlist') {
                          navigate('/wishlist');
                        } else if (item.path === '/customer/account-verification') {
                          navigate('/customer/account-verification');
                        } else {
                          setActiveTab(item.id);
                          // Clear focused view when manually switching tabs
                          navigate(location.pathname, { replace: true, state: { tab: item.id } });
                        }
                      }}
                      className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-sm border ${activeTab === item.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-blue-100 translate-y-[-1px] sm:translate-y-[-2px]'
                        : 'bg-white text-gray-600 border-white hover:border-blue-100 hover:text-blue-600'
                        }`}
                    >
                      <span className={`text-xs sm:text-base ${activeTab === item.id ? 'text-white' : 'text-blue-600'}`}>{item.icon}</span>
                      {item.name}
                    </button>
                  ))}
                </nav>
              </div>

              {activeTab === 'addresses' && (
                <Addresses
                  setActiveTab={setActiveTab}
                  cameFromVerification={cameFromVerification}
                />
              )}
              {activeTab === 'profile' && (
                <ProfileComponent
                  userData={userData}
                  setUserData={setUserData}
                  isEditing={isEditing}
                  setIsEditing={setIsEditing}
                  editForm={editForm}
                  setEditForm={setEditForm}
                  loading={loading}
                  onSaveProfile={handleSaveProfile}
                  isSaved={isSaved}
                  setIsSaved={setIsSaved}
                  setActiveTab={setActiveTab}
                  saveError={saveError}
                />
              )}
              {activeTab === 'contact' && (
                <ProfileSettings />
              )}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  {/* Security Overview Header */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg overflow-hidden relative">
                    <div className="relative z-10">
                      <h2 className="text-3xl font-black mb-2 flex items-center gap-3">
                        <FaShieldAlt className="text-blue-200" />
                        Account Security
                      </h2>
                      <p className="text-blue-100 max-w-xl">
                        Verify your contact details and manage your authentication settings to keep your Comrades360 account safe.
                      </p>
                    </div>
                    {/* Abstract background shapes */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/20 rounded-full -ml-10 -mb-10 blur-2xl"></div>
                  </div>

                  <div className={location.state?.verificationFocus ? "max-w-2xl mx-auto w-full" : "grid grid-cols-1 lg:grid-cols-2 gap-6"}>
                    {/* Email Verification Card */}
                    {(!location.state?.verificationFocus || location.state.verificationFocus === 'email') && (
                      <div className={`bg-white p-8 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md ${location.state?.verificationFocus === 'email' ? 'w-full' : ''}`}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                          <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${userData?.emailVerified ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                              <FaEnvelope className="text-xl" />
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900">Email Verification</h3>
                              <p className="text-xs text-gray-500 break-all">{userData?.email}</p>
                            </div>
                          </div>
                          {userData?.emailVerified ? (
                            <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1 rounded-full w-fit">
                              <FaCheckCircle className="text-green-500 text-xs" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-green-600">Verified</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1 rounded-full w-fit">
                              <FaExclamationTriangle className="text-red-500 text-xs" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-red-600">Unverified</span>
                            </div>
                          )}
                        </div>

                        {verifyEmailStep === 'status' ? (
                          <div className="space-y-4">
                            {!userData?.emailVerified && (
                              <div className="space-y-4">
                                {!userData?.email && (
                                  <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Email Address</label>
                                    <input
                                      type="email"
                                      value={newEmailInput}
                                      onChange={(e) => setNewEmailInput(e.target.value)}
                                      placeholder="Enter your email address to link"
                                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 font-medium"
                                    />
                                  </div>
                                )}
                                <button
                                  onClick={handleEmailVerificationRequest}
                                  disabled={isVerifying || (!userData?.email && !newEmailInput)}
                                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 group disabled:opacity-50"
                                >
                                  {isVerifying ? <FaSpinner className="animate-spin" /> : <FaShieldAlt className="transition-transform group-hover:scale-110" />}
                                  {userData?.email ? 'Verify Now' : 'Send Verification Code'}
                                </button>
                              </div>
                            )}
                            {userData?.emailVerified ? (
                              <p className="text-xs text-gray-400 text-center mt-2">
                                Verified emails receive order confirmations and security alerts.
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Email Verification Code</label>
                              <input
                                type="text"
                                maxLength={6}
                                value={emailToken}
                                onChange={(e) => setEmailToken(e.target.value.replace(/\D/g, ''))}
                                placeholder="6-digit code"
                                className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 font-mono text-center font-black text-2xl tracking-[0.5em]"
                              />
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <button
                                onClick={handleEmailVerification}
                                disabled={isVerifying || !emailToken}
                                className="w-full sm:flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50"
                              >
                                {isVerifying ? <FaSpinner className="animate-spin inline mr-2" /> : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setVerifyEmailStep('status')}
                                className="w-full sm:w-auto px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Phone Verification Card */}
                    {(!location.state?.verificationFocus || location.state.verificationFocus === 'phone') && (
                      <div className={`bg-white p-8 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md ${location.state?.verificationFocus === 'phone' ? 'w-full' : ''}`}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                          <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${userData?.phoneVerified ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                              <FaPhone className="text-xl" />
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900">Phone Verification</h3>
                              <p className="text-xs text-gray-500">{userData?.phone || 'No phone set'}</p>
                            </div>
                          </div>
                          {userData?.phoneVerified ? (
                            <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1 rounded-full w-fit">
                              <FaCheckCircle className="text-green-500 text-xs" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-green-600">Verified</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1 rounded-full w-fit">
                              <FaExclamationTriangle className="text-red-500 text-xs" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-red-600">Unverified</span>
                            </div>
                          )}
                        </div>

                        {verifyPhoneStep === 'status' ? (
                          <div className="space-y-4">
                            {!userData?.phoneVerified && (
                              <PhoneVerification 
                                currentPhone={userData?.phone}
                                onVerified={(verifiedPhone) => {
                                  toast.success('Phone number verified successfully!');
                                  fetchUserProfile();
                                  setVerifyPhoneStep('status');
                                  
                                  // Redirect back to verification page if we came from there
                                  if (cameFromVerification) {
                                    setTimeout(() => {
                                      navigate('/customer/account-verification');
                                    }, 2000);
                                  }
                                }}
                              />
                            )}
                            {userData?.phoneVerified && (
                                <p className="text-xs text-gray-400 text-center">
                                    Your phone number is verified and secure.
                                </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-sm text-gray-500 italic">Please use the verification form above.</p>
                            <button 
                                onClick={() => setVerifyPhoneStep('status')}
                                className="mt-2 text-blue-600 hover:underline text-sm font-bold"
                            >
                                Reset Verification View
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Security Management Section (Password, 2FA, History) */}
                  <div className="space-y-6">
                    {/* Change Password Card */}
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                          <FaLock />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">Change Password</h3>
                          <p className="text-sm text-gray-500">Update your password regularly to keep your account secure.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Current Password</label>
                          <div className="relative">
                            <input
                              type={showPasswords.current ? 'text' : 'password'}
                              value={passwordForm.currentPassword}
                              onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                              className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-all"
                              placeholder="Current password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showPasswords.current ? <FaEyeSlash /> : <FaEye />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">New Password</label>
                          <div className="relative">
                            <input
                              type={showPasswords.new ? 'text' : 'password'}
                              value={passwordForm.newPassword}
                              onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                              className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-all"
                              placeholder="New password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showPasswords.new ? <FaEyeSlash /> : <FaEye />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Confirm Password</label>
                          <div className="relative">
                            <input
                              type={showPasswords.confirm ? 'text' : 'password'}
                              value={passwordForm.confirmPassword}
                              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                              className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-all"
                              placeholder="Confirm new password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showPasswords.confirm ? <FaEyeSlash /> : <FaEye />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={handlePasswordSubmit}
                          disabled={passwordChanging || !passwordForm.currentPassword || !passwordForm.newPassword}
                          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
                        >
                          {passwordChanging ? <FaSpinner className="animate-spin" /> : <FaLock />}
                          Update Password
                        </button>
                      </div>
                    </div>

                    {/* Two-Factor Authentication */}
                    <div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${securityData.twoFactorEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                          <FaShieldAlt />
                        </div>
                        <div>
                          <h4 className="font-black text-gray-900 uppercase tracking-tighter text-base sm:text-lg">Two-Factor Authentication</h4>
                          <p className="text-sm text-gray-500">
                            {securityData.twoFactorEnabled
                              ? 'Your account is protected with 2FA.'
                              : 'Add an extra layer of security to your account.'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={toggleTwoFactor}
                        className={`w-full sm:w-auto px-6 py-2 border rounded-full font-bold text-sm transition-colors ${securityData.twoFactorEnabled
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                          }`}
                      >
                        {securityData.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                      </button>
                    </div>

                    {/* Login History */}
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                      <h4 className="font-black text-gray-900 uppercase tracking-tighter text-lg mb-6">Recent Login Activity</h4>
                      <div className="space-y-4">
                        {securityData.loginHistory && securityData.loginHistory.length > 0 ? (
                          securityData.loginHistory.slice(0, 5).map((login, index) => (
                            <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                              <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${login.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                  {login.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900 text-sm">{login.success ? 'Successful Login' : 'Failed Attempt'}</p>
                                  <p className="text-xs text-gray-500">{login.browser || 'Unknown Device'} • {login.location || 'Unknown Location'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                                <FaClock />
                                {login.timestamp ? new Date(login.timestamp).toLocaleString() : 'Just now'}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-gray-500 py-4">No recent login history found.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'wallet' && (
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold mb-4">Wallet Settings</h2>
                  <p>Wallet settings content will go here.</p>
                </div>
              )}

              {activeTab === 'support' && (
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold mb-4">Support</h2>
                  <p>Support content will go here.</p>
                </div>
              )}
              {activeTab === 'account' && (
                <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 overflow-hidden animate-fadeIn">
                  <div className="px-8 py-6 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border-b border-gray-100">
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                      <FaShieldAlt className="text-blue-600" />
                      Account Control
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Manage your unique identity and referral privileges.</p>
                  </div>

                  <div className="p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Account Role Card */}
                      <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                          Membership Level
                        </label>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                              <FaIdCard className="text-xl" />
                            </div>
                            <div>
                              <span className="text-lg font-black text-gray-900 capitalize tracking-tight">
                                {userData?.role}
                              </span>
                              <p className="text-xs text-blue-600 font-bold">Authenticated Member</p>
                            </div>
                          </div>
                          <div className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-100 w-fit">
                            Active
                          </div>
                        </div>
                      </div>

                      {/* Referral Section */}
                      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-2xl shadow-xl shadow-indigo-100 group overflow-hidden relative">
                        <div className="relative z-10">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-4">
                            Referral Privileges
                          </label>
                          <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                            <div>
                              <p className="text-[10px] font-black text-indigo-100 uppercase mb-1">Your Code</p>
                              <code className="text-2xl font-black text-white tracking-widest">
                                {userData?.referralCode || 'COMRADE360'}
                              </code>
                            </div>
                            <button
                              onClick={() => copyToClipboard(userData?.referralCode || 'COMRADE360')}
                              className="px-4 py-2 bg-white text-indigo-600 rounded-lg font-black text-xs uppercase shadow-lg shadow-black/20 hover:scale-105 active:scale-95 transition-all"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                        {/* Background Decoration */}
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000"></div>
                      </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-gray-100">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                            <FaTrashAlt className="text-xl" />
                          </div>
                          <div>
                            <h4 className="font-black text-gray-900 uppercase tracking-tighter">Terminate Account</h4>
                            <p className="text-[10px] sm:text-xs text-gray-500 italic">This action is permanent and cannot be reversed.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowDeleteModal(true)}
                          className="w-full md:w-auto px-8 py-3 bg-white border-2 border-red-50 text-red-600 rounded-xl font-black text-xs uppercase hover:bg-red-50 transition-all tracking-widest"
                        >
                          Delete Account
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <FaTrashAlt className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="mt-3 text-lg font-medium text-gray-900">Delete Account</h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.
                </p>
              </div>
              <div className="mt-4 flex justify-center space-x-3">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    handleLogout();
                    setShowDeleteModal(false);
                  }}
                >
                  Delete My Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSettings;
