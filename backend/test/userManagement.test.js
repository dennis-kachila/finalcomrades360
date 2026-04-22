const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../app');
const { User, RoleApplication } = require('../models');

// Test data
const testAdmin = {
  name: 'Test Admin',
  email: 'admin@test.com',
  password: 'password123',
  role: 'admin',
  isVerified: true
};

const testUser = {
  name: 'Test User',
  email: 'user@test.com',
  password: 'password123',
  phone: '+1234567890',
  role: 'customer'
};

let adminToken;
let testUserId;

beforeAll(async () => {
  // Create a test admin user if it doesn't exist
  const [admin] = await User.findOrCreate({
    where: { email: testAdmin.email },
    defaults: testAdmin
  });
  
  // Login to get token
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: testAdmin.email,
      password: testAdmin.password
    });
    
  adminToken = res.body.token;
});

describe('User Management API', () => {
  // Test creating a new user
  test('should create a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
      
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('user');
    testUserId = res.body.user.id;
  });

  // Test getting all users
  test('should get all users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body.users)).toBeTruthy();
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('totalPages');
  });

  // Test updating user role
  test('should update user role', async () => {
    const newRole = 'seller';
    const res = await request(app)
      .patch(`/api/admin/users/${testUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: newRole });
      
    expect(res.statusCode).toEqual(200);
    expect(res.body.user.role).toEqual(newRole);
  });

  // Test deactivating a user
  test('should deactivate a user', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${testUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isDeactivated: true });
      
    expect(res.statusCode).toEqual(200);
    expect(res.body.user.isDeactivated).toBe(true);
  });

  // Test bulk operations
  test('should perform bulk operations on users', async () => {
    const res = await request(app)
      .post('/api/admin/users/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userIds: [testUserId],
        action: 'activate'
      });
      
    expect(res.statusCode).toEqual(200);
    expect(res.body.affectedUsers).toBeGreaterThan(0);
  });

  // Test role applications
  describe('Role Applications', () => {
    let applicationId;
    
    test('should get role applications', async () => {
      const res = await request(app)
        .get('/api/roles/applications')
        .set('Authorization', `Bearer ${adminToken}`);
        
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });
    
    // Add more role application tests here
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
