const request = require('supertest');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { User } = require('../models');

// Test data
const testAdmin = {
  name: 'Test Admin',
  email: 'admin@test.com',
  phone: '0712345678',
  password: 'password123',
  role: 'admin',
  roles: ['admin'],
  isVerified: true,
  emailVerified: true,
  phoneVerified: true
};

const testUser = {
  name: 'Test User',
  email: 'user@test.com',
  password: 'Password@123',
  phone: '0711111111',
  role: 'customer'
};

let adminToken;
let testUserId;

beforeAll(async () => {
  const [admin] = await User.findOrCreate({
    where: { email: testAdmin.email },
    defaults: {
      ...testAdmin,
      password: await bcrypt.hash(testAdmin.password, 10)
    }
  });

  if (!admin.password || !admin.password.startsWith('$2')) {
    await admin.update({
      password: await bcrypt.hash(testAdmin.password, 10),
      phone: testAdmin.phone,
      role: 'admin',
      roles: ['admin'],
      isVerified: true,
      emailVerified: true,
      phoneVerified: true
    });
  }
  
  // Login to get token
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: testAdmin.email,
      password: testAdmin.password
    });

  expect(res.statusCode).toEqual(200);
  expect(res.body).toHaveProperty('token');
  adminToken = res.body.token;
});

describe('User Management API', () => {
  test('should create a new user (admin endpoint)', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testUser);

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('user');
    testUserId = res.body.user.id;
  });

  test('should get all users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.users)).toBeTruthy();
    expect(res.body).toHaveProperty('pagination');
  });

  test('should update user role', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${testUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'seller' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.user.role).toEqual('seller');
  });

  test('should deactivate a user', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isDeactivated: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body.user.isDeactivated).toBe(true);
  });
});

afterAll(async () => {
  // Clean up test data
  await User.destroy({
    where: {
      email: {
        [Op.in]: [testAdmin.email, testUser.email]
      }
    }
  });
});
