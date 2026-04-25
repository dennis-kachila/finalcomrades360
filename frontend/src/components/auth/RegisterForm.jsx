import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { validateKenyanPhone, PHONE_VALIDATION_ERROR, formatKenyanPhoneInput } from '../../utils/validation'
import SystemFeedbackModal from '../ui/SystemFeedbackModal'

import { Eye, EyeOff } from 'lucide-react'

export default function RegisterForm({ onSuccess, initialReferralCode, isModal = false }) {
    const location = useLocation()
    const navigate = useNavigate()
    const { setSession, googleLogin, loginWithGoogle } = useAuth()

    // ── Form state ───────────────────────────────────────────────────────────────
    const [contact, setContact] = useState('')          // email OR phone
    const [contactType, setContactType] = useState('')  // 'email' | 'phone' | ''
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [referralCode, setReferralCode] = useState(initialReferralCode || localStorage.getItem('referrerCode') || '')
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
            const data = err.response?.data
            let msg = data?.message || 'Failed to send verification code. Please try again.'
            
            if (data?.details?.fields) {
                msg = `Missing or invalid: ${data.details.fields.join(', ')}`
            }
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    const startGoogleLogin = async () => {
        try {
            setLoading(true);
            await loginWithGoogle();
            const from = location.state?.from?.pathname || '/';
            navigate(from);
        } catch (err) {
            console.error('[GoogleAuth] Manual registration error:', err);
            setError(err.message || 'Google Authentication Failed. Please try again.');
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
            const data = err.response?.data
            let msg = data?.message || 'Verification failed. Please try again.'
            
            if (data?.details?.fields) {
                msg = `Validation error for: ${data.details.fields.join(', ')}`
            } else if (data?.errors && Array.isArray(data.errors)) {
                msg = data.errors.map(e => e.message || e).join('. ')
            }

            setError(msg)
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
            const data = err.response?.data
            setError(data?.message || 'Failed to resend code. Please try again.')
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
                            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
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
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-10 ${
                                confirmPassword && confirmPassword !== password ? 'border-red-400' : ''
                            }`}
                            placeholder="Re-enter your password"
                            required
                            autoComplete="new-password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
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
                            readOnly={!!initialReferralCode || !!localStorage.getItem('referrerCode')}
                            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                                (initialReferralCode || localStorage.getItem('referrerCode')) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                            }`}
                            placeholder="Enter a referral code"
                        />
                        {(initialReferralCode || localStorage.getItem('referrerCode')) && (
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
