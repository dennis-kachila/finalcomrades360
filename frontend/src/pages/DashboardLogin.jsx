import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const DashboardLogin = () => {
    const { user, updateUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    const [isSetup, setIsSetup] = useState(user && !user?.dashboardPassword);

    useEffect(() => {
        if (!user) {
            navigate('/login', { state: { from: location } });
        }
    }, [user, navigate, location]);
    const [formData, setFormData] = useState({
        currentPassword: '',
        dashboardPassword: '',
        confirmDashboardPassword: '',
        password: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const from = location.state?.from?.pathname || "/dashboard";

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (isSetup) {
                // Setup Mode: Requires current main password + new secondary password
                if (formData.dashboardPassword !== formData.confirmDashboardPassword) {
                    throw new Error("New dashboard passwords do not match.");
                }

                await api.post('/profile/dashboard-password', {
                    currentPassword: formData.currentPassword,
                    dashboardPassword: formData.dashboardPassword
                });

                setSuccess("Dashboard security set successfully!");
                await updateUser();
                setIsSetup(false);
                setFormData({ ...formData, currentPassword: '', dashboardPassword: '', confirmDashboardPassword: '' });
            } else {
                // Login Mode: Verify secondary password
                const res = await api.post('/profile/dashboard-password/verify', {
                    password: formData.password
                });

                if (res.data.success) {
                    sessionStorage.setItem('dashboard_verified', 'true');
                    navigate(from, { replace: true });
                }
            }
        } catch (err) {
            const data = err.response?.data
            let msg = data?.message || err.message || "An error occurred."
            
            if (data?.details?.fields) {
                msg = `Validation failed for: ${data.details.fields.join(', ')}`
            }
            setError(msg)
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[url('https://images.unsplash.com/photo-1554034483-04fda0d3507b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
            
            <div className="max-w-md w-full space-y-8 bg-white/90 backdrop-blur-md p-10 rounded-2xl shadow-2xl relative z-10 border border-white/20">
                <div className="relative">
                    <button 
                        onClick={() => navigate('/')}
                        className="absolute -top-6 -right-6 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all"
                        title="Close and Go to Home"
                    >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                        <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">
                        {isSetup ? "Security Setup" : "Dashboard Entry"}
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        {isSetup 
                            ? "Create a secondary password for dashboard access." 
                            : "Please enter your secondary password to continue."}
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <input type="hidden" name="remember" defaultValue="true" />
                    
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
                            <div className="flex">
                                <div className="ml-3">
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-md">
                            <div className="flex">
                                <div className="ml-3">
                                    <p className="text-sm text-green-700">{success}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-md shadow-sm space-y-4">
                        {isSetup ? (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Current Account Password</label>
                                    <input
                                        type="password"
                                        required
                                        className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="Main Password"
                                        value={formData.currentPassword}
                                        onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">New Dashboard Password</label>
                                        <input
                                            type="password"
                                            required
                                            className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                            placeholder="Secondary Password"
                                            value={formData.dashboardPassword}
                                            onChange={(e) => setFormData({ ...formData, dashboardPassword: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Confirm Dashboard Password</label>
                                        <input
                                            type="password"
                                            required
                                            className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                            placeholder="Repeat Secondary Password"
                                            value={formData.confirmDashboardPassword}
                                            onChange={(e) => setFormData({ ...formData, confirmDashboardPassword: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Dashboard Password</label>
                                <input
                                    type="password"
                                    required
                                    className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder="Secondary Password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col space-y-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                {loading ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-blue-300 group-hover:text-blue-100 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </span>
                            {loading ? "Processing..." : (isSetup ? "Save & Proceed" : "Unlock Dashboard")}
                        </button>
                        
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className="w-full text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            Cancel and Return to Home
                        </button>
                    </div>
                </form>

                {!isSetup && (
                    <div className="text-center pt-4 border-t border-gray-100">
                        <button 
                            onClick={() => setIsSetup(true)}
                            className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                        >
                            Reset Dashboard Password?
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardLogin;
