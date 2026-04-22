import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './ui/LoadingSpinner';
import { isSellerProfileComplete } from '../utils/sellerUtils';
import api from '../services/api';

const SuspensionMessage = ({ role }) => {
    const [config, setConfig] = useState(null);

    useEffect(() => {
        api.get('/platform/status')
            .then(res => setConfig(res.data?.systemInfo || null))
            .catch(() => {});
    }, []);

    const supportEmail = config?.supportEmail || 'support@comrades360.shop';

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Suspended</h2>
                <p className="text-gray-600 mb-6">
                    Your {role ? <span className="font-semibold text-gray-900">{role}</span> : ''} account has been temporarily suspended due to a violation of our terms of service or unusual activity.
                </p>
                <div className="bg-gray-50 p-4 rounded-xl mb-8 text-sm text-gray-600 border border-gray-200 text-left">
                    <p className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                        How to resolve this:
                    </p>
                    <p className="leading-relaxed">Please contact our support team at <a href={`mailto:${supportEmail}`} className="text-blue-600 hover:underline font-medium">{supportEmail}</a> or reach out to a platform administrator for more details regarding your suspension.</p>
                </div>
                <button 
                    onClick={() => window.location.href = '/'}
                    className="inline-flex items-center justify-center w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm shadow-blue-200"
                >
                    Return to Home Page
                </button>
            </div>
        </div>
    );
};

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
            console.warn(`[ProtectedRoute] Suspended marketer access blocked`);
            return <SuspensionMessage role="Marketer" />;
        }

        if (isSellerRoute && user.isSellerSuspended && !isAdmin) {
            console.warn(`[ProtectedRoute] Suspended seller access blocked`);
            return <SuspensionMessage role="Seller" />;
        }

        if (isDeliveryRoute && user.isDeliverySuspended && !isAdmin) {
            console.warn(`[ProtectedRoute] Suspended delivery agent access blocked`);
            return <SuspensionMessage role="Delivery" />;
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
