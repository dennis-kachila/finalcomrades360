import React, { useEffect, useState, useMemo } from 'react';
import { 
    FaBell, 
    FaCheckCircle, 
    FaInfoCircle, 
    FaExclamationTriangle, 
    FaTimesCircle, 
    FaTrash, 
    FaCheckDouble,
    FaClock,
    FaFilter
} from 'react-icons/fa';
import api from '../services/api';
import { format } from 'date-fns';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const NotificationsPage = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all'); // all, unread, read
    const [processing, setProcessing] = useState(null); // ID of notification being marked as read

    const loadNotifications = async () => {
        try {
            setLoading(true);
            const res = await api.get('/notifications/my');
            setNotifications(res.data || []);
            setError('');
        } catch (err) {
            const data = err.response?.data
            let msg = data?.message || data?.error || 'Failed to load notifications. Please try again.'
            
            if (data?.details?.fields) {
                msg = `Server validation failed: ${data.details.fields.join(', ')}`
            }
            setError(msg);
            console.error('[NotificationsPage] Load error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    const markAsRead = async (id) => {
        try {
            setProcessing(id);
            await api.patch(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch (err) {
            console.error('[NotificationsPage] Mark read error:', err);
        } finally {
            setProcessing(null);
        }
    };

    const markAllRead = async () => {
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length === 0) return;

        try {
            setLoading(true);
            // The backend doesn't have a specific "mark all" endpoint in the current routes,
            // so we'll do it sequentially or just update optimistic UI if we want to be fast.
            // However, sequentially is safer for consistency. 
            // Better: update UI optimistically and fire requests.
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            
            await Promise.all(unreadIds.map(id => api.patch(`/notifications/${id}/read`)));
        } catch (err) {
            console.error('[NotificationsPage] Mark all read error:', err);
            // Optionally reload to fix UI if it failed
            loadNotifications();
        } finally {
            setLoading(false);
        }
    };

    const filteredNotifications = useMemo(() => {
        if (filter === 'unread') return notifications.filter(n => !n.read);
        if (filter === 'read') return notifications.filter(n => n.read);
        return notifications;
    }, [notifications, filter]);

    const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <FaCheckCircle className="text-emerald-500" />;
            case 'warning': return <FaExclamationTriangle className="text-amber-500" />;
            case 'alert':
            case 'error': return <FaTimesCircle className="text-rose-500" />;
            case 'info':
            default: return <FaInfoCircle className="text-sky-500" />;
        }
    };

    const getTypeStyles = (type, isRead) => {
        if (isRead) return 'bg-white border-gray-100 opacity-75';
        
        switch (type) {
            case 'success': return 'bg-emerald-50/50 border-emerald-100 shadow-sm shadow-emerald-50';
            case 'warning': return 'bg-amber-50/50 border-amber-100 shadow-sm shadow-amber-50';
            case 'alert':
            case 'error': return 'bg-rose-50/50 border-rose-100 shadow-sm shadow-rose-50';
            default: return 'bg-sky-50/50 border-sky-100 shadow-sm shadow-sky-50';
        }
    };

    if (loading && notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-gray-400 font-medium animate-pulse">Syncing your alerts...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 bg-blue-600 rounded-lg text-white">
                            <FaBell />
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Notifications & Alerts</h1>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">
                        You have <span className="text-blue-600 font-bold">{unreadCount}</span> unread messages
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={markAllRead}
                        disabled={unreadCount === 0 || loading}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <FaCheckDouble />
                        Mark All Read
                    </button>
                    <button
                        onClick={loadNotifications}
                        className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all"
                        title="Refresh"
                    >
                        <FaClock />
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl w-fit">
                {['all', 'unread', 'read'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                            filter === f 
                                ? 'bg-white text-blue-600 shadow-sm' 
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl flex items-center gap-3">
                    <FaTimesCircle />
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            {/* Notifications List */}
            <div className="space-y-3">
                {filteredNotifications.length > 0 ? (
                    filteredNotifications.map((n) => (
                        <div
                            key={n.id}
                            className={`group relative flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300 ${getTypeStyles(n.type, n.read)}`}
                        >
                            <div className={`mt-1 text-xl ${n.read ? 'text-gray-300' : ''}`}>
                                {getIcon(n.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <h3 className={`text-sm font-black truncate ${n.read ? 'text-gray-500' : 'text-gray-900'}`}>
                                        {n.title}
                                    </h3>
                                    <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">
                                        {format(new Date(n.createdAt), 'MMM d, h:mm a')}
                                    </span>
                                </div>
                                <p className={`text-sm leading-relaxed ${n.read ? 'text-gray-400' : 'text-gray-600 font-medium'}`}>
                                    {n.message}
                                </p>
                            </div>

                            {!n.read && (
                                <button
                                    onClick={() => markAsRead(n.id)}
                                    disabled={processing === n.id}
                                    className="px-3 py-1 bg-white border border-gray-200 text-blue-600 text-[10px] font-black uppercase rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white"
                                >
                                    {processing === n.id ? '...' : 'Read'}
                                </button>
                            )}
                            
                            {n.read && (
                                <div className="text-emerald-500 opacity-50">
                                    <FaCheckCircle size={14} />
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="bg-white border border-dashed border-gray-200 rounded-3xl p-16 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <FaBell size={24} />
                        </div>
                        <h3 className="text-lg font-black text-gray-900 mb-1">All Clear!</h3>
                        <p className="text-sm text-gray-500 font-medium">
                            {filter === 'unread' 
                                ? "You've read all your notifications." 
                                : "No alerts to display at the moment."}
                        </p>
                        {filter !== 'all' && (
                            <button 
                                onClick={() => setFilter('all')}
                                className="mt-4 text-blue-600 font-bold text-xs uppercase tracking-widest hover:underline"
                            >
                                View History
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Pagination / Load More could go here if needed */}
        </div>
    );
};

export default NotificationsPage;
