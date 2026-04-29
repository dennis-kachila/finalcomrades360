import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getSocket, joinUserRoom, joinAdminRoom } from '../services/socket';

// Scope to query keys mapping - only invalidate relevant caches
const SCOPE_TO_KEYS = {
  orders: ['orders', 'my-orders', 'order-details'],
  payments: ['payments', 'payment-history', 'order-details'],
  products: ['products', 'product-details', 'search'],
  inventory: ['inventory', 'stock', 'reservations'],
  cart: ['cart'],
  wishlist: ['wishlist'],
  notifications: ['notifications', 'unread-count'],
  users: ['users', 'profiles'],
  delivery: ['delivery', 'delivery-tasks'],
  marketing: ['marketing', 'analytics', 'commissions'],
  categories: ['categories', 'subcategories'],
  services: ['services', 'service-details'],
  fastfood: ['fastfood', 'fastfood-details'],
  verification: ['verification-status', 'pending-verifications'],
  'role-applications': ['role-applications'],
  'role-management': ['roles'],
  admin: ['admin-stats', 'admin-overview'],
};

// Global real-time bridge with SELECTIVE invalidation:
// - ensures socket room joins
// - converts server socket events to browser events pages can subscribe to
// - invalidates only related cache entries (not global)
export default function RealtimeSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Note: We NOT return early if !user?.id anymore, 
    // because guests also need maintenance updates.
    
    const socket = getSocket();

    // Only join private rooms if logged in
    if (user?.id) {
      joinUserRoom(user.id);

      if (['admin', 'superadmin', 'super_admin'].includes(user.role)) {
        joinAdminRoom();
      }
    }

    let invalidateTimer = null;

    const selectiveInvalidate = (scope) => {
      // Clear existing timer
      clearTimeout(invalidateTimer);

      // Debounce invalidation to avoid rapid bursts
      invalidateTimer = setTimeout(() => {
        const keysToInvalidate = SCOPE_TO_KEYS[scope] || [scope];
        console.log(`[RealtimeSync] Invalidating cache for scope: ${scope}`, keysToInvalidate);

        // Only invalidate queries related to this scope
        keysToInvalidate.forEach(key => {
          queryClient.invalidateQueries({
            queryKey: [key],
            exact: false // Also invalidate derived queries
          });
        });
      }, 300); // Slightly longer debounce for batch updates
    };

    const relay = (eventName, scope) => (payload) => {
      window.dispatchEvent(new CustomEvent('realtime:data-updated', {
        detail: { eventName, payload, scope }
      }));

      // Selectively invalidate based on scope
      selectiveInvalidate(scope || eventName);
    };

    const onOrderStatus = relay('orderStatusUpdate', 'orders');
    const onRealtimeUpdate = (payload) => {
      const scope = payload?.scope || 'system';
      
      // Special Handling for Maintenance Updates
      if (scope === 'maintenance' && payload.settings) {
        console.log('[RealtimeSync] Maintenance settings updated via socket:', payload.settings);
        localStorage.setItem('maintenance_settings', JSON.stringify(payload.settings));
        window.dispatchEvent(new CustomEvent('maintenance-settings-updated', { detail: payload.settings }));
      }

      relay('realtime:update', scope)(payload);
    };
    const onPaymentStatus = relay('paymentStatusUpdate', 'payments');
    const onInventoryReservation = relay('inventory:reservation', 'inventory');
    const onRefundStatus = relay('refund:status', 'payments');
    const onDisputeStatus = relay('dispute:status', 'payments');
    const onNotification = relay('notification', 'notifications');
    const onNotificationNew = relay('notification:new', 'notifications');

    socket.on('orderStatusUpdate', onOrderStatus);
    socket.on('realtime:update', onRealtimeUpdate);
    socket.on('paymentStatusUpdate', onPaymentStatus);
    socket.on('inventory:reservation', onInventoryReservation);
    socket.on('refund:status', onRefundStatus);
    socket.on('dispute:status', onDisputeStatus);
    socket.on('notification', onNotification);
    socket.on('notification:new', onNotificationNew);

    return () => {
      clearTimeout(invalidateTimer);
      socket.off('orderStatusUpdate', onOrderStatus);
      socket.off('realtime:update', onRealtimeUpdate);
      socket.off('paymentStatusUpdate', onPaymentStatus);
      socket.off('inventory:reservation', onInventoryReservation);
      socket.off('refund:status', onRefundStatus);
      socket.off('dispute:status', onDisputeStatus);
      socket.off('notification', onNotification);
      socket.off('notification:new', onNotificationNew);
    };
  }, [user?.id, user?.role, queryClient]);

  return null;
}
