import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FaTrophy, FaMoneyBillWave, FaWallet, FaShoppingCart,
  FaCog, FaUserPlus, FaCrown, FaMousePointer, FaChartLine,
  FaCheckCircle, FaExclamationTriangle, FaTimes, FaHistory, FaArrowRight, FaQrcode,
  FaUser, FaBox, FaClock, FaMapMarkerAlt, FaUsers, FaPhone, FaEnvelope, FaGlobe, FaLock, FaShareAlt,
  FaWhatsapp, FaFacebook, FaTwitter, FaCopy, FaDownload, FaBars, FaCheck, FaShieldAlt
} from 'react-icons/fa';
import { FaTiktok } from 'react-icons/fa6';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../components/ui/use-toast';
import api from '../../services/api';
import productApi from '../../services/productApi';
import HomeProductCard from '../../components/HomeProductCard';
import ServiceCard from '../../components/ServiceCard';
import FastFoodCard from '../../components/FastFoodCard';
import ShareProducts from './ShareProducts';
import { resolveImageUrl } from '../../utils/imageUtils';
import { copyToClipboard } from '../../utils/clipboard';
import { QRCodeCanvas } from 'qrcode.react';

import html2canvas from 'html2canvas';

const MarketerWallet = lazy(() => import('./MarketerWallet'));

const MarketerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) return tabParam;

    // If we are in marketing mode, default to the 'new-order' tab to maintain flow
    return localStorage.getItem('marketing_mode') === 'true' ? 'new-order' : 'overview';
  });
  // Sync tab with URL parameter changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [window.location.search]);

  
  // Listen for global toggle-marketing-sidebar event
  useEffect(() => {
    const handleToggle = () => setIsSidebarOpen(true);
    window.addEventListener('toggle-marketing-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-marketing-sidebar', handleToggle);
  }, []);


  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [marketerData, setMarketerData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [links, setLinks] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [referralCode, setReferralCode] = useState('');
  const [browseSubTab, setBrowseSubTab] = useState('product'); // 'product', 'service', 'fastfood'

  // Social media accounts state
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [newAccount, setNewAccount] = useState({ platform: '', handle: '' });
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Sharing State
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingItem, setSharingItem] = useState(null);
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);

  const handleShareItem = (item) => {
    setSharingItem(item);
    setShowShareModal(true);
  };

  const [copiedLink, setCopiedLink] = useState(false);
  const handleCopyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      toast({ title: 'Link Copied', description: 'Referral link is now in your clipboard.' });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedLink(true);
        toast({ title: 'Link Copied', description: 'Referral link is now in your clipboard.' });
        setTimeout(() => setCopiedLink(false), 2000);
      } catch (e) {
        toast({ title: 'Copy Failed', description: 'Please copy the link manually.', variant: 'destructive' });
      }
      document.body.removeChild(textArea);
    }
  };

  const getDeepLink = (item) => {
    const origin = window.location.origin;
    const ref = user?.referralCode || 'PROMO';
    if (!item) return `${origin}/?ref=${ref}`;

    let path = '/';
    if (item.type === 'product') path = `/product/${item.id}`;
    else if (item.type === 'service') path = `/service/${item.id}`;
    else if (item.type === 'fastfood') path = `/fastfood/${item.id}`;

    return `${origin}${path}?ref=${ref}`;
  };

  const sharePosterAndLink = async () => {
    const posterElement = document.getElementById('share-poster-content');
    if (!posterElement) return;

    setIsGeneratingPoster(true);
    try {
      const canvas = await html2canvas(posterElement, {
        useCORS: true,
        allowTaint: true,
        scale: 4,
        backgroundColor: '#ffffff'
      });

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
      const file = new File([blob], `comrades360-promo-${sharingItem?.name || 'item'}.png`, { type: 'image/png' });
      const shareUrl = getDeepLink(sharingItem);
      const shareText = `Check out ${sharingItem.name || sharingItem.title} on Comrades360!`;

      if (navigator.share && navigator.canShare({ files: [file] })) {
        // Send the image and text together in one unit
        await navigator.share({
          files: [file],
          title: 'Comrades360 Promotion',
          text: `Check out ${sharingItem.name || sharingItem.title} on Comrades360!\n\nShop here: ${shareUrl}`
        });
        // Keep auto-copy as a handy fallback for the user
        await navigator.clipboard.writeText(`Check out ${sharingItem.name || sharingItem.title} on Comrades360!\n\nShop here: ${shareUrl}`);
        toast({ title: 'Shared Successfully', description: 'Promo image and link shared together!' });
      } else {
        // Fallback: Download and copy link separately
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        const link = document.createElement('a');
        link.download = `comrades360-promo-${sharingItem?.name || 'item'}.png`;
        link.href = dataUrl;
        link.click();

        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: 'Shared (Partial)',
          description: 'Image downloaded and link copied to clipboard!',
          variant: 'default'
        });
      }
    } catch (err) {
      console.error('Sharing failed:', err);
      if (err.name !== 'AbortError') {
        toast({ title: 'Error', description: 'Failed to share.', variant: 'destructive' });
      }
    } finally {
      setIsGeneratingPoster(false);
    }
  };

  const downloadPoster = async () => {
    const posterElement = document.getElementById('share-poster-content');
    if (!posterElement) return;

    setIsGeneratingPoster(true);
    try {
      const canvas = await html2canvas(posterElement, {
        useCORS: true,
        allowTaint: true,
        scale: 4,
        backgroundColor: '#ffffff'
      });
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `comrades360-promo-${sharingItem?.name || 'item'}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: 'Poster Downloaded', description: 'Your promotional image is ready!' });
    } catch (err) {
      console.error('Poster generation failed:', err);
      toast({ title: 'Error', description: 'Failed to generate poster.', variant: 'destructive' });
    } finally {
      setIsGeneratingPoster(false);
    }
  };

  // Fetch social media accounts from backend
  const fetchSocialMediaAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const response = await productApi.getSocialMediaAccounts();
      if (response.data && response.data.success) {
        setSocialAccounts(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching social media accounts:', error);
      // Don't propagate error to UI; this section is optional for marketers
    } finally {
      setLoadingAccounts(false);
    }
  };

  // New Order state (marketer creating orders for clients)
  const [newOrderForm, setNewOrderForm] = useState({
    productId: '',
    quantity: 1,
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryAddress: ''
  });
  const [submittingNewOrder, setSubmittingNewOrder] = useState(false);
  const [lastNewOrder, setLastNewOrder] = useState(null);

  // Marketer orders list for "Marketing Orders" tab
  const [marketerOrders, setMarketerOrders] = useState([]);
  const [loadingMarketerOrders, setLoadingMarketerOrders] = useState(false);
  const [marketerOrdersError, setMarketerOrdersError] = useState(null);

  // Add User State
  const [addUserForm, setAddUserForm] = useState({
    email: '',
    phone: ''
  });
  const [submittingUser, setSubmittingUser] = useState(false);
  const [addUserSuccess, setAddUserSuccess] = useState(null);

  const handleAddUserChange = (e) => {
    const { name, value } = e.target;
    setAddUserForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddUserSubmit = async (e) => {
    e.preventDefault();
    if (!addUserForm.email && !addUserForm.phone) {
      toast({ title: 'Missing Info', description: 'Please provide either an email or phone number.', variant: 'destructive' });
      return;
    }

    setSubmittingUser(true);
    try {
      const response = await api.post('/auth/register', {
        ...addUserForm,
        isMarketerRegistration: true,
        referralCode: user?.referralCode // Ensure attribution
      });

      if (response.data.success) {
        setAddUserSuccess(response.data.user);
        setAddUserForm({ email: '', phone: '' });
        toast({ title: 'Success', description: `Customer ${response.data.user?.name || ''} registered successfully! Credentials sent via SMS/Email.` });
        fetchMyCustomers(); // Refresh the list
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to register customer.';
      toast({ title: 'Registration Failed', description: msg, variant: 'destructive' });
    } finally {
      setSubmittingUser(false);
    }
  };
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);

  // My Customers State
  const [myCustomers, setMyCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customersError, setCustomersError] = useState(null);

  const fetchMyCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const res = await api.get('/marketing/my-customers');
      setMyCustomers(res.data?.customers || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
      setCustomersError('Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleNewOrderInputChange = (e) => {
    const { name, value } = e.target;
    setNewOrderForm((prev) => ({
      ...prev,
      [name]: name === 'quantity' ? Math.max(1, parseInt(value || '1', 10)) : value
    }));
  };

  const handleSubmitNewOrder = async (e) => {
    e.preventDefault();

    try {
      if (!newOrderForm.productId) {
        alert('Please select a product');
        return;
      }
      if (!newOrderForm.customerEmail.trim()) {
        alert('Please enter customer email');
        return;
      }
      if (!newOrderForm.customerPhone.trim()) {
        alert('Please enter customer phone');
        return;
      }
      if (!newOrderForm.deliveryAddress.trim()) {
        alert('Please enter delivery address');
        return;
      }

      const product = products.find((p) => String(p.id) === String(newOrderForm.productId));
      if (!product) {
        alert('Selected product not found');
        return;
      }

      const price = parseFloat(product.discountPrice || product.displayPrice || product.basePrice || 0);
      const quantity = Math.max(1, Number(newOrderForm.quantity) || 1);
      const subtotal = price * quantity;
      const deliveryFee = 0;
      const total = subtotal + deliveryFee;

      // Build a single-item order payload compatible with createOrderFromCart
      const orderData = {
        deliveryMethod: 'home_delivery',
        deliveryAddress: newOrderForm.deliveryAddress,
        pickStation: null,
        paymentMethod: 'Cash On Delivery - Cash',
        paymentType: 'cash_on_delivery',
        paymentSubType: 'cash',
        paymentId: null,
        primaryReferralCode: referralCode && String(referralCode).trim().length > 0
          ? String(referralCode).trim()
          : (user?.referralCode || null), // Default to current marketer's code if not specified
        isMarketingOrder: true,
        customerName: newOrderForm.customerName,
        customerPhone: newOrderForm.customerPhone,
        customerEmail: newOrderForm.customerEmail,
        marketingDeliveryAddress: newOrderForm.deliveryAddress,
        items: [
          {
            productId: product.id,
            type: product.type || 'product',
            quantity,
            price,
            total: subtotal
          }
        ],
        subtotal,
        deliveryFee,
        total
      };

      setSubmittingNewOrder(true);
      const response = await api.post('/orders', orderData);
      const data = response.data;

      if (data.success || response.status === 200) {
        alert(`Order placed successfully for customer! Order Number: ${data.order?.orderNumber || 'N/A'}`);
        setActiveTab('orders'); // Auto-switch to orders tab to see the new entry
        // Store a lightweight summary of the last marketer-created order
        setLastNewOrder({
          ...data.order,
          productName: product.name,
          quantity,
          createdAt: new Date().toISOString()
        });
        setNewOrderForm({
          productId: '',
          quantity: 1,
          customerName: '',
          customerEmail: '',
          customerPhone: '',
          deliveryAddress: ''
        });
      } else {
        alert(data?.message || 'Failed to place order');
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Failed to place order';
      console.error('Error placing marketer order:', message);
      alert(message);
    } finally {
      setSubmittingNewOrder(false);
    }
  };

  // Fetch real data from API
  const fetchData = async (pageNum = 1, showLoading = true, shouldFetchCatalog = true) => {
    if (pageNum === 1) {
      if (showLoading) setLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      if (shouldFetchCatalog) {
        // Fetch from all three APIs concurrently with optimized parameters
        const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
        const [productsResponse, servicesResponse, fastFoodResponse] = await Promise.all([
          api.get(`/products?limit=20&marketing=true&lite=true&page=${pageNum}${searchParam}`).catch(err => {
            console.error('❌ Products API error:', err);
            return { data: { products: [] } };
          }),
          api.get(`/services?limit=20&page=${pageNum}${searchParam}`).catch(err => {
            console.error('❌ Services API error:', err);
            return { data: { services: [] } };
          }),
          api.get(`/fastfood?limit=20&marketing=true&page=${pageNum}${searchParam}`).catch(err => {
            console.error('❌ Fast Food API error:', err);
            return { data: { fastFoods: [] } };
          })
        ]);

        // Helper to extract array from various response structures
      const extractData = (data, key) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data[key])) return data[key];
        if (data.data) {
          if (Array.isArray(data.data)) return data.data;
          if (Array.isArray(data.data[key])) return data.data[key];
        }
        return [];
      };

      const allProducts = extractData(productsResponse.data, 'products');
      const allServices = extractData(servicesResponse.data, 'services');
      const allFastFood = extractData(fastFoodResponse.data, 'fastFoods');

      // Helper: Calculate commission amount
      const calculateCommission = (item) => {
        return parseFloat(item.marketingCommission || 0);
      };

      const normalizedProducts = allProducts.map((product) => {
        const commissionRate = parseFloat(product.marketingCommission) || parseFloat(product.commissionRate) || 5;
        const commissionAmount = calculateCommission({ ...product, marketingCommission: commissionRate });
        const isApproved = product.approved === true || product.approved === 1 || product.approved === '1' || product.status === 'active' || product.status === 'approved';
        const isVisible = product.visibilityStatus !== 'hidden' && product.visibilityStatus !== 'inactive';
        const isSuspended = product.suspended === true || product.suspended === 1 || product.suspended === '1';
        const isActive = product.isActive !== false && product.isActive !== 0 && product.isActive !== '0';
        return { ...product, type: 'product', marketingCommission: commissionRate, _marketingCommissionAmount: commissionAmount, _isApproved: isApproved, _isVisible: isVisible, _isSuspended: isSuspended, _isActive: isActive };
      });

      const normalizedServices = allServices.map((service) => {
        const commissionAmount = calculateCommission(service);
        return { ...service, type: 'service', name: service.title || service.name, images: service.images?.map(img => img.imageUrl || img) || [], marketingCommission: service.marketingCommission || 0, _marketingCommissionAmount: commissionAmount, _isApproved: service.status === 'approved' || service.status === 'active', _isVisible: service.isAvailable === true || service.isAvailable === 1 || service.isAvailable === '1', _isSuspended: service.status === 'suspended' };
      });

      const normalizedFastFood = allFastFood.map((food) => {
        const commissionAmount = calculateCommission(food);
        // Backend already filters by isActive=true for non-admin, so trust the response
        // Accept items with status 'active' or 'approved' (or legacy approved boolean)
        const isApproved = food.status === 'active' || food.status === 'approved' || food.approved === true || food.approved === 1 || food.approved === '1';
        const isActive = food.isActive === true || food.isActive === 1 || food.isActive === '1' || isApproved; // fallback: if approved, treat as visible
        return { ...food, type: 'fastfood', images: [food.mainImage, ...(food.galleryImages || [])].filter(Boolean), marketingCommission: food.marketingCommission || 0, _marketingCommissionAmount: commissionAmount, _isApproved: isApproved, _isVisible: isActive, _isSuspended: false };
      });

      const allItems = [...normalizedProducts, ...normalizedServices, ...normalizedFastFood];

      // Determine if there's more to load
      const mightHaveMore = allProducts.length === 20 || allServices.length === 20 || allFastFood.length === 20;
      setHasMore(mightHaveMore);

      const finalMarketingEnabledItems = allItems.filter((item) => {
        return item._isApproved && item._isVisible && !item._isSuspended && item._marketingCommissionAmount > 0;
      });

        if (pageNum === 1) {
          setProducts(finalMarketingEnabledItems);
        } else {
          setProducts(prev => {
            const existingIds = new Set(prev.map(i => `${i.type}-${i.id}`));
            const uniqueNew = finalMarketingEnabledItems.filter(i => !existingIds.has(`${i.type}-${i.id}`));
            return [...prev, ...uniqueNew];
          });
        }
      }

      // 2. Fetch Marketer Stats (Clicks, Conversions, Rankings)
      try {
        const statsRes = await api.get('/marketing/stats/my');
        const stats = statsRes.data || {};

        // Aggregate clicks and conversions from stats
        const totalClicks = (stats.clicks || []).reduce((sum, row) => sum + (parseInt(row.count) || 0), 0);
        const totalConversions = (stats.conversions || []).reduce((sum, row) => sum + (parseInt(row.count) || 0), 0);
        const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : 0;

        // Fetch Wallet for balances
        const walletRes = await api.get('/marketing/wallet');
        const wallet = walletRes.data || {};

        if (pageNum === 1) {
          setMarketerData({
            totalEarnings: wallet.balance + wallet.successBalance + wallet.pendingBalance || 0,
            totalClicks,
            totalConversions,
            conversionRate,
            totalReferrals: totalConversions, // Simplified for now
            totalLinks: (stats.clicks || []).length,
            activeLinks: (stats.clicks || []).length,
            rank: 0,
            level: wallet.balance > 50000 ? 'Gold Marketer' : wallet.balance > 10000 ? 'Silver Marketer' : 'Bronze Marketer',
            weeklyEarnings: 0, // Need backend support for time-based earnings
            monthlyEarnings: 0,
            pendingPayouts: wallet.pendingBalance || 0,
            completedPayouts: 0,
            recentTransactions: wallet.transactions || []
          });
        }
      } catch (statsErr) {
        console.warn('Failed to fetch marketer stats:', statsErr);
      }

    } catch (error) {
      if (showLoading) {
        console.error('Error fetching marketing data:', error);
        setError(error.message || 'Failed to load marketing data');
      }
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    // Initial fetch including catalog
    fetchData(1, false, true); 
    fetchSocialMediaAccounts();

    const interval = setInterval(() => {
      // Only refresh stats/wallet on interval to save database strain
      fetchData(1, false, false);
      if (activeTab === 'orders') {
        // Handled by other effect but good to keep synced
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // Debounced Search Effect
  useEffect(() => {
    if (searchQuery === '') {
      fetchData(1, false, true);
      return;
    }

    const timer = setTimeout(() => {
      fetchData(1, false, true);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData(nextPage);
  };

  // Load marketer's own orders when "Marketing Orders" tab is active
  useEffect(() => {
    if (activeTab !== 'orders') return;
    const loadMarketerOrders = async () => {
      try {
        setLoadingMarketerOrders(true);
        setMarketerOrdersError(null);
        const response = await api.get('/orders/my?marketing=true');
        setMarketerOrders(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error('Error loading marketer orders:', err);
        setMarketerOrdersError(err.response?.data?.message || err.message || 'Failed to load orders');
      } finally {
        setLoadingMarketerOrders(false);
      }
    };
    loadMarketerOrders();
  }, [activeTab]);

  // Load My Customers when tab is active
  useEffect(() => {
    if (activeTab !== 'my-customers') return;
    const loadMyCustomers = async () => {
      try {
        setLoadingCustomers(true);
        setCustomersError(null);
        const response = await api.get('/marketing/my-customers');
        setMyCustomers(response.data?.customers || []);
      } catch (err) {
        console.error('Error loading my customers:', err);
        setCustomersError(err.response?.data?.message || 'Failed to load customers');
      } finally {
        setLoadingCustomers(false);
      }
    };
    loadMyCustomers();
  }, [activeTab]);

  const tabs = [
    { id: 'overview', name: 'Overview', icon: <FaTrophy className="w-4 h-4" /> },
    { id: 'earnings', name: 'Earnings & Payouts', icon: <FaMoneyBillWave className="w-4 h-4" /> },
    { id: 'wallet', name: 'Marketer Wallet', icon: <FaWallet className="w-4 h-4" /> },
    { id: 'products', name: 'Browse Products', icon: <FaShoppingCart className="w-4 h-4" /> },
    { id: 'configure', name: 'Configure', icon: <FaCog className="w-4 h-4" /> },
    { id: 'new-order', name: 'New Order', icon: <FaShoppingCart className="w-4 h-4" /> },
    { id: 'orders', name: 'Orders', icon: <FaBox className="w-4 h-4" /> },
    { id: 'add-user', name: 'Add Customer', icon: <FaUserPlus className="w-4 h-4" /> },
    { id: 'my-customers', name: 'My Customers', icon: <FaUsers className="w-4 h-4" /> },
    { id: 'leaderboard', name: 'Leaderboard', icon: <FaCrown className="w-4 h-4" /> }
  ];

  // State for selected customer orders expansion
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loadingCustomerOrders, setLoadingCustomerOrders] = useState(false);





  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState(null);

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      try {
        setLoadingLeaderboard(true);
        // Replace with your actual API endpoint
        const response = await api.get('/marketing/leaderboard');
        setLeaderboardData(response.data || []);
      } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        setLeaderboardError('Failed to load leaderboard data');
      } finally {
        setLoadingLeaderboard(false);
      }
    };

    if (activeTab === 'leaderboard') {
      fetchLeaderboardData();
    }
  }, [activeTab]);

  const renderLeaderboard = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Marketer Leaderboard</h2>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium">Top Performers This Month</h3>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-blue-600 hover:text-blue-800"
            disabled={loadingLeaderboard}
          >
            {loadingLeaderboard ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loadingLeaderboard ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Loading leaderboard data...</p>
          </div>
        ) : leaderboardError ? (
          <div className="p-8 text-center">
            <div className="text-red-500 mb-2">
              <FaExclamationTriangle className="inline-block text-2xl mb-1" />
              <p>{leaderboardError}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : leaderboardData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No leaderboard data available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marketer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Earnings</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {leaderboardData.map((marketer, index) => (
                  <tr
                    key={marketer.id || index}
                    className={marketer.isCurrentUser ? 'bg-blue-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {marketer.rank === 1 && <span className="mr-2 text-lg">👑</span>}
                        {marketer.rank === 2 && <span className="mr-2 text-lg">🥈</span>}
                        {marketer.rank === 3 && <span className="mr-2 text-lg">🥉</span>}
                        {marketer.rank > 3 && marketer.rank <= 10 && <span className="mr-2 text-lg">🏆</span>}
                        <span className="text-sm font-medium text-gray-900">#{marketer.rank || index + 1}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {marketer.name}
                        {marketer.isCurrentUser && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KES {marketer.earnings ? marketer.earnings.toLocaleString() : '0'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {marketer.conversions || '0'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        {marketer.level || 'Bronze'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Marketing Overview</h2>

      {marketerData && (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex items-center">
              <FaMoneyBillWave className="w-8 h-8 text-green-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Total Earnings</p>
                <p className="text-2xl font-bold text-gray-900">KES {marketerData.totalEarnings?.toLocaleString() || '0'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex items-center">
              <FaMousePointer className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Total Clicks</p>
                <p className="text-2xl font-bold text-gray-900">{marketerData.totalClicks || '0'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex items-center">
              <FaChartLine className="w-8 h-8 text-purple-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Conversions</p>
                <p className="text-2xl font-bold text-gray-900">{marketerData.totalConversions || '0'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex items-center">
              <FaCrown className="w-8 h-8 text-yellow-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Level</p>
                <p className="text-lg font-bold text-gray-900">{marketerData.level}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg shadow-lg p-6 text-white mb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2">My Referral Link</h3>
            <p className="text-blue-100 mb-4 md:mb-0 hidden md:block">
              Share this link to the store. Every purchase made through it earns you a commission!
            </p>

          </div>
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-3 font-mono text-xs sm:text-sm break-all flex-1 w-full md:max-w-xs text-center md:text-left">
              {window.location.origin}/?ref={user?.referralCode}
            </div>

            <button
              onClick={async () => {
                const shareUrl = `${window.location.origin}/?ref=${user?.referralCode || 'PROMO'}`;
                const success = await copyToClipboard(shareUrl);
                if (success) {
                  setCopiedLink(true);
                  toast({
                    title: 'Link Copied',
                    description: 'General referral link copied to clipboard!',
                  });
                  setTimeout(() => setCopiedLink(false), 2000);
                } else {
                  toast({
                    title: 'Copy Failed',
                    description: 'Please copy the link manually.',
                    variant: 'destructive',
                  });
                }
              }}
              className="bg-white text-blue-600 px-8 py-3 rounded-xl font-bold hover:bg-blue-50 transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 w-full md:w-auto flex-shrink-0"
            >
              <FaCopy /> {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>



          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Recent Activity</h3>
        <p className="text-gray-500">No recent activity to display.</p>
      </div>
    </div>
  );

  const renderSharedLinks = () => (
    <ShareProducts
      searchQuery={''} // Placeholder if needed
      setSearchQuery={() => { }}
      categoryFilter={'all'}
      setCategoryFilter={() => { }}
      minCommission={0}
      setMinCommission={() => { }}
      sortOrder={'newest'}
      setSortOrder={() => { }}
      stockOnly={false}
      setStockOnly={() => { }}
      flashOnly={false}
      setFlashOnly={() => { }}
      filteredProducts={products}
      categories={[]} // Should be populated from context or parent
      selectedProduct={null}
      sharingContent={{}}
      toggleShareLinks={() => { }}
      handleShare={() => { }}
      copyToClipboard={async (text) => {
        const success = await copyToClipboard(text);
        if (success) {
          toast({ title: 'Copied', description: 'Link copied to clipboard!' });
        } else {
          toast({ title: 'Copy Failed', description: 'Please copy the link manually.', variant: 'destructive' });
        }
      }}
      analytics={marketerData}

      userReferralCode={user?.referralCode}
    />
  );

  const renderEarnings = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Earnings & Payouts</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium mb-4">This Week</h3>
          <p className="text-3xl font-bold text-green-600">
            KES {marketerData?.weeklyEarnings?.toLocaleString() || '0'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium mb-4">This Month</h3>
          <p className="text-3xl font-bold text-blue-600">
            KES {marketerData?.monthlyEarnings?.toLocaleString() || '0'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-medium mb-4">Pending Payouts</h3>
          <p className="text-3xl font-bold text-orange-600">
            KES {marketerData?.pendingPayouts?.toLocaleString() || '0'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <FaHistory className="mr-2 text-purple-500" />
            Recent Earnings History
          </h3>
          <button
            onClick={() => setActiveTab('wallet')}
            className="text-blue-600 text-sm font-bold hover:underline flex items-center gap-1"
          >
            View Wallet <FaArrowRight size={10} />
          </button>
        </div>

        {marketerData?.recentTransactions?.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {marketerData.recentTransactions.slice(0, 5).map(tx => (
              <div key={tx.id} className="py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${tx.type === 'credit' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {tx.type === 'credit' ? <FaMoneyBillWave size={14} /> : <FaArrowRight size={14} className="rotate-180" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{tx.description}</p>
                    <p className="text-[10px] text-gray-400 font-medium">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.amount?.toLocaleString()}
                  </p>
                  <span className="text-[9px] uppercase font-black text-gray-400">{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <FaHistory className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">No earnings history available yet.</p>
            <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">Share links to start earning!</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderProducts = () => {
    // Filter items based on the active sub-tab and search query
    const filteredItems = products.filter(item => {
      const matchesTab = item.type === browseSubTab;
      const itemName = (item.name || item.title || '').toLowerCase();
      const matchesSearch = !searchQuery || itemName.includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });

    return (
      <div className="space-y-6">
        {/* Navigation Tabs */}
        {/* Category Tabs — forced onto one line on mobile */}
        <div className="flex flex-nowrap items-center gap-2 border-b border-gray-200 pb-1 overflow-x-auto scrollbar-hide">


          <button
            onClick={() => setBrowseSubTab('product')}
            className={`px-3 sm:px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 -mb-[2px] ${browseSubTab === 'product'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Products
          </button>

          <button
            onClick={() => setBrowseSubTab('service')}
            className={`px-3 sm:px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 -mb-[2px] ${browseSubTab === 'service'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Services
          </button>

          <button
            onClick={() => setBrowseSubTab('fastfood')}
            className={`px-3 sm:px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 -mb-[2px] ${browseSubTab === 'fastfood'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Fastfood
          </button>

        </div>

        <div className="bg-white rounded-lg shadow border border-gray-100 p-1 sm:p-2 mt-2">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <FaShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No {browseSubTab === 'product' ? 'Products' : browseSubTab === 'service' ? 'Services' : 'Fast Food Items'} Available</h3>
              <p className="text-gray-600">No marketing-enabled items of this type are currently available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-1.5 mt-2">
              {filteredItems.map((item) => {
                const commissionInfo = (
                  <div className="mt-2 flex items-center justify-between px-2.5 py-1.5 bg-green-50/50 rounded-lg border border-green-100/50 group/comm transition-all hover:bg-green-50">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-green-600 font-bold">Commission</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-green-700">
                        KES {item._marketingCommissionAmount?.toLocaleString() || '0'}
                      </span>
                    </div>
                  </div>
                );

                const renderCustomActions = ({ handleView }) => (
                  <div className="flex items-center border-t border-gray-100 gap-1 mt-auto">
                    <button
                      className="flex-1 px-1 py-1.5 bg-blue-600 text-white text-[10px] sm:text-xs font-bold rounded transition-colors flex items-center justify-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShareItem(item);
                      }}
                    >
                      <FaShareAlt size={10} /> Share
                    </button>

                    <button
                      onClick={handleView}
                      className="flex-1 px-1 py-1.5 text-[10px] sm:text-xs font-bold text-white bg-blue-800 hover:bg-blue-900 rounded transition-colors"
                    >
                      View
                    </button>
                  </div>
                );

                if (item.type === 'product') {
                  return (
                    <HomeProductCard
                      key={`product-${item.id}`}
                      product={item}
                      renderActions={renderCustomActions}
                      contentClassName="h-auto"
                    />
                  );
                }

                if (item.type === 'service') {
                  return (
                    <ServiceCard
                      key={`service-${item.id}`}
                      service={item}
                      renderActions={renderCustomActions}
                      contentClassName="h-auto"
                    />
                  );
                }

                if (item.type === 'fastfood') {
                  return (
                    <FastFoodCard
                      key={`fastfood-${item.id}`}
                      item={item}
                      renderActions={renderCustomActions}
                      contentClassName="h-auto"
                    />
                  );
                }

                return null;
              })}
            </div>
          )}

          {/* Load More Button */}
          {hasMore && filteredItems.length > 0 && (
            <div className="mt-8 text-center">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-4 py-2 sm:px-8 sm:py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-base"
              >
                {isLoadingMore ? (
                  <span className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Loading more...
                  </span>
                ) : (
                  'Load More Products'
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    );
  };

  const renderConfigure = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Configure Settings</h2>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Social Media Accounts</h3>

        {loadingAccounts ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading accounts...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {socialAccounts.length === 0 ? (
              <p className="text-gray-500">No social media accounts connected.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {socialAccounts.map((account, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <FaCheckCircle className="w-5 h-5 text-green-500 mr-2" />
                        <span className="font-medium">{account.platform}</span>
                        <span className="text-gray-600 ml-2">@{account.handle}</span>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        Verified
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6">
              <h4 className="font-medium mb-3">Add New Account</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select
                  value={newAccount.platform}
                  onChange={(e) => setNewAccount({ ...newAccount, platform: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Select Platform</option>
                  <option value="facebook">Facebook</option>
                  <option value="twitter">Twitter</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                </select>

                <input
                  type="text"
                  placeholder="Handle/Username"
                  value={newAccount.handle}
                  onChange={(e) => setNewAccount({ ...newAccount, handle: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2"
                />

                <button
                  onClick={() => {/* TODO: Implement add account logic */ }}
                  disabled={!newAccount.platform || !newAccount.handle}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Add Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Marketing Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Auto-share to connected accounts</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-700">Email notifications</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Marketing Orders</h2>

      {loadingMarketerOrders ? (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading orders...</p>
        </div>
      ) : marketerOrdersError ? (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center">
          <div className="text-red-500 mb-2">
            <FaExclamationTriangle className="inline-block text-2xl mb-1" />
            <p>{marketerOrdersError}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      ) : marketerOrders.length === 0 ? (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center">
          <FaShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Orders Yet</h3>
          <p className="text-gray-600 mb-4">Orders you create for customers will appear here.</p>
          <button
            onClick={() => setActiveTab('new-order')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create New Order
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium">Your Marketing Orders</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commission</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commission Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {marketerOrders.map((order) => {
                  // Commission status logic:
                  // Paid when: delivered AND paymentConfirmed AND 7-day return period elapsed
                  const isDelivered = order.status === 'delivered';
                  const isPaid = order.paymentConfirmed;
                  const returnPeriodElapsed = order.actualDelivery ?
                    (new Date() - new Date(order.actualDelivery)) > 7 * 24 * 60 * 60 * 1000 :
                    false;

                  const commissionStatus = (isDelivered && isPaid && returnPeriodElapsed) ? 'Paid' : 'Pending';

                  // Commission amount from order items
                  const orderCommission = (order.OrderItems || []).reduce((sum, item) => sum + (parseFloat(item.commissionAmount) || 0), 0);

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowOrderModal(true);
                      }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.orderNumber || order.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex flex-col">
                          <span className="font-medium">{order.customerName || order.user?.name || 'Unknown'}</span>
                          {(order.customerPhone || order.user?.phone) && (
                            <span className="text-xs text-gray-500">
                              {(order.customerPhone || order.user?.phone).toString().slice(0, -4) + '****'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        KES {order.total?.toLocaleString() || '0'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">
                        KES {orderCommission?.toLocaleString() || '0'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${commissionStatus === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                          {commissionStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${order.status === 'pending' || order.status === 'order_placed' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                              order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                          }`}>
                          {order.status?.replace('_', ' ') || 'pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[150] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8 relative flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Order Details</h3>
                <p className="text-sm text-gray-500">#{selectedOrder.orderNumber}</p>
              </div>
              <button
                onClick={() => setShowOrderModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FaTimes className="text-xl" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Info Cards */}
                <div className="space-y-6">
                  {/* Customer Information */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <h4 className="flex items-center text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                      <FaUser className="mr-2 text-blue-500" /> Customer Details
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Full Name</p>
                        <p className="text-sm font-semibold text-gray-800">{selectedOrder.customerName || selectedOrder.user?.name || 'N/A'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-medium">Phone</p>
                          <p className="text-sm font-semibold text-gray-800">
                            {(selectedOrder.customerPhone || selectedOrder.user?.phone) ? (selectedOrder.customerPhone || selectedOrder.user?.phone).toString().slice(0, -4) + '****' : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Information */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <h4 className="flex items-center text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                      <FaMapMarkerAlt className="mr-2 text-orange-500" /> Delivery Info
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Method</p>
                        <p className="text-sm font-semibold text-gray-800 capitalize">{selectedOrder.deliveryMethod?.replace(/_/g, ' ') || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Address</p>
                        <p className="text-sm font-semibold text-gray-800 italic">
                          {selectedOrder.marketingDeliveryAddress || selectedOrder.deliveryAddress || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Order & Commission Summary */}
                <div className="space-y-6">
                  {/* Status & Payment Card */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <h4 className="flex items-center text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                      <FaClock className="mr-2 text-purple-500" /> Order Summary
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Status</p>
                        <span className={`mt-1 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${selectedOrder.status === 'delivered' ? 'bg-green-100 text-green-700' :
                          selectedOrder.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                          {selectedOrder.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Payment</p>
                        <span className={`mt-1 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${selectedOrder.paymentConfirmed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {selectedOrder.paymentConfirmed ? 'Confirmed' : 'Pending'}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Date Placed</p>
                        <p className="text-sm font-semibold text-gray-800">{new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Time</p>
                        <p className="text-sm font-semibold text-gray-800">{new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  </div>

                  {/* Financial Summary */}
                  <div className="bg-green-50/50 border border-green-100 rounded-xl p-5">
                    <h4 className="flex items-center text-sm font-bold text-green-900 uppercase tracking-wider mb-4">
                      <FaMoneyBillWave className="mr-2 text-green-600" /> Financials
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Order Total</span>
                        <span className="font-bold text-gray-900 font-mono">KES {selectedOrder.total?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-green-100">
                        <span className="text-green-700 font-bold">Your Commission</span>
                        <span className="text-lg font-black text-green-800 font-mono">KES {((selectedOrder.OrderItems || []).reduce((sum, item) => sum + (parseFloat(item.commissionAmount) || 0), 0))?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items Table */}
              <div className="mt-8">
                <h4 className="flex items-center text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                  <FaBox className="mr-2 text-indigo-500" /> Ordered Items
                </h4>
                <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Item</th>
                        <th className="px-5 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Qty</th>
                        <th className="px-5 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Price</th>
                        <th className="px-5 py-3 text-right text-[10px] font-black text-green-600 uppercase tracking-widest">Commission</th>
                        <th className="px-5 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-50">
                      {selectedOrder.OrderItems?.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                                <img
                                  src={resolveImageUrl(
                                    item.product?.coverImage ||
                                    item.Product?.coverImage ||
                                    item.fastFood?.mainImage ||
                                    item.FastFood?.mainImage ||
                                    item.service?.images?.[0] ||
                                    item.Service?.images?.[0] ||
                                    item.coverImage
                                  )}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.target.src = '/placeholder.png' }}
                                />
                              </div>
                              <span className="text-sm font-bold text-gray-800 line-clamp-1">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-sm font-medium text-gray-600">x{item.quantity}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-sm font-medium text-gray-600 font-mono">KES {item.price?.toLocaleString()}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-sm font-bold text-green-600 font-mono">KES {(parseFloat(item.commissionAmount) || 0).toLocaleString()}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-sm font-black text-gray-900 font-mono">KES {item.total?.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowOrderModal(false)}
                className="px-6 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-black transition-all shadow-md active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'links':
        return renderSharedLinks();
      case 'new-order':
        return renderProducts();
      case 'earnings':
        return renderEarnings();
      case 'wallet':
        return (
          <Suspense fallback={<div>Loading Wallet...</div>}>
            <MarketerWallet />
          </Suspense>
        );
      case 'products':
        return renderProducts();
      case 'configure':
        return renderConfigure();
      case 'orders':
        return renderOrders();
      case 'leaderboard':
        return renderLeaderboard();

      case 'add-user':
        return (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/20 rounded-xl">
                    <FaUserPlus className="text-white w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Add New Customer</h2>
                    <p className="text-blue-100 text-sm">Register a customer to your network</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleAddUserSubmit} className="p-6 space-y-4" autoComplete="off">
                {addUserSuccess && (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                    <FaCheckCircle className="text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-800">Customer Added Successfully!</p>
                      <p className="text-xs text-green-600">
                        {addUserSuccess.name || addUserSuccess.email || addUserSuccess.phone} has been registered.
                      </p>
                    </div>
                    <button type="button" onClick={() => setAddUserSuccess(null)} className="ml-auto text-green-400 hover:text-green-600">
                      <FaTimes />
                    </button>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex justify-between">
                    <span>Email Address</span>
                    {!addUserForm.phone && <span className="text-[10px] text-amber-600 font-bold uppercase tracking-tighter self-center">Required if no phone</span>}
                  </label>
                  <div className="relative">
                    <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="email"
                      name="email"
                      value={addUserForm.email}
                      onChange={handleAddUserChange}
                      placeholder="customer@example.com"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/50 focus:bg-white transition-all"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 py-2">
                  <div className="h-px bg-gray-100 flex-1"></div>
                  <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">OR</span>
                  <div className="h-px bg-gray-100 flex-1"></div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex justify-between">
                    <span>Phone Number</span>
                    {!addUserForm.email && <span className="text-[10px] text-amber-600 font-bold uppercase tracking-tighter self-center">Required if no email</span>}
                  </label>
                  <div className="relative">
                    <FaPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="tel"
                      name="phone"
                      value={addUserForm.phone}
                      onChange={handleAddUserChange}
                      placeholder="+254 7XX XXX XXX"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/50 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50 flex gap-3 mt-4">
                  <FaShieldAlt className="text-blue-400 w-5 h-5 flex-shrink-0" />
                  <p className="text-[11px] text-blue-800 leading-relaxed italic font-medium">
                    The backend will automatically generate a temporary password and account name based on the identifier provided. A notification will be sent to the customer immediately. They will be required to change their password upon first login.
                  </p>
                </div>

                {/* Referral Code Banner */}
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <FaGlobe className="text-blue-500 w-4 h-4" />
                  <div className="flex-1">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Referring Marketer</p>
                    <p className="text-sm font-bold text-blue-900">{user?.name || 'Comrades360'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Code</p>
                    <p className="text-sm font-black text-blue-600 font-mono">{user?.referralCode}</p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingUser}
                  className="w-full py-3.5 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-lg hover:shadow-blue-200/50 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
                >
                  {submittingUser ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating Account...</>
                  ) : (
                    <><FaUserPlus /> Register Customer</>
                  )}
                </button>
              </form>
            </div>
          </div>
        );

      case 'my-customers':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">My Customers</h2>
                <p className="text-sm text-gray-500 mt-0.5">Click a row to view their orders</p>
              </div>
              <button
                onClick={() => setActiveTab('add-user')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
              >
                <FaUserPlus /> Add Customer
              </button>
            </div>

            {loadingCustomers ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <span className="ml-3 text-gray-500">Loading customers...</span>
              </div>
            ) : customersError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
                <FaExclamationTriangle className="text-red-400 mx-auto mb-2 text-xl" />
                <p className="text-sm text-red-600">{customersError}</p>
              </div>
            ) : myCustomers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaUsers className="text-blue-300 text-2xl" />
                </div>
                <h3 className="text-base font-semibold text-gray-700 mb-1">No customers yet</h3>
                <p className="text-sm text-gray-400 mb-4">Add your first customer or place an order for someone to get started.</p>
                <button
                  onClick={() => setActiveTab('add-user')}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all"
                >
                  Add First Customer
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Customer Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Customer</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider hidden md:table-cell">Referral Code</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Orders</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {myCustomers.map((customer, idx) => {
                          const isSelected = selectedCustomerId === (customer.id || `guest_${idx}`);
                          return (
                            <React.Fragment key={customer.id || `guest_${idx}`}>
                              <tr
                                onClick={async () => {
                                  const key = customer.id || `guest_${idx}`;
                                  if (selectedCustomerId === key) {
                                    setSelectedCustomerId(null);
                                    setCustomerOrders([]);
                                    return;
                                  }
                                  setSelectedCustomerId(key);
                                  if (!customer.id) { setCustomerOrders([]); return; }
                                  setLoadingCustomerOrders(true);
                                  try {
                                    const res = await api.get(`/marketing/customers/${customer.id}/orders`);
                                    setCustomerOrders(res.data?.orders || []);
                                  } catch {
                                    setCustomerOrders([]);
                                  } finally {
                                    setLoadingCustomerOrders(false);
                                  }
                                }}
                                className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${isSelected ? 'bg-blue-50' : ''}`}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
                                      <span className="text-white font-bold text-sm">{(customer.name || 'G')[0].toUpperCase()}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-gray-900 truncate">{customer.name || 'Guest Customer'}</p>
                                      {customer.phone && (
                                        <p className="text-xs text-gray-400 flex items-center gap-1">
                                          <FaPhone className="w-2.5 h-2.5" />
                                          {customer.phone.toString().slice(0, -4) + '****'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 hidden md:table-cell">
                                  {customer.referralCode
                                    ? <span className="font-mono text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">{customer.referralCode}</span>
                                    : <span className="text-gray-300 text-xs italic">—</span>
                                  }
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="font-bold text-gray-800">{customer.orderCount ?? 0}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {customer.hasPendingOrders
                                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Active</span>
                                    : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Idle</span>
                                  }
                                </td>
                              </tr>

                              {/* Expanded Customer Orders */}
                              {isSelected && (
                                <tr>
                                  <td colSpan={5} className="bg-blue-50/60 px-4 py-4">
                                    {loadingCustomerOrders ? (
                                      <div className="flex items-center gap-2 text-sm text-gray-500"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />Loading orders...</div>
                                    ) : customerOrders.length === 0 ? (
                                      <p className="text-sm text-gray-400 italic">No orders found for this customer.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Orders for {customer.name}</p>
                                        {customerOrders.map(order => (
                                          <div key={order.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-blue-100 shadow-sm">
                                            <div>
                                              <p className="text-sm font-bold text-gray-800"># {order.orderNumber || order.id}</p>
                                              <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-sm font-bold text-gray-800">KES {(order.total || 0).toLocaleString()}</p>
                                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${['completed', 'delivered'].includes(order.status) ? 'bg-green-100 text-green-700' :
                                                ['cancelled', 'failed', 'returned'].includes(order.status) ? 'bg-red-100 text-red-700' :
                                                  'bg-amber-100 text-amber-700'
                                                }`}>{order.status?.replace(/_/g, ' ')}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return renderOverview();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading marketing data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FaExclamationTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden lg:h-screen bg-gray-100 relative min-h-screen">
      {/* Backdrop for mobile */}
      <div 
        className={`fixed inset-0 bg-black/50 z-[105] lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />


      {/* Sidebar - Desktop / Drawer - Mobile */}
      <div className={`fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-[110] transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-indigo-900 tracking-tight">Marketer Panel</h2>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">Promotion Console</p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-full text-gray-400"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto no-scrollbar lg:custom-scrollbar mt-2">
          <ul className="flex flex-col space-y-1 px-3 pb-4">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    if (tab.id === 'new-order') {
                      localStorage.setItem('marketing_mode', 'true');
                      window.location.href = '/';
                    } else {
                      setActiveTab(tab.id);
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2 lg:py-2.5 lg:px-4 rounded-xl transition-all duration-200 text-[9px] lg:text-[15px] font-bold uppercase tracking-tight ${
                    activeTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105 z-10'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-indigo-600 text-left'
                    }`}
                >
                  <span className="text-sm lg:text-base opacity-90">{tab.icon}</span>
                  <span>{tab.name}</span>
                </button>
              </li>
            ))}
            
            {/* Mobile-only Exit Button */}
            <li className="mt-4 pt-4 border-t border-gray-100 lg:hidden">
              <button
                onClick={() => {
                  localStorage.removeItem('marketing_mode');
                  window.location.href = '/';
                }}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50"
              >
                <span className="text-sm">🏠</span>
                <span>Exit Mode</span>
              </button>
            </li>
          </ul>

        </nav>

        <div className="p-4 border-t border-gray-200 bg-gray-50 lg:block hidden text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-black">
            Marketer Console v2.0
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-3 border-b border-gray-100 bg-white sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-3 -ml-3 hover:bg-gray-100 rounded-full text-indigo-600 transition-colors"
            >
              <FaBars size={24} />
            </button>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/marketing')}>
              <div className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></div>
              <h2 className="text-sm font-black text-gray-800 tracking-tight uppercase">Marketer Panel</h2>
            </div>
          </div>
          <div className="flex items-center gap-1">
          </div>
        </header>


        {/* Dynamic Content */}
        <main className="flex-1 lg:h-full lg:overflow-y-auto bg-gray-50 relative custom-scrollbar">
          <div className="max-w-7xl mx-auto w-full p-1 sm:p-4 min-h-full pb-[64px] lg:pb-0">
            {/* Page Header — desktop only */}
            <div className="hidden lg:flex flex-row items-center justify-between gap-4 mb-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Affiliate Console</h1>
                <p className="text-sm text-gray-500">Manage your marketing campaigns and commissions.</p>
              </div>
              <div className="flex items-center gap-3">
                {(user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'super_admin' || user?.roles?.some(r => ['admin', 'superadmin', 'super_admin'].includes(r))) && (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg hover:bg-black transition-all border border-gray-800"
                  >
                    <span>⬅️</span>
                    <span>Admin Dashboard</span>
                  </Link>
                )}
                <button
                  onClick={() => {
                    localStorage.removeItem('marketing_mode');
                    window.location.href = '/';
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-gray-50 transition-all border border-gray-200"
                >
                  <span>🏠</span>
                  <span>Exit Mode</span>
                </button>
              </div>
            </div>


            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 min-h-full p-4 lg:p-6">
              {renderTabContent()}
            </div>
          </div>
        </main>
      </div>



      {/* Modals remain same but use backdrop blur */}
      {showShareModal && sharingItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[150] p-4">
          {/* Modal content remains same as before */}
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col relative">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Share & Earn Commission</h3>
              <button onClick={() => setShowShareModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"><FaTimes size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Poster Preview */}
              <div className="bg-gray-100 rounded-[2.5rem] p-4 sm:p-10 flex justify-center overflow-x-auto">
                <div id="share-poster-content" className="bg-white w-[430px] p-0 rounded-[3rem] shadow-2xl border border-gray-100 flex flex-col items-stretch overflow-hidden flex-shrink-0">
                  <div className="relative w-full aspect-[4/3] bg-gray-50 overflow-hidden">
                    <img src={resolveImageUrl(sharingItem.images?.[0] || sharingItem.mainImage || sharingItem.coverImage)} alt={sharingItem.name} className="w-full h-full object-cover" crossOrigin="anonymous" />
                  </div>
                  <div className="p-8 pb-3 flex flex-col items-center bg-white">
                    <div className="w-full flex flex-col gap-2 mb-4">
                      <div className="flex items-start justify-between gap-6">
                        <h4 className="text-2xl font-black text-gray-900 leading-tight flex-1">{sharingItem.name || sharingItem.title}</h4>
                        <div className="px-5 py-2.5 bg-green-50 rounded-2xl border border-green-100 shadow-sm flex-shrink-0">
                          <span className="text-2xl font-black text-green-600 whitespace-nowrap">KES {sharingItem.discountPrice || sharingItem.displayPrice || sharingItem.basePrice}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full grid grid-cols-5 gap-4 mb-4 items-center bg-gray-50 p-5 rounded-[2.5rem] border border-gray-100">
                      <div className="col-span-2 flex flex-col items-center">
                        <div className="p-2.5 bg-white rounded-3xl shadow-xl border border-blue-50">
                          <QRCodeCanvas value={getDeepLink(sharingItem)} size={100} level="H" includeMargin={false} />
                        </div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1.5">Scan to Buy</p>
                      </div>
                      <div className="col-span-3 flex flex-col items-stretch pl-4 border-l border-gray-200">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Referral Code</p>
                        <div className="py-3 px-4 bg-blue-600 text-white rounded-2xl font-black text-2xl tracking-[0.05em] shadow-lg shadow-blue-200/50 flex items-center justify-center uppercase">
                          <span className="leading-tight">{user?.referralCode || 'PROMO'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full border-t border-gray-100 pt-5 flex flex-col items-center">
                      <p className="text-lg font-black text-blue-700 tracking-[0.05em] uppercase mb-0.5">WWW.COMRADES360.SHOP</p>
                      <div className="flex items-center gap-2.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><p className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Contact: {user?.phone || '0700 000 000'}</p></div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div className="space-y-4">
                <button onClick={sharePosterAndLink} disabled={isGeneratingPoster} className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-[1.5rem] font-black text-lg shadow-xl shadow-blue-200 hover:shadow-2xl transition-all disabled:opacity-50"> <FaShareAlt /> Share Image + Link </button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={downloadPoster} disabled={isGeneratingPoster} className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200"> <FaDownload /> Download </button>
                  <button 
                    onClick={() => handleCopyLink(getDeepLink(sharingItem))} 
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all border ${
                      copiedLink ? 'bg-green-600 text-white border-green-600' : 'bg-gray-100 text-gray-700 border-gray-100 hover:bg-gray-200'
                    }`}
                  > 
                    {copiedLink ? <><FaCheck /> Copied!</> : <><FaCopy /> Copy Link</>} 
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}} />
    </div>
  );
};

export default MarketerDashboard;