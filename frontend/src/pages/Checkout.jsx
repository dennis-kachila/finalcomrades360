import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import userService from '../services/userService';
import paymentService from '../services/paymentService';
import { FaMapMarkerAlt, FaStore, FaEdit, FaSearch, FaArrowLeft } from 'react-icons/fa';
import api from '../services/api';
import { resolveImageUrl } from '../utils/imageUtils';
import { formatPrice } from '../utils/currency';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { formatKenyanPhoneInput, validateKenyanPhone, PHONE_VALIDATION_ERROR } from '../utils/validation';
import { fastFoodService } from '../services/fastFoodService';
import { findVariant, getVariantLabel, isSku } from '../utils/variantUtils';
import PhoneVerification from '../components/PhoneVerification';
import MpesaManualInstructions from '../components/payment/MpesaManualInstructions';
import { getSocket } from '../services/socket';

const getFastFoodSellerKey = (item) => {
  const fastFood = item?.fastFood || {};
  return fastFood.vendor || fastFood.vendorId || fastFood.sellerId || fastFood.userId || item.fastFoodId || item.id;
};

const FASTFOOD_PICKUP_INCREMENT_RATE = 0.15;

const calculateFastFoodSellerIncrementalFee = (baseFee, itemCount) => {
  const safeBaseFee = Number(baseFee || 0);
  const safeItemCount = Number(itemCount || 0);
  if (safeBaseFee <= 0 || safeItemCount <= 0) return 0;
  const extraItems = Math.max(0, safeItemCount - 1);
  return safeBaseFee + (safeBaseFee * FASTFOOD_PICKUP_INCREMENT_RATE * extraItems);
};

const getFastFoodBaseDeliveryFee = (item) => Number(item?.deliveryFee || item?.fastFood?.deliveryFee || 0);

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

const calculateFastFoodPickupPointTotal = (items = [], baseFee = 0) => {
  const sellerQuantities = buildFastFoodSellerQuantityMap(items);
  let total = 0;
  sellerQuantities.forEach((qty) => {
    total += calculateFastFoodSellerIncrementalFee(baseFee, qty);
  });
  return total;
};

const calculateFastFoodHomeDeliveryTotal = (items = []) => {
  const sellerQuantities = buildFastFoodSellerQuantityMap(items);
  const sellerFees = new Map();

  items
    .filter((item) => item.itemType === 'fastfood')
    .forEach((item) => {
      const sellerKey = `fastfood:${getFastFoodSellerKey(item)}`;
      if (!sellerFees.has(sellerKey)) {
        sellerFees.set(sellerKey, getFastFoodBaseDeliveryFee(item));
      }
    });

  let total = 0;
  sellerQuantities.forEach((qty, sellerKey) => {
    total += calculateFastFoodSellerIncrementalFee(sellerFees.get(sellerKey) || 0, qty);
  });

  return total;
};

const calculateGroupedDeliveryFee = (items = []) => {
  const hasFastFood = items.some((item) => item.itemType === 'fastfood');
  if (hasFastFood) {
    return calculateFastFoodHomeDeliveryTotal(items);
  }

  return items.reduce((sum, item) => {
    return sum + Number(item.deliveryFee || 0);
  }, 0);
};

function Checkout() {
  const { cart, loading: cartLoading, removeFromCart, processQueue, queuedItems } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentId, setPaymentId] = useState(null);
  const [pollingPayment, setPollingPayment] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  // Process queued items on successful order placement
  useEffect(() => {
    if (isSuccessDialogOpen && queuedItems.length > 0) {
      console.log('🚀 [Checkout] Order successful, processing queued items:', queuedItems.length);
      processQueue();
    }
  }, [isSuccessDialogOpen, queuedItems.length, processQueue]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isLookupUsed, setIsLookupUsed] = useState(false);
  const [searchedCustomer, setSearchedCustomer] = useState(null);
  const checkoutGroupId = useMemo(() => `GRP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, []);
  const fileBase = useMemo(() => (api.defaults.baseURL || '').replace(/\/?api\/?$/, ''), []);
  const cartScope = useMemo(() => {
    const scope = new URLSearchParams(location.search).get('scope');
    return scope === 'fastfood' ? 'fastfood' : 'products';
  }, [location.search]);
  const isFastFoodScope = cartScope === 'fastfood';
  const pickupLabel = isFastFoodScope ? 'Fast Food Pickup Point' : 'Pick Station';
  const pickupLabelPlural = isFastFoodScope ? 'Fast Food Pickup Points' : 'Pick Stations';
  const checkoutBackTarget = (typeof location.state?.from === 'string' && location.state.from)
    ? location.state.from
    : `/cart?scope=${cartScope}`;

  const totalQuantity = useMemo(() => {
    return (cart?.items || [])
      .filter((item) => (cartScope === 'fastfood' ? item.itemType === 'fastfood' : item.itemType !== 'fastfood'))
      .reduce((acc, item) => acc + (item.quantity || 0), 0);
  }, [cart?.items, cartScope]);

  const scopedItems = useMemo(() => {
    const items = Array.isArray(cart?.items) ? cart.items : [];
    return items.filter((item) => (cartScope === 'fastfood' ? item.itemType === 'fastfood' : item.itemType !== 'fastfood'));
  }, [cart?.items, cartScope]);

  const scopedSummary = useMemo(() => {
    const subtotal = scopedItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const deliveryFee = calculateGroupedDeliveryFee(scopedItems);
    const totalCommission = scopedItems.reduce((sum, item) => sum + Number(item.itemCommission || 0), 0);
    return {
      itemCount: scopedItems.length,
      subtotal,
      deliveryFee,
      totalCommission,
      total: subtotal + deliveryFee
    };
  }, [scopedItems]);
  const [formData, setFormData] = useState({
    deliveryMethod: 'home_delivery',
    pickStation: '',
    deliveryAddress: '',
    paymentMethod: 'cash_on_delivery',
    paymentSubMethod: 'cash',
    mobileMoneyPhone: '',
    referralCode: '',
    isEditingAddress: false,
    editedCounty: '',
    editedTown: '',
    editedEstate: '',
    editedHouseNumber: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    specialInstructions: '',
    paymentProofUrl: ''
  });
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [batchSystemEnabled, setBatchSystemEnabled] = useState(false);
  const [activeBatches, setActiveBatches] = useState([]);
  const [selectedOrderBatchId, setSelectedOrderBatchId] = useState('');
  const [loadingBatches, setLoadingBatches] = useState(false);

  const [pickStations, setPickStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [isReferralLocked, setIsReferralLocked] = useState(!!localStorage.getItem('referrerCode'));

  // Fetch pick stations from API
  useEffect(() => {
    const fetchPickStations = async () => {
      setLoadingStations(true);
      try {
        if (isFastFoodScope) {
          const response = await api.get('/fastfood/pickup-points/list');
          if (response.data.success) {
            const normalizedPoints = (response.data.data || []).map((point) => ({
              id: point.id,
              name: point.name,
              location: point.address || 'No address provided',
              price: Number(point.deliveryFee || 0),
            }));
            setPickStations(normalizedPoints);
          }
        } else {
          const response = await api.get('/pickup-stations?activeOnly=true');
          if (response.data.success) {
            setPickStations(response.data.stations);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch ${pickupLabelPlural.toLowerCase()}:`, error);
      } finally {
        setLoadingStations(false);
      }
    };

    fetchPickStations();
  }, [isFastFoodScope, pickupLabelPlural]);

  // Fetch Batch System Config
  useEffect(() => {
    const fetchBatchConfig = async () => {
      try {
        const res = await fastFoodService.getPublicBatchSystemConfig();
        if (res.success) {
          const enabled = res.data === true || String(res.data).toLowerCase() === 'true';
          setBatchSystemEnabled(enabled);
        }
      } catch (err) {
        console.error('Failed to fetch batch config:', err);
      }
    };
    fetchBatchConfig();
  }, []);

  useEffect(() => {
    const fetchActiveBatches = async () => {
      if (!isFastFoodScope || !batchSystemEnabled) {
        setActiveBatches([]);
        setSelectedOrderBatchId('');
        return;
      }

      setLoadingBatches(true);
      try {
        const res = await fastFoodService.getActiveBatches();
        const batches = res?.success && Array.isArray(res.batches) ? res.batches : [];
        setActiveBatches(batches);

        const cartBatchIds = [...new Set(
          scopedItems
            .map((item) => (item?.batchId ? String(item.batchId) : ''))
            .filter(Boolean)
        )];

        // No auto-selection. User must manually choose.
      } catch (err) {
        console.error('Failed to fetch active batches:', err);
        setActiveBatches([]);
      } finally {
        setLoadingBatches(false);
      }
    };

    fetchActiveBatches();
  }, [isFastFoodScope, batchSystemEnabled, scopedItems, selectedOrderBatchId]);

  // Extract referral code from URL parameters or localStorage and set it in the form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCodeFromUrl = params.get('ref');

    let refCode = refCodeFromUrl;
    if (!refCode) {
      try {
        refCode = localStorage.getItem('referrerCode') || '';
      } catch (_) {
        refCode = '';
      }
    }

    if (refCode && !formData.referralCode) {
      console.log('🔗 Referral Link Detected: Pre-filling code', refCode);
      setFormData(prev => ({
        ...prev,
        referralCode: refCode
      }));
      setIsReferralLocked(true);
    }
  }, [formData.referralCode]);

  // Load user profile for address auto-fill
  useEffect(() => {
    const loadUserProfile = async () => {
      if (user) {
        try {
          const profile = await userService.getProfile();
          setUserProfile(profile);

          const isMarketingMode = localStorage.getItem('marketing_mode') === 'true';

          // Auto-fill address for home delivery ONLY if not in marketing mode
          if (!isMarketingMode && (profile.county || profile.town || profile.estate || profile.houseNumber || profile.name || profile.phone)) {
            const addressParts = [
              profile.county,
              profile.town,
              profile.estate,
              profile.houseNumber
            ].filter(Boolean);
            setFormData(prev => ({
              ...prev,
              deliveryAddress: addressParts.join(', '),
              editedCounty: profile.county || '',
              editedTown: profile.town || '',
              editedEstate: profile.estate || '',
              editedHouseNumber: profile.houseNumber || ''
            }));
          }
        } catch (error) {
          console.error('Failed to load user profile:', error);
        }
      }
    };

    loadUserProfile();
  }, [user]);

  // Update edited fields when user profile changes
  useEffect(() => {
    const isMarketingMode = localStorage.getItem('marketing_mode') === 'true';
    if (userProfile && !isMarketingMode) {
      setFormData(prev => ({
        ...prev,
        editedCounty: userProfile.county || '',
        editedTown: userProfile.town || '',
        editedEstate: userProfile.estate || '',
        editedHouseNumber: userProfile.houseNumber || ''
      }));
    }
  }, [userProfile]);

  // Marketing Mode: Auto-fill referral code with the marketer's own code
  // Marketing Mode: Auto-fill referral code for Marketers/Admins if not already set
  useEffect(() => {
    const isMarketingMode = localStorage.getItem('marketing_mode') === 'true';
    const storedReferrer = localStorage.getItem('referrerCode');

    // 1. If we already have a specific referrer from the URL/Storage, respect it. Don't overwrite.
    if (storedReferrer) return;

    // 3. If no referrer is set, and we are a Marketer/Admin in marketing mode, assume self-referral
    const allowedRoles = ['marketer', 'marketing', 'admin', 'superadmin', 'super_admin'];
    const userRole = user?.role || 'customer';

    if (isMarketingMode && userProfile?.referralCode && allowedRoles.includes(userRole) && !formData.referralCode) {
      console.log('📢 Marketing Mode Active: Auto-filling marketer code', userProfile.referralCode);
      setFormData(prev => ({
        ...prev,
        referralCode: userProfile.referralCode
      }));
    }
  }, [userProfile, user, formData.referralCode]);

  // Real-time payment updates via Socket.io
  useEffect(() => {
    if (!user) return;
    
    const socket = getSocket();
    
    const handleStatusUpdate = (data) => {
      console.log('📡 Payment status update received:', data);
      if (data.status === 'completed') {
        setPaymentCompleted(true);
        setPollingPayment(false);
      } else if (data.status === 'failed') {
        setPollingPayment(false);
        setPaymentId(null);
        alert('Payment failed. Please try again.');
      }
    };

    socket.on('paymentStatusUpdate', handleStatusUpdate);
    
    return () => {
      socket.off('paymentStatusUpdate', handleStatusUpdate);
    };
  }, [user]);

  // Poll payment status for prepay orders (as fallback)
  useEffect(() => {
    if (paymentId && pollingPayment && !paymentCompleted) {
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await paymentService.checkPaymentStatus(paymentId);
          if (statusResponse.success && statusResponse.payment) {
            if (statusResponse.payment.status === 'completed') {
              setPaymentCompleted(true);
              setPollingPayment(false);
            } else if (statusResponse.payment.status === 'failed') {
              setPollingPayment(false);
              setPaymentId(null);
            }
          }
        } catch (error) {
          console.error('Error polling payment status:', error);
        }
      }, 5000); // Poll every 5 seconds as a fallback

      return () => clearInterval(pollInterval);
    }
  }, [paymentId, pollingPayment, paymentCompleted]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && !cartLoading) {
      navigate('/login', { state: { from: '/checkout' } });
    }
  }, [user, cartLoading, navigate]);

  const selectedOrderBatch = useMemo(() => {
    if (!selectedOrderBatchId) return null;
    return activeBatches.find((batch) => String(batch.id) === String(selectedOrderBatchId)) || null;
  }, [activeBatches, selectedOrderBatchId]);

  // Redirect if cart is empty (but not if we just placed an order)
  useEffect(() => {
    if (!cartLoading && !isSuccessDialogOpen && (!cart || !cart.items || scopedItems.length === 0)) {
      navigate(`/cart?scope=${cartScope}`);
    }
  }, [cart, cartLoading, navigate, isSuccessDialogOpen, scopedItems.length, cartScope]);

  if (cartLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading checkout..." />
      </div>
    );
  }

  if (!user || (!isSuccessDialogOpen && (!cart || !cart.items || scopedItems.length === 0))) {
    return null; // Will redirect
  }

  const handleCustomerLookup = async (query) => {
    if (!query || typeof query !== 'string' || !query.trim()) {
      alert('Please enter a name, phone, or email to search');
      return;
    }

    setIsSearchingCustomer(true);
    try {
      const response = await api.get(`/marketing/customer-lookup?query=${encodeURIComponent(query.trim())}`);
      if (response.data.success) {
        const { customer } = response.data;
        setFormData(prev => ({
          ...prev,
          customerName: customer.name || prev.customerName,
          customerPhone: customer.phone || prev.customerPhone,
          customerEmail: customer.email || prev.customerEmail,
          customerAddress: customer.address || prev.customerAddress
        }));
        setIsLookupUsed(true);
        setSearchedCustomer(customer);
        alert(`Found customer: ${customer.name}. Details have been auto-filled.`);
      }
    } catch (error) {
      console.error('Customer lookup failed:', error);
      alert(error.response?.data?.message || 'No customer found matching that name or phone.');
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleResetCustomerDetails = () => {
    setFormData(prev => ({
      ...prev,
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerAddress: ''
    }));
    setIsLookupUsed(false);
    setSearchedCustomer(null);
    const lookupInput = document.getElementById('customer-lookup-input');
    if (lookupInput) lookupInput.value = '';
  };


  const handleSubmit = async (e) => {
    e.preventDefault();

    // Step 1: Frontend Validation
    console.log('🛒 Step 1: Starting frontend validation...');

    if (batchSystemEnabled && isFastFoodScope && !selectedOrderBatchId) {
      alert('⚠️ Batch Selection Required\n\nPlease select one active batch for this order before checkout.');
      return;
    }

    const isMarketingMode = localStorage.getItem('marketing_mode') === 'true';

    // Validate delivery method and address
    if (formData.deliveryMethod === 'pick_station' && !formData.pickStation) {
      alert(`⚠️ ${pickupLabel} Required\n\nPlease select a ${pickupLabel.toLowerCase()} location to continue with your order.`);
      return;
    }

    if (formData.deliveryMethod === 'home_delivery') {
      if (isMarketingMode) {
        // Marketing mode: require customer address text
        if (!formData.customerAddress || !formData.customerAddress.trim()) {
          alert('📍 Customer Delivery Address Required\n\nPlease enter the customer\'s complete delivery address to continue.');
          const addressField = document.querySelector('textarea[name="customerAddress"]');
          if (addressField) { addressField.focus(); addressField.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          return;
        }
      } else {
        // Normal mode: BOTH the combined address string AND all individual components are required
        if (!formData.deliveryAddress || !formData.deliveryAddress.trim()) {
          alert('📍 Delivery Address Required\n\nA delivery address is essential for us to deliver your order. Please click "Edit Address" to enter your location details.');
          const addressField = document.querySelector('textarea[name="deliveryAddress"]');
          if (addressField) { addressField.focus(); addressField.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          return;
        }
        // Validate each address component is present
        if (!formData.editedCounty || !formData.editedCounty.trim()) {
          alert('📍 County Required\n\nPlease select your county. Click "Edit Address" to update your location details.');
          setFormData(prev => ({ ...prev, isEditingAddress: true }));
          return;
        }
        if (!formData.editedTown || !formData.editedTown.trim()) {
          alert('📍 Town/City Required\n\nPlease enter your town or city. Click "Edit Address" to update your location details.');
          setFormData(prev => ({ ...prev, isEditingAddress: true }));
          return;
        }
        if (!formData.editedEstate || !formData.editedEstate.trim()) {
          alert('📍 Estate/Building Required\n\nPlease enter your estate or building name. Click "Edit Address" to update your location details.');
          setFormData(prev => ({ ...prev, isEditingAddress: true }));
          return;
        }
        // House Number is now optional - no validation check required here
      }
    }

    // Validate payment method selection
    if (!formData.paymentMethod) {
      alert('Please select a payment method');
      return;
    }

    if (!formData.paymentSubMethod) {
      alert('Please select a payment sub-method');
      return;
    }

    // Validate mobile money phone number
    if ((formData.paymentSubMethod === 'airtel_money') &&
      !formData.mobileMoneyPhone.trim()) {
      alert('Please enter your mobile money phone number');
      return;
    }

    if (formData.mobileMoneyPhone.trim() && !validateKenyanPhone(formData.mobileMoneyPhone.trim())) {
      alert(`Mobile Money Phone: ${PHONE_VALIDATION_ERROR}`);
      return;
    }

    // Validate customer details in marketing mode
    if (isMarketingMode) {
      if (!formData.customerName.trim()) {
        alert('Please enter the customer name');
        return;
      }
      if (!formData.customerPhone.trim()) {
        alert('Please enter the customer phone number');
        return;
      }
      if (formData.customerPhone.trim() && !validateKenyanPhone(formData.customerPhone.trim())) {
        alert(`Customer Phone: ${PHONE_VALIDATION_ERROR}`);
        return;
      }
      if (!formData.customerAddress.trim()) {
        alert('Please enter the customer delivery address');
        return;
      }
    }

    // Validate cart items are still valid
    if (!cart || !cart.items || scopedItems.length === 0) {
      alert('Your cart is empty');
      return;
    }

    console.log('✅ Frontend validation passed');

    setLoading(true);

    try {
      if (formData.paymentMethod === 'prepay' && !paymentCompleted) {
        // Now handled by explicit initiate button
        alert('Please initiate and complete your payment first.');
        return;
      } else {
        // Step 2: Prepare order data (for cash on delivery or completed prepay)
        if (batchSystemEnabled && isFastFoodScope) {
          const activeCartType = localStorage.getItem('marketing_mode') === 'true' ? 'marketing' : 'personal';
          await api.patch('/cart/fastfood/batch', {
            batchId: Number(selectedOrderBatchId),
            cartType: activeCartType
          });
        }

        const subtotal = scopedSummary.subtotal || 0;
        const chargedFastFoodSellers = new Set();
        const fastFoodSellerQuantities = buildFastFoodSellerQuantityMap(scopedItems);
        const deliveryFee = formData.deliveryMethod === 'home_delivery'
          ? (scopedSummary.deliveryFee || 0)
          : formData.deliveryMethod === 'pick_station'
            ? (isFastFoodScope
              ? calculateFastFoodPickupPointTotal(scopedItems, selectedStation?.price || 0)
              : ((selectedStation?.price || 0) * totalQuantity))
            : 0;
        const total = subtotal + deliveryFee;

        const orderData = {
          checkoutGroupId,
          deliveryMethod: formData.deliveryMethod,
          deliveryAddress: formData.deliveryMethod === 'home_delivery' ? (
            isMarketingMode ? formData.customerAddress.trim() : (
              formData.isEditingAddress ?
                [formData.editedCounty, formData.editedTown, formData.editedEstate, formData.editedHouseNumber].filter(Boolean).join(', ') :
                formData.deliveryAddress.trim()
            )
          ) : null,
          pickStation: formData.deliveryMethod === 'pick_station' ? formData.pickStation : null,
          pickStationId: formData.deliveryMethod === 'pick_station' ? (formData.pickStationId || null) : null,
          paymentMethod: `${formData.paymentMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${formData.paymentSubMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          paymentType: formData.paymentMethod, // 'cash_on_delivery' or 'prepay'
          paymentSubType: formData.paymentSubMethod, // specific payment method
          paymentId: paymentId, // Attach payment ID for prepay
          primaryReferralCode: formData.referralCode.trim() || null, // Include referral code if provided (order-specific)
          items: scopedItems.map((item, idx) => {
            // Determine item-level delivery fee
            let itemDeliveryFee = 0;
            if (formData.deliveryMethod === 'pick_station') {
              if (isFastFoodScope) {
                const sellerKey = `fastfood:${getFastFoodSellerKey(item)}`;
                if (chargedFastFoodSellers.has(sellerKey)) {
                  itemDeliveryFee = 0;
                } else {
                  const sellerItemCount = fastFoodSellerQuantities.get(sellerKey) || 0;
                  itemDeliveryFee = calculateFastFoodSellerIncrementalFee(selectedStation?.price || 0, sellerItemCount);
                }
                chargedFastFoodSellers.add(sellerKey);
              } else {
                itemDeliveryFee = (selectedStation?.price || 0) * item.quantity;
              }
            } else if (formData.deliveryMethod === 'home_delivery') {
              if (isFastFoodScope) {
                const sellerKey = `fastfood:${getFastFoodSellerKey(item)}`;
                if (chargedFastFoodSellers.has(sellerKey)) {
                  itemDeliveryFee = 0;
                } else {
                  const sellerItemCount = fastFoodSellerQuantities.get(sellerKey) || 0;
                  itemDeliveryFee = calculateFastFoodSellerIncrementalFee(getFastFoodBaseDeliveryFee(item), sellerItemCount);
                }
                chargedFastFoodSellers.add(sellerKey);
              } else {
                itemDeliveryFee = (item.product?.deliveryFee || item.deliveryFee || 0) * item.quantity;
              }
            }

            const mappedItem = {
              productId: item.fastFoodId || item.product?.id || item.productId || item.id,
              type: item.itemType || (item.fastFoodId ? 'fastfood' : 'product'),
              quantity: item.quantity,
              price: item.price,
              total: item.total,
              deliveryFee: itemDeliveryFee, // Pass item-level fee to backend
              batchId: isFastFoodScope && batchSystemEnabled ? Number(selectedOrderBatchId) : (item.batchId || null),
              variantId: item.variantId || item.variant_id || null,
              comboId: item.comboId || item.combo_id || null
            };
            console.log(`🛒 [Checkout Debug] Mapping Item ${idx}:`, mappedItem);
            return mappedItem;
          }),
          subtotal,
          deliveryFee,
          total,
          isMarketingOrder: localStorage.getItem('marketing_mode') === 'true',
          customerName: isMarketingMode ? formData.customerName : (userProfile?.name || formData.customerName),
          customerPhone: formData.mobileMoneyPhone || formData.customerPhone || userProfile?.phone,
          customerEmail: isMarketingMode ? formData.customerEmail : (userProfile?.email || formData.customerEmail),
          marketingDeliveryAddress: isMarketingMode ? formData.customerAddress : formData.deliveryAddress,
          deliveryInstructions: isFastFoodScope ? (formData.specialInstructions?.trim() || null) : null,
          totalCommission: scopedSummary.totalCommission || 0,
          paymentProofUrl: formData.paymentProofUrl || null
        };

        console.log('📦 [Checkout Debug] Final Order Data Payload:', JSON.stringify(orderData, null, 2));

        // Step 3: Send order creation request to backend
        console.log('🚀 Step 3: Sending order creation request...');

        // Use axios client configured in ../services/api to hit http://localhost:5000/api
        const response = await api.post('/orders', orderData);
        const data = response.data;

        if (data.success || response.status === 200) {
          console.log('✅ Step 4: Order created successfully');

          // Step 5: Clear cart and show success
          console.log('🧹 Step 5: Clearing cart and showing success...');
          // Store order details and show success dialog
          setCreatedOrder(data.order);
          setIsSuccessDialogOpen(true);

          await Promise.all(
            scopedItems.map((item) => {
              const id = item.itemType === 'fastfood' ? item.fastFoodId : (item.itemType === 'service' ? item.serviceId : item.productId);
              return removeFromCart(id, item.itemType, {
                variantId: item.variantId,
                comboId: item.comboId,
                batchId: item.itemType === 'fastfood' ? (item.batchId || Number(selectedOrderBatchId) || null) : null
              });
            })
          );

          // Reset payment states
          setPaymentCompleted(false);
          setPaymentId(null);
          setPollingPayment(false);

        } else {
          console.error('❌ Order creation failed:', data?.message);
          alert(`Checkout failed: ${data?.message || 'Unknown error'}`);
        }
      }
    } catch (error) {
      // Axios error handling
      const message = error.response?.data?.message || error.message || 'Checkout failed. Please try again.';
      console.error('❌ Checkout failed:', message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get payment instructions
  const getPaymentInstructions = (paymentSubMethod, paymentInfo = null) => {
    switch (paymentSubMethod) {
      case 'mpesa':
      case 'airtel_money':
        return 'Please follow the manual payment instructions provided below and upload your payment proof to continue.';
      default:
        return 'Please complete payment as per instructions provided.';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-4 md:py-8">
      <div className="max-w-[1400px] mx-auto px-0 md:px-4">
        <div className="flex items-center justify-between mb-4 md:mb-8 border-b border-gray-100 pb-4 px-4 md:px-0">
          <Link
            to={checkoutBackTarget}
            className="flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <FaArrowLeft className="mr-2" /> Back to Cart
          </Link>
          {loading && (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
              <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-xs w-full">
                <LoadingSpinner size="xl" message="Processing Order" />
                <p className="text-gray-500 text-center text-sm mb-4">
                  Please wait while we finalize your order. Do not refresh or close this page.
                </p>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-orange-500 h-full animate-pulse transition-all duration-500" style={{ width: '80%' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Order Summary */}
          <div className="space-y-6 order-1 lg:order-1">
            <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-4 md:p-6 sticky top-4">
              <h2 className="text-xl font-semibold mb-4">Order Summary</h2>

              {/* Order Items */}
              <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {scopedItems.map((item) => {
                  // Unified Variant/Combo Resolution
                  let variantName = (item.variantName && !isSku(item.variantName)) ? item.variantName : null;
                  let comboName = item.comboName || null;

                  if ((item.itemType === 'fastfood' || item.type === 'fastfood') && item.fastFood) {
                    if (item.variantId && !variantName) {
                      const variants = typeof item.fastFood.sizeVariants === 'string'
                        ? JSON.parse(item.fastFood.sizeVariants || '[]')
                        : (item.fastFood.sizeVariants || []);
                      const v = variants.find(v => (String(v.id) === String(item.variantId) || v.name === item.variantId || v.size === item.variantId));
                      variantName = v?.size || v?.name || item.variantId;
                    }
                    if (item.comboId && !comboName) {
                      const combos = typeof item.fastFood.comboOptions === 'string'
                        ? JSON.parse(item.fastFood.comboOptions || '[]')
                        : (item.fastFood.comboOptions || []);
                      const c = combos.find(c => (String(c.id) === String(item.comboId) || c.name === item.comboId));
                      comboName = c?.name || item.comboId;
                    }
                  } else if ((item.itemType === 'product' || item.type === 'product' || !item.itemType) && item.product) {
                    if (item.variantId && !variantName) {
                      const variant = findVariant(item.product, item.variantId);
                      variantName = getVariantLabel(variant);
                    }
                  }

                  return (
                    <div key={item.id} className="flex items-center space-x-3 sm:space-x-4 border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={
                            resolveImageUrl(
                              item.itemImage || (item.itemType === 'fastfood' || item.type === 'fastfood'
                                ? (item.fastFood?.mainImage || item.product?.mainImage)
                                : (item.product?.coverImage || item.product?.images?.[0] || item.service?.images?.[0]?.url || item.service?.coverImage)),
                              fileBase
                            )
                          }
                          alt={item.itemName || item.product?.name || item.fastFood?.name || item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.src = '/placeholder.jpg'; }}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 text-[11px] sm:text-xs leading-tight mb-0.5">
                          {item.itemName || item.product?.name || item.fastFood?.name || item.service?.title || item.name || 'Unnamed Item'}
                        </h3>
                        <p className="text-[9px] text-gray-500 mb-1">
                          Seller: <span className="font-semibold text-gray-700">{item.sellerBusinessName || 'Direct Seller'}</span>
                        </p>
                        {/* Display variant/combo names for all items */}
                        {(variantName || comboName || item.variantName) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(variantName || item.variantName) && item.variantName !== '0-0' && variantName !== '0-0' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                {item.variantName || variantName}
                              </span>
                            )}
                            {comboName && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                {comboName}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex justify-between items-baseline mt-1">
                          <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
                          <p className="text-xs font-bold text-gray-900">{formatPrice(item.total)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order Totals */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatPrice(scopedSummary.subtotal || 0)}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery Fee</span>
                  <span className="font-medium">
                    {formData.deliveryMethod === 'pick_station' ? (
                      selectedStation?.price > 0
                        ? formatPrice(isFastFoodScope
                          ? calculateFastFoodPickupPointTotal(scopedItems, selectedStation?.price || 0)
                          : selectedStation.price * totalQuantity)
                        : <span className="text-green-600">FREE</span>
                    ) : formData.deliveryMethod === 'home_delivery' ? (
                      scopedSummary.deliveryFee === 0
                        ? <span className="text-green-600">FREE</span>
                        : formatPrice(scopedSummary.deliveryFee || 0)
                    ) : (
                      <span className="text-green-600">FREE</span>
                    )}
                  </span>
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-between text-xl font-bold text-blue-900 leading-none">
                    <span>Total</span>
                    <span>{formatPrice(
                      formData.deliveryMethod === 'home_delivery'
                        ? (scopedSummary.total || 0)
                        : formData.deliveryMethod === 'pick_station'
                          ? (scopedSummary.subtotal || 0) + (isFastFoodScope
                            ? calculateFastFoodPickupPointTotal(scopedItems, selectedStation?.price || 0)
                            : (selectedStation?.price || 0) * totalQuantity)
                          : (scopedSummary.subtotal || 0)
                    )}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Delivery Information */}
          <div className="space-y-6 order-2 lg:order-2">
            <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-4 md:p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Delivery Information</h2>
              <div className="space-y-4">
                {/* Delivery Method Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-4">
                    Delivery Method *
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      onClick={() => setFormData(prev => ({ ...prev, deliveryMethod: 'home_delivery' }))}
                      className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${formData.deliveryMethod === 'home_delivery'
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${formData.deliveryMethod === 'home_delivery'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                          }`}>
                          {formData.deliveryMethod === 'home_delivery' && (
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                          )}
                        </div>
                        <FaMapMarkerAlt className="text-blue-600 mr-3" size={18} />
                        <div>
                          <div className="font-medium text-gray-900">Home Delivery</div>
                          <div className="text-sm text-gray-600">Delivered to your door</div>
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={() => setFormData(prev => ({ ...prev, deliveryMethod: 'pick_station' }))}
                      className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${formData.deliveryMethod === 'pick_station'
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${formData.deliveryMethod === 'pick_station'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                          }`}>
                          {formData.deliveryMethod === 'pick_station' && (
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                          )}
                        </div>
                        <FaStore className="text-green-600 mr-3" size={18} />
                        <div>
                          <div className="font-medium text-gray-900">{pickupLabel}</div>
                          <div className="text-sm text-gray-600">
                            {isFastFoodScope ? 'Collect from fast food pickup points' : 'Collect from our pickup stations'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pick Station Selection */}
                {formData.deliveryMethod === 'pick_station' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select {pickupLabel} *
                    </label>
                    <select
                      name="pickStation"
                      value={selectedStation ? String(selectedStation.id) : ''}
                      onChange={(e) => {
                        const stationId = e.target.value;
                        const station = pickStations.find(s => String(s.id) === stationId) || null;
                        setSelectedStation(station);
                        setFormData(prev => ({
                          ...prev,
                          pickStation: station ? `${station.name} - ${station.location}` : '',
                          pickStationId: stationId || null,
                        }));
                      }}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required={formData.deliveryMethod === 'pick_station'}
                      disabled={loadingStations}
                    >
                      <option value="">{loadingStations ? `Loading ${pickupLabelPlural.toLowerCase()}...` : `Choose a ${pickupLabel.toLowerCase()}`}</option>
                      {pickStations.map(station => (
                        <option key={station.id} value={String(station.id)}>
                          {station.name} - {station.location} {station.price > 0 ? `(KES ${station.price})` : '(Free)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isFastFoodScope && batchSystemEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Order Batch *
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Choose one active batch for the entire fastfood order.
                    </p>

                    {loadingBatches ? (
                      <div className="text-sm text-gray-500">Loading active batches...</div>
                    ) : activeBatches.length === 0 ? (
                      <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded p-2">
                        No active batches are available right now.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeBatches.map((batch) => {
                          const checked = String(selectedOrderBatchId) === String(batch.id);
                          return (
                            <label
                              key={batch.id}
                              className={`flex items-start gap-3 p-3 border-2 rounded-md cursor-pointer transition-colors select-none ${checked ? 'border-orange-500 bg-orange-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                            >
                              <input
                                type="radio"
                                name="orderBatch"
                                checked={checked}
                                onChange={() => setSelectedOrderBatchId(String(batch.id))}
                                className="mt-1 h-4 w-4"
                              />
                              <div className="flex-1">
                                <div className="font-semibold text-sm text-gray-900">{batch.name || `Batch #${batch.id}`}</div>
                                <div className="flex flex-col gap-0.5 mt-1">
                                  <div className="text-[11px] text-gray-500 font-medium">Orders within: {batch.startTime} - {batch.endTime}</div>
                                  {batch.expectedDelivery && (
                                    <div className="text-[11px] text-orange-600 font-bold uppercase tracking-tight">Delivery by {batch.expectedDelivery}</div>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {selectedOrderBatch ? (
                      <p className="mt-2 text-xs text-green-700">
                        Selected batch: <span className="font-semibold">{selectedOrderBatch.name || `Batch #${selectedOrderBatch.id}`}</span>
                      </p>
                    ) : null}
                  </div>
                )}

                {/* Home Delivery Address */}
                {formData.deliveryMethod === 'home_delivery' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Delivery Address * <span className="text-red-500 text-xs font-normal">(Required)</span>
                      </label>
                      {localStorage.getItem('marketing_mode') !== 'true' && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, isEditingAddress: !prev.isEditingAddress }))}
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                        >
                          <FaEdit className="mr-1" size={12} />
                          {formData.isEditingAddress ? 'Cancel Edit' : 'Edit Address'}
                        </button>
                      )}
                    </div>
                    {/* Address requirement hint */}
                    <div className="mb-3 p-2 bg-blue-50 border-l-4 border-blue-500 rounded">
                      <p className="text-xs text-blue-800">
                        <strong>📍 Required:</strong> Please provide your complete delivery location to ensure accurate delivery of your order.
                      </p>
                    </div>

                    {/* Marketing Mode Lookup Section */}
                    {localStorage.getItem('marketing_mode') === 'true' && (
                      <div className={`bg-orange-50 p-4 rounded-lg border border-orange-100 mb-4 transition-all ${(!isLookupUsed && (formData.customerName || formData.customerPhone || formData.customerAddress)) ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-orange-800 uppercase tracking-wider">
                            Lookup Existing Customer
                          </label>
                          {isLookupUsed && (
                            <button
                              type="button"
                              onClick={handleResetCustomerDetails}
                              className="text-[10px] font-bold text-orange-600 hover:text-orange-800 underline underline-offset-2"
                            >
                              Clear & Search Another
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            id="customer-lookup-input"
                            placeholder="Enter Name, Phone, or Email..."
                            disabled={!isLookupUsed && (formData.customerName || formData.customerPhone || formData.customerAddress)}
                            className="flex-1 border border-orange-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCustomerLookup(e.target.value);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = document.getElementById('customer-lookup-input').value;
                              handleCustomerLookup(val);
                            }}
                            disabled={isSearchingCustomer || (!isLookupUsed && (formData.customerName || formData.customerPhone || formData.customerAddress))}
                            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
                          >
                            {isSearchingCustomer ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <FaSearch size={14} />
                            )}
                            <span>{isSearchingCustomer ? 'Searching...' : 'Search'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Address Display - In Marketing mode, only show if searched and found */}
                    {((localStorage.getItem('marketing_mode') !== 'true' && userProfile && (userProfile.name || userProfile.phone || userProfile.county)) ||
                      (localStorage.getItem('marketing_mode') === 'true' && isLookupUsed && searchedCustomer)) && (
                        <div className="border border-gray-200 rounded-md overflow-hidden mb-4">
                          <table className="w-full">
                            <tbody>
                              {/* Use searchedCustomer if available (marketing mode), otherwise use userProfile */}
                              {(() => {
                                const displayData = (localStorage.getItem('marketing_mode') === 'true' ? searchedCustomer : userProfile) || {};
                                return (
                                  <>
                                    <tr className="border-b border-gray-100">
                                      <td className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700 w-1/3">Name</td>
                                      <td className="px-4 py-2 text-sm text-gray-900 font-bold">{displayData.name}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                      <td className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">Phone</td>
                                      <td className="px-4 py-2 text-sm text-gray-900">{displayData.phone}</td>
                                    </tr>
                                    {displayData.email && (
                                      <tr className="border-b border-gray-100">
                                        <td className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">Email</td>
                                        <td className="px-4 py-2 text-sm text-gray-900">{displayData.email}</td>
                                      </tr>
                                    )}
                                    {displayData.county && (
                                      <tr className="border-b border-gray-100">
                                        <td className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">Location</td>
                                        <td className="px-4 py-2 text-sm text-gray-900">
                                          {[displayData.county, displayData.town, displayData.estate, displayData.houseNumber].filter(Boolean).join(', ')}
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                );
                              })()}
                            </tbody>
                          </table>
                          <p className="text-[11px] text-orange-700 bg-orange-50 px-4 py-2 italic font-medium">
                            {localStorage.getItem('marketing_mode') === 'true'
                              ? "Customer found! You can still refine their details below if needed."
                              : "This is your saved address. Click \"Edit Address\" to modify if needed."}
                          </p>
                        </div>
                      )}

                    {/* Integrated Manual Entry for Marketing Mode (Consolidated) */}
                    {localStorage.getItem('marketing_mode') === 'true' && (
                      <div className="mt-4 space-y-4 bg-orange-50/30 p-4 rounded-lg border border-orange-100">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-bold text-orange-800 uppercase tracking-wider">
                            {isLookupUsed ? 'Refine Customer Details' : 'Manual Customer Details'}
                          </h3>
                          {(formData.customerName || formData.customerPhone || formData.customerAddress) && (
                            <button
                              type="button"
                              onClick={handleResetCustomerDetails}
                              className="text-[10px] font-bold text-orange-600 hover:text-orange-800 underline underline-offset-2"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
                        <p className="text-xs font-medium text-gray-500 italic">
                          {isLookupUsed ? 'Details auto-filled from lookup. Edit below if needed.' : (formData.customerName || formData.customerPhone || formData.customerAddress) ? 'Lookup disabled (manual entry started)' : 'Fill details below or use lookup above'}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Customer Full Name *</label>
                            <input
                              type="text"
                              name="customerName"
                              value={formData.customerName}
                              onChange={handleInputChange}
                              placeholder="Full name"
                              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                              required={localStorage.getItem('marketing_mode') === 'true'}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Customer Phone Number *</label>
                            <input
                              type="tel"
                              name="customerPhone"
                              value={formData.customerPhone}
                              onInput={(e) => e.target.value = formatKenyanPhoneInput(e.target.value)}
                              onChange={handleInputChange}
                              placeholder="e.g., 0712345678, 0123456789, or +254712345678"
                              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                              required={localStorage.getItem('marketing_mode') === 'true'}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Customer Email (Optional)</label>
                          <input
                            type="email"
                            name="customerEmail"
                            value={formData.customerEmail}
                            onChange={handleInputChange}
                            placeholder="Email address"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Customer Delivery Address *</label>
                          <textarea
                            name="customerAddress"
                            value={formData.customerAddress}
                            onChange={handleInputChange}
                            placeholder="Precise delivery details (Estate, House No, Town)"
                            rows="2"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                            required={localStorage.getItem('marketing_mode') === 'true'}
                          />
                        </div>
                      </div>
                    )}

                    {localStorage.getItem('marketing_mode') !== 'true' && (
                      formData.isEditingAddress ? (
                        <div className="space-y-4">
                          {/* Basic info (read-only) */}
                          {userProfile?.name && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                              <input
                                type="text"
                                value={userProfile.name}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                              />
                            </div>
                          )}
                          {userProfile?.phone && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                              <input
                                type="tel"
                                value={userProfile.phone}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                              />
                            </div>
                          )}
                          {userProfile?.additionalPhone && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Phone</label>
                              <input
                                type="tel"
                                value={userProfile.additionalPhone}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                              />
                            </div>
                          )}

                          {/* Editable customer address fields */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">County *</label>
                            <select
                              value={formData.editedCounty}
                              onChange={(e) => setFormData(prev => ({ ...prev, editedCounty: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required
                            >
                              <option value="">Select County</option>
                              {[
                                'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay',
                                'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii',
                                'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera',
                                'Marsabit', 'Meru', 'Migori', 'Mombasa', 'Murang\'a', 'Nairobi City', 'Nakuru',
                                'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta',
                                'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga',
                                'Wajir', 'West Pokot'
                              ].map(county => (
                                <option key={county} value={county}>{county}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Town/City/Institution *</label>
                            <input
                              type="text"
                              value={formData.editedTown}
                              onChange={(e) => setFormData(prev => ({ ...prev, editedTown: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Enter town, city, or institution name"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Estate/Building/Hostel *</label>
                            <input
                              type="text"
                              value={formData.editedEstate}
                              onChange={(e) => setFormData(prev => ({ ...prev, editedEstate: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Enter estate, building, or hostel name"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">House/Room Number (Optional)</label>
                            <input
                              type="text"
                              value={formData.editedHouseNumber}
                              onChange={(e) => setFormData(prev => ({ ...prev, editedHouseNumber: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="e.g. House 12, Room 4, or Door B"
                            />
                          </div>

                          {/* Save Button */}
                          <div className="flex justify-end pt-4 border-t">
                            <button
                              type="button"
                              disabled={isSavingAddress}
                              onClick={async () => {
                                try {
                                  setIsSavingAddress(true);
                                  const addressData = {
                                    county: formData.editedCounty,
                                    town: formData.editedTown,
                                    estate: formData.editedEstate,
                                    houseNumber: formData.editedHouseNumber
                                  };

                                  await userService.updateAddress(addressData);

                                  // Update local user profile state
                                  setUserProfile(prev => ({
                                    ...prev,
                                    county: formData.editedCounty,
                                    town: formData.editedTown,
                                    estate: formData.editedEstate,
                                    houseNumber: formData.editedHouseNumber
                                  }));

                                  // Update delivery address
                                  const addressParts = [
                                    userProfile?.name,
                                    userProfile?.phone,
                                    userProfile?.additionalPhone,
                                    formData.editedCounty,
                                    formData.editedTown,
                                    formData.editedEstate,
                                    formData.editedHouseNumber
                                  ].filter(Boolean);

                                  setFormData(prev => ({
                                    ...prev,
                                    deliveryAddress: addressParts.join(', '),
                                    isEditingAddress: false // Automatically close edit mode on success
                                  }));

                                  alert('Address saved successfully!');
                                } catch (error) {
                                  console.error('Error saving address:', error);
                                  alert('Failed to save address. Please try again.');
                                } finally {
                                  setIsSavingAddress(false);
                                }
                              }}
                              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              {isSavingAddress && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                              <span>{isSavingAddress ? 'Saving...' : 'Save Address'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <textarea
                            name="deliveryAddress"
                            value={formData.deliveryAddress}
                            placeholder="No delivery address set. Please use the 'Edit Address' button."
                            className="w-full border border-gray-200 rounded-md px-3 py-2 bg-gray-50 text-gray-700 focus:outline-none cursor-not-allowed"
                            rows="3"
                            required={formData.deliveryMethod === 'home_delivery'}
                            readOnly
                          />
                          {!formData.deliveryAddress.trim() && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-md">
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, isEditingAddress: true }))}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-blue-700 transition-colors"
                              >
                                + Set Delivery Address
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Special Instructions for Fast Food */}
                {isFastFoodScope && (
                  <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-4 md:p-6 mt-6 transition-all animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
                      Special Prep Instructions
                    </h3>
                    <div className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded mb-3">
                      <p className="text-xs text-blue-800">
                        <strong>💡 Tip:</strong> Any specific prep notes? e.g., "less salt", "no onions", "extra napkins", or "separate sauce".
                      </p>
                    </div>
                    <textarea
                      name="specialInstructions"
                      value={formData.specialInstructions}
                      onChange={handleInputChange}
                      placeholder="Enter any special instructions for the kitchen or delivery agent..."
                      rows="3"
                      maxLength={280}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <div className="flex justify-between mt-1">
                      <p className="text-[10px] text-gray-500">Visible to both the seller and delivery agent.</p>
                      <p className="text-[10px] text-gray-400">{formData.specialInstructions?.length || 0}/280</p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Column 3: Payment Method & Bottom Actions */}
          <div className="space-y-6 order-3 lg:order-3">
            <div className="bg-white md:rounded-lg shadow-sm border-0 md:border border-gray-100 p-4 md:p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Payment Method</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-4">
                    Payment Method *
                  </label>

                  {/* Main Payment Method Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        paymentMethod: 'cash_on_delivery',
                        paymentSubMethod: 'cash'
                      }))}
                      className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${formData.paymentMethod === 'cash_on_delivery'
                        ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${formData.paymentMethod === 'cash_on_delivery'
                          ? 'border-green-500 bg-green-500'
                          : 'border-gray-300'
                          }`}>
                          {formData.paymentMethod === 'cash_on_delivery' && (
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Cash on Delivery</div>
                          <div className="text-sm text-gray-600 font-normal">Pay on arrival</div>
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        paymentMethod: 'prepay',
                        paymentSubMethod: 'mpesa'
                      }))}
                      className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${formData.paymentMethod === 'prepay'
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${formData.paymentMethod === 'prepay'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                          }`}>
                          {formData.paymentMethod === 'prepay' && (
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Prepay</div>
                          <div className="text-sm text-gray-600 font-normal">Pay before delivery</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-payment Methods Selection */}
                  {formData.paymentMethod === 'cash_on_delivery' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-medium text-green-900 mb-3 text-xs uppercase tracking-wider">COD Options</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div
                          onClick={() => setFormData(prev => ({ ...prev, paymentSubMethod: 'cash' }))}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${formData.paymentSubMethod === 'cash' ? 'border-green-500 bg-white' : 'border-gray-200 bg-white/50'}`}
                        >
                          <span className="text-sm font-medium">Cash</span>
                        </div>
                        <div
                          onClick={() => setFormData(prev => ({ ...prev, paymentSubMethod: 'mpesa' }))}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${formData.paymentSubMethod === 'mpesa' ? 'border-green-500 bg-white' : 'border-gray-200 bg-white/50'}`}
                        >
                          <span className="text-sm font-medium">Mobile Money for Prepay</span>
                        </div>
                      </div>
                      {formData.paymentSubMethod === 'mpesa' && (
                        <div className="mt-4">
                          <MpesaManualInstructions 
                            amount={scopedSummary.total} 
                            onScreenshotUpload={(url) => setFormData(prev => ({...prev, paymentProofUrl: url}))}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {formData.paymentMethod === 'prepay' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-3 text-xs uppercase tracking-wider">Prepay Options</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div
                          onClick={() => setFormData(prev => ({ ...prev, paymentSubMethod: 'mpesa' }))}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${formData.paymentSubMethod === 'mpesa' ? 'border-blue-500 bg-white' : 'border-gray-200 bg-white/50'}`}
                        >
                          <span className="text-sm font-medium">Mobile Money for Prepay</span>
                        </div>
                      </div>

                      {formData.paymentSubMethod === 'mpesa' && (
                        <div className="mt-4">
                          <MpesaManualInstructions 
                            amount={scopedSummary.total} 
                            required={true}
                            onScreenshotUpload={(url) => {
                              setFormData(prev => ({...prev, paymentProofUrl: url}));
                              setPaymentCompleted(true); // Treat screenshot upload as "completed" for manual prepay
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Mobile Money Input Section */}
              </div>
            </div>

            {/* Bottom Actions: Referral & Submit */}
            <div className="bg-orange-50 md:rounded-lg shadow-sm border border-orange-100 p-4 md:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-orange-800 mb-1">Referral Code (Optional)</label>
                <div className="relative">
                  <input
                    type="text"
                    name="referralCode"
                    value={formData.referralCode}
                    onChange={handleInputChange}
                    readOnly={isReferralLocked || localStorage.getItem('marketing_mode') === 'true'}
                    placeholder={(isReferralLocked || localStorage.getItem('marketing_mode') === 'true') ? "Referral code locked" : "Enter code..."}
                    className={`w-full border border-orange-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 transition-colors ${
                      (isReferralLocked || localStorage.getItem('marketing_mode') === 'true') ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'
                    }`}
                  />
                  {(isReferralLocked || localStorage.getItem('marketing_mode') === 'true') && formData.referralCode && (
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                      <span className="text-[10px] uppercase font-black tracking-widest text-orange-400">Locked</span>
                    </div>
                  )}
                </div>
              </div>

              {!user?.phoneVerified ? (
                <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">Phone Verification Required</h3>
                  <PhoneVerification currentPhone={user?.phone} onVerified={() => window.location.reload()} />
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={loading || (formData.paymentMethod === 'prepay' && !paymentCompleted)}
                  className={`w-full py-4 rounded-xl font-black text-xl shadow-xl transition-all transform active:scale-95 ${
                    (formData.paymentMethod === 'prepay' && !paymentCompleted)
                      ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-orange-200'
                  }`}
                >
                  {loading ? 'Processing...' : 'Place Order'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Success Dialog */}
      <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <DialogTitle className="text-center text-2xl">Order Placed Successfully!</DialogTitle>
            <DialogDescription className="text-center text-base">
              Thank you for your purchase. Your order has been received and is being processed.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-50 rounded-lg p-3 sm:p-4 my-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Order Number:</span>
              <span className="font-semibold text-gray-900">{createdOrder?.orderNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status:</span>
              <span className="font-medium inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 capitalize">
                {createdOrder?.status === 'super_admin_confirmed' || createdOrder?.status === 'order_placed' ? 'Order Placed' : createdOrder?.status?.replace('_', ' ')}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
              <span className="text-gray-500">Total Amount:</span>
              <span className="font-bold text-gray-900">{formatPrice(createdOrder?.total || 0)}</span>
            </div>
          </div>

          <DialogFooter className="sm:flex-col space-y-2 sm:space-x-0">
            <button
              onClick={() => {
                const isMarketing = localStorage.getItem('marketing_mode') === 'true';
                // Only redirect to marketing dashboard if user is actually a marketer/admin
                const isMarketer = user?.role === 'marketer' || user?.role === 'marketing' || user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'super_admin';

                if (isMarketing && isMarketer) {
                  navigate('/marketing?tab=orders');
                } else {
                  navigate('/customer/orders');
                }
              }}
              className="w-full bg-orange-500 text-white py-2.5 rounded-lg hover:bg-orange-600 transition-colors font-medium"
            >
              View My Orders
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition-colors font-medium border border-gray-200"
            >
              Back to Home
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Checkout;