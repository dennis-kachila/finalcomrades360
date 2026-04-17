import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useCart } from '../contexts/CartContext';
import { useWishlist } from '../contexts/WishlistContext';
import { useAuth } from '../contexts/AuthContext';
import ProductInquiryModal from '../components/ProductInquiryModal';
import { resolveImageUrl, getProductImages, FALLBACK_IMAGE, getResizedImageUrl } from '../utils/imageUtils';
import { useImageVersion } from '../hooks/useImageVersion';
import { Share2, Heart, Shield, Truck, RotateCcw, Package, X, Star, Info, PlayCircle, ArrowLeft, MapPin, ShoppingBag, List, Settings } from 'lucide-react';
import { toast } from '../components/ui/use-toast';
import { formatPrice } from '../utils/currency';
import { 
  normalizeVariants as unifyVariants, 
  getVariantId as unifiedGetVariantId, 
  getDefaultVariant as unifiedGetDefaultVariant 
} from '../utils/variantUtils';
import { FaHeart } from 'react-icons/fa';
import { usePersistentFetch } from '../hooks/usePersistentFetch';
import Footer from '../components/Footer';
import HomeProductCard from '../components/HomeProductCard';

const isNumericIndexObject = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  return keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
};

const numericIndexObjectToString = (obj) => {
  return Object.keys(obj)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => obj[k])
    .join('')
    .trim();
};

const parseLooseSpecString = (raw) => {
  if (!raw || typeof raw !== 'string') return {};
  const text = raw.trim().replace(/^\{\s*|\s*\}$/g, '');
  if (!text || !text.includes(':')) return {};

  const result = {};
  let currentKey = '';

  text.split(',').map((p) => p.trim()).filter(Boolean).forEach((part) => {
    const colonIdx = part.indexOf(':');
    if (colonIdx > -1) {
      const key = part.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      const value = part.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key) {
        currentKey = key;
        result[currentKey] = value;
      }
      return;
    }

    // Continuation chunk for previous key (e.g. "color: Black, Blue")
    if (currentKey) {
      result[currentKey] = `${result[currentKey]}, ${part}`;
    }
  });

  return result;
};

const normalizeObjectLike = (input) => {
  if (!input) return {};

  // Fix corrupted objects that store characters by numeric keys.
  if (isNumericIndexObject(input)) {
    return parseLooseSpecString(numericIndexObjectToString(input));
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return {};

    if (trimmed.startsWith('{') || trimmed.startsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeObjectLike(parsed);
      } catch (_) {
        return parseLooseSpecString(trimmed);
      }
    }

    return parseLooseSpecString(trimmed);
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    return input;
  }

  return {};
};

const isCorruptedAttributePayload = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;

  // Typical corruption: huge numeric-key maps that represent character-by-character JSON.
  const numericKeys = keys.filter((k) => /^\d+$/.test(k));
  if (numericKeys.length > 20) return true;

  const sample = String(obj[numericKeys[0] || ''] || '');
  if (numericKeys.length > 0 && (sample === '{' || sample === '"' || sample === '[')) {
    return true;
  }

  return false;
};

const ensureObject = (val) => {
  if (!val) return {};

  let current = val;
  for (let i = 0; i < 8; i++) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      return normalizeObjectLike(current);
    }

    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) return {};
      if (trimmed.startsWith('{') || trimmed.startsWith('"')) {
        try {
          current = JSON.parse(trimmed);
          continue;
        } catch (e) {
          return normalizeObjectLike(trimmed);
        }
      }

      return normalizeObjectLike(trimmed);
    }

    return {};
  }

  return {};
};

const ensureArray = (val) => {
  if (!val) return [];
  let current = val;
  for (let i = 0; i < 8; i++) {
    if (Array.isArray(current)) return current;
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[') || trimmed.startsWith('"')) {
        try {
          current = JSON.parse(trimmed);
          continue;
        } catch (e) {
          return [];
        }
      }
    }
    return [];
  }
  return [];
};

const cleanValue = (val) => {
  if (val === null || val === undefined || val === 'null' || val === 'undefined') return '';
  if (typeof val === 'object') {
    if (Array.isArray(val)) return val.join(', ');
    // If it's a flat object, show its values or a clean string
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('[') || trimmed.startsWith('{')) && (trimmed.endsWith(']') || trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return cleanValue(parsed);
      } catch (e) {
        return trimmed.replace(/[\[\]"]/g, '').trim();
      }
    }
    return trimmed.replace(/[\[\]"]/g, '').trim();
  }
  return String(val);
};

// Deeply unwraps multiply-JSON-stringified arrays (handles triple/quadruple nesting)
const deepUnwrapArray = (val) => {
  // Keep parsing if current value is a string that looks like JSON
  let current = val;
  for (let i = 0; i < 10; i++) {
    if (typeof current !== 'string') break;
    const trimmed = current.trim();
    if (!(trimmed.startsWith('[') || trimmed.startsWith('"'))) break;
    try {
      const parsed = JSON.parse(trimmed);
      current = parsed;
    } catch {
      break;
    }
  }
  return current;
};

const parseArrayValue = (val) => {
  if (!val || val === 'null' || val === 'undefined') return [];

  const cleanItem = (s) => String(s).replace(/^["\[\]\s]+|["\[\]\s]+$/g, '').trim();
  const splitFlat = (s) => {
    if (s.includes('","') || s.includes("','")) {
      return s.split(/","|','/g).map(cleanItem).filter(Boolean);
    }
    const c = cleanItem(s);
    return c ? [c] : [];
  };

  // Unwrap any top-level JSON stringification
  let unwrapped = deepUnwrapArray(val);

  let rawItems = [];
  if (Array.isArray(unwrapped)) {
    rawItems = unwrapped
      .map(item => {
        const v = deepUnwrapArray(item);
        if (Array.isArray(v)) return v.map(x => cleanItem(String(x)));
        if (typeof v === 'string') return splitFlat(v);
        return [cleanItem(String(v))];
      })
      .flat(Infinity);
  } else if (typeof unwrapped === 'string') {
    rawItems = splitFlat(unwrapped);
  } else {
    rawItems = [cleanItem(String(unwrapped))];
  }

  return rawItems.filter(Boolean);
};

const InfoItem = ({ label, value }) => {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-bold text-gray-900">{cleanValue(value)}</span>
    </div>
  );
};

export default function ProductDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToCart, removeFromCart, cart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { user: authUser } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);

  // Instant Loading Implementation
  const { data: fetchedProduct, loading: hookLoading, error: hookError } = usePersistentFetch(
    `product_details_${id}`,
    `/products/${id}`,
    { staleTime: 5 * 60 * 1000 }
  );

  // Derived Values - All Hooks Must Be At Top Level
  const imageUrls = useMemo(() => {
    if (!product) return [];
    const imgs = [];
    if (product.coverImage) imgs.push(product.coverImage);
    if (Array.isArray(product.galleryImages)) imgs.push(...product.galleryImages);
    else if (product.images) imgs.push(...(Array.isArray(product.images) ? product.images : []));
    return imgs;
  }, [product]);

  const { getVersionedUrls } = useImageVersion(imageUrls, id);

  const images = useMemo(() => {
    const productImages = getProductImages(product).map(url => getResizedImageUrl(url, { width: 800, quality: 80 }));
    return getVersionedUrls(productImages);
  }, [product, getVersionedUrls]);

  const keyFeatures = useMemo(() => {
    return parseArrayValue(product?.keyFeatures || product?.tags?.keyFeatures);
  }, [product]);

  const coverageZones = useMemo(() => {
    return parseArrayValue(product?.deliveryCoverageZones);
  }, [product?.deliveryCoverageZones]);

  const specifications = useMemo(() => ensureObject(product?.specifications || product?.tags?.specifications), [product]);
  const physicalFeatures = useMemo(() => {
    const parsed = ensureObject(product?.attributes || product?.tags?.physicalFeatures || product?.tags?.attributes);
    return isCorruptedAttributePayload(parsed) ? {} : parsed;
  }, [product]);
  // Unified Variant Logic
  const normalizedVariantRows = useMemo(() => {
    return unifyVariants(product);
  }, [product]);

  const reviews = useMemo(() => Array.isArray(product?.reviews) ? product.reviews : [], [product]);
  const [visibleReviewsCount, setVisibleReviewsCount] = useState(3);
  const visibleReviews = useMemo(() => reviews.slice(0, visibleReviewsCount), [reviews, visibleReviewsCount]);
  const hasMoreReviews = visibleReviewsCount < reviews.length;

  const hasStockData = product?.stock !== undefined && product?.stock !== null && String(product.stock).trim() !== '';
  const hasPriceData = [product?.discountPrice, product?.displayPrice, product?.basePrice, product?.price]
    .some((v) => v !== undefined && v !== null && String(v).trim() !== '');
  const hasCategory = !!product?.category?.name;
  const hasRatings = product?.ratings !== undefined && product?.ratings !== null && String(product.ratings).trim() !== '';
  const hasLongDescription = !!(product?.fullDescription || product?.description);
  const hasCondition = !!product?.condition;
  const hasVendor = !!product?.seller?.name;

  const productDetailItems = [
    product?.category?.name ? { label: 'Category', value: product.category.name } : null,
    product?.subcategory?.name ? { label: 'Subcategory', value: product.subcategory.name } : null,
    product?.warranty ? { label: 'Warranty', value: product.warranty } : null,
    product?.returnPolicy ? { label: 'Return Policy', value: product.returnPolicy } : null,
  ].filter(Boolean);

  const shippingItems = [
    (product?.deliveryFee !== undefined && product?.deliveryFee !== null && String(product.deliveryFee).trim() !== '')
      ? { label: 'Delivery Fee', value: Number(product.deliveryFee) > 0 ? formatPrice(product.deliveryFee) : 'Free' }
      : null,
  ].filter(Boolean);

  const hasCoverageZones = coverageZones.length > 0;
  const hasReviews = reviews.length > 0;
  const hasTopMetaGrid = hasCondition || hasVendor;
  const hasTopInfoSections = productDetailItems.length > 0 || shippingItems.length > 0;
  const hasDescriptionFeaturesRow = hasLongDescription || keyFeatures.length > 0;
  const hasAnyLowerSection = hasDescriptionFeaturesRow || relatedProducts.length > 0 || hasReviews;

  const getVariantId = (row) => {
    const finalId = unifiedGetVariantId(row);
    console.log('[ProductDetails] getVariantId debug:', { 
      input: row, 
      final: finalId 
    });
    return finalId;
  };

  const isVariantInCart = (row) => {
    const variantId = getVariantId(row);
    if (!variantId) return false;
    return cart?.items?.some((item) => {
      return String(item.productId) === String(id) && String(item.variantId || '') === String(variantId);
    });
  };

  const displayPrice = Number(product?.discountPrice || product?.displayPrice || product?.basePrice || product?.price || 0);
  const originalPrice = Number(product?.displayPrice || product?.basePrice || product?.price || 0);
  const discountPercentage = Number(product?.discountPercentage || 0);
  const hasDiscount = discountPercentage > 0 && displayPrice < originalPrice;
  const defaultVariantRow = useMemo(() => {
    if (!normalizedVariantRows.length) return null;
    return normalizedVariantRows.find((row) => Number(row.stock || 0) > 0) || normalizedVariantRows[0];
  }, [normalizedVariantRows]);
  const defaultVariantId = defaultVariantRow ? getVariantId(defaultVariantRow) : null;
  const hasProductVariants = normalizedVariantRows.length > 0;
  const isItemInCart = cart?.items?.some((item) => {
    // Check if the base product ID matches
    const idMatch = String(item.productId) === String(id) || String(item.product?.id) === String(id);
    if (!idMatch) return false;
    
    // If we're looking for the specific DEFAULT variant (old logic), we'd check item.variantId === defaultVariantId.
    // But for the main header button, we want to know if ANY variant of this product is in the cart.
    return true; 
  });

  const cartItemCount = cart?.items?.reduce((acc, item) => {
    if (String(item.productId) === String(id) || String(item.product?.id) === String(id)) {
      return acc + (item.quantity || 1);
    }
    return acc;
  }, 0);

  // Life Cycle Effects
  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const ref = params.get('ref');
    if (ref) { try { localStorage.setItem('referrerCode', ref); } catch (_) { } }
  }, [location.search]);

  // Effect to handle product data from the hook
  useEffect(() => {
    if (fetchedProduct) {
      setProduct(fetchedProduct);
      setLoading(false);
      // Always update active image for the new product
      setActiveImage(fetchedProduct.coverImage || (Array.isArray(fetchedProduct.galleryImages) && fetchedProduct.galleryImages[0]) || null);
    } else if (hookLoading) {
      setLoading(true);
    }

    if (hookError) {
      if (!fetchedProduct) setError(typeof hookError === 'string' ? hookError : 'Failed to load product');
      setLoading(false);
    }
  }, [fetchedProduct, hookLoading, hookError]);

  useEffect(() => {
    if (!product?.id) {
      setRelatedProducts([]);
      return;
    }

    const explicitRelated = Array.isArray(product.relatedProducts) ? product.relatedProducts : [];
    const cleanExplicit = explicitRelated.filter((p) => p && String(p.id) !== String(product.id));
    setRelatedProducts(cleanExplicit);
  }, [product?.id, product?.relatedProducts]);

  useEffect(() => {
    setVisibleReviewsCount(3);
  }, [product?.id]);

  const handleBack = () => {
    // If we have history in location state (from our app), go back using history
    if (location.state?.from) {
      navigate(-1);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    if (localStorage.getItem('marketing_mode') === 'true') {
      navigate('/marketing');
      return;
    }
    navigate('/products');
  };

  const addToCartHandler = async () => {
    try {
      if (isItemInCart) {
        // Find all cart items for this product and remove them
        const productItems = cart?.items?.filter(item => 
          String(item.productId) === String(id) || String(item.product?.id) === String(id)
        );

        if (productItems && productItems.length > 0) {
          for (const item of productItems) {
            await removeFromCart(id, item.itemType || 'product', { variantId: item.variantId });
          }
        } else {
          // Fallback if filter fails but isItemInCart was true
          await removeFromCart(id);
        }
      } else {
        if (hasProductVariants && defaultVariantRow) {
          await addToCart(id, 1, {
            type: 'product',
            product,
            variantId: defaultVariantId,
            selectedVariant: {
              id: defaultVariantId,
              name: defaultVariantRow.optionName,
              basePrice: defaultVariantRow.basePrice,
              discountPrice: defaultVariantRow.discountPrice,
            },
          });
        } else {
          await addToCart(id, 1, { product });
        }
      }
    } catch (e) {
      alert(e?.response?.data?.message || 'Unable to update cart');
    }
  };

  const buyNow = async () => {
    try {
      await addToCart(id, 1, { product });
      navigate('/cart');
    } catch (e) {
      alert(e?.response?.data?.message || 'Unable to proceed');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast({
      title: 'Link Copied',
      description: 'Product link copied to clipboard.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  // State-Based Early Returns
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 mb-6 animate-pulse">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 p-4 md:p-6 lg:p-10 border-b border-gray-100">
            <div className="space-y-4 lg:col-span-7">
              <div className="aspect-square rounded-xl overflow-hidden bg-gray-200 border border-gray-100 relative" />
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-200 border-2 border-transparent" />
                ))}
              </div>
              <div className="h-8 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-6 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-10 bg-gray-100 rounded w-1/2 mb-2" />
            </div>
            <div className="flex flex-col lg:col-span-5">
              <div className="h-6 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  if (error) return <div className="min-h-screen flex items-center justify-center bg-white text-red-600 font-bold">{error}</div>;
  if (!product) return (
    <div className="container py-12 text-center pt-24">
      <div className="text-xl font-bold mb-4">Product not found.</div>
      <Link to="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold">
        <RotateCcw className="h-5 w-5" /> Back to Home
      </Link>
    </div>
  );

  const pageTitle = `${product.name} | Comrades360`;
  const ogDescription = product.shortDescription || product.description || 'Shop on Comrades360.';

  return (
    <div className="min-h-screen bg-gray-50 pt-0 md:pt-4">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={ogDescription} />
      </Helmet>

      <div className="mx-auto px-0 md:px-4 lg:px-8 pt-0 pb-3 md:py-8 max-w-7xl lg:max-w-[95vw] xl:max-w-full">
        <button onClick={handleBack} className="flex items-center text-gray-600 hover:text-blue-600 mb-1 md:mb-6 transition-colors group">
          <ArrowLeft className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform" />
          {(() => {
            const fromPath = location.state?.from;
            const isMarketing = localStorage.getItem('marketing_mode') === 'true';
            if (fromPath) {
              const segments = fromPath.split('/').filter(Boolean);
              if (segments.length > 1) return 'Back to Item';
              if (segments.length === 0) return 'Back to Home';
            }
            return isMarketing ? 'Back to Marketing' : 'Back to Shop';
          })()}
        </button>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 mb-6 md:mb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 p-4 md:p-6 lg:p-10 border-b border-gray-100">
            {/* Image Gallery Column */}
            <div className="space-y-4 lg:col-span-7">
              <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100 relative group">
                <img src={getResizedImageUrl(resolveImageUrl(activeImage), { width: 800, quality: 80 })} alt={product.name} className="w-full h-full object-cover transition-transform hover:scale-105 duration-500" />
                {hasStockData && (
                  <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter shadow-sm border ${product.stock > 0 ? 'bg-green-500 text-white border-green-400' : 'bg-red-500 text-white border-red-400'}`}>
                    {product.stock > 0 ? `${product.stock} in stock` : 'Out of Stock'}
                  </div>
                )}
              </div>
              {images.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {images.map((img, index) => (
                    <button key={index} onClick={() => setActiveImage(img)} className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${activeImage === img ? 'border-blue-600 shadow-md' : 'border-transparent hover:border-gray-300'}`}>
                      <img src={img} alt={`Gallery ${index}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Product Name & Brand/Model */}
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 md:mb-3 uppercase tracking-tight">{product.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  {product.brand && (
                    <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      Brand: {product.brand}
                    </span>
                  )}
                  {product.model && (
                    <span className="text-sm font-bold text-gray-600 bg-gray-50 px-2 py-1 rounded">
                      Model: {product.model}
                    </span>
                  )}
                </div>
                {(hasCategory || hasRatings) && (
                  <div className="flex items-center gap-3 mb-3">
                    {hasCategory && (
                      <span className="bg-orange-100 text-orange-700 px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-medium flex items-center gap-1 uppercase tracking-tighter">
                        <Package className="h-3 w-3 md:h-4 md:w-4" /> {product.category.name}
                      </span>
                    )}
                    {hasRatings && (
                      <div className="flex items-center text-amber-500">
                        <Star className="h-3 w-3 md:h-4 md:w-4 fill-current" />
                        <span className="ml-1 text-gray-700 font-medium text-sm">{product.ratings}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Price and Cart Selection */}
              {hasPriceData && (
                <div className="flex flex-row items-center gap-4 mt-8 bg-gray-50 p-4 rounded-2xl border border-blue-50">
                  <span className="text-2xl md:text-3xl font-black text-blue-600">{formatPrice(displayPrice)}</span>
                  {hasDiscount && <span className="text-base md:text-lg text-gray-400 line-through">{formatPrice(originalPrice)}</span>}
                  {hasDiscount && (
                    <span className="text-base md:text-xl font-black text-emerald-400">{discountPercentage}% OFF</span>
                  )}
                  <button
                    onClick={addToCartHandler}
                    disabled={hasStockData ? product.stock <= 0 : false}
                    className={`ml-auto h-12 px-4 text-base font-bold shadow-lg flex items-center justify-center gap-2 rounded-xl transition-all ${(hasStockData && product.stock <= 0) ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none border-0' : isItemInCart ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 shadow-red-100' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-200'}`}
                  >
                    <ShoppingBag className="h-5 w-5" />
                    {(hasStockData && product.stock <= 0) ? 'Out of Stock' : isItemInCart ? 'Remove' : '+ Cart'}
                  </button>
                </div>
              )}

              {/* Variants */}
              {normalizedVariantRows.length > 0 && (
                <div className="mt-4">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-50 bg-gray-50/50">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <List className="h-5 w-5 text-blue-600" /> Variant Options and Prices
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b bg-gray-50/30">
                            <th className="p-2 md:p-4 font-bold uppercase tracking-wider text-[10px]">Option Name</th>
                            <th className="p-2 md:p-4 font-bold uppercase tracking-wider text-[10px] hidden md:table-cell">SKU</th>
                            <th className="p-2 md:p-4 font-bold uppercase tracking-wider text-[10px]">Price</th>
                            <th className="p-2 md:p-4 font-bold uppercase tracking-wider text-[10px] hidden md:table-cell">Stock</th>
                            <th className="p-2 md:p-4 font-bold uppercase tracking-wider text-[10px] text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {normalizedVariantRows.map((row) => {
                            const variantId = getVariantId(row);
                            const variantInCart = isVariantInCart(row);
                            const effectivePrice = Number(row.discountPrice || row.basePrice || 0);
                            const hasVariantDiscount = Number(row.discountPercentage || 0) > 0 && Number(row.basePrice || 0) > effectivePrice;

                            return (
                              <tr key={row.key} className="group hover:bg-blue-50/30 transition-colors">
                                <td className="p-2 md:p-4 font-medium text-gray-900 text-xs md:text-sm">{row.optionName}</td>
                                <td className="p-2 md:p-4 font-mono text-xs text-gray-600 hidden md:table-cell">{row.sku || '-'}</td>
                                <td className="p-2 md:p-4 text-gray-900 font-black text-xs md:text-sm">
                                  <span>{formatPrice(effectivePrice)}</span>
                                  {hasVariantDiscount && (
                                    <span className="ml-2 text-[11px] text-gray-400 line-through font-semibold align-middle">{formatPrice(row.basePrice)}</span>
                                  )}
                                </td>
                                <td className="p-2 md:p-4 hidden md:table-cell">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${row.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {row.stock > 0 ? `${row.stock} IN STOCK` : 'OUT OF STOCK'}
                                  </span>
                                </td>
                                <td className="p-2 md:p-4 text-right">
                                  <button
                                    className={`font-bold rounded-lg px-2 md:px-4 h-8 md:h-9 text-xs md:text-sm shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantInCart ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-200'}`}
                                    onClick={async () => {
                                      try {
                                        if (variantInCart) {
                                          await removeFromCart(id, 'product', { variantId });
                                        } else {
                                          await addToCart(id, 1, {
                                            type: 'product',
                                            product,
                                            variantId,
                                            selectedVariant: {
                                              id: variantId,
                                              name: row.optionName,
                                              discountPrice: effectivePrice,
                                              basePrice: row.basePrice,
                                            },
                                          });
                                        }
                                      } catch (e) {
                                        alert(e?.response?.data?.message || 'Unable to update cart');
                                      }
                                    }}
                                    disabled={row.stock <= 0 && !variantInCart}
                                  >
                                    {variantInCart ? 'REMOVE' : 'BUY'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Content Column */}
            <div className="flex flex-col lg:col-span-5">
              <div className="flex justify-end items-start mb-4">
                <button onClick={() => toggleWishlist(product.id || id)} className={`p-2 rounded-full transition-all ${isInWishlist(product.id || id) ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50'}`}>
                  <Heart className={`h-6 w-6 ${isInWishlist(product.id || id) ? 'fill-current' : ''}`} />
                </button>
              </div>

              {product.shortDescription && (
                <div className="mb-4">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Product Highlight</p>
                  <p className="text-lg font-bold text-blue-800 italic leading-snug">{cleanValue(product.shortDescription)}</p>
                </div>
              )}

              {product.description && (
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {cleanValue(product.description)}
                </p>
              )}

              {hasTopMetaGrid && (
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {hasCondition && (
                    <div className="bg-gray-50 p-4 rounded-xl flex items-center gap-3">
                      <Package className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Condition</p>
                        <p className="text-sm font-semibold text-gray-900 uppercase">{product.condition}</p>
                      </div>
                    </div>
                  )}
                  {hasVendor && (
                    <div className="bg-gray-50 p-4 rounded-xl flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Vendor</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{product.seller.name}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasTopInfoSections && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  {productDetailItems.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Shield className="h-3 w-3" /> Product Details
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {productDetailItems.map((item) => (
                          <InfoItem key={item.label} label={item.label} value={item.value} />
                        ))}
                      </div>
                    </div>
                  )}
                  {shippingItems.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Truck className="h-3 w-3" /> Shipping & Warranty
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {shippingItems.map((item) => (
                          <InfoItem key={item.label} label={item.label} value={item.value} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasCoverageZones && (
                <div className="mt-8">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <MapPin className="h-3 w-3" /> Delivery Coverage Zones
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {coverageZones.map((zone, i) => (
                      <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-[10px] font-black uppercase border border-blue-100">{zone}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lower Sections - Detailed Info */}
        {hasAnyLowerSection && (
          <div className="p-4 md:p-6 lg:p-10 space-y-6 md:space-y-12">
            {/* Description & Features Row */}
            {hasDescriptionFeaturesRow && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {hasLongDescription && (
                  <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Info className="h-5 w-5 text-blue-600" /> Full Description
                    </h3>
                    <div className="text-gray-600 leading-relaxed whitespace-pre-line">
                      {product.fullDescription || product.description}
                    </div>
                  </div>
                )}

                {keyFeatures.length > 0 && (
                  <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Star className="h-5 w-5 text-blue-600" /> Key Features
                    </h3>
                    <ul className="space-y-2">
                      {keyFeatures.map((feature, i) => (
                        <li key={i} className="flex items-baseline">
                          <span className="text-blue-600 mr-2 font-bold">•</span>
                          <span className="text-gray-700 font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Specifications & Physical Features */}
            {(() => {
              const specs = ensureObject(product?.specifications);
              const physical = ensureObject(product?.physicalFeatures);
              const allSpecs = { ...specs, ...physical };
              const INTERNAL_FIELDS = ['cost', 'barcode', 'addedBy', 'sellerId', 'status', 'isBestSeller', 'condition', 'featured', 'isFeatured', 'isActive', 'approved'];
              const filteredSpecs = Object.entries(allSpecs).filter(([key, value]) => value && value !== 'null' && !INTERNAL_FIELDS.includes(key));

              return (filteredSpecs.length > 0 || product.model) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 md:px-8 pt-6 pb-4">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Settings className="h-5 w-5 text-blue-600" /> Specifications
                    </h3>
                  </div>
                  <div className="overflow-hidden border-t border-gray-100">
                    <table className="w-full text-left text-sm table-fixed">
                      <tbody className="divide-y divide-gray-100">
                        {filteredSpecs.map(([key, value], i) => (
                          <tr key={i} className="group hover:bg-gray-50 transition-colors">
                            <td className="py-3 md:py-4 px-3 md:px-6 bg-gray-50/50 w-1/2 text-[10px] text-gray-500 font-black uppercase tracking-widest border-r border-gray-100">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </td>
                            <td className="py-3 md:py-4 px-3 md:px-6 w-1/2 font-bold text-gray-900 text-xs md:text-sm">
                              {cleanValue(value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Related Products */}
            {relatedProducts.length > 0 && (
              <section>
                <h2 className="text-2xl font-black mb-6 uppercase tracking-tighter border-b-4 border-orange-500 inline-block pb-2">Related Products</h2>
                <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory">
                  {relatedProducts.map((rp) => {
                    const relatedInCart = cart?.items?.some((item) => String(item.productId) === String(rp.id) || String(item.product?.id) === String(rp.id));
                    return (
                      <div key={rp.id} className="snap-start flex-shrink-0 w-[45%] sm:w-[30%] md:w-[23%] lg:w-[18%] xl:w-[15%]">
                        <HomeProductCard
                          product={rp}
                          isInCart={relatedInCart}
                          onView={(p) => navigate(`/product/${p.id}`)}
                          navigate={navigate}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Review and Rating */}
            {hasReviews && (
              <section className="max-w-4xl mx-auto">
                <h2 className="text-3xl font-black mb-12 uppercase tracking-tighter text-center">Review and Rating</h2>
                <div className="space-y-8">
                  {visibleReviews.map((r, i) => (
                    <div key={i} className="p-10 bg-white rounded-[3rem] border border-gray-100 relative group shadow-sm hover:shadow-xl transition-all">
                      <div className="flex items-center gap-6 mb-6">
                        <div className="h-16 w-16 rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-2xl shadow-lg ring-4 ring-white">{(r.userName || r.customerName || 'A')[0].toUpperCase()}</div>
                        <div>
                          <div className="font-black text-gray-900 uppercase tracking-tight text-lg">{r.userName || r.customerName || 'Verified Buyer'}</div>
                          <div className="text-[10px] font-black text-gray-400 font-mono tracking-widest">{new Date(r.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <p className="text-gray-700 leading-relaxed text-xl italic font-serif">"{r.comment || r.text}"</p>
                      <div className="absolute top-12 right-12 flex gap-1 text-amber-500">
                        {[...Array(5)].map((_, idx) => <Star key={idx} className={`w-5 h-5 ${idx < r.rating ? 'fill-current' : 'opacity-20'}`} />)}
                      </div>
                    </div>
                  ))}

                  {hasMoreReviews && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => setVisibleReviewsCount((prev) => prev + 3)}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
                      >
                        Load More Reviews
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      <Footer />
      <ProductInquiryModal product={product} isOpen={inquiryModalOpen} onClose={() => setInquiryModalOpen(false)} />
    </div>
  );
}
