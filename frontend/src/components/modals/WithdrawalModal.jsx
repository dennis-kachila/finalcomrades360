import React, { useState, useEffect } from 'react';
import { 
    FaTimes, 
    FaMoneyBillWave, 
    FaMobileAlt, 
    FaUniversity, 
    FaExclamationCircle, 
    FaCheckCircle, 
    FaSpinner, 
    FaArrowRight,
    FaInfoCircle
} from 'react-icons/fa';
import api from '../../services/api';

const formatPrice = (amount) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

const WithdrawalModal = ({ isOpen, onClose, balance, role, onSuccess }) => {
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('mpesa');
    const [mpesaNumber, setMpesaNumber] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');
    
    // Config states
    const [financeSettings, setFinanceSettings] = useState(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Load finance settings (tiers & min payout)
    useEffect(() => {
        if (isOpen) {
            const fetchConfig = async () => {
                setLoadingConfig(true);
                try {
                    const res = await api.get('/platform/config/finance_settings');
                    setFinanceSettings(res.data.data || {});
                } catch (err) {
                    console.error('Failed to fetch finance settings:', err);
                } finally {
                    setLoadingConfig(false);
                }
            };
            fetchConfig();

            // Default M-Pesa number from user if available
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            if (user.phone) setMpesaNumber(user.phone);
            if (user.name) setAccountName(user.name);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Calculation Logic
    const minPayout = (financeSettings?.minPayout || {})[role] || 500;
    const tiers = financeSettings?.withdrawalTiers || [];
    
    const numAmount = parseFloat(amount) || 0;
    let fee = 0;
    if (numAmount > 0) {
        const matchingTier = tiers.find(t => numAmount >= t.min && numAmount <= t.max);
        if (matchingTier) {
            fee = matchingTier.fee;
        } else if (tiers.length > 0) {
            fee = tiers[tiers.length - 1].fee; // fallback to last tier fee
        }
    }
    const netAmount = Math.max(0, numAmount - fee);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (numAmount < minPayout) {
            setError(`Minimum withdrawal amount is KES ${minPayout}`);
            return;
        }

        if (numAmount > balance) {
            setError('Insufficient balance');
            return;
        }

        if (paymentMethod === 'mpesa' && !mpesaNumber) {
            setError('M-Pesa number is required');
            return;
        }

        if (paymentMethod === 'bank' && (!bankName || !accountNumber || !accountName)) {
            setError('All bank details are required');
            return;
        }

        setSubmitting(true);
            // Standardized unified endpoint
            const endpoint = '/wallet/withdraw';

            const payload = {
                amount: numAmount,
                paymentMethod,
                paymentDetails: paymentMethod === 'mpesa' ? mpesaNumber : accountNumber,
                paymentMeta: {
                    mpesaNumber: paymentMethod === 'mpesa' ? mpesaNumber : undefined,
                    bankName: paymentMethod === 'bank' ? bankName : undefined,
                    accountNumber: paymentMethod === 'bank' ? accountNumber : undefined,
                    accountName: paymentMethod === 'bank' ? accountName : undefined,
                    withdrawalFee: fee,
                    netAmountToPay: netAmount
                }
            };

            await api.post(endpoint, payload);
            onSuccess && onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit withdrawal request');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300" style={{ maxHeight: '95vh' }}>
                {/* Header */}
                <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 p-8 text-white relative">
                    <button 
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-all"
                    >
                        <FaTimes className="text-sm" />
                    </button>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                            <FaMoneyBillWave className="text-2xl" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">Withdraw Funds</h3>
                            <p className="text-indigo-100 text-sm font-bold opacity-80">Safe & Secure Disbursement</p>
                        </div>
                    </div>
                </div>

                {loadingConfig ? (
                    <div className="p-20 flex flex-col items-center justify-center text-gray-400">
                        <FaSpinner className="animate-spin text-3xl mb-4 text-indigo-500" />
                        <p className="font-bold text-sm uppercase tracking-widest">Loading Settings...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto">
                        {/* Amount Input */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Withdrawal Amount</label>
                                <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">
                                    Min: {formatPrice(minPayout)}
                                </span>
                            </div>
                            <div className="relative group text-left">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-gray-300 group-focus-within:text-indigo-500 transition-colors">KES</span>
                                <input 
                                    type="number"
                                    required
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full pl-20 pr-6 py-5 bg-gray-50 border-2 border-gray-100 rounded-2xl text-3xl font-black focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                />
                            </div>
                            
                            {/* Calculation Banner */}
                            {numAmount > 0 && (
                                <div className="bg-gray-50 border border-gray-100 rounded-3xl p-5 space-y-3 animate-in slide-in-from-top-2">
                                    <div className="flex justify-between items-center text-sm font-bold">
                                        <span className="text-gray-500">Processing Fee</span>
                                        <span className="text-red-500">-{formatPrice(fee)}</span>
                                    </div>
                                    <div className="pt-3 border-t-2 border-dashed border-gray-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Net Amount</span>
                                            <FaInfoCircle className="text-gray-300 text-xs" title="This is exactly what will hit your account" />
                                        </div>
                                        <span className="text-xl font-black text-indigo-600">{formatPrice(netAmount)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Payment Method Selector */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Choose Payment Method</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('mpesa')}
                                    className={`flex flex-col items-center justify-center p-5 rounded-3xl border-2 transition-all gap-2 ${paymentMethod === 'mpesa' ? 'bg-green-50 border-green-500 shadow-md' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                                >
                                    <FaMobileAlt className={paymentMethod === 'mpesa' ? 'text-green-600 text-2xl' : 'text-gray-300 text-2xl'} />
                                    <span className={`text-[11px] font-black uppercase tracking-wider ${paymentMethod === 'mpesa' ? 'text-green-700' : 'text-gray-400'}`}>M-Pesa</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('bank')}
                                    className={`flex flex-col items-center justify-center p-5 rounded-3xl border-2 transition-all gap-2 ${paymentMethod === 'bank' ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                                >
                                    <FaUniversity className={paymentMethod === 'bank' ? 'text-blue-600 text-2xl' : 'text-gray-300 text-2xl'} />
                                    <span className={`text-[11px] font-black uppercase tracking-wider ${paymentMethod === 'bank' ? 'text-blue-700' : 'text-gray-400'}`}>Bank Transfer</span>
                                </button>
                            </div>
                        </div>

                        {/* Dynamic Fields */}
                        <div className="animate-in fade-in duration-500">
                            {paymentMethod === 'mpesa' ? (
                                <div className="space-y-2 text-left">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">M-Pesa Registered Number</label>
                                    <input 
                                        type="text"
                                        required
                                        value={mpesaNumber}
                                        onChange={e => setMpesaNumber(e.target.value)}
                                        placeholder="e.g. 07XXXXXXXX"
                                        className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:border-green-500 transition-all text-left"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4 text-left">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bank Name</label>
                                            <input 
                                                type="text"
                                                required
                                                value={bankName}
                                                onChange={e => setBankName(e.target.value)}
                                                className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account #</label>
                                            <input 
                                                type="text"
                                                required
                                                value={accountNumber}
                                                onChange={e => setAccountNumber(e.target.value)}
                                                className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Name</label>
                                        <input 
                                            type="text"
                                            required
                                            value={accountName}
                                            onChange={e => setAccountName(e.target.value)}
                                            className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 text-xs font-bold animate-shake">
                                <FaExclamationCircle className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting || numAmount <= 0}
                            className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs tracking-widest rounded-[1.5rem] shadow-xl shadow-indigo-100 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3 active:scale-95"
                        >
                            {submitting ? (
                                <FaSpinner className="animate-spin text-lg" />
                            ) : (
                                <>
                                    Confirm Withdrawal
                                    <FaArrowRight className="text-[10px] opacity-60" />
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default WithdrawalModal;
