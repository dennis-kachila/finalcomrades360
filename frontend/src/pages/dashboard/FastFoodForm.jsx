import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { useToast } from '../../components/ui/use-toast';
import ChangesDialog from '../../components/ui/changes-dialog';
import { resolveImageUrl } from '../../utils/imageUtils';
import { fastFoodService } from '../../services/fastFoodService';
import api, { productApi } from '../../services/api';
import { useCategories } from '../../contexts/CategoriesContext';
import { FaArrowLeft, FaSave, FaSpinner, FaUpload, FaTimes, FaCheck, FaCloudUploadAlt } from 'react-icons/fa';
import { Utensils, Clock } from 'lucide-react';
import SystemFeedbackModal from '../../components/ui/SystemFeedbackModal';
import Dialog from '../../components/Dialog';
import {
  Dialog as UIDialog,
  DialogContent as UIDialogContent,
  DialogDescription as UIDialogDescription,
  DialogFooter as UIDialogFooter,
  DialogHeader as UIDialogHeader,
  DialogTitle as UIDialogTitle,
} from '../../components/ui/dialog';
import useAutoSave from '../../hooks/useAutoSave'; // Import AutoSave hook
import AutoSaveIndicator from '../../components/ui/AutoSaveIndicator';
import { recursiveParse, ensureArray, ensureObject } from '../../utils/parsingUtils';

const DEFAULT_SCHEDULE = [
  { day: 'Monday', available: true, from: '08:00', to: '22:00' },
  { day: 'Tuesday', available: true, from: '08:00', to: '22:00' },
  { day: 'Wednesday', available: true, from: '08:00', to: '22:00' },
  { day: 'Thursday', available: true, from: '08:00', to: '22:00' },
  { day: 'Friday', available: true, from: '08:00', to: '22:00' },
  { day: 'Saturday', available: true, from: '08:00', to: '22:00' },
  { day: 'Sunday', available: true, from: '08:00', to: '22:00' },
  { day: 'All Days', available: true, from: '08:00', to: '22:00' }
];

const FastFoodForm = ({
  id: propId,
  mode = 'create',
  onCancel,
  onSuccess,
  onEdit,
  isSellerContext: isSellerContextProp = false,
  listMode = false,
  product: initialProduct = null,
  onAfterSave,
  apiType = 'fastfood', // [apiType]: 'fastfood' (default) or 'product' (when used from ProductForm)
}) => {
  const { id: paramId } = useParams();
  // ROBUST FIX: Check propId, paramId, AND initialProduct.id
  const id = propId || paramId || initialProduct?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const isViewMode = mode === 'view' || location.pathname.includes('/view/');
  const isEditMode = mode === 'edit' || !!id || location.pathname.includes('/edit/');

  console.log('🍔 FastFoodForm INITIALIZE:', {
    id,
    derivedFrom: { propId, paramId, initialProductId: initialProduct?.id },
    mode,
    isViewMode,
    hasInitialProduct: !!initialProduct,
    initialProductKeys: initialProduct ? Object.keys(initialProduct) : [],
    initialProductItemType: initialProduct?.itemType,
    propId,
    paramId,
    hasOnSuccess: !!onSuccess,
    hasOnAfterSave: !!onAfterSave,
    hasOnCancel: !!onCancel
  });

  // Track mode changes to prevent auto-submission
  useEffect(() => {
    if (previousModeRef.current !== mode) {
      console.log('🔄 Mode transition detected:', { from: previousModeRef.current, to: mode });
      modeTransitionRef.current = true;
      previousModeRef.current = mode;

      // Clear the flag after 500ms
      const timer = setTimeout(() => {
        modeTransitionRef.current = false;
        console.log('✅ Mode transition guard cleared');
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [mode]);

  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', description: '' });
  const [savedItem, setSavedItem] = useState(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [validationError, setValidationError] = useState(null); // { title, description, scrollToId? }

  // Clear Form Logic
  const performClear = () => {
    setFormData({
      name: '',
      shortDescription: '',
      description: '',
      category: '',
      subcategoryId: '',
      basePrice: '',
      discountPercentage: '',
      displayPrice: '',
      discountPrice: '',
      isActive: true,
      isAvailable: true,
      availabilityMode: 'AUTO',
      preparationTimeMinutes: '',
      availableFrom: '',
      availableTo: '',
      availabilityDays: [],
      mainImage: null,
      existingMainImage: null,
      deliveryTimeEstimateMinutes: '',
      pickupAvailable: false,
      pickupLocation: '',
      deliveryAreaLimits: '',
      tags: '',
      ingredients: '',
      estimatedServings: '',
      dietaryTags: [],
      isFeatured: false,
      minOrderQty: '',
      maxOrderQty: '',
      galleryImages: [],
      newGalleryFiles: [],
      sizeVariants: [],
      isComboOption: false,
      comboOptions: [],
      kitchenVendor: '',
      vendorLocation: '',
      vendorLat: '',
      vendorLng: '',
      deliveryFeeType: 'fixed',
      deliveryFee: '',
      deliveryCoverageZones: '',
      marketingEnabled: false,
      marketingCommissionType: 'flat',
      marketingCommission: '',
      marketingDuration: '',
      marketingStartDate: '',
      marketingEndDate: '',
      isEditOperation: false
    });
    setImagePreview('');
    setGalleryPreviews([]);
    // Clear draft from localStorage
    const draftKey = `fastfood_draft_${id || 'new'}`;
    localStorage.removeItem(draftKey);
    toast({ title: 'Form Cleared', description: 'You can start afresh.' });
    setShowClearDialog(false);
  };



  const handleDialogClose = () => {
    setShowModal(false);
    if (onSuccess) {
      onSuccess(isEditMode);
    } else {
      // Navigate to the appropriate fast food management page based on context
      const basePath = location.pathname.includes('/seller/') ? '/seller/fast-food' : '/dashboard/fastfood';
      navigate(basePath);
    }
  };

  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(!!id);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(true);
  const [foodSubcategories, setFoodSubcategories] = useState([]);
  const { user: currentUser } = useAuth();
  const { categories: allCategories } = useCategories();

  // Derived seller context for hiding admin fields
  const isSellerContext = isSellerContextProp || (currentUser?.role === 'seller' && !['admin', 'superadmin', 'super_admin'].includes(currentUser?.role));

  const [userLoading, setUserLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    shortDescription: '',
    description: '',
    category: '',
    subcategoryId: '',
    basePrice: '',
    discountPercentage: '',
    displayPrice: '', // NEW: Auto-calculated display price
    discountPrice: '', // NEW: Auto-calculated price after discount
    isActive: true,
    isAvailable: true, // Legacy field
    availabilityMode: 'AUTO', // NEW: Manual Status Override (AUTO, OPEN, CLOSED)
    preparationTimeMinutes: '',
    availableFrom: '',
    availableTo: '',
    availabilityDays: DEFAULT_SCHEDULE, // NEW: Day-specific schedule
    mainImage: null,
    // For edit mode - track existing image
    existingMainImage: null,
    // Delivery Rules
    deliveryTimeEstimateMinutes: '',
    pickupAvailable: false,
    pickupLocation: '',
    deliveryAreaLimits: '',
    // Additional Fields
    tags: '',
    ingredients: '',
    // NEW FIELDS
    estimatedServings: '',
    dietaryTags: [],
    isFeatured: false,
    minOrderQty: '',
    maxOrderQty: '',
    allergens: [],
    nutritionalInfo: {
      calories: '',
      protein: '',
      carbs: '',
      fat: ''
    },
    spiceLevel: 'medium',
    dailyLimit: '',
    customizations: [],
    // Gallery Images
    galleryImages: [], // Will hold existing image filenames (strings)
    newGalleryFiles: [], // Will hold new File objects
    // Size Variants
    sizeVariants: [],
    isComboOption: false,
    comboOptions: [],
    kitchenVendor: '',
    vendorLocation: '',
    // Delivery Configuration
    deliveryFeeType: 'fixed',
    deliveryFee: '',
    deliveryCoverageZones: '',
    // Marketing Configuration
    marketingEnabled: false,
    marketingCommissionType: 'flat',
    marketingCommission: '',
    marketingDuration: '',
    marketingStartDate: '',
    marketingEndDate: '',
    // Flag for edit operations
    isEditOperation: false
  });
  const [imagePreview, setImagePreview] = useState('');
  // Enhanced gallery preview state
  const [galleryPreviews, setGalleryPreviews] = useState([]); // { url, isFile, original }
  const [vendorInfo, setVendorInfo] = useState(null);

  // Auto-save integration
  const draftKey = `fastfood_draft_${id || 'new'}`;

  // CRITICAL FIX: Use ref to hold formData to prevent dependency loop
  const formDataRef = useRef(formData);

  // Keep ref in sync with formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const restoreDraft = useCallback((draftData) => {
    if (!draftData) return;
    console.log('🍔 Restoring draft data:', draftData);

    // Merge draft data with initial structure to ensure new fields act correctly
    // We intentionally exclude image objects (File) as they can't be restored from JSON
    setFormData(prev => ({
      ...prev,
      ...draftData,
      mainImage: null, // Files cannot be restored
      newGalleryFiles: [], // Files cannot be restored
      // Restore arrays properly
      dietaryTags: Array.isArray(draftData.dietaryTags) ? draftData.dietaryTags : prev.dietaryTags,
      availabilityDays: Array.isArray(draftData.availabilityDays) ? draftData.availabilityDays : prev.availabilityDays
    }));

    toast({
      title: "Draft Restored",
      description: "Your previous progress has been restored.",
    });
  }, [toast]);

  const { clearDraft, lastSaved } = useAutoSave(
    // Only auto-save if in create mode or edit mode with valid ID, and NOT in view mode
    (!isViewMode) ? draftKey : null,
    formData,
    restoreDraft,
    { debounceMs: 1000 }
  );

  // Server-side Autosave Effect (Only in Edit Mode)
  // CRITICAL FIX: Use formDataRef.current inside effect, only depend on lastSaved
  useEffect(() => {
    if (!lastSaved || !isEditMode || !id || isViewMode) return;

    // Check if we have minimum required fields using the ref
    const currentFormData = formDataRef.current;
    if (!currentFormData.name || !currentFormData.basePrice) return;

    const performServerAutosave = async () => {
      console.log('🔄 Performing background server autosave...');
      try {
        const submitData = new FormData();

        // Append all form data using the ref
        Object.keys(currentFormData).forEach(key => {
          if (key === 'galleryImages' || key === 'newGalleryFiles' || key === 'mainImage') return;
          // Handle complex objects
          if (typeof currentFormData[key] === 'object' && currentFormData[key] !== null) {
            if (Array.isArray(currentFormData[key])) {
              submitData.append(key, JSON.stringify(currentFormData[key]));
            } else {
              submitData.append(key, JSON.stringify(currentFormData[key]));
            }
          } else {
            submitData.append(key, currentFormData[key]);
          }
        });

        // FIX: Removed the line that forced draft='true' for autosave
        // The backend controller will handle status logic correctly based on user role
        // Regular sellers will get reviewStatus='pending', admins get reviewStatus='approved'

        // Call update API (silent)
        if (apiType === 'product') {
          await productApi.update(id, submitData);
        } else {
          await fastFoodService.updateFastFood(id, submitData);
        }
        console.log('✅ Background autosave complete.');

        // Optional: show small indicator
        // toast({ title: "Saved", description: "Changes saved.", duration: 1000 });
      } catch (error) {
        console.warn('Background autosave failed:', error);
      }
    };

    performServerAutosave();
  }, [lastSaved, isEditMode, id, isViewMode]);


  // Track mode transitions to prevent auto-submission
  const modeTransitionRef = useRef(false);
  const previousModeRef = useRef(mode);
  const draftSubmissionRef = useRef(false);


  // Changes dialog state
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [changes, setChanges] = useState([]);
  const [originalData, setOriginalData] = useState({});

  // Function to detect changes between original and current data
  const detectChanges = () => {
    if (!isEditMode || !Object.keys(originalData).length) return [];

    const detectedChanges = [];

    // Compare each field
    Object.keys(formData).forEach(key => {
      const originalValue = originalData[key];
      const currentValue = formData[key];

      // Skip strictly internal or derived fields
      if (['existingMainImage', 'hasNewMainImage', 'isEditOperation', 'discountPrice'].includes(key)) {
        return;
      }

      // Special handling for Main Image change detection
      if (key === 'mainImage') {
        if (currentValue instanceof File) {
          detectedChanges.push({
            field: 'Main Image',
            type: 'modified',
            before: originalData.existingMainImage || '(no image)',
            after: currentValue.name + ' (new upload)'
          });
        }
        return;
      }

      // Special handling for Gallery Images (New Uploads)
      if (key === 'newGalleryFiles') {
        if (currentValue && currentValue.length > 0) {
          detectedChanges.push({
            field: 'Gallery (New Uploads)',
            type: 'modified',
            before: '(none)',
            after: `${currentValue.length} new image(s) added`
          });
        }
        return;
      }

      // Handle nested objects like nutritionalInfo
      if (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {
        if (JSON.stringify(originalValue) !== JSON.stringify(currentValue)) {
          detectedChanges.push({
            field: key,
            type: 'modified',
            before: originalValue || {},
            after: currentValue
          });
        }
        return;
      }

      // Handle arrays
      if (Array.isArray(currentValue)) {
        if (JSON.stringify(originalValue || []) !== JSON.stringify(currentValue)) {
          detectedChanges.push({
            field: key,
            type: 'modified',
            before: originalValue || [],
            after: currentValue
          });
        }
        return;
      }

      // Handle primitive values (Booleans, Strings, Numbers)
      const normOriginal = (originalValue === null || originalValue === undefined) ? '' : originalValue;
      const normCurrent = (currentValue === null || currentValue === undefined) ? '' : currentValue;

      if (String(normOriginal) !== String(normCurrent)) {
        detectedChanges.push({
          field: key,
          type: 'modified',
          before: normOriginal,
          after: normCurrent
        });
      }
    });

    return detectedChanges;
  };

  // Simple authentication check
  const fetchUserData = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.data) {
        localStorage.setItem('user', JSON.stringify(response.data));
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    let user;

    try {
      const userString = localStorage.getItem('user');
      user = userString ? JSON.parse(userString) : null;

      // If we have a token but no user, try to fetch the user data
      if (token && !user) {
        console.log('Token exists but no user data, fetching user...');
        user = await fetchUserData();
      }
    } catch (error) {
      console.error('Error parsing user data:', error);
      user = null;
    }

    console.log('User object:', user);
    console.log('Token exists:', !!token);

    if (!token || !user) {
      console.log('No token or user, redirecting to login');
      navigate('/login');
      return null;
    }

    const allowedRoles = ['admin', 'superadmin', 'super_admin', 'super admin', 'seller'];
    const userRole = String(user?.role || '').toLowerCase();
    const userRoles = Array.isArray(user?.roles) ? user.roles.map(r => String(r).toLowerCase()) : [userRole];

    console.log('Checking if role is allowed. Role:', userRole, 'Roles:', userRoles, 'Allowed roles:', allowedRoles);

    const isAllowed = allowedRoles.some(role => userRoles.includes(role) || userRole === role);

    if (!isAllowed) {
      console.log('Role not allowed, redirecting to dashboard');
      navigate('/dashboard');
      return null;
    }

    return user;
  }, [navigate, fetchUserData]);

  useEffect(() => {
    const verifyAuth = async () => {
      const user = await checkAuth();
      if (user) {
        // user is already available via useAuth hook as currentUser
        setAuthLoading(false);
      }
    };

    console.log('🔐 FastFoodForm verifyAuth effect triggered');
    verifyAuth();
  }, [checkAuth]);



  // Auto-calculate Marketing Duration based on Start/End Dates
  useEffect(() => {
    if (formData.marketingStartDate && formData.marketingEndDate) {
      const start = new Date(formData.marketingStartDate);
      const end = new Date(formData.marketingEndDate);
      // Calculate difference in milliseconds
      const diffTime = end - start;
      // Convert to days (ceil to ensure at least 1 day if any time diff, but Math.round is safer for dates)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0) {
        setFormData(prev => ({ ...prev, marketingDuration: diffDays === 0 ? 1 : diffDays }));
      }
    }
  }, [formData.marketingStartDate, formData.marketingEndDate]);

  // Function to load food & drinks subcategories — tries context first, then direct API
  const loadFoodSubcategories = useCallback(async () => {
    console.log('📂 loadFoodSubcategories called, allCategories length:', allCategories?.length ?? 0);
    setSubcategoriesLoading(true);

    try {
      // STEP 1: Try to get subcategories from context allCategories
      if (allCategories && allCategories.length > 0) {
        // Find categories explicitly tagged as 'fast_food'
        const foodCategories = allCategories.filter(cat =>
          String(cat.taxonomyType) === 'fast_food'
        );

        console.log('Found food categories by taxonomyType:', foodCategories.length);

        if (foodCategories.length > 0) {
          // For FastFoodForm, we focus on the first matching category or merge all subcategories
          // Usually there is only one "Fast Food" or "Food & Drinks" category
          const mainFoodCategory = foodCategories[0];
          const foodSubcatList = mainFoodCategory.Subcategory || mainFoodCategory.subcategories || [];
          console.log('Food subcategories from taxonomy:', foodSubcatList.length, foodSubcatList);

          if (foodSubcatList.length > 0) {
            setFoodSubcategories(foodSubcatList);
            setSubcategoriesLoading(false);
            return;
          }

          // Context has the category but no subcategories — fetch them directly
          console.log('⚠️ Context has Food category but no subcategories. Fetching via API...');
          try {
            const { default: api } = await import('../../services/api');
            const res = await api.get(`/categories/${foodCategory.id}/subcategories`);
            const subs = Array.isArray(res.data) ? res.data : [];
            console.log('✅ Fetched subcategories via API:', subs.length);
            if (subs.length > 0) {
              setFoodSubcategories(subs);
              setSubcategoriesLoading(false);
              return;
            }
          } catch (apiErr) {
            console.error('Direct subcategory API fetch failed:', apiErr.message);
          }
        }
      }

      // STEP 2: Full fallback — fetch all categories from API directly
      console.log('⚠️ Context missing food categories. Fetching all categories via API...');
      try {
        const { default: api } = await import('../../services/api');
        const res = await api.get('/categories');
        const cats = Array.isArray(res.data) ? res.data : [];
        const foodCat = cats.find(c =>
          c.name.toLowerCase() === 'food & drinks' ||
          c.name.toLowerCase() === 'food and drinks' ||
          (c.name.toLowerCase().includes('food') && c.name.toLowerCase().includes('drink'))
        );
        if (foodCat) {
          const subs = foodCat.Subcategory || foodCat.subcategories || [];
          if (subs.length > 0) {
            console.log('✅ Fallback: set food subcategories:', subs.length);
            setFoodSubcategories(subs);
            setSubcategoriesLoading(false);
            return;
          }
        }
      } catch (fallbackErr) {
        console.error('Full category fallback API fetch failed:', fallbackErr.message);
      }

      console.warn('No Food & Drinks subcategories found anywhere — showing empty list');
      setFoodSubcategories([]);
    } catch (error) {
      console.error('Failed to process food subcategories:', error);
      setFoodSubcategories([]);
    } finally {
      setSubcategoriesLoading(false);
    }
  }, [allCategories]);

  useEffect(() => {
    // Always try to load — even if allCategories is empty (will use direct API fallback)
    loadFoodSubcategories();
  }, [allCategories, loadFoodSubcategories]);


  const hasResetNewForm = useRef(false);
  useEffect(() => {
    console.log('🔄 useEffect [id, isEditMode, isViewMode, foodSubcategories] TRIGGERED:', {
      id, isEditMode, isViewMode,
      subcategoriesCount: foodSubcategories.length,
      hasInitialProduct: !!initialProduct
    });
    if (isEditMode || isViewMode) {
      const fetchItem = async () => {
        try {
          // If initialProduct is provided, we still check for vendorDetail
          // If vendorDetail is missing, we fetch it from the backend to ensure view mode is complete
          let item = initialProduct;

          if (id && (!item || (isViewMode && !item.vendorDetail))) {
            const response = await fastFoodService.getFastFoodById(id);
            if (response.success) {
              item = response.data;
            } else if (!item) {
              // Only navigate away if we have no item at all
              toast({ title: 'Error', description: 'Failed to load fast food item.', variant: 'destructive' });
              if (onCancel) onCancel();
              else navigate('/dashboard/fastfood');
              return;
            }
          }

          if (item && item.vendorDetail) {
            setVendorInfo(item.vendorDetail);
          }

          // Safe availability days parsing
          let availabilityDays = ensureArray(item.availabilityDays);
          if (availabilityDays.length === 0) {
            availabilityDays = DEFAULT_SCHEDULE;
          }

          // Check if the existing category is in our food subcategories
          // We do this check only if subcategories are loaded, otherwise keep original
          // If subcategories load LATER, we might want another effect to sync, but usually keeping the string is safe.
          let validCategory = item.category || '';
          let validSubcategoryId = item.subcategoryId || '';

          if (foodSubcategories.length > 0) {
            const matchingSubcat = foodSubcategories.find(s => s.name === item.category);
            validCategory = matchingSubcat ? item.category : (item.category || '');
            validSubcategoryId = matchingSubcat ? matchingSubcat.id : (item.subcategoryId || '');
          }

          const formDataObject = {
            name: item.name || '',
            shortDescription: item.shortDescription || '',
            description: item.description || '',
            category: validCategory,
            subcategoryId: validSubcategoryId,
            basePrice: item.basePrice || '',
            discountPercentage: item.discountPercentage || '',
            isActive: item.isActive,
            preparationTimeMinutes: item.preparationTimeMinutes || '',
            availableFrom: item.availableFrom || '',
            availableTo: item.availableTo || '',
            mainImage: null, // We don't pre-fill file inputs, but track if it's a new upload
            existingMainImage: item.mainImage || null, // Store existing image URL
            // Delivery Rules
            deliveryTimeEstimateMinutes: item.deliveryTimeEstimateMinutes || '',
            pickupAvailable: item.pickupAvailable !== undefined ? item.pickupAvailable : false,
            pickupLocation: item.pickupLocation || '',
            deliveryAreaLimits: ensureArray(item.deliveryAreaLimits).join(', '),
            // Additional Fields
            tags: ensureArray(item.tags).join(', '),
            ingredients: (() => {
              let ings = recursiveParse(item.ingredients);

              if (Array.isArray(ings)) {
                return ings.map(ing => {
                  const parsedIng = recursiveParse(ing);
                  if (typeof parsedIng === 'string') return parsedIng;

                  if (parsedIng && typeof parsedIng === 'object') {
                    // Robust check for nested ingredients in 'name' field (data corruption recovery)
                    const unwrappedName = recursiveParse(parsedIng.name);

                    if (Array.isArray(unwrappedName)) {
                      return unwrappedName.map(subItem => {
                        const sub = recursiveParse(subItem);
                        const n = sub.name || (typeof sub === 'string' ? sub : '');
                        const q = sub.quantity || '';
                        const u = sub.unit || '';
                        return `${n} ${q || u ? `(${q} ${u})` : ''}`.trim();
                      }).join('\n');
                    }

                    const name = typeof unwrappedName === 'string' ? unwrappedName : (parsedIng.name || '');
                    const qty = parsedIng.quantity || '';
                    const unit = parsedIng.unit || '';
                    return `${name} ${qty || unit ? `(${qty} ${unit})` : ''}`.trim() || '';
                  }
                  return '';
                }).filter(Boolean).join('\n');
              }

              // If it's a string but not an array (e.g. newline separated)
              if (typeof ings === 'string') return ings;

              return '';
            })(),
            spiceLevel: item.spiceLevel || 'medium',
            nutritionalInfo: {
              calories: item.nutritionalInfo?.calories || '',
              protein: item.nutritionalInfo?.protein || '',
              carbs: item.nutritionalInfo?.carbs || '',
              fat: item.nutritionalInfo?.fat || ''
            },
            // Gallery Images
            galleryImages: ensureArray(item.galleryImages),
            // Size Variants and Combo Options
            sizeVariants: ensureArray(item.sizeVariants),
            isComboOption: item.isComboOption || false,
            comboOptions: ensureArray(item.comboOptions),
            // Production Limits
            dailyLimit: item.dailyLimit || '',
            kitchenVendor: item.kitchenVendor || '',
            vendorLocation: item.vendorLocation || '',
            displayPrice: item.displayPrice || '',
            estimatedServings: item.estimatedServings || '1 person',
            dietaryTags: Array.isArray(item.dietaryTags) ? item.dietaryTags : [],
            isFeatured: item.isFeatured || false,
            minOrderQty: item.minOrderQty !== undefined && item.minOrderQty !== null ? item.minOrderQty : '',
            maxOrderQty: item.maxOrderQty || '',
            allergens: ensureArray(item.allergens),
            // Delivery Configuration
            deliveryFeeType: item.deliveryFeeType || 'fixed',
            deliveryFee: item.deliveryFee !== undefined && item.deliveryFee !== null ? item.deliveryFee : '',
            deliveryCoverageZones: ensureArray(item.deliveryCoverageZones).join(', '),
            // Marketing Configuration
            marketingCommissionType: item.marketingCommissionType || 'flat',
            marketingCommission: item.marketingCommissionType === 'percentage' ? (item.marketingCommissionPercentage || 0) : (item.marketingCommission || 0),
            marketingEnabled: item.marketingEnabled || false,
            marketingStartDate: item.marketingStartDate || '',
            marketingEndDate: item.marketingEndDate || '',
            marketingDuration: item.marketingDuration || 0,
            // Calculate duration if dates are present
            ...(() => {
              if (item.marketingStartDate && item.marketingEndDate) {
                const start = new Date(item.marketingStartDate);
                const end = new Date(item.marketingEndDate);
                const diffTime = end.getTime() - start.getTime();
                const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                return { marketingDuration: diffDays };
              }
              return {};
            })(),
            // Weekly availability schedule
            availabilityDays: availabilityDays,
            isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
            availabilityMode: item.availabilityMode || 'AUTO',
            customizations: ensureArray(item.customizations),
            // Flag to track if this is an edit operation
            isEditOperation: true
          };

          setFormData(formDataObject);
          setOriginalData({ ...formDataObject }); // Store original data for change tracking
          if (item.mainImage) {
            setImagePreview(resolveImageUrl(item.mainImage));
          }


          // Initial gallery previews - use the safe array from formDataObject
          const galleryImagesArray = formDataObject.galleryImages;

          if (galleryImagesArray.length > 0) {
            setGalleryPreviews(galleryImagesArray.map(img => ({
              url: resolveImageUrl(img),
              isFile: false,
              original: img
            })));
          } else {
            setGalleryPreviews([]);
          }
        } catch (error) {
          console.error('❌ FastFoodForm fetchItem error:', error);
          if (!initialProduct) {
            toast({ title: 'Error', description: 'Failed to fetch item details.', variant: 'destructive' });
            if (onCancel) onCancel();
            else navigate('/dashboard/fastfood');
          } else {
            console.log('⚠️ Error occurred but using initialProduct as fallback');
          }
        } finally {
          setPageLoading(false);
        }
      };
      fetchItem();
    } else if (!hasResetNewForm.current) {
      // Robustly ensure category is empty for new forms on first mount
      // This overrides any stale drafts matching old default patterns
      console.log('✨ Fresh Form Detect: Initializing empty category defaults');
      setFormData(prev => ({ 
        ...prev, 
        category: '', 
        subcategoryId: '',
        deliveryTimeEstimateMinutes: '',
        pickupAvailable: false,
        estimatedServings: '',
        availableFrom: '',
        availableTo: ''
      }));
      hasResetNewForm.current = true;
    }
  }, [id, isEditMode, isViewMode, initialProduct, navigate, toast, foodSubcategories]);

  // Marketing Duration calculation
  useEffect(() => {
    if (formData.marketingStartDate && formData.marketingEndDate) {
      const start = new Date(formData.marketingStartDate);
      const end = new Date(formData.marketingEndDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      if (formData.marketingDuration !== diffDays) {
        setFormData(prev => ({ ...prev, marketingDuration: diffDays }));
      }
    }
  }, [formData.marketingStartDate, formData.marketingEndDate, formData.marketingDuration]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name.startsWith('nutritional.')) {
      const nutrient = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        nutritionalInfo: {
          ...prev.nutritionalInfo,
          [nutrient]: value
        }
      }));
    } else {
      setFormData(prev => {
        const newData = {
          ...prev,
          [name]: type === 'checkbox' ? checked : value,
        };

        // Auto-calculate discountPrice based on context
        if (['basePrice', 'displayPrice', 'discountPercentage'].includes(name)) {
          const nextBase = parseFloat(name === 'basePrice' ? value : prev.basePrice) || 0;
          const nextDisplay = parseFloat(name === 'displayPrice' ? value : prev.displayPrice) || 0;
          const nextPct = parseFloat(name === 'discountPercentage' ? value : prev.discountPercentage) || 0;

          // Determine anchor price for calculation
          // Seller: Usually doesn't specify display/discount prices (admin does during listing)
          // Admin: Display Price is the anchor
          if (isSellerContext) {
            // For sellers, we don't automatically calculate a discountPrice based on basePrice
            // unless we want to allow them to suggest a discounted price.
            // But based on user feedback, displayPrice (and thus derived prices) shouldn't have values.
            newData.discountPrice = '';
            newData.displayPrice = '';
          } else {
            const anchorPrice = nextDisplay;
            newData.discountPrice = anchorPrice > 0 ? (anchorPrice * (1 - nextPct / 100)).toFixed(2) : '';
          }
        }

        return newData;
      });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        mainImage: file,
        // Mark that we have a new image in edit mode
        ...(isEditMode && { hasNewMainImage: true })
      }));
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // Enhanced authentication validation function
  const validateAuth = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('🚨 No authentication token found');
      return false;
    }

    try {
      // Test the token by making a simple API call
      await api.get('/auth/me');
      console.log('✅ Authentication token is valid');
      return true;
    } catch (error) {
      console.log('🚨 Token validation failed:', error.message);
      // Clear invalid token
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log('🚀 Form Submit Debug:', {
      isViewMode,
      isEditMode,
      mode,
      hasId: !!id,
      pathname: location.pathname,
      eventType: e?.type,
      eventTarget: e?.target?.tagName,
      submitter: e?.submitter?.outerHTML?.substring(0, 100),
      stackTrace: new Error().stack
    });

    // CRITICAL: Prevent submission during mode transitions
    if (modeTransitionRef.current) {
      console.log('⛔ Form submission blocked: mode transition in progress');
      return;
    }

    // CRITICAL: Prevent submission in view mode
    if (isViewMode) {
      console.log('⛔ Form submission blocked: currently in view mode');
      return;
    }

    // For listing/approval, bypass change detection
    if (listMode) {
      console.log('🚀 List Mode active - Bypassing change detection and saving directly');
      await performSave();
      return;
    }

    // For edit mode, detect changes and show dialog
    if (isEditMode) {
      const detectedChanges = detectChanges();
      if (detectedChanges.length > 0) {
        console.log('📋 Changes detected:', detectedChanges);
        setChanges(detectedChanges);
        setShowChangesDialog(true);
        return; // Stop here, actual save happens in performSave
      } else {
        toast({
          title: 'No Changes',
          description: 'No changes detected to save.',
          variant: 'default',
        });
        return;
      }
    }

    // For create mode, save directly
    await performSave();
  };

  // Actual save function (called after dialog confirmation or directly for create mode)
  const performSave = async () => {
    // [NEW] Validation for Admin "Approve & List" Workflow
    if (listMode) {
      console.log('🛡️ Validating listing requirements...');

      const showListingError = (title, description, scrollToId) => {
        setValidationError({ title, description, scrollToId });
        setLoading(false);
      };

      // 1. Display Price Validation
      if (!formData.displayPrice || parseFloat(formData.displayPrice) <= 0) {
        showListingError(
          'Display Price Required',
          'Display Price determines the selling price and is required before this item can be listed. Please enter a valid display price.',
          'displayPrice'
        );
        return;
      }

      // 2. Delivery Configuration Validation
      if (!formData.deliveryFeeType) {
        showListingError(
          'Delivery Fee Type Required',
          'Please select a Delivery Fee Type (Fixed, Percentage, or Free Delivery) before listing this item.',
          'deliveryFeeType'
        );
        return;
      }

      const fee = parseFloat(formData.deliveryFee);
      // If "Free Delivery" is selected, fee MUST be 0
      if (formData.deliveryFeeType === 'free') {
        if (fee > 0) {
          showListingError(
            'Invalid Delivery Fee',
            'You selected Free Delivery, but the Delivery Fee is set to a value greater than 0. Please set it to 0 or change the delivery type.',
            'deliveryFee'
          );
          return;
        }
      }
      // If NOT Free Delivery, fee must be > 0
      else {
        if (isNaN(fee) || fee <= 0) {
          showListingError(
            'Delivery Fee Required',
            'A valid Delivery Fee greater than 0 is required for the selected delivery type. Please enter a delivery fee or switch to Free Delivery.',
            'deliveryFee'
          );
          return;
        }
      }

      // 3. Marketing Configuration Validation (Only if enabled)
      if (formData.marketingEnabled) {
        if (!formData.marketingCommission || parseFloat(formData.marketingCommission) <= 0) {
          showListingError(
            'Marketing Commission Required',
            'Marketing is enabled but no commission value has been set. Please enter a valid marketing commission or disable marketing.',
            null
          );
          return;
        }
        if (!formData.marketingStartDate || !formData.marketingEndDate) {
          showListingError(
            'Campaign Dates Required',
            'Marketing is enabled but the campaign start and/or end dates are missing. Please set both dates or disable marketing.',
            null
          );
          return;
        }
      }
    }
    toast({ title: 'Debug', description: 'performSave started', duration: 1000 });
    setLoading(true);

    // DEBUG: Log authentication state
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    console.log('🚀 performSave Debug:', {
      hasToken: !!token,
      tokenLength: token?.length,
      hasUser: !!user,
      userData: user ? JSON.parse(user) : null,
      currentUser: currentUser,
      isEditMode,
      isViewMode
    });

    // Validate authentication first
    const isAuthValid = await validateAuth();
    if (!isAuthValid) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to update FastFood items.',
        variant: 'destructive',
      });
      setLoading(false);
      if (onCancel) onCancel();
      else navigate('/login'); // If auth fails during save, login is better than products
      return;
    }

    const scrollToError = (id) => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus({ preventScroll: true }); // Prevent double scroll, just focus
        // Add a temporary highlight effect
        element.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
        setTimeout(() => {
          element.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2');
        }, 2000);
      } else {
        console.warn(`⚠️ Could not find element with id '${id}' to scroll to.`);
      }
    };

    // Validate required fields
    console.log('📝 Validating Name:', formData.name);
    if (!formData.name.trim()) {
      console.error('❌ Validation Failed: Name is required');
      toast({
        title: 'Validation Error',
        description: 'Item name is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('name');
      return;
    }

    console.log('📝 Validating Short Description:', formData.shortDescription);
    if (!formData.shortDescription?.trim()) {
      console.error('❌ Validation Failed: Short Description is required');
      toast({
        title: 'Validation Error',
        description: 'A short description (tagline) is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('shortDescription');
      return;
    }

    console.log('📝 Validating Category:', formData.category);
    if (!formData.category) {
      console.error('❌ Validation Failed: Category is required');
      toast({
        title: 'Validation Error',
        description: 'Category is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('category');
      return;
    }

    console.log('📝 Validating Base Price:', formData.basePrice);
    if (!formData.basePrice || parseFloat(formData.basePrice) <= 0) {
      console.error('❌ Validation Failed: Base Price is invalid', formData.basePrice);
      toast({
        title: 'Validation Error',
        description: 'Valid base price is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('basePrice');
      return;
    }

    // NEW: Validate displayPrice >= basePrice (Only if listing or if displayPrice is set)
    const basePrice = parseFloat(formData.basePrice);
    const displayPrice = parseFloat(formData.displayPrice || 0);

    // Only validate if we are in listMode (must be valid) OR if (NOT seller and displayPrice > 0)
    // Sellers may have a displayPrice > 0 from a previous approval, but they can't see/edit it, so we shouldn't block them.
    if ((listMode || (!isSellerContext && displayPrice > 0)) && displayPrice < basePrice) {
      console.error('❌ Validation Failed: Display Price < Base Price');
      toast({
        title: 'Validation Error',
        description: 'Display price must be greater than or equal to base price.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('displayPrice');
      return;
    }

    // NEW: Validate discountPrice > 0
    const discountPrice = parseFloat(formData.discountPrice || 0);
    if ((listMode || (!isSellerContext && discountPrice > 0)) && discountPrice <= 0) {
      console.error('❌ Validation Failed: Discount Price invalid');
      toast({
        title: 'Validation Error',
        description: 'Discount price must be greater than 0. Check display price and discount percentage.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('displayPrice'); // Scroll to displayPrice as discountPrice is read-only
      return;
    }

    console.log('📝 Validating Prep Time:', formData.preparationTimeMinutes);
    if (!formData.preparationTimeMinutes || parseInt(formData.preparationTimeMinutes) <= 0) {
      console.error('❌ Validation Failed: Prep Time invalid');
      toast({
        title: 'Validation Error',
        description: 'Valid preparation time is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('preparationTimeMinutes');
      return;
    }

    if (!formData.deliveryTimeEstimateMinutes || parseInt(formData.deliveryTimeEstimateMinutes) <= 0) {
      console.error('❌ Validation Failed: Delivery Time invalid');
      toast({
        title: 'Validation Error',
        description: 'Valid delivery time estimate is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('deliveryTimeEstimateMinutes');
      return;
    }

    if (!formData.ingredients?.trim()) {
      console.error('❌ Validation Failed: Ingredients missing');
      toast({
        title: 'Validation Error',
        description: 'Ingredients list is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('ingredients');
      return;
    }

    // Note: Image upload is now MANDATORY for new items
    console.log('📝 Validating Main Image:', { isEditMode, hasImage: !!formData.mainImage });
    if (!isEditMode && !formData.mainImage) {
      console.error('❌ Validation Failed: Main Image missing');
      toast({
        title: 'Validation Error',
        description: 'Main image is required for new items.',
        variant: 'destructive',
        duration: 5000
      });
      setLoading(false);
      scrollToError('mainImage'); // Might need to ensure this ID exists on the container or input
      return;
    }

    // Gallery Images Validation
    console.log('📝 Validating Gallery Images:', galleryPreviews.length);
    if (galleryPreviews.length === 0) {
      console.error('❌ Validation Failed: Gallery Images missing');
      toast({
        title: 'Validation Error',
        description: 'At least one gallery image is required.',
        variant: 'destructive',
        duration: 5000
      });
      setLoading(false);
      scrollToError('galleryImages');
      return;
    }

    if (galleryPreviews.length > 3) {
      console.error('❌ Validation Failed: Too many gallery images');
      toast({
        title: 'Validation Error',
        description: 'Maximum 3 gallery images allowed.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }



    // Vendor Information Validation
    if (!formData.kitchenVendor?.trim()) {
      console.error('❌ Validation Failed: Kitchen Vendor missing');
      toast({
        title: 'Validation Error',
        description: 'Kitchen/Vendor Name is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('kitchenVendor');
      return;
    }

    if (!formData.vendorLocation?.trim()) {
      console.error('❌ Validation Failed: Vendor Location missing');
      toast({
        title: 'Validation Error',
        description: 'Vendor Address/Location is required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('vendorLocation');
      return;
    }

    if (!formData.deliveryAreaLimits?.trim()) {
      console.error('❌ Validation Failed: Delivery Limits missing');
      toast({
        title: 'Validation Error',
        description: 'Delivery Boundary / Coverage Zones are required.',
        variant: 'destructive',
      });
      setLoading(false);
      scrollToError('deliveryAreaLimits');
      return;
    }

    // Delivery Fee Validation
    if (!isSellerContext && formData.deliveryFeeType !== 'free') {
      // If fixed or percentage, fee must be > 0 and present
      if (!formData.deliveryFee || parseFloat(formData.deliveryFee) <= 0) {
        console.error('❌ Validation Failed: Delivery Fee invalid');
        toast({
          title: 'Validation Error',
          description: 'Delivery fee is required when not set to Free Delivery.',
          variant: 'destructive'
        });
        setLoading(false);
        scrollToError('deliveryFee');
        return;
      }
    }

    // Schedule Validation
    const hasActiveSchedule = formData.availabilityDays && formData.availabilityDays.length > 0 && formData.availabilityDays.some(d => d.available);
    if (!hasActiveSchedule && formData.availabilityMode === 'AUTO') {
      console.error('❌ Validation Failed: Schedule invalid');
      // If AUTO mode, at least one day must be available
      toast({
        title: 'Validation Error',
        description: 'Please set at least one day as "Available" in the Operational Schedule.',
        variant: 'destructive'
      });
      setLoading(false);
      scrollToError('availabilityMode'); // Trying to scroll to the mode selector which should be nearby
      return;
    }

    console.log('✅ ALL VALIDATION PASSED');

    try {
      // CRITICAL FIX: Declare response variable
      let response;

      // Build FormData payload to match backend expectations (multipart/form-data)
      // Check if we have files to upload
      const hasNewFiles = (formData.mainImage instanceof File) || (formData.newGalleryFiles && formData.newGalleryFiles.length > 0);

      let submitData;

      if (!hasNewFiles && isEditMode) {
        // use JSON for updates without files (more reliable)
        console.log('🚀 No new files, using JSON payload for update');
        submitData = {
          name: formData.name,
          shortDescription: formData.shortDescription || '',
          description: formData.description || formData.shortDescription || '',
          category: formData.category,
          subcategoryId: formData.subcategoryId || null,
          basePrice: formData.basePrice,
          discountPercentage: formData.discountPercentage || 0,
          discountPrice: formData.discountPrice || null,
          preparationTimeMinutes: formData.preparationTimeMinutes,
          availableFrom: formData.availableFrom,
          availableTo: formData.availableTo,
          deliveryTimeEstimateMinutes: formData.deliveryTimeEstimateMinutes,
          pickupAvailable: formData.pickupAvailable,

          // Force active state if listing

          // Arrays - sent as actual arrays in JSON
          deliveryAreaLimits: (formData.deliveryAreaLimits || '').split(',').map(x => x.trim()).filter(Boolean),
          tags: (formData.tags || '').split(',').map(x => x.trim()).filter(Boolean),
          ingredients: (formData.ingredients || '').split('\n').map(x => x.trim()).filter(Boolean),

          ...(formData.displayPrice && parseFloat(formData.displayPrice) > 0 ? { displayPrice: formData.displayPrice } : {}),
          estimatedServings: formData.estimatedServings || '1 person',
          isFeatured: formData.isFeatured,
          minOrderQty: formData.minOrderQty || 1,
          ...(formData.maxOrderQty ? { maxOrderQty: formData.maxOrderQty } : {}),
          dietaryTags: formData.dietaryTags || [],
          kitchenVendor: formData.kitchenVendor || 'Main Kitchen',
          vendorLocation: formData.vendorLocation,
          [apiType === 'product' ? 'sellerId' : 'vendor']: currentUser?.id || 1,
          vendor: currentUser?.id || 1, // Keep vendor for safety if backend expects it
          allergens: ['none'],
          isAvailable: true, // Force true to avoid legacy locks since we now use availabilityMode
          isActive: listMode ? true : formData.isActive,
          availabilityMode: formData.availabilityMode || 'AUTO',
          availabilityDays: formData.availabilityDays || [],

          pickupLocation: (formData.pickupAvailable && formData.pickupLocation) ? formData.pickupLocation : undefined,

          // Use 'extraImages' directly as backend expects this name in JSON mode (mapped in controller for formData)
          // But wait, controller maps galleryImages -> extraImages manually
          // So we can send galleryImages if we want, OR send extraImages directly.
          // Let's send 'galleryImages' to be consistent with FormData flow, controller handles mapping.
          galleryImages: formData.galleryImages || [],

          sizeVariants: formData.sizeVariants || [],
          isComboOption: formData.isComboOption,
          comboOptions: formData.comboOptions || [],

          // Delivery Configuration
          deliveryFeeType: formData.deliveryFeeType || 'fixed',
          deliveryFee: parseFloat(formData.deliveryFee) || 0,
          deliveryCoverageZones: (formData.deliveryCoverageZones || '').split(',').map(x => x.trim()).filter(Boolean),

          // Marketing Configuration
          marketingEnabled: formData.marketingEnabled || false,
          marketingCommissionType: formData.marketingCommissionType || 'flat',
          marketingCommission: parseFloat(formData.marketingCommission) || 0,
          marketingDuration: parseInt(formData.marketingDuration) || 30,
          marketingStartDate: formData.marketingStartDate || null,
          marketingEndDate: formData.marketingEndDate || null
        };
      } else {
        // Use FormData for file uploads or Create mode
        console.log('🚀 Files detected or Create mode, using FormData payload');
        submitData = new FormData();

        // Basic fields
        submitData.append('name', formData.name);
        submitData.append('shortDescription', formData.shortDescription || '');
        submitData.append('description', formData.description || formData.shortDescription || '');
        submitData.append('category', formData.category);
        submitData.append('subcategoryId', String(formData.subcategoryId || ''));
        submitData.append('basePrice', formData.basePrice);
        submitData.append('discountPercentage', formData.discountPercentage || 0);
        if (formData.discountPrice && parseFloat(formData.discountPrice) > 0) submitData.append('discountPrice', formData.discountPrice);
        if (formData.displayPrice && parseFloat(formData.displayPrice) > 0) submitData.append('displayPrice', formData.displayPrice);
        submitData.append('preparationTimeMinutes', String(formData.preparationTimeMinutes));
        submitData.append('availableFrom', formData.availableFrom);
        submitData.append('availableTo', formData.availableTo);

        // Delivery rules
        submitData.append('deliveryTimeEstimateMinutes', String(formData.deliveryTimeEstimateMinutes));
        submitData.append('pickupAvailable', String(formData.pickupAvailable));

        // deliveryAreaLimits
        const deliveryAreas = (formData.deliveryAreaLimits || '').split(',').map(x => x.trim()).filter(Boolean);
        submitData.append('deliveryAreaLimits', JSON.stringify(deliveryAreas));

        // Additional fields
        const tags = (formData.tags || '').split(',').map(x => x.trim()).filter(Boolean);
        submitData.append('tags', JSON.stringify(tags));

        // ingredients
        const ingredients = (formData.ingredients || '').split('\n').map(x => x.trim()).filter(Boolean);
        submitData.append('ingredients', JSON.stringify(ingredients));

        // Other fields
        submitData.append('estimatedServings', formData.estimatedServings || '1 person');
        submitData.append('isFeatured', String(formData.isFeatured));
        submitData.append('minOrderQty', String(formData.minOrderQty || ''));
        if (formData.maxOrderQty) submitData.append('maxOrderQty', String(formData.maxOrderQty));
        submitData.append('dietaryTags', JSON.stringify(formData.dietaryTags || []));

        // Availability days
        submitData.append('availabilityDays', JSON.stringify(formData.availabilityDays || []));

        // Backend-required fields
        submitData.append('kitchenVendor', formData.kitchenVendor || 'Main Kitchen');
        submitData.append('vendorLocation', formData.vendorLocation || '');
        if (apiType === 'product') {
          submitData.append('sellerId', String(currentUser?.id || '1'));
        }
        submitData.append('vendor', currentUser?.id || '1');
        submitData.append('allergens', JSON.stringify(formData.allergens || []));
        submitData.append('isAvailable', 'true'); // Force true to avoid legacy locks
        submitData.append('availabilityMode', formData.availabilityMode || 'AUTO');
        submitData.append('isActive', listMode ? 'true' : String(formData.isActive));

        // Attach main image file if provided (only for new uploads)
        if (formData.mainImage instanceof File) {
          submitData.append('mainImage', formData.mainImage);
        }

        // Add pickup location
        if (formData.pickupAvailable && formData.pickupLocation) {
          submitData.append('pickupLocation', formData.pickupLocation);
        }

        // Add gallery images (new uploads)
        if (formData.newGalleryFiles && formData.newGalleryFiles.length > 0) {
          formData.newGalleryFiles.forEach(file => {
            submitData.append('galleryImages', file);
          });
        }

        // Preserve existing gallery images (sent even if empty to allow deletions)
        submitData.append('existingGalleryImages', JSON.stringify(formData.galleryImages || []));

        // Add size variants
        if (formData.sizeVariants && formData.sizeVariants.length > 0) {
          submitData.append('sizeVariants', JSON.stringify(formData.sizeVariants));
        }

        // Add combo options
        submitData.append('isComboOption', String(formData.isComboOption));
        if (formData.comboOptions && formData.comboOptions.length > 0) {
          submitData.append('comboOptions', JSON.stringify(formData.comboOptions));
        }

        // Delivery Configuration
        submitData.append('deliveryFeeType', formData.deliveryFeeType || 'fixed');
        submitData.append('deliveryFee', String(parseFloat(formData.deliveryFee) || 0));
        const deliveryZones = (formData.deliveryCoverageZones || '').split(',').map(x => x.trim()).filter(Boolean);
        submitData.append('deliveryCoverageZones', JSON.stringify(deliveryZones));

        // Marketing Configuration
        submitData.append('marketingEnabled', String(formData.marketingEnabled || false));
        submitData.append('marketingCommissionType', formData.marketingCommissionType || 'flat');
        submitData.append('marketingCommission', String(formData.marketingCommission || 0));
        submitData.append('marketingDuration', String(formData.marketingDuration || 30));
        submitData.append('marketingStartDate', formData.marketingStartDate || '');
        submitData.append('marketingEndDate', formData.marketingEndDate || '');
      }

      // [NEW] If listing mechanism is triggered (Admin approving pending item)
      if (listMode) {
        console.log('🚀 LIST MODE: Forcing item to APPROVED and reviewStatus to APPROVED');
        if (submitData instanceof FormData) {
          submitData.append('approved', 'true');
          submitData.append('reviewStatus', 'approved');
        } else {
          submitData.approved = true;
          submitData.reviewStatus = 'approved';
        }
      }

      // Enhanced Save Logic
      if (isEditMode) {
        if (id) {
          console.log('🔄 UPDATE mode - ID:', id);
          if (apiType === 'product') {
            response = await productApi.update(id, submitData);
          } else {
            response = await fastFoodService.updateFastFood(id, submitData);
          }
        } else {
          console.error('❌ CRITICAL ERROR: Edit mode but ID is missing', { initialProduct, id });
          toast({
            title: 'Error',
            description: 'Cannot update: Product ID is missing. Check console for details.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
      } else {
        console.log('✨ CREATE mode - No ID or listing mode');
        if (apiType === 'product') {
          response = await productApi.create(submitData);
        } else {
          response = await fastFoodService.createFastFood(submitData);
        }
      }

      console.log('📦 API Response:', response);

      // Toast for raw response status (Debug only)
      toast({
        title: 'Debug: API Response Received',
        description: `Success: ${response?.success}, Status: ${response?.status}`,
        duration: 3000
      });

      if (response.success || response?.data?.success) {
        console.log('✅ SUCCESS BLOCK ENTERED');
        const savedData = response.data?.data || response.data;
        setSavedItem(savedData);

        if (onAfterSave) {
          onAfterSave(savedData);
        }

        // Show success dialog
        const isSuperAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

        setModalConfig({
          type: 'success',
          title: listMode ? 'Item Listed Successfully!' : 'Success!',
          description: listMode
            ? `"${formData.name}" has been approved and is now live on the platform.`
            : `Item "${formData.name}" has been saved successfully.`
        });
        setShowModal(true);
        clearDraft(); // Clear draft on successful save
      } else {
        console.error('❌ SUCCESS CHECK FAILED', response);
        const failMsg = response.message || 'Server returned success: false';
        toast({ title: 'Submission Failed', description: failMsg, variant: 'destructive', duration: 5000 });
        throw new Error(failMsg);
      }
    } catch (error) {
      console.error('Form submission error:', error);

      let errorMessage = error.response?.data?.message || error.message || 'Unknown error';

      // Enhanced error handling
      if (error.response?.data?.details?.fields || error.response?.data?.missing) {
        const missingFields = error.response.data?.details?.fields || error.response.data?.missing;
        if (Array.isArray(missingFields) && missingFields.length > 0) {
          errorMessage = `${error.response.data.message || 'Validation failed'}: Missing ${missingFields.join(', ')}`;
        }
      } else if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        const fieldErrors = error.response.data.errors.map(e => `${e.field || e.path}: ${e.message}`).join(', ');
        if (fieldErrors) {
          errorMessage = `${error.response.data.message || 'Validation failed'}: ${fieldErrors}`;
        }
      }

      // Authentication handling
      if (error.response?.status === 401) {
        errorMessage = 'Your session has expired. Please log in again.';
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setTimeout(() => navigate('/login'), 2000);
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to perform this action.';
      }

      // Set and show error dialog
      setModalConfig({
        type: 'error',
        title: 'Error Saving Item',
        description: errorMessage
      });
      setShowModal(true);

      toast({
        title: 'Error Saving Item',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  // Show loading spinner during authentication
  if (authLoading) {
    console.log('FastFoodForm: Showing auth loading state');
    return (
      <div className="flex justify-center items-center h-64">
        <FaSpinner className="animate-spin text-blue-500 text-2xl" />
        <span className="ml-2">Authenticating...</span>
      </div>
    );
  }

  if (pageLoading) {
    console.log('FastFoodForm: Showing page loading state');
    return (
      <div className="flex justify-center items-center h-64">
        <FaSpinner className="animate-spin text-blue-500 text-2xl" />
        <span className="ml-2">Loading item details...</span>
      </div>
    );
  }

  if (subcategoriesLoading) {
    console.log('FastFoodForm: Showing subcategories loading state');
    return (
      <div className="bg-white rounded-lg shadow px-3 py-4 sm:p-6">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="mr-4"
          >
            <FaArrowLeft />
          </Button>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEditMode ? 'Edit FastFood Item' : 'Create FastFood Item'}
          </h1>
        </div>
        <div className="flex justify-center items-center h-32">
          <FaSpinner className="animate-spin text-orange-500 text-2xl" />
          <span className="ml-2">Loading food categories...</span>
        </div>
      </div>
    );
  }


  /* 
   * Non-blocking Warning: If no subcategories found, we still render the form 
   * but the category dropdown might be empty.
   */
  if (foodSubcategories.length === 0 && !loading && !subcategoriesLoading) {
    console.warn('FastFoodForm: No food subcategories found, but proceeding to render form.');
  }

  console.log('FastFoodForm: Rendering main form');

  return (
    <div className="bg-white rounded-lg shadow px-3 py-4 sm:p-6 mx-2 sm:mx-0">
      <div className="flex items-center mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="mr-4"
        >
          <FaArrowLeft />
        </Button>
        <h1 className="text-2xl font-bold text-gray-800">
          {isEditMode ? 'Edit FastFood Item' : 'Create FastFood Item'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {isViewMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vendor Information Card */}
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-100 shadow-sm">
              <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                <span className="mr-2">👤</span>
                Vendor Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-1 border-b border-blue-100">
                  <span className="text-sm font-medium text-blue-800">Owner Name:</span>
                  <span className="text-sm text-gray-700">{vendorInfo?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-blue-100">
                  <span className="text-sm font-medium text-blue-800">Phone:</span>
                  <span className="text-sm text-gray-700">{vendorInfo?.phone || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-medium text-blue-800">Email:</span>
                  <span className="text-sm text-gray-700">{vendorInfo?.email || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Inventory Status Card */}
            <div className="bg-green-50 rounded-lg p-6 border border-green-100 shadow-sm">
              <h3 className="text-lg font-semibold text-green-900 mb-4 flex items-center">
                <span className="mr-2">📦</span>
                Inventory Status
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-1 border-b border-green-100">
                  <span className="text-sm font-medium text-green-800">Current Status:</span>
                  <span className={`text - sm font - bold ${formData.isActive ? 'text-green-600' : 'text-red-600'} `}>
                    {formData.isActive ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-medium text-green-800">Daily Order Limit:</span>
                  <span className="text-sm text-gray-700">{formData.dailyLimit || 'No limit set'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-green-100 pt-2">
                  <span className="text-sm font-medium text-green-800">Min Order Qty:</span>
                  <span className="text-sm text-gray-700">{formData.minOrderQty || 1}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="name">Item Name *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name || ''}
              onChange={handleInputChange}
              required
              disabled={isViewMode}
              maxLength={20}
            />
            <div className="flex justify-between mt-1">
              <p className="text-[10px] text-gray-500">Character limit for cleaner card display</p>
              <p className={`text-[10px] font-bold ${formData.name?.length >= 18 ? 'text-red-500' : 'text-gray-500'}`}>
                {formData.name?.length || 0}/20
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="category">Food Category *</Label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={(e) => {
                const selectedName = e.target.value;
                const selectedSubcat = foodSubcategories.find(s => s.name === selectedName);
                setFormData(prev => ({
                  ...prev,
                  category: selectedName,
                  subcategoryId: selectedSubcat ? selectedSubcat.id : ''
                }));
              }}
              className="w-full px-4 py-3 border-2 border-orange-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-gray-900 font-semibold shadow-sm hover:border-orange-200 transition-all appearance-none cursor-pointer"
              required
              disabled={isViewMode}
            >
              <option value="">Select a category</option>
              {foodSubcategories.length > 0 && foodSubcategories.map(cat => (
                <option key={cat.id || cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-orange-600 mt-2 font-medium flex items-center gap-1">
              <span className="bg-orange-100 p-0.5 rounded-full">ℹ️</span>
              Categories are loaded from the Food & drinks category
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="shortDescription">Short Description <span className="text-red-500">*</span></Label>
          <Input id="shortDescription" name="shortDescription" value={formData.shortDescription} onChange={handleInputChange} placeholder="A catchy one-liner" disabled={isViewMode} />
        </div>

        <div>
          <Label htmlFor="description">Full Description</Label>
          <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} rows={4} placeholder="Detailed description of the item..." disabled={isViewMode} />
        </div>

        {/* Pricing & Details */}
        <div className="bg-indigo-50 rounded-lg p-6 border border-indigo-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">💰</span>
            Pricing & Prep Time
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div>
              <Label htmlFor="basePrice">Base Price (KES) *</Label>
              <Input id="basePrice" name="basePrice" type="number" value={formData.basePrice} onChange={handleInputChange} required min="0" step="0.01" disabled={isViewMode} title="Seller's original price" />
            </div>
            {!isSellerContext && (
              <>
                <div>
                  <Label htmlFor="displayPrice">Display Price (KES) *</Label>
                  <Input id="displayPrice" name="displayPrice" type="number" value={formData.displayPrice} onChange={handleInputChange} required min="0" step="0.01" disabled={isViewMode} className="border-blue-300 focus:ring-blue-500" title="Platform selling price (anchor for discount)" />
                </div>
                <div>
                  <Label htmlFor="discountPercentage">Discount (%) <span className="text-gray-400 font-normal">(Optional)</span></Label>
                  <Input id="discountPercentage" name="discountPercentage" type="number" value={formData.discountPercentage} onChange={handleInputChange} placeholder="0-100" min="0" max="100" disabled={isViewMode} />
                </div>
                <div>
                  <Label htmlFor="discountPrice" className="text-blue-700 font-bold">Discount Price (KES)</Label>
                  <Input id="discountPrice" name="discountPrice" type="number" value={formData.discountPrice} readOnly disabled className="bg-blue-100 border-blue-200 font-bold text-blue-900" title="Final calculated selling price" />
                </div>
              </>
            )}
            {isSellerContext && (
              <div>
                <Label htmlFor="discountPercentage">Discount (%) <span className="text-gray-400 font-normal">(Optional)</span></Label>
                <Input id="discountPercentage" name="discountPercentage" type="number" value={formData.discountPercentage} onChange={handleInputChange} placeholder="0-100" min="0" max="100" disabled={isViewMode} />
              </div>
            )}
            <div>
              <Label htmlFor="preparationTimeMinutes">Prep Time (mins) *</Label>
              <Input
                id="preparationTimeMinutes"
                name="preparationTimeMinutes"
                type="number"
                value={formData.preparationTimeMinutes}
                onChange={handleInputChange}
                required
                min="1"
                placeholder=""
                disabled={isViewMode}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        {/* Global Toggle & Weekly Schedule */}
        <div id="availabilityMode" className="bg-orange-50 rounded-xl p-6 border border-orange-100 col-span-1 md:col-span-2 lg:col-span-4 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
              <Utensils size={20} />
              Operational Schedule *
            </h3>
            <p className="text-sm text-orange-700 mt-1">Set your shop's daily operating hours</p>
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
                onClick={() => !isViewMode && setFormData(prev => ({ ...prev, availabilityMode: opt.value }))}
                disabled={isViewMode}
                className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${formData.availabilityMode === opt.value ? `${opt.color} shadow-sm border border-current` : 'text-gray-400 border border-transparent hover:text-gray-600'} ${isViewMode ? 'cursor-not-allowed opacity-70' : ''} `}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'All Days'].map((day) => {
              const dayData = (formData.availabilityDays || []).find(d => d.day === day) || { day, available: false, from: '08:00', to: '22:00' };

              const updateDay = (updates) => {
                const currentDays = [...(formData.availabilityDays || [])];
                const index = currentDays.findIndex(d => d.day === day);

                if (index >= 0) {
                  currentDays[index] = { ...currentDays[index], ...updates };
                } else {
                  currentDays.push({ ...dayData, ...updates });
                }
                setFormData(prev => ({ ...prev, availabilityDays: currentDays }));
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
                        className="text-sm p-1.5 border border-gray-300 bg-white text-gray-900 font-medium rounded focus:ring-1 focus:ring-blue-500 w-[130px]"
                      />
                      <span className="text-[10px] text-gray-400 font-bold text-center">to</span>
                      <input
                        type="time"
                        disabled={isViewMode}
                        value={dayData.to}
                        onChange={(e) => updateDay({ to: e.target.value })}
                        className="text-sm p-1.5 border border-gray-300 bg-white text-gray-900 font-medium rounded focus:ring-1 focus:ring-blue-500 w-[130px]"
                      />
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-400 italic">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-orange-600 mt-4 font-medium italic">
            * The "OPEN/CLOSED" status on the menu is determined by the schedules set above. Sellers can stay manually "CLOSED" even during operating hours if needed.
          </p>
        </div>

        {/* Display Price & Order Limits */}
        <div className="bg-indigo-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">💰</span>
            Pricing & Order Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label htmlFor="minOrderQty">Min Order Quantity *</Label>
              <Input
                id="minOrderQty"
                name="minOrderQty"
                type="number"
                value={formData.minOrderQty}
                onChange={handleInputChange}
                required
                min="1"
                placeholder=""
                disabled={isViewMode}
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum quantity per order
              </p>
            </div>
            <div>
              <Label htmlFor="maxOrderQty">Max Order Quantity</Label>
              <Input
                id="maxOrderQty"
                name="maxOrderQty"
                type="number"
                value={formData.maxOrderQty}
                onChange={handleInputChange}
                min={formData.minOrderQty || 1}
                placeholder="Leave empty for unlimited"
                disabled={isViewMode}
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum quantity per order (optional)
              </p>
            </div>
          </div>
        </div>

        {/* Dietary Information & Featured */}
        <div className="bg-teal-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🥗</span>
            Dietary Information & Features
          </h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="estimatedServings">Estimated Servings</Label>
              <select
                id="estimatedServings"
                name="estimatedServings"
                value={formData.estimatedServings}
                onChange={handleInputChange}
                disabled={isViewMode}
                className="w-full px-4 py-3 border-2 border-teal-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 font-semibold shadow-sm hover:border-teal-200 transition-all appearance-none cursor-pointer"
              >
                <option value="1 person">1 person</option>
                <option value="2-3 people">2-3 people</option>
                <option value="4+ people">4+ people</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                How many people does this serve?
              </p>
            </div>

            <div>
              <Label>Dietary Tags</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                {['Vegetarian', 'Vegan', 'Halal', 'Gluten-Free', 'Dairy-Free', 'Nut-Free'].map(tag => (
                  <label key={tag} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(formData.dietaryTags || []).includes(tag)}
                      onChange={(e) => {
                        const currentTags = formData.dietaryTags || [];
                        const newTags = e.target.checked
                          ? [...currentTags, tag]
                          : currentTags.filter(t => t !== tag);
                        setFormData(prev => ({ ...prev, dietaryTags: newTags }));
                      }}
                      disabled={isViewMode}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">{tag}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Select all dietary restrictions that apply
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <input
                type="checkbox"
                id="isFeatured"
                name="isFeatured"
                checked={formData.isFeatured}
                onChange={handleInputChange}
                disabled={isViewMode}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div>
                <Label htmlFor="isFeatured" className="font-medium cursor-pointer">
                  ⭐ Featured Item
                </Label>
                <p className="text-xs text-gray-500">
                  Highlight this item on the homepage and in search results
                </p>
              </div>
            </div>

            <div className="border-t border-teal-100 pt-4 mt-4">
              <Label className="text-sm font-bold text-teal-800 mb-2 block">Allergens</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {['Peanuts', 'Tree Nuts', 'Milk', 'Eggs', 'Wheat', 'Soy', 'Fish', 'Shellfish'].map(allergen => (
                  <label key={allergen} className="flex items-center space-x-2 cursor-pointer bg-white/50 p-2 rounded border border-teal-100 hover:bg-white transition-colors">
                    <input
                      type="checkbox"
                      checked={(formData.allergens || []).includes(allergen)}
                      onChange={(e) => {
                        const currentAllergens = formData.allergens || [];
                        const newAllergens = e.target.checked
                          ? [...currentAllergens, allergen]
                          : currentAllergens.filter(a => a !== allergen);
                        setFormData(prev => ({ ...prev, allergens: newAllergens }));
                      }}
                      disabled={isViewMode}
                      className="h-3 w-3 text-red-500 focus:ring-red-400 border-gray-300 rounded"
                    />
                    <span className="text-[11px] font-medium text-gray-700">{allergen}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-teal-100 pt-4 mt-6">
              <h4 className="text-sm font-bold text-teal-900 mb-3 flex items-center gap-2">
                <span className="bg-teal-200 p-1 rounded-full text-[10px]">🍎</span>
                Nutritional Information (per serving)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Calories (kcal)', key: 'calories', placeholder: '' },
                  { label: 'Protein (g)', key: 'protein', placeholder: '' },
                  { label: 'Carbs (g)', key: 'carbs', placeholder: '' },
                  { label: 'Fat (g)', key: 'fat', placeholder: '' }
                ].map((info) => (
                  <div key={info.key}>
                    <Label htmlFor={`nutritional.${info.key}`} className="text-[10px] uppercase tracking-wider text-gray-500">
                      {info.label}
                    </Label>
                    <Input
                      id={`nutritional.${info.key}`}
                      name={`nutritional.${info.key}`}
                      type="text"
                      value={formData.nutritionalInfo?.[info.key] || ''}
                      onChange={handleInputChange}
                      placeholder={info.placeholder}
                      disabled={isViewMode}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <Label>Main Image <span className="text-red-500">*</span></Label>
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="w-32 h-32 sm:w-64 sm:h-64 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-gray-200 shadow-inner">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-gray-400">
                  <FaUpload className="text-2xl sm:text-3xl mb-1" />
                  <span className="text-[10px] uppercase font-bold">No Image</span>
                </div>
              )}
            </div>
            {!isViewMode && (
              <div className="flex-1">
                <Input id="mainImage" name="mainImage" type="file" onChange={handleFileChange} accept="image/*" className="h-10 text-xs sm:text-sm" />
                <p className="text-[10px] sm:text-xs text-orange-600 mt-2 font-medium">
                  <span className="bg-orange-100 px-1.5 py-0.5 rounded mr-1">💡</span>
                  JPG, PNG, WEBP (Square 800x800 recommended)
                </p>
              </div>
            )}
            {isViewMode && (
              <div className="flex-1 italic text-gray-500 text-sm bg-gray-50 p-3 rounded-lg border border-dashed">
                Image upload disabled in view mode
              </div>
            )}
          </div>
        </div>

        {/* Gallery Images */}
        <div className="bg-purple-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">📸</span>
            Gallery Images
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="galleryImages" className="font-medium">
                Additional Images <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-gray-500">
                Add more photos to showcase your food item
              </p>
            </div>
            {!isViewMode && (
              <Input
                id="galleryImages"
                name="galleryImages"
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  if (files.length > 0) {
                    // Check limit
                    const currentCount = galleryPreviews.length;
                    const availableSlots = 3 - currentCount;

                    if (availableSlots <= 0) {
                      toast({
                        title: "Limit Reached",
                        description: "You can only upload a maximum of 3 gallery images.",
                        variant: "destructive"
                      });
                      e.target.value = '';
                      return;
                    }

                    let filesToAdd = files;
                    if (files.length > availableSlots) {
                      toast({
                        title: "Limit Receeded",
                        description: `Only ${availableSlots} more image(s) allowed. First ${availableSlots} were added.`,
                        variant: "default"
                      });
                      filesToAdd = files.slice(0, availableSlots);
                    }

                    // Generate previews for new files
                    const newPreviews = filesToAdd.map(file => ({
                      url: URL.createObjectURL(file),
                      isFile: true,
                      original: file
                    }));

                    setGalleryPreviews(prev => [...prev, ...newPreviews]);

                    // Update form data with NEW files
                    setFormData(prev => ({
                      ...prev,
                      newGalleryFiles: [...(prev.newGalleryFiles || []), ...filesToAdd]
                    }));
                  }

                  // Reset input value to allow selecting same files again if needed
                  e.target.value = '';
                }}
              />
            )}
            {isViewMode && (
              <div className="italic text-gray-500 text-sm py-2">
                Gallery image upload disabled in view mode
              </div>
            )}
            <p className="text-xs text-gray-500">
              You can select multiple images to show different angles or preparation stages of your food item.
            </p>

            {/* Gallery Previews Grid */}
            {galleryPreviews.length > 0 && (
              <div className="bg-white rounded-lg p-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Selected Images:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {galleryPreviews.map((preview, index) => (
                    <div key={index} className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                      <img
                        src={preview.url}
                        alt={`Gallery ${index + 1} `}
                        className="w-full h-full object-cover"
                      />
                      {/* Remove Button (only in edit/create modes) */}
                      {!isViewMode && (
                        <button
                          type="button"
                          onClick={() => {
                            // Remove from previews
                            const newPreviews = galleryPreviews.filter((_, i) => i !== index);
                            setGalleryPreviews(newPreviews);

                            if (preview.isFile) {
                              // Remove from new files list
                              const newFiles = formData.newGalleryFiles.filter(f => f !== preview.original);
                              setFormData(prev => ({ ...prev, newGalleryFiles: newFiles }));
                            } else {
                              // Remove from existing images list
                              const newExisting = formData.galleryImages.filter(img => img !== preview.original);
                              setFormData(prev => ({ ...prev, galleryImages: newExisting }));
                            }
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-md"
                          title="Remove image"
                        >
                          <FaTimes size={14} />
                        </button>
                      )}
                      {preview.isFile && (
                        <span className="absolute bottom-1 right-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          New
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hidden Input for handling additions */}
            <Input
              id="galleryImages"
              className="hidden" // Hide the original input if we use a custom UI, but we'll modify the loop above to use the main input
            />
          </div>
        </div>

        {/* Changes Dialog */}
        <ChangesDialog
          open={showChangesDialog}
          onOpenChange={setShowChangesDialog}
          changes={changes}
          onConfirm={async () => {
            setShowChangesDialog(false);
            await performSave();
          }}
          title="Review Changes"
          description="Please review the changes below before updating the item."
          actionLabel="Confirm Update"
        />

        {/* Delivery Configuration (Time & Fee) */}
        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🚚</span>
            Delivery & Fee Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="deliveryTimeEstimateMinutes">Delivery Time Estimate (mins) *</Label>
              <Input
                id="deliveryTimeEstimateMinutes"
                name="deliveryTimeEstimateMinutes"
                type="number"
                value={formData.deliveryTimeEstimateMinutes}
                onChange={handleInputChange}
                required
                min="1"
                placeholder=""
                disabled={isViewMode}
                className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-semibold shadow-sm transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">
                Time to deliver after preparation
              </p>
            </div>

            {!isSellerContext && (
              <>
                <div className="md:col-span-1">
                  <Label htmlFor="deliveryFeeType">Delivery Fee Type</Label>
                  <select
                    id="deliveryFeeType"
                    name="deliveryFeeType"
                    value={formData.deliveryFeeType}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-semibold shadow-sm hover:border-blue-200 transition-all appearance-none cursor-pointer"
                    disabled={isViewMode}
                  >
                    <option value="fixed">Fixed Amount (Ksh)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="free">Free Delivery</option>
                  </select>
                </div>

                {formData.deliveryFeeType !== 'free' && (
                  <div className="md:col-span-1">
                    <Label htmlFor="deliveryFee">
                      Delivery Fee {formData.deliveryFeeType === 'percentage' ? '(%)' : '(Ksh)'} *
                    </Label>
                    <Input
                      id="deliveryFee"
                      name="deliveryFee"
                      type="number"
                      value={formData.deliveryFee}
                      onChange={handleInputChange}
                      placeholder=""
                      min="0"
                      max={formData.deliveryFeeType === 'percentage' ? 100 : undefined}
                      disabled={isViewMode}
                    />
                  </div>
                )}

                {/* Delivery Coverage Zones */}
                <div className="md:col-span-2">
                  <Label htmlFor="deliveryCoverageZones">Delivery Coverage Zones</Label>
                  <Textarea
                    id="deliveryCoverageZones"
                    name="deliveryCoverageZones"
                    value={typeof formData.deliveryCoverageZones === 'string'
                      ? formData.deliveryCoverageZones
                      : (Array.isArray(formData.deliveryCoverageZones) ? formData.deliveryCoverageZones.join(', ') : '')}
                    onChange={handleInputChange}
                    placeholder="e.g., Nairobi, Kiambu, Machakos"
                    rows={3}
                    disabled={isViewMode}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter zones separated by commas
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-green-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🏷️</span>
            Additional Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                name="tags"
                value={formData.tags}
                onChange={handleInputChange}
                placeholder="popular, spicy, vegetarian, traditional"
                disabled={isViewMode}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter tags separated by commas (e.g., popular, spicy, vegetarian)
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="ingredients">Ingredients <span className="text-red-500">*</span></Label>
            <Textarea
              id="ingredients"
              name="ingredients"
              required
              value={formData.ingredients}
              onChange={handleInputChange}
              rows={3}
              placeholder="Potato (3 pieces), Onion (1 medium), Chickpea flour (1 cup), Spices (1 tsp)"
              disabled={isViewMode}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter each ingredient on a <b>new line</b>. Format: ingredient name (quantity unit)
            </p>
          </div>
        </div>



        {/* Size Variants */}
        <div className="bg-orange-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">📏</span>
            Size Variants
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Add different sizes for your food item (optional)
          </p>
          <div className="space-y-3">
            {formData.sizeVariants.length > 0 ? (
              <div className="space-y-4">
                {formData.sizeVariants.map((variant, index) => {
                  const calculateVariantPrice = (v) => {
                    const base = parseFloat(v.basePrice || v.price || 0);
                    const display = parseFloat(v.displayPrice || 0);
                    const discount = parseFloat(v.discountPercentage || 0);
                    const final = discount > 0 ? display * (1 - discount / 100) : display;
                    return { base, display, discount, final: final.toFixed(2) };
                  };
                  const prices = calculateVariantPrice(variant);

                  return (
                    <div key={index} className="bg-white rounded-xl p-4 sm:p-5 border-2 border-orange-50 shadow-sm relative group hover:border-orange-200 transition-all">
                      {!isViewMode && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute -top-4 -right-4 text-red-500 hover:text-white hover:bg-red-500 h-9 w-9 p-0 rounded-full shadow-lg bg-white border border-red-100 z-10 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={() => {
                            const newVariants = formData.sizeVariants.filter((_, i) => i !== index);
                            setFormData(prev => ({ ...prev, sizeVariants: newVariants }));
                          }}
                        >
                          <FaTimes size={16} />
                        </Button>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-10 gap-4 items-end">
                        <div className="sm:col-span-2 lg:col-span-3">
                          <Label className="text-[10px] uppercase font-black text-gray-400 mb-1.5 block tracking-widest">Size Name</Label>
                          <Input
                            value={variant.name}
                            onChange={(e) => {
                              const newVariants = [...formData.sizeVariants];
                              newVariants[index].name = e.target.value;
                              setFormData(prev => ({ ...prev, sizeVariants: newVariants }));
                            }}
                            placeholder="e.g. Small, Large"
                            disabled={isViewMode}
                            className="bg-gray-50/50 border-gray-200 focus:ring-orange-500 h-10 font-bold"
                          />
                        </div>

                        <div className="lg:col-span-2">
                          <Label className="text-[10px] uppercase font-black text-orange-600 mb-1.5 block tracking-widest">Base Price (KES)</Label>
                          <Input
                            type="number"
                            value={variant.basePrice || variant.price}
                            onChange={(e) => {
                              const newVariants = [...formData.sizeVariants];
                              const val = e.target.value;
                              newVariants[index].basePrice = val;
                              newVariants[index].price = val;
                              if (isSellerContext) {
                                const disc = parseFloat(newVariants[index].discountPercentage || 0);
                                newVariants[index].discountPrice = (parseFloat(val || 0) * (1 - disc / 100)).toFixed(2);
                              }
                              setFormData(prev => ({ ...prev, sizeVariants: newVariants }));
                            }}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            disabled={isViewMode}
                            className="bg-orange-50/30 border-orange-100 focus:ring-orange-500 h-10 font-bold"
                          />
                        </div>

                        {!isSellerContext ? (
                          <>
                            <div className="lg:col-span-2">
                              <Label className="text-[10px] uppercase font-black text-blue-600 mb-1.5 block tracking-widest">Display Price</Label>
                              <Input
                                type="number"
                                value={variant.displayPrice}
                                onChange={(e) => {
                                  const newVariants = [...formData.sizeVariants];
                                  const val = e.target.value;
                                  newVariants[index].displayPrice = val;
                                  const disc = parseFloat(newVariants[index].discountPercentage || 0);
                                  newVariants[index].discountPrice = (parseFloat(val || 0) * (1 - disc / 100)).toFixed(2);
                                  setFormData(prev => ({ ...prev, sizeVariants: newVariants }));
                                }}
                                placeholder="0.00"
                                disabled={isViewMode}
                                className="bg-blue-50/30 border-blue-100 focus:ring-blue-500 h-10 font-bold"
                              />
                            </div>
                            <div className="lg:col-span-1">
                              <Label className="text-[10px] uppercase font-black text-gray-400 mb-1.5 block tracking-widest">Discount %</Label>
                              <Input
                                type="number"
                                value={variant.discountPercentage}
                                onChange={(e) => {
                                  const newVariants = [...formData.sizeVariants];
                                  const val = e.target.value;
                                  newVariants[index].discountPercentage = val;
                                  const disp = parseFloat(newVariants[index].displayPrice || 0);
                                  newVariants[index].discountPrice = (disp * (1 - parseFloat(val || 0) / 100)).toFixed(2);
                                  setFormData(prev => ({ ...prev, sizeVariants: newVariants }));
                                }}
                                min="0"
                                max="100"
                                disabled={isViewMode}
                                className="bg-gray-50/50 border-gray-200 h-10 font-bold px-2"
                              />
                            </div>
                            <div className="lg:col-span-2">
                              <Label className="text-[10px] uppercase font-black text-gray-400 mb-1.5 block tracking-widest">Final Price</Label>
                              <div className="h-10 flex items-center px-3 bg-gray-100 rounded-lg text-blue-800 font-black border border-gray-200 text-xs sm:text-sm">
                                KES {variant.discountPrice || prices.final}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="lg:col-span-2">
                            <Label className="text-[10px] uppercase font-black text-gray-400 mb-1.5 block tracking-widest">Discount %</Label>
                            <Input
                              type="number"
                              value={variant.discountPercentage}
                              onChange={(e) => {
                                const newVariants = [...formData.sizeVariants];
                                const val = e.target.value;
                                newVariants[index].discountPercentage = val;
                                const base = parseFloat(newVariants[index].basePrice || newVariants[index].price || 0);
                                newVariants[index].discountPrice = (base * (1 - parseFloat(val || 0) / 100)).toFixed(2);
                                setFormData(prev => ({ ...prev, sizeVariants: newVariants }));
                              }}
                              min="0"
                              max="100"
                              disabled={isViewMode}
                              className="bg-gray-50/50 border-gray-200 h-10 font-bold"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 bg-white rounded-lg border border-dashed border-gray-300">
                <p className="text-sm text-gray-500">No size variants added yet.</p>
              </div>
            )}
            {!isViewMode && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const newVariant = {
                    name: '',
                    basePrice: '',
                    displayPrice: '',
                    discountPercentage: 0,
                    discountPrice: '',
                    price: '',
                    description: '',
                    isAvailable: true
                  };
                  setFormData(prev => ({
                    ...prev,
                    sizeVariants: [...prev.sizeVariants, newVariant]
                  }));
                }}
              >
                + Add Size Variant
              </Button>
            )}
          </div>
        </div>

        {/* Combo Options */}
        <div className="bg-purple-50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <span className="mr-2">🍽️</span>
              Combo Options
            </h3>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isComboOption"
                name="isComboOption"
                checked={formData.isComboOption}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isViewMode}
              />
              <Label htmlFor="isComboOption" className="font-medium">
                This is a Combo Item
              </Label>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Create combo meals with multiple items and special pricing
          </p>
          {formData.isComboOption && (
            <div className="space-y-3">
              {formData.comboOptions.map((combo, index) => (
                <div key={index} className="bg-white rounded-lg p-4 border">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-2">
                      <Label>Combo Name</Label>
                      <Input
                        value={combo.name}
                        onChange={(e) => {
                          const newCombos = [...formData.comboOptions];
                          newCombos[index].name = e.target.value;
                          setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                        }}
                        placeholder="e.g., Family Pack"
                        disabled={isViewMode}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Items (comma-separated)</Label>
                      <Input
                        value={Array.isArray(combo.items) ? combo.items.join(', ') : (combo.items || '')}
                        onChange={(e) => {
                          const newCombos = [...formData.comboOptions];
                          newCombos[index].items = e.target.value;
                          setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                        }}
                        onBlur={(e) => {
                          const newCombos = [...formData.comboOptions];
                          const itemsArray = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
                          newCombos[index].items = itemsArray;
                          setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                        }}
                        placeholder="Pizza, Salad, Drink"
                        disabled={isViewMode}
                      />
                    </div>
                    <div>
                      <Label>Base Price (KES)</Label>
                      <Input
                        type="number"
                        value={combo.basePrice || combo.price}
                        onChange={(e) => {
                          const newCombos = [...formData.comboOptions];
                          const val = e.target.value;
                          newCombos[index].basePrice = val;
                          newCombos[index].price = val; // Backward compatibility

                          if (isSellerContext) {
                            const disc = parseFloat(newCombos[index].discountPercentage || 0);
                            // Note: We don't touch displayPrice here anymore
                            newCombos[index].discountPrice = (parseFloat(val || 0) * (1 - disc / 100)).toFixed(2);
                          }
                          setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                        }}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        disabled={isViewMode}
                      />
                    </div>
                    {!isSellerContext && (
                      <>
                        <div>
                          <Label className="text-blue-600">Display Price (KES)</Label>
                          <Input
                            type="number"
                            value={combo.displayPrice}
                            onChange={(e) => {
                              const newCombos = [...formData.comboOptions];
                              const val = e.target.value;
                              newCombos[index].displayPrice = val;
                              const disc = parseFloat(newCombos[index].discountPercentage || 0);
                              newCombos[index].discountPrice = (parseFloat(val || 0) * (1 - disc / 100)).toFixed(2);
                              setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                            }}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            disabled={isViewMode}
                            className="border-blue-200"
                          />
                        </div>
                        <div>
                          <Label>Discount (%)</Label>
                          <Input
                            type="number"
                            value={combo.discountPercentage}
                            onChange={(e) => {
                              const newCombos = [...formData.comboOptions];
                              const val = e.target.value;
                              newCombos[index].discountPercentage = val;
                              const disp = parseFloat(newCombos[index].displayPrice || 0);
                              newCombos[index].discountPrice = (disp * (1 - parseFloat(val || 0) / 100)).toFixed(2);
                              setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                            }}
                            placeholder="0"
                            min="0"
                            max="100"
                            disabled={isViewMode}
                          />
                        </div>
                        <div>
                          <Label className="text-blue-800 font-bold">Discount Price</Label>
                          <Input
                            value={combo.discountPrice || (parseFloat(combo.displayPrice || 0) * (1 - parseFloat(combo.discountPercentage || 0) / 100)).toFixed(2)}
                            readOnly
                            disabled
                            className="bg-blue-50 font-bold text-blue-900"
                          />
                        </div>
                      </>
                    )}
                    {isSellerContext && (
                      <div>
                        <Label>Discount (%)</Label>
                        <Input
                          type="number"
                          value={combo.discountPercentage}
                          onChange={(e) => {
                            const newCombos = [...formData.comboOptions];
                            const val = e.target.value;
                            newCombos[index].discountPercentage = val;
                            const base = parseFloat(newCombos[index].basePrice || newCombos[index].price || 0);
                            newCombos[index].discountPrice = (base * (1 - parseFloat(val || 0) / 100)).toFixed(2);
                            setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                          }}
                          placeholder="0"
                          min="0"
                          max="100"
                          disabled={isViewMode}
                        />
                      </div>
                    )}
                    {!isViewMode && (
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => {
                            const newCombos = formData.comboOptions.filter((_, i) => i !== index);
                            setFormData(prev => ({ ...prev, comboOptions: newCombos }));
                          }}
                          className="w-full"
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!isViewMode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const newCombo = {
                      name: '',
                      items: [],
                      basePrice: '',
                      displayPrice: '',
                      discountPercentage: 0,
                      discountPrice: ''
                    };
                    setFormData(prev => ({
                      ...prev,
                      comboOptions: [...prev.comboOptions, newCombo]
                    }));
                  }}
                >
                  + Add Combo Option
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Kitchen/Vendor Information & Location */}
        <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🧑‍🍳</span>
            Vendor & Smart Location Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <Label htmlFor="kitchenVendor">Kitchen/Vendor Name *</Label>
              <Input
                id="kitchenVendor"
                name="kitchenVendor"
                value={formData.kitchenVendor}
                onChange={handleInputChange}
                placeholder="Main Kitchen, Student Center Cafe, etc."
                disabled={isViewMode}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                The brand or outlet name customers will see
              </p>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="vendorLocation">Vendor Address / Precise Location *</Label>
              <Input
                id="vendorLocation"
                name="vendorLocation"
                value={formData.vendorLocation}
                onChange={handleInputChange}
                placeholder="Specific Room, Building Wing, or Plot Number"
                disabled={isViewMode}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Used for distance calculation and smart menu filtering
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="pickupAvailable"
                name="pickupAvailable"
                checked={formData.pickupAvailable}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isViewMode}
              />
              <div>
                <Label htmlFor="pickupAvailable" className="font-medium">
                  Pickup Option Available
                </Label>
              </div>
            </div>

            {formData.pickupAvailable && (
              <div className="md:col-span-2">
                <Label htmlFor="pickupLocation">Pickup Instructions / Specific Point</Label>
                <Input
                  id="pickupLocation"
                  name="pickupLocation"
                  value={formData.pickupLocation}
                  onChange={handleInputChange}
                  placeholder="e.g., At the counter near the main entrance"
                  disabled={isViewMode}
                />
              </div>
            )}

            <div className="md:col-span-2">
              <Label htmlFor="deliveryAreaLimits">Delivery Boundary / Coverage Zones <span className="text-red-500">*</span></Label>
              <Textarea
                id="deliveryAreaLimits"
                name="deliveryAreaLimits"
                required
                value={formData.deliveryAreaLimits}
                onChange={handleInputChange}
                rows={2}
                placeholder="e.g., Campus Zone A, Hostel 5, Science Block"
                disabled={isViewMode}
              />
              <p className="text-xs text-gray-500 mt-1">
                Specific areas where you can deliver. Separate by commas.
              </p>
            </div>
          </div>
        </div>

        {/* Status - Hidden for Sellers */}
        {
          !isSellerContext && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                name="isActive"
                checked={formData.isActive}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isViewMode}
              />
              <Label htmlFor="isActive" className="font-medium">
                Item is Active
              </Label>
              <p className="text-sm text-gray-500">
                (Uncheck to hide this item from the menu)
              </p>
            </div>
          )
        }

        {
          !isSellerContext && (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border-2 border-purple-200">
              <h3 className="text-lg font-bold text-purple-900 mb-4 flex items-center">
                <span className="mr-2">📈</span>
                Marketing Configuration
              </h3>

              <div className="flex items-center space-x-3 mb-6 bg-white/50 p-3 rounded-md border border-purple-100">
                <input
                  type="checkbox"
                  id="marketingEnabled"
                  name="marketingEnabled"
                  checked={formData.marketingEnabled || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, marketingEnabled: e.target.checked }))}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                  disabled={isViewMode}
                />
                <Label htmlFor="marketingEnabled" className="font-semibold text-purple-800">
                  Enable Marketing Campaign for this item
                </Label>
              </div>

              {formData.marketingEnabled && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Marketing Commission Type */}
                    <div>
                      <Label htmlFor="marketingCommissionType" className="text-purple-700 font-semibold">Commission Type</Label>
                      <select
                        id="marketingCommissionType"
                        name="marketingCommissionType"
                        value={formData.marketingCommissionType}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 font-semibold shadow-sm hover:border-purple-300 transition-all appearance-none cursor-pointer"
                        disabled={isViewMode}
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="flat">Fixed Amount (Ksh)</option>
                      </select>
                    </div>

                    {/* Marketing Commission */}
                    <div>
                      <Label htmlFor="marketingCommission">
                        Marketing Commission
                      </Label>
                      <Input
                        id="marketingCommission"
                        name="marketingCommission"
                        type="number"
                        value={formData.marketingCommission}
                        onChange={handleInputChange}
                        placeholder="0"
                        min="0"
                        max={formData.marketingCommissionType === 'percentage' ? 100 : undefined}
                        step="0.01"
                        className="border-purple-200 focus:ring-purple-500"
                        disabled={isViewMode}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Marketing Start Date */}
                    <div>
                      <Label htmlFor="marketingStartDate">Campaign Start Date</Label>
                      <Input
                        id="marketingStartDate"
                        name="marketingStartDate"
                        type="date"
                        value={formData.marketingStartDate || ''}
                        onChange={handleInputChange}
                        className="border-purple-200 focus:ring-purple-500"
                        disabled={isViewMode}
                      />
                    </div>

                    {/* Marketing End Date */}
                    <div>
                      <Label htmlFor="marketingEndDate">Campaign End Date</Label>
                      <Input
                        id="marketingEndDate"
                        name="marketingEndDate"
                        type="date"
                        value={formData.marketingEndDate || ''}
                        onChange={handleInputChange}
                        className="border-purple-200 focus:ring-purple-500"
                        disabled={isViewMode}
                      />
                    </div>
                  </div>

                  {/* Marketing Duration (Legacy Display/Helper) */}
                  <div>
                    <Label htmlFor="marketingDuration">Target Duration (days)</Label>
                    <Input
                      id="marketingDuration"
                      name="marketingDuration"
                      type="number"
                      value={formData.marketingDuration}
                      onChange={handleInputChange}
                      placeholder="30"
                      min="1"
                      className="border-purple-100 bg-purple-50/50"
                      disabled={isViewMode}
                    />
                    <p className="text-xs text-purple-600 mt-1">
                      How many days you intend to keep this campaign active
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        }

        {/* Actions - Integrated Action Bar */}
        <div className="flex items-center justify-between pt-8 border-t mt-10">
          <Button
            type="button"
            variant="ghost"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => setShowClearDialog(true)}
          >
            Clear Form
          </Button>

          <div className="flex items-center space-x-4">
            {!isViewMode && <AutoSaveIndicator lastSaved={lastSaved} />}
            
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (onCancel) onCancel();
                else if (onSuccess) onSuccess();
                else navigate('/dashboard/fastfood');
              }}
              disabled={loading}
            >
              {isViewMode ? 'Back' : 'Cancel'}
            </Button>
            {isViewMode ? (
              <Button
                type="button"
                onClick={() => {
                  console.log('🔘 Edit Item button clicked in FastFoodForm. calling onEdit...');
                  if (onEdit) onEdit();
                  else console.warn('⚠️ No onEdit prop provided to FastFoodForm');
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Edit Item
              </Button>
            ) : (
              <Button
                type="button"
                disabled={loading}
                className="bg-orange-600 hover:bg-orange-700 shadow-md transition-all active:scale-95"
                onClick={(e) => {
                  e.preventDefault(); // Safety precaution
                  console.log('🔘 Submit button clicked (Manual Handler)');
                  draftSubmissionRef.current = false;
                  handleSubmit(e); // Trigger the save logic manually
                }}
              >
                {loading ? (
                  <>
                    <FaSpinner className="animate-spin mr-2" />
                    {listMode ? 'Listing...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    {listMode ? <FaCheck className="mr-2" /> : <FaSave className="mr-2" />}
                    {listMode ? 'List FastFood' : (isEditMode ? 'Save Changes' : 'Create Item')}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </form >

      {/* Changes Dialog */}
      {/* Changes Dialog */}
      <ChangesDialog
        open={showChangesDialog}
        onOpenChange={(isOpen) => {
          console.log('📋 ChangesDialog onOpenChange:', isOpen);
          if (!isOpen) {
            setShowChangesDialog(false);
            setLoading(false); // Reset loading if dialog is closed without confirming
          }
        }}
        onConfirm={async () => {
          toast({ title: 'Debug', description: 'Confirm clicked. Starting save...', duration: 2000 });
          try {
            setShowChangesDialog(false);
            await performSave();
          } catch (error) {
            console.error('❌ Error in performSave:', error);
            setLoading(false);
            toast({
              title: 'Error',
              description: 'Save failed: ' + error.message,
              variant: 'destructive',
            });
          }
        }}
        changes={changes}
        itemName={formData.name || 'FastFood Item'}
        title="Review Changes"
        description="Please review the changes below before updating the item."
        actionLabel="Confirm Update"
      />

      {/* Standardized Feedback Modal */}
      <SystemFeedbackModal
        open={showModal}
        onOpenChange={setShowModal}
        type={modalConfig.type}
        title={modalConfig.title}
        description={modalConfig.description}
        onConfirm={handleDialogClose}
      />

      {/* Clear Confirmation Dialog */}
      <UIDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <UIDialogContent>
          <UIDialogHeader>
            <UIDialogTitle>Clear Form?</UIDialogTitle>
            <UIDialogDescription>
              Are you sure you want to clear all data in this form? This action cannot be undone.
            </UIDialogDescription>
          </UIDialogHeader>
          <UIDialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={performClear}>
              Clear Form
            </Button>
          </UIDialogFooter>
        </UIDialogContent>
      </UIDialog>

      {/* Validation Error Dialog - shown when listing requirements are not met */}
      <UIDialog open={!!validationError} onOpenChange={(open) => { if (!open) setValidationError(null); }}>
        <UIDialogContent>
          <UIDialogHeader>
            <UIDialogTitle className="flex items-center gap-2 text-red-600">
              <span>⚠️</span>
              <span>{validationError?.title || 'Validation Error'}</span>
            </UIDialogTitle>
            <UIDialogDescription className="text-sm text-gray-700 mt-2">
              {validationError?.description}
            </UIDialogDescription>
          </UIDialogHeader>
          <UIDialogFooter>
            <Button
              onClick={() => {
                const id = validationError?.scrollToId;
                setValidationError(null);
                if (id) {
                  setTimeout(() => {
                    const el = document.getElementById(id);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.focus();
                      el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
                      setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2'), 2500);
                    }
                  }, 100);
                }
              }}
            >
              {validationError?.scrollToId ? 'Go to Field' : 'OK'}
            </Button>
          </UIDialogFooter>
        </UIDialogContent>
      </UIDialog>
    </div >
  );
};

export default FastFoodForm;