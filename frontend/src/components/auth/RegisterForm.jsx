import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { validateKenyanPhone, PHONE_VALIDATION_ERROR, formatKenyanPhoneInput } from '../../utils/validation'
import SystemFeedbackModal from '../ui/SystemFeedbackModal'
import { GoogleLogin } from '@react-oauth/google'

export default function RegisterForm({ onSuccess, initialReferralCode, isModal = false }) {
    const location = useLocation()
    const navigate = useNavigate()
    const { setSession, googleLogin } = useAuth()

    // ── Form state ───────────────────────────────────────────────────────────────
    const [contact, setContact] = useState('')          // email OR phone
    const [contactType, setContactType] = useState('')  // 'email' | 'phone' | ''
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [referralCode, setReferralCode] = useState(initialReferralCode || '')
    const [showPassword, setShowPassword] = useState(false)

    // ── Password rules ────────────────────────────────────────────────────────
    const pwRules = {
        length:   { label: 'At least 8 characters',       pass: password.length >= 8 },
        upper:    { label: 'One uppercase letter (A–Z)',   pass: /[A-Z]/.test(password) },
        special:  { label: 'One special character (!@#…)', pass: /[^A-Za-z0-9]/.test(password) },
        match:    { label: 'Passwords match',              pass: !!confirmPassword && confirmPassword === password },
    }
    const allRulesPass = Object.values(pwRules).every(r => r.pass)

    // ── UI state ─────────────────────────────────────────────────────────────────
    const [error, setError] = useState(location.state?.message || '')
    const [loading, setLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', description: '', onConfirm: null })

    // ── OTP step ─────────────────────────────────────────────────────────────────
    const [step, setStep] = useState('register')    // 'register' | 'verify'
    const [registeredContact, setRegisteredContact] = useState('')
    const [otpMethod, setOtpMethod] = useState('')  // 'email' | 'sms'
    const [otp, setOtp] = useState(['', '', '', '', '', ''])
    const otpRefs = useRef([])
    const [resendCooldown, setResendCooldown] = useState(0)
    const [verifying, setVerifying] = useState(false)

    // Sync initial referral code
    useEffect(() => {
        if (initialReferralCode) setReferralCode(initialReferralCode)
    }, [initialReferralCode])

    // Countdown timer for resend cooldown
    useEffect(() => {
        if (resendCooldown <= 0) return
        const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
        return () => clearTimeout(t)
    }, [resendCooldown])

    // ── Web OTP API — auto-capture SMS code on mobile ─────────────────────────
    useEffect(() => {
        if (step !== 'verify' || otpMethod !== 'sms') return
        if (!('OTPCredential' in window)) return

        const ac = new AbortController()
        navigator.credentials.get({
            otp: { transport: ['sms'] },
            signal: ac.signal
        }).then(credential => {
            if (credential?.code) {
                const digits = credential.code.replace(/\D/g, '').slice(0, 6).split('')
                setOtp(prev => {
                    const next = [...prev]
                    digits.forEach((d, i) => { next[i] = d })
                    return next
                })
            }
        }).catch(() => { /* user cancelled or not supported — silent */ })

        return () => ac.abort()
    }, [step, otpMethod])

    // ── Detect whether the user typed an email or phone ───────────────────────
    const detectContactType = (value) => {
        if (!value) return ''
        if (value.includes('@')) return 'email'
        // Starts with 0, +254, or digits typically used for phone
        if (/^(\+254|0)[017]/.test(value) || /^\d{3,}$/.test(value)) return 'phone'
        return ''
    }

    const handleContactChange = (e) => {
        let val = e.target.value
        // If it looks like a phone, apply Kenyan formatting helper
        const type = detectContactType(val)
        if (type === 'phone') val = formatKenyanPhoneInput(val)
        setContact(val)
        setContactType(detectContactType(val))
        setError('')
    }

    // ── Step 1: Submit form, send OTP ─────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        const type = detectContactType(contact)
        if (!type) {
            setError('Please enter a valid email address or Kenyan phone number.')
            return
        }
        if (type === 'phone' && !validateKenyanPhone(contact)) {
            setError(PHONE_VALIDATION_ERROR)
            return
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.')
            return
        }
        if (!/[A-Z]/.test(password)) {
            setError('Password must contain at least one uppercase letter.')
            return
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
            setError('Password must contain at least one special character.')
            return
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.')
            return
        }

        setLoading(true)
        try {
            const payload = type === 'email' ? { email: contact } : { phone: contact }
            const { data } = await api.post('/auth/send-registration-otp', payload)
            setRegisteredContact(contact)
            setContactType(type)
            setOtpMethod(data.method || type === 'email' ? 'email' : 'sms')
            setStep('verify')
            setResendCooldown(60)
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to send verification code. Please try again.'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            setLoading(true);
            await googleLogin(credentialResponse.credential);
            // Navigate to the destination using client-side routing so that
            // CartContext stays mounted and can detect the user change, pick up
            // the guest cart from localStorage, and merge it with the server.
            const from = location.state?.from?.pathname || '/';
            navigate(from);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to authenticate with Google. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // ── OTP input handlers ────────────────────────────────────────────────────
    const handleOtpChange = (index, value) => {
        if (!/^\d*$/.test(value)) return
        const newOtp = [...otp]
        newOtp[index] = value.slice(-1)
        setOtp(newOtp)
        if (value && index < 5) otpRefs.current[index + 1]?.focus()
    }

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus()
        }
    }

    const handleOtpPaste = (e) => {
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (pasted.length === 6) {
            setOtp(pasted.split(''))
            otpRefs.current[5]?.focus()
        }
    }

    // ── Step 2: Verify OTP & create account ──────────────────────────────────
    const handleVerify = async (e) => {
        e.preventDefault()
        const otpString = otp.join('')
        if (otpString.length < 6) {
            setError('Please enter the complete 6-digit code.')
            return
        }
        setVerifying(true)
        setError('')
        try {
            const isEmail = contactType === 'email'
            const payload = {
                ...(isEmail ? { email: registeredContact } : { phone: registeredContact }),
                password,
                otp: otpString,
                ...(referralCode ? { referralCode } : {})
            }
            const res = await api.post('/auth/register', payload)
            if (res.data.token && res.data.user) {
                await setSession(res.data.token, res.data.user)
            }
            setModalConfig({
                type: 'success',
                title: '🎉 Welcome to Comrades360!',
                description: 'Your account is ready. Complete your profile in Account Settings to unlock all features.',
                confirmLabel: 'Get Started',
                onConfirm: () => {
                    if (onSuccess) onSuccess()
                    else window.location.href = '/'
                }
            })
            setShowModal(true)
        } catch (err) {
            setError(err.response?.data?.message || 'Verification failed. Please try again.')
        } finally {
            setVerifying(false)
        }
    }

    // ── Resend OTP ────────────────────────────────────────────────────────────
    const handleResend = async () => {
        if (resendCooldown > 0) return
        try {
            const isEmail = contactType === 'email'
            await api.post('/auth/send-registration-otp', isEmail ? { email: registeredContact } : { phone: registeredContact })
            setResendCooldown(60)
            setError('')
            setOtp(['', '', '', '', '', ''])
            otpRefs.current[0]?.focus()
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to resend code. Please try again.')
        }
    }

    // ─── OTP Verify Screen ────────────────────────────────────────────────────
    if (step === 'verify') {
        const isEmail = contactType === 'email'
        return (
            <div>
                <div className="text-center mb-6">
                    <div className="text-4xl mb-3">{isEmail ? '📧' : '📱'}</div>
                    <h2 className="text-2xl font-bold mb-1">Check your {isEmail ? 'inbox' : 'messages'}</h2>
                    <p className="text-gray-500 text-sm">
                        We sent a 6-digit code to<br />
                        <span className="font-semibold text-gray-700">{registeredContact}</span>
                    </p>
                    {!isEmail && (
                        <p className="text-xs text-blue-500 mt-1">On supported browsers, we'll auto-fill this for you.</p>
                    )}
                </div>

                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

                <form onSubmit={handleVerify} autoComplete="one-time-code">
                    <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
                        {otp.map((digit, i) => (
                            <input
                                key={i}
                                ref={el => otpRefs.current[i] = el}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                                onChange={e => handleOtpChange(i, e.target.value)}
                                onKeyDown={e => handleOtpKeyDown(i, e)}
                                className="w-11 h-12 text-center text-xl font-bold border-2 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                autoFocus={i === 0}
                            />
                        ))}
                    </div>

                    <button
                        type="submit"
                        disabled={verifying || otp.join('').length < 6}
                        className="w-full py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {verifying ? 'Creating Account…' : 'Verify & Create Account'}
                    </button>
                </form>

                <div className="mt-4 text-center text-sm text-gray-500">
                    Didn't receive a code?{' '}
                    {resendCooldown > 0 ? (
                        <span className="text-gray-400">Resend in {resendCooldown}s</span>
                    ) : (
                        <button onClick={handleResend} className="text-blue-600 hover:underline font-medium">
                            Resend code
                        </button>
                    )}
                </div>
                <div className="mt-2 text-center text-xs text-gray-400">
                    <button onClick={() => setStep('register')} className="hover:underline">← Back</button>
                </div>

                <SystemFeedbackModal
                    open={showModal}
                    onOpenChange={setShowModal}
                    type={modalConfig.type}
                    title={modalConfig.title}
                    description={modalConfig.description}
                    confirmLabel={modalConfig.confirmLabel || 'Done'}
                    onConfirm={modalConfig.onConfirm}
                />
            </div>
        )
    }

    // ─── Registration Form ─────────────────────────────────────────────────────
    return (
        <div>
            <h2 className="text-2xl font-bold mb-1 text-center">Join Comrades360</h2>
            <p className="text-center text-sm text-gray-500 mb-5">Create your account in seconds</p>

            {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

            <form onSubmit={handleSubmit}>
                {/* Email OR Phone */}
                <div className="mb-4">
                    <label className="block mb-1 font-medium text-sm">Email or Phone Number</label>
                    <input
                        type="text"
                        value={contact}
                        onChange={handleContactChange}
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        placeholder="e.g. john@uni.ac.ke  or  0712345678"
                        required
                        autoComplete="username"
                    />
                    {contactType === 'phone' && (
                        <p className="text-xs text-blue-600 mt-1">📱 We'll send a verification code to this number via SMS.</p>
                    )}
                    {contactType === 'email' && (
                        <p className="text-xs text-green-600 mt-1">📧 We'll send a verification code to this email.</p>
                    )}
                </div>

                {/* Password */}
                <div className="mb-4">
                    <label className="block mb-1 font-medium text-sm">Password</label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-10"
                            placeholder="Min. 8 characters"
                            required
                            autoComplete="new-password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 text-sm"
                            tabIndex={-1}
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>
                    {/* Live password checklist */}
                    {password.length > 0 && (
                        <ul className="mt-2 space-y-1">
                            {Object.values(pwRules).map((rule, i) => (
                                <li key={i} className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                                    rule.pass ? 'text-green-600' : 'text-gray-400'
                                }`}>
                                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] ${
                                        rule.pass ? 'bg-green-500' : 'bg-gray-300'
                                    }`}>{rule.pass ? '✓' : '✗'}</span>
                                    {rule.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Confirm Password */}
                <div className="mb-4">
                    <label className="block mb-1 font-medium text-sm">Confirm Password</label>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                            confirmPassword && confirmPassword !== password ? 'border-red-400' : ''
                        }`}
                        placeholder="Re-enter your password"
                        required
                        autoComplete="new-password"
                    />
                    {confirmPassword && confirmPassword !== password && (
                        <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                    )}
                </div>

                {/* Referral Code */}
                <div className="mb-6">
                    <label className="block mb-1 font-medium text-sm">Referral Code <span className="text-gray-400 font-normal">(Optional)</span></label>
                    <div className="relative">
                        <input
                            type="text"
                            value={referralCode}
                            onChange={e => setReferralCode(e.target.value)}
                            readOnly={!!initialReferralCode}
                            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                                initialReferralCode ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                            }`}
                            placeholder="Enter a referral code"
                        />
                        {initialReferralCode && (
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                                <span className="text-gray-400 text-xs">Locked</span>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading || !allRulesPass || !contact}
                    className="w-full py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                    {loading ? 'Sending Code…' : 'Create Account'}
                </button>
            </form>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500 font-medium">Or join with Google</span>
                </div>
            </div>

            <div className="flex justify-center mb-6">
                <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError('Google Authentication Failed.')}
                    theme="filled_blue"
                    shape="pill"
                    text="continue_with"
                />
            </div>

            <div className="mt-5 text-center text-sm text-gray-500">
                <p className="text-xs text-gray-400 mb-3">
                    You can add your name, address, and other details in Account Settings after signing up.
                </p>
                Already have an account?{' '}
                <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
            </div>

            <SystemFeedbackModal
                open={showModal}
                onOpenChange={setShowModal}
                type={modalConfig.type}
                title={modalConfig.title}
                description={modalConfig.description}
                confirmLabel={modalConfig.confirmLabel || 'Done'}
                onConfirm={modalConfig.onConfirm}
            />
        </div>
    )
}
