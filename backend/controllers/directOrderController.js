const { Product, FastFood, User, Order, OrderItem, Commission, PickupStation, DeliveryCharge, PlatformConfig } = require('../models');
const { Op } = require('sequelize');
const { calculateItemCommission } = require('../utils/commissionUtils');
const { notifyCustomerOrderPlaced } = require('../utils/notificationHelpers');
const { sequelize } = require('../database/database');

/**
 * List all direct orders (orderNumber starts with 'DIR-')
 * Admin: sees all. Marketer: sees their own. Seller: sees orders with their sellerId.
 */
exports.listDirectOrders = async (req, res) => {
    try {
        const role = req.user.role;
        const roles = req.user.roles || [];
        const userId = req.user.id;
        
        const isAdmin = role === 'admin' || role === 'superadmin' || role === 'super_admin' || roles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));
        const isMarketer = role === 'marketer' || roles.includes('marketer');
        const isSeller = role === 'seller' || roles.includes('seller');

        console.log(`[DirectOrder] List request by User ${userId} | Role: ${role} | isAdmin: ${isAdmin} | isMarketer: ${isMarketer}`);

        const baseWhere = {
            orderNumber: { [Op.like]: 'DIR-%' }
        };

        // If NOT an admin, enforce strict ownership/placer filtering
        if (!isAdmin) {
            if (isMarketer) {
                baseWhere.marketerId = userId;
            } else if (isSeller) {
                baseWhere.sellerId = userId;
            } else {
                // If neither, they shouldn't see anything or at least only their own (as customer)
                // But DirectOrders is for management, so we'll be restrictive
                baseWhere.userId = userId;
                baseWhere.marketerId = userId; // Should result in empty if not both
            }
        }
        // Admin sees all based on DIR- prefix

        const orders = await Order.findAll({
            where: baseWhere,
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    attributes: ['id', 'name', 'quantity', 'price', 'total', 'variantId', 'comboId']
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'name', 'phone', 'email'],
                    required: false
                },
                {
                    model: User,
                    as: 'seller',
                    attributes: ['id', 'name', 'phone', 'businessName', 'role'],
                    required: false
                },
                {
                    model: User,
                    as: 'marketer',
                    attributes: ['id', 'name', 'phone', 'role'],
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 100
        });

        res.json({ success: true, orders });
    } catch (error) {
        console.error('[directOrderController] listDirectOrders error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch direct orders' });
    }
};


/**
 * Parses a single order block
 * Format:
 * Item Name(Qty)
 * Phone Number
 * Address
 */
const parseTextBlock = (text) => {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 1) return null;

    const phoneRegex = /(\+?254|0)?(7|1)\d{8}/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let customerPhone = '';
    let customerEmail = '';
    const candidates = [];

    for (const line of lines) {
        if (!customerPhone && phoneRegex.test(line.replace(/\s+/g, ''))) {
            customerPhone = line.replace(/\s+/g, '').match(phoneRegex)[0];
        } else if (!customerEmail && emailRegex.test(line)) {
            customerEmail = line;
        } else {
            const itemMatch = line.match(/^(.+?)(?:\s*\(\s*(\d+)\s*\)\s*)?$/);
            candidates.push({
                name: itemMatch ? itemMatch[1].trim() : line,
                quantity: (itemMatch && itemMatch[2]) ? parseInt(itemMatch[2], 10) : 1,
                original: line
            });
        }
    }

    // Normalization
    if (customerPhone.startsWith('0')) customerPhone = '254' + customerPhone.slice(1);
    if (customerPhone.startsWith('7') || customerPhone.startsWith('1')) customerPhone = '254' + customerPhone;
    if (customerPhone.startsWith('+')) customerPhone = customerPhone.slice(1);

    return {
        candidates,
        customerPhone,
        customerEmail,
        allLines: lines
    };
};

exports.parseDirectOrder = async (req, res) => {
    try {
        const { textBlock, type } = req.body; // type: 'product' or 'fastfood'
        
        if (!textBlock) {
            return res.status(400).json({ success: false, message: 'Text block is required' });
        }

        const parsed = parseTextBlock(textBlock);
        if (!parsed || parsed.candidates.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid format. Ensure at least one line for the item name.' 
            });
        }

        // 1. Find the Item and populate matches
        let resultMatches = [];
        let detectedItem = null;

        for (const candidate of parsed.candidates) {
            let matches = [];
            if (type === 'fastfood') {
                matches = await FastFood.findAll({
                    where: {
                        [Op.or]: [
                            { name: { [Op.like]: `%${candidate.name}%` } },
                            { sizeVariants: { [Op.like]: `%${candidate.name}%` } },
                            { comboOptions: { [Op.like]: `%${candidate.name}%` } }
                        ],
                        reviewStatus: 'approved',
                        isActive: true
                    },
                    limit: 5
                });
            } else {
                matches = await Product.findAll({
                    where: {
                        name: { [Op.like]: `%${candidate.name}%` },
                        reviewStatus: 'approved',
                        status: 'active'
                    },
                    limit: 5
                });
            }

            if (matches.length > 0) {
                detectedItem = candidate;
                // Process matches into resultMatches
                if (type === 'fastfood') {
                    const searchLower = candidate.name.toLowerCase();
                    for (const m of matches) {
                        let matchedSomething = false;
                        if (m.name.toLowerCase().includes(searchLower)) {
                            resultMatches.push({ id: m.id.toString(), name: m.name, price: m.displayPrice || m.basePrice, sellerId: m.sellerId });
                            matchedSomething = true;
                        }
                        // Variants
                        let variants = [];
                        try { variants = typeof m.sizeVariants === 'string' ? JSON.parse(m.sizeVariants) : (m.sizeVariants || []); } catch(e){}
                        for (const v of variants) {
                            const vName = v.name || v.size || '';
                            if (vName.toLowerCase().includes(searchLower) || `${m.name} ${vName}`.toLowerCase().includes(searchLower)) {
                                resultMatches.push({ id: `${m.id}_variant_${v.id || vName}`, name: `${m.name} (${vName})`, price: v.discountPrice || v.displayPrice || m.displayPrice, sellerId: m.sellerId });
                                matchedSomething = true;
                            }
                        }
                        // Combos
                        let combos = [];
                        try { combos = typeof m.comboOptions === 'string' ? JSON.parse(m.comboOptions) : (m.comboOptions || []); } catch(e){}
                        for (const c of combos) {
                            const cName = c.name || c.title || '';
                            if (cName.toLowerCase().includes(searchLower) || `${m.name} ${cName}`.toLowerCase().includes(searchLower)) {
                                resultMatches.push({ id: `${m.id}_combo_${c.id || cName}`, name: `${m.name} (${cName})`, price: c.discountPrice || c.displayPrice || m.displayPrice, sellerId: m.sellerId });
                                matchedSomething = true;
                            }
                        }
                        if (!matchedSomething) resultMatches.push({ id: m.id.toString(), name: m.name, price: m.displayPrice || m.basePrice, sellerId: m.sellerId });
                    }
                } else {
                    resultMatches = matches.map(m => ({ id: m.id.toString(), name: m.name, price: m.displayPrice || m.basePrice, sellerId: m.sellerId }));
                }
                break; // Found the item, stop searching other candidates
            }
        }

        // 2. Fallback if no matches found
        if (!detectedItem) {
            detectedItem = parsed.candidates[0]; // Fallback to first line
        }

        // 3. Heuristic for Customer Name and Address from remaining lines
        const remaining = parsed.candidates.filter(c => c.original !== detectedItem.original).map(c => c.original);
        let customerName = '';
        let addressLines = [];

        if (remaining.length > 0) {
            // Heuristic: The shorter line is usually the name
            const sortedByLength = [...remaining].sort((a, b) => a.length - b.length);
            customerName = sortedByLength[0];
            addressLines = remaining.filter(line => line !== customerName);
        }

        const finalParsed = {
            itemName: detectedItem.name,
            quantity: detectedItem.quantity,
            customerPhone: parsed.customerPhone,
            customerName: customerName,
            customerEmail: parsed.customerEmail,
            deliveryAddress: addressLines.join(', ') || 'N/A'
        };

        // Check if user exists
        const user = await User.findOne({ where: { phone: finalParsed.customerPhone } });

        // Try to find a delivery fee match
        const pickupStation = await PickupStation.findOne({
            where: {
                name: { [Op.like]: `%${finalParsed.deliveryAddress}%` }
            }
        });

        res.json({
            success: true,
            parsedData: finalParsed,
            matches: resultMatches,
            userExists: !!user,
            suggestedPickupStation: pickupStation ? { id: pickupStation.id, name: pickupStation.name } : null
        });

    } catch (error) {
        console.error('[directOrderController] parse error:', error);
        res.status(500).json({ success: false, message: 'Failed to parse order' });
    }
};

exports.placeDirectOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { 
            itemId, 
            type, 
            quantity, 
            customerPhone,
            deliveryAddress,
            pickupStationId,
            customerName = 'Guest Customer',
            customerEmail,
            originalTextBlock
        } = req.body;

        const role = req.user.role;
        const roles = req.user.roles || [];
        const isAdmin = role === 'admin' || role === 'superadmin' || role === 'super_admin' || roles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));
        const isMarketer = role === 'marketer' || roles.includes('marketer');

        let actualItemId = itemId;
        let variantId = null;
        let comboId = null;
        
        if (typeof itemId === 'string') {
            if (itemId.includes('_variant_')) {
                [actualItemId, variantId] = itemId.split('_variant_');
            } else if (itemId.includes('_combo_')) {
                [actualItemId, comboId] = itemId.split('_combo_');
            }
        }

        const model = type === 'fastfood' ? FastFood : Product;
        const item = await model.findByPk(actualItemId);

        if (!item) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // --- Shop Status & Availability Validation ---
        
        // 1. Check Approval & Active Status
        if (!item.approved || item.isActive === false) {
            await t.rollback();
            return res.status(400).json({ 
                success: false, 
                message: `This ${type === 'fastfood' ? 'meal' : 'product'} is currently not available for orders (Inactive or Pending Approval).` 
            });
        }

        // 2. Check Operating Hours for Fast Food
        if (type === 'fastfood') {
            const { isFastFoodOpen } = require('../utils/fastFoodUtils');
            if (!isFastFoodOpen(item)) {
                await t.rollback();
                const from = item.availableFrom || '08:00';
                const to = item.availableTo || '22:00';
                return res.status(400).json({ 
                    success: false, 
                    message: `Cannot place order. This kitchen is currently CLOSED. Regular hours: ${from} to ${to}.` 
                });
            }
        }

        // 1. Resolve User
        let user = await User.findOne({ where: { phone: customerPhone } });
        
        // 2. Calculate Pricing
        let unitPrice = parseFloat(item.discountPrice || item.displayPrice || item.basePrice || 0);
        let itemName = item.name;

        if (variantId && type === 'fastfood') {
            let sizeVariants = [];
            try { sizeVariants = typeof item.sizeVariants === 'string' ? JSON.parse(item.sizeVariants) : (item.sizeVariants || []); } catch(e){}
            const v = sizeVariants.find(v => (v.id || v.name || v.size || '') == variantId);
            if (v) {
                unitPrice = parseFloat(v.discountPrice || v.displayPrice || v.basePrice || unitPrice);
                itemName = `${item.name} (${v.name || v.size || variantId})`;
            }
        } else if (comboId && type === 'fastfood') {
            let comboOptions = [];
            try { comboOptions = typeof item.comboOptions === 'string' ? JSON.parse(item.comboOptions) : (item.comboOptions || []); } catch(e){}
            const c = comboOptions.find(c => (c.id || c.name || c.title || '') == comboId);
            if (c) {
                unitPrice = parseFloat(c.discountPrice || c.displayPrice || c.basePrice || unitPrice);
                itemName = `${item.name} (${c.name || c.title || comboId})`;
            }
        }

        const subtotal = unitPrice * quantity;
        const sellerId = type === 'fastfood' ? item.vendor : item.sellerId;
        
        // Default delivery fee if no station matched
        let deliveryFee = 0;
        if (pickupStationId) {
            const station = await PickupStation.findByPk(pickupStationId);
            deliveryFee = station ? (station.deliveryFee || 0) : 0;
        } else {
            // Fallback to platform default delivery fee
            const config = await PlatformConfig.findOne({ where: { key: 'default_delivery_fee' } });
            deliveryFee = config ? parseFloat(config.value) : 100; // Default 100 if not set
        }

        const total = subtotal + deliveryFee;

        // 3. Create Order
        const orderNumber = `DIR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // For FastFood direct orders the admin who places the order implicitly provides
        // the super-admin confirmation step — the seller still confirms manually.
        // Status: super_admin_confirmed → seller clicks confirm → awaiting_delivery_assignment.
        // For product direct orders the standard flow applies (order_placed → admin routes → seller confirms).
        const isFastFoodOrder = type === 'fastfood';
        const orderStatus = isFastFoodOrder ? 'super_admin_confirmed' : 'order_placed';
        const now = new Date();

        const order = await Order.create({
            userId: user ? user.id : null,
            customerName: customerName || (user ? user.name : customerPhone),
            customerPhone: customerPhone,
            customerEmail: customerEmail || (user ? user.email : null),
            orderNumber: orderNumber,
            total: total,
            deliveryFee: deliveryFee,
            deliveryAddress: deliveryAddress,
            paymentMethod: 'Cash on Delivery',
            paymentType: 'cash_on_delivery',
            status: orderStatus,
            // Auto super-admin confirmation for FastFood (admin placed it, no manual review needed).
            // Seller still needs to manually confirm the order.
            superAdminConfirmed: isFastFoodOrder ? true : false,
            superAdminConfirmedAt: isFastFoodOrder ? now : null,
            superAdminConfirmedBy: isFastFoodOrder ? req.user.id : null,
            // Pre-set FastFood routing strategy so seller confirmation can proceed immediately.
            adminRoutingStrategy: isFastFoodOrder ? 'fastfood_direct_delivery' : null,
            deliveryType: isFastFoodOrder ? 'seller_to_customer' : null,
            sellerId: sellerId,
            marketerId: req.user.id, // Set for both Admin and Marketer for referral tracking
            isMarketingOrder: !isAdmin && isMarketer, // Only true for marketers for payout purposes
            pickupStationId: pickupStationId || null,
            originalTextBlock: originalTextBlock || null,
            items: 1
        }, { transaction: t });

        // 4. Handle Commission Calculation
        const commissionAmount = calculateItemCommission(item, unitPrice, quantity);

        // 5. Create OrderItem
        await OrderItem.create({
            orderId: order.id,
            productId: type === 'product' ? item.id : null,
            fastFoodId: type === 'fastfood' ? actualItemId : null,
            variantId: variantId,
            comboId: comboId,
            name: itemName,
            quantity: quantity,
            price: unitPrice,
            total: subtotal,
            commissionAmount: commissionAmount, // Essential for dashboard display
            sellerId: sellerId
        }, { transaction: t });

        // 6. Record Commission in Ledger if Marketer
        if (isMarketer && commissionAmount > 0) {
            await Commission.create({
                marketerId: req.user.id,
                orderId: order.id,
                productId: type === 'product' ? item.id : null,
                fastFoodId: type === 'fastfood' ? actualItemId : null,
                saleAmount: subtotal,
                commissionRate: parseFloat(item.marketingCommission || 0),
                commissionAmount: commissionAmount,
                status: 'pending',
                referralCode: req.user.referralCode || 'DIRECT',
                commissionType: 'full_100'
            }, { transaction: t });
            
            await order.update({ totalCommission: commissionAmount }, { transaction: t });
        }

        await t.commit();

        // Optional: Notify customer
        try {
            const customerObj = user ? { id: user.id, name: user.name, phone: user.phone, email: user.email } : null;
            const itemsList = `• ${itemName} x${quantity}`;
            const refCode = req.user.referralCode || 'PROMO';
            await notifyCustomerOrderPlaced(order, customerObj, 1, itemsList, refCode);
            
            if (isMarketer && !isAdmin) {
                await notifyMarketerOrderPlaced(order, req.user, customerName);
            }
        } catch (err) {
            console.warn('[directOrderController] Notification failed:', err.message);
        }

        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: order.id,
            orderNumber: order.orderNumber
        });

    } catch (error) {
        if (t) await t.rollback();
        console.error('[directOrderController] placement error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to place order' });
    }
};
