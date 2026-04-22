const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { sequelize, Role, User, Order, OrderItem, DeliveryTask, Warehouse, PickupStation, Notification } = require('../models');

const random = Date.now();

jest.setTimeout(60000);

describe('Order status transitions - delivery task auto-creation', () => {
  let adminUser;
  let authToken;
  const created = {
    users: [],
    orders: [],
    warehouses: [],
    stations: [],
  };

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    await Role.bulkCreate([
      { id: 'admin', name: 'Admin', isSystem: true },
      { id: 'customer', name: 'Customer', isSystem: true },
      { id: 'delivery_agent', name: 'Delivery Agent', isSystem: true },
    ]);

    adminUser = await User.create({
      name: 'E2E Admin',
      email: `e2e-admin-${random}@test.com`,
      phone: `254700${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'admin',
      roles: ['admin'],
      isVerified: true,
      isDeactivated: false,
      isFrozen: false,
    });

    created.users.push(adminUser.id);

    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    authToken = jwt.sign({ id: adminUser.id }, jwtSecret, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('creates DeliveryTask when direct delivery order transitions to seller_confirmed', async () => {
    const customer = await User.create({
      name: 'Direct Customer',
      email: `direct-customer-${random}@test.com`,
      phone: `254799${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'customer',
      roles: ['customer'],
      isVerified: true,
    });
    created.users.push(customer.id);

    const seller = await User.create({
      name: 'Direct Seller',
      email: `direct-seller-${random}@test.com`,
      phone: `254788${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'seller',
      roles: ['seller'],
      isVerified: true,
      businessAddress: 'Ngong Road Junction Mall',
    });
    created.users.push(seller.id);

    const order = await Order.create({
      userId: customer.id,
      sellerId: seller.id,
      orderNumber: `E2E-DIRECT-${random}`,
      paymentMethod: 'Cash on Delivery',
      deliveryMethod: 'home_delivery',
      deliveryAddress: 'South B Plainsview Estate',
      status: 'order_placed',
      adminRoutingStrategy: 'direct_delivery',
      total: 1350,
      deliveryFee: 150,
      items: 1,
    });
    created.orders.push(order.id);

    await OrderItem.create({
      orderId: order.id,
      name: 'Direct Product',
      price: 1200,
      quantity: 1,
      total: 1200,
      itemType: 'product',
    });

    const response = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'seller_confirmed' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('seller_confirmed');

    const tasks = await DeliveryTask.findAll({ where: { orderId: order.id } });
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].deliveryType).toBe('seller_to_customer');
    expect(tasks[0].pickupLocation).toContain('Ngong');
    expect(tasks[0].deliveryLocation).toContain('South B');
  });

  test('creates DeliveryTask when warehouse/home_delivery order transitions to awaiting_delivery_assignment', async () => {
    const customer = await User.create({
      name: 'Warehouse Customer',
      email: `warehouse-customer-${random}@test.com`,
      phone: `254711${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'customer',
      roles: ['customer'],
      isVerified: true,
    });
    created.users.push(customer.id);

    const warehouse = await Warehouse.create({
      name: 'E2E Warehouse',
      code: `E2EW-${random}`,
      address: 'Nairobi Industrial Area, Gate 5',
      isActive: true,
    });
    created.warehouses.push(warehouse.id);

    const order = await Order.create({
      userId: customer.id,
      orderNumber: `E2E-WH-${random}`,
      paymentMethod: 'Cash on Delivery',
      deliveryMethod: 'home_delivery',
      deliveryAddress: 'Kasarani Seasons Road',
      status: 'at_warehouse',
      adminRoutingStrategy: 'warehouse',
      destinationWarehouseId: warehouse.id,
      total: 1200,
      items: 1,
    });
    created.orders.push(order.id);

    await OrderItem.create({
      orderId: order.id,
      name: 'Sample Product',
      price: 1200,
      quantity: 1,
      total: 1200,
      itemType: 'product',
    });

    const response = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'awaiting_delivery_assignment' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('awaiting_delivery_assignment');

    const tasks = await DeliveryTask.findAll({ where: { orderId: order.id } });
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].pickupLocation).toContain('Nairobi Industrial Area');
    expect(tasks[0].deliveryLocation).toContain('Kasarani');
  });

  test('creates DeliveryTask from pickup station for pick_station/home_delivery at_pick_station transition', async () => {
    const customer = await User.create({
      name: 'Station Customer',
      email: `station-customer-${random}@test.com`,
      phone: `254722${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'customer',
      roles: ['customer'],
      isVerified: true,
    });
    created.users.push(customer.id);

    const station = await PickupStation.create({
      name: 'E2E Pickup Station',
      location: 'Westlands Waiyaki Way, Stage 2',
      isActive: true,
    });
    created.stations.push(station.id);

    const order = await Order.create({
      userId: customer.id,
      orderNumber: `E2E-ST-${random}`,
      paymentMethod: 'Cash on Delivery',
      deliveryMethod: 'home_delivery',
      deliveryAddress: 'Ruaka Joyland Estate',
      status: 'at_pick_station',
      adminRoutingStrategy: 'pick_station',
      destinationPickStationId: station.id,
      total: 950,
      items: 1,
    });
    created.orders.push(order.id);

    await OrderItem.create({
      orderId: order.id,
      name: 'Station Product',
      price: 950,
      quantity: 1,
      total: 950,
      itemType: 'product',
    });

    const response = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'awaiting_delivery_assignment' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('awaiting_delivery_assignment');

    const tasks = await DeliveryTask.findAll({ where: { orderId: order.id } });
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].pickupLocation).toContain('Westlands');
    expect(tasks[0].deliveryLocation).toContain('Ruaka');
  });

  test('creates customer notification when order moves to ready_for_pickup', async () => {
    const customer = await User.create({
      name: 'Pickup Notification Customer',
      email: `pickup-notify-${random}@test.com`,
      phone: `254733${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'customer',
      roles: ['customer'],
      isVerified: true,
    });
    created.users.push(customer.id);

    const station = await PickupStation.create({
      name: 'Pickup Notify Station',
      location: 'Kilimani Argwings Kodhek Road',
      contactPhone: '254700111222',
      isActive: true,
    });
    created.stations.push(station.id);

    const order = await Order.create({
      userId: customer.id,
      orderNumber: `E2E-NOTIFY-PICK-${random}`,
      paymentMethod: 'Cash on Delivery',
      deliveryMethod: 'pick_station',
      status: 'at_pick_station',
      adminRoutingStrategy: 'pick_station',
      destinationPickStationId: station.id,
      total: 780,
      items: 1,
    });
    created.orders.push(order.id);

    await OrderItem.create({
      orderId: order.id,
      name: 'Pickup Notification Product',
      price: 780,
      quantity: 1,
      total: 780,
      itemType: 'product',
    });

    const response = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'ready_for_pickup' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready_for_pickup');

    const notification = await Notification.findOne({
      where: {
        userId: customer.id,
        title: 'Order Ready for Pickup',
      },
      order: [['id', 'DESC']],
    });

    expect(notification).toBeTruthy();
    expect(notification.message).toContain(order.orderNumber);
    expect(notification.message).toContain('Kilimani');
  });

  test('creates customer notification with driver details when order moves to in_transit', async () => {
    const customer = await User.create({
      name: 'Transit Notification Customer',
      email: `transit-notify-${random}@test.com`,
      phone: `254744${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'customer',
      roles: ['customer'],
      isVerified: true,
    });
    created.users.push(customer.id);

    const agent = await User.create({
      name: 'Transit Agent',
      email: `transit-agent-${random}@test.com`,
      phone: `254755${String(random).slice(-6)}`,
      password: 'test-password',
      role: 'delivery_agent',
      roles: ['delivery_agent'],
      isVerified: true,
    });
    created.users.push(agent.id);

    const order = await Order.create({
      userId: customer.id,
      deliveryAgentId: agent.id,
      orderNumber: `E2E-NOTIFY-TRANSIT-${random}`,
      paymentMethod: 'Cash on Delivery',
      deliveryMethod: 'home_delivery',
      deliveryAddress: 'Roysambu TRM Drive',
      status: 'awaiting_delivery_assignment',
      adminRoutingStrategy: 'pick_station',
      total: 1320,
      items: 1,
      paymentConfirmed: false,
    });
    created.orders.push(order.id);

    await OrderItem.create({
      orderId: order.id,
      name: 'Transit Notification Product',
      price: 1320,
      quantity: 1,
      total: 1320,
      itemType: 'product',
    });

    const response = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'in_transit' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('in_transit');

    const notification = await Notification.findOne({
      where: {
        userId: customer.id,
        title: 'Order In Transit',
      },
      order: [['id', 'DESC']],
    });

    expect(notification).toBeTruthy();
    expect(notification.message).toContain(order.orderNumber);
    expect(notification.message).toContain('Transit Agent');
    expect(notification.message).toContain('254755');
  });
});
