import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FaBars, FaTimes } from 'react-icons/fa';

export default function Customer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  // Check if user is fully verified for work with us access
  const userRoles = user?.roles || [user?.role];
  const isAdmin = userRoles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));
  const isVerified = isAdmin || (user?.emailVerified === true && user?.phoneVerified === true && user?.nationalIdStatus === 'approved');
  
  // Handle Work with Us click with verification check
  const handleWorkWithUsClick = (e) => {
    // Also close sidebar on mobile
    setIsSidebarOpen(false);

    // Allow admins to bypass
    if (isAdmin) {
      console.log('[Customer] Admin user - allowing Work with Us access');
      return;
    }

    // Check verification for non-admin users
    if (!isVerified) {
      console.log('[Customer] User not verified - redirecting to verification');
      e.preventDefault();
      navigate('/customer/account-verification');
    } else {
      console.log('[Customer] User verified - allowing Work with Us access');
    }
  };

  const menuItems = [
    { to: "/customer", label: "Overview", icon: "🏠", end: true },
    { to: "/customer/orders", label: "My Orders", icon: "📦" },
    { to: "/customer/returns", label: "My Returns", icon: "🔄" },
    { to: "/customer/wishlist", label: "Wishlist", icon: "❤️" },
    { to: "/customer/wallet", label: "Wallet", icon: "💰" },
    { to: "/customer/applications", label: "Applications", icon: "📄" },
    { to: "/customer/inquiries", label: "Support Inquiries", icon: "🎧" },
    { to: "/customer/settings", label: "Settings", icon: "⚙️" },
    { to: "/customer/work-with-us", label: "Work with Us", icon: "💼", color: "green", onClick: handleWorkWithUsClick },
  ];

  return (
    <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden lg:h-screen bg-gray-100 relative min-h-screen">
      {/* Backdrop for mobile */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar - Desktop / Drawer - Mobile */}
      <div className={`fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-50 transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-blue-900 tracking-tight">My Account</h2>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">Personal Dashboard</p>
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
            {menuItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={item.onClick || (() => setIsSidebarOpen(false))}
                  className={({ isActive }) => `flex items-center gap-2 px-4 py-2 lg:py-2.5 lg:px-4 rounded-xl transition-all duration-200 text-[9px] lg:text-[15px] font-bold uppercase tracking-tight ${isActive
                    ? item.color === 'green' ? 'bg-green-600 text-white shadow-lg shadow-green-100' : 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'
                    }`}
                >
                  <span className="text-sm lg:text-base opacity-90">{item.icon}</span>
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.label === "Work with Us" && !isVerified && (
                    <span className="ml-auto text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">Verify</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200 bg-gray-50 lg:block hidden text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-black">
            Comrades360+ v2.0
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Dynamic Content */}
        <main className="flex-1 lg:h-full lg:overflow-y-auto bg-gray-50 relative custom-scrollbar">
          <div className="max-w-6xl mx-auto w-full p-2 lg:p-8 min-h-full pb-20 lg:pb-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 min-h-full p-1 sm:p-4 lg:p-6">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
