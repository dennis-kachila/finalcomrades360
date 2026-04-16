import { useEffect } from 'react';

/**
 * useRealtimeSync Hook
 * 
 * Allows any component to register for real-time data updates.
 * When a WebSocket event matching the scope is received, the provided
 * refresh callback is triggered.
 * 
 * @param {string|string[]} scopes - The scope(s) to listen for (e.g., 'orders', 'platform_settings')
 * @param {function} onRefresh - The callback to execute when an update occurs
 */
const useRealtimeSync = (scopes, onRefresh) => {
  useEffect(() => {
    if (!onRefresh) return;

    const normalizedScopes = Array.isArray(scopes) ? scopes : [scopes];

    const handleDataUpdate = (event) => {
      const { scope } = event.detail;
      
      // If the incoming update matches one of our scopes, or if it's a global 'system' update
      if (normalizedScopes.includes(scope) || scope === 'system') {
        console.log(`[useRealtimeSync] Match found for scope: ${scope}. Triggering refresh.`);
        onRefresh();
      }
    };

    window.addEventListener('realtime:data-updated', handleDataUpdate);
    
    // Also listen for maintenance settings specifically
    if (normalizedScopes.includes('platform_settings') || normalizedScopes.includes('maintenance')) {
        window.addEventListener('maintenance-settings-updated', onRefresh);
    }

    return () => {
      window.removeEventListener('realtime:data-updated', handleDataUpdate);
      window.removeEventListener('maintenance-settings-updated', onRefresh);
    };
  }, [scopes, onRefresh]);
};

export default useRealtimeSync;
