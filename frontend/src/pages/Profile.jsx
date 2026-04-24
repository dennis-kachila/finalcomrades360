import React, { useState, useEffect, useCallback } from 'react';
import {
  FaUser, FaLock, FaEye, FaEyeSlash, FaCalendarAlt, FaPhone,
  FaEnvelope, FaIdCard, FaEdit, FaSave, FaTimes, FaShare,
  FaGoogle, FaFacebook, FaShieldAlt, FaClock, FaLaptop,
  FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaCopy,
  FaCopy as FaCopyIcon, FaSpinner, FaChevronDown, FaChevronUp,
  FaGlobe, FaUserSecret, FaLink, FaMobile, FaDesktop, FaCamera, FaArrowLeft
} from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { useLocation, useNavigate } from 'react-router-dom';
import userService from '../services/userService';
import AccountStats from '../components/AccountStats';
import { validateKenyanPhone, PHONE_VALIDATION_ERROR, formatKenyanPhoneInput } from '../utils/validation';

const Profile = () => {
  const { user: authUser, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('personal');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState({
    name: authUser?.name || '',
    username: authUser?.username || authUser?.name || '',
    email: authUser?.email || '',
    phone: authUser?.phone || '',
    gender: authUser?.gender || '',
    dateOfBirth: authUser?.dateOfBirth || '',
    bio: authUser?.bio || '',
    profileVisibility: authUser?.profileVisibility || 'public',
    referralCode: authUser?.referralCode || authUser?.referral_code || '',
    role: authUser?.role || 'customer',
    county: authUser?.county || '',
    town: authUser?.town || '',
    estate: authUser?.estate || '',
    houseNumber: authUser?.houseNumber || '',
    additionalPhone: authUser?.additionalPhone || ''
  });

  const [walletBalance, setWalletBalance] = useState(0);

  // Security states
  const [securityData, setSecurityData] = useState({
    loginHistory: [],
    activeSessions: [],
    lastPasswordChange: null,
    securityQuestion: '',
    socialLogins: {
      google: false,
      facebook: false
    },
    twoFactorEnabled: false
  });

  // Form states
  const [editForm, setEditForm] = useState({});
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

  // Handle URL section parameter for deep linking
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const section = searchParams.get('section');
    if (section && ['personal', 'account', 'security', 'login-history'].includes(section)) {
      setActiveSection(section);
    }
  }, [location.search]);

  // Calculate profile completion percentage
  const calculateProfileCompletion = () => {
    const fields = ['username', 'email', 'phone', 'gender', 'dateOfBirth', 'bio'];
    const completedFields = fields.filter(field => userData[field] && userData[field].trim() !== '');
    return Math.round((completedFields.length / fields.length) * 100);
  };


  // Fetch user profile data
  const fetchProfileData = useCallback(async () => {
    if (!authUser) return;

    try {
      setLoading(true);
      // First get the basic profile
      const [profile, fullProfile, balance] = await Promise.all([
        userService.getProfile(),
        userService.getFullProfile(), // This includes the referral code
        userService.getWalletBalance()
      ]);

      setWalletBalance(balance);

      // Log data for debugging
      console.group('Profile Data Fetch');
      console.log('Auth User:', authUser);
      console.log('Basic Profile:', profile);
      console.log('Full Profile:', fullProfile);
      console.groupEnd();

      // Merge both profile data sources
      const userProfileData = {
        name: fullProfile.name || profile.name || authUser?.name || '',
        username: fullProfile.username || profile.username || authUser?.username || '',
        email: fullProfile.email || profile.email || authUser?.email || '',
        phone: fullProfile.phone || profile.phone || authUser?.phone || '',
        gender: fullProfile.gender || profile.gender || '',
        dateOfBirth: fullProfile.dateOfBirth || profile.dateOfBirth || '',
        bio: fullProfile.bio || profile.bio || '',
        profileVisibility: fullProfile.profileVisibility || profile.profileVisibility || 'public',
        referralCode: fullProfile.referralCode || fullProfile.referral_code || '',
        role: fullProfile.role || profile.role || 'customer',
        county: fullProfile.county || profile.county || '',
        town: fullProfile.town || profile.town || '',
        estate: fullProfile.estate || profile.estate || '',
        houseNumber: fullProfile.houseNumber || profile.houseNumber || '',
        additionalPhone: fullProfile.additionalPhone || profile.additionalPhone || '',
        updatedAt: fullProfile.updatedAt || profile.updatedAt,
        emailVerified: fullProfile.emailVerified || profile.emailVerified,
        phoneVerified: fullProfile.phoneVerified || profile.phoneVerified
      };

      console.log('Merged Profile Data (Final):', userProfileData);

      setUserData(prev => ({
        ...prev,
        ...userProfileData
      }));

      // Fetch security data
      try {
        const security = await userService.getSecurityData();
        setSecurityData(security);
      } catch (securityError) {
        console.error('Error fetching security data:', securityError);
        // Don't show error for security data as it might not be critical
      }

    } catch (error) {
      console.error('Error fetching profile:', error);
      // Only show error if it's not a 404 (which might be expected for some endpoints)
      if (error.response?.status !== 404) {
        const data = error.response?.data
        toast.error(data?.message || 'Failed to load profile data');
      }
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  // Handle profile image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Basic validation
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    try {
      setLoading(true);
      const response = await userService.uploadProfilePicture(file);
      if (response.success) {
        toast.success('Profile picture updated!');
        fetchProfileData(); // Refresh profile data
      } else {
        toast.error(response.message || 'Failed to update profile picture');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  // Handle form field changes
  const handleInputChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      const updatedData = { ...userData, ...editForm };

      // Validate phone numbers
      if (updatedData.phone && !validateKenyanPhone(updatedData.phone)) {
        toast.error(`Primary Phone: ${PHONE_VALIDATION_ERROR}`);
        setLoading(false);
        return;
      }
      if (updatedData.additionalPhone && !validateKenyanPhone(updatedData.additionalPhone)) {
        toast.error(`Additional Phone: ${PHONE_VALIDATION_ERROR}`);
        setLoading(false);
        return;
      }

      await userService.updateProfile(updatedData);

      // Update auth context
      updateUser(updatedData);

      setUserData(updatedData);
      setEditForm({});
      setIsEditing(false);
      toast.success('Profile updated successfully');
    } catch (error) {
      const data = error.response?.data
      let msg = data?.message || 'Failed to update profile'
      
      if (data?.details?.fields) {
          msg = `Validation error for: ${data.details.fields.join(', ')}`
      } else if (data?.errors && Array.isArray(data.errors)) {
          msg = data.errors.map(e => e.message || e).join('. ')
      }
      
      toast.error(msg);
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    // Basic validation
    if (!passwordForm.currentPassword) {
      toast.error('Please enter your current password');
      return;
    }

    if (!passwordForm.newPassword) {
      toast.error('Please enter a new password');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      await userService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      toast.success('Password changed successfully');
      // Reset form on success
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      // The error message will now be more specific from the userService
      toast.error(error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  // Function to copy referral code to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Referral code copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy referral code');
    });
  };

  if (loading && !userData.username) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="animate-spin text-3xl text-blue-600 mx-auto mb-4" />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-0 md:px-4 lg:px-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium transition-colors ml-4 md:ml-0"
        >
          <FaArrowLeft className="mr-2" /> Back
        </button>
        {/* Header */}
        <div className="bg-white md:rounded-lg shadow border-0 md:border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-0.5 shadow-lg group cursor-pointer relative"
                onClick={() => document.getElementById('profile-upload').click()}
              >
                <div className="w-full h-full rounded-[14px] overflow-hidden bg-white flex items-center justify-center relative">
                  {userData?.profileImage ? (
                    <img
                      src={userData.profileImage}
                      alt={userData.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random&color=fff`;
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-blue-50 flex items-center justify-center">
                      <FaUser className="text-2xl text-blue-600/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <FaCamera className="text-white text-xl" />
                  </div>
                </div>
                <input
                  type="file"
                  id="profile-upload"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </div>
              <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Profile</h1>
                <p className="text-gray-500 text-sm font-medium mt-0.5">Manage your personal information and account settings</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Profile Completion Bar */}
              <div className="text-right">
                <div className="text-sm text-gray-600 mb-1">Profile Completion</div>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${calculateProfileCompletion()}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">{calculateProfileCompletion()}% Complete</div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white md:rounded-lg shadow border-0 md:border border-gray-100 mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: 'personal', name: 'Personal Info', icon: <FaUser className="mr-2" /> },
                { id: 'account', name: 'Account Details', icon: <FaIdCard className="mr-2" /> },
                { id: 'security', name: 'Security', icon: <FaLock className="mr-2" /> },
                { id: 'login-history', name: 'Login History', icon: <FaClock className="mr-2" /> }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${activeSection === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  {tab.icon}
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <AccountStats userData={userData} walletBalance={walletBalance} />

        {/* Personal Info Section */}
        {activeSection === 'personal' && (
          <div className="bg-white md:rounded-lg shadow border-0 md:border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
                <button
                  onClick={() => {
                    if (isEditing) {
                      setIsEditing(false);
                      setEditForm({});
                    } else {
                      setEditForm(userData);
                      setIsEditing(true);
                    }
                  }}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {isEditing ? <FaTimes className="mr-2" /> : <FaEdit className="mr-2" />}
                  {isEditing ? 'Cancel' : 'Edit Profile'}
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{userData.name || userData.username || 'Not set'}</p>
                  )}
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  {isEditing ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={editForm.username || ''}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter your public username"
                      />
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <FaInfoCircle /> Public identity used for reviews and forums.
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-900 py-2">{userData.username || 'Not set'}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editForm.email || ''}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your email"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{userData.email}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editForm.phone || ''}
                      onInput={(e) => e.target.value = formatKenyanPhoneInput(e.target.value)}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 0712345678, 0123456789, or +254712345678"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{userData.phone || 'Not set'}</p>
                  )}
                </div>

                {/* Additional Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Phone
                  </label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editForm.additionalPhone || ''}
                      onInput={(e) => e.target.value = formatKenyanPhoneInput(e.target.value)}
                      onChange={(e) => handleInputChange('additionalPhone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 0712345678, 0123456789, or +254712345678"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{userData.additionalPhone || 'Not set'}</p>
                  )}
                </div>

                {/* County */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    County
                  </label>
                  {isEditing ? (
                    <select
                      value={editForm.county || ''}
                      onChange={(e) => handleInputChange('county', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select County</option>
                      {[
                        'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay',
                        'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii',
                        'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera',
                        'Marsabit', 'Meru', 'Migori', 'Mombasa', 'Murang\'a', 'Nairobi City', 'Nakuru',
                        'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta',
                        'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga',
                        'Wajir', 'West Pokot'
                      ].map(county => (
                        <option key={county} value={county}>{county}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-900 py-2">{userData.county || 'Not set'}</p>
                  )}
                </div>

                {/* Town */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Town/City/Institution
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.town || ''}
                      onChange={(e) => handleInputChange('town', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter town, city, or institution name"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{userData.town || 'Not set'}</p>
                  )}
                </div>

                {/* Estate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estate/Building
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.estate || ''}
                      onChange={(e) => handleInputChange('estate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Estate or building name"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{userData.estate || 'Not set'}</p>
                  )}
                </div>

                {/* House Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    House/Door Number
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.houseNumber || ''}
                      onChange={(e) => handleInputChange('houseNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Internal door/house identity"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{userData.houseNumber || 'Not set'}</p>
                  )}
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender
                  </label>
                  {isEditing ? (
                    <select
                      value={editForm.gender || ''}
                      onChange={(e) => handleInputChange('gender', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                  ) : (
                    <p className="text-gray-900 py-2">{userData.gender || 'Not set'}</p>
                  )}
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Birth
                  </label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editForm.dateOfBirth || ''}
                      onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">
                      {userData.dateOfBirth ? new Date(userData.dateOfBirth).toLocaleDateString() : 'Not set'}
                    </p>
                  )}
                </div>

                {/* Profile Visibility */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Profile Visibility
                  </label>
                  {isEditing ? (
                    <select
                      value={editForm.profileVisibility || 'public'}
                      onChange={(e) => handleInputChange('profileVisibility', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  ) : (
                    <div className="flex items-center py-2">
                      {userData.profileVisibility === 'public' ? (
                        <FaGlobe className="text-green-600 mr-2" />
                      ) : (
                        <FaUserSecret className="text-gray-600 mr-2" />
                      )}
                      <span className="text-gray-900 capitalize">{userData.profileVisibility}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bio */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  About / Bio
                </label>
                {isEditing ? (
                  <textarea
                    value={editForm.bio || ''}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Tell us about yourself..."
                  />
                ) : (
                  <p className="text-gray-900 py-2 min-h-[2rem]">
                    {userData.bio || 'No bio provided'}
                  </p>
                )}
              </div>

              {/* Save Button */}
              {isEditing && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={loading}
                    className="flex items-center px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading ? (
                      <FaSpinner className="animate-spin mr-2" />
                    ) : (
                      <FaSave className="mr-2" />
                    )}
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Account Details Section */}
        {activeSection === 'account' && (
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                        <FaIdCard className="text-xl" />
                      </div>
                      <div>
                        <span className="text-lg font-black text-gray-900 capitalize tracking-tight">
                          {userData.role}
                        </span>
                        <p className="text-xs text-blue-600 font-bold">Authenticated Member</p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-100">
                      Active
                    </div>
                  </div>
                </div>

                {/* Marketing Dashboard Card - Only for marketers/admins */}
                {['marketer', 'marketing', 'admin', 'superadmin', 'super_admin'].includes(userData.role) && (
                  <div
                    onClick={() => navigate('/marketing')}
                    className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group cursor-pointer"
                  >
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                      Marketing
                    </label>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200 group-hover:scale-110 transition-transform">
                          <FaBullhorn className="text-xl" />
                        </div>
                        <div>
                          <span className="text-lg font-black text-gray-900 capitalize tracking-tight">
                            Dashboard
                          </span>
                          <p className="text-xs text-blue-600 font-bold">Access Tools</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Last Update Card */}
                <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                    Security Snapshot
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-100 group-hover:scale-110 transition-transform">
                      <FaClock className="text-xl" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Last Profile Sync</p>
                      <span className="text-lg font-black text-gray-900 tracking-tight">
                        {userData.updatedAt ? new Date(userData.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Initial State'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Verification Status Card */}
                <div
                  onClick={() => navigate('/customer/account-verification')}
                  className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group cursor-pointer"
                >
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                    Verification Status
                  </label>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform ${userData.isVerified ? 'bg-green-600 shadow-green-200' : 'bg-yellow-500 shadow-yellow-200'}`}>
                        <FaShieldAlt className="text-xl" />
                      </div>
                      <div>
                        <span className="text-lg font-black text-gray-900 capitalize tracking-tight">
                          {userData.isVerified ? 'Verified' : 'Unverified'}
                        </span>
                        <p className="text-xs text-blue-600 font-bold">Click to manage</p>
                      </div>
                    </div>
                    {!userData.isVerified && (
                      <div className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-100">
                        Action Required
                      </div>
                    )}
                  </div>
                </div>

                {/* Referral Code Section */}
                <div className="lg:col-span-2">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl text-white shadow-2xl shadow-blue-200 relative overflow-hidden group">
                    {/* Background Detail */}
                    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>

                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                      <div className="max-w-md">
                        <h3 className="text-2xl font-black mb-2 flex items-center gap-2">
                          <FaLink className="text-blue-200" />
                          Referral Rewards
                        </h3>
                        <p className="text-blue-100 text-sm leading-relaxed">
                          Invite your friends to Comrades360! When they join using your unique code, you both unlock exclusive community benefits.
                        </p>
                      </div>

                      <div className="w-full md:w-auto flex flex-col items-center gap-4">
                        <div className="w-full md:w-64 px-6 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl flex flex-col items-center">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 mb-1">Your Unique Code</label>
                          <span className="text-3xl font-black tracking-widest font-mono">
                            {userData.referralCode || 'NOT_GEN'}
                          </span>
                        </div>

                        {userData.referralCode && (
                          <button
                            onClick={() => copyToClipboard(userData.referralCode)}
                            className="w-full md:w-auto px-8 py-3 bg-white text-blue-700 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-50 transition-all flex items-center justify-center gap-2 shadow-xl hover:scale-105 active:scale-95"
                          >
                            <FaCopy className="text-lg" />
                            Copy Code
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security Section */}
        {activeSection === 'security' && (
          <div className="bg-white md:rounded-lg shadow border-0 md:border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Account Security</h2>
            </div>

            <div className="p-6">
              {/* Change Password */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.current ? 'text' : 'password'}
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPasswords.current ? <FaEyeSlash className="text-gray-400" /> : <FaEye className="text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.new ? 'text' : 'password'}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPasswords.new ? <FaEyeSlash className="text-gray-400" /> : <FaEye className="text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.confirm ? 'text' : 'password'}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPasswords.confirm ? <FaEyeSlash className="text-gray-400" /> : <FaEye className="text-gray-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={handleChangePassword}
                    disabled={loading}
                    className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {loading ? <FaSpinner className="animate-spin mr-2" /> : <FaLock className="mr-2" />}
                    Change Password
                  </button>
                </div>
              </div>

              {/* Two-Factor Authentication */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Two-Factor Authentication</h3>
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
                  <div className="flex items-center">
                    <FaShieldAlt className="text-green-600 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">2FA Status</p>
                      <p className="text-sm text-gray-600">
                        {securityData.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    {securityData.twoFactorEnabled ? 'Manage' : 'Enable'} 2FA
                  </button>
                </div>
              </div>

              {/* Social Login */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Social Login</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
                    <div className="flex items-center">
                      <FaGoogle className="text-red-600 mr-3" />
                      <div>
                        <p className="font-medium text-gray-900">Google</p>
                        <p className="text-sm text-gray-600">
                          {securityData.socialLogins.google ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <button className={`px-4 py-2 rounded-md ${securityData.socialLogins.google
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-red-600 text-white hover:bg-red-700'
                      }`}>
                      {securityData.socialLogins.google ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
                    <div className="flex items-center">
                      <FaFacebook className="text-blue-600 mr-3" />
                      <div>
                        <p className="font-medium text-gray-900">Facebook</p>
                        <p className="text-sm text-gray-600">
                          {securityData.socialLogins.facebook ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <button className={`px-4 py-2 rounded-md ${securityData.socialLogins.facebook
                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}>
                      {securityData.socialLogins.facebook ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Login History Section */}
        {activeSection === 'login-history' && (
          <div className="bg-white md:rounded-lg shadow border-0 md:border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Login History & Active Sessions</h2>
            </div>

            <div className="p-6">
              {/* Last Password Change */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Password Security</h3>
                <div className="p-4 border border-gray-200 rounded-md">
                  <div className="flex items-center">
                    <FaClock className="text-blue-600 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">Last Password Change</p>
                      <p className="text-sm text-gray-600">
                        {securityData.lastPasswordChange
                          ? new Date(securityData.lastPasswordChange).toLocaleString()
                          : 'Never changed'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Sessions */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Active Sessions</h3>
                <div className="space-y-3">
                  {securityData.activeSessions.length > 0 ? (
                    securityData.activeSessions.map((session, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
                        <div className="flex items-center">
                          {session.device === 'mobile' ? (
                            <FaMobile className="text-gray-600 mr-3" />
                          ) : (
                            <FaDesktop className="text-gray-600 mr-3" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{session.device || 'Unknown Device'}</p>
                            <p className="text-sm text-gray-600">
                              {session.location || 'Unknown location'} • {session.browser || 'Unknown browser'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {session.lastActive ? new Date(session.lastActive).toLocaleString() : 'Unknown time'}
                            </p>
                          </div>
                        </div>
                        <button className="px-3 py-1 text-red-600 hover:bg-red-50 rounded">
                          Sign Out
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4">No active sessions found</p>
                  )}
                </div>
              </div>

              {/* Login History */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Login History (Last 5)</h3>
                <div className="space-y-3">
                  {securityData.loginHistory.length > 0 ? (
                    securityData.loginHistory.slice(0, 5).map((login, index) => (
                      <div key={index} className="flex items-center p-4 border border-gray-200 rounded-md">
                        <div className={`w-3 h-3 rounded-full mr-3 ${login.success ? 'bg-green-500' : 'bg-red-500'
                          }`}></div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {login.success ? 'Successful Login' : 'Failed Login Attempt'}
                          </p>
                          <p className="text-sm text-gray-600">
                            {login.location || 'Unknown location'} • {login.browser || 'Unknown browser'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {login.timestamp ? new Date(login.timestamp).toLocaleString() : 'Unknown time'}
                          </p>
                        </div>
                        <div className="text-right">
                          {login.success ? (
                            <FaCheckCircle className="text-green-600" />
                          ) : (
                            <FaExclamationTriangle className="text-red-600" />
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4">No login history available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;