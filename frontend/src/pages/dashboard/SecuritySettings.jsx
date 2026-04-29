import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import { getSocket } from '../../services/socket'

export default function SecuritySettings({ user }){
  const [securityStep, setSecurityStep] = useState('initiate') // 'initiate' | 'finalize'
  const [securityForm, setSecurityForm] = useState({
    newEmail: '',
    currentPassword: '',
    emailToken: '',
    phoneOtp: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const resetAlerts = () => { setError(''); setSuccess(''); }

  // ── Web OTP API — auto-capture SMS code on mobile ─────────────────────────
  useEffect(() => {
    if (securityStep !== 'finalize') return;
    if (!('OTPCredential' in window)) return;

    const ac = new AbortController();
    navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
    }).then(credential => {
        if (credential?.code) {
            const code = credential.code.replace(/\D/g, '').slice(0, 6);
            setSecurityForm(prev => ({...prev, phoneOtp: code}));
            // Automatically trigger verification
            handleVerifyDirect(code);
        }
    }).catch(() => { /* user cancelled or not supported — silent */ });

    return () => ac.abort();
  }, [securityStep]);

  // ── Multi-channel OTP monitoring (SMS, WhatsApp, Email) ──────────────────
  useEffect(() => {
    if (securityStep !== 'finalize') return;

    const socket = getSocket();
    if (!socket) return;

    const handleOtpReceived = (data) => {
      console.log('[OTP-Monitor] Received code via socket:', data);
      if (data.otp && data.type === 'securityChange') {
        const code = data.otp.toString();
        setSecurityForm(prev => ({ ...prev, phoneOtp: code }));
        // Automatically trigger verification
        handleVerifyDirect(code);
      }
    };

    socket.on('otp:received', handleOtpReceived);
    return () => socket.off('otp:received', handleOtpReceived);
  }, [securityStep]);

  const handleVerifyDirect = async (code) => {
    resetAlerts()
    const { currentPassword, emailToken, newPassword, confirmPassword } = securityForm
    // Only auto-submit if other fields are already filled
    if (!currentPassword || !emailToken || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) return;

    setLoading(true)
    try {
      await api.finalizeSecurityChange({
        currentPassword,
        emailToken,
        phoneOtp: code,
        newPassword
      })
      setSuccess('Security change completed successfully. Your email and password have been updated.')
      setSecurityStep('initiate')
      setSecurityForm({
        newEmail: '',
        currentPassword: '',
        emailToken: '',
        phoneOtp: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to finalize security change')
    } finally {
      setLoading(false)
    }
  }

  // Security change handlers
  const initiateSecurityChange = async () => {
    resetAlerts()
    if (!securityForm.newEmail) {
      setError('New email is required')
      return
    }
    setLoading(true)
    try {
      await api.initiateSecurityChange({ 
        newEmail: securityForm.newEmail,
        socketId: getSocket()?.id
      })
      setSuccess('Security change initiated. Check your new email for a token and your phone for an OTP.')
      setSecurityStep('finalize')
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to initiate security change')
    } finally {
      setLoading(false)
    }
  }

  const finalizeSecurityChange = async () => {
    resetAlerts()
    const { currentPassword, emailToken, phoneOtp, newPassword, confirmPassword } = securityForm
    if (!currentPassword || !emailToken || !phoneOtp || !newPassword || !confirmPassword) {
      setError('All fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    setLoading(true)
    try {
      await api.finalizeSecurityChange({
        currentPassword,
        emailToken,
        phoneOtp,
        newPassword
      })
      setSuccess('Security change completed successfully. Your email and password have been updated.')
      setSecurityStep('initiate')
      setSecurityForm({
        newEmail: '',
        currentPassword: '',
        emailToken: '',
        phoneOtp: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to finalize security change')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Super Admin Security Management</h1>
        <p className="text-gray-600">
          Change your email and password with multi-factor verification. This process requires verification via email token and phone OTP.
        </p>
      </div>

      {/* Alerts */}
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
      {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">{success}</div>}

      <div className="bg-white p-6 rounded-lg shadow">
        {securityStep === 'initiate' ? (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Step 1: Initiate Security Change</h3>
            <div className="max-w-md">
              <label className="block text-sm font-medium mb-2">New Email Address</label>
              <input
                type="email"
                className="w-full border rounded p-2"
                placeholder="Enter new email address"
                value={securityForm.newEmail}
                onChange={(e) => setSecurityForm({...securityForm, newEmail: e.target.value})}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                A verification token will be sent to this email, and an OTP to your current phone number.
              </p>
            </div>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              onClick={initiateSecurityChange}
              disabled={loading}
            >
              {loading ? 'Initiating...' : 'Initiate Security Change'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Step 2: Finalize Security Change</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-2">Current Password</label>
                <input
                  type="password"
                  className="w-full border rounded p-2"
                  placeholder="Enter current password"
                  value={securityForm.currentPassword}
                  onChange={(e) => setSecurityForm({...securityForm, currentPassword: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email Token</label>
                <input
                  type="text"
                  className="w-full border rounded p-2"
                  placeholder="Token from new email"
                  value={securityForm.emailToken}
                  onChange={(e) => setSecurityForm({...securityForm, emailToken: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Phone OTP</label>
                <input
                  type="text"
                  className="w-full border rounded p-2"
                  placeholder="OTP from phone"
                  autoComplete="one-time-code"
                  value={securityForm.phoneOtp}
                  onChange={(e) => setSecurityForm({...securityForm, phoneOtp: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">New Password</label>
                <input
                  type="password"
                  className="w-full border rounded p-2"
                  placeholder="Enter new password"
                  value={securityForm.newPassword}
                  onChange={(e) => setSecurityForm({...securityForm, newPassword: e.target.value})}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                <input
                  type="password"
                  className="w-full border rounded p-2"
                  placeholder="Confirm new password"
                  value={securityForm.confirmPassword}
                  onChange={(e) => setSecurityForm({...securityForm, confirmPassword: e.target.value})}
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                onClick={finalizeSecurityChange}
                disabled={loading}
              >
                {loading ? 'Finalizing...' : 'Complete Security Change'}
              </button>
              <button
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                onClick={() => {
                  setSecurityStep('initiate')
                  setSecurityForm({...securityForm, currentPassword: '', emailToken: '', phoneOtp: '', newPassword: '', confirmPassword: ''})
                }}
              >
                Back to Step 1
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}