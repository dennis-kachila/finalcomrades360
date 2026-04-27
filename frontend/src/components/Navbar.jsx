import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FaBell, FaShoppingCart, FaUser, FaSignOutAlt, FaCog, FaStore, FaBullhorn, FaTimes, FaChevronRight, FaTruck, FaDollarSign, FaTools, FaCogs, FaHeart, FaSearch } from "react-icons/fa";
import { useCart } from "../contexts/CartContext";
import { useCategories } from "../contexts/CategoriesContext";
import { useAuth } from "../contexts/AuthContext";
import { usePlatform } from "../contexts/PlatformContext";
import api from '../services/api';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { settings: platformSettings } = usePlatform();
  const isLoggedIn = !!user;
  const isStationUser = user?.role === 'station_manager' || user?.roles?.includes('station_manager') || user?.roles?.includes('warehouse_manager') || user?.roles?.includes('pickup_station_manager');
  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
  const userName = user?.name;
  const firstName = userName?.split(' ')[0] || 'User';

  const [showCategories, setShowCategories] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileMenuType, setMobileMenuType] = useState('navigation'); // 'navigation' or 'account'
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isDashboardsOpen, setIsDashboardsOpen] = useState(false);
  const [activeMobileCategory, setActiveMobileCategory] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const { cart } = useCart();
  const [searchQuery, setSearchQuery] = useState("");
  const [isMarketingMode, setIsMarketingMode] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const cartScope = location.pathname.startsWith('/fastfood') ? 'fastfood' : 'products';
  const cartLink = `/cart?scope=${cartScope}`;
  // Badge always reflects the scope of the current page (products on home, fastfood on /fastfood)
  const cartBadgeCount = useMemo(() => {
    const items = Array.isArray(cart?.items) ? cart.items : [];
    return items.filter((item) => (cartScope === 'fastfood' ? item.itemType === 'fastfood' : item.itemType !== 'fastfood')).length;
  }, [cart?.items, cartScope]);

  // Determine search context based on current page
  const getSearchContext = () => {
    if (location.pathname.startsWith('/products')) return { path: '/products', queryParam: 'search', placeholder: 'Search products...' };
    if (location.pathname.startsWith('/fastfood')) return { path: '/fastfood', queryParam: 'search', placeholder: 'Search food & drinks...' };
    if (location.pathname.startsWith('/services')) return { path: '/services', queryParam: 'search', placeholder: 'Search services...' };
    return { path: '/search', queryParam: 'q', placeholder: 'Search marketplace...' };
  };

  const { path: searchPath, queryParam: searchQueryParam, placeholder: searchPlaceholder } = getSearchContext();

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`${searchPath}?${searchQueryParam}=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery(''); // Clear bar after navigating so it resets cleanly
    }
  };
  const { categories, getCategoriesWithSubcategories } = useCategories();
  const categoriesWithSubcategories = getCategoriesWithSubcategories();

  const categoriesRef = useRef(null);
  const userDropdownRef = useRef(null);
  const notificationsRef = useRef(null);
  const mobileMenuRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoriesRef.current && !categoriesRef.current.contains(event.target)) {
        setShowCategories(false);
        setActiveCategory(null);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target) && !event.target.closest('.hamburger-btn') && !event.target.closest('.user-mobile-btn')) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  // Reset subcategory selection when main dropdown closes
  useEffect(() => {
    if (!showCategories) setActiveCategory(null);
  }, [showCategories]);

  // Mark notification as read
  const markAsRead = (id) => {
    setNotifications(
      notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  
  // Maintenance Visibility Logic (now using global context)
  const maintenance = platformSettings.maintenance;
  const siteName = platformSettings.platform?.siteName || 'Comrades360';

  const isAdmin = (userRoles.includes('admin') || userRoles.includes('super_admin') || userRoles.includes('superadmin'));
  
  const isSectionVisible = (sectionKey) => {
    if (isAdmin) return true;
    const settings = maintenance.sections?.[sectionKey];
    return !settings?.enabled;
  };

  const isDashboardVisible = (dashboardKey) => {
    if (isAdmin) return true;
    const settings = maintenance.dashboards?.[dashboardKey];
    return !settings?.enabled;
  };

  const dashboardLinks = [
    (isDashboardVisible('admin') && (userRoles.includes('admin') || userRoles.includes('super_admin') || userRoles.includes('superadmin'))) ? { to: '/dashboard', label: 'Admin Dashboard', icon: '🔒' } : null,
    (isDashboardVisible('ops') && userRoles.includes('ops_manager')) ? { to: '/ops', label: 'Operations Dashboard', icon: '⚙️' } : null,
    (isDashboardVisible('logistics') && userRoles.includes('logistics_manager')) ? { to: '/logistics', label: 'Logistics Dashboard', icon: '🚚' } : null,
    (isDashboardVisible('finance') && userRoles.includes('finance_manager')) ? { to: '/finance', label: 'Finance Dashboard', icon: '💰' } : null,
    (isDashboardVisible('seller') && userRoles.includes('seller')) ? { to: '/seller', label: 'Seller Panel', icon: '🏪' } : null,
    (isDashboardVisible('marketer') && userRoles.includes('marketer')) ? { to: '/marketing', label: 'Marketer Hub', icon: '📢' } : null,
    (isDashboardVisible('delivery') && userRoles.includes('delivery_agent')) ? { to: '/delivery', label: 'Delivery App', icon: '🛵' } : null,
    (isDashboardVisible('provider') && userRoles.includes('service_provider')) ? { to: '/dashboard/service-provider', label: 'Provider Portal', icon: '🛠️' } : null,
    (isDashboardVisible('station') && (userRoles.includes('station_manager') || userRoles.includes('warehouse_manager') || userRoles.includes('pickup_station_manager'))) ? { to: '/station', label: 'Station Ops', icon: '📦' } : null,
  ].filter(Boolean);

  // Define role-specific sub-links for the mobile menu
  const sellerSubLinks = [
    { to: "/seller", label: "Overview" },
    { to: "/seller/products/add", label: "Add Product" },
    { to: "/seller/fast-food/new", label: "Add Meals" },
    { to: "/seller/products", label: "My Products" },
    { to: "/seller/orders", label: "Seller Orders" },
    { to: "/seller/wallet", label: "Earnings" },
  ];

  const marketerSubLinks = [
    { id: 'overview', to: "/marketing?tab=overview", label: "Overview" },
    { id: 'products', to: "/marketing?tab=products", label: "Browse Items" },
    { id: 'new-order', to: "/marketing?tab=new-order", label: "Create Order" },
    { id: 'orders', to: "/marketing?tab=orders", label: "Marketing Orders" },
    { id: 'wallet', to: "/marketing?tab=wallet", label: "Hub Wallet" },
  ];

  const providerSubLinks = [
    { to: "/dashboard/services/create", label: "Create Service" },
    { to: "/dashboard/services/my", label: "My Services" },
    { to: "/dashboard/service-provider/booking-list", label: "Bookings" },
    { to: "/dashboard/service-provider/wallet", label: "Provider Wallet" },
  ];

  const [activeSubMenu, setActiveSubMenu] = useState(null); // 'seller', 'marketer', 'provider', etc.
  

  useEffect(() => {
    const loadNotifications = async () => {
      if (!isLoggedIn) return;
      try {
        const res = await api.get('/notifications/my');
        const mapped = (res.data || []).map((n) => ({
          id: n.id,
          message: n.message,
          read: !!n.read,
          date: n.createdAt || new Date().toISOString()
        }));
        setNotifications(mapped);
      } catch (e) {
        console.warn('Navbar notifications load failed:', e.message);
      }
    };

    loadNotifications();

    const onRealtimeUpdate = (event) => {
      const eventName = event?.detail?.eventName;
      const scope = event?.detail?.payload?.scope;
      if (eventName === 'notification' || eventName === 'notification:new' || scope === 'notifications') {
        loadNotifications();
      }
    };

    window.addEventListener('realtime:data-updated', onRealtimeUpdate);
    return () => window.removeEventListener('realtime:data-updated', onRealtimeUpdate);
  }, [isLoggedIn]);

  // Keep marketing mode flag in sync without polling.
  useEffect(() => {
    const checkMarketingMode = () => {
      setIsMarketingMode(localStorage.getItem('marketing_mode') === 'true');
    };

    const onStorage = (event) => {
      if (!event || event.key === 'marketing_mode') {
        checkMarketingMode();
      }
    };

    checkMarketingMode();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [location.pathname]);

  const isDashboardRoute = location.pathname.startsWith('/dashboard') ||
    ['/marketing', '/seller', '/customer', '/ops', '/logistics', '/finance', '/station'].some(path => location.pathname.startsWith(path));

  const isDetailRoute = location.pathname.startsWith('/product/') || 
                       location.pathname.startsWith('/category/') ||
                       location.pathname.startsWith('/fastfood/') || 
                       location.pathname.startsWith('/service/');

  const exitMarketingMode = () => {
    localStorage.removeItem('marketing_mode');
    setIsMarketingMode(false);
    window.location.href = '/';
  };

  return (
    <>
      {/* Marketing Mode Exit Button - Floating on Mobile */}
      {isMarketingMode && (
        <div className="fixed bottom-20 right-4 z-[9999] lg:hidden">
          <button
            onClick={exitMarketingMode}
            className="flex items-center gap-2 px-5 py-4 bg-red-600 text-white rounded-full shadow-2xl hover:bg-red-700 font-black text-base animate-bounce border-4 border-white"
          >
            <FaTimes size={20} />
            <span>EXIT</span>
          </button>
        </div>
      )}

      <nav className="bg-white border-b shadow-sm fixed top-0 left-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-0 md:px-4">

          {/* DESKTOP NAVIGATION (>= lg) - Exact original appearance restored */}
          <div className="hidden lg:flex justify-between items-center h-16">
            {/* Left side: Logo + Categories */}
            <div className="flex items-center space-x-6">
              <div className="text-2xl font-bold">
                <Link to={isStationUser ? "/station" : "/"} className="text-blue-600 hover:text-blue-800 cursor-pointer">{siteName}</Link>
              </div>

              {!isStationUser && (
              <div className="relative" ref={categoriesRef}>
                <button
                  onClick={() => setShowCategories(!showCategories)}
                  className="px-3 py-2 hover:bg-gray-100 rounded flex items-center"
                >
                  <span>Category</span>
                  <span className="ml-1">▾</span>
                </button>

                {showCategories && (
                  <div className="absolute left-0 mt-2 bg-white border rounded shadow-md z-50">
                    <ul className="w-64 py-1">
                      {categoriesWithSubcategories
                        .filter(cat => {
                          if (cat.name === 'Food & Drinks') return isSectionVisible('fastfood');
                          if (cat.name === 'Student Services') return isSectionVisible('services');
                          return isSectionVisible('products');
                        })
                        .map((cat, i) => {
                          const hasSub = cat.subcategories?.length > 0;
                        return (
                          <li key={cat.id} className="relative">
                            <div
                              className={`px-4 py-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-colors ${activeCategory === i ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                              onClick={(e) => {
                                if (hasSub) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setActiveCategory(activeCategory === i ? null : i);
                                } else {
                                  navigate(`/?categoryId=${cat.id}`);
                                  setShowCategories(false);
                                }
                              }}
                            >
                              <div className="flex items-center">
                                {cat.emoji && <span className="mr-3 text-xl">{cat.emoji}</span>}
                                <span>{cat.name}</span>
                              </div>
                              {hasSub && (
                                <svg
                                  className={`h-4 w-4 transition-transform duration-200 ${activeCategory === i ? 'rotate-0' : '-rotate-90'}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              )}
                            </div>

                            {activeCategory === i && hasSub && (
                              <div className="bg-gray-50 border-y border-gray-100 py-1 overflow-hidden transition-all duration-300">
                                 {/* Removed View All Category link */}
                                {cat.subcategories.map((sub) => (
                                  <Link
                                    key={sub.id}
                                    to={cat.name === 'Student Services' ? `/services?subcategoryId=${sub.id}` : cat.name === 'Food & Drinks' ? `/fastfood?subcategoryId=${sub.id}` : `/products?categoryId=${cat.id}&subcategoryId=${sub.id}`}
                                    className="flex items-center px-8 py-2 text-sm text-gray-600 hover:bg-white hover:text-blue-600 transition-colors"
                                    onClick={() => setShowCategories(false)}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-3"></span>
                                    {sub.name}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Center: Search */}
            {!isStationUser ? (
            <div className="flex-1 flex justify-center px-4">
              <div className="flex w-full max-w-xl">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full px-4 py-2 border rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-blue-600 text-white rounded-r hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Search
                </button>
              </div>
            </div>
            ) : (
            <div className="flex-1 flex justify-center px-4">
              <div className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                Station account mode
              </div>
            </div>
            )}

            {/* Right side: Icons and User */}
            <div className="flex items-center space-x-6">
              {/* Notifications */}
              {isLoggedIn && (
                <div className="relative" ref={notificationsRef}>
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative flex items-center space-x-1 p-2 text-gray-600 hover:text-blue-600"
                  >
                    <FaBell className="text-xl" />
                    <span className="relative">
                      <span className="text-sm font-medium">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="absolute -top-2 -right-4 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </span>
                  </button>

                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                      <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
                        <Link to="/notifications" className="text-xs text-blue-600 hover:underline" onClick={() => setShowNotifications(false)}>View all</Link>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map((n) => (
                            <div key={n.id} className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!n.read ? 'bg-blue-50' : ''}`} onClick={() => markAsRead(n.id)}>
                              <p className="text-sm text-gray-800">{n.message}</p>
                              <p className="text-xs text-gray-500 mt-1">{new Date(n.date).toLocaleString()}</p>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-center text-sm text-gray-500">No new notifications</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Marketing Mode Exit - Desktop */}
              {isMarketingMode && (
                <button
                  onClick={exitMarketingMode}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-semibold text-sm shadow-md"
                >
                  <FaTimes size={14} />
                  <span>Exit Marketing</span>
                </button>
              )}

              {/* Cart */}
              {!isStationUser && (
              <Link to={cartLink} className="relative flex items-center space-x-1 p-2 text-gray-600 hover:text-blue-600">
                <FaShoppingCart className="text-xl" />
                <span className="relative">
                  <span className="text-sm font-medium">Cart</span>
                  {cartBadgeCount > 0 && (
                    <span className="absolute -top-2 -right-4 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {cartBadgeCount > 9 ? '9+' : cartBadgeCount}
                    </span>
                  )}
                </span>
              </Link>
              )}

              {/* User Dropdown */}
              <div className="relative" ref={userDropdownRef}>
                {isLoggedIn ? (
                  <>
                    <button
                      onClick={() => setShowUserDropdown(!showUserDropdown)}
                      className="flex items-center space-x-2 hover:text-blue-600 focus:outline-none"
                    >
                      <span className="text-sm font-medium">Hi, {firstName}</span>
                      <span className="text-[10px]">▼</span>
                    </button>

                    {showUserDropdown && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                        <div className="px-4 py-2 border-b border-gray-100">
                          <p className="text-sm font-medium text-gray-900 truncate">{userName || 'User'}</p>
                          <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
                        </div>

                        <div className="space-y-1 py-1">
                          {isStationUser ? (
                            <Link to="/station" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaStore className="mr-3 text-gray-400" /> Station Dashboard
                            </Link>
                          ) : (
                            <>
                              <Link to="/customer" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                                <FaUser className="mr-3 text-gray-400" /> My Account
                              </Link>
                              <Link to="/customer/orders" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                                <FaShoppingCart className="mr-3 text-gray-400" /> My Orders
                              </Link>
                            </>
                          )}

                          {/* Dynamic Role Dashboards */}
                          {user?.roles?.includes('admin') || user?.roles?.includes('super_admin') || user?.roles?.includes('superadmin') ? (
                            <Link to="/dashboard" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaCog className="mr-3 text-gray-400" /> Admin Dashboard
                            </Link>
                          ) : null}

                          {user?.roles?.includes('ops_manager') && (
                            <Link to="/ops" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaCogs className="mr-3 text-gray-400" /> Operations Dashboard
                            </Link>
                          )}

                          {user?.roles?.includes('logistics_manager') && (
                            <Link to="/logistics" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaTruck className="mr-3 text-gray-400" /> Logistics Dashboard
                            </Link>
                          )}

                          {user?.roles?.includes('finance_manager') && (
                            <Link to="/finance" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaDollarSign className="mr-3 text-gray-400" /> Finance Dashboard
                            </Link>
                          )}

                          {user?.roles?.includes('seller') && (
                            <Link to="/seller" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaStore className="mr-3 text-gray-400" /> Seller Dashboard
                            </Link>
                          )}

                          {user?.roles?.includes('marketer') && (
                            <Link to="/marketing" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaBullhorn className="mr-3 text-gray-400" /> Marketer Dashboard
                            </Link>
                          )}

                          {user?.roles?.includes('delivery_agent') && (
                            <Link to="/delivery" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaTruck className="mr-3 text-gray-400" /> Delivery Dashboard
                            </Link>
                          )}

                          {user?.roles?.includes('service_provider') && (
                            <Link to="/dashboard/service-provider" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserDropdown(false)}>
                              <FaTools className="mr-3 text-gray-400" /> Service Provider Dashboard
                            </Link>
                          )}

                          {/* Show Work with Us only if verified, or just show it but redirect (handled by link ternary) */}
                          {/* We show it if they are a customer or have no other roles essentially */}
                          {!isStationUser && (
                          <div className="border-t border-gray-100 my-1 pt-2">
                            <div className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Work with Us</div>
                            <Link
                              to={((user?.roles?.includes('admin') || user?.roles?.includes('super_admin') || user?.roles?.includes('superadmin')) || (user?.emailVerified && user?.phoneVerified && user?.nationalIdStatus === 'approved')) ? "/work-with-us" : "/customer/account-verification"}
                              className="flex items-center justify-between px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                              onClick={() => setShowUserDropdown(false)}
                            >
                              <div className="flex items-center">
                                <span className="mr-3">💼</span> Work with Comrades360
                              </div>
                              {!(user?.emailVerified && user?.phoneVerified && user?.nationalIdStatus === 'approved') && (
                                <span className="ml-2 text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">Verify Required</span>
                              )}
                            </Link>
                          </div>
                          )}
                        </div>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button
                          onClick={() => { logout(); setShowUserDropdown(false); }}
                          className="w-full text-left flex items-center px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                        >
                          <FaSignOutAlt className="mr-3" /> Sign out
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <Link to="/account" className="flex items-center space-x-1 px-3 py-2 text-gray-600 hover:text-blue-600">
                    <FaUser className="text-lg" />
                    <span className="text-sm font-medium">Account</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* MOBILE NAVIGATION (< lg) */}
          <div className="lg:hidden">
            <div className="h-14 flex flex-row items-center justify-between">
              {/* Left: hamburger + brand */}
              <div className="flex flex-row items-center gap-2">
                <button
                  onClick={() => { setMobileMenuType('navigation'); setIsMobileMenuOpen(true); }}
                  className="hamburger-btn flex items-center justify-center w-12 h-12 text-gray-700 hover:bg-gray-100 rounded-full -ml-2"
                  aria-label="Open menu"
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <Link to={isStationUser ? "/station" : "/"} className="flex items-center text-base font-bold text-blue-600 tracking-tight leading-none">{siteName}</Link>
              </div>

              {/* Right: cart + notifications + user */}
              <div className="flex flex-row items-center gap-1">
                {!isStationUser && (
                <Link to={cartLink} className="relative flex items-center justify-center w-9 h-9 text-gray-500">
                  <FaShoppingCart size={18} />
                  {cartBadgeCount > 0 && <span className="absolute top-0.5 right-0 bg-red-500 text-white text-[8px] rounded-full h-4 w-4 flex items-center justify-center border border-white">{cartBadgeCount}</span>}
                </Link>
                )}
                {isLoggedIn && !isStationUser && (
                <Link to="/notifications" className="relative flex items-center justify-center w-9 h-9 text-gray-500">
                  <FaBell size={18} />
                  {unreadCount > 0 && <span className="absolute top-0.5 right-0 bg-red-500 text-white text-[8px] rounded-full h-4 w-4 flex items-center justify-center border border-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </Link>
                )}
                {isLoggedIn ? (
                  <button
                    onClick={() => { setMobileMenuType('account'); setIsMobileMenuOpen(true); }}
                    className="user-mobile-btn flex items-center justify-center w-9 h-9"
                    aria-label="My Account"
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-200 text-xs font-black">
                      {firstName[0]}
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => { setMobileMenuType('account'); setIsMobileMenuOpen(true); }}
                    className="user-mobile-btn flex items-center justify-center w-9 h-9 text-gray-500"
                    aria-label="Account options"
                  >
                    <FaUser size={18} />
                  </button>
                )}
              </div>
            </div>

            {!isStationUser && !isDashboardRoute && !isDetailRoute && (
            <div className="pb-3 px-1.5">
              <div className="relative flex items-center bg-gray-100 rounded-xl px-2 py-1.5 border border-gray-200/50">
                <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder={searchPlaceholder}
                  className="bg-transparent border-none focus:ring-0 text-sm w-full p-0 py-0.5 text-gray-700 placeholder-gray-400 font-medium"
                />
                {/* Tap-able search button for mobile users */}
                <button
                  onClick={handleSearch}
                  aria-label="Search"
                  className="ml-1 p-1.5 rounded-lg bg-blue-600 text-white flex-shrink-0 active:bg-blue-700 transition-colors"
                >
                  <FaSearch size={11} />
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
                {/* MOBILE SIDE DRAWER */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
            <div ref={mobileMenuRef} className="absolute inset-y-0 left-0 w-72 bg-white shadow-2xl flex flex-col transition-transform duration-300 overflow-hidden">
              
              {/* Header logic depends on menu type */}
              {mobileMenuType === 'account' ? (
                <div className="p-4 bg-gradient-to-br from-blue-700 to-blue-900 text-white shadow-xl">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-xl font-black italic tracking-tighter">My Account</span>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 hover:bg-white/10 rounded-full">
                      <FaTimes size={20} />
                    </button>
                  </div>

                  {isLoggedIn ? (
                    <div className="flex items-center space-x-3 mt-4">
                      <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold border-2 border-blue-400 shadow-lg">
                        {firstName[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-base leading-none mb-1">Hi, {firstName}</h4>
                        <p className="text-gray-400 text-[10px] font-medium opacity-80">{user?.email}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="p-4 bg-blue-600 text-white">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-xl font-black italic tracking-tighter">{siteName}</span>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 hover:bg-white/10 rounded-full">
                      <FaTimes size={20} />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <FaStore size={14} />
                    </div>
                    <span className="text-sm font-bold">Discover Marketplace</span>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto py-4">
                {mobileMenuType === 'navigation' ? (
                  /* NAVIGATION DRAWER CONTENT */
                  <div className="px-4">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">Discovery</span>
                    <nav className="space-y-1">
                      <Link to="/" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 bg-gray-50/50" onClick={() => setIsMobileMenuOpen(false)}>
                        <span className="mr-3">🏠</span> Home
                      </Link>

                      <div className="rounded-xl bg-gray-50/40">
                        <button
                          onClick={() => setIsCategoriesOpen(!isCategoriesOpen)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100"
                        >
                          <span className="flex items-center">
                            <span className="mr-3">📦</span> Categories
                          </span>
                          <svg
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${isCategoriesOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isCategoriesOpen && (
                          <div className="px-2 pb-2 space-y-0.5">
                            {categoriesWithSubcategories
                              .filter(cat => {
                                if (cat.name === 'Food & Drinks') return isSectionVisible('fastfood');
                                if (cat.name === 'Student Services') return isSectionVisible('services');
                                return isSectionVisible('products');
                              })
                              .map(cat => {
                                const hasSub = cat.subcategories?.length > 0;
                              const isExpanded = activeMobileCategory === cat.id;
                              return (
                                <div key={cat.id}>
                                  <div
                                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer"
                                    onClick={() => {
                                      if (hasSub) {
                                        setActiveMobileCategory(isExpanded ? null : cat.id);
                                      } else {
                                        navigate(cat.name === 'Student Services' ? `/services` : cat.name === 'Food & Drinks' ? `/fastfood` : `/products?categoryId=${cat.id}`);
                                        setIsMobileMenuOpen(false);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center">
                                      <span className="mr-2 text-base">{cat.emoji || '📦'}</span>
                                      {cat.name}
                                    </div>
                                    {hasSub && (
                                      <svg className={`w-3 h-3 opacity-40 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    )}
                                  </div>
                                  {isExpanded && hasSub && (
                                    <div className="ml-7 border-l-2 border-blue-100 pl-2 py-1 space-y-0.5">
                                      {cat.subcategories.map(sub => (
                                        <Link
                                          key={sub.id}
                                          to={cat.name === 'Student Services' ? `/services?subcategoryId=${sub.id}` : cat.name === 'Food & Drinks' ? `/fastfood?subcategoryId=${sub.id}` : `/products?categoryId=${cat.id}&subcategoryId=${sub.id}`}
                                          className="flex items-center px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-blue-600 rounded-lg"
                                          onClick={() => setIsMobileMenuOpen(false)}
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"></span>
                                          {sub.name}
                                        </Link>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {isSectionVisible('fastfood') && (
                        <Link to="/fastfood" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                           <span className="mr-3">🍔</span> Fast Food
                        </Link>
                      )}
                      {isSectionVisible('services') && (
                        <Link to="/services" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                           <span className="mr-3">🛠️</span> Student Services
                        </Link>
                      )}
                    </nav>

                    <div className="mt-8">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">Company</span>
                      <nav className="space-y-1">
                        <Link to="/customer/work-with-us" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-blue-600 hover:bg-blue-50" onClick={() => setIsMobileMenuOpen(false)}>
                           <FaBullhorn className="mr-3" size={16} /> Work With Us
                        </Link>
                        <a href="mailto:support@comrades360.com" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100">
                           <FaCog className="mr-3" size={16} /> Help & Support
                        </a>
                      </nav>
                    </div>
                  </div>
                ) : (
                  /* ACCOUNT DRAWER CONTENT */
                  <div className="px-4">
                    {isLoggedIn ? (
                      <>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">My Account</span>
                        <nav className="space-y-1">
                          <Link to="/customer" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                            <FaUser className="mr-3 text-blue-600" size={16} /> Profile Overiew
                          </Link>
                          <Link to="/customer/orders" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                            <FaTruck className="mr-3 text-blue-600" size={16} /> My Orders
                          </Link>
                          <Link to="/customer/wishlist" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                            <FaHeart className="mr-3 text-blue-600" size={16} /> Wishlist
                          </Link>
                          <Link to="/customer/address" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                            <FaChevronRight className="mr-3 text-blue-600" size={14} /> My Addresses
                          </Link>
                          <Link to="/customer/settings" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                            <FaCog className="mr-3 text-blue-600" size={16} /> Account Settings
                          </Link>
                          <Link to="/customer/applications" className="flex items-center px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                            <span className="mr-3">📄</span> My Applications
                          </Link>
                        </nav>
                        {dashboardLinks.length > 0 && (
                          <div className="mt-6">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">Management & Roles</span>
                            <div className="space-y-2">
                              {dashboardLinks.map((item) => {
                                const roleId = item.to.includes('seller') ? 'seller' : item.to.includes('marketing') ? 'marketer' : item.to.includes('service-provider') ? 'provider' : null;
                                const hasSub = roleId && (roleId === 'seller' || roleId === 'marketer' || roleId === 'provider');
                                const subLinks = roleId === 'seller' ? sellerSubLinks : roleId === 'marketer' ? marketerSubLinks : roleId === 'provider' ? providerSubLinks : [];
                                const isExpanded = activeSubMenu === roleId;

                                return (
                                  <div key={item.to} className="rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm">
                                    <div className="flex items-center">
                                      <Link
                                        to={item.to}
                                        className="flex-1 flex items-center px-4 py-3 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                      >
                                        <span className="mr-3 text-neutral-400">{item.icon}</span>
                                        {item.label}
                                      </Link>
                                      {hasSub && (
                                        <button 
                                          onClick={(e) => { e.preventDefault(); setActiveSubMenu(isExpanded ? null : roleId); }}
                                          className={`p-3 border-l border-gray-50 text-gray-400 hover:text-blue-600 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`}
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                      )}
                                    </div>
                                      {isExpanded && hasSub && (
                                        <div className="bg-blue-50/30 border-t border-blue-50 py-1 px-2 space-y-0.5">
                                          {subLinks.map(sub => (
                                            <Link
                                              key={sub.to}
                                              to={sub.to}
                                              className="flex items-center px-4 py-2.5 rounded-lg text-xs font-bold text-gray-600 hover:bg-white hover:text-blue-600 transition-all"
                                              onClick={() => setIsMobileMenuOpen(false)}
                                            >
                                              <span className="w-1 h-1 rounded-full bg-blue-300 mr-3"></span>
                                              {sub.label}
                                            </Link>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                           <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-600 shadow-inner">
                              <FaUser size={44} />
                           </div>
                           <h3 className="text-xl font-black text-gray-900 mb-3">Hi there!</h3>
                           <p className="text-sm text-gray-500 mb-10 leading-relaxed px-4">Sign in to track orders, manage addresses and discover more of Comrades360.</p>
                           
                           <div className="w-full space-y-4">
                              <Link 
                                to="/login" 
                                className="inline-block w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-700 active:scale-95 transition-all" 
                                onClick={() => setIsMobileMenuOpen(false)}
                              >
                                Sign In Now
                              </Link>
                              
                              <Link 
                                to="/register" 
                                className="inline-block w-full py-4 bg-white text-blue-600 border-2 border-blue-600/20 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-50 active:scale-95 transition-all" 
                                onClick={() => setIsMobileMenuOpen(false)}
                              >
                                Create Account
                              </Link>
                           </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isLoggedIn && mobileMenuType === 'account' && (
                  <div className="p-4 border-t bg-gray-50/50">
                    <button onClick={() => { logout(); setIsMobileMenuOpen(false); }} className="w-full flex items-center justify-center gap-3 py-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-100 transition-colors">
                      <FaSignOutAlt /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
      </nav>
    </>
  );
}