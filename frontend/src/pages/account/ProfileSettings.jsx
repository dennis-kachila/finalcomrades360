import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

// ── Small reusable components ──────────────────────────────────────────────────

const Alert = ({ type, text }) => {
  if (!text) return null;
  const colours =
    type === 'success'
      ? 'bg-green-50 border border-green-200 text-green-800'
      : 'bg-red-50 border border-red-200 text-red-800';
  return <div className={`mb-4 p-3 rounded-lg text-sm ${colours}`}>{text}</div>;
};

const InputRow = ({ label, children, hint }) => (
  <div className="space-y-1">
    <label className="block text-sm font-semibold text-gray-700">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const PrimaryBtn = ({ children, loading, disabled, onClick, type = 'button' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={loading || disabled}
    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loading && (
      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
      </svg>
    )}
    {loading ? 'Please wait…' : children}
  </button>
);

const SecondaryBtn = ({ children, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
  >
    {children}
  </button>
);

const inputCls =
  'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition';

// ── Section wrapper ────────────────────────────────────────────────────────────

const Section = ({ title, subtitle, icon, children }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
    <div className="flex items-start gap-3 mb-5">
      <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

// ── OTP / Token entry widget ───────────────────────────────────────────────────

const OtpConfirm = ({ label, placeholder, buttonLabel, loading, onConfirm, onCancel }) => {
  const [code, setCode] = useState('');
  return (
    <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg space-y-3">
      <p className="text-sm text-blue-800 font-medium">📩 {label}</p>
      <input
        type="text"
        maxLength={8}
        value={code}
        onChange={e => setCode(e.target.value.trim())}
        placeholder={placeholder || 'Enter code'}
        className={`${inputCls} font-mono tracking-widest text-center`}
      />
      <div className="flex gap-2">
        <PrimaryBtn loading={loading} onClick={() => onConfirm(code)}>
          {buttonLabel || 'Confirm'}
        </PrimaryBtn>
        <SecondaryBtn onClick={onCancel}>Cancel</SecondaryBtn>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  // ── Basic profile form ────────────────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({ name: '', bio: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) setProfileForm({ name: user.name || '', bio: user.bio || '' });
  }, [user]);

  const handleProfileSubmit = async e => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg({ type: '', text: '' });
    try {
      const res = await api.put('/users/profile', profileForm);
      updateUser(res.data.user);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      const data = err.response?.data
      let text = data?.message || data?.error || 'Failed to update profile.'
      
      if (data?.details?.fields) {
        text = `Required fields missing: ${data.details.fields.join(', ')}`
      }
      setProfileMsg({ type: 'error', text });
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Phone change state ────────────────────────────────────────────────────
  const [phoneStep, setPhoneStep] = useState('idle'); // idle | awaiting_otp | done
  const [newPhone, setNewPhone] = useState('');
  const [phoneMethod, setPhoneMethod] = useState('whatsapp');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState({ type: '', text: '' });

  const requestPhoneOtp = async () => {
    if (!newPhone.trim()) {
      setPhoneMsg({ type: 'error', text: 'Please enter a phone number.' });
      return;
    }
    setPhoneLoading(true);
    setPhoneMsg({ type: '', text: '' });
    try {
      const res = await api.post('/users/me/phone-otp/request', { newPhone: newPhone.trim(), method: phoneMethod });
      setPhoneMsg({ type: 'success', text: res.data.message });
      setPhoneStep('awaiting_otp');
    } catch (err) {
      const data = err.response?.data
      let text = data?.message || data?.error || 'Could not send OTP. Try again.'
      
      if (data?.details?.fields) {
        text = `Missing fields: ${data.details.fields.join(', ')}`
      }
      setPhoneMsg({ type: 'error', text });
    } finally {
      setPhoneLoading(false);
    }
  };

  const confirmPhoneOtp = async otp => {
    if (!otp) { setPhoneMsg({ type: 'error', text: 'Please enter the OTP.' }); return; }
    setPhoneLoading(true);
    setPhoneMsg({ type: '', text: '' });
    try {
      await api.post('/users/me/phone-otp/confirm', { otp });
      setPhoneMsg({ type: 'success', text: '✅ Phone number updated successfully!' });
      setNewPhone('');
      
      // Redirect to account verification page
      navigate('/customer/account-verification');

      // Refresh user data
      const me = await api.get('/users/me');
      updateUser(me.data);
    } catch (err) {
      const data = err.response?.data
      let text = data?.message || data?.error || 'Invalid or expired OTP.'
      
      if (data?.details?.fields) {
        text = `Validation error: ${data.details.fields.join(', ')}`
      }
      setPhoneMsg({ type: 'error', text });
    } finally {
      setPhoneLoading(false);
    }
  };

  const resetPhone = () => { setPhoneStep('idle'); setNewPhone(''); setPhoneMsg({ type: '', text: '' }); };

  // ── Email change state ────────────────────────────────────────────────────
  const [emailStep, setEmailStep] = useState('idle'); // idle | awaiting_token | done
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState({ type: '', text: '' });

  const requestEmailChange = async () => {
    if (!newEmail.trim()) {
      setEmailMsg({ type: 'error', text: 'Please enter an email address.' });
      return;
    }
    setEmailLoading(true);
    setEmailMsg({ type: '', text: '' });
    try {
      const res = await api.post('/users/me/email-change/request', { newEmail: newEmail.trim() });
      setEmailMsg({ type: 'success', text: res.data.message });
      setEmailStep('awaiting_token');
    } catch (err) {
      const data = err.response?.data
      let text = data?.message || data?.error || 'Could not request email change.'
      
      if (data?.details?.fields) {
        text = `Missing fields: ${data.details.fields.join(', ')}`
      }
      setEmailMsg({ type: 'error', text });
    } finally {
      setEmailLoading(false);
    }
  };

  const confirmEmailToken = async token => {
    if (!token) { setEmailMsg({ type: 'error', text: 'Please enter the verification code.' }); return; }
    setEmailLoading(true);
    setEmailMsg({ type: '', text: '' });
    try {
      await api.post('/users/me/email-change/confirm', { token });
      setEmailMsg({ type: 'success', text: '✅ Email address updated successfully!' });
      setEmailStep('done');
      setNewEmail('');
      const me = await api.get('/users/me');
      updateUser(me.data);
    } catch (err) {
      const data = err.response?.data
      let text = data?.message || data?.error || 'Invalid or expired token.'
      
      if (data?.details?.fields) {
        text = `Validation error: ${data.details.fields.join(', ')}`
      }
      setEmailMsg({ type: 'error', text });
    } finally {
      setEmailLoading(false);
    }
  };

  const resetEmail = () => { setEmailStep('idle'); setNewEmail(''); setEmailMsg({ type: '', text: '' }); };

  // ── Dashboard password state ──────────────────────────────────────────────
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashForm, setDashForm] = useState({ currentPassword: '', dashboardPassword: '', confirmDashboardPassword: '' });
  const [dashSaving, setDashSaving] = useState(false);
  const [dashMsg, setDashMsg] = useState({ type: '', text: '' });

  const handleDashSubmit = async e => {
    e.preventDefault();
    if (dashForm.dashboardPassword !== dashForm.confirmDashboardPassword) {
      setDashMsg({ type: 'error', text: 'Dashboard passwords do not match.' });
      return;
    }
    setDashSaving(true);
    setDashMsg({ type: '', text: '' });
    try {
      await api.post('/profile/dashboard-password', {
        currentPassword: dashForm.currentPassword,
        dashboardPassword: dashForm.dashboardPassword
      });
      setDashMsg({ type: 'success', text: 'Dashboard password updated!' });
      setDashForm({ currentPassword: '', dashboardPassword: '', confirmDashboardPassword: '' });
    } catch (err) {
      const data = err.response?.data
      let text = data?.message || data?.error || 'Failed to update dashboard password.'
      
      if (data?.details?.fields) {
        text = `Required fields missing: ${data.details.fields.join(', ')}`
      }
      setDashMsg({ type: 'error', text });
    } finally {
      setDashSaving(false);
    }
  };

  const hasDashboardRole = ['seller', 'marketer', 'admin', 'super_admin', 'superadmin', 'delivery_agent', 'logistics_manager', 'finance_manager']
    .some(r => user?.role === r || user?.roles?.includes(r));

  // ── Icons ─────────────────────────────────────────────────────────────────
  const UserIcon = () => (
    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
  const PhoneIcon = () => (
    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
  const MailIcon = () => (
    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
  const LockIcon = () => (
    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>

      {/* ── Basic Info ─────────────────────────────────────────────────────── */}
      <Section title="Basic Information" subtitle="Update your display name and bio" icon={<UserIcon />}>
        <Alert type={profileMsg.type} text={profileMsg.text} />
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <InputRow label="Full Name">
            <input
              type="text"
              value={profileForm.name}
              onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
              className={inputCls}
              required
            />
          </InputRow>
          <InputRow label="About You">
            <textarea
              rows={3}
              value={profileForm.bio}
              onChange={e => setProfileForm(p => ({ ...p, bio: e.target.value }))}
              placeholder="Tell us a bit about yourself…"
              className={inputCls}
            />
          </InputRow>
          <div className="flex justify-end gap-3 pt-2">
            <SecondaryBtn
              onClick={() => setProfileForm({ name: user?.name || '', bio: user?.bio || '' })}
              disabled={profileSaving}
            >
              Reset
            </SecondaryBtn>
            <PrimaryBtn type="submit" loading={profileSaving}>Save Changes</PrimaryBtn>
          </div>
        </form>
      </Section>

      {/* ── Phone Change ───────────────────────────────────────────────────── */}
      <Section
        title="Change Phone Number"
        subtitle={user?.phone ? `Current: ${user.phone}` : 'No phone on file'}
        icon={<PhoneIcon />}
      >
        <Alert type={phoneMsg.type} text={phoneMsg.text} />

        {phoneStep === 'done' ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 font-medium">Phone updated! ✅</span>
            <SecondaryBtn onClick={resetPhone}>Change Again</SecondaryBtn>
          </div>
        ) : phoneStep === 'awaiting_otp' ? (
          <OtpConfirm
            label="Enter the OTP sent to your new phone number (valid 10 minutes)"
            placeholder="123456"
            buttonLabel="Verify OTP"
            loading={phoneLoading}
            onConfirm={confirmPhoneOtp}
            onCancel={resetPhone}
          />
        ) : (
          <div className="space-y-4">
            <InputRow label="New Phone Number" hint="Kenyan format: +254 7XX XXX XXX">
              <input
                type="tel"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="+254 7XX XXX XXX"
                className={inputCls}
              />
            </InputRow>
            <InputRow label="Send OTP via">
              <div className="flex gap-3 mt-1">
                {['whatsapp', 'sms'].map(m => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="phoneMethod"
                      value={m}
                      checked={phoneMethod === m}
                      onChange={() => setPhoneMethod(m)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm font-medium capitalize text-gray-700">{m === 'whatsapp' ? '💬 WhatsApp' : '📱 SMS'}</span>
                  </label>
                ))}
              </div>
            </InputRow>
            <PrimaryBtn loading={phoneLoading} onClick={requestPhoneOtp}>
              Send OTP
            </PrimaryBtn>
          </div>
        )}
      </Section>

      {/* ── Email Change ───────────────────────────────────────────────────── */}
      <Section
        title="Change Email Address"
        subtitle={user?.email ? `Current: ${user.email}` : 'No email on file'}
        icon={<MailIcon />}
      >
        <Alert type={emailMsg.type} text={emailMsg.text} />

        {emailStep === 'done' ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 font-medium">Email updated! ✅</span>
            <SecondaryBtn onClick={resetEmail}>Change Again</SecondaryBtn>
          </div>
        ) : emailStep === 'awaiting_token' ? (
          <OtpConfirm
            label="Enter the 6-digit code sent to your new email address (valid 1 hour)"
            placeholder="123456"
            buttonLabel="Verify Code"
            loading={emailLoading}
            onConfirm={confirmEmailToken}
            onCancel={resetEmail}
          />
        ) : (
          <div className="space-y-4">
            <InputRow label="New Email Address">
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="newemail@example.com"
                className={inputCls}
              />
            </InputRow>
            <p className="text-xs text-gray-500">
              A verification code will be sent to the <strong>new</strong> email address. You must enter it to complete the change.
            </p>
            <PrimaryBtn loading={emailLoading} onClick={requestEmailChange}>
              Send Verification Code
            </PrimaryBtn>
          </div>
        )}
      </Section>

      {/* ── Dashboard Password (role-gated) ───────────────────────────────── */}
      {hasDashboardRole && (
        <Section
          title="Dashboard Security"
          subtitle="Secondary password for dashboard access"
          icon={<LockIcon />}
        >
          {!showDashboard ? (
            <button
              onClick={() => setShowDashboard(true)}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline"
            >
              {user?.dashboardPassword ? 'Change dashboard password →' : 'Set dashboard password →'}
            </button>
          ) : (
            <>
              <Alert type={dashMsg.type} text={dashMsg.text} />
              <form onSubmit={handleDashSubmit} className="space-y-4">
                <InputRow label="Current Account Password">
                  <input
                    type="password"
                    required
                    value={dashForm.currentPassword}
                    onChange={e => setDashForm(p => ({ ...p, currentPassword: e.target.value }))}
                    placeholder="Your main account password"
                    className={inputCls}
                  />
                </InputRow>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputRow label="New Dashboard Password">
                    <input
                      type="password"
                      required
                      value={dashForm.dashboardPassword}
                      onChange={e => setDashForm(p => ({ ...p, dashboardPassword: e.target.value }))}
                      className={inputCls}
                    />
                  </InputRow>
                  <InputRow label="Confirm Dashboard Password">
                    <input
                      type="password"
                      required
                      value={dashForm.confirmDashboardPassword}
                      onChange={e => setDashForm(p => ({ ...p, confirmDashboardPassword: e.target.value }))}
                      className={inputCls}
                    />
                  </InputRow>
                </div>
                <div className="flex gap-3 pt-1">
                  <PrimaryBtn type="submit" loading={dashSaving}>
                    {user?.dashboardPassword ? 'Update Password' : 'Set Password'}
                  </PrimaryBtn>
                  <SecondaryBtn onClick={() => { setShowDashboard(false); setDashMsg({ type: '', text: '' }); }}>
                    Cancel
                  </SecondaryBtn>
                </div>
              </form>
            </>
          )}
        </Section>
      )}
    </div>
  );
};

export default ProfileSettings;
