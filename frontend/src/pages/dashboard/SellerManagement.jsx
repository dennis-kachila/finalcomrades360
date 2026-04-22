import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/api';

export default function SellerManagement() {
    const [sellers, setSellers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [activeTab, setActiveTab] = useState('all-sellers');

    const resetAlerts = () => { setError(''); setSuccess(''); };

    const loadSellers = async () => {
        try {
            setLoading(true);
            const r = await adminApi.getAllUsers({ role: 'seller' });
            setSellers(r.data.users || []);
        } catch (e) {
            setError('Failed to load sellers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSellers();
    }, []);

    const suspendSeller = async (userId) => {
        const password = window.prompt('Please enter admin password to suspend this seller:');
        if (!password) return;
        resetAlerts();
        try {
            await adminApi.suspendSeller(userId, { adminPassword: password });
            setSuccess('Seller suspended from dashboard access');
            loadSellers();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to suspend seller');
        }
    };

    const reactivateSeller = async (userId) => {
        resetAlerts();
        try {
            await adminApi.reactivateSeller(userId);
            setSuccess('Seller reactivated');
            loadSellers();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to reactivate seller');
        }
    };

    const tabs = [
        { id: 'all-sellers', name: 'All Sellers', icon: '🏪' },
        { id: 'inventory', name: 'Inventory', icon: '📦' },
        { id: 'sales', name: 'Sales', icon: '💰' }
    ];

    const renderTabContent = () => {
        if (loading) return <div className="p-10 text-center">Loading...</div>;

        switch (activeTab) {
            case 'all-sellers':
                return (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h1 className="text-2xl font-bold text-gray-800">Seller Management</h1>
                            <button className="btn" onClick={loadSellers}>Refresh</button>
                        </div>

                        {error && <div className="p-3 rounded bg-red-100 text-red-700">{error}</div>}
                        {success && <div className="p-3 rounded bg-green-100 text-green-700">{success}</div>}

                        {sellers.length === 0 ? (
                            <div className="card p-6 text-center text-gray-600">No sellers found.</div>
                        ) : (
                            <div className="card">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-left border-b">
                                                <th className="p-3">Name</th>
                                                <th className="p-3">Email</th>
                                                <th className="p-3">Phone</th>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">Products</th>
                                                <th className="p-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sellers.map(seller => (
                                                <tr key={seller.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-medium">{seller.name}</td>
                                                    <td className="p-3">{seller.email}</td>
                                                    <td className="p-3">{seller.phone}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-1 rounded text-xs ${!seller.isSellerSuspended && !seller.isDeactivated
                                                                ? 'bg-green-100 text-green-800'
                                                                : 'bg-red-100 text-red-800'
                                                            }`}>
                                                            {seller.isSellerSuspended ? 'Seller Suspended' : seller.isDeactivated ? 'Global Deactivated' : 'Active'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-gray-500 italic">N/A</td>
                                                    <td className="p-3">
                                                        <div className="flex gap-2">
                                                            {!seller.isSellerSuspended ? (
                                                                <button
                                                                    className="btn-warning btn-xs"
                                                                    onClick={() => suspendSeller(seller.id)}
                                                                >
                                                                    Suspend
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="btn-success btn-xs"
                                                                    onClick={() => reactivateSeller(seller.id)}
                                                                >
                                                                    Reactivate
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                );
            default:
                return (
                    <div className="p-6 text-center text-gray-600">
                        <h2 className="text-xl font-semibold mb-4">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Dashboard</h2>
                        <p>This role-specific analytics section is coming soon.</p>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h1 className="text-2xl font-bold text-gray-800 mb-4">Seller Management</h1>
                <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            <span className="mr-2">{tab.icon}</span>
                            {tab.name}
                        </button>
                    ))}
                </div>
            </div>
            {renderTabContent()}
        </div>
    );
}
