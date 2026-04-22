import React, { useState, useEffect } from 'react';
import {
    FaMoneyBillWave, FaWallet, FaCheckCircle, FaClock, FaArrowRight,
    FaTruck, FaMotorcycle, FaWarehouse, FaMapMarkerAlt, FaChevronDown,
    FaChevronUp, FaSearch, FaClipboardCheck, FaExclamationCircle, FaTimes
} from 'react-icons/fa';

import { formatPrice } from '../../../utils/currency';
import { resolveImageUrl } from '../../../utils/imageUtils';
import api from '../../../services/api';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import DeliveryTaskConsole from '../../../components/delivery/DeliveryTaskConsole';

// Helpers
const getDeliveryLabel = (type) => ({
    seller_to_customer: 'Seller → Customer',
    seller_to_warehouse: 'Seller → Warehouse',
    warehouse_to_customer: 'Warehouse → Customer',
    customer_to_warehouse: 'Customer → Warehouse',
}[type] || type?.replace(/_/g, ' ') || 'Standard');

const DeliveryTypeIcon = ({ type }) => {
    if (type?.includes('warehouse')) return <FaWarehouse className="text-indigo-500" />;
    return <FaMotorcycle className="text-blue-500" />;
};

const getOrderItemImage = (item) => {
    if (item.FastFood || item.fastFood) return item.FastFood?.mainImage || item.fastFood?.mainImage;
    if (item.Product || item.product) {
        const p = item.Product || item.product;
        return p.coverImage || p.mainImage || (Array.isArray(p.images) && p.images[0]) || null;
    }
    return null;
};

const getStatusInfo = (status) => {
    switch (status) {
        case 'ready_for_pickup':
            return { label: 'Ready for Pickup', color: 'yellow', bg: 'bg-yellow-100', icon: <FaClock className="text-yellow-600" /> };
        case 'in_transit':
            return { label: 'In Transit', color: 'blue', bg: 'bg-blue-100', icon: <FaTruck className="text-blue-600" /> };
        case 'en_route_to_warehouse':
            return { label: 'To Warehouse', color: 'indigo', bg: 'bg-indigo-100', icon: <FaTruck className="text-indigo-600" /> };
        case 'delivered':
            return { label: 'Delivered', color: 'green', bg: 'bg-green-100', icon: <FaCheckCircle className="text-green-600" /> };
        case 'failed':
            return { label: 'Failed Delivery', color: 'red', bg: 'bg-red-100', icon: <FaExclamationCircle className="text-red-600" /> };
        default:
            return { label: status?.replace(/_/g, ' ').toUpperCase(), color: 'gray', bg: 'bg-gray-100', icon: <FaClipboardCheck className="text-gray-500" /> };
    }
};

const DeliveryWallet = () => {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');
    const [walletData, setWalletData] = useState({ balance: 0, pendingBalance: 0, successBalance: 0, transactions: [] });
    const [orders, setOrders] = useState([]);
    const [expandedOrders, setExpandedOrders] = useState(new Set());
    const [agentSharePercent, setAgentSharePercent] = useState(70);
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleWalletCount, setVisibleWalletCount] = useState(10);
    const [toast, setToast] = useState(null);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('mpesa');
    const [mpesaNumber, setMpesaNumber] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };



    useEffect(() => {
        fetchAll();
        const interval = setInterval(() => {
            fetchAll(false);
        }, 30000); // Increased from 5s to 30s to reduce API spam
        return () => clearInterval(interval);
    }, []);

    const fetchAll = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const [walletRes, configRes] = await Promise.all([
                api.get('/delivery/wallet'),
                api.get('/finance/config').catch(() => ({ data: { agentShare: 70 } }))
            ]);
            setWalletData(walletRes.data);
            setAgentSharePercent(configRes.data.agentShare || 70);
        } catch (err) {
            console.error('Failed to fetch wallet data:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleOrder = (id) => {
        setExpandedOrders(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearchTerm('');
        setVisibleWalletCount(10);
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        const amount = parseFloat(withdrawAmount);

        if (isNaN(amount) || amount <= 0) {
            showToast('Please enter a valid amount.', 'error');
            return;
        }
        if (amount > walletData.balance) {
            showToast('Insufficient balance.', 'error');
            return;
        }
        const minPayout = walletData.minPayout || 0;
        if (minPayout > 0 && amount < minPayout) {
            showToast(`Minimum withdrawal amount is KES ${minPayout}.`, 'error');
            return;
        }
        if (paymentMethod === 'mpesa' && !mpesaNumber) {
            showToast('Please enter your M-Pesa number.', 'error');
            return;
        }
        if (paymentMethod === 'bank' && (!bankName || !accountNumber)) {
            showToast('Please enter your bank name and account number.', 'error');
            return;
        }

        // Build structured payment details for admin visibility
        const paymentMeta = paymentMethod === 'mpesa'
            ? { method: 'mpesa', mpesaNumber }
            : { method: 'bank', bankName, accountNumber };

        setSubmitting(true);
        try {
            const res = await api.post('/wallet/withdraw', { 
                amount,
                paymentMethod,
                paymentDetails: paymentMethod === 'mpesa' ? mpesaNumber : `${bankName} / ${accountNumber}`,
                paymentMeta
            });
            showToast(res.data.message || 'Withdrawal request submitted successfully!');
            setShowWithdrawModal(false);
            setWithdrawAmount('');
            setMpesaNumber('');
            setBankName('');
            setAccountNumber('');
            fetchAll(false);
        } catch (err) {
            console.error('Withdrawal failed:', err);
            showToast(err.response?.data?.error || 'Failed to submit withdrawal request.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Filter transactions based on active tab and search
    const filteredTransactions = (walletData.transactions || []).filter(tx => {
        const matchesTab = tx.status === activeTab || (activeTab === 'paid' && tx.status === 'completed');
        const matchesSearch = (tx.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
            || (tx.description || '').toLowerCase().includes(searchTerm.toLowerCase());
        return matchesTab && matchesSearch;
    });

    const tabLabels = {
        pending: { icon: <FaClock />, label: 'Pending', color: 'orange' },
        success: { icon: <FaCheckCircle />, label: 'Success (Cleared)', color: 'green' },
        paid: { icon: <FaMoneyBillWave />, label: 'Paid Out', color: 'blue' },
    };

    if (loading) {
        return <div className="flex h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;
    }

    return (
        <div className="p-4 md:p-6 space-y-8 animate-fadeIn max-w-5xl mx-auto">

            {/* ── Header ── */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Delivery Wallet</h1>
                <p className="text-gray-500 text-sm">Manage your earnings and payouts</p>
            </div>

            {/* ── Balance Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Withdrawable */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-blue-100 font-medium text-sm">Available (Paid)</span>
                            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
                                <FaCheckCircle className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold mb-4">{formatPrice(walletData.balance)}</div>
                        <button 
                            onClick={() => setShowWithdrawModal(true)}
                            className="bg-white text-blue-700 w-full py-2 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center group"
                        >
                            Withdraw <FaArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>

                {/* Toast Overlay */}
                {toast && (
                    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl text-white text-sm font-bold flex items-center gap-3 animate-slideUp ${toast.type === 'error' ? 'bg-red-600' : toast.type === 'info' ? 'bg-blue-600' : 'bg-green-600'}`}>
                        {toast.type === 'error' ? <FaExclamationCircle /> : toast.type === 'info' ? <FaWallet /> : <FaCheckCircle />}
                        {toast.message}
                        <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100">&times;</button>
                    </div>
                )}

                {/* Success / Cleared */}
                <div className="bg-white border border-green-100 rounded-2xl p-6 shadow-sm bg-green-50/20">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <span className="text-green-600 font-medium text-sm">Success (Cleared)</span>
                            <div className="text-3xl font-bold mt-1 text-gray-900">{formatPrice(walletData.successBalance)}</div>
                        </div>
                        <div className="bg-green-100 p-3 rounded-xl text-green-600"><FaCheckCircle className="w-6 h-6" /></div>
                    </div>
                    <p className="text-[10px] text-green-600 leading-relaxed font-medium">
                        {walletData.autoPayoutEnabled 
                           ? 'Automated Payouts are Active. Cleared funds move to "Paid" automatically.' 
                           : 'Task completed. Awaiting admin payout to your available balance.'}
                    </p>
                </div>

                {/* Pending */}
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <span className="text-gray-500 font-medium text-sm">Pending Payment</span>
                            <div className="text-3xl font-bold mt-1 text-gray-900">{formatPrice(walletData.pendingBalance)}</div>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-xl text-orange-500"><FaClock className="w-6 h-6" /></div>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed">Earnings from tasks in progress. Clears after task completion.</p>
                </div>
            </div>

            {/* ── Earning Records — Transaction-based ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header + Search */}
                <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <h2 className="text-base font-bold text-gray-800 flex items-center">
                        <FaWallet className="mr-2 text-blue-500" /> Earning Records
                    </h2>
                    <div className="relative w-full md:w-56">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                        <input
                            type="text" placeholder="Search order # or desc"
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm w-full outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 h-14 bg-gray-50/50">
                    {Object.entries(tabLabels).map(([key, { label }]) => (
                        <button
                            key={key} onClick={() => handleTabChange(key)}
                            className={`flex-1 flex items-center justify-center font-bold text-sm transition-all relative ${activeTab === key ? 'text-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {label}
                            {activeTab === key && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600" />}
                        </button>
                    ))}
                </div>

                {/* Transaction Cards */}
                <div className="divide-y divide-gray-50 min-h-[300px]">
                    {filteredTransactions.slice(0, visibleWalletCount).length > 0 ? filteredTransactions.slice(0, visibleWalletCount).map((tx) => {
                        const isExpanded = expandedOrders.has(tx.id);
                        const txDate = new Date(tx.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
                        const txTime = new Date(tx.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                        // Prepare order object for DeliveryTaskConsole
                        const orderObj = tx.order ? {
                            ...tx.order,
                            OrderItems: tx.orderItems?.map(oi => ({
                                ...oi,
                                deliveryFee: oi.deliveryFee // Already provided by backend
                            }))
                        } : null;

                        // Identify the specific task from the order's tasks that matches this transaction
                        const taskObj = tx.order?.deliveryTasks?.find(t =>
                            tx.description.includes(t.deliveryType) ||
                            Math.abs(t.agentEarnings - tx.amount) < 0.01
                        ) || (tx.order?.deliveryTasks && [...tx.order.deliveryTasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]);

                        return (
                            <div key={tx.id} className="p-1">
                                {orderObj ? (
                                    <DeliveryTaskConsole
                                        order={orderObj}
                                        task={taskObj}
                                        agentSharePercent={taskObj?.agentShare || agentSharePercent}
                                        isExpanded={isExpanded}
                                        onToggleExpand={() => toggleOrder(tx.id)}
                                    >
                                        <div className="flex items-center justify-between w-full mt-4 bg-white border border-blue-50 rounded-xl p-4 shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-2 rounded-lg bg-blue-100`}>
                                                    <FaTruck className="text-blue-600" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">Transaction Date</p>
                                                    <p className="text-xs font-bold text-gray-900">{txDate} at {txTime}</p>
                                                    <p className="text-[9px] text-blue-500 font-medium">{tx.description}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-green-600 font-bold uppercase mb-0.5">Net Earnings</p>
                                                <p className="text-lg font-black text-green-600">+{formatPrice(tx.amount)}</p>
                                            </div>
                                        </div>
                                    </DeliveryTaskConsole>
                                ) : (
                                    <div className="p-4 bg-white border border-gray-100 rounded-xl mb-2 flex justify-between items-center">
                                        <div>
                                            <p className="text-sm font-bold text-gray-800">{tx.description}</p>
                                            <p className="text-xs text-gray-500">{txDate} at {txTime}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-green-600">+{formatPrice(tx.amount)}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">{tx.status}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    }) : (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400">
                            <FaWallet className="w-12 h-12 mb-4 opacity-10" />
                            <p className="font-medium">No {activeTab} records found</p>
                        </div>
                    )}

                    {/* Load More */}
                    {filteredTransactions.length > visibleWalletCount && (
                        <div className="p-4 text-center">
                            <button
                                onClick={() => setVisibleWalletCount(c => c + 10)}
                                className="px-6 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-sm rounded-xl border border-blue-200 transition-all"
                            >
                                Load More ({filteredTransactions.length - visibleWalletCount} remaining)
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Withdrawal Modal */}
            {showWithdrawModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full relative overflow-hidden flex flex-col">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white relative">
                            <button
                                onClick={() => setShowWithdrawModal(false)}
                                className="absolute top-2 right-2 p-3 bg-red-600 text-white font-bold text-lg rounded-full shadow-lg hover:bg-red-700 transition-all z-50"
                            >
                                X
                            </button>
                            <FaWallet className="text-4xl mb-4 opacity-50" />
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-0">Request Payout</h3>
                            <p className="text-blue-100 font-bold text-sm mt-1">Transfer funds to your account</p>
                        </div>

                        <div className="p-8">
                            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 mb-8 flex items-center justify-between">
                                <span className="text-blue-800 font-black uppercase text-[10px]">Available</span>
                                <span className="text-blue-900 font-black text-xl font-mono">{formatPrice(walletData.balance)}</span>
                            </div>

                            <form onSubmit={handleWithdraw}>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount to Withdraw (KES)</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <span className="text-gray-400 font-black">KES</span>
                                            </div>
                                            <input
                                                type="number"
                                                value={withdrawAmount}
                                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                                placeholder="0.00"
                                                required
                                                min={walletData.minPayout || 1}
                                                max={walletData.balance}
                                                className={`w-full pl-14 pr-4 py-4 bg-gray-50 border rounded-2xl text-xl font-black focus:outline-none focus:ring-4 transition-all font-mono ${
                                                    withdrawAmount && parseFloat(withdrawAmount) > 0 && parseFloat(withdrawAmount) < (walletData.minPayout || 0)
                                                        ? 'border-red-400 focus:ring-red-500/10 focus:border-red-500'
                                                        : 'border-gray-200 focus:ring-blue-500/10 focus:border-blue-500'
                                                }`}
                                            />
                                        </div>
                                        {walletData.minPayout > 0 && (
                                            <p className={`text-[11px] font-bold mt-2 ${
                                                withdrawAmount && parseFloat(withdrawAmount) > 0 && parseFloat(withdrawAmount) < walletData.minPayout
                                                    ? 'text-red-500'
                                                    : 'text-gray-400'
                                            }`}>
                                                Minimum withdrawal: {formatPrice(walletData.minPayout)}
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 font-inter">Payment Method</label>
                                            <select
                                                value={paymentMethod}
                                                onChange={(e) => {
                                                    setPaymentMethod(e.target.value);
                                                    setMpesaNumber('');
                                                    setBankName('');
                                                    setAccountNumber('');
                                                }}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                                            >
                                                <option value="mpesa">M-Pesa</option>
                                                <option value="bank">Bank Transfer</option>
                                            </select>
                                        </div>

                                        {paymentMethod === 'mpesa' && (
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">M-Pesa Number</label>
                                                <input
                                                    type="tel"
                                                    value={mpesaNumber}
                                                    onChange={(e) => setMpesaNumber(e.target.value)}
                                                    placeholder="e.g. 2547XXXXXXXX"
                                                    required
                                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all font-mono"
                                                />
                                            </div>
                                        )}

                                        {paymentMethod === 'bank' && (
                                            <>
                                                <div>
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Bank Name</label>
                                                    <input
                                                        type="text"
                                                        value={bankName}
                                                        onChange={(e) => setBankName(e.target.value)}
                                                        placeholder="e.g. Equity Bank, KCB, Co-op"
                                                        required
                                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Account Number</label>
                                                    <input
                                                        type="text"
                                                        value={accountNumber}
                                                        onChange={(e) => setAccountNumber(e.target.value)}
                                                        placeholder="Enter your bank account number"
                                                        required
                                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all font-mono"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-start gap-4">
                                        <FaExclamationCircle className="text-blue-500 mt-1 flex-shrink-0" />
                                        <p className="text-[11px] text-blue-800 font-bold leading-relaxed">
                                            {walletData.autoPayoutEnabled 
                                                ? 'Manual withdrawals are available even when automated payouts are ON for faster settlement.'
                                                : 'Payouts are processed within 24-48 hours after request approval.'}
                                        </p>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={submitting || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                                        className="w-full py-5 bg-gray-900 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-gray-200 hover:bg-black hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2"
                                    >
                                        {submitting ? (
                                            <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>Confirm Withdrawal <FaArrowRight /></>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeliveryWallet;
