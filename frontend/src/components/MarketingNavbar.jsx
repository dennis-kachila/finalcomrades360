import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaShoppingCart, FaSignOutAlt, FaSearch, FaLink, FaCheck } from 'react-icons/fa';
import { useCart } from '../contexts/CartContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ui/use-toast';
import { copyToClipboard } from '../utils/clipboard';

export default function MarketingNavbar() {
    const { cart } = useCart();
    // Marketing navbar always lives on the products context
    const cartBadgeCount = useMemo(() => {
        const items = Array.isArray(cart?.items) ? cart.items : [];
        return items.filter((item) => item?.itemType !== 'fastfood').length;
    }, [cart?.items]);
    const navigate = useNavigate();
    const { getCategoriesWithSubcategories } = useCategories();
    const categoriesWithSubcategories = getCategoriesWithSubcategories();

    // State for search and categories
    const [searchQuery, setSearchQuery] = useState("");
    const [showCategories, setShowCategories] = useState(false);
    const [activeCategory, setActiveCategory] = useState(null);

    const { user } = useAuth();
    const { toast } = useToast();
    const categoriesRef = useRef(null);
    const [copied, setCopied] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Maintenance Visibility Logic
    const [maintenance, setMaintenance] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('maintenance_settings') || '{}');
        } catch {
            return {};
        }
    });

    useEffect(() => {
        const handleUpdate = (e) => {
            // Check if it's our custom event (has detail) or storage event (has newValue)
            const data = e.detail || (e.key === 'maintenance_settings' ? JSON.parse(e.newValue || '{}') : null);
            if (data) setMaintenance(data);
        };
        window.addEventListener('maintenance-settings-updated', handleUpdate);
        window.addEventListener('storage', handleUpdate);
        return () => {
            window.removeEventListener('maintenance-settings-updated', handleUpdate);
            window.removeEventListener('storage', handleUpdate);
        };
    }, []);

    const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
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

    const handleCopyLink = () => {
        if (!user?.referralCode) {
            toast({
                title: "No Referral Code",
                description: "You don't have a referral code yet.",
                variant: "destructive"
            });
            return;
        }

        const url = `${window.location.origin}/?ref=${user.referralCode}`;
        copyToClipboard(url).then((success) => {
            if (success) {
                setCopied(true);
                toast({
                    title: "Link Copied!",
                    description: "Referral link copied to clipboard.",
                    duration: 2000
                });
                setTimeout(() => setCopied(false), 2000);
            } else {
                toast({
                    title: "Failed to Copy",
                    description: "Please copy the link manually.",
                    variant: "destructive"
                });
            }
        });

    };

    const handleExit = () => {
        localStorage.removeItem('marketing_mode');
        window.location.href = '/';
    };


    const isDashboardRoute = location.pathname.startsWith('/dashboard') ||
        ['/marketing', '/seller', '/customer', '/ops', '/logistics', '/finance', '/station'].some(path => location.pathname.startsWith(path));

    const isDetailRoute = location.pathname.startsWith('/product/') || 
                         location.pathname.startsWith('/category/') ||
                         location.pathname.startsWith('/fastfood/') || 
                         location.pathname.startsWith('/service/');

    // Close dropdowns when clicking outside

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (categoriesRef.current && !categoriesRef.current.contains(event.target)) {
                setShowCategories(false);
                setActiveCategory(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSearch = () => {
        if (searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    return (
        <nav className="bg-blue-900 border-b border-blue-800 shadow-md fixed top-0 left-0 w-full z-[160] text-white">
            <div className="max-w-7xl mx-auto px-1.5 sm:px-4">
                <div className="flex justify-between items-center h-14 md:h-16 gap-4">

                    {/* Left: Branding & Categories */}
                    <div className="flex items-center space-x-1 sm:space-x-4">
                        {/* Mobile Hamburger */}
                        <button 
                            onClick={() => setIsDrawerOpen(true)}
                            className="p-2 -ml-2 text-blue-100 hover:text-white sm:hidden"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                            </svg>
                        </button>

                        <Link to="/" className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2 flex-shrink-0">
                            <span>Comrades360</span>
                        </Link>

                        {/* Categories Dropdown */}
                        <div className="relative pointer-events-auto" ref={categoriesRef}>
                            <button
                                onClick={() => setShowCategories(!showCategories)}
                                className="px-1.5 sm:px-3 py-2 hover:bg-blue-800 rounded flex items-center transition-colors text-xs sm:text-sm font-medium"
                            >
                                <span className="inline">Categories</span>
                                <span className="ml-0.5 sm:ml-1">▾</span>
                            </button>

                            {showCategories && (
                                <div className="absolute left-0 mt-2 bg-white text-gray-800 border rounded shadow-xl z-50 w-64 py-1">
                                    <ul>
                                        {/* Removed View All Products top link */}
                                        {categoriesWithSubcategories
                                            .filter(cat => {
                                                if (cat.name === 'Food & Drinks') return isSectionVisible('fastfood');
                                                if (cat.name === 'Student Services') return isSectionVisible('services');
                                                return isSectionVisible('products');
                                            })
                                            .map((cat, i) => {
                                            const hasSub = cat.subcategories?.length > 0;
                                            return (
                                                <li key={cat.id} className="relative group">
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
                                                            {cat.emoji && <span className="mr-3 text-lg">{cat.emoji}</span>}
                                                            <span>{cat.name}</span>
                                                        </div>
                                                        {hasSub && (
                                                            <svg className={`h-4 w-4 transition-transform duration-200 ${activeCategory === i ? 'rotate-0' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        )}
                                                    </div>

                                                    {/* Subcategories */}
                                                    {activeCategory === i && hasSub && (
                                                        <div className="bg-gray-50 border-y border-gray-100 py-1">
                                                            {/* Removed View All Category link */}
                                                            {cat.subcategories.map((sub) => (
                                                                <Link
                                                                    key={sub.id}
                                                                    to={
                                                                        cat.name === 'Student Services' ? `/services?subcategoryId=${sub.id}` :
                                                                            cat.name === 'Food & Drinks' ? `/fastfood?subcategoryId=${sub.id}` :
                                                                                `/products?categoryId=${cat.id}&subcategoryId=${sub.id}`
                                                                    }
                                                                    className="block px-8 py-2 text-sm text-gray-600 hover:bg-white hover:text-blue-600 transition-colors"
                                                                    onClick={() => setShowCategories(false)}
                                                                >
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
                    </div>

                    {/* Center: Search Bar (Desktop Only) */}
                    <div className="flex-1 max-w-xl mx-auto px-4 hidden md:block">
                        <div className="relative flex w-full text-gray-900 shadow-sm transition-shadow focus-within:shadow-md">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search products, services, food..."
                                className="w-full px-4 py-2 rounded-l-md border-0 focus:ring-2 focus:ring-blue-300 outline-none text-sm bg-white"
                            />
                            <button
                                onClick={handleSearch}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-r-md transition-colors"
                            >
                                <FaSearch />
                            </button>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center space-x-1 sm:space-x-3 flex-shrink-0">
                        {/* Cart Icon */}
                        <Link
                            to="/cart"
                            className="relative flex items-center space-x-1 p-2 text-blue-100 hover:text-white transition-colors"
                            title="View Cart"
                        >
                            <FaShoppingCart className="text-xl sm:text-2xl" />
                            {cartBadgeCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full h-4.5 w-4.5 sm:h-5 sm:w-5 flex items-center justify-center border-2 border-blue-900 shadow-sm">
                                    {cartBadgeCount > 9 ? '9+' : cartBadgeCount}
                                </span>
                            )}
                        </Link>
                        {/* Marketing Orders Link */}
                        {isDashboardVisible('marketer') && (
                        <Link
                            to="/marketing?tab=orders"
                            className="text-blue-100 hover:text-white font-medium text-sm hidden sm:block transition-colors"
                        >
                            My Orders
                        </Link>
                        )}

                        {/* Exit Button - Desktop Only (hidden on small mobile to favor hamburger) */}
                        <button
                            onClick={handleExit}
                            className="hidden sm:flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full font-bold text-sm transition-transform active:scale-95 shadow-sm whitespace-nowrap"
                        >
                            <span className="hidden md:inline">Exit Mode</span>
                            <FaSignOutAlt />
                        </button>

                        {/* Copy Link Button */}
                        <button
                            onClick={handleCopyLink}
                            className="flex items-center space-x-2 bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm transition-colors border border-blue-700"
                            title="Copy Referral Link"
                        >
                            {copied ? <FaCheck className="w-3 h-3" /> : <FaLink className="w-3 h-3" />}
                            <span className="hidden lg:inline">{copied ? 'Copied' : 'Copy Link'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Search Bar (visible only on small screens) */}
            {!isDashboardRoute && !isDetailRoute && (
                <div className="md:hidden px-3 pb-3">
                    <div className="relative flex w-full text-gray-900 shadow-sm">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search..."
                            className="w-full px-4 py-2 rounded-l-md border-0 focus:ring-2 focus:ring-blue-300 outline-none text-sm"
                        />
                        <button
                            onClick={handleSearch}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-r-md transition-colors"
                        >
                            <FaSearch />
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile Sidebar Drawer Overlay */}
            {isDrawerOpen && (
                <>
                    <div 
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] sm:hidden transition-opacity duration-300"
                        onClick={() => setIsDrawerOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 w-[280px] bg-white text-gray-900 shadow-2xl z-[70] sm:hidden transform transition-transform duration-300 p-0 flex flex-col">
                        <div className="p-6 bg-blue-900 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">Marketing</h3>
                                <p className="text-[10px] opacity-70 uppercase tracking-widest font-black">Menu</p>
                            </div>
                            <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-blue-800 rounded-full">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 py-4 px-3 space-y-2 overflow-y-auto">
                            <Link 
                                to="/marketing?tab=orders" 
                                className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-blue-50 text-gray-700 font-bold transition-all active:scale-95 shadow-sm border border-gray-100"
                                onClick={() => setIsDrawerOpen(false)}
                            >
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-lg">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                </div>
                                <span className="text-base font-bold">My Orders</span>
                            </Link>

                            <button 
                                onClick={() => {
                                    handleExit();
                                    setIsDrawerOpen(false);
                                }}
                                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-red-50 text-red-600 font-bold transition-all active:scale-95 text-left shadow-sm border border-red-50"
                            >
                                <div className="p-2.5 bg-red-100 text-red-600 rounded-lg">
                                    <FaSignOutAlt className="w-5 h-5" />
                                </div>
                                <span className="text-base font-bold">Exit Mode</span>
                            </button>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 text-center">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Comrades360 v2.0</p>
                        </div>
                    </div>
                </>
            )}
        </nav>
    );
}
