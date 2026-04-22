import api from './api';

export const twoFactorAuthService = {
  // Generate 2FA secret and get QR code
  generate2FASecret: async () => {
    try {
      const response = await api.post('/api/2fa/setup');
      return response.data;
    } catch (error) {
      console.error('Error generating 2FA secret:', error);
      throw error.response?.data || { message: 'Failed to generate 2FA setup' };
    }
  },

  // Verify 2FA setup with token
  verify2FASetup: async (token) => {
    try {
      const response = await api.post('/api/2fa/verify', { token });
      return response.data;
    } catch (error) {
      console.error('Error verifying 2FA setup:', error);
      throw error.response?.data || { message: 'Failed to verify 2FA setup' };
    }
  },

  // Disable 2FA
  disable2FA: async () => {
    try {
      const response = await api.post('/api/2fa/disable');
      return response.data;
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      throw error.response?.data || { message: 'Failed to disable 2FA' };
    }
  },

  // Generate new recovery codes
  generateNewRecoveryCodes: async () => {
    try {
      const response = await api.post('/api/2fa/recovery-codes');
      return response.data;
    } catch (error) {
      console.error('Error generating recovery codes:', error);
      throw error.response?.data || { message: 'Failed to generate recovery codes' };
    }
  },

  // Verify 2FA token (for login)
  verify2FAToken: async (token) => {
    try {
      const response = await api.post('/api/2fa/verify-token', { token });
      return response.data;
    } catch (error) {
      console.error('Error verifying 2FA token:', error);
      throw error.response?.data || { message: 'Failed to verify 2FA token' };
    }
  }
};

export default twoFactorAuthService;
