import React, { useContext, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaTachometerAlt,
  FaUsers,
  FaBox,
  FaShoppingCart,
  FaBullhorn,
  FaTruck,
  FaMoneyBillWave,
  FaUserTie,
  FaCog,
  FaChartBar,
  FaTicketAlt,
  FaUser,
  FaStore,
  FaShieldAlt,
  FaChartLine,
  FaTruckLoading,
  FaMoneyBill,
  FaCubes,
  FaClipboardList,
  FaFileAlt,
  FaHandshake,
  FaAward,
  FaTools,
  FaLock,
  FaHeadset,
  FaTimes,
  FaMapMarkerAlt,
  FaBoxes,
  FaUtensils,
  FaUndo,
  FaPlus,
  FaComments
} from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';

// Admin menu items with enhanced structure
const adminMenuItems = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: <FaTachometerAlt className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin']
  },
  {
    name: 'Order Management',
    path: '/dashboard/orders',
    icon: <FaShoppingCart className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin', 'logistics_manager', 'delivery_agent'],
    children: [
      { name: 'All Orders', path: '/dashboard/orders', icon: <FaShoppingCart className="mr-2" /> },
      { name: 'Direct Orders', path: '/dashboard/direct-orders', icon: <FaPlus className="mr-2" /> },
      { name: 'Return Requests', path: '/dashboard/orders/returns', icon: <FaUndo className="mr-2" /> },
      { name: 'My Sales Management', path: '/dashboard/orders/my-sales', icon: <FaMoneyBillWave className="mr-2" /> },
      { name: 'Order Analytics', path: '/dashboard/orders/analytics', icon: <FaChartLine className="mr-2" /> }
    ]
  },
  {
    name: 'User Management',
    path: '/dashboard/users',
    icon: <FaUsers className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin'],
    children: [
      { name: 'All Users', path: '/dashboard/users', icon: <FaUsers className="mr-2" /> },
      { name: 'Role Applications', path: '/dashboard/users/role-applications', icon: <FaFileAlt className="mr-2" /> },
      { name: 'ID Verifications', path: '/dashboard/users/verifications', icon: <FaShieldAlt className="mr-2" /> },
      { name: 'Job Openings', path: '/dashboard/users/job-openings', icon: <FaUserTie className="mr-2" /> }
    ]
  },
  {
    name: 'Product Management',
    path: '/dashboard/product-management',
    icon: <FaBox className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin'],
    children: [
      { name: 'Management Overview', path: '/dashboard/product-management', icon: <FaTachometerAlt className="mr-2" /> },
      { name: 'On-Behalf Creation', path: '/dashboard/on-behalf-creation', icon: <FaPlus className="mr-2" /> },
      { name: 'Product Directory', path: '/dashboard/products', icon: <FaBox className="mr-2" /> },
      { name: 'Categories', path: '/dashboard/categories', icon: <FaBoxes className="mr-2" /> },
      { name: 'FastFood', path: '/dashboard/fastfood', icon: <FaUtensils className="mr-2" /> },
      { name: 'Services', path: '/dashboard/services', icon: <FaTools className="mr-2" /> },
      { name: 'Deletion Requests', path: '/dashboard/products/deletion-requests', icon: <FaTimes className="mr-2" /> },
      { name: 'Recycle Bin', path: '/dashboard/products/recycle-bin', icon: <FaClipboardList className="mr-2" /> }
    ]
  },
  {
    name: 'Delivery & Logistics',
    path: '/dashboard/delivery',
    icon: <FaTruck className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin', 'logistics_manager', 'delivery_agent', 'warehouse_manager', 'pickup_station_manager'],
    children: [
      { name: 'Delivery Requests', path: '/dashboard/orders/requests', icon: <FaClipboardList className="mr-2" /> },
      { name: 'Active Assignments', path: '/dashboard/orders/assignments', icon: <FaTruckLoading className="mr-2" /> },
      { name: 'Global Live Map', path: '/dashboard/delivery/live-map', icon: <FaMapMarkerAlt className="mr-2" /> },
      { name: 'Warehouse Management', path: '/dashboard/delivery/warehouses', icon: <FaStore className="mr-2" /> },
      { name: 'Pickup Stations', path: '/dashboard/delivery/pickup-stations', icon: <FaMapMarkerAlt className="mr-2" /> },
      { name: 'Fastfood Pickup Points', path: '/dashboard/fastfood/pickup-points', icon: <FaUtensils className="mr-2" /> },
      { name: 'Delivery Agents', path: '/dashboard/users/delivery-agents', icon: <FaTruck className="mr-2" /> },
      { name: 'Delivery Settings', path: '/dashboard/delivery/settings', icon: <FaTools className="mr-2" /> },
      { name: 'Auditing & Payouts', path: '/dashboard/delivery/auditing', icon: <FaMoneyBill className="mr-2" />, roles: ['admin', 'superadmin', 'super_admin', 'finance_manager'] }
    ]
  },
  {
    name: 'Finance Management',
    path: '/dashboard/finance',
    icon: <FaMoneyBillWave className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin', 'finance_manager'],
    children: [
      { name: 'Finance Dashboard', path: '/dashboard/finance/dashboard', icon: <FaTachometerAlt className="mr-2" /> },
      { name: 'Commissions', path: '/dashboard/finance/commissions', icon: <FaHandshake className="mr-2" /> },
      { name: 'Referrals', path: '/dashboard/finance/referrals', icon: <FaAward className="mr-2" /> },
      { name: 'Financial Reports', path: '/dashboard/finance/reports', icon: <FaChartLine className="mr-2" /> },
      { name: 'System Revenue', path: '/dashboard/finance/revenue', icon: <FaMoneyBillWave className="mr-2" /> },
      { name: 'Pending Payouts', path: '/dashboard/finance/payouts', icon: <FaMoneyBill className="mr-2" /> }
    ]
  },
  {
    name: 'Marketing & Promotions',
    path: '/dashboard/marketing',
    icon: <FaBullhorn className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin', 'marketer'],
    children: [
      { name: 'Marketers', path: '/dashboard/users/marketers', icon: <FaBullhorn className="mr-2" /> },
      { name: 'Product Promo Requests', path: '/dashboard/marketing/hero-promotions', icon: <FaAward className="mr-2" /> },
      { name: 'FastFood Promo Requests', path: '/dashboard/marketing/fastfood-promotions', icon: <FaUtensils className="mr-2" /> },
      { name: 'Daily Thank You Messages', path: '/dashboard/marketing/thank-you', icon: <FaComments className="mr-2" /> },
      { name: 'Create Promotion', path: '/dashboard/marketing/hero-promotions/create', icon: <FaPlus className="mr-2" /> },
      { name: 'FastFood Banner Config', path: '/dashboard/fastfood/hero-settings', icon: <FaUtensils className="mr-2" /> }
    ]
  },
  {
    name: 'Reports & Analytics',
    path: '/dashboard/analytics',
    icon: <FaChartBar className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin', 'marketer', 'finance_manager'],
    children: [
      { name: 'Platform Analytics', path: '/dashboard/analytics', icon: <FaChartBar className="mr-2" /> },
      { name: 'Business Intelligence', path: '/dashboard/analytics/business', icon: <FaChartLine className="mr-2" /> },
      { name: 'Custom Reports', path: '/dashboard/analytics/custom', icon: <FaFileAlt className="mr-2" /> },
      { name: 'Advanced Reports', path: '/dashboard/analytics/advanced', icon: <FaFileAlt className="mr-2" /> }
    ]
  },
  {
    name: 'System Settings',
    path: '/dashboard/settings',
    icon: <FaCog className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin'],
    children: [
      { name: 'Platform Settings', path: '/dashboard/settings/platform', icon: <FaTools className="mr-2" /> },
      { name: 'App Content', path: '/dashboard/settings/app-content', icon: <FaFileAlt className="mr-2" /> },
      { name: 'Security Settings', path: '/dashboard/settings/security', icon: <FaLock className="mr-2" />, roles: ['super_admin'] }
    ]
  },
  {
    name: 'Support & Tickets',
    path: '/dashboard/support',
    icon: <FaTicketAlt className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin', 'support', 'ops_manager'],
    children: [
      { name: 'Support Tickets', path: '/dashboard/support', icon: <FaTicketAlt className="mr-2" /> },
      { name: 'Contact Messages', path: '/dashboard/contact-messages', icon: <FaHeadset className="mr-2" /> },
      { name: 'Customer Service', path: '/dashboard/support/service', icon: <FaHeadset className="mr-2" /> }
    ]
  },
  {
    name: 'Role-Based Dashboards',
    path: '/dashboard/other-dashboards',
    icon: <FaCubes className="mr-3" />,
    roles: ['superadmin', 'super_admin'],
    children: [
      { name: 'Delivery Dashboard', path: '/delivery/orders', icon: <FaTruck className="mr-2" /> },
      { name: 'Service Provider', path: '/dashboard/service-provider', icon: <FaUserTie className="mr-2" /> },
      { name: 'Seller Dashboard', path: '/seller', icon: <FaStore className="mr-2" /> },
      { name: 'Customer Dashboard', path: '/customer', icon: <FaUser className="mr-2" /> },
      { name: 'Marketer Dashboard', path: '/marketing', icon: <FaBullhorn className="mr-2" /> },
      { name: 'Operations Dashboard', path: '/ops', icon: <FaCubes className="mr-2" /> },
      { name: 'Logistics Dashboard', path: '/logistics', icon: <FaTruckLoading className="mr-2" /> },
      { name: 'Finance Dashboard', path: '/finance', icon: <FaMoneyBillWave className="mr-2" /> }
    ]
  },
  {
    name: 'Notifications & Alerts',
    path: '/notifications',
    icon: <FaBullhorn className="mr-3" />,
    roles: ['admin', 'superadmin', 'super_admin', 'logistics_manager', 'delivery_agent', 'finance_manager', 'marketer', 'support', 'ops_manager']
  },
];

// Seller menu items are now in the dedicated Seller component

// Customer menu items
const customerMenuItems = [
  {
    name: 'My Profile',
    path: '/customer',
    icon: <FaUser className="mr-3" />,
    roles: ['customer']
  },
  {
    name: 'My Orders',
    path: '/customer/orders',
    icon: <FaClipboardList className="mr-3" />,
    roles: ['customer']
  },
  {
    name: 'My Returns',
    path: '/customer/returns',
    icon: <FaUndo className="mr-3" />,
    roles: ['customer']
  },
  {
    name: 'Wishlist',
    path: '/customer/wishlist',
    icon: <FaStore className="mr-3" />,
    roles: ['customer']
  },
  {
    name: 'Wallet',
    path: '/customer/wallet',
    icon: <FaMoneyBill className="mr-3" />,
    roles: ['customer']
  },
  {
    name: 'Work with Comrades360',
    path: '/work-with-us', // Will be overridden dynamically based on verification
    icon: <FaUserTie className="mr-3" />,
    roles: ['customer']
  },
  {
    name: 'Support Center',
    path: '/customer/support-center',
    icon: <FaHeadset className="mr-3" />,
    roles: ['customer'],
    children: [
      { name: 'Support Inquiries', path: '/customer/inquiries', icon: <FaTicketAlt size={14} className="mr-2" /> },
      { name: 'Live Chat & Messages', path: '/customer/support', icon: <FaComments size={14} className="mr-2" /> }
    ]
  },
  {
    name: 'Notifications & Alerts',
    path: '/notifications',
    icon: <FaBullhorn className="mr-3" />,
    roles: ['customer']
  }
];

const Sidebar = ({ onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRoles = React.useMemo(() => {
    return Array.isArray(user?.roles) ? user.roles : [user?.role || 'customer'];
  }, [user]);

  const [expandedItems, setExpandedItems] = useState(new Set());
  const productManagementClickRef = useRef({ lastClick: 0, timeout: null });

  // Toggle expanded state for menu items with children
  const toggleExpanded = (itemName) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  };

  // Handle double-click for Product Management
  const handleProductManagementClick = () => {
    const now = Date.now();
    const lastClick = productManagementClickRef.current.lastClick;

    if (productManagementClickRef.current.timeout) {
      clearTimeout(productManagementClickRef.current.timeout);
    }

    if (now - lastClick < 300) {
      navigate('/dashboard/product-management?view=cards');
      productManagementClickRef.current.lastClick = 0;
      return;
    }

    productManagementClickRef.current.timeout = setTimeout(() => {
      toggleExpanded('Product Management');
      productManagementClickRef.current.lastClick = 0;
    }, 300);

    productManagementClickRef.current.lastClick = now;
  };

  // Filter menu items based on user roles
  const getMenuItems = () => {
    let items = [];
    const isAdmin = userRoles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));

    if (isAdmin) {
      return adminMenuItems.filter(item =>
        item.roles.some(role => ['admin', 'superadmin', 'super_admin'].includes(role))
      );
    }

    if (userRoles.includes('logistics_manager') || userRoles.includes('delivery_agent') || userRoles.includes('warehouse_manager') || userRoles.includes('pickup_station_manager')) {
      if (!isAdmin && user.isDeliverySuspended) {
        return adminMenuItems.filter(item => item.name === 'Notifications & Alerts');
      }
      return adminMenuItems.filter(item =>
        item.name === 'Order Management' || item.name === 'Delivery & Logistics' || item.name === 'Notifications & Alerts'
      );
    }

    if (userRoles.includes('finance_manager')) {
      return adminMenuItems.filter(item =>
        item.name === 'Notifications & Alerts' ||
        item.roles?.includes('finance_manager') ||
        item.children?.some(c => c.roles?.includes('finance_manager'))
      );
    }

    if (userRoles.includes('marketer')) {
      if (!isAdmin && user.isMarketerSuspended) {
        return adminMenuItems.filter(item => item.name === 'Notifications & Alerts');
      }
      return adminMenuItems.filter(item => item.name === 'Notifications & Alerts' || item.roles.includes('marketer'));
    }

    if (userRoles.includes('support')) {
      return adminMenuItems.filter(item => item.name === 'Notifications & Alerts' || item.roles.includes('support'));
    }

    if (userRoles.includes('customer')) {
      return customerMenuItems.map(item => {
        if (item.name === 'Work with Comrades360' &&
          (!user?.emailVerified || !user?.phoneVerified || user?.nationalIdStatus !== 'approved')) {
          return { ...item, path: '/customer/account-verification' };
        }
        return item;
      });
    }

    return items;
  };

  const menuItems = getMenuItems();

  return (
    <nav className="h-full">
      <ul className="flex flex-col space-y-1 px-3 py-4 items-stretch">
        {menuItems.map((item) => {
          const isExactActive = location.pathname === item.path;
          const isChildActive = item.children && item.children.some(child => 
            location.pathname === child.path || (child.path !== '/' && location.pathname.startsWith(child.path + '/'))
          );
          const isAnyActive = isExactActive || isChildActive;

          return (
            <li key={item.name} className="flex-shrink-0 lg:flex-shrink-1">
              {item.children ? (
                <div className="relative group">
                  <button
                    onClick={() => {
                      item.name === 'Product Management' ? handleProductManagementClick() : toggleExpanded(item.name);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 lg:py-2.5 lg:px-4 rounded-xl transition-all duration-200 text-sm lg:text-[14px] font-semibold tracking-tight w-full text-left ${isExactActive 
                      ? 'text-blue-600 bg-blue-50/50 z-10'
                      : isChildActive
                        ? 'text-gray-900 bg-gray-50/50'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                      }`}
                  >
                    <span className={`text-sm lg:text-lg transition-colors ${isAnyActive ? 'text-blue-600' : 'opacity-80'}`}>{item.icon}</span>
                    <span className="inline">{item.name}</span>
                    <svg
                      className={`hidden lg:block w-3.5 h-3.5 ml-auto transition-transform ${expandedItems.has(item.name) ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Sub-menu items (Visible when expanded) */}
                  {expandedItems.has(item.name) && (
                    <ul className="ml-6 mt-1 border-l-2 border-gray-100 pl-2 space-y-1">
                      {item.children
                        .filter((child) => !child.roles || child.roles.some((role) => userRoles.includes(role)))
                        .map((child) => {
                          const isChildExactActive = location.pathname === child.path;
                          return (
                            <li key={child.path}>
                              <Link
                                to={child.path}
                                onClick={() => {
                                  if (onClose) onClose();
                                }}
                                className={`flex items-center py-2 px-3 rounded-lg text-xs lg:text-[13px] font-medium transition-all ${isChildExactActive
                                  ? 'text-blue-600 bg-blue-50/30'
                                  : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                                  }`}
                              >
                                <span className={`mr-2 transition-colors ${isChildExactActive ? 'text-blue-600' : 'opacity-70'}`}>{child.icon}</span>
                                {child.name}
                              </Link>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              ) : (
                <Link
                  to={item.path}
                  onClick={onClose}
                  className={`flex items-center gap-2 px-4 py-2 lg:py-2.5 lg:px-4 rounded-xl transition-all duration-200 text-sm lg:text-[14px] font-semibold tracking-tight ${isExactActive
                    ? 'text-blue-600 bg-blue-50/50 z-10'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                    }`}
                >
                  <span className={`text-sm lg:text-lg transition-colors ${isExactActive ? 'text-blue-600' : 'opacity-80'}`}>{item.icon}</span>
                  <span className="inline text-center">{item.name}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <style dangerouslySetInnerHTML={{
        __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { bg-transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}} />
    </nav>
  );
};

export default Sidebar;
