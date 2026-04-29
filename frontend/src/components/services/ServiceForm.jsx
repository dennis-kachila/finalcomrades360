import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { useCategories } from '../../contexts/CategoriesContext';
import serviceApi from '../../services/serviceApi';
import { adminApi } from '../../services/api';
import { ArrowLeft, Clock, Store, Plus, X, Shield } from 'lucide-react';
import Dialog from '../Dialog';
import {
  Dialog as UIDialog,
  DialogContent as UIDialogContent,
  DialogDescription as UIDialogDescription,
  DialogFooter as UIDialogFooter,
  DialogHeader as UIDialogHeader,
  DialogTitle as UIDialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { FaCheck } from 'react-icons/fa';
import useAutoSave from '../../hooks/useAutoSave';
import AutoSaveIndicator from '../ui/AutoSaveIndicator';
import SystemFeedbackModal from '../ui/SystemFeedbackModal';
import { recursiveParse, ensureArray, ensureObject } from '../../utils/parsingUtils';

// Form validation schema
const serviceSchema = yup.object().shape({
  title: yup.string().required('Title is required').min(5, 'Title must be at least 5 characters').max(50, 'Title cannot exceed 50 characters'),
  categoryId: yup.number().required('Category is required').positive('Invalid category'),
  subcategoryId: yup.number().required('Subcategory is required').positive('Invalid subcategory'),
  description: yup.string().required('Description is required').min(20, 'Description must be at least 20 characters').max(2000, 'Description cannot exceed 2000 characters'),
  basePrice: yup.number().required('Base price is required').min(0, 'Base price cannot be negative'),
  displayPrice: yup.number()
    .required('Display price is required')
    .min(0, 'Display price cannot be negative')
    .test('min-display-price', 'Display price must be greater than or equal to base price', function (value) {
      const { basePrice } = this.parent;
      return !basePrice || !value || parseFloat(value) >= parseFloat(basePrice);
    }),
  discountPercentage: yup.number().typeError('Must be a number').min(0).max(100).default(0),
  discountPrice: yup.number().nullable(),
  availability: yup.string().required('Availability information is required'),
  availabilityMode: yup.string().oneOf(['AUTO', 'OPEN', 'CLOSED']).default('AUTO'),
  availabilityDays: yup.array().nullable(),
  location: yup.string().required('General location is required'),
  vendorLocation: yup.string().nullable(),
  vendorLat: yup.number().nullable().transform((value, originalValue) => originalValue === '' ? null : value),
  vendorLng: yup.number().nullable().transform((value, originalValue) => originalValue === '' ? null : value),
  isOnline: yup.string().oneOf(['online', 'offline', 'both']).required('Please specify the service type'),
  images: yup.mixed()
    .test('fileCount', 'You can upload up to 3 images', (value) => {
      if (!value || value.length === 0) return true;
      return value.length <= 3;
    })
    .test('fileType', 'Only image files are allowed', (value) => {
      if (!value || value.length === 0) return true;
      return Array.from(value).every(file => file && file.type && file.type.startsWith('image/'));
    })
    .test('fileSize', 'File size too large (max 5MB)', (value) => {
      if (!value || value.length === 0) return true;
      return Array.from(value).every(file => file && file.size && file.size <= 5 * 1024 * 1024);
    }),
  // Delivery Configuration
  deliveryFeeType: yup.string().oneOf(['fixed', 'percentage', 'free']).default('fixed'),
  deliveryFee: yup.number().min(0, 'Fee cannot be negative').default(0),
  deliveryCoverageZones: yup.string().nullable(),
  // Marketing Configuration
  marketingEnabled: yup.boolean().default(false),
  marketingCommissionType: yup.string().oneOf(['percentage', 'flat']).default('flat'),
  marketingCommission: yup.number().min(0, 'Commission cannot be negative').default(0),
  marketingDuration: yup.number().min(1, 'Duration must be at least 1 day').default(30),
  marketingStartDate: yup.string().nullable(),
  marketingEndDate: yup.string().nullable(),
  // Professional Details
  qualifications: yup.string().nullable().max(1000, 'Qualifications cannot exceed 1000 characters'),
  experienceYears: yup.number().nullable().min(0, 'Experience cannot be negative'),
  bookingNotice: yup.number().nullable().min(0, 'Notice period cannot be negative'),
  cancellationPolicy: yup.string().nullable().max(500, 'Policy cannot exceed 500 characters'),
  userId: yup.number().nullable()
});


const ServiceForm = ({ onSuccess, onAfterSave, initialData, isEditing = false, mode = 'create', onEdit, forcedProviderId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories: allCategories } = useCategories();
  const isViewMode = mode === 'view';

  const handleDialogClose = () => {
    setShowSuccessDialog(false);
    if (onSuccess) {
      onSuccess(savedService);
    }
  };
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [existingImages, setExistingImages] = useState(initialData?.images || []);
  const [savedService, setSavedService] = useState(null);
  const [sellers, setSellers] = useState([]);
  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(user?.role);

  useEffect(() => {
    const fetchSellers = async () => {
      if (!isAdmin) return;
      try {
        const { data } = await adminApi.getAllUsers({ role: 'seller', limit: 100 });
        setSellers(data.users || []);
      } catch (err) {
        console.error('Failed to fetch sellers:', err);
      }
    };
    fetchSellers();
  }, [isAdmin, user]);
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', message: '' });

  const defaultAvailabilityDays = [
    { day: 'Monday', available: true, from: '08:00', to: '18:00' },
    { day: 'Tuesday', available: true, from: '08:00', to: '18:00' },
    { day: 'Wednesday', available: true, from: '08:00', to: '18:00' },
    { day: 'Thursday', available: true, from: '08:00', to: '18:00' },
    { day: 'Friday', available: true, from: '08:00', to: '18:00' },
    { day: 'Saturday', available: false, from: '10:00', to: '16:00' },
    { day: 'Sunday', available: false, from: '10:00', to: '16:00' },
    { day: 'All Days', available: false, from: '08:00', to: '18:00' }
  ];

  const { register, handleSubmit, formState: { errors }, watch, setValue, reset } = useForm({
    resolver: yupResolver(serviceSchema),
    defaultValues: {
      title: initialData?.title || '',
      categoryId: initialData?.categoryId || '',
      subcategoryId: initialData?.subcategoryId || '',
      description: initialData?.description || '',
      basePrice: initialData?.basePrice || initialData?.price || '',
      displayPrice: initialData?.displayPrice || '',
      discountPercentage: initialData?.discountPercentage || 0,
      discountPrice: initialData?.discountPrice || null,
      isPriceStartingFrom: initialData?.isPriceStartingFrom || false,
      deliveryTime: initialData?.deliveryTime || '',
      availability: initialData?.availability || '',
      location: initialData?.location || '',
      vendorLocation: initialData?.vendorLocation || '',
      vendorLat: initialData?.vendorLat || null,
      vendorLng: initialData?.vendorLng || null,
      isOnline: initialData?.isOnline || 'offline',
      images: [],
      availabilityMode: initialData?.availabilityMode || 'AUTO',
      availabilityDays: (function () {
        const days = ensureArray(initialData?.availabilityDays);
        return days.length > 0 ? days : defaultAvailabilityDays;
      })(),
      deliveryFeeType: initialData?.deliveryFeeType || 'fixed',
      deliveryFee: initialData?.deliveryFee || 0,
      deliveryCoverageZones: initialData?.deliveryCoverageZones || '',
      marketingEnabled: initialData?.marketingEnabled || false,
      marketingCommissionType: initialData?.marketingCommissionType || 'flat',
      marketingCommission: initialData?.marketingCommissionType === 'percentage' ? (initialData?.marketingCommissionPercentage || 0) : (initialData?.marketingCommission || 0),
      marketingDuration: initialData?.marketingDuration || 0,
      userId: initialData?.userId || '',
      // Initial calculation if dates exist
      ...(() => {
        if (initialData?.marketingStartDate && initialData?.marketingEndDate) {
          const start = new Date(initialData.marketingStartDate);
          const end = new Date(initialData.marketingEndDate);
          const diffTime = end.getTime() - start.getTime();
          return { marketingDuration: Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24))) };
        }
        return {};
      })(),
      marketingStartDate: initialData?.marketingStartDate ? new Date(initialData.marketingStartDate).toISOString().split('T')[0] : '',
      marketingEndDate: initialData?.marketingEndDate ? new Date(initialData.marketingEndDate).toISOString().split('T')[0] : '',
      qualifications: initialData?.qualifications || '',
      experienceYears: initialData?.experienceYears || '',
      bookingNotice: initialData?.bookingNotice || 0,
      cancellationPolicy: initialData?.cancellationPolicy || ''
    }
  });

  // Auto-calculation for Discount Price
  useEffect(() => {
    const displayPrice = parseFloat(watch('displayPrice')) || 0;
    const discount = parseFloat(watch('discountPercentage')) || 0;
    const calculated = displayPrice - (displayPrice * discount / 100);
    setValue('discountPrice', calculated.toFixed(2));
  }, [watch('displayPrice'), watch('discountPercentage'), setValue, watch]);

  // Auto-save integration
  const draftKey = `service_draft_${initialData?.id || 'new'}`;

  const restoreDraft = useCallback((draftData) => {
    if (!draftData) return;
    console.log('🛠️ Restoring Service Draft:', draftData);
    reset(draftData); // react-hook-form reset populates the form
    toast.info("Draft restored");
  }, [reset]);

  const formValues = watch(); // Watch all values for auto-save

  const { clearDraft, lastSaved } = useAutoSave(
    !isViewMode ? draftKey : null,
    formValues,
    restoreDraft
  );

  const watchPrice = watch('price');
  const watchDiscountPercentage = watch('discountPercentage');

  // Auto-calculate discountPrice and update displayPrice string
  useEffect(() => {
    const p = parseFloat(watchPrice || 0);
    const d = parseFloat(watchDiscountPercentage || 0);
    if (!isNaN(p)) {
      const calculatedDiscountPrice = (d > 0) ? p * (1 - d / 100) : p;
      setValue('discountPrice', parseFloat(calculatedDiscountPrice.toFixed(2)));

      // Auto-update displayPrice for consistency if not manually set
      if (!isEditing || !initialData?.displayPrice) {
        setValue('displayPrice', p.toString());
      }
    }
  }, [watchPrice, watchDiscountPercentage, setValue, isEditing, initialData]);

  // Fetch service data if missing but ID is provided (e.g., deep linking or dynamic loading)
  useEffect(() => {
    if (initialData?.id && !initialData.title) {
      console.log('Fetching service data for initialData.id:', initialData.id);
      serviceApi.getServiceById(initialData.id).then(data => {
        // Format deliveryCoverageZones if it's an array
        const formattedData = {
          ...data,
          deliveryCoverageZones: ensureArray(data.deliveryCoverageZones).join(', '),
          availabilityMode: data.availabilityMode || 'AUTO',
          availabilityDays: (function () {
            const days = ensureArray(data.availabilityDays);
            return days.length > 0 ? days : defaultAvailabilityDays;
          })()
        };
        reset(formattedData);
        if (data.images) setExistingImages(data.images);
      }).catch(err => console.error('Failed to fetch service data in form:', err));
    }
  }, [initialData?.id, reset]);

  const selectedCategoryId = watch('categoryId');

  // Fetch and filter for service categories from context
  useEffect(() => {
    if (!allCategories || allCategories.length === 0) return;

    // Filter for categories explicitly tagged as 'service'
    const serviceCategories = allCategories.filter(category =>
      String(category.taxonomyType) === 'service'
    );

    setCategories(serviceCategories);

    // Auto-select the first service category if there's only one OR if initialData is provided
    if (serviceCategories.length === 1 && !selectedCategoryId) {
      setValue('categoryId', serviceCategories[0].id);
    }
  }, [allCategories, setValue, selectedCategoryId]);

  // Handle subcategories from context when category changes
  useEffect(() => {
    if (!selectedCategoryId || !allCategories || allCategories.length === 0) {
      setSubcategories([]);
      return;
    }

    const category = allCategories.find(c => c.id == selectedCategoryId || c._id == selectedCategoryId);
    const subList = category?.Subcategory || category?.subcategories || [];

    setSubcategories(subList);

    // Sync subcategoryId if it exists in the list
    if (initialData?.subcategoryId && subList.some(sc => (sc.id || sc._id) == initialData.subcategoryId)) {
      setValue('subcategoryId', initialData.subcategoryId);
    }
  }, [selectedCategoryId, allCategories, initialData, setValue]);

  // Synchronize Weekly Operating Hours with Legacy Availability Summary
  const availabilityDays = watch('availabilityDays');
  useEffect(() => {
    if (!availabilityDays || isViewMode) return;

    const summary = availabilityDays
      .filter(d => d.available && d.day !== 'All Days')
      .map(d => `${d.day.substring(0, 3)}: ${d.from}-${d.to}`)
      .join(', ');

    if (summary) {
      setValue('availability', summary, { shouldValidate: true });
    } else {
      setValue('availability', 'By Appointment Only', { shouldValidate: true });
    }
  }, [availabilityDays, setValue, isViewMode]);

  // Handle image preview
  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);

    // Create preview URLs
    const previews = files.map(file => URL.createObjectURL(file));
    setImagePreviews(prev => [...prev, ...previews]);

    // Update form value
    setValue('images', files, { shouldValidate: true });
  };

  // Marketing Duration calculation
  const mStartDate = watch('marketingStartDate');
  const mEndDate = watch('marketingEndDate');
  const mDuration = watch('marketingDuration');

  useEffect(() => {
    if (mStartDate && mEndDate) {
      const start = new Date(mStartDate);
      const end = new Date(mEndDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      if (mDuration !== diffDays) {
        setValue('marketingDuration', diffDays);
      }
    }
  }, [mStartDate, mEndDate, mDuration, setValue]);

  // Remove an image preview
  const removeImagePreview = (index) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));

    // Update form value
    const fileInput = document.getElementById('images');
    const newFiles = Array.from(fileInput.files).filter((_, i) => i !== index);

    // Create a new DataTransfer to update the file input
    const dataTransfer = new DataTransfer();
    newFiles.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;

    setValue('images', dataTransfer.files, { shouldValidate: true });
  };

  // Remove an existing image
  const removeExistingImage = async (image) => {
    if (!isEditing || isViewMode) return;
    
    // image can be an object with an id or just a path string
    const imagePath = typeof image === 'string' ? image : (image.url || image.path || image.filePath);
    if (!imagePath) return;

    try {
      // 1. Permanent deletion from server
      if (imagePath.startsWith('/uploads')) {
        console.log('[ServiceForm] Permanently deleting image:', imagePath);
        await axios.delete('/api/upload/file', { data: { url: imagePath } });
      }

      // 2. Remove from local state
      setExistingImages(prev => prev.filter(img => {
        const path = typeof img === 'string' ? img : (img.url || img.path || img.filePath);
        return path !== imagePath;
      }));
      
      toast.success('Image removed permanently');
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('Failed to remove image permanently');
    }
  };

  // Form submission
  const onSubmit = async (data) => {
    if (isLoading) return;

    // Double-check that the selected category has 'service' in its name
    const selectedCategory = categories.find(cat => cat.id == data.categoryId);
    if (selectedCategory && !selectedCategory.name.toLowerCase().includes('service')) {
      toast.error('Invalid service category selected');
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();

      // Append all form fields except special handling ones
      Object.keys(data).forEach(key => {
        if (!['images', 'deliveryCoverageZones', 'deliveryFee', 'marketingCommission', 'marketingDuration', 'vendorLat', 'vendorLng', 'price', 'basePrice', 'userId'].includes(key)) {
          formData.append(key, data[key]);
        }
      });

      // Override userId if forcedProviderId is present
      formData.append('userId', forcedProviderId || data.userId || user?.id);

      // Special handling for Base Price
      formData.append('basePrice', parseFloat(data.basePrice) || 0);

      // Special handling for Location Coords
      if (data.vendorLat) formData.append('vendorLat', data.vendorLat);
      if (data.vendorLng) formData.append('vendorLng', data.vendorLng);

      // Special handling for Delivery Configuration
      const deliveryZones = (data.deliveryCoverageZones || '').split(',').map(x => x.trim()).filter(Boolean);
      formData.append('deliveryCoverageZones', JSON.stringify(deliveryZones));
      formData.append('deliveryFee', parseFloat(data.deliveryFee) || 0);

      // Special handling for Marketing Configuration
      formData.append('marketingEnabled', data.marketingEnabled || false);
      formData.append('marketingCommissionType', data.marketingCommissionType || 'flat');
      formData.append('marketingCommission', parseFloat(data.marketingCommission) || 0);
      formData.append('marketingDuration', parseInt(data.marketingDuration) || 30);
      formData.append('marketingStartDate', data.marketingStartDate || '');
      formData.append('marketingEndDate', data.marketingEndDate || '');

      // Special handling for Availability
      if (data.availabilityDays) {
        formData.append('availabilityDays', JSON.stringify(data.availabilityDays));
      }

      // Professional Details
      formData.append('qualifications', data.qualifications || '');
      formData.append('experienceYears', data.experienceYears || 0);
      formData.append('bookingNotice', data.bookingNotice || 0);
      formData.append('cancellationPolicy', data.cancellationPolicy || '');

      // Append images if any
      if (data.images && data.images.length > 0) {
        Array.from(data.images).forEach((file, index) => {
          formData.append('images', file);
        });
      }

      let response;

      if (isEditing) {
        // Update existing service
        response = await serviceApi.updateService(initialData.id, formData);
        toast.success('Service updated successfully');
      } else {
        // Create new service
        response = await serviceApi.createService(formData);
        toast.success('Service created successfully');
      }

      setSavedService(response.data);

      // Immediate background refresh if callback provided
      if (onAfterSave) {
        console.log('🔄 ServiceForm: Triggering onAfterSave background refresh...');
        onAfterSave(response.data);
      }

      // Show success dialog with role-based message
      const isSuperAdmin = user?.role === 'superadmin';
      setSuccessMessage({
        title: isSuperAdmin ? 'Success!' : (isEditing ? 'Updated!' : 'Submitted!'),
        message: isSuperAdmin
          ? `Your service listing has been ${isEditing ? 'updated' : 'created'} successfully and is now live.`
          : `Your service listing has been ${isEditing ? 'updated' : 'submitted'} for approval.`
      });
      setModalConfig({
        type: 'success',
        title: isSuperAdmin ? 'Success!' : (isEditing ? 'Updated!' : 'Submitted!'),
        description: isSuperAdmin
          ? `Your service listing has been ${isEditing ? 'updated' : 'created'} successfully and is now live.`
          : `Your service listing has been ${isEditing ? 'updated' : 'submitted'} for approval.`
      });
      setShowModal(true);

      // Reset form if not in edit mode
      if (!isEditing) {
        reset();
        setImagePreviews([]);
        setExistingImages([]);
        clearDraft(); // Clear draft on successful create
      } else {
        clearDraft(); // Clear draft on successful update too
      }

    } catch (error) {
      console.error('Error saving service:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save service';

      // Set and show error dialog
      setModalConfig({
        type: 'error',
        title: 'Error Saving Service',
        description: errorMessage
      });
      setShowModal(true);

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 md:p-4 overflow-hidden">
      <div className="flex items-center mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mr-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
          title="Go Back"
        >
          <ArrowLeft className="h-6 w-6 text-gray-600" />
        </button>
        <h2 className="text-2xl font-bold">
          {isEditing ? 'Edit Service' : 'Create a New Service'}
        </h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Admin-only Provider Selection */}
        {isAdmin && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <Label htmlFor="userId" className="text-blue-800 font-semibold flex items-center gap-2">
              <span className="mr-1">👤</span>
              Assign to Provider (Admin Only)
            </Label>
            <select
              id="userId"
              {...register('userId')}
              className="w-full h-10 rounded-md border border-blue-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Select Provider (Current: {initialData?.userId || 'Self'})</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name} ({seller.email})
                </option>
              ))}
            </select>
            <p className="text-xs text-blue-600 italic">Leave as "Select Provider" to keep current owner or assign to yourself.</p>
          </div>
        )}
        {isViewMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Vendor Information Card */}
            <div className="bg-blue-50 rounded-lg p-3 sm:p-4 border border-blue-100 shadow-sm">
              <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center">
                <span className="mr-2">👤</span>
                Provider Information
              </h3>
              <div className="space-y-1">
                <div className="flex justify-between items-center py-1 border-b border-blue-100">
                  <span className="text-sm font-medium text-blue-800">Owner Name:</span>
                  <span className="text-sm text-gray-700">{initialData?.provider?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-blue-100">
                  <span className="text-sm font-medium text-blue-800">Phone:</span>
                  <span className="text-sm text-gray-700">{initialData?.provider?.phone || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-medium text-blue-800">Email:</span>
                  <span className="text-sm text-gray-700">{initialData?.provider?.email || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Inventory Status Card */}
            <div className="bg-green-50 rounded-lg p-3 sm:p-4 border border-green-100 shadow-sm">
              <h3 className="text-sm font-bold text-green-900 mb-2 flex items-center">
                <span className="mr-2">📅</span>
                Service Status
              </h3>
              <div className="space-y-1">
                <div className="flex justify-between items-center py-1 border-b border-green-100">
                  <span className="text-sm font-medium text-green-800">Current Status:</span>
                  <span className={`text-sm font-bold ${initialData?.status === 'active' || initialData?.status === 'approved' ? 'text-green-600' : 'text-orange-600'}`}>
                    {initialData?.status?.charAt(0).toUpperCase() + initialData?.status?.slice(1) || 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-medium text-green-800">Location Type:</span>
                  <span className="text-sm text-gray-700">
                    {initialData?.isOnline === 'online' ? 'Online' : initialData?.isOnline === 'offline' ? 'In-Person' : 'Both'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-green-100 pt-2">
                  <span className="text-sm font-medium text-green-800">Availability:</span>
                  <span className="text-sm text-gray-700 truncate max-w-[150px]" title={initialData?.availability}>
                    {initialData?.availability || 'Daily'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Service Title *
          </label>
          <input
            id="title"
            type="text"
            {...register('title')}
            maxLength={50}
            className={`mt-1 block w-full px-4 py-3 rounded-xl border-2 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all ${errors.title ? 'border-red-500 ring-red-100' : 'border-gray-100 hover:border-blue-200'}`}
            placeholder="E.g., Professional Laptop Repair & Software Installation"
            disabled={isViewMode}
          />
          <div className="flex justify-between mt-1 px-1">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Character limit for cleaner card display</p>
            <p className={`text-[10px] font-black ${(watch('title')?.length || 0) >= 45 ? 'text-red-500' : 'text-gray-400'}`}>
              {watch('title')?.length || 0}/50
            </p>
          </div>
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        {/* Category and Subcategory */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">
              Category *
            </label>
            <select
              id="categoryId"
              {...register('categoryId')}
              className={`mt-1 block w-full px-4 py-3 rounded-xl border-2 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer ${errors.categoryId ? 'border-red-500' : 'border-gray-100 hover:border-blue-200'} ${categories.length === 1 ? 'bg-gray-50' : 'bg-white'}`}
              disabled={categories.length === 1 || isViewMode}
            >
              {categories.length === 0 ? (
                <option value="">No service categories available</option>
              ) : (
                categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))
              )}
            </select>
            {errors.categoryId && (
              <p className="mt-1 text-sm text-red-600">{errors.categoryId.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="subcategoryId" className="block text-sm font-medium text-gray-700">
              Subcategory *
            </label>
            <select
              id="subcategoryId"
              {...register('subcategoryId')}
              className={`mt-1 block w-full px-4 py-3 rounded-xl border-2 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer ${errors.subcategoryId ? 'border-red-500' : 'border-gray-100 hover:border-blue-200'}`}
              disabled={!selectedCategoryId || subcategories.length === 0 || isViewMode}
            >
              <option value="">Select a subcategory</option>
              {subcategories.map(subcategory => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
            {errors.subcategoryId && (
              <p className="mt-1 text-sm text-red-600">{errors.subcategoryId.message}</p>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Detailed Description *
          </label>
          <textarea
            id="description"
            rows={4}
            {...register('description')}
            className={`mt-1 block w-full px-4 py-3 rounded-xl border-2 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all ${errors.description ? 'border-red-500' : 'border-gray-100 hover:border-blue-200'}`}
            placeholder="Provide a detailed description of your service..."
            disabled={isViewMode}
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
          )}
        </div>

        {/* Professional Details Section */}
        <div className="bg-blue-50/30 rounded-lg p-6 border border-blue-100 shadow-sm">
          <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Professional Details & Qualifications
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label htmlFor="qualifications" className="block text-sm font-medium text-gray-700">
                Qualifications & Experience
              </label>
              <textarea
                id="qualifications"
                rows={3}
                {...register('qualifications')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="List your certifications, degrees, or years of professional experience..."
                disabled={isViewMode}
              />
            </div>
            <div>
              <label htmlFor="experienceYears" className="block text-sm font-medium text-gray-700">
                Years of Experience
              </label>
              <input
                id="experienceYears"
                type="number"
                {...register('experienceYears')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="0"
                disabled={isViewMode}
              />
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700">
              Base Price (KES) *
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">KES</span>
              </div>
              <input
                id="basePrice"
                type="number"
                step="0.01"
                min="0"
                {...register('basePrice')}
                className={`block w-full pl-12 pr-4 sm:text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 ${errors.basePrice ? 'border-red-500' : ''}`}
                placeholder="0.00"
                disabled={isViewMode}
              />
            </div>
            {errors.price && (
              <p className="mt-1 text-sm text-red-600">{errors.price.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="displayPrice" className="block text-sm font-medium text-gray-700">
              Display Price (KES)
            </label>
            <input
              id="displayPrice"
              type="text"
              {...register('displayPrice')}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${errors.displayPrice ? 'border-red-500' : ''}`}
              placeholder="E.g., 500"
              disabled={isViewMode}
            />
            {errors.displayPrice && (
              <p className="mt-1 text-sm text-red-600">{errors.displayPrice.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="discountPercentage" className="block text-sm font-medium text-gray-700">
              Discount %
            </label>
            <input
              id="discountPercentage"
              type="number"
              min="0"
              max="100"
              {...register('discountPercentage')}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${errors.discountPercentage ? 'border-red-500' : ''}`}
              placeholder="0"
              disabled={isViewMode}
            />
            {errors.discountPercentage && (
              <p className="mt-1 text-sm text-red-600">{errors.discountPercentage.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="discountPrice" className="block text-sm font-medium text-gray-700 font-bold">
              Discount Price (KES)
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm font-bold text-blue-600">KES</span>
              </div>
              <input
                id="discountPrice"
                type="number"
                readOnly
                {...register('discountPrice')}
                className="block w-full pl-12 pr-4 sm:text-sm border-gray-300 rounded-md bg-blue-50 font-bold text-blue-600 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Delivery Time */}
        <div>
          <label htmlFor="deliveryTime" className="block text-sm font-medium text-gray-700">
            Delivery Time *
          </label>
          <input
            id="deliveryTime"
            type="text"
            {...register('deliveryTime')}
            className={`mt-1 block w-full px-4 py-3 rounded-xl border-2 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all ${errors.deliveryTime ? 'border-red-500' : 'border-gray-100 hover:border-blue-200'}`}
            placeholder="E.g., 1 hour, same-day, next-day..."
            disabled={isViewMode}
          />
          {errors.deliveryTime && (
            <p className="mt-1 text-sm text-red-600">{errors.deliveryTime.message}</p>
          )}
        </div>

        {/* Availability Section */}
        <div className="bg-orange-50 rounded-xl p-6 border border-orange-100 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
              <Store size={20} />
              Operational Schedule
            </h3>
            <p className="text-sm text-orange-700 mt-1">Set your service's daily operating hours</p>
          </div>

          <div className="flex bg-white p-1 rounded-lg border border-orange-200 mb-6 w-full sm:w-auto self-start">
            {[
              { value: 'AUTO', label: 'Schedule', color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { value: 'OPEN', label: 'Force Open', color: 'bg-green-50 text-green-700 border-green-200' },
              { value: 'CLOSED', label: 'Force Closed', color: 'bg-red-50 text-red-700 border-red-200' }
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => !isViewMode && setValue('availabilityMode', opt.value)}
                className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${watch('availabilityMode') === opt.value
                  ? `${opt.color} shadow-sm border border-current`
                  : 'text-gray-400 border border-transparent hover:text-gray-600'
                  }`}
                disabled={isViewMode}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">Weekly Operating Hours</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'All Days'].map((day) => {
                  const currentDays = Array.isArray(watch('availabilityDays')) ? watch('availabilityDays') : [];
                  const dayData = currentDays.find(d => d.day === day) || { day, available: false, from: '08:00', to: '18:00' };

                  const updateDay = (updates) => {
                    const newDays = [...currentDays];
                    const index = newDays.findIndex(d => d.day === day);

                    if (index >= 0) {
                      newDays[index] = { ...newDays[index], ...updates };
                    } else {
                      newDays.push({ ...dayData, ...updates });
                    }
                    setValue('availabilityDays', newDays);
                  };

                  return (
                    <div key={day} className={`flex items-center justify-between p-2 rounded-md border transition-all ${dayData.available ? 'bg-white border-orange-200 shadow-sm' : 'bg-gray-50 opacity-60 border-gray-100'}`}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isViewMode}
                          onClick={() => !isViewMode && updateDay({ available: !dayData.available })}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${dayData.available ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${dayData.available ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                        <span className={`text-[11px] font-bold ${dayData.available ? 'text-gray-900' : 'text-gray-400'}`}>{day}</span>
                      </div>

                      {dayData.available ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            disabled={isViewMode}
                            value={dayData.from}
                            onChange={(e) => updateDay({ from: e.target.value })}
                            className="text-sm p-1.5 border border-gray-300 bg-white text-gray-900 font-medium rounded focus:ring-1 focus:ring-blue-500 w-[80px]"
                          />
                          <span className="text-[10px] text-gray-400 font-bold text-center">to</span>
                          <input
                            type="time"
                            disabled={isViewMode}
                            value={dayData.to}
                            onChange={(e) => updateDay({ to: e.target.value })}
                            className="text-sm p-1.5 border border-gray-300 bg-white text-gray-900 font-medium rounded focus:ring-1 focus:ring-blue-500 w-[80px]"
                          />
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-orange-100">
              <label htmlFor="availability" className="block text-sm font-bold text-gray-700 mb-1">
                Availability Summary (Legacy - Auto-generated) *
              </label>
              <textarea
                id="availability"
                rows={2}
                {...register('availability')}
                className={`block w-full rounded-md border-gray-100 bg-gray-50/50 shadow-inner focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${errors.availability ? 'border-red-500' : ''}`}
                placeholder="E.g., Monday-Friday: 9am-6pm"
                disabled={isViewMode}
                readOnly
              />
              <p className="text-[10px] text-orange-600 font-medium">This summary is automatically updated based on your Weekly Operating Hours above.</p>
              {errors.availability && (
                <p className="text-xs text-red-600 mt-1">{errors.availability.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="bookingNotice" className="block text-sm font-bold text-gray-700 mb-1">
                  Booking Notice Period (Hours)
                </label>
                <input
                  id="bookingNotice"
                  type="number"
                  {...register('bookingNotice')}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="0"
                  disabled={isViewMode}
                />
                <p className="text-[10px] text-gray-500 mt-1">Minimum hours notice required before booking.</p>
              </div>
              <div>
                <label htmlFor="cancellationPolicy" className="block text-sm font-bold text-gray-700 mb-1">
                  Cancellation Policy
                </label>
                <select
                  id="cancellationPolicy"
                  {...register('cancellationPolicy')}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={isViewMode}
                >
                  <option value="Flexible">Flexible (Full refund 24h before)</option>
                  <option value="Moderate">Moderate (Full refund 48h before)</option>
                  <option value="Strict">Strict (No refund after 24h of booking)</option>
                </select>
              </div>
            </div>
          </div>
        </div>


        {/* Location and Service Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700">
              General Area (City/Region) *
            </label>
            <input
              id="location"
              type="text"
              {...register('location')}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${errors.location ? 'border-red-500' : ''}`}
              placeholder="e.g., Nairobi, CBD"
              disabled={isViewMode}
            />
            {errors.location && (
              <p className="mt-1 text-sm text-red-600">{errors.location.message}</p>
            )}

            {/* Smart Location Fields */}
            {!isViewMode && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precise Address (for map & distance)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    {...register('vendorLocation')}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    placeholder="e.g., Prism Towers, 4th Floor"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if ("geolocation" in navigator) {
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setValue('vendorLat', position.coords.latitude);
                            setValue('vendorLng', position.coords.longitude);
                            toast.success("Location coordinates captured!");
                          },
                          (error) => toast.error("Location error: " + error.message)
                        );
                      } else {
                        toast.error("Geolocation not supported");
                      }
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    title="Use Current Location"
                  >
                    🎯
                  </button>
                </div>
                <input type="hidden" {...register('vendorLat')} />
                <input type="hidden" {...register('vendorLng')} />
                {(watch('vendorLat') || watch('vendorLng')) && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Coordinates ready: {Number(watch('vendorLat')).toFixed(4)}, {Number(watch('vendorLng')).toFixed(4)}
                  </p>
                )}
              </div>
            )}

            {isViewMode && initialData?.vendorLocation && (
              <div className="mt-2 text-sm text-gray-600">
                <span className="font-medium">Precise Address:</span> {initialData.vendorLocation}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Service Type *
            </label>
            <div className="space-y-2">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  value="online"
                  {...register('isOnline')}
                  disabled={isViewMode}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Online Service</span>
              </label>
              <br />
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  value="offline"
                  {...register('isOnline')}
                  disabled={isViewMode}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">In-Person Service</span>
              </label>
              <br />
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  value="both"
                  {...register('isOnline')}
                  disabled={isViewMode}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Both (Online & In-Person)</span>
              </label>
            </div>
            {errors.isOnline && (
              <p className="mt-1 text-sm text-red-600">{errors.isOnline.message}</p>
            )}
          </div>
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Service Images {!isViewMode && '(Up to 5) '}
            {!isEditing && !isViewMode && '*'}
          </label>

          {/* Existing Images */}
          {(isEditing || isViewMode) && existingImages.length > 0 && (
            <div className="mt-2 mb-4">
              <p className="text-sm text-gray-500 mb-2">Service Images:</p>
              <div className="flex flex-wrap gap-4">
                {existingImages.map((image, index) => (
                  <div key={image.id} className="relative group">
                    <img
                      src={image.imageUrl}
                      alt="Service preview"
                      className="h-24 w-24 object-cover rounded-md"
                    />
                    {index === 0 && (
                      <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs px-2 py-1 rounded-tl-md rounded-br-md font-semibold">
                        Cover
                      </div>
                    )}
                    {!isViewMode && (
                      <button
                        type="button"
                        onClick={() => removeExistingImage(image.id)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove image"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Image Upload */}
          {!isViewMode && (
            <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="images"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                  >
                    <span>Upload images</span>
                    <input
                      id="images"
                      name="images"
                      type="file"
                      className="sr-only"
                      multiple
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PNG, JPG, GIF up to 5MB, up to 5 images</p>
              </div>
            </div>
          )}

          {/* Image Previews */}
          {imagePreviews.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">New Images to Upload:</p>
              <div className="flex flex-wrap gap-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="h-24 w-24 object-cover rounded-md"
                    />
                    <button
                      type="button"
                      onClick={() => removeImagePreview(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove image"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errors.images && (
            <p className="mt-1 text-sm text-red-600">{errors.images.message}</p>
          )}
        </div>

        {/* Delivery Configuration */}
        <div className="bg-green-50 rounded-lg p-6 border border-green-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🚚</span>
            Delivery Configuration
          </h3>
          <div className="space-y-4">
            {/* Delivery Fee Type */}
            <div>
              <label htmlFor="deliveryFeeType" className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Fee Type
              </label>
              <select
                id="deliveryFeeType"
                {...register('deliveryFeeType')}
                disabled={isViewMode}
                className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-semibold shadow-sm hover:border-blue-200 transition-all appearance-none cursor-pointer"
              >
                <option value="fixed">Fixed Amount (Ksh)</option>
                <option value="percentage">Percentage (%)</option>
                <option value="free">Free Delivery</option>
              </select>
            </div>

            {/* Delivery Fee Amount */}
            {watch('deliveryFeeType') !== 'free' && (
              <div>
                <label htmlFor="deliveryFee" className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Fee {watch('deliveryFeeType') === 'percentage' ? '(%)' : '(Ksh)'}
                </label>
                <input
                  id="deliveryFee"
                  type="number"
                  {...register('deliveryFee')}
                  placeholder="0"
                  min="0"
                  disabled={isViewMode}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                {errors.deliveryFee && (
                  <p className="mt-1 text-sm text-red-600">{errors.deliveryFee.message}</p>
                )}
              </div>
            )}

            {/* Delivery Coverage Zones */}
            <div>
              <label htmlFor="deliveryCoverageZones" className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Coverage Zones
              </label>
              <textarea
                id="deliveryCoverageZones"
                {...register('deliveryCoverageZones')}
                placeholder="e.g., Nairobi, Kiambu, Machakos"
                rows={3}
                disabled={isViewMode}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter zones separated by commas
              </p>
            </div>
          </div>
        </div>

        {/* Marketing Configuration */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border-2 border-purple-200 shadow-sm mt-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-purple-900 flex items-center">
              <span className="mr-2 text-xl">🚀</span>
              Marketing Configuration
            </h3>
            <div className="flex items-center space-x-2 bg-white/80 px-4 py-2 rounded-full border border-purple-200 shadow-sm">
              <input
                type="checkbox"
                id="marketingEnabled"
                {...register('marketingEnabled')}
                disabled={isViewMode}
                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-purple-300 rounded"
              />
              <label htmlFor="marketingEnabled" className="text-sm font-semibold text-purple-800 cursor-pointer">
                Enable Optimization
              </label>
            </div>
          </div>

          {watch('marketingEnabled') && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Marketing Commission Type */}
                <div>
                  <label htmlFor="marketingCommissionType" className="block text-sm font-semibold text-purple-700 mb-2 mr-2">
                    Commission Type
                  </label>
                  <select
                    id="marketingCommissionType"
                    {...register('marketingCommissionType')}
                    disabled={isViewMode}
                    className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 font-semibold shadow-sm hover:border-purple-300 transition-all appearance-none cursor-pointer"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Fixed Amount (Ksh)</option>
                  </select>
                </div>

                {/* Marketing Commission */}
                <div>
                  <label htmlFor="marketingCommission" className="block text-sm font-semibold text-purple-700 mb-2">
                    Marketing Commission
                  </label>
                  <input
                    id="marketingCommission"
                    type="number"
                    step="0.01"
                    {...register('marketingCommission')}
                    placeholder="0"
                    min="0"
                    disabled={isViewMode}
                    className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 font-semibold shadow-sm transition-all"
                  />
                  {errors.marketingCommission && (
                    <p className="mt-1 text-xs text-red-600">{errors.marketingCommission.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Marketing Start Date */}
                <div>
                  <label htmlFor="marketingStartDate" className="block text-sm font-semibold text-purple-700 mb-2 mr-2">
                    Campaign Start Date
                  </label>
                  <input
                    id="marketingStartDate"
                    type="date"
                    {...register('marketingStartDate')}
                    disabled={isViewMode}
                    className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 font-semibold shadow-sm transition-all"
                  />
                </div>

                {/* Marketing End Date */}
                <div>
                  <label htmlFor="marketingEndDate" className="block text-sm font-semibold text-purple-700 mb-2 mr-2">
                    Campaign End Date
                  </label>
                  <input
                    id="marketingEndDate"
                    type="date"
                    {...register('marketingEndDate')}
                    disabled={isViewMode}
                    className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 font-semibold shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Marketing Duration */}
              <div>
                <label htmlFor="marketingDuration" className="block text-sm font-semibold text-purple-700 mb-2 mr-2">
                  Target Duration (days)
                </label>
                <div className="relative">
                  <input
                    id="marketingDuration"
                    type="number"
                    {...register('marketingDuration')}
                    placeholder="30"
                    min="1"
                    disabled={isViewMode}
                    className="w-full px-4 py-2 pl-10 border border-purple-100 rounded-lg bg-purple-50/50 shadow-inner"
                  />
                  <span className="absolute left-3 top-2.5 text-purple-300 font-bold">#</span>
                </div>
                <p className="text-xs text-purple-500 mt-2 italic font-medium">
                  Informative: Total planned duration for this campaign.
                </p>
                {errors.marketingDuration && (
                  <p className="mt-1 text-xs text-red-600">{errors.marketingDuration.message}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-6 border-t flex items-center justify-between mt-8">
          <div className="text-sm text-gray-500 italic">
            All changes are saved automatically to your drafts.
          </div>

          <div className="flex items-center space-x-4">
            {!isViewMode && <AutoSaveIndicator lastSaved={lastSaved} />}
            
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (isEditing) {
                  const serviceId = initialData?.id || initialData?._id;
                  navigate(`/dashboard/services`);
                } else {
                  navigate(-1);
                }
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>

            {isViewMode ? (
              <Button
                type="button"
                onClick={() => {
                  if (onEdit) {
                    onEdit();
                  } else {
                    const serviceId = initialData?.id || initialData?._id;
                    if (serviceId) {
                      navigate(`/dashboard/products/edit/${serviceId}`);
                    }
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Edit Service
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isLoading}
                className={`bg-blue-600 hover:bg-blue-700 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </>
                ) : isEditing ? 'Update Service' : 'Create Service'}
              </Button>
            )}
          </div>
        </div>
      </form>

      <SystemFeedbackModal
        open={showModal}
        onOpenChange={setShowModal}
        type={modalConfig.type}
        title={modalConfig.title}
        description={modalConfig.description}
        onConfirm={handleDialogClose}
      />
    </div>
  );
};

export default ServiceForm;
