import React, { useState, useEffect } from 'react';
import { FaMoneyBillWave, FaWallet, FaHistory, FaCheckCircle, FaClock, FaArrowRight, FaStore, FaImage, FaPaperclip } from 'react-icons/fa';
import { formatPrice } from '../../utils/currency';
import api from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import WithdrawalModal from '../../components/modals/WithdrawalModal';

const SellerWallet = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'success', or 'paid'
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [walletData, setWalletData] = useState({
    balance: 0,
    pendingBalance: 0,
    successBalance: 0,
    transactions: []
  });

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/seller/wallet');
      setWalletData(res.data);
    } catch (error) {
      console.error('Failed to fetch wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const [expandedTx, setExpandedTx] = useState(null);

  const filteredTransactions = (walletData.transactions || []).filter(tx => {
    if (activeTab === 'pending') return tx.status === 'pending';
    if (activeTab === 'success') return tx.status === 'success';
    return tx.status === 'completed' || tx.status === 'paid';
  });

  const toggleExpand = (id) => {
    setExpandedTx(expandedTx === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
    <div className="p-0 sm:p-6 space-y-8 animate-fadeIn">
      {/* Header Section */}
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">Seller Wallet</h1>
          <p className="text-sm text-gray-500">Manage your earnings and withdrawals</p>
        </div>
        <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-full">
          <FaStore className="text-blue-500" />
          <span>Seller Account</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
        {/* Available Balance */}
        <div className="bg-gradient-to-br from-green-600 to-teal-700 rounded-2xl p-4 md:p-6 text-white shadow-lg overflow-hidden relative col-span-2 md:col-span-1">
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <span className="text-green-100 font-medium">Available (Paid)</span>
              <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
                <FaCheckCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="text-3xl font-bold mb-4">{formatPrice(walletData.balance)}</div>
            <button 
              onClick={() => setShowWithdrawModal(true)}
              className="bg-white text-green-700 w-full py-2 rounded-xl font-bold text-sm hover:bg-green-50 transition-colors flex items-center justify-center group"
            >
              Withdraw
              <FaArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Success/Cleared Balance */}
        <div className="bg-white border border-green-100 rounded-2xl p-6 shadow-sm relative overflow-hidden bg-green-50/20">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-green-600 font-medium">Success (Cleared)</span>
              <div className="text-3xl font-bold mt-1 text-gray-900">{formatPrice(walletData.successBalance)}</div>
            </div>
            <div className="bg-green-100 p-3 rounded-xl text-green-600">
              <FaHistory className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[10px] text-green-600 mt-4 leading-relaxed font-medium">
            Order delivered. Awaiting admin clearance to your available balance.
          </p>
        </div>

        {/* Pending Balance */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-gray-500 font-medium">Pending Payments</span>
              <div className="text-3xl font-bold mt-1 text-gray-900">{formatPrice(walletData.pendingBalance)}</div>
            </div>
            <div className="bg-orange-50 p-3 rounded-xl text-orange-500">
              <FaClock className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
            Earnings from recent orders. Clears after successful delivery.
          </p>
        </div>
      </div>

      {/* Transactions Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <FaHistory className="mr-2 text-green-500" />
            Transaction History
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 h-14 bg-gray-50/50">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 flex items-center justify-center font-bold text-sm transition-all relative ${activeTab === 'pending' ? 'text-green-600 bg-white' : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Pending
            {activeTab === 'pending' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-600"></div>}
          </button>
          <button
            onClick={() => setActiveTab('success')}
            className={`flex-1 flex items-center justify-center font-bold text-sm transition-all relative ${activeTab === 'success' ? 'text-green-600 bg-white' : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Success
            {activeTab === 'success' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-600"></div>}
          </button>
          <button
            onClick={() => setActiveTab('paid')}
            className={`flex-1 flex items-center justify-center font-bold text-sm transition-all relative ${activeTab === 'paid' ? 'text-green-600 bg-white' : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Paid
            {activeTab === 'paid' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-600"></div>}
          </button>
        </div>

        {/* List */}
        <div className="divide-y divide-gray-50 min-h-[400px]">
          {filteredTransactions.length > 0 ? (
            filteredTransactions.map((tx) => (
              <div key={tx.id} className="flex flex-col border-b border-gray-50">
                <div
                  onClick={() => toggleExpand(tx.id)}
                  className="p-6 hover:bg-gray-50/50 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-full ${tx.status === 'pending' ? 'bg-orange-50 text-orange-500' :
                      tx.status === 'success' ? 'bg-green-50 text-green-500' :
                        'bg-blue-50 text-blue-500'
                      }`}>
                      {tx.status === 'pending' ? <FaClock className="w-5 h-5" /> :
                        tx.status === 'success' ? <FaCheckCircle className="w-5 h-5" /> :
                          <FaMoneyBillWave className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{tx.orderNumber ? `Order #${tx.orderNumber}` : tx.description || 'Seller Transaction'}</h3>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(tx.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center space-x-4">
                    <div>
                      <div className={`text-lg font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-500'
                        }`}>
                        {tx.type === 'credit' ? '+' : '-'}{formatPrice(tx.amount)}
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider font-heavy px-2 py-0.5 rounded ${tx.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                        tx.status === 'success' ? 'bg-green-100 text-green-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                        {tx.status}
                      </span>
                    </div>
                    <div className={`transition-transform duration-200 ${expandedTx === tx.id ? 'rotate-90' : ''}`}>
                      <FaArrowRight className="text-gray-300" />
                    </div>
                  </div>
                </div>

                {/* Expanded Item Details */}
                {expandedTx === tx.id && (
                  <div className="px-6 pb-6 pt-2 bg-gray-50/30 animate-scaleDown">
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                      <h4 className="text-xs font-bold text-gray-700 mb-3 border-b border-gray-50 pb-2 uppercase tracking-wider">Item Details (Seller Base Prices)</h4>
                      {tx.orderItems && tx.orderItems.length > 0 ? (
                        <div className="space-y-3">
                          {tx.orderItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-800">{item.name}</span>
                                <span className="text-xs text-gray-500">Qty: {item.quantity}</span>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-blue-600">{formatPrice(item.basePrice || item.price)}</div>
                                <div className="text-[10px] text-gray-400">Base Price (Unmarked)</div>
                              </div>
                            </div>
                          ))}
                          <div className="pt-3 mt-3 border-t border-dashed border-gray-100 flex justify-between items-center font-bold">
                            <span className="text-gray-800">Total Seller Pay</span>
                            <span className="text-green-600">{formatPrice(tx.amount)}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">No itemized details available for this record.</p>
                      )}

                      {/* Payout Metadata/Proof */}
                      {(tx.metadata?.paymentReference || tx.metadata?.payoutProofUrl) && (
                        <div className="mt-4 pt-4 border-t border-gray-100 bg-blue-50/50 -mx-4 -mb-4 p-4 rounded-b-xl">
                          <h5 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <FaCheckCircle className="text-xs" /> Official Payout Confirmation
                          </h5>
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                            {tx.metadata.paymentReference && (
                              <div className="flex items-center gap-2 text-sm">
                                <FaPaperclip className="text-blue-400" />
                                <span className="text-gray-500">Ref:</span>
                                <span className="font-mono font-bold text-blue-900">{tx.metadata.paymentReference}</span>
                              </div>
                            )}
                            {tx.metadata.payoutProofUrl && (
                              <a 
                                href={tx.metadata.payoutProofUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95"
                              >
                                <FaImage /> View Proof Receipt
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <FaHistory className="w-12 h-12 mb-4 opacity-10" />
              <p className="font-medium">No {activeTab} records found</p>
            </div>
          )}
        </div>
      </div>

      <WithdrawalModal 
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSuccess={fetchWalletData}
        balance={walletData.balance}
        role="seller"
      />
    </div>
    </>
  );
};

export default SellerWallet;
