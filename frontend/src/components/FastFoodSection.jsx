import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FastFoodCard from './FastFoodCard';
import { FaHamburger } from 'react-icons/fa';
import { useCategories } from '../contexts/CategoriesContext';
import api from '../services/api';

export default function FastFoodSection({ initialData = null, initialTotal = 0 }) {
    const [items, setItems] = useState(initialData || []);
    const [loading, setLoading] = useState(!initialData);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialTotal > (initialData?.length || 0) || (initialData?.length || 0) >= 12);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const navigate = useNavigate();
    const { categories } = useCategories();

    // Determine marketing mode
    const isMarketingMode = localStorage.getItem('marketing_mode') === 'true';
    const hasBootstrappedFromInitial = Array.isArray(initialData) && initialData.length > 0;

    // Helper to get items per row based on current layout (matches Home.jsx)
    const getItemsPerRow = () => {
        const width = window.innerWidth;
        if (width >= 1280) return 6; // xl
        if (width >= 1024) return 5; // lg
        if (width >= 768) return 4;  // md
        if (width >= 640) return 3;  // sm
        return 2; // mobile
    };

    // Get subcategories for specifically 'Food & Drinks'
    const getFoodSubcategories = () => {
        const foodCategory = categories.find(
            cat => cat.name === 'Food & Drinks'
        );
        return foodCategory?.subcategories || [];
    };

    const foodSubcategories = getFoodSubcategories();

    const fetchFastFood = async (isLoadMore = false) => {
        try {
            if (isLoadMore) setLoadingMore(true);
            else if (items.length === 0) setLoading(true);

            const itemsPerRow = getItemsPerRow();
            const limit = itemsPerRow * 3; // Always append exactly 3 rows per load
            const pageNum = isLoadMore ? page + 1 : 1;

            const params = new URLSearchParams({
                limit: limit.toString(),
                page: pageNum.toString(),
                view: 'public'
            });

            // Match FastFood page behavior: include closed-shop items in browse listing.
            params.append('browseAll', 'true');

            if (selectedCategory !== 'all') {
                params.append('category', selectedCategory);
            }

            if (isMarketingMode) {
                params.append('marketing', 'true');
            }

            const response = await api.get(`/fastfood?${params.toString()}`);
            if (response.data.success) {
                let fetchedItems = response.data.data;

                // Safety clientside filter for marketing mode
                if (isMarketingMode) {
                    fetchedItems = fetchedItems.filter(item => {
                        const commission = parseFloat(item.marketingCommission || 0);
                        return commission > 1;
                    });
                }

                const nextItems = isLoadMore ? [...items, ...fetchedItems] : fetchedItems;
                setItems(nextItems);

                // Check if we have more to load
                const total = response.data.pagination?.totalItems || response.data.pagination?.totalFastFood || response.data.totalCount || initialTotal || 0;
                const updatedCount = nextItems.length;
                // Fix: if fetchedItems > 0 and total > updatedCount then we likely have more items.
                // Using fetchedItems.length >= limit causes bugs if backend filters items after pagination
                setHasMore(total > updatedCount && fetchedItems.length > 0);
                setPage(pageNum);
            }
        } catch (error) {
            console.error('Failed to fetch fast food items:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        // Sync items with initialData if provided and we haven't modified selectedCategory
        if (selectedCategory === 'all' && initialData && initialData.length > 0 && items.length === 0) {
            setItems(initialData);
            setHasMore(initialTotal > initialData.length);
            setLoading(false);
        }
    }, [initialData, initialTotal]);

    useEffect(() => {
        setPage(1);
        if (hasBootstrappedFromInitial && selectedCategory === 'all' && items.length === 0) {
            setHasMore(initialTotal > (initialData?.length || 0));
            // Use initial chunk immediately (3 rows), wait for user to click Load More
            setItems(initialData);
            setLoading(false);
            // Hydrate in background so homepage section matches current FastFood page visibility rules.
            fetchFastFood(false);
            return;
        }

        fetchFastFood(false);
    }, [selectedCategory]);

    const handleLoadMore = () => {
        if (!loadingMore && hasMore) {
            fetchFastFood(true);
        }
    };

    if (loading && items.length === 0) {
        return (
            <div className="w-full py-12 px-0 md:px-4">
                <div className="h-8 w-48 bg-gray-200 rounded mb-8 animate-pulse"></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-64 bg-gray-100 rounded-lg animate-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (items.length === 0 && selectedCategory === 'all' && !isMarketingMode) return null;

    return (
        <section className="w-full py-4 px-0 md:px-4 bg-orange-50/50 rounded-3xl my-2 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-orange-600">
                            <FaHamburger size={28} />
                        </span>
                        Special Dishes
                    </h2>
                </div>
                <button
                    onClick={() => navigate('/fastfood')}
                    className="text-orange-600 hover:text-orange-800 font-semibold flex items-center gap-1 group"
                >
                    View all
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            <div className="bg-white border rounded-lg shadow-sm mb-6 relative group overflow-hidden">
                <div className="px-4 py-4">
                    <div className="relative">
                        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden z-10" />
                        <div className="flex space-x-3 overflow-x-auto pb-2 scroll-smooth">
                            <button
                                onClick={() => setSelectedCategory('all')}
                                className={`flex-shrink-0 px-4 py-2 rounded-lg border font-medium transition-colors whitespace-nowrap ${selectedCategory === 'all'
                                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300 hover:text-orange-600'
                                    }`}
                            >
                                All Cravings
                            </button>
                            {foodSubcategories.map((subcategory) => (
                                <button
                                    key={subcategory.id}
                                    onClick={() => setSelectedCategory(subcategory.name)}
                                    className={`flex-shrink-0 px-4 py-2 rounded-lg border font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${selectedCategory === subcategory.name
                                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300 hover:text-orange-600'
                                        }`}
                                >
                                    {subcategory.emoji && <span>{subcategory.emoji}</span>}
                                    {subcategory.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className={`transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                {items.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                        {items.map((item) => (
                            <FastFoodCard
                                key={item.id}
                                item={item}
                                navigate={navigate}
                                className="w-full"
                            />
                        ))}
                        {loadingMore && Array.from({ length: getItemsPerRow() * 2 }).map((_, i) => (
                            <div key={`more-skeleton-${i}`} className="h-64 bg-gray-100 rounded-lg animate-pulse"></div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100 italic">
                        <p>No items found in this category.</p>
                    </div>
                )}
            </div>

            {!loading && items.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-4 mt-6 mb-2">
                    {hasMore && !loadingMore && (
                        <button
                            onClick={handleLoadMore}
                            className="px-4 py-2 sm:px-8 sm:py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition-all shadow-lg hover:shadow-orange-200 flex items-center space-x-2 active:scale-95 group animate-in fade-in zoom-in duration-300 text-xs sm:text-base"
                        >
                            <span>Load More</span>
                            <svg className="h-5 w-5 transition-transform group-hover:translate-y-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    )}

                    <button
                        onClick={() => navigate('/fastfood')}
                        className="px-4 py-2 sm:px-8 sm:py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-200 flex items-center space-x-2 active:scale-95 group text-xs sm:text-base"
                    >
                        <span>View All</span>
                        <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </button>
                </div>
            )}
        </section>
    );
}
