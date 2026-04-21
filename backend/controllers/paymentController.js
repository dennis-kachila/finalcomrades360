const { sequelize, Payment, Order, User, Wallet, Commission, DeliveryTask, Transaction, Op } = require('../models');
const mpesaService = require('../scripts/services/mpesaService');
const airtelMoneyService = require('../scripts/services/airtelMoneyService');
const paymentVerificationService = require('../scripts/services/paymentVerificationService');
const { logPaymentActivity } = require('../middleware/paymentSecurity');
const { calculateCommission: createCommissionRecords } = require('./commissionController');
const { creditAgentByOrder } = require('../services/earningsService');
const { normalizeKenyanPhone } = require('../middleware/validators');

// Create payment record for an order
const createPayment = async (req, res) => {
  const { orderId, paymentMethod, paymentType, amount, phoneNumber, metadata } = req.body;
  const userId = req.user.id;

  try {
    // Validate order exists and belongs to user
    const order = await Order.findOne({
      where: { id: orderId, userId },
      include: [{ model: User, as: 'user' }]
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentConfirmed) {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    // Check if payment already exists for this order and method
    const existingPayment = await Payment.findOne({
      where: { orderId, paymentMethod, status: { [Op.ne]: 'failed' } }
    });

    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'Payment already initiated for this order' });
    }

    // Create payment record
    const payment = await Payment.create({
      orderId,
      userId,
      paymentMethod,
      paymentType: paymentType || 'prepay',
      amount: amount || order.total,
      currency: 'KES',
      status: 'pending',
      mpesaPhoneNumber: phoneNumber ? normalizeKenyanPhone(phoneNumber) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      transactionId: req.paymentSecurity?.transactionId,
      initiatedAt: new Date(),
      ipAddress: req.paymentSecurity?.ipAddress || req.ip,
      userAgent: req.paymentSecurity?.userAgent || req.get('User-Agent')
    });

    // Log payment creation
    logPaymentActivity('payment_created', {
      paymentId: payment.id,
      orderId,
      amount: payment.amount,
      paymentMethod
    }, userId, orderId);

    res.json({
      success: true,
      message: 'Payment record created',
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        status: payment.status,
        createdAt: payment.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment record' });
  }
};

// Legacy simulate endpoint kept for backward compatibility
// Allows initiating an STK push with minimal payload for older clients
const mpesaSimulate = async (req, res) => {
  try {
    const { phoneNumber, amount, orderNumber } = req.body || {};

    if (!phoneNumber || !amount || !orderNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phoneNumber, amount, orderNumber'
      });
    }

    const result = await mpesaService.initiateSTKPush(phoneNumber, amount, orderNumber);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to initiate M-Pesa payment',
        error: result.error
      });
    }

    return res.json({
      success: true,
      message: 'M-Pesa payment initiated',
      data: result
    });
  } catch (error) {
    console.error('Legacy mpesaSimulate error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Initiate M-Pesa STK Push payment with enhanced validation and error handling
const initiateMpesaPayment = async (req, res) => {
  const { orderId, phoneNumber, amount } = req.body;
  const userId = req.user.id;

  try {
    console.log(`💳 Initiating M-Pesa payment by user ${userId}`);

    // Validate inputs
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const normalizedPhone = normalizeKenyanPhone(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use 01... or 07... (10 digits) or +254... (13 digits)'
      });
    }

    let order = null;
    let paymentAmount = amount;

    const { checkoutGroupId } = req.body;
    let ordersToPay = [];

    // If checkoutGroupId is provided, handle group payment
    if (checkoutGroupId) {
      ordersToPay = await Order.findAll({
        where: { checkoutGroupId },
        include: [{ model: User, as: 'user' }]
      });

      if (ordersToPay.length > 0) {
        // Check permissions: Owner of any order OR Assigned Delivery Agent of any order
        let isAuthorized = ordersToPay.some(o => o.userId === userId || o.deliveryAgentId === userId);

        if (!isAuthorized) {
          // Fallback: Check if user is the assigned delivery agent via DeliveryTask for any order in group
          const deliveryTask = await DeliveryTask.findOne({
            where: {
              orderId: { [Op.in]: ordersToPay.map(o => o.id) },
              deliveryAgentId: userId,
              status: { [Op.ne]: 'cancelled' }
            }
          });
          if (deliveryTask) isAuthorized = true;
        }

        if (!isAuthorized) {
          return res.status(403).json({
            success: false,
            message: 'You are not authorized to make payments for this checkout group'
          });
        }

        // Check if any order already paid
        if (ordersToPay.some(o => o.paymentConfirmed)) {
          return res.status(400).json({ success: false, message: 'One or more orders in this group are already paid' });
        }

        paymentAmount = ordersToPay.reduce((sum, o) => sum + (o.total || 0), 0);
        order = ordersToPay[0]; // Use first order for metadata/tracking
      } else if (!paymentAmount) {
        // If no orders and no amount provided, then it's a 404
        return res.status(404).json({ success: false, message: 'Checkout group not found or no orders in group' });
      }
      // If no orders but paymentAmount exists, we proceed with cart-based payment (handled below)
    }
    // If orderId is provided, validate the order
    else if (orderId) {
      // Find order first without userId constraint to check permissions
      order = await Order.findByPk(orderId, {
        include: [{ model: User, as: 'user' }]
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Check permissions: Owner OR Assigned Delivery Agent
      let isAuthorized = order.userId === userId || order.deliveryAgentId === userId;

      if (!isAuthorized) {
        // Check if user is the assigned delivery agent via DeliveryTask
        const deliveryTask = await DeliveryTask.findOne({
          where: {
            orderId: order.id,
            deliveryAgentId: userId,
            status: { [Op.ne]: 'cancelled' }
          }
        });

        if (deliveryTask) {
          isAuthorized = true;
          console.log(`✅ Authorized delivery agent ${userId} for order ${orderId}`);
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to make payments for this order'
        });
      }

      if (order.paymentConfirmed) {
        console.warn(`⚠️ Blocking payment: Order ${order.id} is already confirmed as paid`);
        return res.status(400).json({
          success: false,
          message: 'Order already paid',
          orderStatus: order.status
        });
      }

      paymentAmount = order.total;
    } else {
      // For cart-based payments, we don't validate order yet
      // The amount should be provided
      if (!paymentAmount) {
        console.warn('⚠️ Blocking payment: No amount provided for cart-based payment');
        return res.status(400).json({
          success: false,
          message: 'Amount is required for cart-based payments'
        });
      }
    }

    // Check for existing active payment
    const paymentQuery = {
      paymentMethod: 'mpesa',
      status: { [Op.in]: ['pending', 'processing'] }
    };

    if (checkoutGroupId) {
      paymentQuery.checkoutGroupId = checkoutGroupId;
    } else if (orderId) {
      paymentQuery.orderId = orderId;
    } else {
      // For cart-based payments without orderId or checkoutGroupId,
      // we might want to check by userId and amount, but for now let's just skip existing check
      // or search for payments with both null (safely)
      paymentQuery.orderId = null;
      paymentQuery.checkoutGroupId = null;
    }

    const existingPayment = await Payment.findOne({ where: paymentQuery });

    if (existingPayment) {
      console.log(`⚠️ Found existing active payment ${existingPayment.id} for order ${orderId}`);

      // Check if we can reuse this payment
      const timeSinceInitiated = Date.now() - new Date(existingPayment.initiatedAt).getTime();
      const fiveMinutes = 5 * 60 * 1000;

      if (timeSinceInitiated < fiveMinutes) {
        return res.status(400).json({
          success: false,
          message: 'Payment already initiated for this order. Please wait or check payment status.',
          paymentId: existingPayment.id,
          canRetry: false
        });
      } else {
        // Mark old payment as cancelled and create new one
        await existingPayment.update({
          status: 'cancelled',
          failureReason: 'Replaced by new payment initiation',
          cancelledAt: new Date()
        });
        console.log(`🗑️ Cancelled expired payment ${existingPayment.id}`);
      }
    }

    // Create new payment record
    const payment = await Payment.create({
      orderId: orderId || null,
      checkoutGroupId: checkoutGroupId || null,
      userId,
      paymentMethod: 'mpesa',
      paymentType: 'prepay',
      amount: paymentAmount,
      currency: 'KES',
      status: 'pending',
      mpesaPhoneNumber: normalizedPhone,
      initiatedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: JSON.stringify({
        orderNumber: order?.checkoutOrderNumber || order?.orderNumber || null,
        initiationSource: checkoutGroupId ? 'group_payment' : (orderId ? 'order_payment' : 'cart_payment'),
        paymentType: checkoutGroupId ? 'group_based' : (orderId ? 'order_based' : 'cart_based'),
        ordersCount: ordersToPay.length || 1
      })
    });

    console.log(`✅ Created payment record ${payment.id} for ${checkoutGroupId ? `group ${checkoutGroupId}` : `order ${orderId}`}`);

    // Initiate STK Push
    const stkResult = await mpesaService.initiateSTKPush(
      normalizedPhone,
      paymentAmount,
      order?.checkoutOrderNumber || order?.orderNumber || `CART-${Date.now()}`
    );

    if (!stkResult.success) {
      console.error(`❌ STK Push failed for payment ${payment.id}:`, stkResult.error);

      // Update payment status to failed
      await payment.update({
        status: 'failed',
        failureReason: stkResult.error,
        metadata: JSON.stringify({
          ...payment.metadata ? JSON.parse(payment.metadata) : {},
          stkPushResponse: stkResult,
          failureTimestamp: new Date().toISOString()
        })
      });

      return res.status(400).json({
        success: false,
        message: 'Failed to initiate M-Pesa payment',
        error: stkResult.error,
        responseCode: stkResult.responseCode,
        attemptNumber: stkResult.attemptNumber
      });
    }

    console.log(`✅ STK Push initiated successfully for payment ${payment.id}`);

    // Update payment with STK Push details
    await payment.update({
      status: 'processing',
      mpesaMerchantRequestId: stkResult.merchantRequestId,
      mpesaCheckoutRequestId: stkResult.checkoutRequestId,
      metadata: JSON.stringify({
        ...payment.metadata ? JSON.parse(payment.metadata) : {},
        stkPushResponse: stkResult,
        processingStartedAt: new Date().toISOString()
      })
    });

    // Log M-Pesa payment initiation
    logPaymentActivity('mpesa_stk_initiated', {
      paymentId: payment.id,
      checkoutRequestId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId,
      phoneNumber: mpesaService.formatPhoneNumber(phoneNumber),
      amount: paymentAmount,
      attemptNumber: stkResult.attemptNumber
    }, userId, orderId || null);

    res.json({
      success: true,
      message: 'M-Pesa payment initiated successfully',
      payment: {
        id: payment.id,
        checkoutRequestId: stkResult.checkoutRequestId,
        merchantRequestId: stkResult.merchantRequestId,
        customerMessage: stkResult.customerMessage,
        status: 'processing',
        attemptNumber: stkResult.attemptNumber
      },
      instructions: {
        message: stkResult.customerMessage,
        timeout: 'Please complete the payment within 5 minutes',
        support: 'Contact support if you don\'t receive the STK push'
      }
    });

  } catch (error) {
    console.error('❌ Error initiating M-Pesa payment:', error);

    // Log the error
    logPaymentActivity('mpesa_initiation_error', {
      orderId,
      phoneNumber,
      error: error.message,
      stack: error.stack
    }, userId, orderId);

    res.status(500).json({
      success: false,
      message: 'Failed to initiate M-Pesa payment',
      error: error.message
    });
  }
};

// Initiate Airtel Money STK Push payment
const initiateAirtelMoneyPayment = async (req, res) => {
  const { orderId, phoneNumber, amount } = req.body;
  const userId = req.user.id;

  try {
    console.log(`💳 Initiating Airtel Money payment by user ${userId}`);

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const normalizedPhone = normalizeKenyanPhone(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    let paymentAmount = amount;
    let order = null;

    if (orderId) {
      order = await Order.findByPk(orderId);
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      paymentAmount = order.total;
    }

    // Create payment record
    const payment = await Payment.create({
      orderId: orderId || null,
      userId,
      paymentMethod: 'airtel_money',
      paymentType: 'prepay',
      amount: paymentAmount,
      currency: 'KES',
      status: 'pending',
      mpesaPhoneNumber: normalizedPhone, // Reusing field for consistency
      initiatedAt: new Date(),
    });

    // Initiate Airtel STK Push
    const result = await airtelMoneyService.initiateSTKPush(
      normalizedPhone,
      paymentAmount,
      order?.orderNumber || `CART-${Date.now()}`
    );

    if (!result.success) {
      await payment.update({ status: 'failed', failureReason: result.error });
      return res.status(400).json({ success: false, message: 'Failed to initiate Airtel payment', error: result.error });
    }

    await payment.update({ 
      status: 'processing',
      externalTransactionId: result.transactionId 
    });

    res.json({
      success: true,
      message: 'Airtel Money payment initiated successfully',
      payment: {
        id: payment.id,
        status: 'processing',
        transactionId: result.transactionId
      }
    });

  } catch (error) {
    console.error('❌ Error initiating Airtel payment:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate Airtel payment', error: error.message });
  }
};

// Handle Airtel Money callback
const handleAirtelCallback = async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('📞 Airtel Callback received:', JSON.stringify(callbackData, null, 2));

    const { transaction, status } = callbackData.data || {};
    const transactionId = transaction?.id;

    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'Missing transaction ID' });
    }

    const payment = await Payment.findOne({
      where: { externalTransactionId: transactionId },
      include: [{ model: Order, as: 'order' }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (status?.success) {
      await payment.update({
        status: 'completed',
        paymentDate: new Date(),
        completedAt: new Date()
      });

      if (payment.order) {
        await payment.order.update({
          paymentConfirmed: true,
          status: 'paid'
        });
      }

      // Socket update
      try {
        const { getIO } = require('../realtime/socket');
        const io = getIO();
        if (io) {
          io.to(`user:${payment.userId}`).emit('paymentStatusUpdate', {
            paymentId: payment.id,
            status: 'completed',
            orderId: payment.orderId
          });
        }
      } catch (e) {}

    } else {
      await payment.update({
        status: 'failed',
        failureReason: status?.message || 'Airtel payment failed'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error handling Airtel callback:', error);
    res.status(500).json({ success: false });
  }
};

// Handle M-Pesa callback with enhanced error handling and recovery
const handleMpesaCallback = async (req, res) => {
  let callbackData = null;

  try {
    callbackData = req.body;

    console.log('📞 M-Pesa Callback received:', JSON.stringify(callbackData, null, 2));

    // Validate callback data
    if (!mpesaService.validateCallback(callbackData)) {
      console.error('❌ Invalid M-Pesa callback data structure');
      return res.status(400).json({
        success: false,
        message: 'Invalid callback data structure',
        error: 'VALIDATION_FAILED'
      });
    }

    // Process callback
    const processedData = mpesaService.processCallback(callbackData);

    if (!processedData) {
      console.error('❌ Failed to process callback data');
      return res.status(400).json({
        success: false,
        message: 'Failed to process callback data',
        error: 'PROCESSING_FAILED'
      });
    }

    const { checkoutRequestId, resultCode, resultDesc, transactionData } = processedData;

    console.log(`🔄 Processing callback for CheckoutRequestID: ${checkoutRequestId}, ResultCode: ${resultCode}`);

    // Find payment by checkout request ID
    const payment = await Payment.findOne({
      where: { mpesaCheckoutRequestId: checkoutRequestId },
      include: [{ model: Order, as: 'order' }]
    });

    if (!payment) {
      console.error(`❌ Payment not found for checkoutRequestId: ${checkoutRequestId}`);

      // Log the orphaned callback for manual investigation
      console.warn('Orphaned M-Pesa callback:', {
        checkoutRequestId,
        resultCode,
        resultDesc,
        transactionData,
        timestamp: new Date().toISOString()
      });

      return res.status(404).json({
        success: false,
        message: 'Payment not found for this callback',
        error: 'PAYMENT_NOT_FOUND'
      });
    }

    // Check for duplicate callback processing
    const existingCallback = payment.metadata ?
      JSON.parse(payment.metadata).callbackData : null;

    if (existingCallback && existingCallback.checkoutRequestId === checkoutRequestId) {
      console.log(`⚠️ Duplicate callback detected for payment ${payment.id}, ignoring`);
      return res.status(200).json({
        success: true,
        message: 'Callback already processed',
        warning: 'DUPLICATE_CALLBACK'
      });
    }

    const t = await sequelize.transaction();

    try {
      if (resultCode === 0 && transactionData) {
        // Payment successful
        console.log(`✅ Payment ${payment.id} completed successfully`);

        await payment.update({
          status: 'completed',
          mpesaReceiptNumber: transactionData.mpesaReceiptNumber,
          mpesaTransactionId: transactionData.mpesaReceiptNumber,
          externalTransactionId: transactionData.mpesaReceiptNumber,
          paymentDate: new Date(),
          completedAt: new Date(),
          metadata: JSON.stringify({
            ...payment.metadata ? JSON.parse(payment.metadata) : {},
            callbackData: processedData,
            callbackProcessedAt: new Date().toISOString()
          })
        }, { transaction: t });

        // Update orders
        if (payment.checkoutGroupId) {
          const groupOrders = await Order.findAll({
            where: { checkoutGroupId: payment.checkoutGroupId },
            transaction: t
          });

          for (const ord of groupOrders) {
            await ord.update({
              paymentConfirmed: true,
              status: ['order_placed', 'super_admin_confirmed'].includes(ord.status) ? 'paid' : ord.status
            }, { transaction: t });

            // Create commission records for each order
            try {
              await createCommissionRecords(ord.id, ord.primaryReferralCode, ord.secondaryReferralCode, { transaction: t });
            } catch (ce) {
              console.warn(`Failed commission for order ${ord.id}:`, ce);
            }
          }
          console.log(`✅ Group orders (${groupOrders.length}) updated for group ${payment.checkoutGroupId}`);
        } else if (payment.order) {
          await payment.order.update({
            paymentConfirmed: true,
            status: ['order_placed', 'super_admin_confirmed'].includes(payment.order.status) ? 'paid' : payment.order.status
          }, { transaction: t });

          // Create commission records
          try {
            await createCommissionRecords(payment.order.id, payment.order.primaryReferralCode, payment.order.secondaryReferralCode, { transaction: t });
            
            // NEW: Credit delivery agent immediately if assigned
            await creditAgentByOrder(payment.order.id, t);
          } catch (commissionError) {
            console.warn('⚠️ Failed to create commission or credit agent:', commissionError);
          }
        }

        // Log successful payment
        logPaymentActivity('payment_completed', {
          paymentId: payment.id,
          orderId: payment.order.id,
          amount: payment.amount,
          mpesaReceiptNumber: transactionData.mpesaReceiptNumber,
          resultCode,
          resultDesc
        }, payment.userId, payment.order.id);

        // Emit real-time update
        try {
          const { getIO } = require('../realtime/socket');
          const io = getIO();
          if (io) {
            io.to(`user:${payment.userId}`).emit('paymentStatusUpdate', {
              orderId: payment.orderId,
              paymentId: payment.id,
              status: 'completed',
              amount: payment.amount,
              mpesaReceiptNumber: transactionData.mpesaReceiptNumber,
              timestamp: new Date().toISOString()
            });
            console.log(`📡 Real-time update sent to user ${payment.userId}`);
          }
        } catch (socketError) {
          console.warn('⚠️ Failed to send real-time update:', socketError);
        }

      } else {
        // Payment failed
        console.log(`❌ Payment ${payment.id} failed: ${resultDesc} (Code: ${resultCode})`);

        const failureReason = resultDesc || mpesaService.getResultCodeDescription(resultCode);

        await payment.update({
          status: 'failed',
          failureReason: failureReason,
          metadata: JSON.stringify({
            ...payment.metadata ? JSON.parse(payment.metadata) : {},
            callbackData: processedData,
            callbackProcessedAt: new Date().toISOString()
          })
        }, { transaction: t });

        // Log failed payment
        logPaymentActivity('payment_failed', {
          paymentId: payment.id,
          orderId: payment.order.id,
          amount: payment.amount,
          resultCode,
          resultDesc: failureReason
        }, payment.userId, payment.order.id);
      }

      await t.commit();

      console.log(`✅ Callback processing completed for payment ${payment.id}`);
      res.json({
        success: true,
        message: 'Callback processed successfully',
        paymentId: payment.id,
        status: payment.status
      });

    } catch (error) {
      await t.rollback();
      console.error('❌ Error processing payment callback:', error);

      // Log the error for investigation
      logPaymentActivity('callback_processing_error', {
        paymentId: payment.id,
        checkoutRequestId,
        resultCode,
        error: error.message
      }, payment.userId, payment.order.id);

      res.status(500).json({
        success: false,
        message: 'Failed to process payment callback',
        error: 'DATABASE_ERROR'
      });
    }

  } catch (error) {
    console.error('❌ Error handling M-Pesa callback:', error);

    // Log the raw callback data for debugging
    console.error('Raw callback data:', JSON.stringify(callbackData, null, 2));

    res.status(500).json({
      success: false,
      message: 'Callback processing failed',
      error: 'INTERNAL_ERROR'
    });
  }
};

// Check payment status
const checkPaymentStatus = async (req, res) => {
  const { paymentId } = req.params;
  const userId = req.user.id;

  try {
    // Find payment first without userId constraint to check permissions
    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: Order, as: 'order' }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Check permissions: Payment Owner OR Order Owner OR Assigned Delivery Agent
    let isAuthorized = payment.userId === userId;

    if (!isAuthorized && payment.order) {
      // Check if user is the order owner
      if (payment.order.userId === userId) {
        isAuthorized = true;
      }

      // Check if user is the assigned delivery agent
      if (!isAuthorized) {
        isAuthorized = payment.order.deliveryAgentId === userId;
      }

      if (!isAuthorized) {
        const deliveryTask = await DeliveryTask.findOne({
          where: {
            orderId: payment.order.id,
            deliveryAgentId: userId,
            status: { [Op.ne]: 'cancelled' }
          }
        });

        if (deliveryTask) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this payment' });
    }

    // If payment is still processing and it's M-Pesa, verify status
    if ((payment.status === 'pending' || payment.status === 'processing') && payment.paymentMethod === 'mpesa') {
      try {
        const verificationResult = await paymentVerificationService.verifyMpesaPayment(paymentId);
        console.log('Payment verification result:', verificationResult);
      } catch (verificationError) {
        console.warn('Failed to verify payment status:', verificationError);
      }
    }

    // Refresh payment data after potential verification
    await payment.reload();

    res.json({
      success: true,
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        status: payment.status,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt,
        failureReason: payment.failureReason,
        mpesaReceiptNumber: payment.mpesaReceiptNumber,
        transactionId: payment.transactionId
      }
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ success: false, message: 'Failed to check payment status' });
  }
};

// Verify payment (admin/agent function)
const verifyPayment = async (req, res) => {
  const { paymentId } = req.params;
  const { verificationData, manual } = req.body;
  const verifierUserId = req.user.id;

  try {
    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: Order, as: 'order' }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Authorization check: User must be Admin OR the assigned Delivery Agent for the order
    const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(req.user.role);
    let isAuthorized = isAdmin || payment.order?.deliveryAgentId === verifierUserId;

    if (!isAuthorized && payment.order) {
      // Check if user is the assigned delivery agent via DeliveryTask
      const deliveryTask = await DeliveryTask.findOne({
        where: {
          orderId: payment.order.id,
          deliveryAgentId: verifierUserId,
          status: { [Op.ne]: 'cancelled' }
        }
      });
      if (deliveryTask) isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized to verify this payment' });
    }

    let verificationResult;

    // Handle explicit manual verification (e.g., from agent dashboard after seeing screenshot)
    if (manual) {
      verificationResult = await paymentVerificationService.verifyManualPayment(paymentId, verifierUserId, verificationData || {});
    } 
    // Automated or specific method verification
    else if (payment.paymentMethod === 'mpesa') {
      verificationResult = await paymentVerificationService.verifyMpesaPayment(paymentId);
    } else if (payment.paymentMethod === 'bank_transfer') {
      if (!verificationData) {
        return res.status(400).json({ success: false, message: 'Verification data required for bank transfers' });
      }
      verificationResult = await paymentVerificationService.verifyBankTransfer(paymentId, verifierUserId, verificationData);
    } else {
      return res.status(400).json({ success: false, message: 'Payment method not supported for verification' });
    }

    res.json({
      success: verificationResult.verified,
      message: verificationResult.message,
      status: verificationResult.status
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
};

// Verify payment by Order ID (handles cases where no payment record exists yet)
const verifyPaymentByOrder = async (req, res) => {
  const { orderId, manual, verificationData } = req.body;
  const verifierUserId = req.user.id;

  try {
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check permissions: Admin or Assigned Agent
    const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(req.user.role);
    let isAuthorized = isAdmin || order.deliveryAgentId === verifierUserId;

    if (!isAuthorized) {
      const deliveryTask = await DeliveryTask.findOne({
        where: { orderId, deliveryAgentId: verifierUserId, status: { [Op.ne]: 'cancelled' } }
      });
      if (deliveryTask) isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized to verify payment for this order' });
    }

    // Find any existing pending/processing payment
    let payment = await Payment.findOne({
      where: { orderId, status: { [Op.in]: ['pending', 'processing'] } },
      order: [['createdAt', 'DESC']]
    });

    // If no payment exists and it's a manual confirm, create a new manual payment record
    if (!payment && manual) {
      console.log(`[Payment] Creating new manual payment record for order ${orderId}`);
      payment = await Payment.create({
        orderId,
        userId: order.userId,
        paymentMethod: 'cash_on_delivery', // Default for manual agent confirmation
        paymentType: order.paymentType || 'prepay',
        amount: order.total,
        currency: 'KES',
        status: 'pending',
        initiatedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: JSON.stringify({ isManualAtCreation: true, createdBy: verifierUserId })
      });
    }

    if (!payment) {
      return res.status(400).json({ success: false, message: 'No pending payment found to verify. Please initiate a payment or use Force Manual Confirm.' });
    }

    // Now call the service to verify this payment manually
    const result = await paymentVerificationService.verifyManualPayment(payment.id, verifierUserId, verificationData || { method: 'manual' });

    res.json({
      success: result.verified,
      message: result.message,
      status: result.status
    });

  } catch (error) {
    console.error('Error verifying order payment:', error);
    res.status(500).json({ success: false, message: 'Failed to verify order payment' });
  }
};

// Get payment verification info
const getPaymentVerificationInfo = async (req, res) => {
  const { paymentId } = req.params;

  try {
    const verificationInfo = await paymentVerificationService.getVerificationStatus(paymentId);

    res.json({
      success: true,
      verificationInfo
    });

  } catch (error) {
    console.error('Error getting verification info:', error);
    res.status(500).json({ success: false, message: 'Failed to get verification info' });
  }
};

// Get user's payments
const getUserPayments = async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10 } = req.query;

  try {
    const offset = (page - 1) * limit;

    const { count, rows } = await Payment.findAndCountAll({
      where: { userId },
      include: [{
        model: Order,
        as: 'order',
        attributes: ['id', 'orderNumber', 'status', 'total']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      payments: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Error getting user payments:', error);
    res.status(500).json({ success: false, message: 'Failed to get payments' });
  }
};

// Process refund for prepay orders
const processRefund = async (req, res) => {
  const { paymentId } = req.params;
  const { reason, amount } = req.body;
  const userId = req.user.id;

  try {
    const payment = await Payment.findOne({
      where: { id: paymentId, userId },
      include: [{ model: Order, as: 'order' }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Only completed payments can be refunded' });
    }

    if (payment.refundAmount > 0) {
      return res.status(400).json({ success: false, message: 'Payment already has a refund' });
    }

    const refundAmount = amount || payment.amount;

    if (refundAmount > payment.amount) {
      return res.status(400).json({ success: false, message: 'Refund amount cannot exceed payment amount' });
    }

    const t = await sequelize.transaction();

    try {
      // Update payment with refund info
      await payment.update({
        refundAmount: refundAmount,
        refundReason: reason,
        refundedAt: new Date(),
        status: refundAmount === payment.amount ? 'refunded' : 'partially_refunded'
      }, { transaction: t });

      // For M-Pesa refunds, you would integrate with M-Pesa B2C API
      // For bank transfers, you would process bank refund
      // For now, we'll just mark it as refunded and log the action
      console.log(`Refund processed: ${refundAmount} KES for payment ${paymentId} via ${payment.paymentMethod}`);

      // Update order status if full refund
      if (refundAmount === payment.amount) {
        await payment.order.update({
          status: 'cancelled',
          cancelReason: `Refunded: ${reason}`,
          cancelledAt: new Date(),
          cancelledBy: 'system'
        }, { transaction: t });
      }

      await t.commit();

      res.json({
        success: true,
        message: 'Refund processed successfully',
        refund: {
          amount: refundAmount,
          reason: reason,
          processedAt: new Date()
        }
      });

    } catch (error) {
      await t.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ success: false, message: 'Failed to process refund' });
  }
};

// Create bank transfer payment record
const createBankTransferPayment = async (req, res) => {
  const { orderId, bankName, accountNumber, accountName, expectedAmount } = req.body;
  const userId = req.user.id;

  try {
    // Validate order
    const order = await Order.findOne({
      where: { id: orderId, userId }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentConfirmed) {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      where: { orderId, paymentMethod: 'bank_transfer', status: { [require('sequelize').Op.ne]: 'failed' } }
    });

    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'Bank transfer payment already initiated' });
    }

    // Create payment record
    const payment = await Payment.create({
      orderId,
      userId,
      paymentMethod: 'bank_transfer',
      paymentType: 'prepay',
      amount: expectedAmount || order.total,
      currency: 'KES',
      status: 'pending',
      bankName,
      accountNumber,
      metadata: JSON.stringify({
        accountName,
        expectedAmount: expectedAmount || order.total,
        instructions: 'Please transfer the exact amount to the provided account. Include your order number in the reference.'
      }),
      initiatedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Bank transfer payment record created',
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        status: payment.status,
        bankName: payment.bankName,
        accountNumber: payment.accountNumber,
        createdAt: payment.createdAt
      },
      instructions: {
        bankName,
        accountNumber,
        accountName,
        amount: payment.amount,
        reference: `Order ${order.orderNumber}`,
        note: 'Payment will be verified within 24 hours of transfer'
      }
    });

  } catch (error) {
    console.error('Error creating bank transfer payment:', error);
    res.status(500).json({ success: false, message: 'Failed to create bank transfer payment' });
  }
};

// Create Lipa Mdogo Mdogo payment record
const createLipaMdogoMdogoPayment = async (req, res) => {
  const { orderId, phoneNumber } = req.body;
  const userId = req.user.id;

  try {
    // Validate order
    const order = await Order.findOne({
      where: { id: orderId, userId }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentConfirmed) {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      where: { orderId, paymentMethod: 'lipa_mdogo_mdogo', status: { [require('sequelize').Op.ne]: 'failed' } }
    });

    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'Lipa Mdogo Mdogo payment already initiated' });
    }

    // Create payment record
    const payment = await Payment.create({
      orderId,
      userId,
      paymentMethod: 'lipa_mdogo_mdogo',
      paymentType: 'prepay',
      amount: order.total,
      currency: 'KES',
      status: 'pending',
      mpesaPhoneNumber: phoneNumber,
      metadata: JSON.stringify({
        instructions: 'You will receive an M-Pesa message to pay in installments. Complete all payments to confirm your order.',
        installmentPlan: 'Flexible - pay what you can when you can'
      }),
      initiatedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Lipa Mdogo Mdogo payment record created',
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        status: payment.status,
        phoneNumber: payment.mpesaPhoneNumber,
        createdAt: payment.createdAt
      },
      instructions: {
        phoneNumber,
        amount: payment.amount,
        plan: 'Lipa Mdogo Mdogo - Pay in installments',
        note: 'You will receive payment prompts on your phone. Complete all installments to confirm your order.'
      }
    });

  } catch (error) {
    console.error('Error creating Lipa Mdogo Mdogo payment:', error);
    res.status(500).json({ success: false, message: 'Failed to create Lipa Mdogo Mdogo payment' });
  }
};

// Initiate Wallet payment from delivery confirmation modal
const initiateWalletPayment = async (req, res) => {
  const { orderId } = req.body;
  const userId = req.user.id;
  const t = await sequelize.transaction();

  try {
    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: 'user' }],
      transaction: t
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Authorization Check: Owner OR Assigned Delivery Agent
    let isAuthorized = order.userId === userId || order.deliveryAgentId === userId;

    if (!isAuthorized) {
      const deliveryTask = await DeliveryTask.findOne({
        where: {
          orderId: order.id,
          deliveryAgentId: userId,
          status: { [Op.ne]: 'cancelled' }
        },
        transaction: t
      });

      if (deliveryTask) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to process wallet payment for this order'
      });
    }

    if (order.paymentConfirmed) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    const customer = order.user;
    if (!customer) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const amount = order.total;
    if (parseFloat(customer.walletBalance) < amount) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        balance: customer.walletBalance,
        required: amount
      });
    }

    // Deduct from wallet
    await customer.decrement({ walletBalance: amount }, { transaction: t });

    // Create transaction record
    await Transaction.create({
      userId: customer.id,
      amount: -amount,
      type: 'debit',
      note: `Payment for Order #${order.orderNumber} via Delivery Agent`,
      walletType: 'customer'
    }, { transaction: t });

    // Create payment record
    const payment = await Payment.create({
      orderId: order.id,
      userId: customer.id,
      paymentMethod: 'card', // Placeholder for 'wallet'
      paymentType: 'prepay',
      amount: amount,
      currency: 'KES',
      status: 'completed',
      completedAt: new Date(),
      metadata: JSON.stringify({ method: 'wallet_debit', initiatedBy: req.user.id })
    }, { transaction: t });

    // Mark order as paid
    await order.update({
      paymentConfirmed: true,
      paymentId: payment.id,
      paymentMethod: 'Wallet',
      paymentSubType: 'mpesa' // Placeholder for 'wallet'
    }, { transaction: t });

    // Add tracking update
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status: order.status,
      message: `Payment of KES ${amount} confirmed via Wallet debit.`,
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) }, { transaction: t });

    await t.commit();

    // Trigger commission and agent credit if applicable
    try {
      if (order.referralCode) {
        await createCommissionRecords(order.id, order.referralCode, t);
      }
      // NEW: Credit delivery agent immediately
      await creditAgentByOrder(order.id, t);
    } catch (e) {
      console.warn('⚠️ Failed to create commission or credit agent in wallet payment:', e);
    }

    res.json({
      success: true,
      message: 'Payment completed successfully via Wallet',
      order: {
        id: order.id,
        paymentConfirmed: true,
        walletBalance: parseFloat(customer.walletBalance) - amount
      }
    });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Error initiating wallet payment:', error);
    res.status(500).json({ success: false, message: 'Failed to process wallet payment', error: error.message });
  }
};

module.exports = {
  createPayment,
  initiateMpesaPayment,
  initiateAirtelMoneyPayment,
  handleAirtelCallback,
  createBankTransferPayment,
  createLipaMdogoMdogoPayment,
  handleMpesaCallback,
  checkPaymentStatus,
  verifyPayment,
  verifyPaymentByOrder,
  getPaymentVerificationInfo,
  getUserPayments,
  processRefund,
  initiateWalletPayment,
  mpesaSimulate // Keep existing function for backward compatibility
};
