import React, { useState, useEffect, useMemo } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist } from '../contexts/WishlistContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { resolveImageUrl } from '../utils/imageUtils';
import { useToast } from '../components/ui/use-toast';
import { isFastFoodOpen } from '../utils/availabilityUtils';

import { formatPrice } from '../utils/currency';
import { findVariant, getVariantLabel, isSku } from '../utils/variantUtils';

const FALLBACK_IMAGE = '/placeholder.jpg';

const getFastFoodSellerKey = (item) => {
  const fastFood = item?.fastFood || {};
  return fastFood.vendor || fastFood.vendorId || fastFood.sellerId || fastFood.userId || item.fastFoodId || item.id;
};

const FASTFOOD_DELIVERY_INCREMENT_RATE = 0.15;

const calculateFastFoodSellerIncrementalFee = (baseFee, itemCount) => {
  const safeBaseFee = Number(baseFee || 0);
  const safeItemCount = Number(itemCount || 0);
  if (safeBaseFee <= 0 || safeItemCount <= 0) return 0;
  const extraItems = Math.max(0, safeItemCount - 1);
  return safeBaseFee + (safeBaseFee * FASTFOOD_DELIVERY_INCREMENT_RATE * extraItems);
};

const buildFastFoodSellerQuantityMap = (items = []) => {
  const quantities = new Map();
  items
    .filter((item) => item.itemType === 'fastfood')
    .forEach((item) => {
      const sellerKey = `fastfood:${getFastFoodSellerKey(item)}`;
      const qty = Number(item.quantity || 0);
      quantities.set(sellerKey, (quantities.get(sellerKey) || 0) + qty);
    });
  return quantities;
};

const calculateGroupedDeliveryFee = (items = []) => {
  const sellerQuantities = buildFastFoodSellerQuantityMap(items);
  const sellerFees = new Map();

  items
    .filter((item) => item.itemType === 'fastfood')
    .forEach((item) => {
      const sellerKey = `fastfood:${getFastFoodSellerKey(item)}`;
      if (!sellerFees.has(sellerKey)) {
        sellerFees.set(sellerKey, Number(item.deliveryFee || item.fastFood?.deliveryFee || 0));
      }
    });

  return items.reduce((sum, item) => {
    if (item.itemType === 'fastfood') {
      const sellerKey = `fastfood:${getFastFoodSellerKey(item)}`;
      if (!sellerFees.has(sellerKey)) {
        return sum;
      }
      const sellerQty = sellerQuantities.get(sellerKey) || 0;
      const sellerFee = calculateFastFoodSellerIncrementalFee(sellerFees.get(sellerKey), sellerQty);
      sellerFees.delete(sellerKey);
      return sum + sellerFee;
    }

    return sum + Number(item.deliveryFee || 0);
  }, 0);
};

export default function Cart() {
  const { cart, loading, updateCartItem, removeFromCart, updatingItems, count } = useCart();
  const { user } = useAuth();
  const { addToWishlist } = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const cartScope = useMemo(() => {
    const scope = new URLSearchParams(location.search).get('scope');
    return scope === 'fastfood' ? 'fastfood' : 'products';
  }, [location.search]);

  const visibleItems = useMemo(() => {
    const items = Array.isArray(cart?.items) ? cart.items : [];
    return items.filter((item) => (cartScope === 'fastfood' ? item.itemType === 'fastfood' : item.itemType !== 'fastfood'));
  }, [cart?.items, cartScope]);

  const visibleSummary = useMemo(() => {
    const subtotal = visibleItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const totalCommission = visibleItems.reduce((sum, item) => sum + Number(item.itemCommission || 0), 0);
    return {
      itemCount: visibleItems.length,
      subtotal,
      totalCommission,
      total: subtotal
    };
  }, [visibleItems]);

  // Helper to check if an item is available
  const isItemAvailable = (item) => {
    // Optimistic/Temporary items: trust them for UX, but rehydration will eventually correct them
    if (typeof item.id === 'string' && item.id.startsWith('temp-')) return true;

    const isFastFood = item.itemType === 'fastfood';
    const isService = item.itemType === 'service';
    const product = isFastFood ? item.fastFood : (isService ? item.service : item.product);

    if (!product) return false;

    if (isFastFood) {
      // Respect schedule, active flag, approval, and manual availability toggle
      return isFastFoodOpen(product) &&
        (product.isActive !== false) &&
        (product.approved === true) &&
        (product.isAvailable !== false);
    } else if (isService) {
      // Backend source of truth flags
      return product.isAvailable !== false && (product.status === 'approved' || product.status === 'active');
    } else {
      // Product: must be approved, visible and have stock
      const isApproved = product.approved || product.isApproved || product.status === 'active';
      const isVisible = product.visibilityStatus !== 'hidden' && !product.suspended;
      return isApproved && isVisible && (product.stock > 0 || product.isActive !== false);
    }
  };

  const isInitialLoading = loading && (!cart || !cart.items || cart.items.length === 0);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading your cart..." />
      </div>
    );
  }

  if (!cart || !cart.items || cart.items.length === 0 || visibleItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-0 md:px-4">
          <div className="text-center">
            <div className="text-8xl mb-6">🛒</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Your {cartScope === 'fastfood' ? 'Fast Food Cart' : 'Cart'} is Empty</h1>
            <p className="text-gray-600 mb-8 text-lg">
              {cartScope === 'fastfood'
                ? "Looks like you haven't added any fast food items yet."
                : "Looks like you haven't added any items to your cart yet."}
            </p>
            <Link
              to={cartScope === 'fastfood' ? '/fastfood' : '/'}
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              {cartScope === 'fastfood' ? 'Browse Fast Food' : 'Continue Shopping'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleQuantityChange = async (item, newQuantity) => {
    const id = item.itemType === 'fastfood' ? item.fastFoodId : (item.itemType === 'service' ? item.serviceId : item.productId);
    updateCartItem(id, newQuantity, item.itemType, { variantId: item.variantId, comboId: item.comboId }).then(() => {
      toast({
        title: "Quantity updated",
        description: "Cart quantity has been updated.",
      });
    }).catch((error) => {
      console.error('Failed to update quantity:', error);
      toast({
        title: "Failed to update quantity",
        description: "Could not update item quantity. Please try again.",
        variant: "destructive",
      });
    });
  };

  const handleRemoveItem = async (item) => {
    const id = item.itemType === 'fastfood' ? item.fastFoodId : (item.itemType === 'service' ? item.serviceId : item.productId);
    removeFromCart(id, item.itemType, { variantId: item.variantId, comboId: item.comboId, batchId: item.batchId || null }).then(() => {
      toast({
        title: "Item removed",
        description: "The item has been removed from your cart.",
      });
    }).catch((error) => {
      console.error('Failed to remove item:', error);
      toast({
        title: "Failed to remove item",
        description: "Could not remove item from cart. Please try again.",
        variant: "destructive",
      });
    });
  };

  const moveToWishlist = async (productId) => {
    Promise.all([
      addToWishlist(productId),
      removeFromCart(productId)
    ]).then((results) => {
      const [wishlistSuccess] = results;
      if (wishlistSuccess) {
        toast({
          title: "Item moved to wishlist",
          description: "The item has been saved to your wishlist.",
        });
      }
    }).catch((error) => {
      console.error('Failed to move to wishlist:', error);
      toast({
        title: "Failed to move item",
        description: "Could not move item to wishlist. Please try again.",
        variant: "destructive",
      });
    });
  };

  const handleCheckout = () => {
    // Navigate to checkout page - now supports Guest Checkout!
    navigate(`/checkout?scope=${cartScope}`, {
      state: { from: `/cart?scope=${cartScope}` }
    });
  };

  const handleClearCart = async () => {
    try {
      await Promise.all(
        visibleItems.map((item) => {
          const id = item.itemType === 'fastfood' ? item.fastFoodId : (item.itemType === 'service' ? item.serviceId : item.productId);
          return removeFromCart(id, item.itemType, { variantId: item.variantId, comboId: item.comboId, batchId: item.batchId || null });
        })
      );
      setShowClearConfirm(false);
      toast({
        title: `${cartScope === 'fastfood' ? 'Fast food cart' : 'Cart'} cleared`,
        description: `All ${cartScope === 'fastfood' ? 'fast food' : 'visible'} items have been removed from this cart view.`,
      });
    } catch (error) {
      console.error('Failed to clear cart:', error);
      toast({
        title: "Failed to clear cart",
        description: "Could not clear cart. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    if (cartScope === 'products') {
      navigate('/products');
    } else if (cartScope === 'fastfood') {
      if (visibleItems.length > 0) {
        const firstItem = visibleItems[0];
        const id = firstItem.fastFoodId || firstItem.productId || firstItem.serviceId;
        if (firstItem.itemType === 'fastfood') {
          navigate(`/fastfood/${id}`, { state: { from: '/fastfood' } });
        } else if (firstItem.itemType === 'service') {
          navigate(`/service/${id}`);
        } else {
          navigate(`/product/${id}`);
        }
      } else {
        navigate('/fastfood');
      }
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-4 md:py-8">
      <div className="max-w-6xl mx-auto px-0 md:px-4">
        <div className="flex items-center justify-between mb-4 md:mb-8 border-b border-gray-100 pb-4">
          <button
            onClick={handleBack}
            className="flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors ml-4 md:ml-0"
          >
            <FaArrowLeft className="mr-2" /> Back
          </button>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mr-4 md:mr-0">
            {cartScope === 'fastfood' ? 'Fastfood Cart' : 'Products Cart'}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white md:rounded-2xl shadow-sm border-0 md:border border-gray-100 overflow-hidden">
              {visibleItems.map((item) => {
                const isFastFood = item.itemType === 'fastfood';
                const isService = item.itemType === 'service';
                const product = isFastFood ? item.fastFood : (isService ? item.service : item.product);
                const id = isFastFood ? item.fastFoodId : (isService ? item.serviceId : item.productId);
                const link = isFastFood ? `/fastfood` : (isService ? `/service/${id}` : `/product/${id}`);
                const parseImageArray = (value) => {
                  if (Array.isArray(value)) return value;
                  if (typeof value !== 'string') return [];
                  try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed : [];
                  } catch (_) {
                    return [];
                  }
                };
                const productImages = parseImageArray(product?.images);
                const fastfoodGallery = parseImageArray(product?.galleryImages);
                const imagePath = isFastFood
                  ? (product?.coverImage || product?.mainImage || fastfoodGallery[0] || product?.image)
                  : (product?.coverImage || product?.mainImage || productImages[0] || product?.image);

                const uniqueKey = `${item.itemType}-${id}-${item.variantId || 'novar'}-${item.comboId || 'nocombo'}`;

                let variantName = (item.variantName && !isSku(item.variantName)) ? item.variantName : null;
                let comboName = item.comboName || null;

                if (!isFastFood && product && item.variantId && !variantName) {
                  const variant = findVariant(product, item.variantId);
                  variantName = getVariantLabel(variant);
                }

                if (isFastFood && product) {
                  if (item.variantId && !variantName) {
                    const variants = typeof product.sizeVariants === 'string'
                      ? JSON.parse(product.sizeVariants || '[]')
                      : (product.sizeVariants || []);
                    const v = variants.find(v => v.id === item.variantId || v.name === item.variantId || v.size === item.variantId);
                    variantName = v?.name || v?.size || item.variantId;
                  }
                  if (item.comboId && !comboName) {
                    const combos = typeof product.comboOptions === 'string'
                      ? JSON.parse(product.comboOptions || '[]')
                      : (product.comboOptions || []);
                    const c = combos.find(c => c.id === item.comboId || c.name === item.comboId);
                    comboName = c?.name || item.comboId;
                  }
                }

                const isAvailable = isItemAvailable(item);
                const updateKey = `${item.itemType}-${id}-${item.variantId || ''}-${item.comboId || ''}`;
                const isUpdating = updatingItems.has(updateKey);

                return (
                  <div key={uniqueKey} className={`border-b border-gray-200 last:border-b-0 p-3 sm:p-6 transition-opacity duration-200 ${!isAvailable ? 'bg-red-50' : ''}`}>
                    <div className="flex items-start sm:items-center space-x-4">
                      <div className="flex flex-col items-center gap-3 flex-shrink-0">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 rounded-xl overflow-hidden relative shadow-sm">
                          {!isAvailable && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                              <span className="text-white text-[10px] uppercase font-black px-1 text-center leading-tight">Unavailable</span>
                            </div>
                          )}
                          <img
                            src={imagePath ? resolveImageUrl(imagePath) : FALLBACK_IMAGE}
                            alt={item.itemName || product?.name || 'Item'}
                            className={`w-full h-full object-cover cursor-pointer hover:opacity-80 transition-all ${!isAvailable ? 'opacity-50 grayscale' : ''}`}
                            onClick={() => navigate(link, { state: { from: location.pathname } })}
                            onError={(e) => { e.target.src = FALLBACK_IMAGE; }}
                          />
                        </div>

                        <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200 sm:hidden">
                          <button
                            onClick={() => handleQuantityChange(item, item.quantity - 1)}
                            disabled={item.quantity <= 1 || isUpdating}
                            className="w-7 h-7 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                          >
                            -
                          </button>
                          <span className="w-7 text-center text-xs font-black text-blue-700">{item.quantity}</span>
                          <button
                            onClick={() => handleQuantityChange(item, item.quantity + 1)}
                            disabled={isUpdating || (!isFastFood && product?.stock <= item.quantity)}
                            className="w-7 h-7 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
                         <div className="flex-1 min-w-0">
                          <div className="flex flex-col gap-0.5">
                            <h3
                              className="font-black text-gray-900 text-sm sm:text-base leading-tight cursor-pointer hover:text-blue-600 transition-colors truncate"
                              onClick={() => navigate(link, { state: { from: location.pathname } })}
                            >
                              {item.itemName || product?.name || product?.title || item.name || 'Unknown Item'}
                            </h3>

                            {(variantName || comboName || item.variantName || item.comboName) && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {(variantName || item.variantName) && item.variantName !== '0-0' && variantName !== '0-0' && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                    {item.variantName || variantName}
                                  </span>
                                )}
                                {(comboName || item.comboName) && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
                                    {item.comboName || comboName}
                                  </span>
                                )}
                              </div>
                            )}

                            <p className="text-[10px] sm:text-xs text-gray-500 mt-1 truncate">
                              Seller: <span className="text-gray-900 font-semibold">{
                                item.sellerBusinessName ||
                                (isFastFood ? product?.kitchenVendor : null) ||
                                (isService ? product?.seller?.name : null) ||
                                (product?.seller?.name || product?.kitchenVendor || item.sellerName || 'Direct Seller')
                              }</span>
                            </p>
                          </div>
                          <div className="flex items-center space-x-4 mt-1">
                            {!isFastFood && product?.stock <= 5 && (
                              <span className="text-[10px] font-black uppercase bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                                {product.stock} Left
                              </span>
                            )}
                            {!isAvailable && (
                              <span className="inline-block bg-red-100 text-red-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-red-200">
                                Out of Stock
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="hidden sm:flex items-center gap-3 p-1.5 bg-gray-50 rounded-xl border border-gray-100">
                          <button
                            onClick={() => handleQuantityChange(item, item.quantity - 1)}
                            disabled={item.quantity <= 1 || isUpdating}
                            className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm font-black text-gray-600"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-black text-blue-800">{item.quantity}</span>
                          <button
                            onClick={() => handleQuantityChange(item, item.quantity + 1)}
                            disabled={isUpdating || (!isFastFood && product?.stock <= item.quantity)}
                            className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm font-black text-gray-600"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-left sm:text-right sm:min-w-[120px]">
                          <div className="font-black text-lg text-blue-900 mb-1">
                            {formatPrice(item.total)}
                          </div>
                          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-1">
                            <button
                              onClick={() => handleRemoveItem(item)}
                              className="text-red-500 hover:text-red-700 text-[10px] font-black uppercase tracking-wider"
                            >
                              Remove
                            </button>
                            {localStorage.getItem('marketing_mode') !== 'true' && !isFastFood && (
                              <button
                                onClick={() => moveToWishlist(id)}
                                className="text-blue-500 hover:text-blue-700 text-[10px] font-black uppercase tracking-wider"
                              >
                                Save
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white md:rounded-2xl shadow-lg border-0 md:border border-gray-100 p-4 sm:p-8 sticky top-4">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-4 sm:mb-6 tracking-tight">Order Summary</h2>

              <div className="mb-4 p-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  {cartScope === 'fastfood' ? 'Fastfood Cart Actions' : 'Products Cart Actions'}
                </span>
                {showClearConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-red-600">Sure?</span>
                    <button
                      onClick={handleClearCart}
                      className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-red-700 transition-all"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="text-gray-400 hover:text-gray-600 text-[10px] font-black uppercase px-2"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="text-red-500 hover:text-red-700 font-black text-[10px] uppercase tracking-wider transition-colors"
                  >
                    Clear This Section
                  </button>
                )}
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center group">
                  <span className="text-gray-500 font-bold text-xs uppercase tracking-wider">Subtotal ({visibleSummary.itemCount})</span>
                  <span className="font-black text-gray-900">{formatPrice(visibleSummary.subtotal || 0)}</span>
                </div>

                {localStorage.getItem('marketing_mode') === 'true' && (
                  <div className="flex justify-between items-center border-t border-dashed border-gray-100 pt-4 mt-2 bg-green-50/50 p-2 rounded-lg">
                    <span className="text-green-700 font-black text-[10px] uppercase tracking-widest">Marketer Commission</span>
                    <span className="font-black text-green-600">
                      {formatPrice(visibleSummary.totalCommission || 0)}
                    </span>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-6 mt-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">Total Payable</span>
                      <span className="text-3xl font-black text-blue-900 tracking-tighter">
                        {formatPrice(visibleSummary.total || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const hasUnavailableItems = visibleItems.some(item => !isItemAvailable(item));
                if (hasUnavailableItems) {
                  return (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold animate-pulse">
                      ⚠️ Some items are unavailable. Please remove them.
                    </div>
                  );
                }
                return null;
              })()}

              <button
                onClick={handleCheckout}
                disabled={visibleItems.some(item => !isItemAvailable(item))}
                className={`w-full py-4 px-6 rounded-xl font-black uppercase tracking-widest text-sm mb-4 transition-all duration-300 shadow-lg ${visibleItems.some(item => !isItemAvailable(item))
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                  : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-100 hover:shadow-orange-200 active:scale-[0.98]'
                  }`}
              >
                Checkout Now
              </button>

              <Link
                to={cartScope === 'fastfood' ? '/fastfood' : '/'}
                className="block text-center text-blue-600 hover:text-blue-800 font-black text-[10px] uppercase tracking-widest transition-colors"
              >
                {cartScope === 'fastfood' ? 'Browse Fast Food' : 'Continue Shopping'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
