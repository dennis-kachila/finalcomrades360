import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  FaTachometerAlt,
  FaCalendarAlt,
  FaMoneyBillWave,
  FaClipboardList,
  FaUserCog,
  FaCog,
  FaUsers,
  FaStar,
  FaWallet,
  FaRegCalendarAlt,
  FaBars,
  FaTimes,
  FaHome
} from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import BottomNavbar from '../../components/layout/BottomNavbar';

const ServiceProviderDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const serviceProviderBottomNavItems = [
    { icon: <FaHome />, label: 'Home', path: '/dashboard/service-provider', end: true },
    { icon: <FaClipboardList />, label: 'Services', path: '/dashboard/services/my' },
    { icon: <FaCalendarAlt />, label: 'Bookings', path: '/dashboard/service-provider/booking-list' },
    { icon: <FaWallet />, label: 'Wallet', path: '/dashboard/service-provider/wallet' },
  ];

  const menuItems = [
    { id: 'create-service', icon: <FaUserCog />, label: 'Create Service', path: '/dashboard/services/create' },
    { id: 'my-services', icon: <FaClipboardList />, label: 'My Services', path: '/dashboard/services/my' },
    { id: 'booking-list', icon: <FaCalendarAlt />, label: 'Booking List', path: '/dashboard/service-provider/booking-list' },
    { id: 'messages', icon: <FaUsers />, label: 'Messages', path: '/dashboard/service-provider/messages' },
    { id: 'reviews', icon: <FaStar />, label: 'Reviews', path: '/dashboard/services/reviews' },
    { id: 'revenue', icon: <FaMoneyBillWave />, label: 'Revenue', path: '/dashboard/service-provider/revenue' },
    { id: 'wallet', icon: <FaWallet />, label: 'Service Wallet', path: '/dashboard/service-provider/wallet' },
  ];

  return (
    <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden lg:h-screen bg-gray-100 relative min-h-screen">
      {/* Backdrop for mobile */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar - Desktop / Drawer - Mobile */}
      <div className={`fixed top-14 lg:top-16 inset-x-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-50 transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} bottom-0`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-blue-900 tracking-tight">Service Panel</h2>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">{user?.name || 'Provider'}</p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-full text-gray-400"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto no-scrollbar lg:custom-scrollbar mt-2">
          <ul className="flex flex-col space-y-1 px-3 pb-4">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    onClick={() => {
                      setActiveMenu(item.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 lg:py-2.5 lg:px-4 rounded-xl transition-all duration-200 text-[9px] lg:text-[15px] font-bold uppercase tracking-tight ${isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 scale-105 z-10'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'
                      }`}
                  >
                    <span className="text-sm lg:text-base opacity-90">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200 bg-gray-50 lg:block hidden text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-black">
            Service Portal v2.0
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-3 border-b border-gray-100 bg-white sticky top-14 z-30 shadow-sm">
          <div className="flex items-center gap-3">

            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></div>
              <h2 className="text-sm font-black text-gray-800 tracking-tight uppercase">Service Panel</h2>
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 lg:h-full lg:overflow-y-auto bg-gray-50 relative custom-scrollbar pb-20 lg:pb-0">
          <div className="w-full p-2 lg:p-4 min-h-full">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 min-h-full">
              <div className="p-2 sm:p-6 lg:p-8">
                {/* Page Header with Navigation Buttons */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">Provider Console</h1>
                    <p className="text-sm text-gray-500">Manage your services and customer bookings.</p>
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
                      onClick={() => navigate('/')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <span>🏠</span>
                      <span>Exit Home</span>
                    </button>
                  </div>
                </div>

                <Outlet />
                {location.pathname === '/dashboard/service-provider' && (
                  <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">Welcome to your Dashboard</h3>
                    <p className="text-gray-500 text-sm">Select a menu item to manage your services and bookings</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavbar 
        items={serviceProviderBottomNavItems} 
        onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} 
      />
      <style dangerouslySetInnerHTML={{
        __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}} />
    </div>
  );
};

export default ServiceProviderDashboard;
