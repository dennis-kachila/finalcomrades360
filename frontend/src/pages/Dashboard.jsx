import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/dashboard/Sidebar';
import BottomNavbar from '../components/layout/BottomNavbar';
import { FaBars, FaHome, FaShoppingCart, FaUsers, FaBox, FaTimes } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();

  // Hide sidebar for marketers
  const shouldShowSidebar = user?.role !== 'marketer';

  const bottomNavItems = [
    { icon: <FaHome />, label: 'Home', path: '/dashboard', end: true },
    { icon: <FaShoppingCart />, label: 'Orders', path: '/dashboard/orders' },
    { icon: <FaUsers />, label: 'Users', path: '/dashboard/users' },
    { icon: <FaBox />, label: 'Products', path: '/dashboard/products' },
  ];

  return (
    <div className="min-h-screen pt-14 lg:pt-0 lg:fixed lg:inset-0 lg:top-16 flex flex-col lg:flex-row bg-gray-100 lg:overflow-hidden z-0">
      {/* Sidebar - Desktop / Drawer - Mobile */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      <div className={`fixed top-14 lg:top-16 inset-x-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-40 transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} bottom-0`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-blue-900 tracking-tight">Admin Console</h2>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">
              {user?.role?.replace(/_/g, ' ') || 'Dashboard'}
            </p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-full text-gray-400"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <Sidebar onClose={() => setIsSidebarOpen(false)} />
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 lg:block hidden text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-black">
            Comrades360+ v2.0
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:ml-64">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-3 border-b border-gray-100 bg-white sticky top-14 z-30 shadow-sm">
          <div className="flex items-center gap-3">

            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></div>
              <h2 className="text-sm font-black text-gray-800 tracking-tight uppercase">Admin Panel</h2>
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 flex flex-col bg-gray-50 relative custom-scrollbar pb-24 lg:pb-0 lg:overflow-y-auto lg:min-h-0">
          <div className="w-full p-0 lg:p-4 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavbar 
        items={bottomNavItems} 
        onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} 
      />
    </div>
  );
};

export default Dashboard;

