import axios from 'axios';

// Backend API base URL - using port 5000
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Base API client
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for sending cookies with cross-origin requests
  timeout: 10000, // 10 seconds timeout
});

// Request interceptor to add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        // Clear local storage and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Only redirect if not already on the login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      } else if (error.response.status === 403) {
        // Handle 403 Forbidden errors
        const errorMessage = error.response.data?.message || 'You do not have permission to perform this action';
        console.error('Forbidden:', errorMessage);
      }
    }
    return Promise.reject(error);
  }
);

// Admin client with specific configurations
const adminClient = axios.create({
  baseURL: `${API_BASE}/admin`,
  headers: {
    'Accept': 'application/json, text/csv, */*',
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 15000, // 15 seconds timeout for admin operations
});

// Apply interceptors to adminClient
adminClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // For file downloads, we need to set responseType to 'blob' and adjust headers
    if (config.url && config.url.includes('/export')) {
      config.responseType = 'blob';
      config.headers['Accept'] = 'text/csv';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

adminClient.interceptors.response.use(
  (response) => {
    // If this is a file download, return the response as is
    if (response.config.responseType === 'blob') {
      return response;
    }
    return response;
  },
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      } else if (error.response.status === 403) {
        const errorMessage = error.response.data?.message || 'You do not have permission to perform this action';
        console.error('Forbidden:', errorMessage);
      }
    }
    return Promise.reject(error);
  }
);

// Products client
const productsClient = axios.create({
  baseURL: `${API_BASE}/products`,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 10000,
});

// Apply interceptors to productsClient
productsClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

productsClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

// API functions for products
export const productApi = {
  // Client for direct API calls
  client: productsClient,

  // Get all products
  getAll: () => productsClient.get('/'),

  // Get products added by super admin
  getBySuperAdmin: () => api.get('/products/superadmin'),

  // Hero promotions API
  getHeroPromotions: {
    // Get active hero promotions
    getActive: () => api.get('/hero-promotions/active'),
  },

  // Get pending products for approval (admin endpoint)
  getPending: () => adminClient.get('/products/pending'),

  // Approve/reject products
  approve: (id, data = {}) => adminClient.put(`/products/${id}/approve`, data),
  reject: (id, reason) => adminClient.put(`/products/${id}/reject`, { reason }),

  // Super Admin Security Management
  initiateSecurityChange: (newEmail) => adminClient.post('/security/initiate-change', { newEmail }),
  finalizeSecurityChange: (data) => adminClient.post('/security/finalize-change', data),

  // Get a single product by ID
  getById: (id) => productsClient.get(`/${id}`),

  // Create a new product
  create: (productData) => productsClient.post('/', productData),

  // Update a product
  update: (id, productData) => productsClient.put(`/${id}`, productData),

  // Delete a product
  delete: (id) => productsClient.delete(`/${id}`),

  // Search products
  search: (query) => productsClient.get('/search', { params: { q: query } }),

  // Category methods
  getCategories: () => api.get('/categories'),
  getCategory: (id) => api.get(`/categories/${id}`),
  getSubcategories: (categoryId) => api.get(`/categories/${categoryId}/subcategories`),
  getSubcategory: (categoryId, subcategoryId) =>
    api.get(`/categories/${categoryId}/subcategories/${subcategoryId}`),

  // Admin category methods
  createCategory: (categoryData) => adminClient.post('/categories', categoryData),
  createSubcategory: (subcategoryData) => adminClient.post('/subcategories', subcategoryData),

  // Check for duplicate products
  checkDuplicate: (params) => productsClient.get('/check-duplicate', { params }),

  // Toggle product visibility (hide/unhide)
  toggleVisibility: (id) => adminClient.patch(`/products/${id}/visibility`),

  // Suspend product
  suspend: (id, suspensionData) => adminClient.post(`/products/${id}/suspend`, suspensionData),
};

// Admin API functions
export const adminApi = {
  // Inventory management
  getInventoryOverview: () => adminClient.get('/inventory/overview'),
  getLowStockAlerts: () => adminClient.get('/inventory/low-stock'),
  updateStockLevels: (productId, payload) =>
    adminClient.patch(`/inventory/products/${productId}/stock`, payload),

  // Product analytics
  getProductAnalytics: () => adminClient.get('/analytics/products'),
  getTopPerformingProducts: () => adminClient.get('/analytics/products/top-performing'),
  getProductPerformanceMetrics: (productId) =>
    adminClient.get(`/analytics/products/${productId}/metrics`),

  // User management analytics
  getUserAnalytics: () => adminClient.get('/analytics/users'),
  getAllUsers: (params = {}) => adminClient.get('/users', { params }),
  getRoleApplications: (params = {}) => adminClient.get('/role-applications', { params }),
  updateApplicationStatus: (id, data) =>
    adminClient.patch(`/role-applications/${id}`, data),
  updateUserRole: (userId, role) =>
    adminClient.patch(`/users/${userId}/role`, { role }),
  updateUserStatus: (userId, isDeactivated) =>
    adminClient.patch(`/users/${userId}/status`, { isDeactivated }),
  bulkUserOperation: (userIds, action) =>
    adminClient.post('/users/bulk-operation', { userIds, action }),

  // Export user data to CSV
  exportUserReport: () => adminClient.get('/users/export', {
    responseType: 'blob', // Important for file downloads
    headers: {
      'Accept': 'text/csv',
      'Content-Type': 'text/csv',
    }
  }),
  getRevenueAnalytics: () => adminClient.get('/analytics/revenue')
};

export default api;
