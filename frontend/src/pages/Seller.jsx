import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { FaBars, FaTimes, FaChevronDown } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import BottomNavbar from '../components/layout/BottomNavbar'

export default function Seller() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [marketingOpen, setMarketingOpen] = useState(false)
  
  const sellerBottomNavItems = [
    { icon: '🏠', label: 'Home', path: '/seller', end: true },
    { icon: '📦', label: 'Products', path: '/seller/products' },
    { icon: '➕', label: 'Add', path: '/seller/products/add' },
    { icon: '🛒', label: 'Orders', path: '/seller/orders' },
  ];
  
  const logout = () => { localStorage.removeItem('token'); window.location.href = '/login' }

  const menuItems = [
    { to: "/seller", label: "Overview", icon: "🏠" },
    { to: "/seller/products/add", label: "Add Product", icon: "➕" },
    { to: "/seller/fast-food/new", label: "ADD MEALS", icon: "🔥", color: "orange" },
    { to: "/seller/products", label: "Products", icon: "📦" },
    { to: "/seller/inventory", label: "Inventory", icon: "📋" },
    { to: "/seller/fast-food", label: "My Meals", icon: "🍲", color: "orange" },
    { to: "/seller/orders", label: "Orders", icon: "🛒" },
    { to: "/seller/business-location", label: "Location", icon: "📍" },
    { to: "/seller/wallet", label: "Wallet", icon: "💰" },
    { to: "/seller/reports", label: "Reports", icon: "📊" },
    { to: "/seller/recycle-bin", label: "Recycle Bin", icon: "🗑️" },
    { to: "/seller/help", label: "Help", icon: "❓" },
  ];

  // Marketing & Promotions dropdown items
  const marketingItems = [
    { to: "/seller/promotions", label: "Hero Promotions", icon: "⭐" },
    { to: "/seller/fastfood-promotions", label: "FastFood Promotions", icon: "🍔", color: "orange" },
    { to: "/marketing", label: "Marketing Hub", icon: "📢" },
  ];

  const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin') || user?.role === 'superadmin' || user?.roles?.includes('superadmin');

  const isMarketingActive = marketingItems.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));

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
            <h2 className="text-xl font-extrabold text-blue-900 tracking-tight">Seller Console</h2>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">Manage your business</p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-full text-gray-400"
          >
            <FaTimes size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar lg:custom-scrollbar mt-2">
          <ul className="flex flex-col space-y-1 px-3 pb-4">
            {menuItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/seller"}
                  onClick={() => setIsSidebarOpen(false)}
                  className={({ isActive }) => `flex items-center gap-2 px-4 py-2 lg:py-2.5 lg:px-4 rounded-xl transition-all duration-200 text-[9px] lg:text-[15px] font-bold uppercase tracking-tight ${isActive
                    ? item.color === 'orange' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'
                    }`}
                >
                  <span className="text-sm lg:text-base opacity-90">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}

            {/* Marketing & Promotions — collapsible dropdown */}
            <li>
              <button
                onClick={() => setMarketingOpen(prev => !prev)}
                className={`w-full flex items-center gap-2 px-4 py-2 lg:py-2.5 rounded-xl transition-all duration-200 text-[9px] lg:text-[15px] font-bold uppercase tracking-tight ${isMarketingActive
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-100'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-purple-600'
                }`}
              >
                <span className="text-sm lg:text-base opacity-90">📣</span>
                <span className="flex-1 text-left">Marketing</span>
                <FaChevronDown
                  size={10}
                  className={`transition-transform duration-200 ${marketingOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Sub-items */}
              {marketingOpen && (
                <ul className="ml-5 mt-1 border-l-2 border-purple-100 pl-2 space-y-1">
                  {marketingItems.map(item => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={() => setIsSidebarOpen(false)}
                        className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[9px] lg:text-xs font-semibold uppercase tracking-tight ${isActive
                          ? 'bg-purple-50 text-purple-800 font-bold'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className="opacity-80">{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200 bg-gray-50 lg:block hidden text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-black">
            Seller Portal v2.0
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-3 border-b border-gray-100 bg-white sticky top-14 z-30 shadow-sm">
          <div className="flex items-center gap-3">

            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/seller')}>
              <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></div>
              <h2 className="text-sm font-black text-gray-800 tracking-tight uppercase">Seller Panel</h2>
            </div>
          </div>

        </header>

        {/* Dynamic Content */}
        <main className="flex-1 lg:h-full lg:overflow-y-auto bg-gray-50 relative custom-scrollbar pb-20 lg:pb-0">
          <div className="w-full p-0 lg:p-4 min-h-full">
            <div className="bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-gray-100 min-h-full p-0 lg:p-4">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavbar 
        items={sellerBottomNavItems} 
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
}
