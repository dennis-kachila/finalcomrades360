import React, { useState, useEffect } from 'react';
import { FaUserCog, FaPhone, FaEnvelope, FaMapMarkerAlt, FaTruck, FaStar, FaEdit, FaCamera, FaFileUpload, FaCheckCircle, FaExclamationTriangle, FaUniversity, FaMobileAlt } from 'react-icons/fa';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../services/api';

const DeliveryAgentAccount = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { fetchStatus } = useOutletContext() || {};
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    location: '',
    vehicleType: 'Motorcycle',
    vehiclePlate: '',
    vehicleModel: '',
    vehicleColor: '',
    licenseNumber: '',
    emergencyContact: '',
    profilePhoto: '',
    paymentMethod: 'mobile_money',
    mobileMoneyProvider: 'M-Pesa',
    mobileMoneyNumber: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    availability: {}
  });

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/delivery/profile');
      if (res.data) {
        let availability = res.data.availability;
        if (typeof availability === 'string') {
          try { availability = JSON.parse(availability); } catch (e) { availability = {}; }
        }

        // Initialize default availability if empty
        const initializedAvailability = {};
        daysOfWeek.forEach(day => {
          initializedAvailability[day] = availability?.[day] || { active: false, start: '08:00', end: '18:00' };
        });

        setProfile(prev => ({
          ...prev,
          ...res.data,
          name: user?.name || res.data.name || prev.name,
          email: user?.email || res.data.email || prev.email,
          vehicleType: res.data.vehicleType || 'Motorcycle',
          paymentMethod: res.data.paymentMethod || 'mobile_money',
          mobileMoneyProvider: res.data.mobileMoneyProvider || 'M-Pesa',
          availability: initializedAvailability
        }));
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      const data = error.response?.data
      setMessage({ type: 'error', text: data?.message || 'Failed to fetch profile' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    const required = ['name', 'phone', 'location', 'vehicleType'];
    const needsVehicleDetails = !['Walking', 'Bicycle'].includes(profile.vehicleType);

    if (needsVehicleDetails) {
      required.push('vehicleModel', 'vehiclePlate', 'licenseNumber');
    }

    for (const field of required) {
      if (!profile[field]) {
        setMessage({ type: 'error', text: `Missing required field: ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}` });
        return;
      }
    }

    // Additional Payment Validation
    if (profile.paymentMethod === 'mobile_money' && !profile.mobileMoneyNumber) {
      setMessage({ type: 'error', text: 'Missing required field: mobile money number' });
      return;
    }
    if (profile.paymentMethod === 'bank' && (!profile.bankName || !profile.accountNumber)) {
      setMessage({ type: 'error', text: 'Missing required field: bank name or account number' });
      return;
    }
    if (!profile.emergencyContact) {
      setMessage({ type: 'error', text: 'Missing required field: emergency contact' });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      await api.put('/delivery/profile', profile);
      setMessage({ type: 'success', text: 'Profile updated successfully' });
      setIsEditing(false);

      // Refresh global dashboard status
      if (fetchStatus) fetchStatus();

      // Optional: Redirect to available orders if profile was just completed
      // navigate('/delivery/available');
    } catch (error) {
      console.error('Failed to update profile:', error);
      const data = error.response?.data
      let msg = data?.message || 'Failed to update profile'
      
      if (data?.details?.fields) {
          msg = `Required fields are missing or invalid: ${data.details.fields.join(', ')}`
      } else if (data?.errors && Array.isArray(data.errors)) {
          msg = data.errors.map(e => e.message || e).join('. ')
      }
      
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleChange = (day, field, value) => {
    setProfile(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: {
          ...prev.availability[day],
          [field]: value
        }
      }
    }));
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'profilePhoto');

    try {
      setSaving(true);
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setProfile(prev => ({ ...prev, profilePhoto: res.data.url }));
      await api.put('/delivery/profile', { profilePhoto: res.data.url });
    } catch (error) {
      console.error('Photo upload failed:', error);
      setMessage({ type: 'error', text: 'Failed to upload photo' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;

  const needsVehicleDetails = !['Walking', 'Bicycle'].includes(profile.vehicleType);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">My Account</h2>
            <p className="text-gray-600">Manage your delivery agent profile</p>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <FaEdit />
            <span>{isEditing ? 'Cancel' : 'Edit Profile'}</span>
          </button>
        </div>

        {message && (
          <div className={`mx-6 mt-4 p-4 rounded-lg flex items-center ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.type === 'success' ? <FaCheckCircle className="mr-2" /> : <FaExclamationTriangle className="mr-2" />}
            {message.text}
          </div>
        )}

        <div className="p-6">
          {/* Profile Header & Photo */}
          <div className="flex items-center space-x-6 mb-8">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
                {profile.profilePhoto ? (
                  <img src={profile.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <FaUserCog className="text-4xl" />
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full text-white cursor-pointer hover:bg-blue-700 shadow-lg">
                <FaCamera className="h-4 w-4" />
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={saving} />
              </label>
            </div>

            <div>
              <h3 className="text-2xl font-bold text-gray-900">{profile.name}</h3>
              <p className="text-gray-600">Delivery Agent • {profile.location || 'No Location Set'}</p>
              <div className="flex items-center space-x-4 mt-2">
                <div className="flex items-center space-x-1">
                  <FaStar className="text-yellow-400" />
                  <span className="text-sm text-gray-600">{profile.rating || 'N/A'} Rating</span>
                </div>
                <div className="flex items-center space-x-1">
                  <FaTruck className="text-blue-500" />
                  <span className="text-sm text-gray-600">{profile.vehicleType}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Personal Information */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold border-b pb-2">Personal Information</h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-600">{profile.name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-600">{profile.email}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={profile.phone || ''}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg flex items-center space-x-2">
                      <FaPhone className="text-gray-400" />
                      <span>{profile.phone || 'Not set'}</span>
                    </div>
                  )}
                </div>

                {needsVehicleDetails && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ID/License Number <span className="text-red-500">*</span></label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={profile.licenseNumber || ''}
                        onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-lg">{profile.licenseNumber || 'Not set'}</div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address / Location <span className="text-red-500">*</span></label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.location || ''}
                      onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg flex items-center space-x-2">
                      <FaMapMarkerAlt className="text-gray-400" />
                      <span>{profile.location || 'Not set'}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact <span className="text-red-500">*</span></label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={profile.emergencyContact || ''}
                      onChange={(e) => setProfile({ ...profile, emergencyContact: e.target.value })}
                      placeholder="e.g. +254..."
                      className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${!profile.emergencyContact ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                    />
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg">{profile.emergencyContact || 'Not set'}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery Mode */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold border-b pb-2">Delivery Mode</h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Type <span className="text-red-500">*</span></label>
                  {isEditing ? (
                    <select
                      value={profile.vehicleType || 'Motorcycle'}
                      onChange={(e) => setProfile({ ...profile, vehicleType: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Walking">Walking</option>
                      <option value="Bicycle">Bicycle</option>
                      <option value="Motorcycle">Motorcycle</option>
                      <option value="Car">Car</option>
                      <option value="Van">Van</option>
                    </select>
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg flex items-center space-x-2">
                      <FaTruck className="text-gray-400" />
                      <span>{profile.vehicleType}</span>
                    </div>
                  )}
                </div>

                {needsVehicleDetails && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Model <span className="text-red-500">*</span></label>
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="e.g. Toyota Corolla, Honda CG125"
                          value={profile.vehicleModel || ''}
                          onChange={(e) => setProfile({ ...profile, vehicleModel: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg">{profile.vehicleModel || 'Not set'}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Plate <span className="text-red-500">*</span></label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={profile.vehiclePlate || ''}
                          onChange={(e) => setProfile({ ...profile, vehiclePlate: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg">{profile.vehiclePlate || 'Not set'}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={profile.vehicleColor || ''}
                          onChange={(e) => setProfile({ ...profile, vehicleColor: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg">{profile.vehicleColor || 'Not set'}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Document Management */}
            <div className="space-y-6 md:col-span-2">
              <h3 className="text-lg font-semibold border-b pb-2">Documents</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {needsVehicleDetails && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <label className="block text-sm font-medium text-gray-700">Driver's License / ID <span className="text-red-500">*</span></label>
                      {profile.idDocument ? (
                        <span className="text-green-600 text-xs flex items-center"><FaCheckCircle className="mr-1" /> Uploaded</span>
                      ) : (
                        <span className="text-red-500 text-xs flex items-center"><FaExclamationTriangle className="mr-1" /> Missing</span>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-2">
                        <input
                          type="file"
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          onChange={(e) => {
                            // Document upload logic placeholder
                            console.log('Upload ID:', e.target.files[0]);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-gray-500">
                        {profile.idDocument ? 'Document on file' : 'Please upload your ID or License to be verified.'}
                      </div>
                    )}
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <label className="block text-sm font-medium text-gray-700">Insurance Certificate</label>
                    {profile.insuranceDocument ? (
                      <span className="text-green-600 text-xs flex items-center"><FaCheckCircle className="mr-1" /> Uploaded</span>
                    ) : (
                      <span className="text-yellow-500 text-xs flex items-center"><FaExclamationTriangle className="mr-1" /> {needsVehicleDetails ? 'Optional' : 'N/A'}</span>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="mt-2">
                      <input
                        type="file"
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-500">
                      {profile.insuranceDocument ? 'Document on file' : 'Upload insurance if applicable.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Availability Schedule */}
            <div className="space-y-6 md:col-span-2">
              <h3 className="text-lg font-semibold border-b pb-2">Working Schedule & Availability</h3>
              <p className="text-sm text-gray-500 mb-2">Set where you are available to work. Use the toggle to confirm availability for specific days.</p>
              <div className="grid grid-cols-1 gap-4">
                {daysOfWeek.map(day => (
                  <div key={day} className="flex flex-wrap items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-3 w-32">
                      {/* Availability Toggle */}
                      <button
                        onClick={() => isEditing && handleScheduleChange(day, 'active', !profile.availability?.[day]?.active)}
                        disabled={!isEditing}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${profile.availability?.[day]?.active ? 'bg-green-500' : 'bg-gray-300'
                          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span
                          className={`${profile.availability?.[day]?.active ? 'translate-x-6' : 'translate-x-1'
                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                        />
                      </button>
                      <span className={`font-medium ${profile.availability?.[day]?.active ? 'text-gray-900' : 'text-gray-400'}`}>{day}</span>
                    </div>

                    {profile.availability?.[day]?.active && (
                      isEditing ? (
                        <div className="flex items-center space-x-2 mt-2 sm:mt-0">
                          <input
                            type="time"
                            value={profile.availability?.[day]?.start || '08:00'}
                            onChange={(e) => handleScheduleChange(day, 'start', e.target.value)}
                            className="border rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                          <span className="text-gray-500">to</span>
                          <input
                            type="time"
                            value={profile.availability?.[day]?.end || '18:00'}
                            onChange={(e) => handleScheduleChange(day, 'end', e.target.value)}
                            className="border rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-600 mt-2 sm:mt-0">
                          {profile.availability?.[day]?.start || '08:00'} - {profile.availability?.[day]?.end || '18:00'}
                        </span>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Settings */}
            <div className="space-y-6 md:col-span-2">
              <h3 className="text-lg font-semibold border-b pb-2">Payment Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  {isEditing ? (
                    <select
                      value={profile.paymentMethod || 'mobile_money'}
                      onChange={(e) => setProfile({ ...profile, paymentMethod: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="mobile_money">Mobile Money (M-Pesa/Airtel)</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg flex items-center space-x-2">
                      {profile.paymentMethod === 'bank' ? <FaUniversity className="text-gray-400" /> : <FaMobileAlt className="text-gray-400" />}
                      <span>{profile.paymentMethod === 'bank' ? 'Bank Transfer' : 'Mobile Money'}</span>
                    </div>
                  )}
                </div>

                {profile.paymentMethod === 'mobile_money' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                      {isEditing ? (
                        <select
                          value={profile.mobileMoneyProvider || 'M-Pesa'}
                          onChange={(e) => setProfile({ ...profile, mobileMoneyProvider: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="M-Pesa">M-Pesa</option>
                          <option value="Airtel Money">Airtel Money</option>
                        </select>
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg">{profile.mobileMoneyProvider || 'M-Pesa'}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={profile.mobileMoneyNumber || ''}
                          onChange={(e) => setProfile({ ...profile, mobileMoneyNumber: e.target.value })}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${!profile.mobileMoneyNumber ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                        />
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg">{profile.mobileMoneyNumber || 'Not set'}</div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={profile.bankName || ''}
                          onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${!profile.bankName ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                        />
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg">{profile.bankName || 'Not set'}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={profile.accountNumber || ''}
                          onChange={(e) => setProfile({ ...profile, accountNumber: e.target.value })}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${!profile.accountNumber ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                        />
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg">{profile.accountNumber || 'Not set'}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="md:col-span-2 flex justify-end space-x-4 pt-4 border-t">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                  disabled={saving}
                >
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>}
                  Save Changes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryAgentAccount;