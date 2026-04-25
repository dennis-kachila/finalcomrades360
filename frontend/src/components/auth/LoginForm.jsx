import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { formatKenyanPhoneInput } from '../../utils/validation'
import SystemFeedbackModal from '../ui/SystemFeedbackModal'

import { Eye, EyeOff } from 'lucide-react'

export default function LoginForm({ onSuccess, isModal = false, initialMode = 'user', lockMode = false }) {
    const { login, googleLogin, loginWithGoogle } = useAuth()
    const navigate = useNavigate();
    const location = useLocation();
    const [form, setForm] = useState({ identifier: '', password: '' })
    const [loginMode, setLoginMode] = useState(initialMode)

    useEffect(() => {
        setLoginMode(initialMode || 'user')
    }, [initialMode])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    const [showErrorModal, setShowErrorModal] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    useEffect(() => {
        // Check if we have a success message from password reset
        if (location.state?.message) {
            setSuccessMessage(location.state.message)
            // Pre-fill email if provided
            if (location.state.email) {
                setForm(prev => ({ ...prev, identifier: location.state.email }))
            }
            // Clear the location state to prevent showing message on refresh
            window.history.replaceState({}, document.title)
        }
    }, [location.state])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            // Check for guest fast food BEFORE login (while guest state is still active in storage)
            const hasGuestFastFood = (() => {
                const keys = ['cartState_personal', 'cartState_marketing'];
                for (const key of keys) {
                    const saved = localStorage.getItem(key);
                    if (saved) {
                        try {
                            const cart = JSON.parse(saved);
                            if (cart && cart.items && cart.items.length > 0) {
                                return cart.items.some(item => 
                                    item.itemType === 'fastfood' || 
                                    item.fastFoodId || 
                                    (item.product && item.product.itemType === 'fastfood')
                                );
                            }
                        } catch (e) {}
                    }
                }
                return false;
            })();

            // Use the login function from auth context
            const loggedInUser = await login({
                identifier: form.identifier,
                password: form.password,
                mode: loginMode
            });

            console.log('Login successful');

            if (onSuccess) {
                onSuccess(loggedInUser, { hasFastFood: hasGuestFastFood });
            } else {
                // Default navigation if not handled by parent (e.g. not in modal)
                if (loggedInUser?.role === 'station_manager') {
                    navigate('/station');
                } else if (hasGuestFastFood) {
                    navigate('/fastfood');
                } else {
                    navigate('/');
                }
            }
        } catch (err) {
            let errorMessage = 'Login failed. Please try again.'

            if (err.response?.data?.needsVerification) {
                // Account exists but email is not verified — send them to the OTP verification screen
                navigate('/register', { 
                    state: { 
                        emailToVerify: err.response.data.email, 
                        message: err.response.data.message 
                    } 
                });
                return;
            }

            if (err.response) {
                const data = err.response.data
                errorMessage = data?.message || data?.error || `Server responded with status ${err.response.status}`
                
                if (data?.details?.fields) {
                    errorMessage = `Missing fields: ${data.details.fields.join(', ')}`
                } else if (data?.errors && Array.isArray(data.errors)) {
                    errorMessage = data.errors.map(e => e.message || e).join('. ')
                }
            } else if (err.request) {
                errorMessage = 'No response from server. Please check your connection.'
            } else {
                errorMessage = `Request error: ${err.message}`
            }

            setErrorMessage(errorMessage)
            setShowErrorModal(true)
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }

    const startGoogleLogin = async () => {
        try {
            setLoading(true);
            const user = await loginWithGoogle();
            if (onSuccess) {
                onSuccess(user, { hasFastFood: false });
            } else {
                navigate('/');
            }
        } catch (err) {
            console.error('[GoogleAuth] Manual sign-in error:', err);
            setError(err.message || 'Google Authentication Failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {!isModal && !lockMode && (
                <>
                    <h2 className="text-2xl font-bold mb-4">Login to Comrades360</h2>
                    <p className="text-gray-600 mb-6">Welcome back! Sign in to your student account.</p>
                </>
            )}

            {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
            {successMessage && <div className="bg-green-100 text-green-700 p-3 rounded mb-4">{successMessage}</div>}

            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label className="block mb-1 font-medium">{loginMode === 'station' ? 'Station Name, Code, Email or Phone' : 'Email or Phone Number'}</label>
                    <input
                        type="text"
                        value={form.identifier}
                        onInput={(e) => {
                            // If input contains only digits and plus, treat as potential phone and format
                            if (/^[\d+]+$/.test(e.target.value)) {
                                e.target.value = formatKenyanPhoneInput(e.target.value)
                            }
                        }}
                        onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={loginMode === 'station' ? 'Warehouse code/name/email/phone' : 'your.email@example.com or 0712345678'}
                        required
                    />
                </div>
                <div className="mb-6">
                    <label className="block mb-1 font-medium">{loginMode === 'station' ? 'Contact Phone (as secret)' : 'Password'}</label>
                    <div className="relative">
                        <input
                            type={showPassword || loginMode === 'station' ? 'text' : 'password'}
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                            placeholder={loginMode === 'station' ? 'Use the station contact phone' : ''}
                            required
                        />
                        {loginMode !== 'station' && (
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex justify-center w-full mt-6">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-1/2 py-3 px-6 rounded-lg shadow-md text-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </div>
            </form>

            {loginMode === 'user' && (
                <>
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500 font-medium">Or sign in with Google</span>
                        </div>
                    </div>

                    <div className="mb-6 flex justify-center">
                        <button
                            type="button"
                            onClick={() => startGoogleLogin()}
                            disabled={loading}
                            className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-[#4285F4] text-white font-medium text-sm hover:bg-[#357abd] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                        >
                            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#fff"/>
                                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#fff" opacity=".9"/>
                                <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#fff" opacity=".8"/>
                                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" opacity=".7"/>
                            </svg>
                            Continue with Google
                        </button>
                    </div>
                </>
            )}

            <div className="mt-6 text-center">
                <p className="text-gray-600">
                    Don't have an account?
                    <Link to="/register" className="text-blue-600 hover:underline ml-1">
                        Register here
                    </Link>
                </p>
                <p className="text-gray-600 mt-2">
                    Trouble signing in?{' '}
                    <Link to="/forgot-password" className="text-blue-600 hover:underline">
                        Reset your password
                    </Link>
                </p>
            </div>
            <SystemFeedbackModal
                open={showErrorModal}
                onOpenChange={setShowErrorModal}
                type="error"
                title="Login Failed"
                description={errorMessage}
                confirmLabel="Try Again"
            />
        </div>
    )
}
