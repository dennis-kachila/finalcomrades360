const axios = require('axios');
const crypto = require('crypto');

// M-Pesa API Configuration with enhanced validation
console.log('DEBUG: MPESA_CONSUMER_KEY from env:', process.env.MPESA_CONSUMER_KEY);
const MPESA_CONFIG = {
  baseUrl: process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke',
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  shortcode: process.env.MPESA_SHORTCODE || '174379', // Default sandbox shortcode
  passkey: process.env.MPESA_PASSKEY,
  callbackUrl: process.env.MPESA_CALLBACK_URL || `${process.env.FRONTEND_URL || 'https://comrades360.shop'}/api/payments/mpesa/callback`,
  accountReference: process.env.MPESA_ACCOUNT_REFERENCE || 'Comrades360',
  transactionDesc: 'Comrades360 Order Payment',
  // Enhanced configuration
  timeout: parseInt(process.env.MPESA_REQUEST_TIMEOUT) || 30000, // 30 seconds
  maxRetries: parseInt(process.env.MPESA_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.MPESA_RETRY_DELAY) || 2000, // 2 seconds
  stkPushTimeout: parseInt(process.env.MPESA_STK_PUSH_TIMEOUT) || 60000, // 1 minute
  queryTimeout: parseInt(process.env.MPESA_QUERY_TIMEOUT) || 30000, // 30 seconds
  mockMode: process.env.MPESA_MOCK_MODE === 'true'
};

// Validate required configuration (skip validation for placeholder values in development)
const validateConfig = () => {
  const required = ['consumerKey', 'consumerSecret', 'shortcode', 'passkey'];
  const missing = required.filter(key => !MPESA_CONFIG[key]);

  // Allow placeholder values in development/staging
  const hasPlaceholders = required.some(key =>
    MPESA_CONFIG[key] && (
      MPESA_CONFIG[key].includes('your_') ||
      MPESA_CONFIG[key].includes('_here')
    )
  );

  // If mock mode is enabled OR keys are missing/placeholders, switch to mock mode silently
  if (MPESA_CONFIG.mockMode) {
    console.log('ℹ️ M-Pesa MOCK MODE explicitly enabled via environment variable');
    return;
  }

  if (missing.length > 0 || hasPlaceholders) {
    console.log('⚠️ M-Pesa keys missing or using placeholder configuration - switching to MOCK MODE');
    MPESA_CONFIG.mockMode = true;
    return;
  }

  console.log('✅ M-Pesa configuration validated successfully');
};

// Initialize configuration validation
validateConfig();

class MpesaService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Sync configuration from database
  async syncConfig() {
    try {
      // Lazy load model to avoid circular dependency
      const { PlatformConfig } = require('../../models');
      const configRecord = await PlatformConfig.findOne({ where: { key: 'mpesa_config' } });
      if (configRecord) {
        const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
        
        // Merge into MPESA_CONFIG
        if (dbConfig.consumerKey) MPESA_CONFIG.consumerKey = dbConfig.consumerKey;
        if (dbConfig.consumerSecret) MPESA_CONFIG.consumerSecret = dbConfig.consumerSecret;
        if (dbConfig.shortcode) MPESA_CONFIG.shortcode = dbConfig.shortcode;
        if (dbConfig.passkey) MPESA_CONFIG.passkey = dbConfig.passkey;
        if (dbConfig.stkTimeout) MPESA_CONFIG.stkPushTimeout = dbConfig.stkTimeout * 1000;
        if (typeof dbConfig.mockMode === 'boolean') MPESA_CONFIG.mockMode = dbConfig.mockMode;
        
        console.log('✅ M-Pesa config synced from database');
      }
    } catch (err) {
      console.warn('⚠️  Could not sync M-Pesa config from DB, using fallback defaults:', err.message);
    }
  }

  // Generate M-Pesa access token with retry logic
  async getAccessToken(forceRefresh = false) {
    try {
      // Sync config before every fresh token request or if forced
      await this.syncConfig();

      // Check if we have a valid cached token
      if (!forceRefresh && this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }


      // Return mock token in mock mode
      if (MPESA_CONFIG.mockMode) {
        console.log('ℹ️ M-Pesa Mock Mode: Providing mock access token');
        this.accessToken = 'mock_access_token_' + Date.now();
        this.tokenExpiry = Date.now() + 3540 * 1000; // 59 minutes
        return this.accessToken;
      }

      const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');

      console.log('🔄 Requesting new M-Pesa access token...');

      const response = await axios.get(`${MPESA_CONFIG.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: MPESA_CONFIG.timeout
      });

      if (!response.data.access_token) {
        throw new Error('Invalid access token response from M-Pesa');
      }

      this.accessToken = response.data.access_token;
      // Token expires in 3599 seconds (1 hour - some buffer)
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

      console.log('✅ M-Pesa access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to get M-Pesa access token:', error.response?.data || error.message);

      // If it's a network error and we have retries left, try again
      if (!forceRefresh && error.code === 'ECONNREFUSED' && MPESA_CONFIG.maxRetries > 0) {
        console.log(`🔄 Retrying access token request (${MPESA_CONFIG.maxRetries} attempts left)...`);
        await new Promise(resolve => setTimeout(resolve, MPESA_CONFIG.retryDelay));
        return this.getAccessToken(true);
      }

      throw new Error(`Failed to authenticate with M-Pesa: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  // Generate password for STK Push
  generatePassword() {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const passwordString = `${MPESA_CONFIG.shortcode}${MPESA_CONFIG.passkey}${timestamp}`;
    return {
      password: Buffer.from(passwordString).toString('base64'),
      timestamp
    };
  }

  // Format phone number to 254XXXXXXXXX (M-Pesa format)
  formatPhoneNumber(phoneNumber) {
    // Basic cleaning first
    let cleaned = String(phoneNumber).replace(/[\s\-\(\)]/g, '');

    // Use the comprehensive regex from validators (inline or logic replication)
    // We want 254xxxxxxxxx (12 digits)

    // 1. If starts with 0 (07... or 01...), remove 0 and add 254
    if (/^0[17]\d{8}$/.test(cleaned)) {
      return '254' + cleaned.slice(1);
    }

    // 2. If starts with +254, remove +
    if (/^\+254\d{9}$/.test(cleaned)) {
      return cleaned.slice(1);
    }

    // 3. If starts with 254 and length 12, keep it
    if (/^254\d{9}$/.test(cleaned)) {
      return cleaned;
    }

    // 4. Fallback/Original behavior: Strip non-digits
    cleaned = cleaned.replace(/\D/g, '');
    if (cleaned.startsWith('0')) return '254' + cleaned.slice(1);
    if (cleaned.startsWith('254')) return cleaned;
    if (cleaned.length === 9) return '254' + cleaned;

    return cleaned;
  }

  // Initiate STK Push with enhanced error handling and retry logic
  async initiateSTKPush(phoneNumber, amount, orderNumber, accountReference = null, retryCount = 0) {
    try {
      // Validate inputs
      if (!phoneNumber || !amount || !orderNumber) {
        throw new Error('Missing required parameters: phoneNumber, amount, orderNumber');
      }

      if (amount <= 0 || amount > 150000) { // M-Pesa limits
        throw new Error('Invalid amount: must be between 1 and 150,000 KES');
      }

      const accessToken = await this.getAccessToken();
      const { password, timestamp } = this.generatePassword();
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      // Validate phone number format
      if (!formattedPhone || formattedPhone.length !== 12 || !formattedPhone.startsWith('254')) {
        throw new Error('Invalid phone number format');
      }

      const stkPushData = {
        BusinessShortCode: MPESA_CONFIG.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount), // Ensure integer
        PartyA: formattedPhone,
        PartyB: MPESA_CONFIG.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: MPESA_CONFIG.callbackUrl,
        AccountReference: accountReference || `${MPESA_CONFIG.accountReference}-${orderNumber}`,
        TransactionDesc: `${MPESA_CONFIG.transactionDesc} - ${orderNumber}`
      };

      console.log(`📱 Initiating M-Pesa STK Push (attempt ${retryCount + 1}):`, {
        phoneNumber: formattedPhone,
        amount: stkPushData.Amount,
        orderNumber,
        accountReference: stkPushData.AccountReference
      });

      // Mock response in mock mode
      if (MPESA_CONFIG.mockMode) {
        console.log('ℹ️ M-Pesa Mock Mode: Simulating successful STK Push initiation');
        // Wait a tiny bit to simulate network
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          success: true,
          merchantRequestId: `MOCK-MR-${Date.now()}`,
          checkoutRequestId: `MOCK-CR-${Date.now()}`,
          responseCode: '0',
          responseDescription: 'Success. Request accepted for processing',
          customerMessage: 'Success. Request accepted for processing',
          attemptNumber: retryCount + 1,
          isMock: true
        };
      }

      const response = await axios.post(
        `${MPESA_CONFIG.baseUrl}/mpesa/stkpush/v1/processrequest`,
        stkPushData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: MPESA_CONFIG.stkPushTimeout
        }
      );

      // Validate response
      if (!response.data.ResponseCode) {
        throw new Error('Invalid STK Push response: missing ResponseCode');
      }

      // Check for specific error codes that might benefit from retry
      const retryableErrors = ['1', '25', '99']; // Network errors, etc.
      if (retryableErrors.includes(response.data.ResponseCode) && retryCount < MPESA_CONFIG.maxRetries) {
        console.log(`🔄 STK Push failed with retryable error ${response.data.ResponseCode}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, MPESA_CONFIG.retryDelay * (retryCount + 1)));
        return this.initiateSTKPush(phoneNumber, amount, orderNumber, accountReference, retryCount + 1);
      }

      // Check for success
      if (response.data.ResponseCode === '0') {
        console.log('✅ M-Pesa STK Push initiated successfully');
        return {
          success: true,
          merchantRequestId: response.data.MerchantRequestID,
          checkoutRequestId: response.data.CheckoutRequestID,
          responseCode: response.data.ResponseCode,
          responseDescription: response.data.ResponseDescription,
          customerMessage: response.data.CustomerMessage,
          attemptNumber: retryCount + 1
        };
      } else {
        // Non-retryable error
        console.error(`❌ M-Pesa STK Push failed with response code ${response.data.ResponseCode}`);
        return {
          success: false,
          error: response.data.ResponseDescription || 'STK Push request failed',
          responseCode: response.data.ResponseCode,
          attemptNumber: retryCount + 1
        };
      }

    } catch (error) {
      console.error(`❌ M-Pesa STK Push failed (attempt ${retryCount + 1}):`, error.response?.data || error.message);

      // Retry on network errors
      if (retryCount < MPESA_CONFIG.maxRetries && (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.response?.status >= 500
      )) {
        console.log(`🔄 Retrying STK Push due to network error...`);
        await new Promise(resolve => setTimeout(resolve, MPESA_CONFIG.retryDelay * (retryCount + 1)));
        return this.initiateSTKPush(phoneNumber, amount, orderNumber, accountReference, retryCount + 1);
      }

      return {
        success: false,
        error: error.response?.data?.errorMessage || error.response?.data?.ResponseDescription || error.message,
        responseCode: error.response?.data?.ResponseCode,
        attemptNumber: retryCount + 1
      };
    }
  }

  // Query STK Push status with enhanced error handling
  async querySTKPushStatus(checkoutRequestId, retryCount = 0) {
    try {
      if (!checkoutRequestId) {
        throw new Error('CheckoutRequestID is required');
      }

      const accessToken = await this.getAccessToken();
      const { password, timestamp } = this.generatePassword();

      console.log(`🔍 Querying M-Pesa STK Push status (attempt ${retryCount + 1}):`, checkoutRequestId);

      // Mock response in mock mode
      if (MPESA_CONFIG.mockMode && String(checkoutRequestId).startsWith('MOCK-CR-')) {
        console.log('ℹ️ M-Pesa Mock Mode: Simulating successful status query');
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          success: true,
          responseCode: '0',
          responseDescription: 'Success',
          merchantRequestId: `MOCK-MR-${Date.now()}`,
          checkoutRequestId: checkoutRequestId,
          resultCode: '0',
          resultDesc: 'The service was accepted successfully',
          attemptNumber: retryCount + 1,
          isMock: true
        };
      }

      const queryData = {
        BusinessShortCode: MPESA_CONFIG.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };

      const response = await axios.post(
        `${MPESA_CONFIG.baseUrl}/mpesa/stkpushquery/v1/query`,
        queryData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: MPESA_CONFIG.queryTimeout
        }
      );

      // Validate response
      if (!response.data.ResponseCode) {
        throw new Error('Invalid query response: missing ResponseCode');
      }

      // Check for success
      if (response.data.ResponseCode === '0') {
        console.log('✅ M-Pesa STK Push query successful');
        return {
          success: true,
          responseCode: response.data.ResponseCode,
          responseDescription: response.data.ResponseDescription,
          merchantRequestId: response.data.MerchantRequestID,
          checkoutRequestId: response.data.CheckoutRequestID,
          resultCode: response.data.ResultCode,
          resultDesc: response.data.ResultDesc,
          attemptNumber: retryCount + 1
        };
      } else {
        // Handle specific error codes
        const errorMessage = response.data.ResponseDescription || 'Query failed';
        console.error(`❌ M-Pesa STK Push query failed: ${errorMessage}`);

        // Some errors might be retryable
        const retryableErrors = ['1', '25', '99'];
        if (retryableErrors.includes(response.data.ResponseCode) && retryCount < MPESA_CONFIG.maxRetries) {
          console.log(`🔄 Retrying STK Push query due to error ${response.data.ResponseCode}...`);
          await new Promise(resolve => setTimeout(resolve, MPESA_CONFIG.retryDelay * (retryCount + 1)));
          return this.querySTKPushStatus(checkoutRequestId, retryCount + 1);
        }

        return {
          success: false,
          error: errorMessage,
          responseCode: response.data.ResponseCode,
          attemptNumber: retryCount + 1
        };
      }

    } catch (error) {
      console.error(`❌ M-Pesa STK Query failed (attempt ${retryCount + 1}):`, error.response?.data || error.message);

      // Retry on network errors
      if (retryCount < MPESA_CONFIG.maxRetries && (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.response?.status >= 500
      )) {
        console.log(`🔄 Retrying STK Push query due to network error...`);
        await new Promise(resolve => setTimeout(resolve, MPESA_CONFIG.retryDelay * (retryCount + 1)));
        return this.querySTKPushStatus(checkoutRequestId, retryCount + 1);
      }

      return {
        success: false,
        error: error.response?.data?.errorMessage || error.response?.data?.ResponseDescription || error.message,
        responseCode: error.response?.data?.ResponseCode,
        attemptNumber: retryCount + 1
      };
    }
  }

  // Validate callback data with enhanced security
  validateCallback(callbackData) {
    try {
      // Basic structure validation
      if (!callbackData ||
        !callbackData.Body ||
        !callbackData.Body.stkCallback ||
        !callbackData.Body.stkCallback.CheckoutRequestID) {
        console.error('Invalid callback structure');
        return false;
      }

      const stkCallback = callbackData.Body.stkCallback;

      // Validate required fields
      if (!stkCallback.MerchantRequestID || !stkCallback.CheckoutRequestID) {
        console.error('Missing required callback fields');
        return false;
      }

      // Validate ResultCode is present
      if (typeof stkCallback.ResultCode !== 'number' && typeof stkCallback.ResultCode !== 'string') {
        console.error('Invalid ResultCode in callback');
        return false;
      }

      // For successful transactions, validate metadata
      if (stkCallback.ResultCode === 0) {
        if (!stkCallback.CallbackMetadata || !stkCallback.CallbackMetadata.Item) {
          console.error('Missing callback metadata for successful transaction');
          return false;
        }

        const metadata = stkCallback.CallbackMetadata.Item;
        const requiredFields = ['Amount', 'MpesaReceiptNumber', 'TransactionDate', 'PhoneNumber'];

        for (const field of requiredFields) {
          const item = metadata.find(item => item.Name === field);
          if (!item || !item.Value) {
            console.error(`Missing required metadata field: ${field}`);
            return false;
          }
        }
      }

      console.log('✅ M-Pesa callback validation successful');
      return true;

    } catch (error) {
      console.error('Error validating M-Pesa callback:', error);
      return false;
    }
  }

  // Process callback data with enhanced error handling
  processCallback(callbackData) {
    try {
      const stkCallback = callbackData.Body.stkCallback;
      const resultCode = parseInt(stkCallback.ResultCode);
      const resultDesc = stkCallback.ResultDesc || 'Unknown result';

      console.log(`🔄 Processing M-Pesa callback: ResultCode=${resultCode}, ResultDesc=${resultDesc}`);

      let transactionData = null;

      if (resultCode === 0 && stkCallback.CallbackMetadata) {
        // Successful transaction
        const metadata = stkCallback.CallbackMetadata.Item;

        transactionData = {
          amount: parseFloat(metadata.find(item => item.Name === 'Amount')?.Value || 0),
          mpesaReceiptNumber: metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value,
          transactionDate: metadata.find(item => item.Name === 'TransactionDate')?.Value,
          phoneNumber: metadata.find(item => item.Name === 'PhoneNumber')?.Value
        };

        // Validate transaction data
        if (!transactionData.mpesaReceiptNumber || transactionData.amount <= 0) {
          console.error('Invalid transaction data in successful callback');
          return null;
        }

        console.log('✅ Successful transaction processed:', {
          receipt: transactionData.mpesaReceiptNumber,
          amount: transactionData.amount
        });

      } else {
        // Failed transaction
        console.log(`❌ Transaction failed: ${resultDesc} (Code: ${resultCode})`);
      }

      return {
        checkoutRequestId: stkCallback.CheckoutRequestID,
        merchantRequestId: stkCallback.MerchantRequestID,
        resultCode,
        resultDesc,
        transactionData,
        rawCallback: callbackData,
        processedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error processing M-Pesa callback:', error);
      return null;
    }
  }

  // Get M-Pesa result code description
  getResultCodeDescription(resultCode) {
    const descriptions = {
      0: 'Success',
      1: 'Insufficient Funds',
      2: 'Less Than Minimum Transaction Value',
      3: 'More Than Maximum Transaction Value',
      4: 'Would Exceed Daily Transfer Limit',
      5: 'Would Exceed Minimum Balance',
      6: 'Unresolved Primary Party',
      7: 'Unresolved Receiver Party',
      8: 'Would Exceed Maxiumum Balance',
      11: 'Debit Account Invalid',
      12: 'Credit Account Invalid',
      13: 'Unresolved Debit Account',
      14: 'Unresolved Credit Account',
      15: 'Duplicate Detected',
      17: 'Internal Failure',
      20: 'Unresolved Initiator',
      21: 'Traffic Blocking Condition',
      22: 'Invalid Request',
      23: 'Transaction Cancelled by Customer',
      24: 'Transaction Cancelled by System',
      25: 'Invalid PIN',
      26: 'MSISDN Mismatch',
      27: 'Invalid Encryption',
      28: 'Invalid KYC Details',
      29: 'Invalid Shortcode',
      30: 'Invalid Third Party Reference',
      31: 'Invalid Syntax',
      32: 'Invalid Amount',
      33: 'Invalid KYC Details',
      34: 'Invalid Third Party Reference',
      35: 'Invalid Syntax',
      36: 'Invalid Amount',
      37: 'Invalid KYC Details',
      38: 'Invalid Third Party Reference',
      39: 'Invalid Syntax',
      40: 'Invalid Amount',
      41: 'Invalid KYC Details',
      42: 'Invalid Third Party Reference',
      43: 'Invalid Syntax',
      44: 'Invalid Amount',
      45: 'Invalid KYC Details',
      46: 'Invalid Third Party Reference',
      47: 'Invalid Syntax',
      48: 'Invalid Amount',
      49: 'Invalid KYC Details',
      50: 'Invalid Third Party Reference',
      51: 'Invalid Syntax',
      52: 'Invalid Amount',
      53: 'Invalid KYC Details',
      54: 'Invalid Third Party Reference',
      55: 'Invalid Syntax',
      56: 'Invalid Amount',
      57: 'Invalid KYC Details',
      58: 'Invalid Third Party Reference',
      59: 'Invalid Syntax',
      60: 'Invalid Amount',
      61: 'Invalid KYC Details',
      62: 'Invalid Third Party Reference',
      63: 'Invalid Syntax',
      64: 'Invalid Amount',
      65: 'Invalid KYC Details',
      66: 'Invalid Third Party Reference',
      67: 'Invalid Syntax',
      68: 'Invalid Amount',
      69: 'Invalid KYC Details',
      70: 'Invalid Third Party Reference',
      71: 'Invalid Syntax',
      72: 'Invalid Amount',
      73: 'Invalid KYC Details',
      74: 'Invalid Third Party Reference',
      75: 'Invalid Syntax',
      76: 'Invalid Amount',
      77: 'Invalid KYC Details',
      78: 'Invalid Third Party Reference',
      79: 'Invalid Syntax',
      80: 'Invalid Amount',
      81: 'Invalid KYC Details',
      82: 'Invalid Third Party Reference',
      83: 'Invalid Syntax',
      84: 'Invalid Amount',
      85: 'Invalid KYC Details',
      86: 'Invalid Third Party Reference',
      87: 'Invalid Syntax',
      88: 'Invalid Amount',
      89: 'Invalid KYC Details',
      90: 'Invalid Third Party Reference',
      91: 'Invalid Syntax',
      92: 'Invalid Amount',
      93: 'Invalid KYC Details',
      94: 'Invalid Third Party Reference',
      95: 'Invalid Syntax',
      96: 'Invalid Amount',
      97: 'Invalid KYC Details',
      98: 'Invalid Third Party Reference',
      99: 'Invalid Syntax',
      100: 'System Error'
    };

    return descriptions[resultCode] || 'Unknown Error';
  }
}

module.exports = new MpesaService();