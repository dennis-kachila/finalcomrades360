const { Wallet, Transaction, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Credits the pending balance of a user and creates a pending transaction.
 * Includes idempotency check to prevent double-crediting for the same order.
 */
const creditPending = async (userId, amount, description, orderId = null, transaction = null, walletType = null) => {
    if (amount <= 0) return;

    // 1. Idempotency Check: Prevent duplicate pending credits for the same order and description
    if (orderId) {
        const existingTx = await Transaction.findOne({
            where: {
                userId,
                orderId,
                type: 'credit',
                status: 'pending',
                // Description check helps differentiate between different commission items in the same order
                description
            },
            transaction
        });
        if (existingTx) {
            console.log(`[walletHelpers] Skip creditPending: Transaction already exists for order ${orderId}`);
            return;
        }
    }

    let wallet = await Wallet.findOne({ 
        where: { userId }, 
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false 
    });
    
    if (!wallet) {
        wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 }, { transaction });
    }

    // 2. Atomic Update: Use sequelize.literal to prevent race conditions
    await wallet.update({
        pendingBalance: sequelize.literal(`pendingBalance + ${amount}`)
    }, { transaction });

    await Transaction.create({
        userId,
        amount,
        type: 'credit',
        status: 'pending',
        description,
        orderId,
        walletType
    }, { transaction });
};

/**
 * Moves funds from pendingBalance to successBalance and updates transaction status.
 * Includes protection against double-processing.
 */
const moveToSuccess = async (userId, amount, orderNumber, description, orderId = null, transaction = null, walletType = null) => {
    if (amount <= 0) return;

    const { PlatformConfig } = require('../models');
    
    const wallet = await Wallet.findOne({ 
        where: { userId }, 
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
    });

    if (wallet) {
        // 1. Find the pending transaction to clear
        const txWhere = { userId, status: 'pending' };
        if (orderId) {
            txWhere.orderId = orderId;
        } else {
            txWhere.description = { [Op.like]: `%#${orderNumber}%` };
        }

        const tx = await Transaction.findOne({
            where: txWhere,
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : false
        });

        if (!tx) {
            console.warn(`[walletHelpers] No pending transaction found for order ${orderId || orderNumber}. Skipping moveToSuccess.`);
            return;
        }

        // 2. Atomic Balance Swap
        // We use GREATEST(0, ...) for MySQL and MAX(0, ...) for SQLite. 
        // For portability, we can check the dialect or just rely on the tx existence as a guard.
        const isSqlite = sequelize.getDialect() === 'sqlite';
        const maxFunc = isSqlite ? 'MAX' : 'GREATEST';

        await wallet.update({
            pendingBalance: sequelize.literal(`${maxFunc}(0, pendingBalance - ${amount})`),
            successBalance: sequelize.literal(`successBalance + ${amount}`)
        }, { transaction });

        // 3. Update Transaction status
        await tx.update({ 
            status: 'success', 
            walletType: walletType || tx.walletType,
            description: tx.description + ' (Cleared)'
        }, { transaction });

        const successTxId = tx.id;

        // 4. CHECK FOR AUTOMATIC PAYOUT MODE
        try {
            const autoPayoutConfig = await PlatformConfig.findOne({
                where: { key: 'automatic_delivery_payout_enabled' },
                transaction
            });

            if (autoPayoutConfig && autoPayoutConfig.value === 'true') {
                console.log(`[walletHelpers] Automatic payout enabled. Moving ${amount} to balance for user ${userId}`);
                await moveToPaid(userId, amount, successTxId, transaction);
            }
        } catch (error) {
            console.error('[walletHelpers] Error checking automatic payout config:', error);
        }
    }
};

/**
 * Moves funds from successBalance to balance (withdrawable) and updates transaction status.
 */
const moveToPaid = async (userId, amount, transactionId = null, transaction = null) => {
    if (amount <= 0) return;

    const wallet = await Wallet.findOne({ 
        where: { userId }, 
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
    });

    if (wallet) {
        const isSqlite = sequelize.getDialect() === 'sqlite';
        const maxFunc = isSqlite ? 'MAX' : 'GREATEST';

        await wallet.update({
            successBalance: sequelize.literal(`${maxFunc}(0, successBalance - ${amount})`),
            balance: sequelize.literal(`balance + ${amount}`)
        }, { transaction });

        if (transactionId) {
            const tx = await Transaction.findByPk(transactionId, { 
                transaction,
                lock: transaction ? transaction.LOCK.UPDATE : false
            });
            if (tx && tx.status !== 'completed') {
                await tx.update({ status: 'completed', description: tx.description + ' (Paid)' }, { transaction });
            }
        }
    }
};

/**
 * Reverts a pending credit (e.g. if assignment is rejected/cancelled).
 */
const revertPending = async (userId, amount, orderId, transaction = null) => {
    if (amount <= 0) return;

    const wallet = await Wallet.findOne({ 
        where: { userId }, 
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
    });

    if (wallet) {
        const isSqlite = sequelize.getDialect() === 'sqlite';
        const maxFunc = isSqlite ? 'MAX' : 'GREATEST';

        // Find the pending transaction first to ensure it exists and hasn't been reverted yet
        const tx = await Transaction.findOne({
            where: { userId, orderId, status: 'pending' },
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : false
        });

        if (tx) {
            await wallet.update({
                pendingBalance: sequelize.literal(`${maxFunc}(0, pendingBalance - ${amount})`)
            }, { transaction });

            await tx.update({ 
                status: 'cancelled', 
                description: tx.description + ' (Reverted/Rejected)' 
            }, { transaction });
        }
    }
};

/**
 * Calculates a tiered withdrawal fee based on the amount and settings.
 */
const calculateWithdrawalFee = (amount, settings) => {
    if (!settings || !settings.withdrawalTiers || !Array.isArray(settings.withdrawalTiers)) {
        return 0; // Fallback to 0 if no config
    }

    const tier = settings.withdrawalTiers.find(t => amount >= t.min && amount <= t.max);
    if (tier) {
        return parseFloat(tier.fee) || 0;
    }

    // Fallback if amount exceeds all tiers, find the last tier fee
    const lastTier = settings.withdrawalTiers[settings.withdrawalTiers.length - 1];
    return lastTier ? parseFloat(lastTier.fee) || 0 : 0;
};

module.exports = {
    creditPending,
    moveToSuccess,
    moveToPaid,
    revertPending,
    calculateWithdrawalFee
};
