import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

/**
 * Custom hook for fetching data with localStorage persistence (Instant Loading).
 * 
 * @param {string} key - Unique key for localStorage (e.g., 'home_data_v1')
 * @param {string|Function} urlOrFetcher - URL to fetch or function that returns a promise
 * @param {Object} options - Configuration options
 * @param {boolean} options.revalidateOnMount - Whether to fetch fresh data immediately (default: true)
 * @param {number} options.staleTime - Time in ms before data is considered stale (default: 0)
 * @returns {Object} { data, loading, error, refresh, isOffline }
 */
export const usePersistentFetch = (key, urlOrFetcher, options = {}) => {
    const {
        revalidateOnMount = true,
        staleTime = 0,
        initialData = null
    } = options;

    // Initialize state from localStorage if available, otherwise initialData
    const [data, setData] = useState(() => {
        if (typeof window === 'undefined') return initialData;
        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                return parsed.data;
            }
        } catch (e) {
            console.warn(`[usePersistentFetch] Failed to load cache for ${key}`, e);
        }
        return initialData;
    });

    const [loading, setLoading] = useState(!data); // Loading if no cache
    const [error, setError] = useState(null);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const lastFetchTime = useRef(0);

    // Helper to determining if we should revalidate
    const shouldRevalidate = useCallback(() => {
        if (!revalidateOnMount) return false;
        if (staleTime > 0) {
            const now = Date.now();
            try {
                const cached = localStorage.getItem(key);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (now - parsed.timestamp < staleTime) {
                        console.log(`[usePersistentFetch] Cache hit for ${key}. Skipping fetch.`);
                        return false;
                    }
                }
            } catch (e) {
                // ignore
            }
            lastFetchTime.current = now;
        }
        return true;
    }, [key, revalidateOnMount, staleTime]);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);

        try {
            let result;
            if (typeof urlOrFetcher === 'function') {
                result = await urlOrFetcher();
            } else {
                const response = await api.get(urlOrFetcher);
                result = response.data;
            }

            // Update state
            setData(result);

            // Update cache
            try {
                let dataToCache = result;
                if (options.transform && typeof options.transform === 'function') {
                    dataToCache = options.transform(result);
                }

                const cachePayload = {
                    timestamp: Date.now(),
                    data: dataToCache
                };
                localStorage.setItem(key, JSON.stringify(cachePayload));
            } catch (e) {
                const isQuotaError = 
                    e.name === 'QuotaExceededError' || 
                    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
                    e.code === 22 || 
                    e.code === 1014;

                if (isQuotaError) {
                    console.warn(`[usePersistentFetch] Storage quota exceeded for "${key}". Data is too large to cache.`);
                    // Optional: Try to clear the current key to make some room
                    try { localStorage.removeItem(key); } catch (_) {}
                } else {
                    console.warn(`[usePersistentFetch] Failed to save cache for ${key}:`, e);
                }
            }

        } catch (err) {
            console.error(`[usePersistentFetch] Error fetching ${key}:`, err);
            setError(err.message || 'Failed to fetch data');
            // If we have cached data, we don't necessarily need to show an error to the user
            // unless we want to indicate "Offline" or "Sync Failed"
        } finally {
            if (!silent) setLoading(false);
        }
    }, [key, urlOrFetcher]);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // SYNC: When key changes, immediately update state from new cache
        // This prevents showing stale data from the previous key
        setError(null);
        let cachedDataForThisKey = null;
        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                cachedDataForThisKey = parsed.data;
                setData(cachedDataForThisKey);
            } else {
                setData(initialData);
            }
        } catch (e) {
            setData(initialData);
        }

        if (shouldRevalidate()) {
            fetchData(!!cachedDataForThisKey); // Silent fetch only if we have cache for THIS key
        } else {
            if (loading) setLoading(false);
        }

        // Listen for global real-time updates to trigger fresh fetching
        const handleGlobalUpdate = (e) => {
            // If the scope matches or it's a critical system update
            if (e.detail?.scope === 'system' || e.detail?.scope === key.split('_')[0]) {
                fetchData(false); // Force non-silent refresh
            }
        };
        window.addEventListener('realtime:data-updated', handleGlobalUpdate);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('realtime:data-updated', handleGlobalUpdate);
        };
    }, [key, fetchData, shouldRevalidate, initialData]);

    return { data, loading, error, refresh: () => fetchData(false), isOffline };
};
