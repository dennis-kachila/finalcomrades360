const redis = require('redis');
const { promisify } = require('util');

class CacheService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.fallback = new Map(); // In-memory fallback when Redis is not available
  }

  async connect() {
    try {
      // Avoid connecting if no host is provided in development
      if (!process.env.REDIS_HOST && !process.env.REDIS_URL && process.env.NODE_ENV === 'development') {
        console.info('[Cache] Skipping Redis connection (not configured for development)');
        return false;
      }

      // Try to connect to Redis
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.warn('[Cache] Redis connection refused, using in-memory cache');
            return undefined; // Stop retrying
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.warn('[Cache] Retry time exhausted, using in-memory cache');
            return undefined;
          }
          if (options.attempt > 5) { // Reduced from 10
            console.warn('[Cache] Max retry attempts reached, using in-memory cache');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          this.connected = false;
        } else {
          console.warn('[Cache] Redis error, falling back to in-memory cache:', err.message);
          this.connected = false;
        }
      });

      this.client.on('connect', () => {
        console.log('[Cache] Redis connected successfully');
        this.connected = true;
      });

      this.client.on('ready', () => {
        console.log('[Cache] Redis client ready');
        this.connected = true;
      });

      // Wait for connection return or timeout
      return new Promise((resolve) => {
        this.client.once('ready', () => resolve(true));
        this.client.once('error', () => resolve(false));

        // Timeout after 1 second for faster startup
        setTimeout(() => {
          if (!this.connected) {
            console.warn('[Cache] Redis connection timeout, using in-memory cache');
          }
          resolve(false);
        }, 1000);
      });

    } catch (error) {
      console.warn('[Cache] Redis not available, using in-memory cache:', error.message);
      this.connected = false;
      return false;
    }
  }

  // Get method with fallback
  async get(key) {
    try {
      if (this.connected && this.client) {
        const getAsync = promisify(this.client.get).bind(this.client);
        const value = await getAsync(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Fallback to in-memory cache
        const item = this.fallback.get(key);
        if (item && item.expiresAt > Date.now()) {
          return item.value;
        }
        this.fallback.delete(key);
        return null;
      }
    } catch (error) {
      console.warn('[Cache] Get error:', error.message);
      return null;
    }
  }

  // Set method with fallback
  async set(key, value, ttlSeconds = 300) {
    try {
      if (this.connected && this.client) {
        const setAsync = promisify(this.client.setex).bind(this.client);
        await setAsync(key, ttlSeconds, JSON.stringify(value));
      } else {
        // Fallback to in-memory cache
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.fallback.set(key, { value, expiresAt });

        // Clean up expired entries periodically
        if (this.fallback.size % 100 === 0) {
          this.cleanup();
        }
      }
      return true;
    } catch (error) {
      console.warn('[Cache] Set error:', error.message);
      return false;
    }
  }

  // Delete method
  async del(key) {
    try {
      if (this.connected && this.client) {
        const delAsync = promisify(this.client.del).bind(this.client);
        await delAsync(key);
      } else {
        this.fallback.delete(key);
      }
      return true;
    } catch (error) {
      console.warn('[Cache] Delete error:', error.message);
      return false;
    }
  }

  // Delete by pattern (for cache invalidation)
  async delPattern(pattern) {
    try {
      if (this.connected && this.client) {
        const keys = await this.keys(pattern);
        if (keys.length > 0) {
          const delAsync = promisify(this.client.del).bind(this.client);
          await delAsync(...keys);
        }
      } else {
        // Fallback - iterate and delete matching keys
        for (const key of this.fallback.keys()) {
          if (key.match(pattern.replace('*', '.*'))) {
            this.fallback.delete(key);
          }
        }
      }
      return true;
    } catch (error) {
      console.warn('[Cache] Delete pattern error:', error.message);
      return false;
    }
  }

  // Keys method
  async keys(pattern = '*') {
    try {
      if (this.connected && this.client) {
        const keysAsync = promisify(this.client.keys).bind(this.client);
        return await keysAsync(pattern);
      } else {
        // Fallback - return matching keys from in-memory cache
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(this.fallback.keys()).filter(key => regex.test(key));
      }
    } catch (error) {
      console.warn('[Cache] Keys error:', error.message);
      return [];
    }
  }

  // Flush all cache
  async flush() {
    try {
      if (this.connected && this.client) {
        const flushAsync = promisify(this.client.flushdb).bind(this.client);
        await flushAsync();
      } else {
        this.fallback.clear();
      }
      return true;
    } catch (error) {
      console.warn('[Cache] Flush error:', error.message);
      return false;
    }
  }

  // Clean up expired in-memory cache entries
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.fallback.entries()) {
      if (item.expiresAt <= now) {
        this.fallback.delete(key);
      }
    }
  }

  // Health check
  async health() {
    try {
      if (this.connected && this.client) {
        const pingAsync = promisify(this.client.ping).bind(this.client);
        await pingAsync();
        return { status: 'healthy', type: 'redis' };
      } else {
        return { status: 'healthy', type: 'memory', size: this.fallback.size };
      }
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  // Cache statistics
  async stats() {
    try {
      if (this.connected && this.client) {
        const infoAsync = promisify(this.client.info).bind(this.client);
        const info = await infoAsync('stats');
        return { type: 'redis', info };
      } else {
        return {
          type: 'memory',
          size: this.fallback.size,
          keys: Array.from(this.fallback.keys())
        };
      }
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;