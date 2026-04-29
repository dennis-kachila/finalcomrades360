import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Create an axios instance with default config
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the auth token if it exists
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Create a dedicated axios instance for products
const productsClient = axios.create({
  baseURL: `${API_BASE}/products`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Apply the same request interceptor to productsClient
productsClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// API functions for products
export const productApi = {
  // Client for direct API calls
  client: productsClient,

  // Get all products
  getAll: (params = {}) => productsClient.get('/', { params }),

  // Get a single product by ID
  getById: (id) => productsClient.get(`/${id}`),

  // Create a new product
  create: (productData) => productsClient.post('/', productData),

  // Update a product
  update: (id, productData) => productsClient.put(`/${id}`, productData),

  // Delete a product
  delete: (id) => productsClient.delete(`/${id}`),

  // Search products
  search: (query) => productsClient.get(`/search?q=${encodeURIComponent(query)}`),

  // Get pending products
  getPending: (params = {}) => api.get('/admin/products/pending', { params }),

  // Category methods
  getCategories: () => api.get('/categories'),
  getCategory: (id) => api.get(`/categories/${id}`),
  getSubcategories: (categoryId) => api.get(`/categories/${categoryId}/subcategories`),
  getSubcategory: (categoryId, subcategoryId) => api.get(`/categories/${categoryId}/subcategories/${subcategoryId}`),
};

export const orderApi = {
  parseDirect: (data) => api.post('/orders/direct/parse', data),
  confirmDirect: (data) => api.post('/orders/direct/confirm', data),
  listDirect: () => api.get('/orders/direct/list'),
};

export default api;
