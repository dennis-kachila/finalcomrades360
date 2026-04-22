import React, { useState, useEffect } from 'react';
import { useLocation, Link, Outlet } from 'react-router-dom';
import {
  FaBoxOpen, FaMotorcycle, FaMapMarkedAlt, FaCheckCircle,
  FaHistory, FaMoneyBillWave, FaBell, FaCog, FaHeadset, FaUser, FaWallet,
  FaBars, FaTimes
} from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getSocket, joinUserRoom } from '../../services/socket';
import { useToast } from '../../components/ui/use-toast';
import BottomNavbar from '../../components/layout/BottomNavbar';

const DeliveryAgentDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(false);
  const [isProfileComplete, setIsProfileComplete] = useState(true);
  const [missingFields, setMissingFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { toast } = useToast();
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const deliveryBottomNavItems = [
    { icon: <FaBoxOpen />, label: 'Available', path: '/delivery/available', end: true },
    { icon: <FaMotorcycle />, label: 'Tasks', path: '/delivery/orders' },
    { icon: <FaHistory />, label: 'History', path: '/delivery/logistics' },
    { icon: <FaUser />, label: 'Account', path: '/delivery/account' },
  ];

  useEffect(() => {
    fetchStatus();

    const socket = getSocket();
    if (user?.id) {
      joinUserRoom(user.id);
    }
    const handleSync = (data) => {
      console.log('🔔 Delivery agent real-time sync:', data);
      setLastUpdate(Date.now());
      if (data.label) {
        toast({ title: 'Real-time Update', description: `Update received: ${data.label}` });
      }
    };

    // New task available after auto-expiry + broadcast
    const handleNewTask = (data) => {
      console.log('📦 [AutoReassign] New task broadcast received:', data);
      setLastUpdate(Date.now());
      toast({
        title: '📦 New Order Available!',
        description: data.message || `Order #${data.orderNumber} is looking for a delivery agent. Check Available Orders now!`,
        duration: 8000,
      });
    };

    socket.on('orderStatusUpdate', handleSync);
    socket.on('deliveryRequestUpdate', handleSync);
    socket.on('handover:generated', handleSync);
    socket.on('handover:confirmed', handleSync);
    socket.on('new_task_available', handleNewTask);

    return () => {
      socket.off('orderStatusUpdate', handleSync);
      socket.off('deliveryRequestUpdate', handleSync);
      socket.off('handover:generated', handleSync);
      socket.off('handover:confirmed', handleSync);
      socket.off('new_task_available', handleNewTask);
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/delivery/profile');
      if (res.data) {
        setIsOnline(!!res.data.isActive);
        setIsProfileComplete(!!res.data.isComplete);
        setMissingFields(res.data.missingFields || []);
      }
    } catch (e) {
      console.error('Failed to fetch status', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async () => {
    if (!isProfileComplete) {
      alert(`Cannot go online. Your profile is incomplete. Missing: ${missingFields.join(', ')}`);
      return;
    }
    try {
      const newStatus = !isOnline;
      await api.put('/delivery/profile', { isActive: newStatus });
      setIsOnline(newStatus);
    } catch (e) {
      console.error('Failed to update status', e);
      alert('Failed to update online status. Please check your connection.');
    }
  };

  // Background Location Tracker Component
  const LocationTracker = ({ isOnline }) => {
    useEffect(() => {
      if (!isOnline) return;

      let watchId;
      const syncLocation = async (position) => {
        try {
          const { latitude: lat, longitude: lng } = position.coords;
          await api.patch('/delivery/profile/location', { lat, lng });
          console.debug('[GPS] Location synced:', lat, lng);
        } catch (err) {
          console.error('[GPS] Sync failed:', err);
        }
      };

      if ("geolocation" in navigator && !window._geoDenied) {
        watchId = navigator.geolocation.watchPosition(
          syncLocation,
          (err) => {
            if (err.code === 1) { // PERMISSION_DENIED
              window._geoDenied = true;
              console.warn('[GPS] Geolocation permission denied by user. Location syncing disabled.');
            } else {
              console.error('[GPS] Geolocation Error:', err.message);
            }
          },
          {
            enableHighAccuracy: false, // Better for battery/reliability here
            timeout: 10000,
            maximumAge: 30000
          }
        );
      }

      return () => {
        if (watchId) navigator.geolocation.clearWatch(watchId);
      };
    }, [isOnline]);

    return null;
  };

  const menuItems = [
    {
      name: 'Available Orders',
      path: '/delivery/available',
      icon: <FaBoxOpen className="lg:mr-3 text-gray-500" />,
      key: 'available'
    },
    {
      name: 'Active Assignments',
      path: '/delivery/orders',
      icon: <FaMotorcycle className="lg:mr-3 text-gray-500" />,
      key: 'orders'
    },
    {
      name: 'Live Map',
      path: '/delivery/map',
      icon: <FaMapMarkedAlt className="lg:mr-3 text-gray-500" />,
      key: 'map'
    },
    {
      name: 'Logistics & Earnings',
      path: '/delivery/logistics',
      icon: <FaHistory className="lg:mr-3 text-gray-500" />,
      key: 'logistics'
    },

    {
      name: 'Delivery Wallet',
      path: '/delivery/wallet',
      icon: <FaWallet className="lg:mr-3 text-gray-500" />,
      key: 'wallet'
    },
    {
      name: 'Notifications',
      path: '/delivery/notifications',
      icon: <FaBell className="lg:mr-3 text-gray-500" />,
      key: 'notifications'
    },
    {
      name: 'Settings',
      path: '/delivery/settings',
      icon: <FaCog className="lg:mr-3 text-gray-500" />,
      key: 'settings'
    },
    {
      name: 'Support',
      path: '/delivery/support',
      icon: <FaHeadset className="lg:mr-3 text-gray-500" />,
      key: 'support'
    },
    {
      name: 'My Account',
      path: '/delivery/account',
      icon: <FaUser className="lg:mr-3 text-gray-500" />,
      key: 'account'
    }
  ];

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden lg:h-screen bg-gray-50 relative min-h-screen">
      {/* Backdrop for mobile */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar - Desktop / Drawer - Mobile */}
      <div className={`fixed top-14 lg:top-16 inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-50 transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800 tracking-tight">Delivery Console</h2>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">Agent Portal</p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-full text-gray-400"
          >
            <FaTimes size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100 lg:block hidden">
          <div className={`flex items-center justify-between p-3 rounded-xl border shadow-inner transition-all ${isOnline ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100 opacity-80'}`}>
            <span className={`text-sm font-semibold ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
              {isOnline ? '● Online' : '○ Offline'}
            </span>
            <button
              onClick={toggleStatus}
              title={!isProfileComplete ? "Complete your profile to go online" : ""}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isOnline ? 'bg-green-500' : (isProfileComplete ? 'bg-gray-300' : 'bg-red-200 cursor-not-allowed')}`}
            >
              <span
                className={`${isOnline ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ease-in-out shadow-sm`}
              />
            </button>
          </div>

          {!isProfileComplete && !loading && (
            <Link to="/delivery/account" className="mt-3 block p-2 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 hover:bg-red-100 transition-colors">
              <span className="font-bold flex items-center gap-1">
                <FaCheckCircle className="rotate-180" /> Action Required:
              </span>
              Your profile is incomplete. Click here to update.
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto no-scrollbar lg:custom-scrollbar mt-2 bg-white/50">
          <ul className="flex flex-col space-y-1 px-3 pb-4">
            {menuItems.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 lg:py-2.5 lg:px-4 rounded-xl transition-all duration-200 text-[9px] lg:text-[15px] font-bold uppercase tracking-tight ${isActive(item.path)
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 scale-105 z-10'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'
                    }`}
                >
                  <span className="text-sm lg:text-base opacity-90 transition-colors">
                    {React.cloneElement(item.icon, { className: 'h-4 w-4 mr-0 text-current' })}
                  </span>
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200 bg-gray-50 lg:block hidden text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-black">
            Delivery v2.0
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-3 border-b border-gray-100 bg-white sticky top-14 z-30 shadow-sm">
          <div className="flex items-center gap-3">

            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              <h2 className="text-sm font-black text-gray-800 tracking-tight uppercase">Delivery Panel</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleStatus}
              className={`text-[9px] sm:text-[10px] font-black uppercase px-2 py-1 rounded transition-all ${isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 lg:h-full lg:overflow-y-auto bg-gray-50 relative custom-scrollbar pb-20 lg:pb-0">
          {!isOnline && !loading && (
            <div className="bg-amber-50 border-b border-amber-100 p-2 text-center text-[10px] md:text-xs text-amber-700 flex items-center justify-center gap-2 sticky top-0 z-10 shadow-sm backdrop-blur-sm bg-white/80">
              <span className="flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              You are <strong>Offline</strong>. No new requests will be received.
            </div>
          )}
          <div className="max-w-7xl mx-auto min-h-full">
            <LocationTracker isOnline={isOnline} />
            <div className="p-3 md:p-6 lg:p-8">
              {/* Page Header with Navigation Buttons */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Agent Console</h1>
                  <p className="text-sm text-gray-500">Manage your delivery tasks and earnings.</p>
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
                    onClick={() => window.location.href = '/'}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-gray-50 transition-all border border-gray-200"
                  >
                    <span>🏠</span>
                    <span>Exit Home</span>
                  </button>
                </div>
              </div>

              <Outlet context={{ fetchStatus, lastUpdate }} />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavbar 
        items={deliveryBottomNavItems} 
        onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} 
      />
    </div>
  );
};

export default DeliveryAgentDashboard;
