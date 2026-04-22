import React from 'react';
import { NavLink } from 'react-router-dom';
import { FaBars } from 'react-icons/fa';

/**
 * Reusable Bottom Navigation Bar for Mobile Dashboards
 * @param {Array} items - Array of navigation items: { icon, label, path, onClick }
 * @param {Function} onMenuClick - Callback when the "Menu" button is clicked
 */
const BottomNavbar = ({ items = [], onMenuClick }) => {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 z-[45] px-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {items.map((item, index) => (
          <NavLink
            key={index}
            to={item.path}
            end={item.end}
            onClick={item.onClick}
            className={({ isActive }) => `flex flex-col items-center justify-center flex-1 h-full relative transition-all duration-200 ${
              isActive ? 'text-blue-600 scale-110' : 'text-gray-500 active:scale-95'
            }`}
          >
            <span className="text-xl mb-1">{item.icon}</span>
            <span className="text-[10px] font-bold uppercase tracking-tight truncate w-full text-center px-1">
              {item.label}
            </span>
            {/* Active Indicator */}
            <div className="indicator absolute top-0 w-8 h-1 rounded-b-full bg-blue-600 opacity-0 transition-opacity"></div>
          </NavLink>
        ))}

        {/* Menu Toggle for Sidebar */}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center flex-1 h-full text-gray-500 active:scale-95 transition-transform"
        >
          <FaBars className="text-xl mb-1" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Menu</span>
        </button>
      </div>
      
      {/* Dynamic Active Indicator Style */}
      <style dangerouslySetInnerHTML={{ __html: `
        .active .indicator { opacity: 1 !important; }
      `}} />
    </div>
  );
};

export default BottomNavbar;
