import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import api from '../services/api';
import PhoneVerification from '../components/PhoneVerification';

export default function EditAccount() {
  const navigate = useNavigate();
  // Name update
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);

  // Email change
  const [newEmail, setNewEmail] = useState('');
  const [emailToken, setEmailToken] = useState('');
  const [emailMsg, setEmailMsg] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // Phone change
  const [newPhone, setNewPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneMsg, setPhoneMsg] = useState(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  // Submit: name only
  const onSaveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    setNameMsg(null);
    try {
      const { data } = await api.patch('/users/me', { name });
      setNameMsg({ type: 'success', text: data?.message || 'Profile updated.' });
    } catch (err) {
      const data = err?.response?.data
      let text = data?.message || data?.error || 'Failed to update profile.'
      
      if (data?.details?.fields) {
        text = `Required fields missing: ${data.details.fields.join(', ')}`
      }
      setNameMsg({ type: 'error', text });
    } finally {
      setSavingName(false);
    }
  };

  // Email: request token
  const requestEmailChange = async () => {
    setEmailLoading(true);
    setEmailMsg(null);
    try {
      const { data } = await api.post('/users/me/email-change/request', { newEmail });
      setEmailMsg({ type: 'success', text: data?.message || 'Verification sent to your new email. Please enter the token below.' });
    } catch (err) {
      const data = err?.response?.data
      let text = data?.message || data?.error || 'Failed to request email change.'
      
      if (data?.details?.fields) {
        text = `Missing fields: ${data.details.fields.join(', ')}`
      }
      setEmailMsg({ type: 'error', text });
    } finally {
      setEmailLoading(false);
    }
  };

  // Email: confirm token
  const confirmEmailChange = async () => {
    setEmailLoading(true);
    try {
      const { data } = await api.post('/users/me/email-change/confirm', { token: emailToken });
      setEmailMsg({ type: 'success', text: data?.message || 'Email updated.' });
    } catch (err) {
      const data = err?.response?.data
      let text = data?.message || data?.error || 'Failed to confirm email change.'
      
      if (data?.details?.fields) {
        text = `Validation error: ${data.details.fields.join(', ')}`
      }
      setEmailMsg({ type: 'error', text });
    } finally {
      setEmailLoading(false);
    }
  };

  // Phone: request OTP
  const requestPhoneOtp = async () => {
    setPhoneLoading(true);
    setPhoneMsg(null);
    try {
      const { data } = await api.post('/users/me/phone-otp/request', { newPhone });
      setPhoneMsg({ type: 'success', text: data?.message || 'OTP sent to your new phone. Please enter it below.' });
    } catch (err) {
      const data = err?.response?.data
      let text = data?.message || data?.error || 'Failed to request OTP.'
      
      if (data?.details?.fields) {
        text = `Missing fields: ${data.details.fields.join(', ')}`
      }
      setPhoneMsg({ type: 'error', text });
    } finally {
      setPhoneLoading(false);
    }
  };

  // Phone: confirm OTP
  const confirmPhoneOtp = async () => {
    setPhoneLoading(true);
    try {
      const { data } = await api.post('/users/me/phone-otp/confirm', { otp: phoneOtp });
      setPhoneMsg({ type: 'success', text: data?.message || 'Phone updated.' });
    } catch (err) {
      const data = err?.response?.data
      let text = data?.message || data?.error || 'Failed to confirm OTP.'
      
      if (data?.details?.fields) {
        text = `Validation error: ${data.details.fields.join(', ')}`
      }
      setPhoneMsg({ type: 'error', text });
    } finally {
      setPhoneLoading(false);
    }
  };

  // Password: change
  const changePassword = async (e) => {
    e.preventDefault();
    setPwdLoading(true);
    setPwdMsg(null);
    try {
      const { data } = await api.post('/users/me/change-password', { currentPassword, newPassword });
      setPwdMsg({ type: 'success', text: data?.message || 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      const data = err?.response?.data
      let text = data?.message || data?.error || 'Failed to change password.'
      
      if (data?.details?.fields) {
        text = `Required fields missing: ${data.details.fields.join(', ')}`
      }
      setPwdMsg({ type: 'error', text });
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium transition-colors"
      >
        <FaArrowLeft className="mr-2" /> Back
      </button>
      <h1 className="text-2xl font-bold">Edit Account</h1>

      {/* Update Name */}
      <section className="card max-w-xl">
        <h2 className="text-xl font-semibold mb-3">Profile</h2>
        {nameMsg && (
          <div className={`mb-3 p-3 rounded ${nameMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{nameMsg.text}</div>
        )}
        <form onSubmit={onSaveName} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="Your full name" />
          </div>
          <button type="submit" disabled={savingName} className="btn">{savingName ? 'Saving...' : 'Save Name'}</button>
        </form>
      </section>

      {/* Change Email with token */}
      <section className="card max-w-xl">
        <h2 className="text-xl font-semibold mb-3">Change Email</h2>
        {emailMsg && (
          <div className={`mb-3 p-3 rounded ${emailMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{emailMsg.text}</div>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">New Email</label>
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="name@example.com" />
          </div>
          <button type="button" disabled={emailLoading} onClick={requestEmailChange} className="btn">{emailLoading ? 'Sending...' : 'Send Verification'}</button>
          <div>
            <label className="block text-sm font-medium text-gray-700">Verification Token</label>
            <input value={emailToken} onChange={(e) => setEmailToken(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="Enter token" />
          </div>
          <button type="button" disabled={emailLoading || !emailToken} onClick={confirmEmailChange} className="btn">Confirm Email Change</button>
        </div>
      </section>

      {/* Change Phone with SMS Verification */}
      <section className="card max-w-xl">
        <h2 className="text-xl font-semibold mb-3">Change Phone</h2>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Use the form below to verify and update your phone number via SMS.
          </p>
          <PhoneVerification 
            currentPhone={newPhone}
            onVerified={(verifiedPhone) => {
              setPhoneMsg({ type: 'success', text: `Phone number ${verifiedPhone} verified and updated successfully!` });
              // The backend verify-firebase endpoint already updates the DB, 
              // but we might want to refresh the local user state.
              setTimeout(() => window.location.reload(), 2000);
            }} 
          />
        </div>
      </section>

      {/* Change Password */}
      <section className="card max-w-xl">
        <h2 className="text-xl font-semibold mb-3">Change Password</h2>
        {pwdMsg && (
          <div className={`mb-3 p-3 rounded ${pwdMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{pwdMsg.text}</div>
        )}
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="Current password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="New password" />
          </div>
          <button type="submit" disabled={pwdLoading} className="btn">{pwdLoading ? 'Saving...' : 'Update Password'}</button>
        </form>
      </section>
    </div>
  );
}
