import React, { useState } from 'react';
import { FaLock, FaShieldAlt, FaEye, FaEyeSlash, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const ForcePasswordChangeModal = ({ isOpen, user }) => {
  const { logout, updateUser } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/auth/force-change-password', { newPassword });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          // Update the user context to remove the mustChangePassword flag
          // This will cause the modal to unmount automatically since it's typically 
          // rendered based on user.mustChangePassword
          updateUser({ mustChangePassword: false });
        }, 2000);
      }
    } catch (err) {
      const data = err.response?.data
      let msg = data?.message || data?.error || 'Failed to update password. Please try again.'
      
      if (data?.details?.fields) {
        msg = `Validation error for: ${data.details.fields.join(', ')}`
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-300">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-center relative">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10">
            <FaShieldAlt className="w-64 h-64 -rotate-12 absolute -top-10 -left-10 text-white" />
          </div>
          
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30 backdrop-blur-md shadow-inner">
            <FaLock className="text-white text-3xl" />
          </div>
          
          <h2 className="text-2xl font-black text-white mb-2">Security Update Required</h2>
          <p className="text-blue-100 text-sm font-medium">
            For your protection, you must set a new secure password before continuing.
          </p>
        </div>

        <div className="p-8">
          {success ? (
            <div className="text-center py-6 animate-in slide-in-from-bottom duration-500">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaCheckCircle className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Password Updated!</h3>
              <p className="text-gray-500 text-sm">Welcome back. Launching your dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-xs font-bold flex items-center gap-3">
                  <FaExclamationCircle className="text-lg flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                    placeholder="Create a strong password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  placeholder="Repeat your password"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-xl shadow-gray-200 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Secure My Account'
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full mt-3 text-gray-400 hover:text-gray-600 text-xs font-black uppercase tracking-widest transition-colors py-2"
                >
                  Logout and try later
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChangeModal;
