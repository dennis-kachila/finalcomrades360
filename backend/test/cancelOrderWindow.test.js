// Mock messageService before loading app to prevent baileys ESM import errors
jest.mock('../utils/messageService', () => ({
  sendMessage: jest.fn().mockResolvedValue({ success: true }),
}));

// Set ephemeral port before requiring app so parallel Jest workers don't conflict
process.env.PORT = 0;

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { sequelize, Role, User, Order, OrderItem } = require('../models');

const random = Date.now();
const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
const createdOrderIds = [];
const createdUserIds = [];

jest.setTimeout(60000);

function makeToken(user) {
  return jwt.sign({ id: user.id }, jwtSecret, { expiresIn: '1h' });
}

/**
 * Poll /api/health until it returns 200 (routes fully registered) or timeout.
 * This is more reliable than a fixed setTimeout on slow machines/CI.
 */
async function waitForAppReadiness({ timeoutMs = 10000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await request(app).get('/api/health');
      if (response.status === 200) return;
    } catch (_err) {
      // Routes may not be registered yet; keep retrying until deadline.
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for app readiness via GET /api/health');
}

describe('Order cancellation window enforcement', () => {
  let customerUser;
  let adminUser;
  let sellerUser;

  beforeAll(async () => {
    // Wait deterministically for lazy route registration to complete.
    await waitForAppReadiness();

    // Ensure tables exist (non-destructive)
    await sequelize.sync({ force: false, alter: false });

    // Ensure roles exist
    await Role.findOrCreate({ where: { id: 'admin' }, defaults: { name: 'Admin', isSystem: true } });
    await Role.findOrCreate({ where: { id: 'super_admin' }, defaults: { name: 'Super Admin', isSystem: true } });
    await Role.findOrCreate({ where: { id: 'customer' }, defaults: { name: 'Customer', isSystem: true } });
    await Role.findOrCreate({ where: { id: 'seller' }, defaults: { name: 'Seller', isSystem: true } });

    customerUser = await User.create({
      name: 'Cancel Test Customer',
      email: `cancel-customer-${random}@test.com`,
      phone: `2547${String(random).slice(-8)}`,
      password: 'test-password',
      role: 'customer',
      roles: ['customer'],
      isVerified: true,
      isDeactivated: false,
      isFrozen: false,
    });
    createdUserIds.push(customerUser.id);

    adminUser = await User.create({
      name: 'Cancel Test Admin',
      email: `cancel-admin-${random}@test.com`,
      phone: `2547${String(random + 1).slice(-8)}`,
      password: 'test-password',
      role: 'admin',
      roles: ['admin'],
      isVerified: true,
      isDeactivated: false,
      isFrozen: false,
    });
    createdUserIds.push(adminUser.id);

    sellerUser = await User.create({
      name: 'Cancel Test Seller',
      email: `cancel-seller-${random}@test.com`,
      phone: `2547${String(random + 2).slice(-8)}`,
      password: 'test-password',
      role: 'seller',
      roles: ['seller'],
      isVerified: true,
      isDeactivated: false,
      isFrozen: false,
      businessAddress: 'Nairobi CBD',
    });
    createdUserIds.push(sellerUser.id);
  });

  afterAll(async () => {
    // Clean up test data
    if (createdOrderIds.length > 0) {
      await OrderItem.destroy({ where: { orderId: createdOrderIds } });
      await Order.destroy({ where: { id: createdOrderIds } });
    }
    if (createdUserIds.length > 0) {
      await User.destroy({ where: { id: createdUserIds } });
    }
    await sequelize.close();
  });

  async function createOrder({ userId, itemType, ageMinutes, status }) {
    const order = await Order.create({
      userId,
      orderNumber: `CW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      paymentMethod: 'Cash on Delivery',
      deliveryMethod: 'home_delivery',
      deliveryAddress: 'Test Street, Nairobi',
      status: status || 'order_placed',
      total: 500,
      items: 1,
    });
    createdOrderIds.push(order.id);

    // Backdate createdAt via Sequelize QueryInterface so the test remains portable across dialects.
    // Pass Order.rawAttributes as the 5th argument so Sequelize coerces the Date to the correct
    // storage format for the dialect (ISO string for SQLite, DATETIME for MySQL).
    if (ageMinutes !== undefined) {
      await sequelize.getQueryInterface().bulkUpdate(
        Order.getTableName(),
        { createdAt: new Date(Date.now() - ageMinutes * 60 * 1000) },
        { id: order.id },
        {},
        Order.rawAttributes
      );
    }

    await OrderItem.create({
      orderId: order.id,
      name: itemType === 'fastfood' ? 'Test Burger' : 'Test Product',
      price: 500,
      quantity: 1,
      total: 500,
      itemType,
    });

    return order;
  }

  // ─── Food order tests (10-minute window) ──────────────────────────────────

  test('allows food order cancellation within 10 minutes', async () => {
    const order = await createOrder({ userId: customerUser.id, itemType: 'fastfood', ageMinutes: 5 });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(customerUser)}`)
      .send({ reason: 'Changed my mind', cancelledBy: 'customer' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('denies food order cancellation after 10 minutes', async () => {
    const order = await createOrder({ userId: customerUser.id, itemType: 'fastfood', ageMinutes: 15 });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(customerUser)}`)
      .send({ reason: 'Changed my mind', cancelledBy: 'customer' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10 minutes/i);
  });

  test('denies food order cancellation when status is seller_confirmed (preparation started)', async () => {
    const order = await createOrder({
      userId: customerUser.id,
      itemType: 'fastfood',
      ageMinutes: 2,
      status: 'seller_confirmed',
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(customerUser)}`)
      .send({ reason: 'Changed my mind', cancelledBy: 'customer' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/preparation has started/i);
  });

  // ─── Product order tests (24-hour window) ─────────────────────────────────

  test('allows product order cancellation within 24 hours', async () => {
    const order = await createOrder({ userId: customerUser.id, itemType: 'product', ageMinutes: 60 });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(customerUser)}`)
      .send({ reason: 'Changed my mind', cancelledBy: 'customer' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('denies product order cancellation after 24 hours', async () => {
    const order = await createOrder({ userId: customerUser.id, itemType: 'product', ageMinutes: 25 * 60 });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(customerUser)}`)
      .send({ reason: 'Changed my mind', cancelledBy: 'customer' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/24 hours/i);
  });

  // ─── Admin bypass tests ───────────────────────────────────────────────────

  test('admin can cancel a food order after the 10-minute window', async () => {
    const order = await createOrder({ userId: customerUser.id, itemType: 'fastfood', ageMinutes: 60 });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(adminUser)}`)
      .send({ reason: 'Admin override', cancelledBy: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('admin can cancel a product order after the 24-hour window', async () => {
    const order = await createOrder({ userId: customerUser.id, itemType: 'product', ageMinutes: 48 * 60 });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(adminUser)}`)
      .send({ reason: 'Admin override', cancelledBy: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('non-admin role (seller owning order) has cancellation window enforced', async () => {
    const order = await createOrder({
      userId: sellerUser.id,
      itemType: 'product',
      ageMinutes: 25 * 60,
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${makeToken(sellerUser)}`)
      .send({ reason: 'Test', cancelledBy: 'seller' });

    // Seller is not admin/super_admin: window should be enforced
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/24 hours/i);
  });
});
