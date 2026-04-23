import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaStore, FaMapMarkerAlt, FaPhone, FaSave, FaExclamationTriangle } from 'react-icons/fa';
import api from '../../services/api';
import { isSellerProfileComplete } from '../../utils/sellerUtils';
import { useAuth } from '../../contexts/AuthContext';

export default function SellerBusinessLocation() {
    const location = useLocation();
    const navigate = useNavigate();
    const { updateUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [profileComplete, setProfileComplete] = useState(true);
    const [showWarning, setShowWarning] = useState(location.state?.incompleteProfile || false);
    const [formData, setFormData] = useState({
        businessName: '',
        businessAddress: '',
        businessCounty: '',
        businessTown: '',
        businessLandmark: '',
        businessPhone: '',
        businessLat: null,
        businessLng: null
    });

    useEffect(() => {
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        try {
            setLoading(true);
            const response = await api.get('/users/profile');
            const user = response.data.user || response.data;

            const data = {
                businessName: user.businessName || '',
                businessAddress: user.businessAddress || '',
                businessCounty: user.businessCounty || '',
                businessTown: user.businessTown || '',
                businessLandmark: user.businessLandmark || '',
                businessPhone: user.businessPhone || '',
                businessLat: user.businessLat || null,
                businessLng: user.businessLng || null
            };
            setFormData(data);
            setProfileComplete(isSellerProfileComplete(data));
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        setLoading(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setFormData(prev => ({
                    ...prev,
                    businessLat: position.coords.latitude,
                    businessLng: position.coords.longitude
                }));
                setLoading(false);
                alert('📍 Coordinates captured successfully!');
            },
            (error) => {
                setLoading(false);
                console.error('Error getting location:', error);
                let msg = 'Could not get your location.';
                if (error.code === 1) {
                    msg = 'Location access denied by your browser. Even if your device GPS is on, you must allow this website to access it.\n\nTo fix:\n1. Click the Lock/Settings icon next to the URL.\n2. Set Location to "Allow".\n3. Refresh the page.';
                } else if (error.code === 2) {
                    msg = 'Location information is unavailable.';
                } else if (error.code === 3) {
                    msg = 'The request to get user location timed out.';
                }
                alert(msg);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleClearCoordinates = () => {
        setFormData(prev => ({
            ...prev,
            businessLat: null,
            businessLng: null
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate all fields
        const requiredFields = [
            { key: 'businessName', label: 'Business Name' },
            { key: 'businessAddress', label: 'Physical Address' },
            { key: 'businessCounty', label: 'County' },
            { key: 'businessTown', label: 'Town' },
            { key: 'businessLandmark', label: 'Landmark' },
            { key: 'businessPhone', label: 'Business Phone' },
            { key: 'businessLat', label: 'Latitude' },
            { key: 'businessLng', label: 'Longitude' }
        ];

        for (const field of requiredFields) {
            const val = formData[field.key];
            if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
                alert(`Please provide: ${field.label}. All fields are mandatory for sellers.`);
                return;
            }
        }

        try {
            setSaving(true);
            await api.put('/users/profile', formData);
            if (updateUser) await updateUser();
            setProfileComplete(true);
            setShowWarning(false);
            alert('✅ Business location saved successfully! Your seller profile is now active.');
            navigate('/seller');
        } catch (error) {
            console.error('Error saving location:', error);
            alert('Failed to save business location: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-0 sm:p-6">Loading...</div>;
    }

    return (
        <div className="p-0 sm:p-6">
            <div className="max-w-3xl">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FaStore className="text-blue-600" />
                        Business Location
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Set your store/business location for delivery agent pickups
                    </p>
                </div>



                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 font-bold uppercase tracking-tight mb-2">
                                0. Business / Store Name *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.businessName}
                                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                                placeholder="e.g. Comrades Electronics, Jumia Store, etc."
                            />
                        </div>

                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-700 font-bold uppercase tracking-tight">
                                1. Physical Address *
                            </label>
                        </div>

                        <div>
                            <textarea
                                required
                                value={formData.businessAddress}
                                onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                                rows="3"
                                placeholder="Enter your complete business address including building name/number, street, area..."
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Provide as much detail as possible to help delivery agents find your location easily
                            </p>
                        </div>

                        <div className="pt-4 mt-4 border-t border-gray-100">
                            <div className="flex justify-between items-center mb-4">
                                <label className="block text-sm font-medium text-gray-700 font-bold uppercase tracking-tight">
                                    2. Map Coordinates (Lat/Lng) *
                                </label>
                                <button
                                    type="button"
                                    onClick={handleGetCurrentLocation}
                                    className="text-xs flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all font-bold shadow-sm"
                                >
                                    <FaMapMarkerAlt />
                                    Get GPS Location
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Latitude</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.businessLat || ''}
                                        onChange={(e) => setFormData({ ...formData, businessLat: e.target.value ? parseFloat(e.target.value) : null })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-mono"
                                        placeholder="e.g. -1.286389"
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Longitude</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.businessLng || ''}
                                        onChange={(e) => setFormData({ ...formData, businessLng: e.target.value ? parseFloat(e.target.value) : null })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-mono"
                                        placeholder="e.g. 36.817223"
                                    />
                                </div>
                            </div>

                            {formData.businessLat && (
                                <div className="mt-3 flex justify-between items-center">
                                    <div className="bg-green-50 px-3 py-1.5 rounded-full border border-green-200 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                        <span className="text-[10px] text-green-700 font-bold uppercase tracking-wider">Coordinates Set</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleClearCoordinates}
                                        className="text-[10px] text-red-500 hover:text-red-700 font-bold uppercase"
                                    >
                                        Clear Coordinates
                                    </button>
                                </div>
                            )}

                            <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                                Tip: If browser location is blocked, you can find your coordinates on Google Maps by right-clicking your location and copying the numbers (Latitude, Longitude).
                            </p>
                        </div>

                        <div className="pt-4 mt-4 border-t border-gray-100">
                            <label className="block text-sm font-medium text-gray-700 font-bold uppercase tracking-tight mb-4">
                                3. Regional Details *
                            </label>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        County/Region *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.businessCounty}
                                        onChange={(e) => setFormData({ ...formData, businessCounty: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Nairobi"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Town/Area *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.businessTown}
                                        onChange={(e) => setFormData({ ...formData, businessTown: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Westlands, CBD, Kilimani"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Landmark/Notable Location Nearby *
                                </label>
                                <input
                                    type="text"
                                    value={formData.businessLandmark}
                                    onChange={(e) => setFormData({ ...formData, businessLandmark: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Opposite Sarit Centre Mall, Next to KCB Bank"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Business Phone Number *
                                </label>
                                <div className="relative">
                                    <FaPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="tel"
                                        value={formData.businessPhone}
                                        onChange={(e) => setFormData({ ...formData, businessPhone: e.target.value })}
                                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                        placeholder="0712345678"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FaSave />
                                    {saving ? 'Saving...' : 'Save Business Location'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Preview */}
                {formData.businessAddress && (
                    <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700 mb-2">Preview - How delivery agents will see your location:</h3>
                        <div className="bg-white p-3 rounded border border-gray-300">
                            <div className="flex items-start gap-2">
                                <FaMapMarkerAlt className="text-gray-400 mt-1 flex-shrink-0" />
                                <div className="text-sm">
                                    <p className="font-medium text-gray-900">{formData.businessAddress}</p>
                                    {(formData.businessCounty || formData.businessTown) && (
                                        <p className="text-gray-600 text-xs mt-1">
                                            {[formData.businessTown, formData.businessCounty].filter(Boolean).join(', ')}
                                        </p>
                                    )}
                                    {formData.businessLandmark && (
                                        <p className="text-gray-500 text-xs mt-1">📍 {formData.businessLandmark}</p>
                                    )}
                                    {formData.businessPhone && (
                                        <p className="text-gray-500 text-xs mt-1">📞 {formData.businessPhone}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
