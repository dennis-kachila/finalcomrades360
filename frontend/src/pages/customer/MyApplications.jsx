import React, { useEffect, useState } from 'react';
import { FaHistory, FaCheckCircle, FaTimesCircle, FaClock, FaIdCard, FaUserTie } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { roleApi } from '../../services/api';

export default function MyApplications() {
    const { user } = useAuth();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (user?.id) {
            loadApplications();
        }
    }, [user?.id]);

    const loadApplications = async () => {
        try {
            setLoading(true);
            const response = await roleApi.getUserApplications(user.id);
            if (response.data.success) {
                setApplications(response.data.data);
            } else {
                setError(response.data.message || 'Failed to load applications');
            }
        } catch (err) {
            console.error('Error loading applications:', err);
            setError('An error occurred while loading your applications.');
        } finally {
            setLoading(false);
        }
    };

    const getStatusInfo = (status) => {
        switch (status) {
            case 'approved':
                return { color: 'text-green-600', bg: 'bg-green-100', icon: FaCheckCircle, label: 'Approved' };
            case 'rejected':
                return { color: 'text-red-600', bg: 'bg-red-100', icon: FaTimesCircle, label: 'Rejected' };
            case 'pending':
                return { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: FaClock, label: 'Pending' };
            case 'draft':
                return { color: 'text-gray-600', bg: 'bg-gray-100', icon: FaHistory, label: 'Draft' };
            default:
                return { color: 'text-blue-600', bg: 'bg-blue-100', icon: FaClock, label: status };
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-KE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600 font-bold uppercase tracking-widest text-xs">Loading Applications...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black uppercase tracking-widest text-gray-800">My Applications</h2>
                <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                    {applications.length} total
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-bold">
                    {error}
                </div>
            )}

            {applications.length === 0 ? (
                <div className="card p-12 text-center border-dashed border-2 border-gray-100">
                    <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaIdCard className="text-gray-300 text-2xl" />
                    </div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">No Applications Found</h3>
                    <p className="text-gray-500 text-xs max-w-xs mx-auto mb-6">
                        You haven't submitted any role applications yet. Head over to "Work with Us" to get started!
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {applications.map((app) => {
                        const status = getStatusInfo(app.status);
                        const StatusIcon = status.icon;

                        return (
                            <div key={app.id} className="card p-5 hover:shadow-xl transition-all duration-300 group border border-gray-100">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl ${status.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                            <StatusIcon className={`text-xl ${status.color}`} />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-gray-800 uppercase tracking-widest text-sm mb-1">
                                                {app.appliedRole.replace(/_/g, ' ')} Application
                                            </h4>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <span>Submitted on {formatDate(app.createdAt)}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-3 md:pt-0">
                                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${status.bg} ${status.color}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${status.color.replace('text', 'bg')}`}></div>
                                            {status.label}
                                        </div>
                                    </div>
                                </div>

                                {app.adminNotes && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FaUserTie className="text-gray-400 text-xs" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Admin Feedback</span>
                                        </div>
                                        <p className="text-xs text-gray-600 font-medium leading-relaxed italic">
                                            "{app.adminNotes}"
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {/* Work with Us Link at the bottom */}
            <div className="mt-12 pt-8 border-t border-gray-100 text-center">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-4">Want to apply for more roles?</p>
                <Link 
                    to="/work-with-us" 
                    className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 group"
                >
                    <FaUserTie className="group-hover:scale-110 transition-transform" />
                    Work with Us
                </Link>
            </div>
        </div>
    );
}
