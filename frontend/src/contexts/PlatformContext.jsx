import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import useRealtimeSync from '../hooks/useRealtimeSync';

const PlatformContext = createContext();

export const usePlatform = () => {
    const context = useContext(PlatformContext);
    if (!context) {
        throw new Error('usePlatform must be used within a PlatformProvider');
    }
    return context;
};

export const PlatformProvider = ({ children }) => {
    const [settings, setSettings] = useState({
        platform: { siteName: 'Comrades360', siteDescription: 'Your trusted marketplace', contactEmail: 'admin@comrades360.com', supportPhone: '+254700000000', currency: 'KES', timezone: 'Africa/Nairobi' },
        maintenance: { enabled: false, message: 'System is currently under maintenance.', dashboards: {}, sections: {} },
        seo: { title: 'Comrades360', description: 'Student Marketplace', keywords: 'university, marketplace' },
        finance: { referralSplit: { primary: 0.6, secondary: 0.4 }, minPayout: {} },
        logistic: { warehouseHours: { open: '08:00', close: '20:00' } }
    });
    const [loading, setLoading] = useState(true);

    const loadSettings = useCallback(async () => {
        try {
            const keys = [
                'platform_settings', 
                'maintenance_settings', 
                'seo_settings',
                'finance_settings',
                'logistic_settings'
            ];

            const results = await Promise.all(
                keys.map(key => api.get(`/admin/config/${key}`).catch(() => ({ data: { success: false } })))
            );

            setSettings(prev => {
                const next = { ...prev };
                keys.forEach((key, index) => {
                    const res = results[index];
                    if (res.data?.success && res.data?.data) {
                        const stateKey = key === 'platform_settings' ? 'platform' 
                                       : key === 'maintenance_settings' ? 'maintenance'
                                       : key === 'seo_settings' ? 'seo'
                                       : key === 'finance_settings' ? 'finance'
                                       : key === 'logistic_settings' ? 'logistic'
                                       : key;
                        
                        const incomingData = typeof res.data.data === 'string' ? JSON.parse(res.data.data) : res.data.data;
                        next[stateKey] = { ...prev[stateKey], ...incomingData };
                        
                        // Sync maintenance to localStorage for hard-refresh fallback
                        if (stateKey === 'maintenance') {
                            localStorage.setItem('maintenance_settings', JSON.stringify(incomingData));
                        }
                    }
                });
                return next;
            });
        } catch (e) {
            console.error('[PlatformContext] Failed to load settings:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    // Handle real-time updates from WebSockets
    const handleRealtimeUpdate = useCallback((payload) => {
        if (!payload || !payload.key) return;
        
        const key = payload.key;
        const value = payload.settings;

        setSettings(prev => {
            const stateKey = key === 'platform_settings' ? 'platform' 
                           : key === 'maintenance_settings' ? 'maintenance'
                           : key === 'seo_settings' ? 'seo'
                           : key === 'finance_settings' ? 'finance'
                           : key === 'logistic_settings' ? 'logistic'
                           : null;
            
            if (!stateKey) return prev;

            console.log(`[PlatformContext] Real-time update for ${stateKey}:`, value);
            
            if (stateKey === 'maintenance') {
                localStorage.setItem('maintenance_settings', JSON.stringify(value));
                // Dispatch legacy event for components still using the old event listener
                window.dispatchEvent(new CustomEvent('maintenance-settings-updated', { detail: value }));
            }

            return { ...prev, [stateKey]: value };
        });
    }, []);

    // Register with the global real-time bridge
    useRealtimeSync(['platform_settings'], () => {
        // We can either re-fetch everything or wait for the detailed payload.
        // The detailed payload flows through the 'realtime:data-updated' event.
        // We catch it here via a manual listener because useRealtimeSync only triggers a callback.
    });

    useEffect(() => {
        const onUpdate = (e) => {
            if (e.detail?.scope === 'platform_settings') {
                handleRealtimeUpdate(e.detail.payload);
            }
        };
        window.addEventListener('realtime:data-updated', onUpdate);
        return () => window.removeEventListener('realtime:data-updated', onUpdate);
    }, [handleRealtimeUpdate]);

    return (
        <PlatformContext.Provider value={{ settings, loading, refreshSettings: loadSettings }}>
            {children}
        </PlatformContext.Provider>
    );
};
