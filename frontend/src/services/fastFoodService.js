import api from './api';
import { isFastFoodOpen } from '../utils/availabilityUtils';

class FastFoodService {
  async createFastFood(formData) {
    const response = await api.post('/fast-food', formData);
    return response.data;
  }

  // Get all fast food items with filters
  async getAllFastFoods(filters = {}) {
    const params = new URLSearchParams();

    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== '') {
        params.append(key, filters[key]);
      }
    });

    const response = await api.get(`/fast-food?${params.toString()}`);
    return response.data;
  }

  // Get fast food item by ID
  async getFastFoodById(id) {
    const response = await api.get(`/fast-food/${id}`);
    return response.data;
  }

  // Update fast food item
  async updateFastFood(id, formData) {
    // Use PATCH for simple field updates (no files), PUT for full updates with files
    const hasFiles = formData instanceof FormData;
    const method = hasFiles ? 'put' : 'patch';
    const response = await api[method](`/fast-food/${id}`, formData);
    return response.data;
  }

  // Delete fast food item (moves to recycle bin)
  async deleteFastFood(id, reason = '') {
    const config = reason ? { data: { reason } } : {};
    const response = await api.delete(`/fast-food/${id}`, config);
    return response.data;
  }
  
  // Get deleted fast food items
  async getDeletedFastFoods() {
    const response = await api.get('/fast-food/deleted');
    return response.data;
  }

  // Restore deleted fast food item
  async restoreFastFood(id) {
    const response = await api.post(`/fast-food/restore/${id}`);
    return response.data;
  }

  // Permanently delete fast food item
  async permanentlyDeleteFastFood(id) {
    const response = await api.delete(`/fast-food/permanent/${id}`);
    return response.data;
  }

  // Get available items for a vendor
  async getAvailableItems(vendorId) {
    const response = await api.get(`/fast-food/available/${vendorId}`);
    return response.data;
  }

  // Get vendor's fast food items
  async getVendorFastFoods(vendorId) {
    const url = vendorId ? `/fast-food/vendor/${vendorId}` : '/fast-food/vendor/me';
    const response = await api.get(url);
    return response.data;
  }

  // Add review to fast food item
  async addReview(id, reviewData) {
    const response = await api.post(`/fast-food/${id}/reviews`, reviewData);
    return response.data;
  }

  // Update order count
  async updateOrderCount(id) {
    const response = await api.patch(`/fast-food/${id}/order-count`);
    return response.data;
  }

  // Upload review image
  async uploadReviewImage(formData) {
    const response = await api.post('/fast-food/upload-review-image', formData);
    return response.data;
  }

  // Get categories
  async getCategories() {
    const response = await api.get('/fast-food/categories');
    return response.data;
  }

  // Check availability
  async checkAvailability(id) {
    const response = await api.get(`/fast-food/${id}/availability`);
    return response.data;
  }

  // Utility methods
  formatPrice(fastFood) {
    const originalPrice = parseFloat(fastFood.basePrice);
    const discountPercentage = fastFood.discountPercentage || 0;
    const finalPrice = discountPercentage > 0
      ? originalPrice * (1 - discountPercentage / 100)
      : originalPrice;

    return {
      originalPrice,
      finalPrice,
      discountPercentage,
      savings: discountPercentage > 0 ? originalPrice - finalPrice : 0
    };
  }

  getAvailabilityStatus(fastFood) {
    try {
      if (!fastFood) return { isAvailable: false, state: 'ERROR', reason: 'No data' };

      // 1. Platform & Manual Override      // Check if item is suspended (using isActive instead of status)
      if (!fastFood.isActive) {
        return { isAvailable: false, reason: 'This item has been suspended' };
      }

      if (fastFood.isActive === false) {
        return { isAvailable: false, state: 'HIDDEN', reason: 'Hidden from menu' };
      }

      // 2. Main opening logic via utility
      const isOpen = isFastFoodOpen(fastFood);
      const mode = fastFood.availabilityMode || 'AUTO';

      if (mode === 'CLOSED') {
        return { isAvailable: false, state: 'CLOSED', reason: 'CLOSED' };
      }

      if (mode === 'OPEN') {
        return { isAvailable: true, state: 'OPEN', reason: 'Manually opened by seller' };
      }

      // 3. AUTO Mode results
      if (isOpen) {
        // Additional check: daily limit
        if (fastFood.dailyLimit > 0 && fastFood.todayOrderCount >= fastFood.dailyLimit) {
          return { isAvailable: false, state: 'CLOSED', reason: 'Sold out for today (Limit reached)' };
        }
        return { isAvailable: true, state: 'OPEN', reason: 'Accepting orders' };
      } else {
        return { isAvailable: false, state: 'CLOSED', reason: 'CLOSED' };
      }
    } catch (error) {
      console.error('Error in getAvailabilityStatus:', error);
      return { isAvailable: false, state: 'ERROR', reason: 'Availability check failed' };
    }
  }

  // Validate fast food data
  validateFastFoodData(data) {
    const errors = [];

    if (!data.name || data.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (!data.category || data.category.trim().length === 0) {
      errors.push('Category is required');
    }

    if (!data.shortDescription || data.shortDescription.trim().length === 0) {
      errors.push('Short description is required');
    }

    if (!data.basePrice || isNaN(data.basePrice) || data.basePrice <= 0) {
      errors.push('Valid base price is required');
    }

    if (!data.availableFrom || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.availableFrom)) {
      errors.push('Valid available from time (HH:MM) is required');
    }

    if (!data.availableTo || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.availableTo)) {
      errors.push('Valid available to time (HH:MM) is required');
    }

    // Check if "to" time is after "from" time
    if (data.availableFrom && data.availableTo) {
      const fromTime = data.availableFrom.split(':');
      const toTime = data.availableTo.split(':');
      const fromMinutes = parseInt(fromTime[0]) * 60 + parseInt(fromTime[1]);
      const toMinutes = parseInt(toTime[0]) * 60 + parseInt(toTime[1]);

      if (toMinutes <= fromMinutes) {
        errors.push('Available to time must be after available from time');
      }
    }

    if (!data.preparationTimeMinutes || isNaN(data.preparationTimeMinutes) || data.preparationTimeMinutes <= 0) {
      errors.push('Valid preparation time is required');
    }

    if (!data.kitchenVendor || data.kitchenVendor.trim().length === 0) {
      errors.push('Kitchen vendor is required');
    }

    if (!data.deliveryTimeEstimateMinutes || isNaN(data.deliveryTimeEstimateMinutes) || data.deliveryTimeEstimateMinutes <= 0) {
      errors.push('Valid delivery time estimate is required');
    }

    if (!data.vendor || isNaN(data.vendor)) {
      errors.push('Vendor is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Generate sample fast food data for testing
  generateSampleData() {
    return {
      name: 'Delicious Burger',
      category: 'Burgers & Sandwiches',
      shortDescription: 'A juicy beef burger with fresh lettuce, tomato, and special sauce',
      basePrice: 450.00,
      discountPercentage: 10,
      availableFrom: '08:00',
      availableTo: '22:00',
      availabilityDays: [
        { day: 'All Days', available: true }
      ],
      preparationTimeMinutes: 15,
      sizeVariants: [
        { name: 'Regular', price: 0, description: 'Standard size' },
        { name: 'Large', price: 50, description: 'Bigger portion' }
      ],
      isComboOption: false,
      comboOptions: [],
      dailyLimit: 0,
      ingredients: [
        { name: 'Beef Patty', quantity: '1', unit: 'piece' },
        { name: 'Bun', quantity: '1', unit: 'piece' },
        { name: 'Lettuce', quantity: '2', unit: 'leaves' },
        { name: 'Tomato', quantity: '2', unit: 'slices' }
      ],
      kitchenVendor: 'Main Kitchen',
      deliveryTimeEstimateMinutes: 25,
      pickupAvailable: true,
      deliveryAreaLimits: ['Campus', 'Downtown', 'University Area'],
      vendor: 1, // Default vendor ID
      tags: ['popular', 'beef', 'burger'],
      isAvailable: true,
      nutritionalInfo: {
        calories: '450',
        protein: '25g',
        carbs: '35g',
        fat: '20g'
      },
      allergens: ['gluten'],
      spiceLevel: 'medium',
      customizations: []
    };
  }

  // Batch System Methods
  async createBatch(batchData) {
    const response = await api.post('/batches', batchData);
    return response.data;
  }

  async getAllBatches() {
    const response = await api.get('/batches');
    return response.data;
  }

  async getActiveBatches() {
    const response = await api.get('/batches/active');
    return response.data;
  }

  async updateBatch(id, batchData) {
    const response = await api.put(`/batches/${id}`, batchData);
    return response.data;
  }

  async updateBatchStatus(id, status) {
    const response = await api.patch(`/batches/${id}/status`, { status });
    return response.data;
  }

  async toggleAutomation(id) {
    const response = await api.patch(`/batches/${id}/toggle-automation`);
    return response.data;
  }

  async deleteBatch(id) {
    const response = await api.delete(`/batches/${id}`);
    return response.data;
  }

  async getBatchSystemConfig() {
    // This is the admin version
    const response = await api.get('/admin/config/batch_system_enabled');
    return response.data;
  }

  async getPublicBatchSystemConfig() {
    // This is the public version
    const response = await api.get('/fast-food/config/batch_system_enabled');
    return response.data;
  }

  async updateBatchSystemConfig(enabled) {
    const response = await api.post('/admin/config/batch_system_enabled', {
      value: enabled ? 'true' : 'false'
    });
    return response.data;
  }

  async getBatchHistory() {
    const response = await api.get('/orders/batch/history');
    return response.data;
  }
}

export const fastFoodService = new FastFoodService();