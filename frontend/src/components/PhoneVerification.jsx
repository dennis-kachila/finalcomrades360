import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { toast } from 'react-toastify';

const PhoneVerification = ({ currentPhone, onVerified }) => {
  const [phoneNumber, setPhoneNumber] = useState(currentPhone || '');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Input Phone, 2: Input OTP
  const [method, setMethod] = useState('whatsapp'); // 'sms' or 'whatsapp'
  const [showDndHint, setShowDndHint] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // ── Web OTP API — auto-capture SMS code on mobile ─────────────────────────
  useEffect(() => {
    if (step !== 2 || method !== 'sms') return;
    if (!('OTPCredential' in window)) return;

    const ac = new AbortController();
    navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
    }).then(credential => {
        if (credential?.code) {
            const code = credential.code.replace(/\D/g, '').slice(0, 6);
            setVerificationCode(code);
            // Automatically trigger verification
            handleVerifyDirect(code);
        }
    }).catch(() => { /* user cancelled or not supported — silent */ });

    return () => ac.abort();
  }, [step, method]);

  // ── Multi-channel OTP monitoring (SMS, WhatsApp, Email) ──────────────────
  useEffect(() => {
    if (step !== 2) return;

    const socket = getSocket();
    if (!socket) return;

    const handleOtpReceived = (data) => {
      console.log('[OTP-Monitor] Received code via socket:', data);
      if (data.otp && (data.type === 'phoneVerification' || data.type === 'phoneChange')) {
        setVerificationCode(data.otp.toString());
        // Automatically trigger verification
        handleVerifyDirect(data.otp.toString());
      }
    };

    socket.on('otp:received', handleOtpReceived);
    return () => socket.off('otp:received', handleOtpReceived);
  }, [step]);

  const handleVerifyDirect = async (code) => {
    if (!code || code.length < 6) return;
    setLoading(true);
    try {
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
         formattedPhone = `+254${formattedPhone.replace(/^0/, '')}`;
      }
      const response = await api.post('/users/me/phone-otp/confirm', { 
        otp: code,
        phone: formattedPhone
      });
      if (response.data) {
        toast.success("Phone verified successfully!");
        if (onVerified) onVerified(phoneNumber);
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      const msg = error.response?.data?.message || "Invalid or expired verification code";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    if (!phoneNumber) {
      setErrorMsg("Please enter a phone number");
      return toast.error("Please enter a phone number");
    }

    setLoading(true);
    try {
      // Normalize number
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
         formattedPhone = `+254${formattedPhone.replace(/^0/, '')}`;
      }

      console.log(`Attempting to send OTP via ${method} to:`, formattedPhone);
      
      const response = await api.post('/users/me/phone-otp/request', { 
        newPhone: formattedPhone,
        method: method,
        socketId: getSocket()?.id
      });

      if (response.data) {
        setStep(2);
        toast.info(response.data.message || `Verification code sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}!`);
        // Show DND hint after a delay if they stay on this screen
        setTimeout(() => setShowDndHint(true), 15000);
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      const msg = error.response?.data?.message || "Failed to send verification code.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    if (!verificationCode) {
      setErrorMsg("Please enter the verification code");
      return toast.error("Please enter the verification code");
    }

    setLoading(true);
    try {
      // Normalize number just like in the request step
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
         formattedPhone = `+254${formattedPhone.replace(/^0/, '')}`;
      }

      const response = await api.post('/users/me/phone-otp/confirm', { 
        otp: verificationCode,
        phone: formattedPhone
      });

      if (response.data) {
        toast.success("Phone verified successfully!");
        if (onVerified) onVerified(phoneNumber);
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      const msg = error.response?.data?.message || "Invalid or expired verification code";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
      setStep(1);
      setVerificationCode('');
      setShowDndHint(false);
      setErrorMsg('');
  };

  const handleKeyDown = (e, callback) => {
    if (e.key === 'Enter') {
      callback();
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow-md border border-gray-100 mt-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="p-2 bg-blue-50 rounded-lg text-blue-600">📱</span>
        Phone Verification
      </h2>
      
      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleSendOtp)}
              placeholder="+254712345678"
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
          </div>

          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
               type="button"
               onClick={() => setMethod('sms')}
               className={`flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase transition-all ${
                 method === 'sms' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'
               }`}
            >
               SMS
            </button>
            <button
               type="button"
               onClick={() => setMethod('whatsapp')}
               className={`flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase transition-all ${
                 method === 'whatsapp' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'
               }`}
            >
               WhatsApp
            </button>
          </div>

          <button
            type="button"
            onClick={handleSendOtp}
            disabled={loading}
            className={`w-full py-3 px-4 rounded-xl text-white font-bold uppercase tracking-widest text-[11px] transition-all ${
              loading ? 'bg-blue-300 cursor-not-allowed' : (method === 'whatsapp' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700')
            } shadow-lg shadow-gray-100`}
          >
            {loading ? 'Sending...' : `Send Code via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
          </button>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="text-center mb-2">
             <p className="text-[11px] text-gray-500 italic">
                Sent to <strong>{phoneNumber}</strong> via <strong>{method.toUpperCase()}</strong>
             </p>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 text-center">Enter 6-Digit Code</label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleVerifyOtp)}
              placeholder="123456"
              autoComplete="one-time-code"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none text-center text-2xl font-black tracking-[0.5em]"
              maxLength="6"
            />
          </div>
          <button
            type="button"
            onClick={handleVerifyOtp}
            disabled={loading}
            className={`w-full py-3 px-4 rounded-xl text-white font-bold uppercase tracking-widest text-[11px] transition-all ${
              loading ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100'
            }`}
          >
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>
          
          <button
            type="button"
            onClick={resetFlow}
            className="w-full text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-blue-600 transition-colors"
          >
            Resend or Change Method
          </button>

          {showDndHint && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 animate-in fade-in zoom-in-95">
              <p className="text-[10px] text-amber-800 leading-tight">
                <strong>Still haven't received it?</strong> 
                {method === 'sms' ? (
                  <>
                    <br/> Dial <strong>*456*9*5#</strong> (Safaricom) or <strong>*100#</strong> (Airtel) to unblock messages.
                    <br/> Or try sending via <strong>WhatsApp</strong> instead.
                  </>
                ) : (
                  <>
                    <br/> Ensure you have an active internet connection and that <strong>{phoneNumber}</strong> is active on WhatsApp.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-[13px] leading-tight text-red-700 animate-in fade-in zoom-in font-medium flex items-start gap-2">
           <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};

export default PhoneVerification;
