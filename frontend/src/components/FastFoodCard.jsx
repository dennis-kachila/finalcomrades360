import React from 'react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist } from '../contexts/WishlistContext';
import { useToast } from '../components/ui/use-toast';
import { FaLeaf, FaFire, FaClock, FaLocationArrow, FaHeart } from 'react-icons/fa';
import { resolveImageUrl, getResizedImageUrl } from '../utils/imageUtils';
import { fastFoodService } from '../services/fastFoodService';
import { formatPrice } from '../utils/currency';
import { recursiveParse, ensureArray } from '../utils/parsingUtils';

import { useLocation, useNavigate } from 'react-router-dom';

export default function FastFoodCard({
  item,
  navigate: navigateProp,
  renderActions,
  onView,
  clickable = true,
  contentClassName = '',
  className,
  showBasePrice = false,
  hideImageBadges = false,
  imageHeight = '',
  hideTitle = false
}) {
  const navigateHook = useNavigate();
  const navigate = navigateProp || navigateHook;
  const { addToCart, cart } = useCart();
  const { user } = useAuth();
  const isMarketing = localStorage.getItem('marketing_mode') === 'true';
  const { toast } = useToast();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const isWishlisted = isInWishlist(item.id, 'fastfood');
  const location = useLocation();

  const availability = fastFoodService.getAvailabilityStatus(item);
  const isOpen = availability.state === 'OPEN';

  const handleView = (e, extraState = {}) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();

    if (onView) onView(item);
    else if (navigate) navigate(`/fastfood/${item.id}`, { state: { from: location.pathname, ...extraState } });
  };

  const checkCartConflicts = () => {
    const cartItems = Array.isArray(cart?.items) ? cart.items : [];
    if (!cartItems.length) return { ok: true };

    const vendorId = String(item?.vendor || item?.vendorId || item?.sellerId || '');
    const currentVendorName = item?.vendorDetail?.name || item?.seller?.name || item?.kitchenVendor || 'this vendor';

    const fastFoodItems = cartItems.filter((cartItem) => cartItem.itemType === 'fastfood' || cartItem.fastFoodId);
    if (!fastFoodItems.length) return { ok: true };

    const firstCartVendor = fastFoodItems.find(Boolean);
    const existingVendorId = String(
      firstCartVendor?.fastFood?.vendor ||
      firstCartVendor?.fastFood?.vendorId ||
      firstCartVendor?.fastFood?.sellerId ||
      ''
    );

    if (existingVendorId && vendorId && existingVendorId !== vendorId) {
      return {
        code: 'different-fastfood-seller',
        ok: false,
        reason: `Your cart already has items from another vendor. Fast food checkout must stay with one vendor (${currentVendorName}).`
      };
    }

    return { ok: true };
  };


  const handleBuyNow = async (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();

    if (!isOpen) {
      toast({
        title: 'Shop Closed',
        description: availability.reason || 'This vendor is currently not taking orders.',
        variant: 'destructive'
      });
      return;
    }

    // Redirect to details with autoAdd flag
    handleView(e, { autoAdd: true });
  };

  const handleAddToCart = handleBuyNow;

  const handleWishlistToggle = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (!user) {
      toast({
        title: 'Login Required',
        description: 'Please log in to add items to your wishlist',
        variant: 'destructive'
      });
      return;
    }

    try {
      await toggleWishlist(item.id, 'fastfood');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update wishlist.',
        variant: 'destructive'
      });
    }
  };

  const dietaryTags = ensureArray(item.dietaryTags);
  const isSpicy = dietaryTags.includes('Spicy');
  const isVeg = dietaryTags.includes('Vegetarian') || dietaryTags.includes('Vegan');

  const variants = ensureArray(item.sizeVariants);
  const firstVariant = variants.length > 0 ? (variants.find(v => Number(v.stock ?? 1) > 0) || variants[0]) : null;

  const finalPrice = showBasePrice
    ? Number(item.basePrice || 0)
    : Number(
      firstVariant?.discountPrice || 
      firstVariant?.displayPrice || 
      firstVariant?.basePrice || 
      firstVariant?.price || 
      item.discountPrice || 
      item.displayPrice || 
      item.basePrice || 
      item.price || 
      0
    );

  const originalPrice = Number(
    firstVariant?.displayPrice || 
    firstVariant?.basePrice || 
    firstVariant?.price || 
    item.displayPrice || 
    item.basePrice || 
    item.price || 
    0
  );

  const hasDiscount = !showBasePrice && (
    (firstVariant && Number(firstVariant.discountPercentage) > 0) || 
    (!firstVariant && Number(item.discountPercentage) > 0)
  ) && finalPrice < originalPrice;

  const isFixedWidth = className?.includes('w-[') || className?.includes('min-w-[');
  const cardBase = isFixedWidth ? className : `w-full ${className || ''}`;

  const isBannerCard = hideImageBadges && hideTitle;

  return (
    <div
      className={`flex-shrink-0 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group flex flex-col border border-gray-100 ${!isOpen ? 'opacity-90' : ''} ${cardBase} ${isBannerCard ? 'h-full min-h-0' : ''}`}
      style={isBannerCard ? { display: 'flex', flexDirection: 'column', height: '100%' } : {}}
    >
      <div
        className={`relative overflow-hidden bg-gray-100 ${isBannerCard ? 'flex-grow-2 min-h-0' : imageHeight || 'h-28 sm:h-40 md:h-48'}`}
        style={isBannerCard ? { flexBasis: '66.666%' } : {}}
      >
        <img
          src={(() => {
            const url = getResizedImageUrl(resolveImageUrl(item.mainImage, null, item.updatedAt), { width: 400, quality: 80 });
            return url;
          })()}
          alt={item.name}
          loading="lazy"
          decoding="async"
          width="210"
          height="192"
          className={`w-full h-full object-cover object-center transition-transform duration-300 ${!isOpen ? 'grayscale-[0.4] brightness-90' : ''}`}
          onError={(e) => {
            e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80';
          }}
        />

        {!hideImageBadges && (
          <div className="absolute top-3 right-3 flex flex-col items-end gap-2 z-[20]">
            {isMarketing && Number(item.marketingCommission || 0) > 1 && (
              <span className="bg-purple-600 text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-md border border-purple-500 w-fit">
                KSH {Number(item.marketingCommission).toFixed(2)}
              </span>
            )}

            {item.distance !== undefined && item.distance !== null && (
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center shadow-md border ${item.distance < 1 ? 'bg-blue-600 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-200'}`}>
                <FaLocationArrow className={`mr-1.5 ${item.distance < 1 ? 'animate-pulse' : ''}`} size={8} />
                {item.distance < 1 ? 'NEARBY' : `${item.distance}km`}
              </span>
            )}
          </div>
        )}

        {!hideImageBadges && !isOpen && availability.reason && (
          <div className="absolute inset-0 z-[10] bg-black/30 flex items-center justify-center p-4">
            <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg border border-white/50 shadow-xl flex items-center gap-2">
              <FaClock className="text-gray-600" size={12} />
              <span className="text-[10px] font-bold text-gray-800 uppercase tracking-tight">{availability.reason}</span>
            </div>
          </div>
        )}


        {!hideImageBadges && !renderActions && (
          <button
            onClick={handleWishlistToggle}
            className={`absolute top-0 left-0 sm:top-2 sm:left-2 z-[25] transition-colors ${isWishlisted ? 'text-green-600' : 'text-red-700 hover:text-red-600'}`}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          >
            <FaHeart size={16} />
          </button>
        )}

        {!hideImageBadges && (
          <div className="absolute bottom-3 right-3 flex gap-1">
            {isVeg && (
              <span className="bg-green-100 text-green-700 p-1.5 rounded-full shadow-sm" title="Vegetarian/Vegan">
                <FaLeaf size={12} />
              </span>
            )}
            {isSpicy && (
              <span className="bg-red-100 text-red-700 p-1.5 rounded-full shadow-sm" title="Spicy">
                <FaFire size={12} />
              </span>
            )}
          </div>
        )}
      </div>

      <div
        className={`${contentClassName} px-0 py-0 sm:px-0 flex flex-col ${isBannerCard ? 'flex-grow-1 min-h-0' : ''}`}
        style={isBannerCard ? { flexBasis: '33.333%' } : {}}
      >
        {!hideTitle && (
          <h3
            className="px-2 sm:px-3 font-display font-semibold text-gray-900 mb-1 leading-tight tracking-tight group-hover:text-blue-600 transition-colors text-sm sm:text-base truncate whitespace-nowrap"
            title={item.name}
          >
            {item.name}
          </h3>
        )}

        <div className="px-2 sm:px-3 mb-1 flex flex-col justify-start min-h-[38px] sm:min-h-[42px]">
          <span className={`font-sans text-sm sm:text-base font-black leading-tight ${isOpen ? 'text-gray-900' : 'text-gray-500'}`}>
            {formatPrice(finalPrice)}
          </span>
          <div className="flex items-center -mt-0.5">
            {hasDiscount ? (
              <span className="text-[10px] sm:text-xs text-gray-400 line-through leading-tight">{formatPrice(originalPrice)}</span>
            ) : (
              <span className="text-[10px] sm:text-xs text-gray-400 invisible leading-tight">-</span>
            )}
          </div>
        </div>

        {/* Removed spacer below price */}

        <div>
          {renderActions ? (
            renderActions({ handleAddToCart, handleView, isOpen })
          ) : (
            <div className="flex items-center border-t border-gray-100 gap-1">
              <button
                onClick={handleBuyNow}
                className={`flex-1 min-w-0 px-1 py-1.5 sm:py-2 rounded text-[10px] sm:text-xs font-bold transition-colors truncate flex items-center justify-center gap-1
                  ${
                   isOpen ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                 }`}
                title={isOpen ? 'Buy Now' : 'Shop is currently closed'}
              >
                {isOpen ? 'Buy Now' : 'Closed'}
              </button>

              <button
                onClick={handleView}
                className="flex-1 min-w-0 px-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-white bg-blue-800 hover:bg-blue-900 rounded transition-colors truncate"
                title="View Details"
              >
                View
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
