console.log('🚀 SERVER STARTING - VERSION: ' + Date.now());
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// WhatsApp service will be initialized after server start
let messageService;

// Initialize Express app with timeout configuration
const app = express();

// Absolute first configuration: Trust proxy (for cPanel/Passenger/Cloudflare)
app.set('trust proxy', true);
console.log('[Init] Express Trust Proxy set to:', app.get('trust proxy'));

// Set server timeout to 60 seconds (60000ms)
app.set('timeout', 60000);

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to avoid breaking the SPA/CDN assets
  crossOriginEmbedderPolicy: false // Allow external images/videos
}));
app.use(compression());

// Rate Limiting — protect against brute-force and abuse
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15min per IP for general routes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login/register attempts per 15min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again in 15 minutes.' }
});
app.use('/api', globalLimiter); // Apply global rate limit to all API routes
app.use('/api/auth/login', authLimiter); // Stricter limit on login
app.use('/api/auth/register', authLimiter); // Stricter limit on register

// CORS Configuration
app.use(cors({
  origin: ['http://localhost:4000', 'http://127.0.0.1:4000', process.env.FRONTEND_URL],
  credentials: true
}));

// Request Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const legacyFrontendUrl = new URL(FRONTEND_URL.startsWith('http') ? FRONTEND_URL : `https://${FRONTEND_URL}`);

// Dynamically build allowed origins for production
const allowedOrigins = [
  FRONTEND_URL,
  'https://' + legacyFrontendUrl.hostname,
  'http://' + legacyFrontendUrl.hostname,
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from: ${origin}`);
      callback(new Error(`CORS policy: origin '${origin}' is not allowed.`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'X-Admin-Password']
}));

// Apply JSON body parsing middleware globally
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global Request Logger
app.use((req, res, next) => {
  console.log(`[server] Incoming Request: ${req.method} ${req.url}`);
  if (req.url.includes('mark-arrived')) {
    console.log(`[server] Debug: Hitting mark-arrived route!`);
  }
  next();
});

// Global real-time sync emitter for successful write operations
const { realtimeSyncMiddleware } = require('./middleware/realtimeSync');
app.use(realtimeSyncMiddleware);

// Import routes
const platformRoutes = require('./routes/platformRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const roleManagementRoutes = require('./routes/roleManagementRoutes');
const heroPromotionRoutes = require('./routes/heroPromotionRoutes');
const cartRoutes = require('./routes/cartRoutes');
const adminCategoryRoutes = require('./routes/adminCategoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const userManagementRoutes = require('./routes/userManagementRoutes');
const roleApplicationRoutes = require('./routes/roleApplicationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const profileRoutes = require('./routes/profileRoutes');
const socialMediaAccountRoutes = require('./routes/socialMediaAccountRoutes');
const contactRoutes = require('./routes/contactRoutes');
const productInquiryRoutes = require('./routes/productInquiryRoutes');
const fastFoodRoutes = require('./routes/fastFoodRoutes');
const marketingRoutes = require('./routes/marketingRoutes');
const imageRoutes = require('./routes/imageRoutes');
const jobOpeningRoutes = require('./routes/jobOpeningRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const ultraFastRoutes = require('./routes/ultraFastRoutes');
const cacheRoutes = require('./routes/cacheRoutes');
const searchRoutes = require('./routes/searchRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const walletRoutes = require('./routes/walletRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const pickupStationRoutes = require('./routes/pickupStationRoutes');
const stationManagerRoutes = require('./routes/stationManagerRoutes');
console.log('[server] Warehouse routes loaded:', typeof warehouseRoutes);
console.log('[server] Pickup Station routes loaded:', typeof pickupStationRoutes);
const financeRoutes = require('./routes/financeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const paymentEnhancementsRoutes = require('./routes/paymentEnhancementsRoutes');
const batchRoutes = require('./routes/batchRoutes');
const returnRoutes = require('./routes/returnRoutes');
const { startBatchAutomation } = require('./services/batchAutomation');
const { runAutoHandoverWorker } = require('./services/autoHandoverService');
// Initialize database connection
const { testConnection } = require('./database/database');

// Global Maintenance Mode Middleware
app.use(async (req, res, next) => {
  // Only enforce maintenance for API calls — let the SPA index.html load normally
  // The frontend handles redirects to /maintenance based on API errors.
  if (!req.path.startsWith('/api')) return next();

  // Always allow critical/admin/auth paths
  const allowList = [
    '/api/auth/login', 
    '/api/auth/me', 
    '/api/admin', 
    '/api/config', 
    '/api/platform',
    '/api/users/me',
    '/api/profile/dashboard-password' // Allow admins to unlock dashboard security
  ];
  const isAllowed = allowList.some(p => req.path.startsWith(p));
  if (isAllowed) return next();

  try {
    // Admin / Super-Admin JWT bypass — they can use the system even during maintenance
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const adminRoles = ['admin', 'super_admin', 'superadmin'];
        const userRole = decoded.role || '';
        const userRoles = Array.isArray(decoded.roles) ? decoded.roles : [];
        if (adminRoles.includes(userRole) || userRoles.some(r => adminRoles.includes(r))) {
          return next(); // Admin passes through
        }
      } catch (_) {
        // invalid/expired token — fall through to maintenance check
      }
    }

    const { PlatformConfig } = require('./models');
    const config = await PlatformConfig.findOne({ where: { key: 'maintenance_settings' } });
    if (config) {
      const settings = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      
      // 1. GLOBAL Check
      if (settings.enabled) {
        return res.status(503).json({ 
          success: false, 
          maintenance: true,
          message: settings.message || 'System is currently under maintenance. Please try again later.' 
        });
      }

      // 2. GRANULAR Check (for non-admins)
      if (settings.dashboards || settings.sections) {
        const path = req.path;
        let block = null;

        // Dashboard Mapping
        if (path.startsWith('/api/admin')) block = settings.dashboards?.admin;
        else if (path.startsWith('/api/seller')) block = settings.dashboards?.seller;
        else if (path.startsWith('/api/marketing')) block = settings.dashboards?.marketer;
        else if (path.startsWith('/api/delivery')) block = settings.dashboards?.delivery;
        else if (path.startsWith('/api/station') || path.startsWith('/api/pickup-station') || path.startsWith('/api/warehouse')) block = settings.dashboards?.station;
        else if (path.startsWith('/api/ops')) block = settings.dashboards?.ops;
        else if (path.startsWith('/api/logistics')) block = settings.dashboards?.logistics;
        else if (path.startsWith('/api/finance')) block = settings.dashboards?.finance;
        else if (path.startsWith('/api/service-provider')) block = settings.dashboards?.provider;
        
        // Public Section Mapping
        else if (path.startsWith('/api/products')) block = settings.sections?.products;
        else if (path.startsWith('/api/services')) block = settings.sections?.services;
        else if (path.startsWith('/api/fastfood')) block = settings.sections?.fastfood;

        if (block?.enabled) {
          // If it's a public section, return 404 to hide it "silently"
          const isSection = path.startsWith('/api/products') || path.startsWith('/api/services') || path.startsWith('/api/fastfood');
          
          if (isSection) {
            return res.status(404).json({
              success: false,
              message: 'Section not available'
            });
          }

          // Dashboards still return 503 for the proper redirect
          return res.status(503).json({
            success: false,
            maintenance: true,
            granular: true,
            message: block.message || 'This section is currently under maintenance.'
          });
        }
      }
    }
  } catch (err) {
    // Fail silent to allow app startup
    console.warn('[server] Maintenance check failed:', err.message);
  }
  next();
});

// Use routes
app.use('/api/platform', platformRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories/admin', adminCategoryRoutes);
app.use('/api/categories', categoryRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/role-applications', roleApplicationRoutes);
app.use('/api/roles', roleManagementRoutes);
app.use('/api/hero-promotions', heroPromotionRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/profile', profileRoutes); // Changed from /api/users to avoid conflict with userRoutes
app.use('/api/social-media-accounts', socialMediaAccountRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/product-inquiries', productInquiryRoutes);
app.use('/api/pickup-stations', pickupStationRoutes);
app.use('/api/station-manager', stationManagerRoutes);

app.use('/api/marketing', marketingRoutes);

app.use('/api/sellers', sellerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/fastfood', fastFoodRoutes);
app.use('/api/ultra-fast', ultraFastRoutes);
app.use('/api/cache', cacheRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/password-reset', require('./routes/passwordResetRoutes'));
console.log('✅ Password Reset Routes Mounted');
app.use('/api/images', imageRoutes);
app.use('/api/job-openings', jobOpeningRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/handover', require('./routes/handoverRoutes'));

console.log('[server] Mounting finance routes...');
app.use('/api/finance', financeRoutes);
app.use('/api/audit', financeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/payment-enhancements', paymentEnhancementsRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/returns', returnRoutes);
console.log('✅ Delivery Routes Mounted');
console.log('✅ Warehouse Routes Mounted');
console.log('✅ Pickup Station Routes Mounted');
console.log('✅ Payment Routes Mounted');

// Serve static files from uploads directory with aggressive caching
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Max-Age', '86400');

  // Cache images for 1 year (static/immutable)
  if (req.method === 'GET' && !req.url.includes('?')) {
    res.header('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.header('Cache-Control', 'public, max-age=3600'); // 1 hour for others
  }

  next();
}, express.static(path.join(__dirname, 'uploads')), (req, res) => {
  // Fallback: serve SVG placeholder for missing upload files (dev-friendly)
  const placeholderSvg = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="#f3f4f6"/>
  <rect x="140" y="120" width="120" height="100" rx="8" fill="#d1d5db"/>
  <circle cx="200" cy="155" r="20" fill="#9ca3af"/>
  <path d="M140 220 L175 175 L200 200 L230 165 L260 220 Z" fill="#9ca3af"/>
  <text x="200" y="270" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#9ca3af">No Image</text>
</svg>`;
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=60');
  res.send(placeholderSvg);
});

// Serve Frontend Static Files
// Priority 1: cPanel public_html
// Priority 2: Local 'public' folder (Production/Deployment)
// Priority 3: '../frontend/dist' (Development)
const cpanelPath = path.resolve(__dirname, '../public_html');
const productionPath = path.join(__dirname, 'public');
const developmentPath = path.join(__dirname, '../frontend/dist');
let staticPath = developmentPath;
if (fs.existsSync(cpanelPath) && fs.existsSync(path.join(cpanelPath, 'index.html'))) {
  staticPath = cpanelPath;
} else if (fs.existsSync(productionPath)) {
  staticPath = productionPath;
}

console.log(`[server] Serving static files from: ${staticPath}`);
app.use(express.static(staticPath));

// SPA Fallback - Always serve index.html for non-API routes.
// Maintenance enforcement happens at two levels:
//   1. API middleware (above) — blocks /api/* calls with 503 for non-admins
//   2. React frontend — interceptors and startup check redirect non-admins to /maintenance
// We do NOT serve a maintenance HTML page here because:
//   a) Browsers never send Authorization headers during page navigation (can't detect admin)
//   b) Serving raw HTML breaks Vite's lazy-loaded module imports
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/uploads')) {
    return next();
  }
  res.sendFile(path.join(staticPath, 'index.html'), err => err && next());
});



// Initialize SQLite performance tuning
const { sequelize } = require('./database/database'); // Verified

if (sequelize.options.dialect === 'sqlite') {
  sequelize.authenticate().then(() => {
    console.log('🔧 Running SQLite PRAGMA tuning...');
    sequelize.query('PRAGMA journal_mode = WAL;');
    sequelize.query('PRAGMA synchronous = NORMAL;');
    sequelize.query('PRAGMA temp_store = MEMORY;');
    sequelize.query('PRAGMA mmap_size = 30000000000;');
  }).catch(err => console.error('Failed to run PRAGMAs:', err));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    version: '1.1.0-payment-fix',
    timestamp: new Date().toISOString()
  });
});


// Error handling middleware
// Error handling middleware

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  
  const errorDetail = `\n--- ${new Date().toISOString()} ---\n` +
    `Request: ${req.method} ${req.url}\n` +
    `Error: ${err.message}\n` +
    `Stack: ${err.stack}\n` +
    `Body: ${JSON.stringify(req.body || {})}\n`;

  fs.appendFileSync(path.join(__dirname, 'error.log'), errorDetail);
  console.error('Error middleware:', err.stack);

  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      detail: 'Check backend/error.log for more info'
    })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Using fixed port 5001 for testing caching

// Socket.IO setup
const { createServer } = require('http');
const { Server } = require('socket.io');
const { setIO } = require('./realtime/socket');

// Start server after database connection
const DEFAULT_PORT = process.env.PORT || 5004;

async function startServer() {
  try {
    // Attempt database connection but don't crash if it fails
    try {
      await testConnection();
    } catch (dbError) {
      console.error('⚠️ Database connection failed, but starting server anyway:', dbError.message);
    }

    // Create HTTP server with timeout configuration
    const server = require('http').createServer(app);

    // Set server timeout to 60 seconds (60000ms)
    server.timeout = 60000;
    server.keepAliveTimeout = 65000; // Keep connection alive for 65 seconds

    // Heavy initializations moved to server.listen callback below

    // Initialize Socket.IO with CORS
    const socketAllowedOrigins = [
      process.env.FRONTEND_URL,
      'https://' + (new URL(process.env.FRONTEND_URL?.startsWith('http') ? process.env.FRONTEND_URL : `https://${process.env.FRONTEND_URL || 'localhost'}`)).hostname,
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://localhost:3000'
    ].filter(Boolean);
    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || socketAllowedOrigins.some(o => origin.startsWith(o))) {
            callback(null, true);
          } else {
            console.warn(`[Socket.IO CORS] Blocked: ${origin}`);
            callback(new Error(`Socket.IO CORS: origin '${origin}' is not allowed.`));
          }
        },
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['polling', 'websocket'], // Allow polling fallback for cPanel proxies
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Set up socket.io instance
    setIO(io);

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('join_user', (userId) => {
        if (userId) {
          socket.join(`user_${userId}`);
          socket.join(`user:${userId}`);
          console.log(`User ${userId} joined their room`);
        }
      });

      socket.on('join_admin', () => {
        socket.join('admin_room');
        socket.join('admin');
        console.log('Admin connected to admin room');
      });

      socket.on('delivery_message_send', async (data) => {
        const { receiverId } = data;
        // Real-time broadcast for non-REST messages (if any)
        // However, we now prefer REST API for persistence + broadcast.
        // This handler remains for legacy/simultaneous support but WITHOUT DB write.
        io.to(`user_${receiverId}`).emit('delivery_message_receive', data);
      });

      socket.on('delivery_typing', (data) => {
        const { receiverId, orderId, isTyping } = data;
        io.to(`user_${receiverId}`).emit('delivery_typing_receive', {
          senderId: data.senderId,
          orderId,
          isTyping
        });
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    // Start the server
    server.listen(DEFAULT_PORT, () => {
      console.log(`🚀 Server running on port ${DEFAULT_PORT} - REBOOT SUCCESSFUL - Version: ${Date.now()}`);
      
      // DEFERRED INITIALIZATION: Start heavy services after the port is open
      setImmediate(async () => {
        try {
          console.log('🔄 Initializing deferred services (WhatsApp, Workers, Cron)...');
          // Initialize OTP services (including WhatsApp Free Client)
          require('./utils/messageService');
          
          const { initScheduledTasks } = require('./cron/scheduledTasks');
          initScheduledTasks();
          runAutoHandoverWorker();
          console.log('✨ All background services initialized.');
        } catch (deferredErr) {
          console.error('⚠️ Critical Error during deferred initialization:', deferredErr.message);
        }
      });
    });

    // Handle server errors
    server.on('error', (err) => {
      console.error('❌ Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${DEFAULT_PORT} is already in use. Please stop any other services using this port.`);
      }
      // Do NOT process.exit(1) here in production managed environments
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error('UNHANDLED REJECTION! 💥 Logging error...');
      console.error(err.name, err.message);
      // Removed server.close() to prevent 503 loop
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully');
      server.close(() => {
        console.log('Process terminated');
      });
    });

  } catch (error) {
    console.error('Failed the initial startup sequence:', error.message);
    // Proceed to try listen anyway if possible, or fallback
  }
}

// Always start the server ONLY if run directly (node server.js)
if (require.main === module) {
  startServer();
}

// Export for cPanel/Passenger or tests
module.exports = app;

// Restart 1772711452057// Restart 1774100536.86857
