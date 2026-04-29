import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FastFoodCard from '../components/FastFoodCard';
import ItemCarousel from '../components/ItemCarousel';
import Footer from '../components/Footer';
import FastFoodHero from '../components/FastFoodHero';
import LiveMenuGrid from '../components/LiveMenuGrid';
import api from '../services/api';
import { platformService } from '../services/platformService';
import { fastFoodService } from '../services/fastFoodService';
import { FaHamburger, FaFilter, FaArrowLeft, FaUtensils, FaFire, FaArrowRight } from 'react-icons/fa';
import { useCategories } from '../contexts/CategoriesContext';
import { useAuth } from '../contexts/AuthContext';
import MaintenanceOverlay from '../components/MaintenanceOverlay';
import PageLayout from '../components/layout/PageLayout';

export default function FastFood() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedSubcategory, setSelectedSubcategory] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [activeTab, setActiveTab] = useState('all');
    const [activeCampaigns, setActiveCampaigns] = useState([]);
    const [campaignItems, setCampaignItems] = useState({});
    const [currentCampaignIndex, setCurrentCampaignIndex] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');

    const navigate = useNavigate();
    const location = useLocation();
    const urlSearchQuery = new URLSearchParams(location.search).get('search') || '';
    const { user } = useAuth();
    const observerTarget = useRef(null);
    const { categories } = useCategories();

    // --- Granular Maintenance Check ---
    const [maintenanceSettings, setMaintenanceSettings] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('maintenance_settings') || '{}');
        } catch {
            return {};
        }
    });

    useEffect(() => {
        const handleUpdate = (e) => {
            const data = e.detail || (e.key === 'maintenance_settings' ? JSON.parse(e.newValue || '{}') : null);
            if (data) setMaintenanceSettings(data);
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
    const isMaintenanceActive = !isAdmin && (maintenanceSettings.enabled || maintenanceSettings.sections?.fastfood?.enabled);

    const foodCategory = categories.find(cat => cat.name === 'Food & Drinks');
    const subcategories = foodCategory?.subcategories || [];

    // Load Hero Settings
    useEffect(() => {
        const loadHeroConfig = async () => {
            try {
                const res = await platformService.getConfig('fast_food_hero');
                if (res.success) {
                    const config = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                    let activeList = (config.campaigns || []).filter(c => c.active).sort((a, b) => b.priority - a.priority);
                    
                    const itemsMap = {};
                    
                    try {
                        const promoRes = await api.get('/hero-promotions/active');
                        const promos = Array.isArray(promoRes.data?.items) ? promoRes.data.items : (Array.isArray(promoRes.data) ? promoRes.data : []);
                        const fastFoodPromos = promos.filter(p => p.promoType === 'fastfood' && Array.isArray(p.fastfoods) && p.fastfoods.length > 0);
                        
                        fastFoodPromos.forEach(p => {
                            const fastFoodItem = p.fastfoods[0];
                            const campId = `promo_${p.id}`;
                            activeList.push({
                                id: campId,
                                active: true,
                                priority: p.priority || 10,
                                type: p.customImageUrl ? 'manual_image_only' : 'featured_item',
                                title: p.title || '',
                                subtitle: p.subtitle || '',
                                image: p.customImageUrl || fastFoodItem.mainImage,
                                itemId: fastFoodItem.id
                            });
                            itemsMap[fastFoodItem.id] = fastFoodItem;
                        });
                    } catch (e) {
                         console.error('Failed to load hero promotions:', e);
                    }

                    setActiveCampaigns(activeList.sort((a, b) => b.priority - a.priority));
                    
                    const campaignsWithItems = activeList.filter(c => c.itemId && c.itemId !== 'none' && !itemsMap[c.itemId]);
                    const uniqueItemIds = [...new Set(campaignsWithItems.map(c => c.itemId))];
                    
                    if (uniqueItemIds.length > 0) {
                        const itemFetchPromises = uniqueItemIds.map(id => fastFoodService.getFastFoodById(id));
                        const itemResponses = await Promise.all(itemFetchPromises);
                        itemResponses.forEach((response, index) => {
                            if (response.success && response.data) itemsMap[uniqueItemIds[index]] = response.data;
                        });
                    }
                    setCampaignItems(itemsMap);
                }
            } catch (error) { console.error('Failed to load hero config:', error); }
        };
        loadHeroConfig();
    }, []);

    const currentCampaign = activeCampaigns.length > 0 ? activeCampaigns[currentCampaignIndex] : { type: 'manual' };
    const currentHeroItem = currentCampaign.itemId ? campaignItems[currentCampaign.itemId] : null;

    useEffect(() => {
        if (urlSearchQuery) setSearchTerm(urlSearchQuery);
    }, [urlSearchQuery]);

    useEffect(() => {
        if (activeCampaigns.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentCampaignIndex((prev) => (prev + 1) % activeCampaigns.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [activeCampaigns.length]);

    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        const subcategoryId = urlParams.get('subcategoryId');
        const tabParam = urlParams.get('tab');
        setActiveTab(tabParam === 'live' ? 'live' : 'all');
        if (subcategoryId && subcategories.length > 0) {
            const subcategory = subcategories.find(sub => sub.id === parseInt(subcategoryId));
            if (subcategory) setSelectedSubcategory(subcategory);
        }
    }, [location.search, subcategories]);

    const fetchFastFood = useCallback(async (pageNum, reset = false) => {
        try {
            if (reset) setLoading(true);
            else setLoadingMore(true);
            const limit = activeTab === 'live' ? '100' : '12';
            const params = new URLSearchParams({ limit, page: pageNum.toString(), view: 'public', search: urlSearchQuery });
            
            const urlParams = new URLSearchParams(location.search);
            const vendorId = urlParams.get('vendorId');
            if (vendorId) params.append('vendor', vendorId);

            if (activeTab === 'all') params.append('browseAll', 'true');
            if (activeTab === 'all' && selectedSubcategory) params.append('subcategoryId', selectedSubcategory.id);
            if (userLocation) {
                params.append('userLat', userLocation.lat);
                params.append('userLng', userLocation.lng);
                params.append('sortBy', 'distance');
            }
            if (localStorage.getItem('marketing_mode') === 'true') params.append('marketing', 'true');

            const response = await api.get(`/fastfood?${params.toString()}`);
            if (response.data.success) {
                let fetchedItems = response.data.data;
                if (reset) setItems(fetchedItems);
                else setItems(prev => [...prev, ...fetchedItems]);
                setHasMore(fetchedItems.length === parseInt(limit));
                setPage(pageNum);
            }
        } catch (error) { console.error('Failed to fetch fast food items:', error); }
        finally { setLoading(false); setLoadingMore(false); }
    }, [selectedCategory, selectedSubcategory, activeTab, userLocation, urlSearchQuery]);

    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
                (error) => console.warn('📍 Geolocation tracking failed/denied:', error.message),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        }
    }, []);

    useEffect(() => { fetchFastFood(1, true); }, [selectedCategory, selectedSubcategory, activeTab, userLocation, urlSearchQuery, fetchFastFood]);

    useEffect(() => {
        if (activeTab === 'live') return;
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) fetchFastFood(page + 1, false);
        }, { threshold: 0.1 });
        if (observerTarget.current) observer.observe(observerTarget.current);
        return () => { if (observerTarget.current) observer.unobserve(observerTarget.current); };
    }, [hasMore, loadingMore, loading, page, fetchFastFood, activeTab]);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        const url = new URL(window.location);
        url.searchParams.set('tab', tab);
        navigate(`${url.pathname}${url.search}`, { replace: true });
        setPage(1); setItems([]); setLoading(true);
    };

    return (
        <div className="relative min-h-screen bg-[#FDFCFB]">
            <MaintenanceOverlay 
                isVisible={isMaintenanceActive} 
                message={maintenanceSettings.sections?.fastfood?.message} 
            />
            
            <div className={isMaintenanceActive ? "blur-md pointer-events-none opacity-50 select-none transition-all duration-700" : "transition-all duration-700"}>
                <PageLayout>
                    <div className="min-h-screen flex flex-col pb-20">
                        {/* Back Button */}
                        <div className="w-full px-0 md:px-4 py-4">
                            <button
                                onClick={() => navigate('/')}
                                className="flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors ml-4 md:ml-0"
                            >
                                <FaArrowLeft className="mr-2" />
                                Back to Homepage
                            </button>
                        </div>

                        <FastFoodHero
                            settings={activeCampaigns[currentCampaignIndex] || {}}
                            item={currentHeroItem}
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            loading={activeCampaigns.length === 0}
                        />

                        {/* Rotation Indicators */}
                        {activeCampaigns.length > 1 && (
                            <div className="flex justify-center mt-4 mb-6 relative z-20 gap-2 px-3 md:px-4">
                                {activeCampaigns.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentCampaignIndex(idx)}
                                        className={`h-2 rounded-full transition-all duration-300 ${idx === currentCampaignIndex ? 'w-8 bg-orange-600' : 'w-2 bg-gray-300'}`}
                                        aria-label={`Go to slide ${idx + 1}`}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Tab Navigation */}
                        <div className="flex justify-center mt-4 mb-6 px-3 md:px-4 relative z-20">
                            <div className="w-full sm:w-auto bg-white/90 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-white/50 flex space-x-2">
                                <button
                                    onClick={() => handleTabChange('all')}
                                    className={`flex-1 sm:flex-initial flex items-center justify-center px-4 sm:px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'all' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <FaUtensils className="mr-2" /> Browse All
                                </button>
                                <button
                                    onClick={() => handleTabChange('live')}
                                    className={`flex-1 sm:flex-initial flex items-center justify-center px-4 sm:px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'live' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-orange-600'}`}
                                >
                                    <FaFire className="mr-2" /> Live Menu
                                </button>
                            </div>
                        </div>

                        <div className="w-full px-0 md:px-4 py-4 md:py-6">
                            {loading && items.length === 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-pulse">
                                    {[...Array(12)].map((_, i) => <div key={i} className="bg-gray-200 rounded-xl h-64"></div>)}
                                </div>
                            ) : activeTab === 'live' ? (
                                <LiveMenuGrid items={items} searchTerm={searchTerm} navigate={navigate} />
                            ) : (
                                <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : 'opacity-100'}`}>
                                    {/* Category Filter */}
                                    <div className="bg-white md:rounded-2xl shadow-sm border border-gray-100 p-3 md:p-4 mb-4 md:mb-8">
                                        <div className="flex gap-2 overflow-x-auto pb-4 pt-1 scrollbar-hide snap-x touch-pan-x relative px-1">
                                            <button
                                                onClick={() => { setSelectedCategory('all'); setSelectedSubcategory(null); }}
                                                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 snap-start shadow-sm border ${!selectedSubcategory && selectedCategory === 'all' ? 'bg-orange-600 text-white' : 'bg-white text-gray-600'}`}
                                            >
                                                All Items
                                            </button>
                                            {subcategories.map((subcategory) => (
                                                <button
                                                    key={subcategory.id}
                                                    onClick={() => { setSelectedSubcategory(subcategory); setSelectedCategory('all'); }}
                                                    className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 snap-start shadow-sm border ${selectedSubcategory?.id === subcategory.id ? 'bg-orange-600 text-white' : 'bg-white text-gray-600'}`}
                                                >
                                                    {subcategory.emoji && <span className="mr-2">{subcategory.emoji}</span>}
                                                    {subcategory.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Items Display */}
                                    {items.length > 0 ? (
                                        <div className="bg-white md:rounded-3xl border border-gray-100 p-0 md:p-4">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                                                {items.map((item) => <FastFoodCard key={item.id} item={item} navigate={navigate} />)}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 border-dashed">
                                            <div className="text-6xl mb-4">🍔</div>
                                            <h3 className="text-xl font-bold text-gray-700 mb-2">No items found</h3>
                                        </div>
                                    )}

                                    {loadingMore && (
                                        <div className="flex justify-center py-8">
                                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
                                        </div>
                                    )}
                                    <div ref={observerTarget} className="h-10"></div>
                                    {!hasMore && items.length > 0 && (
                                        <div className="text-center py-12 text-gray-400">
                                            <p className="font-medium">You've reached the end! 🎉</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <Footer />
                    </div>
                </PageLayout>
            </div>
        </div>
    );
}
