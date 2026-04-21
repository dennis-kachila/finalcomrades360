import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './ui/LoadingSpinner';
import { isSellerProfileComplete } from '../utils/sellerUtils';

const ProtectedRoute = ({ children, requiredRole }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!user) {
        // Redirect station users to a specialized login page
        const loginPath = location.pathname.startsWith('/station') ? '/station/login' : '/login';
        
        // Redirect them to the /login page (or specialized page), but save the current 
        // location they were trying to go to when they were redirected.
        return <Navigate to={loginPath} state={{ from: location }} replace />;
    }

    const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const userRole = normalize(user.role || '');
    const userRoles = Array.isArray(user.roles) ? user.roles.map(normalize) : [userRole];
    const isAdmin = userRoles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));

    if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        const normalizedRequired = roles.map(normalize);

        // Check if user has one of the required roles in their roles array
        const hasRole = normalizedRequired.some(role => userRoles.includes(role));

        if (!hasRole) {
            // User doesn't have the right role, redirect to a safe place
            return <Navigate to="/" replace />;
        }

        // Role-specific suspension check
        const isMarketerRoute = normalizedRequired.includes('marketer') || location.pathname.startsWith('/marketer');
        const isSellerRoute = normalizedRequired.includes('seller') || location.pathname.startsWith('/seller');
        const isDeliveryRoute = normalizedRequired.some(r => ['delivery', 'delivery_agent', 'driver'].includes(r)) || location.pathname.startsWith('/delivery');

        if (isMarketerRoute && user.isMarketerSuspended && !isAdmin) {
            console.warn(`[ProtectedRoute] Suspended marketer redirected to home`);
            return <Navigate to="/" state={{ suspended: 'marketer' }} replace />;
        }

        if (isSellerRoute && user.isSellerSuspended && !isAdmin) {
            console.warn(`[ProtectedRoute] Suspended seller redirected to home`);
            return <Navigate to="/" state={{ suspended: 'seller' }} replace />;
        }

        if (isDeliveryRoute && user.isDeliverySuspended && !isAdmin) {
            console.warn(`[ProtectedRoute] Suspended delivery agent redirected to home`);
            return <Navigate to="/" state={{ suspended: 'delivery' }} replace />;
        }
    }

    // New: Check for seller profile completeness
    const isSeller = userRoles.includes('seller');
    const onSellerRoute = location.pathname.startsWith('/seller');
    const onBusinessLocationPage = location.pathname === '/seller/business-location';

    if (isSeller && onSellerRoute && !onBusinessLocationPage) {
        if (!isSellerProfileComplete(user)) {
            console.warn(`[ProtectedRoute] Incomplete seller profile redirected to business-location`);
            return <Navigate to="/seller/business-location" state={{ from: location, incompleteProfile: true }} replace />;
        }
    }

    // Verify that if any of the user's active roles (other than customer/admin)
    // require verification, they are indeed verified.
    const hasSpecialistRole = userRoles.some(r => r !== 'customer' && !['admin', 'superadmin', 'super_admin'].includes(r));

    if (hasSpecialistRole && !isAdmin && !user.isVerified) {
        console.warn(`[ProtectedRoute] Unverified specialist (${userRoles.join(', ')}) redirected to verification dashboard`);
        return <Navigate to="/customer/account-verification" replace />;
    }

    return children;
};

export default ProtectedRoute;
