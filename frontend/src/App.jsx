import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { initPerformanceMonitoring } from './utils/performance';
import { CategoriesProvider } from './contexts/CategoriesContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { WishlistProvider } from './contexts/WishlistContext';
import { PlatformProvider, usePlatform } from './contexts/PlatformContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ProtectedRoute from './components/ProtectedRoute';
import ReferrerBanner from './components/ReferrerBanner';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import api from './services/api';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import RealtimeSync from './components/RealtimeSync';
import DashboardGuard from './components/DashboardGuard';
// import VerificationRequired from './components/VerificationRequired'; // Removed as per user request
import Home from './pages/Home';
const MaintenancePage = React.lazy(() => import('./pages/MaintenancePage'));

// Define a loading component
const PageLoading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <LoadingSpinner size="lg" />
  </div>
);

// Use Vite's glob import for lazy loading
const pages = import.meta.glob('./pages/**/*.jsx');
const components = import.meta.glob('./components/**/*.jsx');

// PageLayout MUST be imported eagerly – it is the outermost shell used on every
// render. Lazy-loading it puts it in a separate chunk that initializes before
// React's internal dispatcher is ready, causing "Cannot read properties of null
// (reading 'useEffect')" hook crashes.
import PageLayout from './components/layout/PageLayout';
const Navbar = lazy(() => import('./components/Navbar'));
const MarketingNavbar = lazy(() => import('./components/MarketingNavbar'));
import MarketingBottomNav from './components/MarketingBottomNav';
const Login = lazy(() => import('./pages/Login'));


const DashboardLogin = lazy(() => import('./pages/DashboardLogin'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const AuthModal = lazy(() => import('./components/auth/AuthModal'));
const Cart = lazy(() => import('./pages/Cart'));
const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const Search = lazy(() => import('./pages/Search'));
const Category = lazy(() => import('./pages/Category'));
const Services = lazy(() => import('./pages/Services'));
const ServiceDetails = lazy(() => import('./pages/ServiceDetails'));
const FastFood = lazy(() => import('./pages/FastFood'));
const FastFoodDetails = lazy(() => import('./pages/FastFoodDetails'));
const Products = lazy(() => import('./pages/Products'));
const ComradesMenu = lazy(() => import('./pages/ComradesMenu'));
const ServicesManagement = lazy(() => import('./pages/dashboard/ServicesManagement'));

// Public Footer Pages
const StaticContentPage = lazy(() => import('./pages/public/StaticContentPage'));
const AppContentManager = lazy(() => import('./pages/dashboard/settings/AppContentManager'));

// Marketing components
const MarketingDashboard = lazy(pages['./pages/marketing/MarketerDashboard.jsx']);
const MarketingOverview = lazy(pages['./pages/marketing/MarketingOverview.jsx']);
const MarketingPerformance = lazy(pages['./pages/marketing/MarketingPerformance.jsx']);
const ShareProducts = lazy(pages['./pages/marketing/ShareProducts.jsx']);
const SharedLinks = lazy(pages['./pages/marketing/SharedLinks.jsx']);
const Affiliates = lazy(pages['./pages/marketing/Affiliates.jsx']);
const Commissions = lazy(pages['./pages/marketing/Commissions.jsx']);
const MarketerWallet = lazy(pages['./pages/marketing/MarketerWallet.jsx']);
// Lazy load account related components
const Account = lazy(pages['./pages/Account.jsx']);
const AccountVerification = lazy(pages['./pages/AccountVerification.jsx']);
const AccountPage = lazy(pages['./pages/AccountPage.jsx']);
const AccountSettings = lazy(pages['./pages/account/AccountSettings.jsx']);
const Profile = lazy(pages['./pages/Profile.jsx']);
const ProfileSettings = lazy(pages['./pages/account/ProfileSettings.jsx']);
const Addresses = lazy(pages['./pages/account/Addresses.jsx']);
const EditAccount = lazy(pages['./pages/EditAccount.jsx']);
const NationalIdUpload = lazy(pages['./pages/NationalIdUpload.jsx']);
const RequestDeletion = lazy(pages['./pages/RequestDeletion.jsx']);
const Orders = lazy(pages['./pages/Orders.jsx']);
// Lazy load seller related components
const Seller = lazy(pages['./pages/Seller.jsx']);
const SellerOverview = lazy(pages['./pages/seller/SellerOverview.jsx']);
const SellerProducts = lazy(pages['./pages/seller/SellerProducts.jsx']);
const ProductForm = lazy(pages['./pages/seller/ProductForm.jsx']);
const SellerOrders = lazy(pages['./pages/seller/SellerOrders.jsx']);
const SellerEarnings = lazy(pages['./pages/seller/SellerEarnings.jsx']);
const SellerAnalytics = lazy(pages['./pages/seller/SellerAnalytics.jsx']);
const SellerWallet = lazy(pages['./pages/seller/SellerWallet.jsx']);
const SellerReports = lazy(pages['./pages/seller/SellerReports.jsx']);
const SellerHelp = lazy(pages['./pages/seller/SellerHelp.jsx']);
const SellerHeroPromotions = lazy(pages['./pages/seller/SellerHeroPromotions.jsx']);
const SellerFastFoodPromotions = lazy(pages['./pages/seller/SellerFastFoodPromotions.jsx']);
const SellerProductView = lazy(pages['./pages/seller/SellerProductView.jsx']);
const SellerFastFoodView = lazy(pages['./pages/seller/SellerFastFoodView.jsx']);
const RecycleBin = lazy(pages['./pages/seller/RecycleBin.jsx']);
// Lazy load admin related components
const AdminMarketing = lazy(pages['./pages/admin/AdminMarketing.jsx']);
const AdminHeroPromotions = lazy(pages['./pages/admin/AdminHeroPromotions.jsx']);
const AdminFastFoodPromotions = lazy(pages['./pages/admin/AdminFastFoodPromotions.jsx']);
const AdminCreateHeroPromotion = lazy(pages['./pages/admin/AdminCreateHeroPromotion.jsx']);
const RoleApplicationsManager = lazy(pages['./pages/UserManagementComponents/RoleApplicationsManager.jsx']);
const PendingApplications = lazy(pages['./pages/UserManagementComponents/PendingApplications.jsx']);
const AdminIdVerification = lazy(pages['./pages/admin/AdminIdVerification.jsx']);
const JobOpeningManagement = lazy(pages['./pages/admin/JobOpeningManagement.jsx']);
// Lazy load marketer dashboard
const ServiceProviderWallet = lazy(pages['./pages/dashboard/ServiceProviderWallet.jsx']);
// Other components
const RoleApplication = lazy(pages['./pages/RoleApplication.jsx']);
const ProductShare = lazy(pages['./pages/ProductShare.jsx']);
const DeliveryAgent = lazy(pages['./pages/DeliveryAgent.jsx']);
const OpsManager = lazy(() => import('./pages/OpsManager'));
const WorkWithUs = lazy(() => import('./pages/customer/WorkWithUs'));
const RoleApplicationForm = lazy(() => import('./pages/customer/RoleApplicationForm'));
const LogisticsManager = lazy(() => import('./pages/LogisticsManager'));
const FinanceManager = lazy(() => import('./pages/FinanceManager'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DeliveryFeeSettings = lazy(() => import('./pages/dashboard/DeliveryFeeSettings'));
const Overview = lazy(() => import('./pages/dashboard/Overview'));
const ProductManagement = lazy(() => import('./pages/dashboard/ProductManagement'));
const DashboardProducts = lazy(() => import('./pages/dashboard/Products'));
const StationManagerDashboard = lazy(() => import('./pages/station/StationManagerDashboard'));
const StationLogin = lazy(() => import('./pages/station/StationLogin'));
const ProductList = lazy(() => import('./pages/dashboard/products/ProductList'));
const ComradesProducts = lazy(() => import('./pages/dashboard/comrades/ComradesProducts'));
const ComradesProductList = lazy(() => import('./pages/dashboard/comrades/ComradesProductList'));
const ComradesProductForm = lazy(() => import('./pages/dashboard/comrades/ComradesProductForm'));
const ProductListingMode = lazy(() => import('./pages/dashboard/ProductListingMode'));
import ScrollToTop from './components/ScrollToTop';

const Customer = lazy(() => import('./pages/Customer'));
const CustomerOverview = lazy(() => import('./pages/customer/CustomerOverview'));
const CustomerOrders = lazy(() => import('./pages/customer/CustomerOrders'));
const MyInquiries = lazy(() => import('./pages/customer/MyInquiries'));
const SupportChat = lazy(() => import('./pages/customer/SupportChat'));
const CancelOrder = lazy(() => import('./pages/CancelOrder'));
const UpdateOrderAddress = lazy(() => import('./pages/UpdateOrderAddress'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const PublicTracking = lazy(() => import('./pages/PublicTracking'));
const CustomerWishlist = lazy(() => import('./pages/customer/CustomerWishlist'));
const CustomerAddresses = lazy(() => import('./pages/customer/CustomerAddresses'));
const CustomerNotifications = lazy(() => import('./pages/customer/CustomerNotifications'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const CustomerUpgrade = lazy(() => import('./pages/customer/CustomerUpgrade'));
const MyApplications = lazy(() => import('./pages/customer/MyApplications'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Wishlist = lazy(() => import('./pages/Wishlist'));

// New dashboard pages (converted to lazy loading)
const ReturnRequestPage = lazy(() => import('./pages/customer/ReturnRequestPage'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const UserApplications = lazy(() => import('./pages/dashboard/UserApplications'));
const UserManagementOverview = lazy(() => import('./pages/dashboard/UserManagementOverview'));
const MarketerManagement = lazy(() => import('./pages/dashboard/MarketerManagement'));
const CreateService = lazy(() => import('./pages/dashboard/services/CreateService'));
const MyServices = lazy(() => import('./pages/dashboard/services/MyServices'));
const DeliveryAssignment = lazy(() => import('./pages/dashboard/DeliveryAssignment'));
const DeliveryAgents = lazy(() => import('./pages/dashboard/DeliveryAgents'));
const CommissionManagement = lazy(() => import('./pages/dashboard/CommissionManagement'));
const ReferralAnalytics = lazy(() => import('./pages/dashboard/ReferralAnalytics'));
const InventoryManagement = lazy(() => import('./pages/dashboard/components/InventoryManagement'));
// removed HeroPromotionManager import
const EnhancedCategories = lazy(() => import('./pages/dashboard/EnhancedCategories'));
const SystemSettings = lazy(() => import('./pages/dashboard/SystemSettings'));
const SecuritySettings = lazy(() => import('./pages/dashboard/SecuritySettings'));
const AdvancedReports = lazy(() => import('./pages/dashboard/AdvancedReports'));
const AdminOrders = lazy(() => import('./pages/dashboard/AdminOrders'));
const AdminReturnsList = lazy(() => import('./pages/dashboard/AdminReturnsList'));
const SuperAdminOrders = lazy(() => import('./pages/dashboard/SuperAdminOrders'));
const OrderAnalytics = lazy(() => import('./pages/dashboard/OrderAnalytics'));
const AdminOverview = lazy(() => import('./pages/dashboard/AdminOverview'));
const SuspendProduct = lazy(() => import('./pages/dashboard/SuspendProduct'));
const AdminServicesApproval = lazy(() => import('./pages/dashboard/AdminServicesApproval'));
const ServiceReviews = lazy(() => import('./pages/dashboard/ServiceReviews'));
const SupportTickets = lazy(() => import('./pages/dashboard/SupportTickets'));
const CustomerService = lazy(() => import('./pages/dashboard/CustomerService'));
const FastFoodForm = lazy(() => import('./pages/dashboard/FastFoodForm'));
const FastFoodManagement = lazy(() => import('./pages/dashboard/FastFoodManagement'));
const HeroSettingsConfig = lazy(() => import('./pages/dashboard/HeroSettingsConfig'));
const SmartProductForm = lazy(() => import('./pages/dashboard/SmartProductForm'));
const TestDynamicForms = lazy(() => import('./pages/dashboard/TestDynamicForms'));
const DeliveryAgentDashboard = lazy(() => import('./pages/dashboard/DeliveryAgentDashboard'));
const DeliveryRequests = lazy(() => import('./pages/dashboard/DeliveryRequests'));
const ServiceProviderDashboard = lazy(() => import('./pages/dashboard/ServiceProviderDashboard'));
const OtherDashboards = lazy(() => import('./pages/dashboard/OtherDashboards'));
const SellerManagement = lazy(() => import('./pages/dashboard/SellerManagement'));
const ServiceProviderManagement = lazy(() => import('./pages/dashboard/ServiceProviderManagement'));
const CustomerManagement = lazy(() => import('./pages/dashboard/CustomerManagement'));
const WarehouseManagement = lazy(() => import('./pages/dashboard/WarehouseManagement'));
const PickupStationManagement = lazy(() => import('./pages/dashboard/PickupStationManagement'));
const SellerBusinessLocation = lazy(() => import('./pages/seller/SellerBusinessLocation'));
const ProductDeletionRequests = lazy(() => import('./pages/dashboard/ProductDeletionRequests'));
const SystemRevenue = lazy(() => import('./pages/dashboard/SystemRevenue'));
const PendingPayouts = lazy(() => import('./pages/dashboard/PendingPayouts'));
const AdminLiveMap = lazy(() => import('./pages/dashboard/AdminLiveMap'));
const DeliveryAuditing = lazy(() => import('./pages/dashboard/delivery/DeliveryAuditing'));
const BatchSystem = lazy(() => import('./pages/dashboard/BatchSystem'));
const CustomerReturnsList = lazy(() => import('./pages/customer/CustomerReturnsList'));
const FastFoodPickupPoints = lazy(() => import('./pages/dashboard/FastFoodPickupPoints'));
const ContactMessages = lazy(() => import('./pages/dashboard/ContactMessages'));

// Delivery Agent Sub-components
const DeliveryAgentOrders = lazy(() => import('./pages/dashboard/delivery/Orders'));
const DeliveryAgentAvailable = lazy(() => import('./pages/dashboard/delivery/Available'));
const DeliveryLogistics = lazy(() => import('./pages/dashboard/delivery/DeliveryLogistics'));
const DeliveryAgentAccount = lazy(() => import('./pages/dashboard/delivery/Account'));

const DeliveryNotifications = lazy(() => import('./pages/dashboard/delivery/Notifications'));
const DeliverySupport = lazy(() => import('./pages/dashboard/delivery/Support'));
const DeliverySettings = lazy(() => import('./pages/dashboard/delivery/Settings'));
const DeliveryLiveMap = lazy(() => import('./pages/dashboard/delivery/LiveMap'));
const DeliveryWallet = lazy(() => import('./pages/dashboard/delivery/Wallet'));

// Main App component with providers
const AppWithProviders = () => (
  <ErrorBoundary>
    <HelmetProvider>
      <PlatformProvider>
        <AuthProvider>
          <RealtimeSync />
          <CategoriesProvider>
            <CartProvider>
              <WishlistProvider>
                <Suspense fallback={<PageLoading />}>
                  <AppContent />
                </Suspense>
              </WishlistProvider>
            </CartProvider>
          </CategoriesProvider>
        </AuthProvider>
      </PlatformProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

// Main content component with auth context
const AppContent = () => {
  const { user, loading, verificationRequired } = useAuth();
  const location = useLocation();
  const isStationUser = user?.role === 'station_manager' || user?.roles?.includes('station_manager') || user?.roles?.includes('warehouse_manager') || user?.roles?.includes('pickup_station_manager');
  const hideNavbar = ['/login', '/register', '/forgot-password', '/menu', '/station/login'].includes(location.pathname);
  const [isMarketingMode, setIsMarketingMode] = useState(localStorage.getItem('marketing_mode') === 'true');
  const [referrerName, setReferrerName] = useState(localStorage.getItem('referrerName') || '');
  const [bannerDismissed, setBannerDismissed] = useState(localStorage.getItem('referrerBannerDismissed') === 'true');

  const { settings, loading: settingsLoading } = usePlatform();

  // On app load, fire one quick API call; if we get 503+maintenance redirect immediately
  useEffect(() => {
    // Never redirect away from admin, maintenance, or login paths
    const adminRoles = ['admin', 'super_admin', 'superadmin'];
    const adminPaths = ['/dashboard', '/dashboard-login', '/maintenance', '/login'];
    const isAdminPath = adminPaths.some(p => window.location.pathname.startsWith(p));
    
    if (isAdminPath) return;

    if (settings.maintenance?.enabled) {
      const isAdmin = adminRoles.includes(user?.role) || user?.roles?.some(r => adminRoles.includes(r));
      if (!isAdmin) {
        if (settings.maintenance?.message) sessionStorage.setItem('maintenance_message', settings.maintenance.message);
        window.location.href = '/maintenance';
      }
    }
  }, [settings.maintenance, user]);

  // Handle referral links and marketing mode from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    const marketingParam = params.get('marketing');

    if (marketingParam === 'true' || location.pathname.startsWith('/marketing')) {
      localStorage.setItem('marketing_mode', 'true');
      setIsMarketingMode(true);
    } else if (refCode && marketingParam !== 'true') {

      // If we have a referral code but NO marketing tag, ensure we are NOT in marketing mode
      localStorage.removeItem('marketing_mode');
      setIsMarketingMode(false);
    }

    if (refCode) {
      localStorage.setItem('referrerCode', refCode);
      // When a new referral link is used, reset the dismissal flag so the banner shows again
      localStorage.removeItem('referrerBannerDismissed');
      setBannerDismissed(false);

      // Fetch marketer name
      api.get(`/marketing/ref-details/${refCode}`)
        .then(res => {
          if (res.data.name) {
            localStorage.setItem('referrerName', res.data.name);
            setReferrerName(res.data.name);
          }
        })
        .catch(err => {
          console.error('Failed to fetch marketer details:', err);
        });
    }
  }, [location.search]);

  // Keep marketing mode in sync with localStorage after in-app transitions.
  useEffect(() => {
    const syncMarketingMode = () => {
      setIsMarketingMode(localStorage.getItem('marketing_mode') === 'true');
    };

    const onStorage = (event) => {
      if (!event || event.key === 'marketing_mode') {
        syncMarketingMode();
      }
    };

    syncMarketingMode();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [location.pathname, location.search]);

  const handleClearReferrer = () => {
    // Only dismiss the banner UI, do NOT remove the referrerCode
    // The referrerCode must persist for checkout as long as they entered via the link
    localStorage.setItem('referrerBannerDismissed', 'true');
    setBannerDismissed(true);
  };

  // Initialize performance monitoring after initial render
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      // Only initialize performance monitoring in production
      initPerformanceMonitoring();
    }
  }, []);

  if (loading) {
    return <PageLoading />;
  }

  // Station accounts are restricted to station-only flows by default, 
  // but must be allowed to access dashboard management routes for warehouses and pickup stations.
  const isDashboardStationPath = location.pathname.startsWith('/dashboard/delivery/warehouses') || 
                                 location.pathname.startsWith('/dashboard/delivery/pickup-stations');

  if (isStationUser && !location.pathname.startsWith('/station') && !isDashboardStationPath && !['/dashboard-login', '/login'].includes(location.pathname)) {
    return <Navigate to="/station" replace />;
  }

  // If verification is required, show verification component
  // BUT allow access to profile and support pages so users can fix the issue
  // Global verification redirect removed per user request (unverified users can access everything except Work With Us)

  const isDashboardRoute = location.pathname.startsWith('/dashboard') ||
    ['/marketing', '/seller', '/customer', '/ops', '/logistics', '/finance', '/station'].some(path => location.pathname.startsWith(path));

  const isDetailRoute = location.pathname.startsWith('/product/') || 
                       location.pathname.startsWith('/category/') ||
                       location.pathname.startsWith('/fastfood/') || 
                       location.pathname.startsWith('/service/');

  let topPadding = "pt-[128px]"; // Default for home/search (Navbar + Search bar)
  if (isDetailRoute) {
    topPadding = "pt-14"; // 56px to clear Navbar (no search bar)
  } else if (isDashboardRoute) {
    topPadding = "pt-14"; // 56px to clear Navbar (no search bar)
  }
  let paddingClass = hideNavbar ? "" : `${topPadding} lg:pt-16`;
  if (isMarketingMode) {
    paddingClass += " pb-14 lg:pb-0";
  }

  return (
    <PageLayout fluid={isDashboardRoute}>
      <ScrollToTop />
      <Routes>
        {/* Verification Required Interceptor */}


        {/* Maintenance Mode Route – no auth required */}
        <Route path="/maintenance" element={<MaintenancePage />} />

        {/* Public order tracking – no login required */}
        <Route path="/track" element={<PublicTracking />} />
        <Route path="/track/:trackingNumber" element={<PublicTracking />} />

        {/* Commissions Standalone Route */}
        <Route path="/commissions" element={
          (user?.roles?.includes('marketer') || user?.roles?.includes('admin') || user?.roles?.includes('superadmin') || user?.roles?.includes('super_admin')) ? (
            <div className="min-h-screen bg-gray-50">
              {!hideNavbar && <Navbar />}
              <main className={paddingClass}>
                <Commissions />
              </main>
            </div>
          ) : <Navigate to="/" />
        } />

        {/* Catch-all route for Main App layout */}
        <Route path="*" element={
          <div className="min-h-screen bg-gray-50">
            {!hideNavbar && (isMarketingMode ? <MarketingNavbar /> : <Navbar />)}
            {!hideNavbar && !isMarketingMode && referrerName && !bannerDismissed && (
              <div className={paddingClass}>
                <ReferrerBanner referrerName={referrerName} onClear={handleClearReferrer} />
              </div>
            )}
            <main className={!isMarketingMode && referrerName ? "" : paddingClass}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/category/:id" element={<Category />} />
                <Route path="/product/:id" element={<ProductDetails />} />
                <Route path="/search" element={<Search />} />
                <Route path="/services" element={<Services />} />
                <Route path="/service/:id" element={<ServiceDetails />} />
                <Route path="/fastfood" element={<FastFood />} />
                <Route path="/fastfood/:id" element={<FastFoodDetails />} />
                <Route path="/menu" element={<ComradesMenu />} />
                <Route path="/products" element={<Products />} />

                {/* Public Footer Pages */}
                <Route path="/about" element={<StaticContentPage pageKey="content_page_about" title="About Us" />} />
                <Route path="/contact" element={<StaticContentPage pageKey="content_page_contact" title="Contact Us" />} />
                <Route path="/terms" element={<StaticContentPage pageKey="content_page_terms" title="Terms of Service" />} />
                <Route path="/privacy" element={<StaticContentPage pageKey="content_page_privacy" title="Privacy Policy" />} />
                <Route path="/help" element={<StaticContentPage pageKey="content_page_help" title="Help Center" />} />
                <Route path="/faq" element={<StaticContentPage pageKey="content_page_faq" title="Frequently Asked Questions" />} />
                <Route path="/shipping" element={<StaticContentPage pageKey="content_page_shipping" title="Shipping & Returns" />} />
                <Route path="/payments" element={<StaticContentPage pageKey="content_page_payments" title="Payment Options" />} />
                <Route path="/size-guide" element={<StaticContentPage pageKey="content_page_size_guide" title="Size Guide" />} />

                {/* Authentication Routes */}
                {/* Authentication Routes - Now handled via Modals over Home */}
                <Route path="/login" element={!user ? <><Home /><AuthModal /></> : <Navigate to="/" />} />
                <Route path="/account" element={!user ? <Navigate to="/login" replace /> : <Navigate to="/customer" />} />
                <Route path="/register" element={!user ? <><Home /><AuthModal /></> : <Navigate to="/" />} />
                <Route path="/forgot-password" element={<><Home /><AuthModal /></>} />
                <Route path="/station/login" element={<StationLogin />} />

                {/* Cart & Checkout */}
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/dashboard-login" element={<DashboardLogin />} />

                {/* Protected Dashboard Route */}
                <Route path="/dashboard/*" element={
                  <ProtectedRoute requiredRole={['admin', 'super_admin', 'superadmin', 'logistics_manager', 'delivery_agent', 'finance_manager', 'warehouse_manager', 'pickup_station_manager']}>
                    <DashboardGuard>
                      <Dashboard />
                    </DashboardGuard>
                  </ProtectedRoute>
                }>
                  <Route index element={<AdminOverview />} />
                  <Route path="analytics" element={<AdvancedReports />} />
                  <Route path="users" element={<UserManagementOverview />} />
                  <Route path="users/role-applications" element={<RoleApplicationsManager />} />
                  <Route path="users/role-applications/:tab" element={<RoleApplicationsManager />} />
                  <Route path="users/marketers" element={<MarketerManagement />} />
                  <Route path="users/delivery-agents" element={<DeliveryAgents />} />
                  <Route path="users/sellers" element={<SellerManagement />} />
                  <Route path="users/service-providers" element={<ServiceProviderManagement />} />
                  <Route path="users/customers" element={<CustomerManagement />} />
                  <Route path="users/verifications" element={<AdminIdVerification />} />
                  <Route path="users/job-openings" element={<JobOpeningManagement />} />

                  {/* Comprehensive User Management */}
                  <Route path="user-management" element={<UserManagement />} />
                  <Route path="user-management/:action" element={<UserManagement />} />
                  <Route path="product-management" element={<ProductManagement />} />
                  <Route path="products/recycle-bin" element={<RecycleBin />} />
                  <Route path="products" element={<DashboardProducts />} />
                  <Route path="products/:view" element={<DashboardProducts />} />
                  <Route path="products/:view/:id" element={<DashboardProducts />} />
                  <Route path="products/comrades" element={<ComradesProducts />} />
                  <Route path="products/comrades/new" element={<ComradesProductForm />} />
                  <Route path="products/comrades/pending" element={<ComradesProducts status="pending" />} />
                  <Route path="products/comrades/rejected" element={<ComradesProducts status="rejected" />} />
                  <Route path="products/comrades/:id/edit" element={<ComradesProductForm mode="edit" />} />
                  <Route path="products/comrades/list/:id" element={<ComradesProductList />} />

                  <Route path="comrades-products" element={<Navigate to="products/comrades" replace />} />

                  <Route path="categories" element={<EnhancedCategories />} />

                  <Route path="services" element={<ServicesManagement />} />
                  <Route path="services/create" element={<CreateService />} />
                  <Route path="services/my" element={<MyServices />} />
                  <Route path="services/reviews" element={<ServiceReviews />} />
                  <Route path="services/:id" element={<ServiceDetails />} />
                  <Route path="services-approval" element={<AdminServicesApproval />} />

                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="orders/returns" element={<AdminReturnsList />} />
                  <Route path="orders/my-sales" element={<SuperAdminOrders />} />
                  <Route path="orders/assignments" element={<DeliveryAssignment />} />
                  <Route path="orders/requests" element={<DeliveryRequests />} />
                  <Route path="orders/agents" element={<DeliveryAgents />} />
                  <Route path="orders/analytics" element={<OrderAnalytics />} />
                  <Route path="fastfood" element={<FastFoodManagement />} />
                  <Route path="fastfood/hero-settings" element={<HeroSettingsConfig />} />
                  <Route path="fastfood/batch-system" element={<BatchSystem />} />
                  <Route path="fastfood/new" element={<FastFoodForm />} />
                  <Route path="fastfood/edit/:id" element={<FastFoodForm mode="edit" />} />
                  <Route path="fastfood/pickup-points" element={<FastFoodPickupPoints />} />
                  <Route path="fastfood/edit/:id" element={<FastFoodForm mode="edit" />} />
                  <Route path="delivery/warehouses" element={<WarehouseManagement />} />
                  <Route path="delivery/pickup-stations" element={<PickupStationManagement />} />
                  <Route path="delivery/settings" element={<DeliveryFeeSettings />} />
                  <Route path="delivery/metrics" element={<AdvancedReports />} />
                  <Route path="finance/dashboard" element={<FinanceManager />} />
                  <Route path="finance/commissions" element={<CommissionManagement />} />
                  <Route path="finance/referrals" element={<ReferralAnalytics />} />
                  <Route path="finance/reports" element={<AdvancedReports />} />
                  <Route path="finance/revenue" element={<SystemRevenue />} />
                  <Route path="finance/payouts" element={<PendingPayouts />} />
                  <Route path="marketing/hero-promotions" element={<AdminHeroPromotions />} />
                  <Route path="marketing/hero-promotions/create" element={<AdminCreateHeroPromotion />} />
                  <Route path="marketing/fastfood-promotions" element={<AdminFastFoodPromotions />} />
                  <Route path="settings/platform" element={<SystemSettings />} />
                  <Route path="settings/app-content" element={<AppContentManager />} />
                  <Route path="settings/security" element={<SecuritySettings />} />
                  <Route path="products/deletion-requests" element={<ProductDeletionRequests />} />
                  <Route path="support" element={<SupportTickets />} />
                  <Route path="contact-messages" element={<ContactMessages />} />
                  <Route path="support/service" element={<CustomerService />} />
                  <Route path="delivery/live-map" element={<AdminLiveMap />} />
                  <Route path="delivery/auditing" element={<DeliveryAuditing />} />
                  <Route path="other-dashboards" element={<OtherDashboards />} />
                  {/* Logistics Manager entry point */}
                  <Route path="logistics" element={<Navigate to="/dashboard/orders" replace />} />
                </Route>

                {/* Marketing Dashboard */}
                <Route path="/marketing/*" element={
                  <ProtectedRoute requiredRole={['marketer', 'admin', 'superadmin', 'super_admin']}>
                    <DashboardGuard>
                      <MarketingDashboard />
                    </DashboardGuard>
                  </ProtectedRoute>
                }>
                  <Route index element={<MarketingOverview />} />
                  <Route path="performance" element={<MarketingPerformance />} />
                  <Route path="share" element={<ShareProducts />} />
                  <Route path="links" element={<SharedLinks />} />
                  <Route path="affiliates" element={<Affiliates />} />
                  <Route path="commissions" element={<Commissions />} />
                  <Route path="wallet" element={<MarketerWallet />} />
                </Route>

                {/* Seller Dashboard */}
                <Route path="/seller/*" element={
                  <ProtectedRoute requiredRole={['seller', 'admin', 'superadmin', 'super_admin']}>
                    <DashboardGuard>
                      <Seller />
                    </DashboardGuard>
                  </ProtectedRoute>
                }>
                  <Route index element={<SellerOverview />} />
                  <Route path="products" element={<SellerProducts />} />
                  <Route path="products/add" element={<ProductForm />} />
                  <Route path="products/:id/edit" element={<ProductForm mode="edit" />} />
                  <Route path="products/view/:id" element={<SellerProductView />} />
                  <Route path="orders" element={<SellerOrders />} />
                  <Route path="earnings" element={<SellerEarnings />} />
                  <Route path="analytics" element={<SellerAnalytics />} />
                  <Route path="wallet" element={<SellerWallet />} />
                  <Route path="reports" element={<SellerReports />} />
                  <Route path="recycle-bin" element={<RecycleBin />} />
                  <Route path="promotions" element={<SellerHeroPromotions />} />
                  <Route path="fastfood-promotions" element={<SellerFastFoodPromotions />} />
                  <Route path="business-location" element={<SellerBusinessLocation />} />
                  <Route path="inventory" element={<InventoryManagement onBack={() => window.history.back()} />} />
                  <Route path="help" element={<SellerHelp />} />

                  {/* Fast Food Management Routes for Sellers */}
                  <Route path="fast-food" element={<FastFoodManagement />} />
                  <Route path="fast-food/hero-settings" element={<HeroSettingsConfig />} />
                  <Route path="fast-food/new" element={<FastFoodForm isSellerContext={true} />} />
                  <Route path="fast-food/edit/:id" element={<FastFoodForm mode="edit" isSellerContext={true} />} />
                  <Route path="fast-food/view/:id" element={<SellerFastFoodView />} />
                </Route>

                {/* Operations Dashboard */}
                <Route path="/ops/*" element={
                  <ProtectedRoute requiredRole={['ops_manager', 'admin', 'superadmin', 'super_admin']}>
                    <DashboardGuard>
                      <OpsManager />
                    </DashboardGuard>
                  </ProtectedRoute>
                } />

                {/* Logistics Manager Dashboard - now redirects into /dashboard */}
                <Route path="/logistics/*" element={
                  <ProtectedRoute requiredRole={['logistics_manager', 'admin', 'superadmin', 'super_admin']}>
                    <Navigate to="/dashboard/orders" replace />
                  </ProtectedRoute>
                } />

                {/* Finance Manager Dashboard */}
                <Route path="/finance/*" element={
                  <ProtectedRoute requiredRole={['finance_manager', 'admin', 'superadmin', 'super_admin']}>
                    <DashboardGuard>
                      <FinanceManager />
                    </DashboardGuard>
                  </ProtectedRoute>
                } />

                {/* Station Manager Dashboard */}
                <Route path="/station" element={
                  <ProtectedRoute requiredRole={['station_manager', 'warehouse_manager', 'pickup_station_manager']}>
                    <StationManagerDashboard />
                  </ProtectedRoute>
                } />

                {/* Customer Routes */}
                <Route path="/customer/*" element={<Customer />}>
                  <Route index element={<CustomerOverview />} />
                  <Route path="inquiries" element={<MyInquiries />} />
                  <Route path="support" element={<SupportChat />} />
                  <Route path="orders" element={<CustomerOrders />} />
                  <Route path="orders/:orderId/track" element={<OrderTracking />} />
                  <Route path="orders/:orderId/cancel" element={<CancelOrder />} />
                  <Route path="orders/:orderId/update-address" element={<UpdateOrderAddress />} />
                  <Route path="orders/:orderId/return" element={<ReturnRequestPage />} />
                  <Route path="returns" element={<CustomerReturnsList />} />
                  <Route path="wishlist" element={<Wishlist />} />
                  <Route path="wallet" element={<div>Wallet</div>} />
                  <Route path="address" element={<CustomerAddresses />} />
                  <Route path="settings" element={<AccountSettings />} />
                  <Route path="account-page" element={<AccountPage />} />
                  <Route path="account-verification" element={<AccountVerification />} />
                  <Route path="id-upload" element={<NationalIdUpload />} />
                  <Route path="applications" element={<MyApplications />} />
                  <Route path="work-with-us" element={<WorkWithUs />} />
                  <Route path="apply/:role" element={<RoleApplicationForm />} />
                </Route>

                {/* Redirects for legacy /work-with-us and /apply/:role links */}
                <Route path="/work-with-us" element={<Navigate to="/customer/work-with-us" replace />} />
                <Route path="/apply/:role" element={<Navigate to="/customer/work-with-us" replace />} />


                {/* Delivery Agent Dashboard */}
                <Route path="/delivery/*" element={
                  <ProtectedRoute requiredRole={['delivery_agent', 'admin', 'superadmin', 'super_admin']}>
                    <DashboardGuard>
                      <DeliveryAgentDashboard />
                    </DashboardGuard>
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="available" replace />} />
                  <Route path="orders" element={<DeliveryAgentOrders />} />
                  <Route path="available" element={<DeliveryAgentAvailable />} />
                  <Route path="logistics" element={<DeliveryLogistics />} />
                  <Route path="completed" element={<Navigate to="../logistics" replace />} />
                  <Route path="history" element={<Navigate to="../logistics" replace />} />
                  <Route path="earnings" element={<Navigate to="../logistics" replace />} />
                  <Route path="account" element={<DeliveryAgentAccount />} />

                  <Route path="wallet" element={<DeliveryWallet />} />
                  <Route path="notifications" element={<DeliveryNotifications />} />
                  <Route path="support" element={<DeliverySupport />} />
                  <Route path="settings" element={<DeliverySettings />} />
                  <Route path="map" element={<DeliveryLiveMap />} />
                </Route>

                {/* Service Provider Dashboard - Standalone route outside main dashboard */}
                <Route
                  path="/dashboard/service-provider/*"
                  element={
                    <ProtectedRoute requiredRole={['service_provider', 'admin', 'superadmin', 'super_admin']}>
                      <DashboardGuard>
                        <div className="min-h-screen bg-gray-50">
                          {!hideNavbar && <Navbar />}
                          <main className="pt-16">
                            <ServiceProviderDashboard />
                          </main>
                        </div>
                      </DashboardGuard>
                    </ProtectedRoute>
                  }
                >
                  <Route path="create-service" element={<CreateService />} />
                  <Route path="my-services" element={<MyServices />} />
                  <Route path="booking-list" element={<div>Booking List Page</div>} />
                  <Route path="messages" element={<div>Messages Page</div>} />
                  <Route path="reviews" element={<div>Reviews Page</div>} />
                  <Route path="revenue" element={<div>Revenue Page</div>} />
                  <Route path="wallet" element={<ServiceProviderWallet />} />
                </Route>
              </Routes>
            </main>
          </div>
        } />
      </Routes>
      
      {/* Force Password Change Modal */}
      {user?.mustChangePassword && (
        <ForcePasswordChangeModal isOpen={true} user={user} />
      )}

        {/* Global Marketing Mode Bottom Nav (Mobile Only inside component) */}
        {isMarketingMode && <MarketingBottomNav />}
        
        {/* Global Toast Notifications */}
        <ToastContainer 
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </PageLayout>

  );
};

export default AppWithProviders;
