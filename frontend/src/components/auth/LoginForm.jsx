import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { formatKenyanPhoneInput } from '../../utils/validation'
import SystemFeedbackModal from '../ui/SystemFeedbackModal'
import { GoogleLogin } from '@react-oauth/google'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginForm({ onSuccess, isModal = false, initialMode = 'user', lockMode = false }) {
    const { login, googleLogin } = useAuth()
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

    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            setLoading(true);
            const user = await googleLogin(credentialResponse.credential);
            
            if (onSuccess) {
                onSuccess(user, { hasFastFood: false });
            } else {
                navigate('/');
            }
        } catch (err) {
            setError(err.message || 'Google Login failed.');
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
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => {
                                console.error('[GoogleAuth] Sign-in failed. Current origin:', window.location.origin);
                                setError('Google Authentication Failed. Check the console for more details.');
                            }}
                            theme="filled_blue"
                            shape="pill"
                            text="continue_with"
                        />
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
