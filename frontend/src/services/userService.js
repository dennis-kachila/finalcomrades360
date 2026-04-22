import api from './api';

const userService = {
  // Get current user profile (basic info)
  getProfile: async () => {
    try {
      const response = await api.get('/users/me');
      return response.data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  },

  // Get complete user profile including referral code and additional data
  getFullProfile: async () => {
    try {
      const response = await api.get('/users/me/full');
      return response.data;
    } catch (error) {
      console.error('Error fetching full user profile:', error);
      // If the full profile endpoint fails, try to get basic profile as fallback
      if (error.response?.status === 404) {
        return userService.getProfile();
      }
      throw error;
    }
  },

  // Update user profile
  updateProfile: async (userData) => {
    try {
      const response = await api.put('/users/me', userData);
      return response.data;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  },

  // Change password
  changePassword: async (currentPassword, newPassword) => {
    try {
      const response = await api.post('/users/me/change-password', {
        currentPassword,
        newPassword
      });
      return response.data;
    } catch (error) {
      console.error('Error changing password:', error);
      // Extract and throw a more user-friendly error message
      const errorMessage = error.response?.data?.message || 'Failed to change password';
      throw new Error(errorMessage);
    }
  },

  // Request email change
  requestEmailChange: async (newEmail) => {
    try {
      const response = await api.post('/users/me/email-change/request', { newEmail });
      return response.data;
    } catch (error) {
      console.error('Error requesting email change:', error);
      throw error;
    }
  },

  // Confirm email change
  confirmEmailChange: async (token) => {
    try {
      const response = await api.post('/users/me/email-change/confirm', { token });
      return response.data;
    } catch (error) {
      console.error('Error confirming email change:', error);
      throw error;
    }
  },

  // Request phone OTP
  requestPhoneOtp: async (newPhone) => {
    try {
      const response = await api.post('/users/me/phone-otp/request', { newPhone });
      return response.data;
    } catch (error) {
      console.error('Error requesting phone OTP:', error);
      throw error;
    }
  },

  // Verify phone OTP
  verifyPhoneOtp: async (otp) => {
    try {
      const response = await api.post('/users/me/phone-otp/confirm', { otp });
      return response.data;
    } catch (error) {
      console.error('Error verifying phone OTP:', error);
      throw error;
    }
  },

  // Get wallet balance
  getWalletBalance: async () => {
    try {
      const response = await api.get('/wallet');
      return response.data.balance;
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      throw error;
    }
  },

  // Get transactions
  getTransactions: async () => {
    try {
      const response = await api.get('/wallet/transactions');
      return response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  },

  // Get notifications
  getNotifications: async () => {
    try {
      const response = await api.get('/notifications');
      return response.data;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  },

  // Update notification settings
  updateNotificationSettings: async (settings) => {
    try {
      const response = await api.put('/users/notification-settings', settings);
      return response.data;
    } catch (error) {
      console.error('Error updating notification settings:', error);
      throw error;
    }
  },

  // Submit support ticket
  submitSupportTicket: async (ticketData) => {
    try {
      const response = await api.post('/support/tickets', ticketData);
      return response.data;
    } catch (error) {
      console.error('Error submitting support ticket:', error);
      throw error;
    }
  },

  // Request account deletion
  requestAccountDeletion: async (reason) => {
    try {
      const response = await api.post('/users/request-deletion', { reason });
      return response.data;
    } catch (error) {
      console.error('Error requesting account deletion:', error);
      throw error;
    }
  },

  // Role Application Methods
  getRoleApplications: async () => {
    try {
      const response = await api.get('/role-applications');
      return response.data;
    } catch (error) {
      console.error('Error fetching role applications:', error);
      throw error;
    }
  },

  applyForRole: async (role, applicationData) => {
    try {
      const response = await api.post('/role-applications', {
        role,
        ...applicationData
      });
      return response.data;
    } catch (error) {
      console.error('Error applying for role:', error);
      throw error;
    }
  },

  getRoleApplicationStatus: async (applicationId) => {
    try {
      const response = await api.get(`/role-applications/${applicationId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching application status:', error);
      throw error;
    }
  },

  cancelRoleApplication: async (applicationId) => {
    try {
      const response = await api.delete(`/role-applications/${applicationId}`);
      return response.data;
    } catch (error) {
      console.error('Error canceling application:', error);
      throw error;
    }
  },

  // Update user address (for checkout)
  updateAddress: async (addressData) => {
    try {
      const response = await api.put('/users/address', addressData);
      return response.data;
    } catch (error) {
      console.error('Error updating address:', error);
      throw error;
    }
  },

  // Security methods for Profile page
  getSecurityData: async () => {
    try {
      const response = await api.get('/users/security');
      return response.data;
    } catch (error) {
      console.error('Error fetching security data:', error);
      throw error;
    }
  },

  getLoginHistory: async () => {
    try {
      const response = await api.get('/users/login-history');
      return response.data;
    } catch (error) {
      console.error('Error fetching login history:', error);
      throw error;
    }
  },

  getActiveSessions: async () => {
    try {
      const response = await api.get('/users/active-sessions');
      return response.data;
    } catch (error) {
      console.error('Error fetching active sessions:', error);
      throw error;
    }
  },

  // Security actions
  terminateSession: async (sessionId) => {
    try {
      const response = await api.delete(`/users/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error('Error terminating session:', error);
      throw error;
    }
  },

  toggleTwoFactor: async (enabled) => {
    try {
      const response = await api.post('/users/2fa/toggle', { enabled });
      return response.data;
    } catch (error) {
      console.error('Error toggling 2FA:', error);
      throw error;
    }
  },

  connectSocialAccount: async (provider) => {
    try {
      const response = await api.post('/users/social/connect', { provider });
      return response.data;
    } catch (error) {
      console.error('Error connecting social account:', error);
      throw error;
    }
  },

  disconnectSocialAccount: async (provider) => {
    try {
      const response = await api.delete(`/users/social/${provider}`);
      return response.data;
    } catch (error) {
      console.error('Error disconnecting social account:', error);
      throw error;
    }
  },

  // Upload profile picture
  uploadProfilePicture: async (file) => {
    try {
      const formData = new FormData();
      formData.append('profileImage', file);
      const response = await api.patch('/users/me', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      throw error;
    }
  }
};

export default userService;
