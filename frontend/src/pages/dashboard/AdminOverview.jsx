import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { adminApi } from '../../services/api';
import { 
  FaUsers, FaUserCheck, FaUserTimes, FaUserClock, FaUserShield, FaCogs, 
  FaShoppingCart, FaBox, FaBoxes, FaTools, FaUtensils, FaTruck, FaBullhorn, FaTicketAlt, FaChartLine
} from 'react-icons/fa';

export default function AdminOverview() {
  console.log('AdminOverview component rendering...');
  
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    pendingApprovals: 0,
    admins: 0,
    totalOrders: 0,
    totalProducts: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  // Debug: Log navigation object
  console.log('Navigation object:', { navigate: typeof navigate });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [usersRes, analyticsRes, ordersRes, productsRes] = await Promise.all([
          adminApi.getAllUsers({ limit: 1000 }),
          adminApi.getUserAnalytics(),
          adminApi.getAllOrders({ limit: 1 }),
          adminApi.getAllProducts({ limit: 1 })
        ]).catch(err => {
          console.warn('Some stats failed to load, falling back:', err);
          return [{}, {}, { data: { total: 0 } }, { data: { total: 0 } }];
        });

        const users = usersRes?.data?.users || [];
        const analytics = analyticsRes?.data || {};

        setStats({
          totalUsers: analytics.totalUsers || users.length,
          activeUsers: analytics.activeUsers || users.filter(u => !u.isDeactivated).length,
          inactiveUsers: analytics.deactivatedUsers || users.filter(u => u.isDeactivated).length,
          pendingApprovals: analytics.pendingApplications || 0,
          admins: analytics.roleCounts?.admin ?? users.filter(u => u.role === 'admin' || u.role === 'super_admin').length,
          totalOrders: ordersRes?.data?.total || ordersRes?.headers?.['x-total-count'] || 0,
          totalProducts: productsRes?.data?.total || productsRes?.headers?.['x-total-count'] || 0
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError('Failed to load some dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const handleCardClick = (path) => {
    console.log('handleCardClick called with path:', path);
    try {
      navigate(path);
      console.log('Navigation successful');
    } catch (error) {
      console.error('Navigation failed:', error);
    }
  };

  // Debug: Log when component mounts
  console.log('AdminOverview component mounted');

  const StatCard = ({ icon: Icon, title, value, path, search = '', bgColor, textColor, className = '', isQuickLink = false }) => {
    const targetPath = search ? `${path}${search}` : path;
    
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        navigate(targetPath);
      } catch (err) {
        window.location.href = targetPath;
      }
    };

    return (
      <div 
        className={`relative rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${bgColor} ${textColor} ${className} group ${isQuickLink ? 'min-h-[70px] md:min-h-[90px]' : 'min-h-[80px] md:min-h-[110px]'}`}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick(e)}
      >
        <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-5 transition-opacity" />
        <div className="p-3 md:p-5 h-full flex flex-col justify-between relative z-10">
          <div className="flex items-center justify-between w-full gap-2">
            <div className="min-w-0 flex-1">
              <p className={`font-bold uppercase tracking-wider truncate ${isQuickLink ? 'text-[9px]' : 'text-[10px] md:text-xs opacity-80'}`}>{title}</p>
              {!isQuickLink && (
                <p className="text-lg md:text-2xl font-black mt-0.5 md:mt-1 leading-none">{loading ? '...' : value}</p>
              )}
              {isQuickLink && (
                <p className="text-[10px] md:text-sm font-medium mt-0.5 opacity-70 truncate">Manage Module</p>
              )}
            </div>
            <div className={`shrink-0 rounded-lg bg-white bg-opacity-20 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${isQuickLink ? 'p-1.5 md:p-2' : 'p-2 md:p-3'}`}>
              <Icon className={`${isQuickLink ? 'w-4 h-4 md:w-5 md:h-5' : 'w-5 h-5 md:w-6 md:h-6'}`} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Admin Console</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time platform metrics and management shortcuts</p>
      </div>
      
      {error && (
        <div className="p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl">
          {error}
        </div>
      )}

      {/* Stats Section */}
      <section>
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">User Analytics</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            icon={FaUsers}
            title="Total Users"
            value={stats.totalUsers}
            path="/dashboard/user-management"
            bgColor="bg-blue-600"
            textColor="text-white"
          />
          <StatCard
            icon={FaUserCheck}
            title="Active"
            value={stats.activeUsers}
            path="/dashboard/user-management"
            search="?status=active"
            bgColor="bg-indigo-600"
            textColor="text-white"
          />
          <StatCard
            icon={FaUserClock}
            title="Pending"
            value={stats.pendingApprovals}
            path="/dashboard/users/role-applications"
            bgColor="bg-purple-600"
            textColor="text-white"
          />
          <StatCard
            icon={FaUserShield}
            title="Admins"
            value={stats.admins}
            path="/dashboard/user-management"
            search="?role=admin"
            bgColor="bg-rose-600"
            textColor="text-white"
          />
          <StatCard
            icon={FaUserTimes}
            title="Inactive"
            value={stats.inactiveUsers}
            path="/dashboard/user-management"
            search="?status=inactive"
            bgColor="bg-slate-600"
            textColor="text-white"
          />
        </div>
      </section>

      {/* Quick Links Section */}
      <section>
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Quick Management Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard
            icon={FaShoppingCart}
            title="Order Management"
            path="/dashboard/orders"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaBox}
            title="Product Directory"
            path="/dashboard/products"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaBoxes}
            title="Categories"
            path="/dashboard/categories"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaUtensils}
            title="FastFood Management"
            path="/dashboard/fastfood"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaTools}
            title="Services Directory"
            path="/dashboard/services"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaTruck}
            title="Logistics & Delivery"
            path="/dashboard/orders/requests"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaBullhorn}
            title="Marketing & Ads"
            path="/dashboard/marketing/hero-promotions"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaCogs}
            title="System Settings"
            path="/dashboard/settings/platform"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaTicketAlt}
            title="Support Tickets"
            path="/dashboard/support"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
          <StatCard
            icon={FaChartLine}
            title="Advanced Reports"
            path="/dashboard/analytics"
            bgColor="bg-white border border-gray-100"
            textColor="text-gray-800"
            isQuickLink={true}
          />
        </div>
      </section>
    </div>
  );
}
