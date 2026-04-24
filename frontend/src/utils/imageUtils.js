/**
 * Centralized image utilities for consistent image handling across the application
 */
import React from 'react';

// Fallback image as inline SVG (no external dependencies)
export const FALLBACK_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiNmM2Y0ZjYiLz48dGV4dCB4PSIyMDAiIHk9IjIwMCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5Y2EzYWYiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';

// Global image cache and version management
const imageCache = new Map();
const imageVersions = new Map();

/**
 * Generate a cache-busting version parameter
 * @param {string} imageUrl - Original image URL
 * @param {string|number} version - Version identifier (timestamp, version number, etc.)
 * @returns {string} URL with cache-busting parameter
 */
export const generateCacheBustedUrl = (imageUrl, version = null) => {
  if (!imageUrl) return FALLBACK_IMAGE;

  // Ensure imageUrl is a string and trimmed
  const cleanUrl = typeof imageUrl === 'string' ? imageUrl.trim() : String(imageUrl).trim();

  // Robust check for data URIs and full external URLs - return absolute URIs as-is
  // Case-insensitive check for data:, http://, https://, blob:
  if (/^(data:|https?:\/\/|blob:)/i.test(cleanUrl)) {
    return cleanUrl;
  }

  // Optimization: If URL is very long (>200 chars), assume it's a data URI or base64 that missed the regex check
  // and return it as-is to prevent appending query params to massive strings.
  if (cleanUrl.length > 200) return cleanUrl;

  // Don't append version if it's already there (avoids ?v=123&v=456)
  if (cleanUrl.includes('?v=') || cleanUrl.includes('&v=')) {
    return cleanUrl;
  }

  // Only apply cache busting to paths that look like local file paths (start with uploads/ or /)
  if (!cleanUrl.startsWith('/') && !cleanUrl.startsWith('uploads/')) {
    return cleanUrl;
  }

  // Keep version stable per image URL so rerenders don't cause endless refetches.
  const baseUrlKey = cleanUrl.split('?')[0];
  let versionParam = version ?? imageVersions.get(baseUrlKey) ?? imageVersions.get(cleanUrl) ?? null;

  if (!versionParam) {
    versionParam = Date.now();
    imageVersions.set(baseUrlKey, versionParam);
  }

  const separator = cleanUrl.includes('?') ? '&' : '?';

  return `${cleanUrl}${separator}v=${versionParam}`;
};

/**
 * Update image version for cache invalidation
 * @param {string} imageUrl - Image URL to update version for
 * @param {string|number} newVersion - New version identifier
 */
export const updateImageVersion = (imageUrl, newVersion = null) => {
  if (!imageUrl) return;
  const version = newVersion || Date.now();
  imageVersions.set(imageUrl, version);

  // Clear from cache to force refresh
  imageCache.delete(imageUrl);
}

/**
 * Get current version for an image
 * @param {string} imageUrl - Image URL
 * @returns {string|number} Current version identifier
 */
export const getImageVersion = (imageUrl) => {
  return imageVersions.get(imageUrl) || null;
};

/**
 * Clear all image caches
 */
export const clearAllImageCaches = () => {
  imageCache.clear();
  imageVersions.clear();
};

/**
 * Preload image with cache busting
 * @param {string} imageUrl - Image URL to preload
 * @param {string|number} version - Version identifier
 * @returns {Promise<void>}
 */
export const preloadImageWithVersion = (imageUrl, version = null) => {
  return new Promise((resolve, reject) => {
    if (!imageUrl || imageUrl === FALLBACK_IMAGE) {
      resolve();
      return;
    }

    const cacheKey = `${imageUrl}_${version || 'default'}`;

    // Check cache first
    if (imageCache.has(cacheKey)) {
      resolve();
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageCache.set(cacheKey, true);
      resolve();
    };
    img.onerror = () => reject(new Error(`Failed to preload image: ${imageUrl}`));
    img.src = generateCacheBustedUrl(imageUrl, version);
  });
};

/**
 * Resolves image URL to full URL, handling different formats with cache busting
 * @param {string|object} imageUrl - Image URL or object with url property
 * @param {string} baseUrl - Optional base URL override
 * @param {string|number} version - Optional version for cache busting
 * @returns {string} Full image URL with cache busting
 */
export const resolveImageUrl = (imageUrl, baseUrl = null, version = null) => {
  if (!imageUrl) return FALLBACK_IMAGE;

  // Handle data URIs and full URLs - return as-is
  if (typeof imageUrl === 'string' && /^(data:|https?:\/\/|blob:)/i.test(imageUrl)) {
    return imageUrl;
  }

  // Handle object with url or imageUrl property
  if (typeof imageUrl === 'object') {
    if (imageUrl.url) return resolveImageUrl(imageUrl.url, baseUrl, version);
    if (imageUrl.imageUrl) return resolveImageUrl(imageUrl.imageUrl, baseUrl, version);
  }

  // Handle string URLs
  if (typeof imageUrl === 'string') {
    const trimmedUrl = imageUrl.trim();

    // Safety check again - if somehow it looks like a data URL after trimming
    if (/^(data:|https?:\/\/|blob:)/i.test(trimmedUrl)) {
      return generateCacheBustedUrl(trimmedUrl, version);
    }

    // NEW: Handle stringified JSON arrays (e.g. "['http...']")
    if ((trimmedUrl.startsWith('[') || trimmedUrl.startsWith('{')) && trimmedUrl.length > 2) {
      try {
        const parsed = JSON.parse(trimmedUrl);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Recursively resolve the first image in the array
          return resolveImageUrl(parsed[0], baseUrl, version);
        } else if (parsed && parsed.url) {
          return resolveImageUrl(parsed.url, baseUrl, version);
        }
      } catch (e) {
        // Not valid JSON, continue as normal string
      }
    }

    // CRITICAL FIX: If it looks like a directory path (starts with uploads/ but no extension), return fallback
    // This prevents 404s for "uploads/products/" which might be saved in DB
    if ((trimmedUrl.startsWith('uploads/') || trimmedUrl.startsWith('uploads\\')) && !trimmedUrl.includes('.')) {
      return FALLBACK_IMAGE;
    }

    // If we have a base URL and it's not a local dev URL, use it as is
    // This allows for external CDNs while keeping internal uploads proxied via Vite
    const isLocalUrl = baseUrl && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1'));
    
    if (baseUrl &&
      !isLocalUrl &&
      !baseUrl.startsWith('/uploads/') &&
      !baseUrl.includes('.jpg') &&
      !baseUrl.includes('.png')) {

      // Clean the URL path
      let pathPart = trimmedUrl.replace(/^\/+/, '');

      // Ensure proper path format - handle both uploads/ and /uploads/ prefixes
      if (!pathPart.startsWith('uploads/')) {
        pathPart = `uploads/${pathPart}`;
      }

      // Remove double slashes
      pathPart = pathPart.replace(/\/+/g, '/');

      return generateCacheBustedUrl(`${baseUrl}/${pathPart}`, version);
    }

    // For localhost:5000 or when no valid baseUrl is provided, use relative paths since Vite proxy will handle it
    let pathPart = trimmedUrl.replace(/^\/+/, '');

    // Proactive fix: if it's a relative path and doesn't look like an upload yet,
    // and we're dealing with what looks like a product/food image filename
    if (!pathPart.startsWith('http') && !pathPart.startsWith('uploads/') && !pathPart.startsWith('api/') && pathPart.includes('.')) {
      // Default to product uploads unless filename or baseUrl suggests otherwise
      let uploadDir = 'uploads/products';

      if (pathPart.includes('mainImage-') || pathPart.includes('mainImage_')) {
        uploadDir = 'uploads/other';
      } else if (pathPart.includes('food') || (baseUrl && baseUrl.includes('food'))) {
        uploadDir = 'uploads/fastfood';
      } else if (baseUrl && baseUrl.includes('products')) {
        uploadDir = 'uploads/products';
      }
      pathPart = `${uploadDir}/${pathPart}`;
    }

    // NEW: Normalize double slashes and ensure it starts with / for relative pathing
    pathPart = pathPart.replace(/\/+/g, '/');
    if (!pathPart.startsWith('http') && !pathPart.startsWith('/')) {
      pathPart = `/${pathPart}`;
    }

    // IMAGE RESIZING LOGIC
    // If it's a local image (pathPart starts with /uploads or uploads/), we can use the resize endpoint
    if ((pathPart.startsWith('/uploads/') || pathPart.startsWith('uploads/')) && !pathPart.includes('api/images/resize')) {
      return generateCacheBustedUrl(pathPart, version);
    }

    return generateCacheBustedUrl(pathPart, version);
  }

  return FALLBACK_IMAGE;
};

/**
 * Generates a URL for the resized version of an image
 * @param {string} imageUrl - Original image URL
 * @param {object} options - Resize options { width, height, quality }
 * @returns {string} URL to the resize endpoint
 */
export const getResizedImageUrl = (imageUrl, options = {}) => {
  if (!imageUrl || imageUrl === FALLBACK_IMAGE) return FALLBACK_IMAGE;

  // Resolve the base URL first to handle various input formats
  const resolvedUrl = resolveImageUrl(imageUrl);

  // If it's an external URL (http/https) or data URI, return as is (we only resize local images for now)
  if (resolvedUrl.startsWith('http') || resolvedUrl.startsWith('data:')) {
    return resolvedUrl;
  }

  // resolvedUrl typically starts with /uploads/... due to resolveImageUrl
  // If it's a full URL, we need to extract only the path part for the resize API
  let imagePath = resolvedUrl;
  
  if (imagePath.includes('://')) {
    try {
      const urlObj = new URL(imagePath);
      imagePath = urlObj.pathname;
    } catch (e) {
      console.warn('[getResizedImageUrl] Failed to parse URL:', imagePath);
    }
  }

  // CRITICAL FIX: Split by '?' to remove any existing cache busting parameters from the file path
  imagePath = imagePath.split('?')[0];

  const width = options.width ? `&width=${options.width}` : '';
  const height = options.height ? `&height=${options.height}` : '';
  const quality = options.quality ? `&quality=${options.quality}` : '&quality=80';

  // Construct the resize API URL
  // frontend proxy forwards /api to backend
  return `/api/images/resize?imagePath=${encodeURIComponent(imagePath)}${width}${height}${quality}`;
};

/**
 * Gets the main product image with proper fallbacks
 * @param {object} product - Product object
 * @returns {string} Main image URL
 */
export const getProductMainImage = (product) => {
  if (!product) return FALLBACK_IMAGE;

  // Prefer coverImage directly
  if (product.coverImage) {
    return resolveImageUrl(product.coverImage);
  }

  const images = product.images || product.media || [];
  if (Array.isArray(images) && images.length > 0) {
    return resolveImageUrl(images[0]);
  }

  return FALLBACK_IMAGE;
};

/**
 * Gets all product images as an array of URLs with cache busting
 * @param {object} product - Product object
 * @param {string|number} version - Optional version for cache busting
 * @returns {string[]} Array of image URLs with cache busting
 */
export const getProductImages = (product, version = null) => {
  if (!product) return [FALLBACK_IMAGE];

  // New schema: coverImage (string) + galleryImages (array/string)
  let images = [];

  if (product.coverImage) {
    images.push(product.coverImage);
  }

  let gallery = product.galleryImages || [];
  if (typeof gallery === 'string') {
    try {
      if (gallery.startsWith('[') || gallery.startsWith('{')) {
        gallery = JSON.parse(gallery);
      } else {
        gallery = [gallery];
      }
    } catch (e) { gallery = []; }
  }

  if (Array.isArray(gallery)) {
    images = [...images, ...gallery];
  }

  // Fallback to legacy field if new fields are empty
  if (images.length === 0 && (product.images || product.media)) {
    const legacy = product.images || product.media;
    if (Array.isArray(legacy)) {
      images = legacy;
    } else if (typeof legacy === 'string') {
      try { images = JSON.parse(legacy); } catch (e) { images = [legacy]; }
    }
  }

  if (!Array.isArray(images) || images.length === 0) {
    return [FALLBACK_IMAGE];
  }

  // Deduplicate strings
  images = [...new Set(images)].filter(Boolean);

  return images.map(img => resolveImageUrl(img, null, version));
};

/**
 * Validates if an image URL is accessible
 * @param {string} url - Image URL to validate
 * @returns {Promise<boolean>} True if image loads successfully
 */
export const validateImageUrl = (url) => {
  return new Promise((resolve) => {
    if (!url || url === FALLBACK_IMAGE) {
      resolve(false);
      return;
    }

    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;

    // Timeout after 5 seconds
    setTimeout(() => resolve(false), 5000);
  });
};

/**
 * Preloads an image
 * @param {string} url - Image URL to preload
 * @returns {Promise<void>}
 */
export const preloadImage = (url) => {
  return new Promise((resolve, reject) => {
    if (!url || url === FALLBACK_IMAGE) {
      resolve();
      return;
    }

    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to preload image'));
    img.src = url;
  });
};

/**
 * Image component with built-in error handling and fallbacks
 */
export const ImageWithFallback = ({
  src,
  alt,
  className,
  onError,
  onLoad,
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = React.useState(src);
  const [hasError, setHasError] = React.useState(false);

  const handleError = React.useCallback(() => {
    if (!hasError) {
      setHasError(true);
      setCurrentSrc(FALLBACK_IMAGE);
      onError && onError();
    }
  }, [hasError, onError]);

  const handleLoad = React.useCallback(() => {
    onLoad && onLoad();
  }, [onLoad]);

  // Reset when src changes
  React.useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
  }, [src]);

  return React.createElement('img', {
    src: currentSrc,
    alt,
    className,
    onError: handleError,
    onLoad: handleLoad,
    loading: 'lazy',
    ...props
  });
};

// Make React available for the component
if (typeof window !== 'undefined') {
  import('react').then(React => {
    window.ImageWithFallback = ImageWithFallback;
  });
}

export default {
  resolveImageUrl,
  getProductMainImage,
  getProductImages,
  validateImageUrl,
  preloadImage,
  preloadImageWithVersion,
  generateCacheBustedUrl,
  updateImageVersion,
  getImageVersion,
  clearAllImageCaches,
  FALLBACK_IMAGE,
  ImageWithFallback
};