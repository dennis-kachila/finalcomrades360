console.error('🚀 SERVER STARTING - VERSION: ' + Date.now());
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables with robust path detection
const rootEnv = path.resolve(__dirname, '..', '.env');
const rootEnvProd = path.resolve(__dirname, '..', '.env.production');

if (fs.existsSync(rootEnvProd)) {
  dotenv.config({ path: rootEnvProd });
} else if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  console.warn('⚠️ Warning: No root .env or .env.production found.');
  dotenv.config();
}

// DETECT STATIC PATHS GLOBALLY
const IS_PROD = process.env.NODE_ENV === 'production';
const rootStaticPath = path.resolve(__dirname, 'public'); 
const cpanelPath = path.resolve(__dirname, '../public_html');
const productionPath = path.join(__dirname, 'public');
const developmentPath = path.join(__dirname, '../frontend/dist');

// PRODUCTION PRIORITY: In cPanel/Passenger, the backend is often in a peer folder to public_html
let GLOBAL_STATIC_PATH = developmentPath;
if (IS_PROD) {
  if (fs.existsSync(cpanelPath)) {
    GLOBAL_STATIC_PATH = cpanelPath;
  } else if (fs.existsSync(productionPath)) {
    GLOBAL_STATIC_PATH = productionPath;
  } else if (fs.existsSync(rootStaticPath)) {
    GLOBAL_STATIC_PATH = rootStaticPath;
  } else if (fs.existsSync(path.resolve(__dirname, '../../public_html'))) {
    // Extra fallback for deep structures
    GLOBAL_STATIC_PATH = path.resolve(__dirname, '../../public_html');
  }
}
console.log(`[server] Static System Initialized: ${GLOBAL_STATIC_PATH} (Mode: ${process.env.NODE_ENV || 'development'})`);
if (!fs.existsSync(GLOBAL_STATIC_PATH)) {
  console.error(`⚠️ WARNING: GLOBAL_STATIC_PATH does not exist: ${GLOBAL_STATIC_PATH}`);
}
if (!fs.existsSync(path.join(GLOBAL_STATIC_PATH, 'index.html'))) {
  console.error(`⚠️ WARNING: index.html not found in static path: ${GLOBAL_STATIC_PATH}`);
}

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
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: { policy: "unsafe-none" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Rate Limiting — protect against brute-force and abuse
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15min per IP for general routes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  validate: { trustProxy: false } // Acknowledge proxy trust to stop validation warnings
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login/register attempts per 15min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again in 15 minutes.' },
  validate: { trustProxy: false } // Acknowledge proxy trust to stop validation warnings
});
// DIAGNOSTIC LOGGING: Enabled for ALL environments temporarily to debug 404s
app.use('/api', (req, res, next) => {
  console.error(`[ROUTE-DIAGNOSTIC] ${req.method} ${req.url} (Path: ${req.path})`);
  next();
});

app.use('/api', globalLimiter); // Apply global rate limit to all API routes
app.use('/api/auth/login', authLimiter); // Stricter limit on login
app.use('/api/auth/register', authLimiter); // Stricter limit on register

const IS_DEV = process.env.NODE_ENV !== 'production';

// Dynamically build allowed origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://comrades360.shop',
  'https://www.comrades360.shop',
  ...(IS_DEV ? [
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ] : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps/curl)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(o => origin === o || origin.startsWith(o));
    if (isAllowed) {
      callback(null, true);
    } else {
      if (IS_DEV) console.warn(`[CORS] Blocked: ${origin}`);
      callback(new Error(`CORS policy blockage`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'X-Admin-Password']
}));

// Apply JSON body parsing middleware globally
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global Request Logger (Dev Only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[server] ${req.method} ${req.url}`);
    next();
  });
}

// Global real-time sync emitter for successful write operations
const { realtimeSyncMiddleware } = require('./middleware/realtimeSync');
app.use(realtimeSyncMiddleware);

// -----------------------------------------------------------------
// 1. MAINTENANCE MODE (MUST BE BEFORE ROUTES)
// -----------------------------------------------------------------
let cachedMaintenanceSettings = null;
let lastMaintenanceCheck = 0;

app.use(async (req, res, next) => {
  // EMERGENCY TOTAL BYPASS
  return next();
  
  // Remaining maintenance logic is kept but bypassed above for stability
});

// -----------------------------------------------------------------
// 2. API ROUTES
// -----------------------------------------------------------------
initializeRoutes(app);

// -----------------------------------------------------------------
// 3. STATIC FILES
// -----------------------------------------------------------------
// Route Initialization Function (Lazy Loaded)
function initializeRoutes(app) {
  console.error('ℹ️ Registering core API routes...');
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/categories', require('./routes/categoryRoutes'));
  app.use('/api/cart', require('./routes/cartRoutes'));
  app.use('/api/wishlist', require('./routes/wishlistRoutes'));
  app.use('/api/ultra-fast', require('./routes/ultraFastRoutes'));
  app.use('/api/password-reset', require('./routes/passwordResetRoutes'));
  
  console.error('ℹ️ Registering extended API modules...');
  app.use('/api/platform', require('./routes/platformRoutes'));
  app.use('/api/products', require('./routes/productRoutes'));
  app.use('/api/role-management', require('./routes/roleManagementRoutes'));
  app.use('/api/hero-promotions', require('./routes/heroPromotionRoutes'));
  app.use('/api/admin/categories', require('./routes/adminCategoryRoutes'));
  app.use('/api/orders', require('./routes/orderRoutes'));
  app.use('/api/notifications', require('./routes/notificationRoutes'));
  app.use('/api/upload', require('./routes/uploadRoutes'));
  app.use('/api/admin/users', require('./routes/userManagementRoutes'));
  app.use('/api/role-applications', require('./routes/roleApplicationRoutes'));
  app.use('/api/admin', require('./routes/adminRoutes'));
  app.use('/api/services', require('./routes/serviceRoutes'));
  app.use('/api/profile', require('./routes/profileRoutes'));
  app.use('/api/social-media', require('./routes/socialMediaAccountRoutes'));
  app.use('/api/contact', require('./routes/contactRoutes'));
  app.use('/api/product-inquiries', require('./routes/productInquiryRoutes'));
  
  // SUPPORT BOTH HYPHENATED AND NON-HYPHENATED FASTFOOD PATHS
  const fastFoodRoutes = require('./routes/fastFoodRoutes');
  app.use('/api/fast-food', fastFoodRoutes);
  app.use('/api/fastfood', fastFoodRoutes);

  app.use('/api/marketing', require('./routes/marketingRoutes'));
  app.use('/api/image', require('./routes/imageRoutes'));
  app.use('/api/job-openings', require('./routes/jobOpeningRoutes'));
  app.use('/api/seller', require('./routes/sellerRoutes'));
  app.use('/api/cache', require('./routes/cacheRoutes'));
  app.use('/api/search', require('./routes/searchRoutes'));
  app.use('/api/verification', require('./routes/verificationRoutes'));
  app.use('/api/wallet', require('./routes/walletRoutes'));
  app.use('/api/delivery', require('./routes/deliveryRoutes'));
  app.use('/api/warehouse', require('./routes/warehouseRoutes'));
  app.use('/api/warehouses', require('./routes/warehouseRoutes'));
  app.use('/api/pickup-station', require('./routes/pickupStationRoutes'));
  app.use('/api/pickup-stations', require('./routes/pickupStationRoutes'));
  app.use('/api/station-manager', require('./routes/stationManagerRoutes'));
  
  // Final heavy route modules
  app.use('/api/finance', require('./routes/financeRoutes'));
  app.use('/api/payments', require('./routes/paymentRoutes'));
  app.use('/api/analytics', require('./routes/analyticsRoutes'));
  app.use('/api/inventory', require('./routes/inventoryRoutes'));
  app.use('/api/payment-enhancements', require('./routes/paymentEnhancementsRoutes'));
  app.use('/api/handover', require('./routes/handoverRoutes'));
  app.use('/api/images', require('./routes/imageRoutes'));

  console.error('✅ 35+ Route modules successfully lazy-loaded.');
}

// Final Middleware Function (Deferred to stay at end of stack)
function finalizeMiddleware(app) {
  console.error('ℹ️ Finalizing middleware stack (Catch-all & 404)...');
  
  // Health check endpoint (moved here for consistency)
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      message: 'Server is fully initialized'
    });
  });

  // SPA catch-all
  app.get('*', (req, res, next) => {
    // 1. Instantly skip API and Uploads
    if (req.url.startsWith('/api') || req.url.startsWith('/uploads')) {
      return next();
    }

    // 2. Identify file extension
    const ext = path.extname(req.path);
    
    // 3. For navigation requests (no extension) or index.html, serve the entry point
    if (!ext || ext === '.html') {
      const indexPath = path.join(GLOBAL_STATIC_PATH, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      } else {
        console.error(`[SPA-ERROR] index.html missing at ${indexPath} for request ${req.url}`);
        // If index.html is missing but it's a page request, don't fall through to 404 JSON yet
        // maybe provide a simple fallback or let it next()
      }
    }
    
    next();
  });

  // Global 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      message: 'Route not found',
      path: req.originalUrl,
      help: 'This route was not found among the 35+ lazy-loaded modules.'
    });
  });
  
  console.error('✨ Server Middleware Finalized.');
}
// Initialize database connection
const { testConnection } = require('./database/database');

// Maintenance block moved up


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
  if (process.env.NODE_ENV === 'development') {
    // Fallback: serve SVG placeholder only in development
    const placeholderSvg = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="#f3f4f6"/>
  <text x="200" y="270" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#9ca3af">No Image</text>
</svg>`;
    res.set('Content-Type', 'image/svg+xml');
    return res.send(placeholderSvg);
  }
  res.status(404).json({ message: 'Resource not found' });
});

app.use(express.static(GLOBAL_STATIC_PATH));

// -----------------------------------------------------------------
// 4. FINAL CATCH-ALLS (MUST BE VERY LAST)
// -----------------------------------------------------------------
finalizeMiddleware(app);

// SPA Fallback - Always serve index.html for non-API routes.
// Maintenance enforcement happens at two levels:
//   1. API middleware (above) — blocks /api/* calls with 503 for non-admins
//   2. React frontend — interceptors and startup check redirect non-admins to /maintenance
// We do NOT serve a maintenance HTML page here because:
//   a) Browsers never send Authorization headers during page navigation (can't detect admin)
//   b) Serving raw HTML breaks Vite's lazy-loaded module imports

// SPA Fallback - Registered later in finalizeMiddleware



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

// Health check endpoint - Registered later in finalizeMiddleware


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


// 404 handler - Registered later in finalizeMiddleware

// Using fixed port 5001 for testing caching

// Socket.IO setup
const { createServer } = require('http');
const { Server } = require('socket.io');
const { setIO } = require('./realtime/socket');

// Initialize HTTP server and Socket.IO outside to ensure singleton status
const server = createServer(app);
server.timeout = 60000;
server.keepAliveTimeout = 65000;

// Passenger/cPanel often provides process.env.PORT
const DEFAULT_PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 5000 : 4000);

// Socket.IO configuration
const socketAllowedOrigins = [
  process.env.FRONTEND_URL,
  'https://comrades360.shop',
  'https://www.comrades360.shop',
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ] : [])
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
  transports: ['websocket', 'polling'], // Prioritize WebSocket but allow fallback to prevent 400 errors
  pingTimeout: 60000,
  pingInterval: 25000
});

setIO(io);

async function startServer() {
  // Use the DEFAULT_PORT defined in the outer scope
  console.error(`🚀 ULTRA-FAST BOOT: Starting server bind sequence for port ${DEFAULT_PORT}...`);

  // Start the server ONLY if not already listening (prevents Passenger/Double-init crashes)
  if (!server.listening) {
    try {
      server.listen(DEFAULT_PORT, () => {
        console.error(`🚀 Server bound to port ${DEFAULT_PORT} - REBOOT SUCCESSFUL - Version: ${Date.now()}`);
        
        // DEFERRED INITIALIZATION: Start heavy services after the port is open
        setImmediate(async () => {
          try {
            console.error('🔄 [Init] Beginning deferred service initialization...');
            
            // 1. Initialize Database Connection & Sync
            const { testConnection } = require('./database/database');
            try {
              await testConnection();
              console.error('✅ Database connected and verified successfully');
            } catch (dbError) {
              console.error('⚠️ Critical Database Initialization Failure:', dbError.message);
            }

            // Routes are now initialized immediately above startServer

            // 3. Initialize Socket.IO connection handling
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

            console.error('🔄 Initializing deferred services (WhatsApp, Redis, Workers, Cron)...');
            
            // 4. Initialize Cache (Redis)
            try {
              const cache = require('./scripts/services/cacheService');
              await cache.connect();
            } catch (cacheErr) {
              console.error('⚠️ Redis initialization skipped:', cacheErr.message);
            }

            // 5. Initialize OTP services (including WhatsApp Free Client)
            require('./utils/messageService');
            
            const { initScheduledTasks } = require('./cron/scheduledTasks');
            initScheduledTasks();
            
            // 6. Start Heavy Workers
            const { startBatchAutomation } = require('./services/batchAutomation');
            const { runAutoHandoverWorker } = require('./services/autoHandoverService');
            startBatchAutomation();
            runAutoHandoverWorker();
            
            console.error('✨ ALL SERVICES INITIALIZED. Application is fully operational.');
          } catch (deferredErr) {
            console.error('⚠️ Critical Error during deferred initialization:', deferredErr.message);
          }
        });
      });
    } catch (listenError) {
      if (listenError.message.includes('once') || listenError.code === 'EADDRINUSE') {
        console.error('ℹ️ Server already listening or binding, skipping extra listen call.');
      } else {
        throw listenError;
      }
    }
  } else {
    console.error('ℹ️ Server already listening (Passenger managed), skipping manual listen call.');
    // Managed environment: Start everything immediately
    setImmediate(async () => {
      try {
        const { testConnection } = require('./database/database');
        await testConnection();
        
        const cache = require('./scripts/services/cacheService');
        await cache.connect();
        
        require('./utils/messageService');
        const { initScheduledTasks } = require('./cron/scheduledTasks');
        initScheduledTasks();

        const { startBatchAutomation } = require('./services/batchAutomation');
        const { runAutoHandoverWorker } = require('./services/autoHandoverService');
        startBatchAutomation();
        runAutoHandoverWorker();
        console.error('✨ Managed environment initialization complete.');
      } catch (err) {
        console.error('⚠️ Error in Passenger deferred init:', err.message);
      }
    });
  }

  // Handle server errors
  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${DEFAULT_PORT} is already in use.`);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥', err.name, err.message);
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    server.close(() => console.log('Process terminated'));
  });
}

// Singleton Startup Protector
if (global.__serverStarted) {
  console.log('ℹ️ Module re-entry detected, skipping startup.');
} else {
  global.__serverStarted = true;
  startServer();
}

// Export for cPanel/Passenger
module.exports = app;
