import React, { useState } from 'react';
import { FaBell, FaCheckCircle, FaInfoCircle, FaExclamationTriangle, FaTrash } from 'react-icons/fa';

const DeliveryNotifications = () => {
    const [activeTab, setActiveTab] = useState('all');
    const [notifications, setNotifications] = useState([]);

    const unreadCount = notifications.filter(n => !n.read).length;

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const deleteNotification = (id) => {
        setNotifications(notifications.filter(n => n.id !== id));
    };

    const filteredNotifications = activeTab === 'all'
        ? notifications
        : activeTab === 'unread'
            ? notifications.filter(n => !n.read)
            : notifications;

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <FaCheckCircle className="text-green-500" />;
            case 'warning': return <FaExclamationTriangle className="text-orange-500" />;
            case 'info':
            default: return <FaInfoCircle className="text-blue-500" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
                    <p className="text-gray-500">Stay updated with your delivery activities</p>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="text-sm text-gray-500">
                        {unreadCount} unread
                    </div>
                    <button
                        onClick={markAllAsRead}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                        Mark all as read
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex">
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`${activeTab === 'all' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setActiveTab('unread')}
                            className={`${activeTab === 'unread' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm`}
                        >
                            Unread
                        </button>
                    </nav>
                </div>

                <div className="divide-y divide-gray-200">
                    {filteredNotifications.length > 0 ? (
                        filteredNotifications.map((notification) => (
                            <div
                                key={notification.id}
                                className={`p-6 flex items-start space-x-4 hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-blue-50' : ''}`}
                            >
                                <div className="flex-shrink-0 mt-1">
                                    {getIcon(notification.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className={`text-sm font-medium ${!notification.read ? 'text-gray-900 font-bold' : 'text-gray-900'}`}>
                                            {notification.title}
                                        </h3>
                                        <span className="text-xs text-gray-500">{notification.time}</span>
                                    </div>
                                    <p className="text-sm text-gray-600">{notification.message}</p>
                                </div>
                                <button
                                    onClick={() => deleteNotification(notification.id)}
                                    className="text-gray-400 hover:text-red-500 p-1"
                                    title="Delete"
                                >
                                    <FaTrash className="h-4 w-4" />
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 text-center text-gray-500">
                            <FaBell className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                            <p>No notifications to display</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeliveryNotifications;
