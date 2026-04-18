import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { useToast } from '../../../components/ui/use-toast';
import { productApi } from '../../../services/api';
import { useCategories } from '../../../contexts/CategoriesContext';
import { useAuth } from '../../../contexts/AuthContext';
import { Loader2, ArrowLeft, Upload, Video, Save, Check, Edit, X, AlertCircle, Info } from 'lucide-react';
import { productExists, getProductEditUrl } from '../../../utils/productUtils';
import { resolveImageUrl } from '../../../utils/imageUtils';
import { recursiveParse, ensureArray, ensureObject } from '../../../utils/parsingUtils';
import SystemFeedbackModal from '../../../components/ui/SystemFeedbackModal';
import FastFoodForm from '../FastFoodForm';
import ServiceForm from '../../../components/services/ServiceForm';
import ChangesDialog from '../../../components/ui/changes-dialog';
import Dialog from '../../../components/Dialog';
import AutoSaveIndicator from '../../../components/ui/AutoSaveIndicator';
import useAutoSave from '../../../hooks/useAutoSave';

// Category detection constants
const CATEGORY_TYPES = {
  FOOD_DRINKS: 'food_drinks',
  SERVICES: 'services',
  REGULAR: 'regular'
};

// Enhanced keyword patterns matching your actual database categories
const CATEGORY_PATTERNS = {
  [CATEGORY_TYPES.FOOD_DRINKS]: [
    'food', 'drink', 'drinks', 'beverage', 'beverages', 'restaurant', 'cafe', 'kitchen', 'cook', 'chef',
    'snack', 'snacks', 'meal', 'cuisine', 'dining', 'eatery', 'nutrition', 'culinary',
    'burger', 'pizza', 'sandwich', 'salad', 'soup', 'coffee', 'tea', 'juice', 'juices',
    'water', 'soda', 'alcohol', 'wine', 'beer', 'fast food', 'fastfood', 'fast-food',
    'fast', 'fast-food', 'breakfast', 'lunch', 'dinner', 'dessert', 'ice cream',
    'popsicle', 'grilled', 'baked', 'foods', 'hot meal', 'hotel meal'
  ],
  [CATEGORY_TYPES.SERVICES]: [
    'service', 'services', 'repair', 'repairs', 'maintenance', 'cleaning', 'tutoring', 'consulting',
    'installation', 'delivery', 'professional', 'technical', 'support', 'assistance',
    'plumbing', 'electrical', 'carpentry', 'painting', 'gardening', 'landscaping',
    'tutoring', 'training', 'coaching', 'advice', 'inspection', 'education',
    'student services', 'student service', 'academic', 'educational', 'academic',
    'project', 'projects', 'printing', 'photography', 'videography', 'cv help',
    'errands', 'poster design', 'mpesa', 'phone repair', 'laptop repair',
    'software install', 'printer fix', 'speaker repair', 'home cleaning', 'tech'
  ]
};

// Grouped Units of Measure and labels
const UOM_GROUPS = {
  'General Retail / Consumer Goods': ['pcs', 'pack', 'set', 'pair', 'dozen', 'unit', 'box'],
  'Food & Beverages': ['g-food', 'kg-food', 'ml-food', 'L-food', 'bottle-food', 'can', 'cup', 'jar-food', 'sachet', 'tray'],
  'Fashion & Apparel': ['pcs-fashion', 'pair-fashion', 'set-fashion'],
  'Electronics': ['unit-electronics', 'pack-electronics', 'pcs-electronics'],
  'Cosmetics & Health': ['ml-cosmetics', 'L-cosmetics', 'g-cosmetics', 'kg-cosmetics', 'tube', 'jar-cosmetics', 'bottle-cosmetics'],
  'Home & Office': ['pcs-office', 'set-office', 'box-office', 'roll', 'sheet']
};

const UOM_LABELS = {
  // General Retail / Consumer Goods
  'pcs': 'Piece (pcs)',
  'pack': 'Pack',
  'set': 'Set',
  'pair': 'Pair',
  'dozen': 'Dozen',
  'unit': 'Unit',
  'box': 'Box',

  // Food & Beverages
  'g-food': 'Gram (g)',
  'kg-food': 'Kilogram (kg)',
  'ml-food': 'Millilitre (ml)',
  'L-food': 'Litre (L)',
  'bottle-food': 'Bottle',
  'can': 'Can',
  'cup': 'Cup',
  'jar-food': 'Jar',
  'sachet': 'Sachet',
  'tray': 'Tray',

  // Fashion & Apparel
  'pcs-fashion': 'Piece (pcs)',
  'pair-fashion': 'Pair',
  'set-fashion': 'Set',

  // Electronics
  'unit-electronics': 'Unit',
  'pack-electronics': 'Pack',
  'pcs-electronics': 'Piece (pcs)',

  // Cosmetics & Health
  'ml-cosmetics': 'Millilitre (ml)',
  'L-cosmetics': 'Litre (L)',
  'g-cosmetics': 'Gram (g)',
  'kg-cosmetics': 'Kilogram (kg)',
  'tube': 'Tube',
  'jar-cosmetics': 'Jar',
  'bottle-cosmetics': 'Bottle',

  // Home & Office
  'pcs-office': 'Piece (pcs)',
  'set-office': 'Set',
  'box-office': 'Box',
  'roll': 'Roll',
  'sheet': 'Sheet'
};

const ComradesProductForm = ({
  onSuccess,
  product: initialProduct,
  id: propId,
  onCategoryChange,
  onSubcategoryChange,
  onEdit,
  onAfterSave,
  mode = 'create', // New mode prop
  strictMode = false, // Add strictMode prop
  taxonomyType = 'product' // Add taxonomyType prop
}) => {
  const { id: paramId } = useParams();
  const location = useLocation();
  const id = (propId || (paramId !== 'create' ? paramId : null) || initialProduct?.id || initialProduct?._id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isValidatingId, setIsValidatingId] = useState(!!id && !initialProduct && id !== 'create');
  const [productError, setProductError] = useState(null);

  // Enhanced mode detection
  const isListRoute = location.pathname.includes('/list/') || location.pathname.includes('/listing/');
  const isViewRoute = location.pathname.includes('/view/');
  const isEditRoute = location.pathname.includes('/edit/');

  const isListMode = mode === 'list' || isListRoute;
  const isViewMode = mode === 'view' || isViewRoute;
  // If we have a valid ID (not 'create') and it's not explicitly list/view, it's likely edit
  const hasValidId = id && id !== 'create';
  const isEditMode = (mode === 'edit' || isEditRoute || (!!hasValidId && !isListRoute && !isViewRoute)) && mode !== 'create_force';
  const isCreateMode = (!isEditMode && !isViewMode && !isListMode) || mode === 'create' || paramId === 'create';

  // CRITICAL FIX: Prioritize mode/pathname for detection
  const effectiveIsListMode = isListMode;
  const effectiveIsViewMode = isViewMode;
  const effectiveIsEditMode = isEditMode;
  const effectiveIsCreateMode = isCreateMode && !isEditMode;

  const { user: currentUser } = useAuth();
  const { categories: allCategories, getSubcategoriesByCategory } = useCategories();

  // Filter categories based on taxonomyType
  const filteredCategories = useMemo(() => {
    if (!allCategories || !Array.isArray(allCategories)) return [];
    // If strictMode is on, ONLY show categories matching our taxonomyType
    // Otherwise, show everything
    return allCategories.filter(cat => 
      !strictMode || 
      String(cat.taxonomyType || 'product') === String(taxonomyType)
    );
  }, [allCategories, strictMode, taxonomyType]);

  // Handle category change while respecting strictMode
  const handleCategoryChangeWrapper = (categoryId) => {
    // If we're in strict mode, we don't trigger the auto-switch callback to parent
    if (!strictMode && onCategoryChange) {
      onCategoryChange(categoryId);
    }
  };

  // DEBUG MODE DETECTION
  const [previousDebugMode, setPreviousDebugMode] = useState('');
  const currentDebugMode = effectiveIsCreateMode ? 'CREATE' : effectiveIsEditMode ? 'EDIT' : effectiveIsListMode ? 'LIST' : effectiveIsViewMode ? 'VIEW' : 'UNKNOWN';

  // DEBUG BUTTON TEXT
  const [previousButtonText, setPreviousButtonText] = useState('');
  const currentButtonText = effectiveIsViewMode ? 'View Product' : effectiveIsListMode ? 'List Product' : effectiveIsCreateMode ? 'Create Product' : 'Update Product';

  useEffect(() => {
    if (previousDebugMode !== currentDebugMode) {
      setPreviousDebugMode(currentDebugMode);
      console.log('=== COMPONENT MOUNT DEBUG ===');
      console.log('ComradesProductForm mode:', currentDebugMode);
      console.log('Effective Mode:', currentDebugMode);
    }
  }, [currentDebugMode, previousDebugMode]);

  useEffect(() => {
    if (previousButtonText !== currentButtonText) {
      setPreviousButtonText(currentButtonText);
      console.log('ComradesProductForm button text:', currentButtonText);
    }
  }, [currentButtonText, previousButtonText]);

  // Smart form switching state
  const [currentFormType, setCurrentFormType] = useState(CATEGORY_TYPES.REGULAR);
  const [currentComponent, setCurrentComponent] = useState('comrades'); // Track which component to render
  const [productName, setProductName] = useState(''); // Track product name for form switching

  useEffect(() => {
    console.log('🟢 [ComradesProductForm] Component mounted/updated');
    return () => console.log('🔴 [ComradesProductForm] Component UNMOUNTED');
  }, []);

  const [loading, setLoading] = useState(false);
  const [listingLoading, setListingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showMediaError, setShowMediaError] = useState(false);
  const [mediaErrorMessage, setMediaErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  // Local storage key for draft products
  // Using a helper function to avoid circular dependency with formData initialization
  const getDraftKey = (categoryId) => `comrades_product_draft_${categoryId || 'general'}`;

  // Track if we have a draft
  const [hasDraft, setHasDraft] = useState(false);

  // State for showing save feedback
  const [showSaved, setShowSaved] = useState(false);
  const saveTimeoutRef = useRef(null);

  // Section Refs for auto-scrolling
  const nameRef = useRef(null);
  const categoryRef = useRef(null);
  const pricingRef = useRef(null);
  const stockRef = useRef(null);
  const mediaRef = useRef(null);
  const deliveryRef = useRef(null);
  const marketingRef = useRef(null);

  const initialRender = useRef(true);

  // Initialize form data based on whether we're creating or editing
  const getInitialFormData = useCallback(() => {
    // If editing, we'll load data later via effect; start with empty defaults
    if (id || initialProduct) {
      const initialData = {
        name: '',
        brand: '',
        model: '',
        condition: '',
        shortDescription: '',
        fullDescription: '',
        basePrice: '',
        displayPrice: '',
        discountPercentage: '',
        discountPrice: '',
        stock: '',
        categoryId: '',
        subcategoryId: '',
        unitOfMeasure: '',
        keyFeatures: [],
        physicalFeatures: {},
        specifications: {},
        variants: [],
        coverImage: '',
        galleryImages: [],
        videoUrl: '',
        keywords: '',
        status: 'draft',
        featured: false,
        isBestSeller: false,
        weight: '',
        length: '',
        width: '',
        height: '',
        deliveryMethod: 'Pickup',
        warranty: '',
        returnPolicy: '',
        deliveryFeeType: 'flat',
        deliveryFee: '',
        deliveryCoverageZones: '',
        marketingEnabled: false,
        marketingCommissionType: 'flat',
        marketingCommission: '',
        marketingStartDate: '',
        marketingEndDate: '',
        visibilityStatus: 'active',
        reviewNotes: '',
        // Additional fields
        sku: '',
        barcode: '',
        lowStockThreshold: '',
        compareAtPrice: '',
        cost: '',
        metaTitle: '',
        metaDescription: '',
        metaKeywords: '',
        isFlashSale: false,
        flashSalePrice: '',
        flashSaleStart: '',
        flashSaleEnd: '',
        isDigital: false,
        downloadUrl: ''
      };

      return initialData;
    }

    // New product: try to load draft from localStorage
    try {
      const draftKey = getDraftKey(initialProduct?.categoryId || '');
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        const parsed = JSON.parse(draft);
        return { ...parsed, status: 'draft' };
      }
    } catch (e) {
      console.error('Error loading draft:', e);
    }

    // Default for new product
    return {
      name: '',
      brand: '',
      model: '',
      condition: '',
      shortDescription: '',
      fullDescription: '',
      basePrice: '',
      displayPrice: '',
      discountPercentage: '',
      discountPrice: '',
      stock: '',
      categoryId: '',
      subcategoryId: '',
      unitOfMeasure: '',
      keyFeatures: [],
      physicalFeatures: {},
      specifications: {},
      variants: [],
      coverImage: '',
      galleryImages: [],
      videoUrl: '',
      keywords: '',
      status: 'draft',
      featured: false,
      isBestSeller: false,
      weight: '',
      length: '',
      width: '',
      height: '',
      deliveryMethod: 'Pickup',
      warranty: '',
      returnPolicy: '',
      deliveryFeeType: 'flat',
      deliveryFee: '',
      deliveryCoverageZones: '',
      marketingEnabled: false,
      marketingCommissionType: 'flat',
      marketingCommission: '',
      marketingStartDate: '',
      marketingEndDate: '',
      visibilityStatus: 'active',
      reviewNotes: '',
      // Additional fields
      sku: '',
      barcode: '',
      lowStockThreshold: '',
      compareAtPrice: '',
      cost: '',
      metaTitle: '',
      metaDescription: '',
      metaKeywords: '',
      isFlashSale: false,
      flashSalePrice: '',
      flashSaleStart: '',
      flashSaleEnd: '',
      isDigital: false,
      downloadUrl: ''
    };
  }, [id, initialProduct, getDraftKey]);

  // State for media files and previews
  const [coverPreview, setCoverPreview] = useState('');
  const [galleryPreviews, setGalleryPreviews] = useState([]);
  const [videoPreview, setVideoPreview] = useState('');
  const [productVideo, setProductVideo] = useState(null);
  const [coverImage, setCoverImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);

  // State to track if we've updated the product (for refreshing data)
  const [hasUpdated, setHasUpdated] = useState(false);
  // Track original loaded data and show success summary on update (match Seller ProductForm UX)
  const [originalProductData, setOriginalProductData] = useState(null);

  // Success dialog state for new product creation
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', description: '', onConfirm: null });
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [createdProduct, setCreatedProduct] = useState(null);
  const [changes, setChanges] = useState([]);

  // AutoSave — persist form data to localStorage while filling form
  // IMPORTANT: formData must be declared ONCE here and reused by useAutoSave
  const [formData, setFormData] = useState(() => {
    const initial = getInitialFormData();
    // Restore draft for new products on mount
    if (!id && !initialProduct) {
      try {
        const draftKey = `comrades_product_draft_new`;
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          // Strip non-serializable fields that were excluded during save
          const { coverImage: _ci, galleryImages: _gi, video: _v, mediaMetadata: _mm, _lastSaved, lastSaved: _ls, ...rest } = parsed;
          return { ...initial, ...rest };
        }
      } catch (e) {
        console.warn('[ComradesProductForm] Could not restore draft:', e);
      }
    }
    return initial;
  });
  const autoSaveDraftKey = !effectiveIsViewMode ? `comrades_product_draft_${id || 'new'}` : null;
  const { lastSaved: autoLastSaved, clearDraft: clearAutoSaveDraft } = useAutoSave(
    autoSaveDraftKey,
    formData,
    null, // restore is handled separately (above, on mount)
    { debounceMs: 1200 }
  );

  // Synchronize product name and draft status on load (Side effects moved from initializer)
  useEffect(() => {
    // 1. Sync product name if editing
    if (initialProduct?.name) {
      setProductName(initialProduct.name);
    } else if (formData?.name) {
      setProductName(formData.name);
    }

    // 2. Check for drafts if creating a new product
    if (!id && !initialProduct) {
      try {
        const draftKey = `comrades_product_draft_new`;
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          setHasDraft(true);
        }
      } catch (e) {
        console.warn('[ComradesProductForm] Draft check effect error:', e);
      }
    }
  }, [id, initialProduct, formData?.name]);

  // Helper to find category/subcategory name by ID
  const getCategoryName = (id) => {
    if (!allCategories || !Array.isArray(allCategories)) return `[Category ${id}]`;
    const category = allCategories.find(cat => String(cat.id) === String(id) || String(cat._id) === String(id));
    return category ? category.name : `[Category ${id}]`;
  };

  const getSubcategoryName = (categoryId, subcategoryId) => {
    if (!allCategories || !Array.isArray(allCategories)) return `[Subcategory ${subcategoryId}]`;
    const category = allCategories.find(cat => String(cat.id) === String(categoryId) || String(cat._id) === String(categoryId));
    if (!category) return `[Subcategory ${subcategoryId}]`;

    const subcatList = category.Subcategory || category.subcategories || [];
    if (!Array.isArray(subcatList)) return `[Subcategory ${subcategoryId}]`;

    const subcategory = subcatList.find(
      sub => String(sub.id) === String(subcategoryId) || String(sub._id) === String(subcategoryId)
    );
    return subcategory ? subcategory.name : `[Subcategory ${subcategoryId}]`;
  };

  // Helper to compare changes with proper category/subcategory name resolution
  const compareProductChanges = (original, updated) => {
    const changes = [];

    // Helper to check if values are different
    const hasChanged = (field, oldValue, newValue) => {
      if (field === 'categoryId' || field === 'subcategoryId') {
        return String(oldValue || '') !== String(newValue || '');
      }
      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        try { return JSON.stringify(oldValue) !== JSON.stringify(newValue); } catch { return true; }
      }
      if (typeof oldValue === 'object' && typeof newValue === 'object') {
        try { return JSON.stringify(oldValue) !== JSON.stringify(newValue); } catch { return true; }
      }
      return String(oldValue ?? '') !== String(newValue ?? '');
    };
    const fieldNames = {
      name: 'Product Name', brand: 'Brand', model: 'Model', condition: 'Condition',
      shortDescription: 'Short Description', fullDescription: 'Full Description', basePrice: 'Base Price',
      displayPrice: 'Display Price', discountPrice: 'Discount Price', stock: 'Stock',
      categoryId: 'Category', subcategoryId: 'Subcategory', unitOfMeasure: 'Unit of Measure',
      keyFeatures: 'Key Features', physicalFeatures: 'Physical Features', specifications: 'Specifications',
      variants: 'Product Variants', keywords: 'Keywords', weight: 'Weight', length: 'Length', width: 'Width', height: 'Height',
      deliveryMethod: 'Delivery Method', warranty: 'Warranty', returnPolicy: 'Return Policy',
      deliveryFeeType: 'Delivery Fee Type', deliveryFee: 'Delivery Fee', deliveryCoverageZones: 'Delivery Zones',
      marketingEnabled: 'Marketing Enabled', marketingCommissionType: 'Marketing Commission Type', marketingCommission: 'Marketing Commission',
      marketingStartDate: 'Marketing Start Date', marketingEndDate: 'Marketing End Date', visibilityStatus: 'Visibility Status', reviewNotes: 'Review Notes'
    };
    const formatValue = (value) => {
      if (Array.isArray(value)) return value.length ? JSON.stringify(value) : 'None';
      if (value && typeof value === 'object') {
        const entries = Object.entries(value);
        return entries.length ? JSON.stringify(value) : 'None';
      }
      return value ?? 'Not set';
    };
    Object.keys(updated || {}).forEach(field => {
      if (hasChanged(field, original?.[field], updated?.[field])) {
        changes.push({
          field: fieldNames[field] || field,
          before: formatValue(original?.[field]),
          after: formatValue(updated?.[field])
        });
      }
    });
    return changes;
  };

  // Additional state variables
  const [newFeature, setNewFeature] = useState('');
  const [newPhysicalFeature, setNewPhysicalFeature] = useState({ name: '', value: '' });
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  const [isEditing, setIsEditing] = useState(mode !== 'view');
  const [showAllUom, setShowAllUom] = useState(false);

  // NOTE: formData state is declared above (line ~403) alongside useAutoSave.
  // Do NOT redeclare it here — the above declaration is the canonical one.

  // Clear draft from local storage - defined early so it can be used in getInitialFormData
  const clearDraft = useCallback(() => {
    try {
      const draftKey = getDraftKey(formData?.categoryId || '');
      localStorage.removeItem(draftKey);
      setHasDraft(false);
      setShowSaved(false);
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }, [formData?.categoryId, getDraftKey]);

  // Load existing product on edit - using the same approach as ProductForm
  useEffect(() => {
    if (!id && !initialProduct) return;

    let alive = true;
    setLoading(true);

    const loadProductData = async () => {
      try {
        let product = initialProduct;

        // If we already have the product with full details, we can skip the fresh fetch
        const hasFullData = product && (product.fullDescription || product.description);

        if (id && !hasFullData) {
          try {
            console.log('[ComradesProductForm] Fetching full product data for ID:', id);
            const response = await productApi.getById(id);

            if (!response || !response.data) {
              console.error('[ComradesProductForm] Invalid response from server:', response);
              throw new Error('Invalid response from server');
            }

            product = response.data;
            console.log('[ComradesProductForm] Product data fetched successfully:', {
              id: product.id,
              name: product.name,
              categoryId: product.categoryId,
              subcategoryId: product.subcategoryId,
            });
          } catch (error) {
            console.error('[ComradesProductForm] Error fetching product:', error);
            toast({
              title: 'Error',
              description: error.response?.data?.message || 'Failed to load product data.',
              variant: 'destructive',
            });
            if (alive) setLoading(false);
            return;
          }
        }

        if (!alive) return;

        if (!product) {
          toast({
            title: 'Error',
            description: 'No product data available',
            variant: 'destructive',
          });
          if (alive) setLoading(false);
          return;
        }

        const formatBackendDate = (dateVal) => {
          if (!dateVal) return '';
          try {
            const date = new Date(dateVal);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
          } catch (e) {
            return '';
          }
        };

        // ===== DEBUG LOGGING =====
        console.log('🔍 [DEBUG] Product data from backend:', product);
        // ===== END DEBUG =====

        // Transform and set form data with robust parsing
        const formData = {
          ...product,
          name: product.name || '',
          brand: product.brand || '',
          model: product.model || '',
          condition: product.condition || '',
          shortDescription: product.shortDescription || '',
          fullDescription: product.fullDescription || '',
          basePrice: product.basePrice || '',
          displayPrice: product.displayPrice || '',
          discountPercentage: product.discountPercentage || '',
          discountPrice: product.discountPrice || '',
          stock: product.stock || '',
          unitOfMeasure: product.unitOfMeasure || '',
          keywords: product.keywords || '',
          weight: product.weight || '',
          length: product.length || '',
          width: product.width || '',
          height: product.height || '',
          deliveryMethod: product.deliveryMethod || 'Pickup',
          warranty: product.warranty || '',
          returnPolicy: product.returnPolicy || '',
          deliveryFee: product.deliveryFee || '',
          marketingCommission: product.marketingCommission || '',
          categoryId: product.categoryId ? String(product.categoryId) : '',
          subcategoryId: product.subcategoryId ? String(product.subcategoryId) : '',

          // Robust parsing for JSON fields
          keyFeatures: (function () {
            const parsed = ensureArray(product.keyFeatures);
            return Array.isArray(parsed) ? parsed.join('\n') : (product.keyFeatures || '');
          })(),

          physicalFeatures: ensureObject(product.physicalFeatures || product.attributes),
          specifications: ensureObject(product.specifications),
          variants: (function () {
            try {
              let variants = ensureArray(product.variants);
              return variants.map(v => {
                if (!v) return null;
                const optionDetails = {};
                if (v.prices && !v.optionDetails) {
                  Object.entries(v.prices).forEach(([opt, price]) => {
                    const dispPrice = parseFloat(price || 0);
                    const discPrice = dispPrice;
                    optionDetails[opt] = { basePrice: price, displayPrice: price, discountPercentage: 0, discountPrice: discPrice.toFixed(2) };
                  });
                  return { ...v, optionDetails };
                } else if (v.optionDetails) {
                  // Pre-calculate discountPrice if missing or needs update
                  Object.entries(v.optionDetails).forEach(([opt, details]) => {
                    if (!details) return;
                    const disp = parseFloat(details.displayPrice || details.basePrice || 0);
                    const perc = parseFloat(details.discountPercentage || 0);
                    const calc = perc > 0 ? disp * (1 - perc / 100) : disp;
                    optionDetails[opt] = { ...details, discountPrice: calc.toFixed(2) };
                  });
                  return { ...v, optionDetails };
                }
                return { ...v, optionDetails: v.optionDetails || {} };
              }).filter(Boolean);
            } catch (e) {
              console.warn('[ComradesProductForm] Variant parsing failed:', e);
              return [];
            }
          })(),

          marketingStartDate: formatBackendDate(product.marketingStartDate),
          marketingEndDate: formatBackendDate(product.marketingEndDate),
        };

        // Unpack dimensions if available
        if (product.dimensions) {
          try {
            const dims = typeof product.dimensions === 'string' ? JSON.parse(product.dimensions) : product.dimensions;
            if (dims) {
              formData.length = dims.length || formData.length || '';
              formData.width = dims.width || formData.width || '';
              formData.height = dims.height || formData.height || '';
            }
          } catch (e) {
            console.error('Error parsing dimensions:', e);
          }
        }

        setFormData(formData);
        setOriginalProductData(formData);

        // Set media states
        let coverImg = product.coverImage;
        let galleryImgs = ensureArray(product.galleryImages);

        // Fallback to legacy images array
        if (!coverImg) {
          let productImages = ensureArray(product.images);
          if (productImages.length > 0) {
            coverImg = productImages[0];
            galleryImgs = productImages.slice(1);
          }
        }

        if (coverImg) {
          setCoverPreview(resolveImageUrl(coverImg));
          setCoverImage(coverImg);
        }

        if (galleryImgs.length > 0) {
          setGalleryPreviews(galleryImgs.map(img => resolveImageUrl(img)));
          setGalleryImages(galleryImgs);
        }

        if (product.videoUrl) {
          setVideoPreview(product.videoUrl);
          setProductVideo(product.videoUrl);
        }

      } catch (error) {
        console.error('[ComradesProductForm] Error in loadProductData:', error);
        toast({
          title: 'Error',
          description: 'Failed to process product data',
          variant: 'destructive',
        });
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadProductData();

    return () => { alive = false };
  }, [id, initialProduct, toast]);

  // Load draft from localStorage for new products
  useEffect(() => {
    if (!id && !initialProduct) {
      const draftKey = getDraftKey(formData.categoryId || '');
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        try {
          const parsedDraft = JSON.parse(draft);

          // Initialize media from draft metadata if available
          if (parsedDraft.mediaMetadata) {
            const { coverImage, galleryImages, video } = parsedDraft.mediaMetadata;

            // Show cover image metadata if it existed
            if (coverImage && coverImage.hasFile) {
              setCoverPreview(`📷 ${coverImage.name} (${Math.round(coverImage.size / 1024)}KB)`);
            }

            // Show gallery images metadata
            if (galleryImages && galleryImages.length > 0) {
              const galleryPreviews = galleryImages.map(img =>
                img.hasFile ? `🖼️ ${img.name} (${Math.round(img.size / 1024)}KB)` : img
              );
              setGalleryPreviews(galleryPreviews);
            }

            // Show video metadata if it existed
            if (video && video.hasFile) {
              setVideoPreview(`🎥 ${video.name} (${Math.round(video.size / 1024)}KB)`);
            }
          }

          // Initialize video state from draft if available
          const video = parsedDraft.videoUrl || '';
          if (video && !parsedDraft.mediaMetadata?.video?.hasFile) {
            setVideoPreview(video);
            setProductVideo(video);
          }
        } catch (error) {
          console.error('Error loading draft:', error);
        }
      }
    }
  }, [id, initialProduct, getDraftKey]);

  // Auto-calculate discountPrice when displayPrice or discountPercentage changes
  useEffect(() => {
    const dispPrice = parseFloat(formData.displayPrice || 0);
    const discPercent = parseFloat(formData.discountPercentage || 0);

    if (discPercent > 0) {
      const calculatedDiscountPrice = dispPrice * (1 - discPercent / 100);
      setFormData(prev => ({
        ...prev,
        discountPrice: calculatedDiscountPrice.toFixed(2)
      }));
    } else if (dispPrice > 0) {
      // If no percentage but we have display price, set it as discount price fallback
      setFormData(prev => ({
        ...prev,
        discountPrice: dispPrice.toFixed(2)
      }));
    }
  }, [formData.displayPrice, formData.discountPercentage]);

  // Debounced save to draft - defined after formData state
  const saveDraft = useCallback((data) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set a new timeout for saving
    saveTimeoutRef.current = setTimeout(() => {
      try {
        // Store media metadata for draft restoration
        const mediaMetadata = {
          coverImage: coverImage ? {
            name: coverImage.name,
            size: coverImage.size,
            type: coverImage.type,
            hasFile: true
          } : null,
          galleryImages: galleryImages.map(img => ({
            name: img.name,
            size: img.size,
            type: img.type,
            hasFile: true
          })),
          video: productVideo ? {
            name: productVideo.name,
            size: productVideo.size,
            type: productVideo.type,
            hasFile: true
          } : null
        };

        const draftToSave = {
          ...data,
          // Save media metadata instead of files
          mediaMetadata,
          // Set files to null for compatibility
          coverImage: null,
          galleryImages: [],
          video: null,
          lastSaved: new Date().toISOString()
        };
        const draftKey = getDraftKey(data.categoryId || '');
        localStorage.setItem(draftKey, JSON.stringify(draftToSave));
        setHasDraft(true);

        // Show saved indicator
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);

        // Update hasDraft state
        setHasDraft(true);
      } catch (error) {
        console.error('Error saving draft:', error);
      }
    }, 1000); // 1 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [initialProduct, coverImage, galleryImages, productVideo]);

  // Update clearDraft to reset all form state
  const clearDraftAndReset = useCallback(() => {
    clearDraft();
    setFormData(getInitialFormData());
    setCoverImage(null);
    setGalleryImages([]);
    setProductVideo(null);
    setCoverPreview('');
    setGalleryPreviews([]);
    setVideoPreview('');
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  }, [clearDraft, getInitialFormData]);

  // Category change handler is defined later in the file
  // Subcategory change handler is defined later in the file

  // Get subcategories for the selected category with proper ID handling
  const subcategories = useMemo(() => {
    if (!formData?.categoryId) return [];

    const category = allCategories.find(cat =>
      String(cat.id) === String(formData.categoryId) ||
      String(cat._id) === String(formData.categoryId)
    );

    if (!category) return [];

    // Handle both property names for compatibility
    const subcatList = category.Subcategory || category.subcategories || [];

    const subs = Array.isArray(subcatList)
      ? subcatList.map(sub => ({
        id: String(sub.id || sub._id), // Ensure ID is always a string for consistent comparison
        name: sub.name,
        categoryId: String(category.id || category._id) // Ensure category ID is also a string
      }))
      : [];

    console.log('Subcategories for category', category.name, ':', subs);
    return subs;
  }, [formData?.categoryId, allCategories]);

  // Initialize UoM expansion from storage when category changes
  useEffect(() => {
    const key = `uom_expanded_comrades_${formData.categoryId || 'none'}`;
    const saved = localStorage.getItem(key);
    setShowAllUom(saved === 'true');
  }, [formData.categoryId]);

  // Handle adding a new specification
  const handleAddSpecification = () => {
    if (newSpecName && newSpecValue) {
      setFormData(prev => ({
        ...prev,
        specifications: {
          ...prev.specifications,
          [newSpecName]: newSpecValue
        },
        newSpecName: '',
        newSpecValue: ''
      }));
      setNewSpecName('');
      setNewSpecValue('');
    }
  };

  // Auto-save when form data changes (only for new products)
  useEffect(() => {
    if (!initialRender.current && !id && !initialProduct) {
      saveDraft(formData);
    }
  }, [formData, saveDraft, id, initialProduct]);

  // Mark initial render as complete
  useEffect(() => {
    initialRender.current = false;
  }, []);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      // Clean up cover preview URL
      if (coverPreview && coverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
      // Clean up gallery preview URLs
      galleryPreviews.forEach(preview => {
        if (preview && preview.startsWith('blob:')) {
          URL.revokeObjectURL(preview);
        }
      });
      // Clean up video preview URL
      if (videoPreview && videoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreview);
      }
    };
  }, [coverPreview, galleryPreviews, videoPreview]);

  // Handle beforeunload to warn about unsaved changes
  useEffect(() => {
    if (!id && !initialProduct) {
      const handleBeforeUnload = (e) => {
        if (formData.name || formData.shortDescription || formData.fullDescription || formData.basePrice) {
          // Modern browsers require setting returnValue to show the dialog
          e.preventDefault();
          e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
          return e.returnValue;
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [formData, id, initialProduct]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // If the name field is being updated, also update the productName state
    if (name === 'name') {
      setProductName(value);
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Get subcategories for the selected category
  const getSubcategories = useCallback(() => {
    if (!formData?.categoryId) {
      return [];
    }

    // Find the selected category
    const category = allCategories?.find(cat => {
      const catId = cat.id || cat._id;
      return String(catId) === String(formData.categoryId);
    });

    // Get subcategories using both property names for compatibility
    let subcategories = [];
    if (category) {
      const subcatList = category.Subcategory || category.subcategories;
      if (Array.isArray(subcatList)) {
        subcategories = subcatList;
      } else if (subcatList && typeof subcatList === 'object') {
        // Convert object to array if needed
        subcategories = Object.values(subcatList);
      }
    }

    return subcategories;
  }, [formData?.categoryId, allCategories]);

  // Enhanced category detection with detailed logging
  const detectCategoryType = useCallback((categoryName, subcategoryName = '') => {
    const searchText = `${categoryName || ''} ${subcategoryName || ''}`.toLowerCase().trim();

    if (!searchText) {
      return CATEGORY_TYPES.REGULAR;
    }

    // Check for food & drinks patterns
    const foodMatches = CATEGORY_PATTERNS[CATEGORY_TYPES.FOOD_DRINKS].filter(pattern =>
      searchText.includes(pattern)
    );
    if (foodMatches.length > 0) {
      return CATEGORY_TYPES.FOOD_DRINKS;
    }

    // Check for services patterns
    const serviceMatches = CATEGORY_PATTERNS[CATEGORY_TYPES.SERVICES].filter(pattern =>
      searchText.includes(pattern)
    );
    if (serviceMatches.length > 0) {
      return CATEGORY_TYPES.SERVICES;
    }

    return CATEGORY_TYPES.REGULAR;
  }, []);

  // Find category by ID
  const findCategoryById = useCallback((categoryId) => {
    if (!allCategories || !Array.isArray(allCategories) || !categoryId) return null;

    const category = allCategories.find(cat =>
      String(cat?.id || '') === String(categoryId) ||
      String(cat?._id || '') === String(categoryId)
    );

    return category || null;
  }, [allCategories]);

  // Find subcategory by ID
  const findSubcategoryById = useCallback((category, subcategoryId) => {
    if (!category || !subcategoryId) return null;

    const subcatList = category.Subcategory || category.subcategories || [];
    if (!Array.isArray(subcatList)) return null;

    const subcategory = subcatList.find(sub =>
      String(sub?.id || '') === String(subcategoryId) ||
      String(sub?._id || '') === String(subcategoryId)
    );

    return subcategory || null;
  }, []);

  const handleCategoryChange = (value) => {
    console.log('[DEBUG] [ComradesProductForm] handleCategoryChange FIRED with value:', value);
    console.log('[DEBUG] [ComradesProductForm] Current categoryId:', formData.categoryId, 'subcategoryId:', formData.subcategoryId);
    console.log('[DEBUG] [ComradesProductForm] allCategories length:', allCategories?.length);
    setFormData(prev => {
      const newData = {
        ...prev,
        categoryId: value,
        // Only reset subcategory if the category actually changed (type-safe comparison)
        ...(String(prev.categoryId) !== String(value) && { subcategoryId: '' })
      };
      console.log(' [DEBUG] Updated formData with categoryId:', value);
      return newData;
    });

    // Enhanced category detection and form type switching
    const category = findCategoryById(value);

    if (category) {
      // Test detection with multiple approaches
      const detection1 = detectCategoryType(category.name, '');
      const detectedType = detection1;

      setCurrentFormType(detectedType);

      // Switch to appropriate component based on detected type
      let componentToSwitch = 'comrades';
      let toastMessage = '';
      let toastDescription = '';

      // Get the current product name from the form data if available
      const currentProductName = formData.name || productName || '';

      // Only switch if NOT in strictMode
      if (!strictMode) {
        if (detectedType === CATEGORY_TYPES.FOOD_DRINKS) {
          componentToSwitch = 'fastfood';
          toastMessage = '🍽️ Food & Drinks Form';
          toastDescription = `Switched to FastFoodForm for "${category.name}"`;

          // Set the product name in the form data before switching
          if (currentProductName) {
            setFormData(prev => ({
              ...prev,
              name: currentProductName
            }));
          }
        } else if (detectedType === CATEGORY_TYPES.SERVICES) {
          componentToSwitch = 'service';
          toastMessage = '🛠️ Services Form';
          toastDescription = `Switched to ServiceForm for "${category.name}"`;

          // Set the product name in the form data before switching
          if (currentProductName) {
            setFormData(prev => ({
              ...prev,
              name: currentProductName
            }));
          }
        } else {
          componentToSwitch = 'comrades';
          toastMessage = '📦 Regular Product Form';
          toastDescription = `Using ComradesProductForm for "${category.name}"`;
        }

        setCurrentComponent(componentToSwitch);
        
        // Show toast notification
        toast({
          title: toastMessage,
          description: toastDescription,
        });
      } else {
        console.log('🛡️ [ComradesProductForm] strictMode enabled - skipping auto-switch logic');
      }

    } else {
      console.warn('No category found for ID:', value);
    }

    // Call external category change handler if provided
    if (onCategoryChange) {
      onCategoryChange(value);
    }
  };

  // Handle subcategory change
  const handleSubcategoryChange = (value) => {
    console.log('[ComradesProductForm] handleSubcategoryChange called with:', value);
    console.log('[ComradesProductForm] Current state - categoryId:', formData.categoryId, 'subcategoryId:', formData.subcategoryId);

    // GUARD: Prevent unintended resets
    // In view mode, Select component might trigger this with empty value
    // If we already have a value and the new one is empty, ignore it
    if (!value && formData.subcategoryId) {
      console.warn('[ComradesProductForm] handleSubcategoryChange blocked unintended reset (value was empty)');
      return;
    }

    setFormData(prev => {
      // Find the subcategory across ALL categories to ensure we get the right parent
      let foundSub = null;
      let parentCatId = prev.categoryId; // Default to current category

      for (const cat of allCategories) {
        const subcatList = cat.Subcategory || cat.subcategories || [];
        const sub = subcatList.find(s => String(s.id || s._id) === String(value));
        if (sub) {
          foundSub = sub;
          parentCatId = String(cat.id || cat._id);
          console.log('[ComradesProductForm] Found subcategory:', sub.name, 'in category:', cat.name, 'categoryId:', parentCatId);
          break;
        }
      }

      if (!foundSub) {
        console.warn('[ComradesProductForm] Subcategory not found in categories list, subcategoryId:', value);
        // Keep the current categoryId if subcategory not found
        parentCatId = prev.categoryId;
      }

      // Trigger detection
      if (foundSub) {
        const category = allCategories.find(cat => String(cat.id || cat._id) === String(parentCatId));
        const detectedType = detectCategoryType(category?.name || '', foundSub.name || '');
        console.log('[ComradesProductForm] Subcategory detection:', { category: category?.name, subcategory: foundSub.name, detectedType });

        if (detectedType !== currentFormType) {
          setCurrentFormType(detectedType);
          setCurrentComponent(detectedType === CATEGORY_TYPES.FOOD_DRINKS ? 'fastfood' : (detectedType === CATEGORY_TYPES.SERVICES ? 'service' : 'comrades'));
        }
      }

      const newData = {
        ...prev,
        subcategoryId: value,
        // Sync categoryId with the subcategory's actual parent (or keep current if not found)
        categoryId: parentCatId
      };

      console.log('[ComradesProductForm] Updated formData - categoryId:', newData.categoryId, 'subcategoryId:', newData.subcategoryId);
      return newData;
    });

    // Call external subcategory change handler if provided
    if (onSubcategoryChange) {
      onSubcategoryChange(value);
    }
  };

  // Get form type info for display
  const getFormTypeInfo = () => {
    const getModeText = () => {
      if (effectiveIsCreateMode) return 'Create';
      if (effectiveIsEditMode) return 'Update';
      if (effectiveIsListMode) return 'List';
      return 'Create';
    };

    switch (currentFormType) {
      case CATEGORY_TYPES.FOOD_DRINKS:
        return {
          title: '🍽️ Food & Drinks Product',
          formTitle: `${getModeText()} Food & Drinks Product`,
          description: 'Specialized form for restaurant and food items',
          color: 'orange',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200'
        };
      case CATEGORY_TYPES.SERVICES:
        return {
          title: '🛠️ Services Product',
          formTitle: `${getModeText()} Services Product`,
          description: 'Form for professional services and consultations',
          color: 'purple',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-200'
        };
      default:
        return {
          title: '📦 Regular Product',
          formTitle: `${getModeText()} New Product`,
          description: 'Standard product form for general merchandise',
          color: 'blue',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
    }
  };

  // Handle cover image change
  const handleCoverImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCoverImage(file);
      // Create preview URL for the selected image
      const previewUrl = URL.createObjectURL(file);
      setCoverPreview(previewUrl);
    }
  };

  // Handle gallery images change
  const handleGalleryImagesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      // Limit to 5 images max
      const newImages = files.slice(0, 5 - galleryImages.length);
      setGalleryImages(prev => [...prev, ...newImages]);

      // Create previews
      const newPreviews = newImages.map(file => URL.createObjectURL(file));
      setGalleryPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  // Remove a gallery image
  const removeGalleryImage = (index) => {
    setGalleryImages(prev => prev.filter((_, i) => i !== index));
    setGalleryPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Handle video change
  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProductVideo(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  // Remove video
  const removeVideo = () => {
    setProductVideo(null);
    setVideoPreview('');
  };

  // Handle adding a new feature
  const handleAddFeature = () => {
    if (newFeature.trim()) {
      setFormData(prev => {
        const newData = {
          ...prev,
          keyFeatures: [...prev.keyFeatures, newFeature.trim()]
        };
        return newData;
      });
      setNewFeature('');
    }
  };

  // Handle field changes
  const handleFieldChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Calculate discount price if pricing fields change
      if (field === 'basePrice' || field === 'displayPrice' || field === 'discountPercentage') {
        const base = parseFloat(newData.basePrice || 0);
        const display = parseFloat(newData.displayPrice || base || 0);
        const perc = parseFloat(newData.discountPercentage || 0);
        
        if (perc > 0) {
          newData.discountPrice = (display * (1 - perc / 100)).toFixed(2);
        } else {
          newData.discountPrice = display.toFixed(2);
        }
      }
      
      return newData;
    });
  };

  // Helper for client-side image compression
  const compressImage = (file, maxWidth = 1280, maxHeight = 1280, quality = 0.8) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          }, 'image/jpeg', quality);
        };
      };
    });
  };

  // Check if field is disabled (for view mode)
  const isFieldDisabled = (field) => {
    return effectiveIsViewMode && !isEditing;
  };

  // Toggle edit mode
  const toggleEditMode = () => {
    if (onEdit) {
      onEdit();
    } else {
      setIsEditing(!isEditing);
    }
  };

  // Handle removing a feature
  const handleRemoveFeature = (index) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        keyFeatures: prev.keyFeatures.filter((_, i) => i !== index)
      };
      return newData;
    });
  };

  // Handle Enter key press in the feature input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddFeature();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // In edit mode, detect changes and show dialog
    if (effectiveIsEditMode) {
      const detectedChanges = compareProductChanges(originalProductData, formData);
      if (detectedChanges.length > 0) {
        console.log('📋 Product changes detected:', detectedChanges);
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

  const performSave = async () => {
    console.log('🚀 [ComradesProductForm] performSave started');
    console.log('🚀 [ComradesProductForm] Current ID:', id);
    console.log('🚀 [ComradesProductForm] Mode:', { effectiveIsEditMode, effectiveIsListMode, effectiveIsCreateMode });
    setLoading(true);

    setShowMediaError(false);
    setMediaErrorMessage('');
    const newErrors = {};

    console.log('🚀 [ComradesProductForm] Checking comprehensive validation...');

    // 1. Validate Product Name
    if (!formData.name || formData.name.trim() === '') {
      newErrors.name = 'Product name is required';
    }

    // 2. Validate Category & Subcategory
    if (!formData.categoryId) {
      newErrors.category = 'Category is required';
    }
    if (!formData.subcategoryId) {
      newErrors.subcategory = 'Subcategory is required';
    }

    // 3. Validate Pricing
    if (!formData.basePrice || parseFloat(formData.basePrice) <= 0) {
      newErrors.basePrice = 'Valid base price is required';
    }

    // NEW: Validate displayPrice >= basePrice
    const basePrice = parseFloat(formData.basePrice);
    const displayPrice = parseFloat(formData.displayPrice || formData.basePrice);
    if (displayPrice < basePrice) {
      newErrors.displayPrice = 'Display price must be greater than or equal to base price';
    }

    // 4. Validate Stock
    if (formData.stock === undefined || formData.stock === null || formData.stock === '' || parseInt(formData.stock) < 0) {
      newErrors.stock = 'Valid stock quantity is required';
    }

    // 5. Build Media Errors (consistent with previous logic)
    if (!coverImage) {
      newErrors.media = 'Cover image is required';
      setShowMediaError(true);
      setMediaErrorMessage('Please upload a cover image');
    }

    const isNewItem = !id && !initialProduct;
    if (isNewItem && galleryImages.length < 2) {
      newErrors.media = newErrors.media || 'Gallery images required';
      setShowMediaError(true);
      setMediaErrorMessage('New products require at least 2 gallery images');
    }

    // 7. Sync with backend strict validation requirements
    if (!formData.fullDescription || formData.fullDescription.trim() === '') {
      newErrors.fullDescription = 'Full description is required';
    }
    
    if (!formData.shortDescription || formData.shortDescription.trim() === '') {
      newErrors.shortDescription = 'Short description is required';
    }

    if (!formData.keywords || formData.keywords.trim() === '') {
      newErrors.keywords = 'At least one keyword/tag is required';
    }

    if (!formData.deliveryMethod) {
      newErrors.deliveryMethod = 'Delivery method is required';
    }

    // 6. LISTING MODE SPECIFIC VALIDATIONS
    // When super admin is listing a product, these fields are REQUIRED
    if (effectiveIsListMode) {
      console.log('🔍 [ComradesProductForm] Checking LISTING MODE specific validations...');

      // Display Price is REQUIRED in listing mode
      if (!formData.displayPrice || parseFloat(formData.displayPrice) <= 0) {
        newErrors.displayPrice = 'Display price is required for listing';
      }

      // Delivery Fee Type is REQUIRED
      if (!formData.deliveryFeeType) {
        newErrors.deliveryFeeType = 'Delivery fee type is required for listing';
      }

      // Delivery Fee is REQUIRED
      if (formData.deliveryFee === undefined || formData.deliveryFee === null || formData.deliveryFee === '') {
        newErrors.deliveryFee = 'Delivery fee is required for listing (can be 0)';
      }

      // If Marketing is enabled, ALL marketing fields are REQUIRED
      if (formData.marketingEnabled) {
        console.log('🔍 [ComradesProductForm] Marketing enabled - validating marketing fields...');

        if (!formData.marketingCommissionType) {
          newErrors.marketingCommissionType = 'Marketing commission type is required when marketing is enabled';
        }

        if (formData.marketingCommission === undefined || formData.marketingCommission === null || formData.marketingCommission === '') {
          newErrors.marketingCommission = 'Marketing commission is required when marketing is enabled';
        }

        if (!formData.marketingStartDate || formData.marketingStartDate === '') {
          newErrors.marketingStartDate = 'Marketing start date is required when marketing is enabled';
        }

        if (!formData.marketingEndDate || formData.marketingEndDate === '') {
          newErrors.marketingEndDate = 'Marketing end date is required when marketing is enabled';
        }
      }
    }

    // If there are errors, handle feedback and scrolling
    if (Object.keys(newErrors).length > 0) {
      console.log('🚀 [ComradesProductForm] VALIDATION FAILED:', newErrors);
      setValidationErrors(newErrors);
      setLoading(false);

      toast({
        title: 'Validation Failed',
        description: 'Please fix the highlighted errors in red to continue.',
        variant: 'destructive',
      });

      // Automated scrolling to the FIRST error found
      if (newErrors.name && nameRef.current) {
        nameRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if ((newErrors.category || newErrors.subcategory) && categoryRef.current) {
        categoryRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.basePrice && pricingRef.current) {
        pricingRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.stock && stockRef.current) {
        stockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.fullDescription && typeof fullDescriptionRef !== 'undefined' && fullDescriptionRef.current) {
        fullDescriptionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.media && mediaRef.current) {
        mediaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if ((newErrors.deliveryFeeType || newErrors.deliveryFee || newErrors.deliveryCoverageZones) && deliveryRef.current) {
        deliveryRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if ((newErrors.marketingCommissionType || newErrors.marketingCommission || newErrors.marketingStartDate || newErrors.marketingEndDate) && marketingRef.current) {
        marketingRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      return;
    }

    // Clear previous errors if all passed
    setValidationErrors({});
    console.log('🚀 [ComradesProductForm] Validation passed accurately.');

    try {
      // Verify token exists before proceeding
      const token = localStorage.getItem('token');
      if (!token) {
        toast({
          title: 'Authentication Error',
          description: 'No authentication token found. Please log in again.',
          variant: 'destructive',
        });
        setLoading(false);
        navigate('/login');
        return;
      }

      console.log('🚀 [ComradesProductForm] Auth token check passed. Resolving categories.');

      // Resolve category/subcategory IDs to real backend IDs by name if needed
      let resolvedCategoryId = formData.categoryId;
      let resolvedSubcategoryId = formData.subcategoryId;
      try {
        console.log('🚀 [ComradesProductForm] Starting category resolution map...');
        // Heuristic: if IDs look like small seed IDs from fallback, map by name using backend list
        const smallId = (v) => !v || isNaN(Number(v)) || Number(v) < 50;
        if (smallId(resolvedCategoryId) || smallId(resolvedSubcategoryId)) {
          console.log('🚀 [ComradesProductForm] Small ID detected, fetching authoritative categories...');
          const { data: backendCats } = await productApi.getCategories();
          console.log('🚀 [ComradesProductForm] Backend categories fetched:', backendCats.length);
          // Find selected names from UI list
          const uiCategory = allCategories.find(c => String(c.id || c._id) === String(formData.categoryId));
          const uiSubcategory = (uiCategory?.Subcategory || []).find(s => String(s.id || s._id) === String(formData.subcategoryId));
          // Map by name in backend list
          const backendCategory = backendCats.find(c => c.name === uiCategory?.name);
          if (backendCategory) {
            resolvedCategoryId = backendCategory.id;
            if (uiSubcategory) {
              const backendSub = (backendCategory.Subcategory || []).find(s => s.name === uiSubcategory.name);
              if (backendSub) resolvedSubcategoryId = backendSub.id;
            }
          }
        }
      } catch (mapErr) {
        console.warn('Category mapping warning:', mapErr);
      }

      const formDataToSend = new FormData();

      // Add cover image - ensure it's properly detected and added
      console.log('=== FILE UPLOAD DEBUG ===');
      console.log('coverImage type:', typeof coverImage);
      console.log('coverImage instanceof File:', coverImage instanceof File);
      console.log('coverImage:', coverImage);
      console.log('galleryImages:', galleryImages.map(img => ({ type: typeof img, isFile: img instanceof File })));
      console.log('=========================');

      // Add cover image only if it's a File object
      // Backend expects field name 'cover'
      if (coverImage instanceof File) {
        console.log('Compressing and adding cover image to FormData');
        const compressedCover = await compressImage(coverImage);
        formDataToSend.append('coverImage', compressedCover, coverImage.name);
      } else if (typeof coverImage === 'string' && coverImage) {
        console.log('Adding existing cover image URL to FormData');
        formDataToSend.append('existingCoverImage', coverImage);
      } else {
        console.log('No cover image to add');
      }

      // Add gallery images - ensure they are properly handled
      const galleryFiles = galleryImages.filter(img => img instanceof File);
      console.log('Gallery files to compress and upload:', galleryFiles.length);

      for (let i = 0; i < galleryFiles.length; i++) {
        const image = galleryFiles[i];
        console.log(`Compressing and adding gallery image ${i + 1} to FormData:`, image.name);
        const compressedImage = await compressImage(image);
        formDataToSend.append('galleryImages', compressedImage, image.name);
      }

      // Add existing gallery images
      const existingGallery = galleryImages.filter(img => typeof img === 'string' && img);
      if (existingGallery.length > 0) {
        console.log('Adding existing gallery image URLs to FormData:', existingGallery.length);
        formDataToSend.append('existingGalleryImages', JSON.stringify(existingGallery));
      }
      if (productVideo instanceof File) {
        console.log('Adding video to FormData:', productVideo.name);
        formDataToSend.append('video', productVideo, productVideo.name);
      } else if (typeof productVideo === 'string' && productVideo) {
        console.log('Adding existing video path to FormData');
        formDataToSend.append('existingVideo', productVideo);
      } else {
        console.log('No video to add');
      }

      // Prepare the data with proper field mapping
      const productData = {
        // Basic required fields
        name: formData.name?.trim(),
        shortDescription: formData.shortDescription?.trim(),
        fullDescription: formData.fullDescription?.trim(),
        brand: formData.brand?.trim() || '',
        model: formData.model?.trim() || '',
        unitOfMeasure: formData.unitOfMeasure || 'pcs',
        deliveryMethod: formData.deliveryMethod || 'Pickup',
        keywords: formData.keywords?.trim(),

        // Pricing
        basePrice: formData.basePrice ? parseFloat(formData.basePrice) : 0,
        displayPrice: formData.displayPrice ? parseFloat(formData.displayPrice) : 0,
        discountPercentage: formData.discountPercentage ? parseInt(formData.discountPercentage, 10) : 0,
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice) : null,
        stock: formData.stock ? parseInt(formData.stock, 10) : 0,

        // Category and subcategory
        categoryId: resolvedCategoryId || formData.categoryId,
        subcategoryId: resolvedSubcategoryId || formData.subcategoryId,

        // Complex data
        keyFeatures: typeof formData.keyFeatures === 'string'
          ? formData.keyFeatures
          : (Array.isArray(formData.keyFeatures) ? formData.keyFeatures.join(' ') : ''),
        physicalFeatures: formData.physicalFeatures || {},
        specifications: formData.specifications || {},
        variants: Array.isArray(formData.variants) ? formData.variants : [],

        // Shipping & warranty
        weight: formData.weight ? parseFloat(formData.weight) : '',
        length: formData.length ? parseFloat(formData.length) : '',
        width: formData.width ? parseFloat(formData.width) : '',
        height: formData.height ? parseFloat(formData.height) : '',
        warranty: formData.warranty?.trim() || '',
        returnPolicy: formData.returnPolicy?.trim() || '',

        // Media count for validation
        galleryImagesCount: galleryImages.filter(img => img instanceof File).length,

        // Additional fields
        condition: formData.condition || 'Brand New',
        visibilityStatus: formData.visibilityStatus || 'active',

        // Inventory fields
        sku: formData.sku?.trim() || '',
        barcode: formData.barcode?.trim() || '',
        lowStockThreshold: formData.lowStockThreshold ? parseInt(formData.lowStockThreshold, 10) : 5,
        compareAtPrice: formData.compareAtPrice ? parseFloat(formData.compareAtPrice) : '',
        cost: formData.cost ? parseFloat(formData.cost) : '',

        // SEO fields
        metaTitle: formData.metaTitle?.trim() || '',
        metaDescription: formData.metaDescription?.trim() || '',
        metaKeywords: formData.metaKeywords?.trim() || '',

        // Marketing fields (already has marketingEnabled, marketingCommissionType, marketingCommission)
        marketingEnabled: formData.marketingEnabled || false,
        marketingCommissionType: formData.marketingCommissionType || 'percentage',
        marketingCommission: formData.marketingCommission || 0,
        marketingStartDate: formData.marketingStartDate || '',
        marketingEndDate: formData.marketingEndDate || '',
        featured: formData.featured || false,
        isFeatured: formData.featured || false,

        // Delivery fields
        deliveryFee: formData.deliveryFee || 0,
        deliveryFeeType: formData.deliveryFeeType || 'flat',
        deliveryCoverageZones: formData.deliveryCoverageZones || '',

        // Flash sale fields
        isFlashSale: formData.isFlashSale || false,
        flashSalePrice: formData.flashSalePrice ? parseFloat(formData.flashSalePrice) : '',
        flashSaleStart: formData.flashSaleStart || '',
        flashSaleEnd: formData.flashSaleEnd || '',

        // Digital product fields
        isDigital: formData.isDigital || false,
        downloadUrl: formData.downloadUrl?.trim() || ''
      };

      // Debug logging - log what we're sending
      console.log('=== FORM SUBMISSION DEBUG ===');
      console.log('FormData values:');
      console.log('  categoryId from formData:', formData.categoryId);
      console.log('  subcategoryId from formData:', formData.subcategoryId);
      console.log('  resolvedCategoryId:', resolvedCategoryId);
      console.log('  resolvedSubcategoryId:', resolvedSubcategoryId);
      console.log('Product data being sent:', productData);
      console.log('  Final categoryId:', productData.categoryId);
      console.log('  Final subcategoryId:', productData.subcategoryId);
      console.log('Resolved category ID:', resolvedCategoryId);
      console.log('Resolved subcategory ID:', resolvedSubcategoryId);
      console.log('Cover image:', coverImage instanceof File ? `File object (${coverImage.name}, ${coverImage.size} bytes)` : (typeof coverImage === 'string' ? 'Base64/URL String' : 'None'));
      console.log('Gallery images:', galleryImages.map((img, i) => img instanceof File ? `File ${i + 1}: ${img.name} (${img.size} bytes)` : `URL ${i + 1}: ${img}`));
      console.log('Gallery files count:', galleryImages.filter(img => img instanceof File).length);
      console.log('Video:', productVideo ? `File object (${productVideo.name}, ${productVideo.size} bytes)` : 'None');
      console.log('FormData entries:');
      for (let [key, value] of formDataToSend.entries()) {
        if (value instanceof File) {
          console.log(`  ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }
      console.log('==============================');

      // Append all fields to FormData
      // CRITICAL FIX: Always send these fields even if empty/falsy
      const alwaysSendFields = [
        'categoryId', 'subcategoryId', 'marketingEnabled', 'featured', 'isFeatured',
        'isFlashSale', 'isDigital', 'isBestSeller', 'discountPercentage',
        'lowStockThreshold', 'stock'
      ];

      Object.entries(productData).forEach(([key, value]) => {
        // Check if this field should always be sent
        const shouldAlwaysSend = alwaysSendFields.includes(key);

        // Send if: (1) always-send field, (2) value is not null/undefined, or (3) value is not empty string
        const shouldSend = shouldAlwaysSend || (value !== null && value !== undefined && value !== '');

        if (shouldSend) {
          if (key === 'physicalFeatures' && typeof value === 'object') {
            formDataToSend.append('physicalFeatures', JSON.stringify(value));
          } else if (key === 'specifications' && typeof value === 'object') {
            formDataToSend.append('specifications', JSON.stringify(value));
          } else if (key === 'variants' && Array.isArray(value)) {
            formDataToSend.append(key, JSON.stringify(value));
          } else if (key === 'deliveryCoverageZones') {
            // Handle both array (already parsed) and string (needs parsing) formats
            let zones = [];
            if (Array.isArray(value)) {
              zones = value;
            } else {
              zones = (String(value) || '').split(',').map(z => z.trim()).filter(Boolean);
            }
            formDataToSend.append('deliveryCoverageZones', JSON.stringify(zones));
          } else {
            // Convert to string, handling special cases
            formDataToSend.append(key, String(value !== null && value !== undefined ? value : ''));
          }
        }
      });

      let response;
      if (effectiveIsListMode) {
        // Special handling for "listing" a product
        formDataToSend.set('status', 'active');
        console.log('🚀 [ComradesProductForm] Calling productApi.update (List Mode) with ID:', id);

        response = await productApi.update(id, formDataToSend);

        setModalConfig({
          type: 'success',
          title: 'Product Listed Successfully!',
          description: 'Your product satisfies all requirements and is now live on the platform.',
          onConfirm: () => navigate('/dashboard/products/comrades', { state: { updated: true, message: 'Product is now live!' } })
        });
        setShowModal(true);
        setLoading(false);

      } else if (effectiveIsEditMode) {
        // Regular update logic
        console.log('🚀 [ComradesProductForm] Calling productApi.update (Edit Mode) with ID:', id);

        if (!id) throw new Error("Missing Product ID for update");

        response = await productApi.update(id, formDataToSend);
        console.log('✅ [ComradesProductForm] Product updated successfully:', response?.data);

        setOriginalProductData(formData);
        setHasUpdated(true);

        setModalConfig({
          type: 'success',
          title: 'Product Updated!',
          description: 'Your product has been updated successfully.'
        });
        setShowModal(true);

        toast({
          title: 'Success',
          description: 'Product updated successfully',
        });

        // Background refresh if provided
        if (onAfterSave) {
          onAfterSave(response.data);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      } else {
        // Create new product
        response = await productApi.create(formDataToSend);

        // Store the created product for the success dialog
        const savedData = {
          ...(response?.data || {}),
          name: response?.data?.name || formData.name,
          displayPrice: response?.data?.displayPrice || formData.displayPrice || formData.basePrice,
          stock: response?.data?.stock !== undefined ? response.data.stock : formData.stock,
          unitOfMeasure: response?.data?.unitOfMeasure || formData.unitOfMeasure,
          id: response?.data?.id || response?.data?._id
        };
        setCreatedProduct(savedData);

        // Immediate background refresh if callback provided
        if (onAfterSave) {
          console.log('🔄 ComradesProductForm (Create): Triggering onAfterSave background refresh...');
          onAfterSave(response.data);
        }

        // Show success dialog instead of immediate navigation
        setModalConfig({
          type: 'success',
          title: 'Product Created!',
          description: `Product "${formData.name}" has been added to the platform.`,
          onConfirm: () => {
            if (onSuccess) {
              onSuccess(savedData);
            } else {
              navigate('/dashboard/products');
            }
          }
        });
        setShowModal(true);

        // Clear the draft (both old key and useAutoSave key)
        clearDraft();
        clearAutoSaveDraft();

        // Mark as updated to trigger re-initialization
        setHasUpdated(true);
      }
    } catch (error) {
      // More detailed error handling with debugging info
      let errorMessage = 'Failed to save product';
      let errorDetails = '';

      console.error('=== PRODUCT CREATION ERROR DEBUG ===');
      console.error('Error object:', error);
      console.error('Error response:', error.response);
      console.error('Error request:', error.request);
      console.error('Error message:', error.message);
      console.error('=====================================');

      if (error.response) {
        // Server responded with an error
        console.error('Server error details:', JSON.stringify(error.response.data, null, 2));
        console.error('Status code:', error.response.status);

        if (error.response.status === 403) {
          errorMessage = 'You do not have permission to perform this action. Please check your account permissions.';
        } else if (error.response.status === 401) {
          errorMessage = 'Your session has expired. Please log in again.';
          setTimeout(() => navigate('/login'), 2000);
        } else if (error.response.status === 400) {
          // Handle validation errors specifically
          if (error.response.data?.code === 'VALIDATION_ERROR') {
            errorMessage = `Validation failed: ${error.response.data.message}`;
            if (error.response.data?.details?.fields) {
              errorDetails = `Missing fields: ${error.response.data.details.fields.join(', ')}`;
            }
          } else if (error.response.data?.code === 'COVER_REQUIRED') {
            errorMessage = 'Cover image is required. Please upload a cover image.';
          } else if (error.response.data?.code === 'GALLERY_REQUIRED') {
            errorMessage = 'At least 2 gallery images are required.';
          } else if (error.response.data?.message) {
            errorMessage = error.response.data.message;
          } else if (error.response.data?.error) {
            errorMessage = error.response.data.error;
          }
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data?.error) {
          errorMessage = error.response.data.error;
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'Unable to connect to the server. Please check your internet connection.';
      } else {
        // Something else happened
        errorMessage = error.message || 'An unexpected error occurred';
      }

      // Show the error with additional details
      const fullErrorMessage = errorDetails ? `${errorMessage}. ${errorDetails}` : errorMessage;

      setModalConfig({
        type: 'error',
        title: 'Save Failed',
        description: fullErrorMessage
      });
      setShowModal(true);

      toast({
        title: 'Error',
        description: fullErrorMessage,
        variant: 'destructive',
        duration: 8000, // Show longer for validation errors
      });
    } finally {
      setLoading(false);
    }
  };

  // Determine if this is a super admin editing a product
  const isSuperAdminEdit = id && initialProduct?.addedBy?.role === 'superadmin';
  const isSuperAdminCreate = !id && initialProduct?.addedBy?.role === 'superadmin';

  return (
    <div className="w-full max-w-5xl ml-0 mr-auto overflow-x-hidden">
      <div className="sm:rounded-lg rounded-none shadow-md sm:shadow-lg bg-white overflow-hidden">
        <div className="p-2 sm:p-5 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="mr-4"
                title="Go Back"
              >
                <ArrowLeft className="h-6 w-6" />
              </Button>
              {/* Title section - show for all modes */}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {(() => {
                    if (effectiveIsViewMode) return 'View Product Details';
                    const title = isSuperAdminEdit
                      ? 'Edit Super Admin Product'
                      : isSuperAdminCreate
                        ? 'Create Super Admin Product'
                        : effectiveIsListMode
                          ? 'List Product'
                          : effectiveIsCreateMode
                            ? 'Create New Product'
                            : 'Update Product';
                    return title;
                  })()}
                </h1>
                {effectiveIsCreateMode && hasDraft && (
                  <p className="text-sm text-yellow-600 mt-1 flex items-center">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                    You have unsaved changes
                  </p>
                )}
              </div>
            </div>


            {/* Draft controls */}
            {effectiveIsCreateMode && hasDraft && (
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to start over? All unsaved changes will be lost.')) {
                      clearDraftAndReset();
                    }
                  }}
                  className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md border border-blue-200"
                >
                  Start Over
                </button>
              </div>
            )}
          </div>



          {/* Dynamic Form Component Rendering */}
          <div className="min-h-[50vh]">
            {currentComponent === 'fastfood' && (
              <div className="space-y-6">
                <div className="bg-orange-50 p-4 rounded-lg border-2 border-orange-200">
                  <h3 className="text-lg font-semibold text-orange-900">🍽️ Fast Food Form</h3>
                  <p className="text-sm text-orange-700">Specialized form for restaurant and food items</p>
                </div>
                <FastFoodForm
                  onSuccess={onSuccess}
                  onEdit={() => setIsEditing(true)}
                  id={id}
                  mode={(effectiveIsViewMode && !isEditing) ? 'view' : (effectiveIsEditMode || isEditing ? 'edit' : 'create')}
                  product={{
                    ...initialProduct,
                    ...formData,
                    // Ensure name is synced
                    name: formData.name || productName || initialProduct?.name || '',
                    // Ensure category IDs are synced
                    categoryId: formData.categoryId,
                    subcategoryId: formData.subcategoryId
                  }}
                  isSellerContext={currentUser?.role === 'seller' && !['admin', 'superadmin', 'super_admin'].includes(currentUser?.role)}
                />
              </div>
            )}

            {currentComponent === 'service' && (
              <div className="space-y-6">
                <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                  <h3 className="text-lg font-semibold text-purple-900">🛠️ Service Form</h3>
                  <p className="text-sm text-purple-700">Form for professional services and consultations</p>
                </div>
                <ServiceForm
                  onSuccess={onSuccess}
                  onEdit={() => setIsEditing(true)}
                  mode={(effectiveIsViewMode && !isEditing) ? 'view' : (effectiveIsEditMode || isEditing ? 'edit' : 'create')}
                  initialData={{
                    ...initialProduct,
                    ...formData,
                    // Ensure title is synced
                    title: formData.name || productName || initialProduct?.name || initialProduct?.title || '',
                    // Ensure category IDs are synced
                    categoryId: formData.categoryId,
                    subcategoryId: formData.subcategoryId
                  }}
                  isEditing={!!(id || initialProduct)}
                />
              </div>
            )}

            {currentComponent === 'comrades' && (
              <form id="product-form" onSubmit={handleSubmit} className="space-y-8 pb-24">

                {isFieldDisabled('vendorInfo') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pb-6">
                    {/* Vendor Information Card */}
                    <div className="bg-blue-50 rounded-lg p-6 border border-blue-100 shadow-sm">
                      <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                        <span className="mr-2">👤</span>
                        Vendor Information
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-1 border-b border-blue-100">
                          <span className="text-sm font-medium text-blue-800">Owner Name:</span>
                          <span className="text-sm text-gray-700">{formData.seller?.name || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-blue-100">
                          <span className="text-sm font-medium text-blue-800">Phone:</span>
                          <span className="text-sm text-gray-700">{formData.seller?.phone || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-sm font-medium text-blue-800">Email:</span>
                          <span className="text-sm text-gray-700">{formData.seller?.email || 'N/A'}</span>
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
                          <span className="text-sm font-medium text-green-800">Status:</span>
                          <span className={`text-sm font-bold ${formData.status === 'active' || formData.status === 'approved' ? 'text-green-600' : 'text-orange-600'}`}>
                            {formData.status?.charAt(0).toUpperCase() + formData.status?.slice(1) || 'Pending'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-green-100">
                          <span className="text-sm font-medium text-green-800">Stock:</span>
                          <span className="text-sm text-gray-700">{formData.stock || 0} units</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-sm font-medium text-green-800">Low Stock Threshold:</span>
                          <span className="text-sm text-gray-700">{formData.lowStockThreshold || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Product Name */}
                <div ref={nameRef} className={`p-4 rounded-lg transition-colors ${validationErrors.name ? 'bg-red-50 border-2 border-red-500 shadow-sm' : 'bg-gray-50'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <Label htmlFor="name" className={`text-lg font-semibold ${validationErrors.name ? 'text-red-700' : 'text-gray-800'}`}>Product Name</Label>
                    {validationErrors.name && <span className="text-red-600 text-xs font-bold uppercase animate-pulse">Required *</span>}
                  </div>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="Enter product name"
                    required
                    disabled={isFieldDisabled('name')}
                    maxLength={20}
                    className={`mt-2 text-lg ${validationErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                  <div className="flex justify-between mt-2">
                    <p className={`text-xs font-medium ${validationErrors.name ? 'text-red-500' : 'text-gray-500'}`}>
                      {validationErrors.name || 'Character limit for better card display'}
                    </p>
                    <p className={`text-xs font-bold ${formData.name?.length >= 18 ? 'text-red-500' : 'text-gray-500'}`}>
                      {formData.name?.length || 0}/20
                    </p>
                  </div>
                </div>

                {/* Category and Subcategory */}
                <div ref={categoryRef} className={`grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 p-2 sm:p-4 rounded-lg transition-colors ${validationErrors.category || validationErrors.subcategory ? 'bg-red-50 border-2 border-red-500 shadow-sm' : ''}`}>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label htmlFor="categoryId" className={validationErrors.category ? 'text-red-700 font-bold' : ''}>Category *</Label>
                      {validationErrors.category && <span className="text-red-600 text-[10px] font-bold uppercase">Required</span>}
                    </div>
                    <select
                      id="categoryId"
                      value={formData.categoryId || ''}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      required
                      disabled={isFieldDisabled('categoryId')}
                      className={`w-full h-10 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${validationErrors.category ? 'border-red-500 bg-red-50 focus:ring-red-400' : 'bg-white border-blue-500 hover:border-blue-600 focus:ring-blue-300 shadow-sm'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <option value="">Select category</option>
                      {(filteredCategories || []).map((cat) => (
                        <option key={cat.id || cat._id} value={String(cat.id || cat._id)}>
                          {cat.emoji} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label htmlFor="subcategoryId" className={validationErrors.subcategory ? 'text-red-700 font-bold' : ''}>Subcategory *</Label>
                      {validationErrors.subcategory && <span className="text-red-600 text-[10px] font-bold uppercase">Required</span>}
                    </div>
                    <select
                      id="subcategoryId"
                      value={formData.subcategoryId || ''}
                      onChange={(e) => handleSubcategoryChange(e.target.value)}
                      disabled={isFieldDisabled('subcategoryId') || !formData.categoryId}
                      required
                      className={`w-full h-10 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${validationErrors.subcategory ? 'border-red-500 bg-red-50 focus:ring-red-400' : 'bg-blue-50 border-blue-200 hover:bg-blue-100 focus:ring-blue-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <option value="">{formData.categoryId ? 'Select subcategory' : 'Select a category first'}</option>
                      {getSubcategoriesByCategory(formData.categoryId).map((subcategory) => (
                        <option key={String(subcategory.id || subcategory._id)} value={String(subcategory.id || subcategory._id)}>
                          {subcategory.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Input
                      id="brand"
                      value={formData.brand}
                      onChange={(e) => handleFieldChange('brand', e.target.value)}
                      placeholder="Enter brand name"
                      disabled={isFieldDisabled('brand')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="model">Model</Label>
                    <Input
                      id="model"
                      value={formData.model}
                      onChange={(e) => handleFieldChange('model', e.target.value)}
                      placeholder="Enter model"
                      disabled={isFieldDisabled('model')}
                    />
                  </div>
                </div>

                {/* Condition */}
                <div>
                  <Label htmlFor="condition">Condition</Label>
                  <Select
                    value={formData.condition || 'Brand New'}
                    onValueChange={(value) => handleFieldChange('condition', value)}
                    required
                    disabled={isFieldDisabled('condition')}
                  >
                    <SelectTrigger className="w-full bg-white border-2 border-blue-500 hover:border-blue-600 focus:ring-4 focus:ring-blue-100 shadow-sm">
                      <SelectValue placeholder="Select condition">
                        {formData.condition || 'Brand New'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-blue-50 border border-blue-200">
                      <SelectItem value="Brand New">Brand New</SelectItem>
                      <SelectItem value="Refurbished">Refurbished</SelectItem>
                      <SelectItem value="Used">Used</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Keywords */}
                <div>
                  <Label htmlFor="keywords">Keywords *</Label>
                  <Input
                    id="keywords"
                    value={formData.keywords || ''}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="Enter keywords separated by commas"
                    required
                    disabled={isFieldDisabled('keywords')}
                  />
                  <p className="text-xs text-gray-500 mt-1">Keywords help customers find your product during search</p>
                </div>

                {/* Unit of Measure */}
                <div>
                  <Label htmlFor="unitOfMeasure">Unit of Measure *</Label>
                  <Select
                    value={formData.unitOfMeasure || 'pcs'}
                    onValueChange={(value) => {
                      if (value === '__more__') {
                        setShowAllUom(true);
                        const key = `uom_expanded_comrades_${formData.categoryId || 'none'}`;
                        try { localStorage.setItem(key, 'true'); } catch (_) { }
                        return;
                      }
                      handleFieldChange('unitOfMeasure', value);
                    }}
                    disabled={isFieldDisabled('unitOfMeasure')}
                    required
                  >
                    <SelectTrigger className="w-full bg-white border-2 border-blue-500 hover:border-blue-600 focus:ring-4 focus:ring-blue-100 shadow-sm">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent className="bg-blue-50 border border-blue-200">
                      {Object.entries(UOM_GROUPS).map(([group, units]) => (
                        <div key={group}>
                          {showAllUom && (
                            <div className="px-3 py-1.5 text-xs font-medium text-gray-500">
                              {group}
                            </div>
                          )}
                          {(showAllUom ? units : units.slice(0, 6)).map(unit => (
                            <SelectItem key={unit} value={unit}>
                              {UOM_LABELS[unit] || unit}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                      {!showAllUom && (
                        <SelectItem value="__more__" className="text-blue-600">
                          Show more units...
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    The unit in which this product is sold (e.g., kg, l, pcs)
                  </p>
                </div>

                {/* Pricing + Stock */}
                <div className={`p-6 rounded-lg border transition-colors ${validationErrors.basePrice || validationErrors.stock ? 'bg-red-50 border-red-500 shadow-md' : 'bg-blue-50 border-blue-200'}`}>
                  <h3 className={`text-xl font-semibold mb-4 ${validationErrors.basePrice || validationErrors.stock ? 'text-red-900' : 'text-blue-900'}`}>Pricing & Stock</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                    <div ref={pricingRef} className="relative">
                      <div className="flex justify-between items-center mb-1">
                        <Label htmlFor="basePrice" className={`text-lg font-medium ${validationErrors.basePrice ? 'text-red-700' : 'text-blue-800'}`}>Base Price</Label>
                        {validationErrors.basePrice && <span className="text-red-600 text-[10px] font-bold uppercase animate-bounce">Required KSH</span>}
                      </div>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Ksh</span>
                        <Input
                          id="basePrice"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.basePrice}
                          onChange={(e) => handleFieldChange('basePrice', e.target.value)}
                          placeholder="0.00"
                          required
                          disabled={isFieldDisabled('basePrice')}
                          className={`pl-16 text-lg font-semibold ${validationErrors.basePrice ? 'border-red-500 focus:ring-red-500' : 'border-blue-300 focus:border-blue-500 focus:ring-blue-500'}`}
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <Label htmlFor="displayPrice" className="text-lg font-medium text-blue-800">Display Price</Label>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Ksh</span>
                        <Input
                          id="displayPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.displayPrice}
                          onChange={(e) => handleFieldChange('displayPrice', e.target.value)}
                          placeholder="0.00"
                          required
                          disabled={isFieldDisabled('displayPrice')}
                          className="pl-16 border-blue-300 focus:border-blue-500 focus:ring-blue-500 text-lg font-semibold"
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <Label htmlFor="discountPercentage" className="text-lg font-medium text-blue-800">Discount %</Label>
                      <div className="relative mt-2">
                        <Input
                          id="discountPercentage"
                          type="number"
                          min="0"
                          max="100"
                          value={formData.discountPercentage}
                          onChange={(e) => handleFieldChange('discountPercentage', e.target.value)}
                          placeholder="0"
                          disabled={isFieldDisabled('discountPercentage')}
                          className="border-blue-300 focus:border-blue-500 focus:ring-blue-500 text-lg"
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <Label htmlFor="discountPrice" className="text-lg font-medium text-blue-800">Discount Price</Label>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Ksh</span>
                        <Input
                          id="discountPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.discountPrice}
                          readOnly
                          disabled
                          className="pl-16 border-blue-300 bg-blue-50 focus:border-blue-500 focus:ring-blue-500 text-lg font-bold"
                        />
                      </div>
                    </div>
                    <div ref={stockRef}>
                      <div className="flex justify-between items-center mb-1">
                        <Label htmlFor="stock" className={validationErrors.stock ? 'text-red-700 font-bold' : ''}>Stock Quantity</Label>
                        {validationErrors.stock && <span className="text-red-600 text-[10px] font-bold uppercase">Required</span>}
                      </div>
                      <Input
                        id="stock"
                        type="number"
                        min="0"
                        value={formData.stock}
                        onChange={(e) => handleFieldChange('stock', e.target.value)}
                        placeholder="Enter stock quantity"
                        required
                        disabled={isFieldDisabled('stock')}
                        className={validationErrors.stock ? 'border-red-500 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-blue-300 focus:border-blue-500 focus:ring-blue-500'}
                      />
                    </div>
                  </div>
                </div>

                {/* Variants */}
                <div className="space-y-4 border p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label>Product Variants</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      setFormData(prev => {
                        const newVariant = { name: '', options: [''], optionDetails: {} };
                        
                        // Auto-populate first variant from main pricing if it's the first one
                        if (!prev.variants || prev.variants.length === 0) {
                          const base = prev.basePrice || '';
                          const display = prev.displayPrice || base;
                          const perc = prev.discountPercentage || 0;
                          const discPrice = prev.discountPrice || (perc > 0 ? (parseFloat(display) * (1 - parseFloat(perc) / 100)).toFixed(2) : display);
                          
                          newVariant.optionDetails = {
                            '': { // Default empty option
                              basePrice: base,
                              displayPrice: display,
                              discountPercentage: perc,
                              discountPrice: discPrice,
                              stock: prev.stock || ''
                            }
                          };
                        }
                        
                        return {
                          ...prev,
                          variants: [...(prev.variants || []), newVariant]
                        };
                      });
                    }} disabled={isFieldDisabled('variants')}>
                      Add Variant
                    </Button>
                  </div>
                  {formData.variants?.map((variant, variantIndex) => (
                    <div key={variantIndex} className="space-y-4 p-4 border rounded-md">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <Label>Variant Name</Label>
                          <Input type="text" value={variant.name} onChange={(e) => {
                            const newVariants = [...formData.variants];
                            newVariants[variantIndex] = { ...variant, name: e.target.value };
                            setFormData({ ...formData, variants: newVariants });
                          }} placeholder="e.g., Color, Size, Material" disabled={isFieldDisabled('variants')} />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Options (press Enter or comma to add)</Label>
                          <div className="flex flex-wrap gap-2 items-center border rounded-md p-2 min-h-10">
                            {(variant.options || []).filter(opt => opt).map((option, i) => (
                              <div key={i} className="flex items-center bg-blue-50 text-blue-800 px-2 py-1 rounded-full text-sm">
                                {option}
                                <button type="button" onClick={() => {
                                  const newOptions = [...(variant.options || [])];
                                  newOptions.splice(i, 1);
                                  const newDetails = { ...(variant.optionDetails || {}) };
                                  delete newDetails[option];
                                  const newVariants = [...formData.variants];
                                  newVariants[variantIndex] = { ...variant, options: newOptions.filter(Boolean), optionDetails: newDetails };
                                  setFormData({ ...formData, variants: newVariants });
                                }} className="ml-1 text-blue-500 hover:text-blue-700 disabled:opacity-0" disabled={isFieldDisabled('variants')}>×</button>
                              </div>
                            ))}
                            <input type="text" value={variant.newOption || ''} onChange={(e) => {
                              const newVariants = [...formData.variants];
                              newVariants[variantIndex] = { ...variant, newOption: e.target.value };
                              setFormData({ ...formData, variants: newVariants });
                            }} onKeyDown={(e) => {
                              if ((e.key === ',' || e.key === 'Enter') && variant.newOption?.trim()) {
                                e.preventDefault();
                                const option = variant.newOption.trim();
                                const newOptions = [...new Set([...(variant.options || []), option])];
                                const newVariants = [...formData.variants];
                                newVariants[variantIndex] = { ...variant, options: newOptions.filter(Boolean), newOption: '' };
                                setFormData({ ...formData, variants: newVariants });
                              }
                            }} onBlur={() => {
                              if (variant.newOption?.trim()) {
                                const option = variant.newOption.trim();
                                const newOptions = [...new Set([...(variant.options || []), option])];
                                const newVariants = [...formData.variants];
                                newVariants[variantIndex] = { ...variant, options: newOptions.filter(Boolean), newOption: '' };
                                setFormData({ ...formData, variants: newVariants });
                              }
                            }} placeholder={(variant.options || []).length ? '' : "e.g., Small, Medium, Large"} disabled={isFieldDisabled('variants')} className="flex-1 border-0 focus:ring-0 focus:outline-none bg-transparent min-w-[100px] disabled:placeholder-transparent" />
                            <Button type="button" variant="ghost" size="icon" className="text-red-500 hover:text-red-700 ml-auto" onClick={() => {
                              const newVariants = formData.variants.filter((_, i) => i !== variantIndex);
                              setFormData({ ...formData, variants: newVariants });
                            }} disabled={isFieldDisabled('variants')}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Press Enter or comma to add options</p>
                        </div>
                      </div>
                      {(variant.options || []).filter(opt => opt).length > 0 && variant.name && (
                        <div className="mt-4 overflow-x-auto -mx-2 sm:mx-0 border rounded-none sm:rounded-md shadow-inner bg-white">
                          <Label className="px-4 py-2 block border-b bg-gray-50 text-blue-900 font-bold">Variant Options and Prices</Label>
                          <table className="min-w-[600px] sm:min-w-[800px] w-full mt-2">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">{variant.name}</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Base Price</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Display Price</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Disc %</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Disc Price</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Stock</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {(variant.options || []).filter(opt => opt).map((option, optionIndex) => {
                                const details = (variant.optionDetails || {})[option] || {};

                                const updateDetail = (field, value) => {
                                  const newVariants = [...formData.variants];
                                  const currentDetails = variant.optionDetails || {};
                                  const updatedItem = {
                                    ...(currentDetails[option] || {}),
                                    [field]: value
                                  };

                                  // Removed auto-filling displayPrice from basePrice to respect user's request
                                  /*
                                  if (field === 'basePrice' && !updatedItem.displayPrice) {
                                    updatedItem.displayPrice = value;
                                  }
                                  */

                                  // Calculate discountPrice if any pricing field changes
                                  if (field === 'basePrice' || field === 'displayPrice' || field === 'discountPercentage') {
                                    const disp = parseFloat(updatedItem.displayPrice || updatedItem.basePrice || 0);
                                    const perc = parseFloat(updatedItem.discountPercentage || 0);
                                    const calc = perc > 0 ? disp * (1 - perc / 100) : disp;
                                    updatedItem.discountPrice = calc.toFixed(2);
                                  }

                                  newVariants[variantIndex] = {
                                    ...variant,
                                    optionDetails: {
                                      ...currentDetails,
                                      [option]: updatedItem
                                    }
                                  };
                                  setFormData({ ...formData, variants: newVariants });
                                };

                                return (
                                  <tr key={optionIndex}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">
                                      {option}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">Ksh</span>
                                        <Input
                                          type="number"
                                          step="1"
                                          min="0"
                                          value={details.basePrice || ''}
                                          onChange={(e) => updateDetail('basePrice', e.target.value)}
                                          placeholder="0"
                                          className="w-28 pl-8 text-sm font-medium border-gray-300"
                                          disabled={isFieldDisabled('variants')}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">Ksh</span>
                                        <Input
                                          type="number"
                                          step="1"
                                          min="0"
                                          value={details.displayPrice || ''}
                                          onChange={(e) => updateDetail('displayPrice', e.target.value)}
                                          placeholder="0"
                                          className="w-28 pl-8 text-sm font-medium border-gray-300"
                                          disabled={isFieldDisabled('variants')}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <div className="relative">
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">%</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={details.discountPercentage || ''}
                                          onChange={(e) => updateDetail('discountPercentage', e.target.value)}
                                          placeholder="0"
                                          className="w-24 pr-5 text-sm font-medium border-gray-300"
                                          disabled={isFieldDisabled('variants')}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-medium">Ksh</span>
                                        <Input
                                          type="number"
                                          step="1"
                                          min="0"
                                          value={details.discountPrice || ''}
                                          readOnly
                                          disabled
                                          placeholder="0.00"
                                          className="w-32 pl-8 text-sm bg-blue-50 font-bold border-blue-200 text-blue-700"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <Input
                                        type="number"
                                        min="0"
                                        value={details.stock || ''}
                                        onChange={(e) => updateDetail('stock', e.target.value)}
                                        placeholder="0"
                                        className="w-20"
                                        disabled={isFieldDisabled('variants')}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  {formData.variants?.length > 0 && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-md">
                      <h4 className="text-sm font-medium mb-2">Variant Summary</h4>
                      <p className="text-xs text-gray-500">
                        {formData.variants.length === 1
                          ? `This will create ${(formData.variants[0].options || []).length} product variants.`
                          : `This will create ${formData.variants.reduce((acc, curr) => acc * (((curr.options || []).length) || 1), 1)} product variants.`
                        }
                      </p>
                    </div>
                  )}
                </div>

                {/* Short Description */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <Label htmlFor="shortDescription" className="text-lg font-semibold text-gray-800">Short Description</Label>
                  <Textarea id="shortDescription" value={formData.shortDescription} onChange={(e) => handleFieldChange('shortDescription', e.target.value)} placeholder="Enter a brief description (max 150 characters)" maxLength={150} required disabled={isFieldDisabled('shortDescription')} className="mt-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500" rows={3} />
                  <p className="text-xs text-gray-500 mt-2">{formData.shortDescription?.length || 0}/150 characters</p>
                </div>

                {/* Full Description */}
                <div>
                  <Label htmlFor="fullDescription">Full Description *</Label>
                  <Textarea id="fullDescription" value={formData.fullDescription} onChange={(e) => handleFieldChange('fullDescription', e.target.value)} placeholder="Enter detailed product description, features, and specifications" rows={6} required disabled={isFieldDisabled('fullDescription')} />
                  <p className="text-xs text-gray-500 mt-1">Provide comprehensive details about the product</p>
                </div>

                {/* Specifications */}
                <div className="space-y-4">
                  <div>
                    <Label>Specifications (Optional)</Label>
                    <p className="text-sm text-gray-500 mb-2">Add technical specifications in a tabular format</p>

                    {/* Add New Specification Row */}
                    <div className="flex gap-4 mb-4">
                      <div className="flex-1">
                        <Input
                          type="text"
                          value={newSpecName || ''}
                          onChange={(e) => setNewSpecName(e.target.value)}
                          placeholder="Specification name (e.g., Weight, Dimensions)"
                          disabled={isFieldDisabled('specifications')}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="text"
                          value={newSpecValue || ''}
                          onChange={(e) => setNewSpecValue(e.target.value)}
                          placeholder="Value (e.g., 1.5kg, 30x20x10cm)"
                          disabled={isFieldDisabled('specifications')}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleAddSpecification}
                        variant="outline"
                        disabled={isFieldDisabled('specifications')}
                      >
                        Add
                      </Button>
                    </div>

                    {/* Display Added Specifications */}
                    {Object.keys(formData.specifications || {}).length > 0 && (
                      <div className="border rounded-md p-4 space-y-2">
                        <h4 className="font-medium text-sm text-gray-700 mb-3">Product Specifications</h4>
                        {Object.entries(formData.specifications).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="font-medium">{key}:</div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600">{value}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const newSpecs = { ...formData.specifications };
                                  delete newSpecs[key];
                                  setFormData({
                                    ...formData,
                                    specifications: newSpecs
                                  });
                                }}
                                className="text-red-500 hover:text-red-700 disabled:opacity-0"
                                aria-label={`Remove ${key}`}
                                disabled={isFieldDisabled('specifications')}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Features */}
                <div>
                  <Label htmlFor="keyFeatures">Key Features</Label>
                  <Textarea
                    id="keyFeatures"
                    value={(() => {
                      const kf = formData.keyFeatures || '';
                      // If it looks like JSON object, show empty - data is wrong
                      if (typeof kf === 'string' && kf.trim().startsWith('{')) {
                        return '';
                      }
                      return kf;
                    })()}
                    onChange={(e) => {
                      if (isFieldDisabled('keyFeatures')) return;
                      handleFieldChange('keyFeatures', e.target.value);
                    }}
                    placeholder="Describe the key features and benefits of your product..."
                    className="min-h-[100px]"
                    disabled={isFieldDisabled('keyFeatures')}
                  />
                  <p className="text-xs text-gray-500 mt-1">Describe the key features and benefits of your product in detail</p>
                  {formData.keyFeatures && typeof formData.keyFeatures === 'string' && formData.keyFeatures.trim().startsWith('{') && (
                    <p className="text-xs text-red-600 mt-1">⚠️ This field contains invalid data (JSON object). Please re-enter the key features as text.</p>
                  )}
                </div>

                {/* Physical Features */}
                <div className="space-y-4">
                  <div>
                    <Label>Physical Features</Label>
                    <p className="text-sm text-gray-500 mb-2">Add custom physical features and their values</p>

                    {/* Add New Feature Row */}
                    <div className="flex gap-4 mb-4">
                      <div className="flex-1">
                        <Input
                          type="text"
                          value={newPhysicalFeature.name || ''}
                          onChange={(e) => setNewPhysicalFeature({ ...newPhysicalFeature, name: e.target.value })}
                          placeholder="Feature name (e.g., Color, Weight)"
                          disabled={isFieldDisabled('physicalFeatures')}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="text"
                          value={newPhysicalFeature.value || ''}
                          onChange={(e) => setNewPhysicalFeature({ ...newPhysicalFeature, value: e.target.value })}
                          placeholder="Value (e.g., Black, 1.5kg)"
                          disabled={isFieldDisabled('physicalFeatures')}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          if (newPhysicalFeature.name && newPhysicalFeature.value) {
                            setFormData({
                              ...formData,
                              physicalFeatures: {
                                ...formData.physicalFeatures,
                                [newPhysicalFeature.name]: newPhysicalFeature.value
                              }
                            });
                            setNewPhysicalFeature({ name: '', value: '' });
                          }
                        }}
                        variant="outline"
                        disabled={isFieldDisabled('physicalFeatures')}
                      >
                        Add
                      </Button>
                    </div>

                    {/* Display Added Features */}
                    {Object.keys(formData.physicalFeatures || {}).length > 0 && (
                      <div className="border rounded-md p-4 space-y-2">
                        {Object.entries(formData.physicalFeatures)
                          .filter(([key]) => {
                            // Filter out numeric keys (character-split data)
                            // Also filter out metadata
                            const isNumericKey = !isNaN(parseInt(key, 10)) && String(parseInt(key, 10)) === key;
                            const isMetadata = ['condition', 'isBestSeller'].includes(key);
                            return !isNumericKey && !isMetadata;
                          })
                          .map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="font-medium">{key}:</div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">{value}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newFeatures = { ...formData.physicalFeatures };
                                    delete newFeatures[key];
                                    setFormData({
                                      ...formData,
                                      physicalFeatures: newFeatures
                                    });
                                  }}
                                  className="text-red-500 hover:text-red-700 disabled:opacity-0"
                                  aria-label={`Remove ${key}`}
                                  disabled={isFieldDisabled('physicalFeatures')}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}\n                        {Object.entries(formData.physicalFeatures).filter(([key]) => {
                            const isNumericKey = !isNaN(parseInt(key, 10)) && String(parseInt(key, 10)) === key;
                            const isMetadata = ['condition', 'isBestSeller'].includes(key);
                            return !isNumericKey && !isMetadata;
                          }).length === 0 && (
                              <p className="text-xs text-gray-500 italic">No valid physical features (corrupted data filtered out)</p>
                            )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Media Uploads */}
                <div ref={mediaRef} className="space-y-6 bg-green-50 p-6 rounded-lg border border-green-200">
                  <h3 className="text-xl font-semibold text-green-900 mb-4">Product Media</h3>

                  {/* Cover Image */}
                  <div className="space-y-2 border p-4 rounded-lg">
                    <Label>Cover Image (Required)</Label>
                    <p className="text-sm text-gray-500">This will be the main product image</p>
                    {showMediaError && !coverImage && (
                      <div className="border-2 border-red-500 p-2 rounded mb-2 animate-pulse bg-red-50">
                        <p className="text-red-600 text-sm font-bold flex items-center">
                          <span className="mr-2">⚠️</span> Cover image is required
                        </p>
                      </div>
                    )}
                    <div className="mt-2">
                      {coverPreview ? (
                        <div className="space-y-3">
                          <div className="relative inline-block bg-gray-100 rounded-md p-1">
                            <img
                              src={resolveImageUrl(coverPreview)}
                              alt="Cover preview"
                              className="h-40 w-40 object-contain rounded-md border-2 border-gray-200 bg-white"
                              onError={(e) => {
                                if (!coverPreview.includes('data:image')) {
                                  console.log('Preview image load error, keeping current src');
                                }
                              }}
                            />
                            {!isFieldDisabled('media') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCoverImage(null);
                                  setCoverPreview('');
                                }}
                                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors"
                                title="Remove image"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <div>
                            {!isFieldDisabled('media') && (
                              <>
                                <input
                                  type="file"
                                  id="cover-image-change"
                                  accept="image/*"
                                  onChange={handleCoverImageChange}
                                  className="hidden"
                                />
                                <label
                                  htmlFor="cover-image-change"
                                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md cursor-pointer transition-colors"
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  {coverPreview.startsWith('blob:') || coverPreview.startsWith('http') ? 'Change Photo' : 'Upload Photo'}
                                </label>
                              </>
                            )}
                            {isFieldDisabled('media') && (
                              <div className="text-sm italic text-gray-500">Cover image management disabled in view mode</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed rounded-md p-6 text-center">
                          <input
                            type="file"
                            id="cover-image"
                            accept="image/*"
                            onChange={handleCoverImageChange}
                            className="hidden"
                          />
                          <label
                            htmlFor="cover-image"
                            className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                          >
                            <Upload className="h-8 w-8 text-gray-400" />
                            <p className="text-sm text-gray-600">Click to upload cover image</p>
                            <p className="text-xs text-gray-500">PNG, JPG, JPEG (max 5MB)</p>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gallery Images */}
                  <div className="space-y-2 border p-4 rounded-lg">
                    <Label>Gallery Images (Required)</Label>
                    <p className="text-sm text-gray-500">Add exactly 2 high-quality images to showcase your product from different angles</p>
                    {showMediaError && galleryImages.length !== 2 && (
                      <div className="border-2 border-red-500 p-2 rounded mb-2 animate-pulse bg-red-50">
                        <p className="text-red-600 text-sm font-bold flex items-center">
                          <span className="mr-2">⚠️</span> {galleryImages.length === 0 ? 'Please upload at least 2 gallery images' : `Required: 2 gallery images (currently have ${galleryImages.length})`}
                        </p>
                      </div>
                    )}
                    <div className="mt-2">
                      {galleryPreviews.length > 0 && (
                        <div className="flex flex-wrap gap-4 mb-4">
                          {galleryPreviews.map((preview, index) => (
                            <div key={index} className="relative group bg-gray-100 rounded-md p-1">
                              <img
                                src={resolveImageUrl(preview)}
                                alt={`Gallery ${index + 1}`}
                                className="h-40 w-40 object-contain rounded-md border-2 border-gray-200 bg-white"
                              />
                              {!isFieldDisabled('media') && (
                                <button
                                  type="button"
                                  onClick={() => removeGalleryImage(index)}
                                  className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors"
                                  title="Remove image"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                              <div className="mt-2 text-center">
                                {!isFieldDisabled('media') && (
                                  <>
                                    <input
                                      type="file"
                                      id={`gallery-image-${index}`}
                                      accept="image/*"
                                      onChange={(e) => handleGalleryImagesChange(e, index)}
                                      className="hidden"
                                    />
                                    <label
                                      htmlFor={`gallery-image-${index}`}
                                      className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md cursor-pointer transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      {preview.startsWith('blob:') || preview.startsWith('http') ? 'Change' : 'Upload'}
                                    </label>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {galleryImages.length < 2 && (
                        <div className="border-2 border-dashed rounded-md p-6 text-center">
                          <input
                            type="file"
                            id="gallery-images"
                            accept="image/*"
                            onChange={handleGalleryImagesChange}
                            className="hidden"
                            multiple
                          />
                          <label
                            htmlFor="gallery-images"
                            className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                          >
                            <Upload className="h-8 w-8 text-gray-400" />
                            <p className="text-sm text-gray-600 font-medium">
                              {galleryImages.length === 0
                                ? 'Click to upload 2 gallery images'
                                : `Add ${2 - galleryImages.length} more image${2 - galleryImages.length === 1 ? '' : 's'}`}
                            </p>
                            <p className="text-xs text-gray-500">PNG, JPG, JPEG (exactly 2 images required, max 5MB each)</p>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Video Upload */}
                <div className="space-y-2 border p-4 rounded-lg">
                  <Label>Product Video (Optional)</Label>
                  <p className="text-sm text-gray-500">Show your product in action (max 50MB)</p>
                  <div className="mt-2">
                    {videoPreview ? (
                      <div className="space-y-3">
                        <div className="relative bg-gray-100 rounded-md p-1">
                          <video className="h-64 w-full object-contain rounded-md border-2 border-gray-200 bg-black" controls>
                            <source src={resolveImageUrl(videoPreview)} type="video/mp4" />
                            Your browser does not support the video tag.
                          </video>
                          {!isFieldDisabled('video') && (
                            <button
                              type="button"
                              onClick={removeVideo}
                              className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors"
                              title="Remove video"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {!isFieldDisabled('video') && (
                          <div>
                            <input
                              type="file"
                              id="product-video-change"
                              accept="video/*"
                              onChange={handleVideoChange}
                              className="hidden"
                            />
                            <label
                              htmlFor="product-video-change"
                              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md cursor-pointer transition-colors"
                            >
                              <Video className="h-4 w-4 mr-2" />
                              {videoPreview.startsWith('blob:') || videoPreview.startsWith('http') ? 'Change Video' : 'Upload Video'}
                            </label>
                          </div>
                        )}
                      </div>
                    ) : !isFieldDisabled('video') ? (
                      <div className="border-2 border-dashed rounded-md p-6 text-center">
                        <input
                          type="file"
                          id="product-video"
                          accept="video/*"
                          onChange={handleVideoChange}
                          className="hidden"
                        />
                        <label
                          htmlFor="product-video"
                          className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                        >
                          <Video className="h-8 w-8 text-gray-400" />
                          <p className="text-sm text-gray-600">Click to upload product video</p>
                          <p className="text-xs text-gray-500">MP4, WebM, MOV (max 50MB)</p>
                        </label>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-6 text-center border">
                        <Video className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 italic">No product video uploaded</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Shipping & Warranty Section */}
                <div className="space-y-6 bg-indigo-50 p-6 rounded-lg border border-indigo-200">
                  <h3 className="text-xl font-semibold text-indigo-900">Shipping & Warranty</h3>

                  {/* Weight */}
                  <div>
                    <Label htmlFor="weight">Weight</Label>
                    <Input
                      id="weight"
                      type="text"
                      value={formData.weight}
                      onChange={(e) => handleFieldChange('weight', e.target.value)}
                      placeholder="e.g., 5kg, 10lbs"
                      disabled={isFieldDisabled('weight')}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Product weight (include units like kg, g, lbs)
                    </p>
                  </div>

                  {/* Dimensions */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="length">Length</Label>
                      <Input
                        id="length"
                        type="text"
                        value={formData.length}
                        onChange={(e) => handleFieldChange('length', e.target.value)}
                        placeholder="e.g., 10cm, 5in"
                        disabled={isFieldDisabled('length')}
                      />
                    </div>
                    <div>
                      <Label htmlFor="width">Width</Label>
                      <Input
                        id="width"
                        type="text"
                        value={formData.width}
                        onChange={(e) => handleFieldChange('width', e.target.value)}
                        placeholder="e.g., 20cm, 8in"
                        disabled={isFieldDisabled('width')}
                      />
                    </div>
                    <div>
                      <Label htmlFor="height">Height</Label>
                      <Input
                        id="height"
                        type="text"
                        value={formData.height}
                        onChange={(e) => handleFieldChange('height', e.target.value)}
                        placeholder="e.g., 30cm, 12in"
                        disabled={isFieldDisabled('height')}
                      />
                    </div>
                  </div>

                  {/* Delivery Method */}
                  <div>
                    <Label htmlFor="deliveryMethod">Delivery Method</Label>
                    <Select
                      value={formData.deliveryMethod || 'Pickup'}
                      onValueChange={(value) => handleFieldChange('deliveryMethod', value)}
                      disabled={isFieldDisabled('deliveryMethod')}
                    >
                      <SelectTrigger className="w-full bg-blue-50 border-blue-200 hover:bg-blue-100">
                        <SelectValue placeholder="Select delivery method">
                          {formData.deliveryMethod || 'Pickup'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pickup">Pickup</SelectItem>
                        <SelectItem value="Express">Express</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Choose how customers can receive this product
                    </p>
                  </div>

                  {/* Warranty */}
                  <div>
                    <Label htmlFor="warranty">Warranty</Label>
                    <Input
                      id="warranty"
                      value={formData.warranty}
                      onChange={(e) => handleFieldChange('warranty', e.target.value)}
                      placeholder="e.g., 12 months manufacturer warranty"
                      disabled={isFieldDisabled('warranty')}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Warranty information for this product
                    </p>
                  </div>

                  {/* Return Policy */}
                  <div>
                    <Label htmlFor="returnPolicy">Return Policy</Label>
                    <Textarea
                      id="returnPolicy"
                      value={formData.returnPolicy}
                      onChange={(e) => handleFieldChange('returnPolicy', e.target.value)}
                      placeholder="Describe the return policy for this product"
                      rows={3}
                      disabled={isFieldDisabled('returnPolicy')}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Return and refund policy details
                    </p>
                  </div>
                </div>

                {/* Delivery Configuration Section */}
                <div ref={deliveryRef} className="space-y-6 bg-purple-50 p-6 rounded-lg border border-purple-200">
                  <h3 className="text-xl font-semibold text-purple-900">Delivery Configuration</h3>

                  {/* Delivery Fee Type */}
                  <div>
                    <Label htmlFor="deliveryFeeType">Delivery Fee Type</Label>
                    <Select
                      value={formData.deliveryFeeType || 'flat'}
                      onValueChange={(value) => handleFieldChange('deliveryFeeType', value)}
                      disabled={isFieldDisabled('deliveryFeeType')}
                    >
                      <SelectTrigger className="w-full bg-white border-2 border-blue-500 hover:border-blue-600 focus:ring-4 focus:ring-blue-100 shadow-sm font-medium">
                        <SelectValue placeholder="Select delivery fee type" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-blue-200 shadow-xl">
                        <SelectItem value="free">Free Delivery</SelectItem>
                        <SelectItem value="flat">Flat Rate</SelectItem>
                        <SelectItem value="percentage">Percentage of Base Price</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Choose how delivery fees are calculated
                    </p>
                  </div>

                  {/* Delivery Fee Amount */}
                  <div>
                    <Label htmlFor="deliveryFee">
                      Delivery Fee {formData.deliveryFeeType === 'percentage' ? '(%)' : '(Ksh)'}
                    </Label>
                    <Input
                      id="deliveryFee"
                      type="number"
                      step={formData.deliveryFeeType === 'percentage' ? '0.01' : '1'}
                      min="0"
                      value={formData.deliveryFeeType === 'free' ? '0' : (formData.deliveryFee || '')}
                      onChange={(e) => handleFieldChange('deliveryFee', e.target.value)}
                      placeholder={formData.deliveryFeeType === 'percentage' ? 'e.g., 5.00' : 'e.g., 200'}
                      disabled={formData.deliveryFeeType === 'free' || isFieldDisabled('deliveryFee')}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.deliveryFeeType === 'free'
                        ? 'No delivery fee will be charged to customers'
                        : formData.deliveryFeeType === 'percentage'
                          ? 'Commission calculated as percentage of base price'
                          : 'Fixed delivery fee amount in Ksh'}
                    </p>
                  </div>

                  {/* Delivery Coverage Zones */}
                  <div>
                    <Label htmlFor="deliveryCoverageZones">Delivery Coverage Zones</Label>
                    <Textarea
                      id="deliveryCoverageZones"
                      value={typeof formData.deliveryCoverageZones === 'string'
                        ? formData.deliveryCoverageZones
                        : (Array.isArray(formData.deliveryCoverageZones) ? formData.deliveryCoverageZones.join(', ') : '')}
                      onChange={(e) => handleFieldChange('deliveryCoverageZones', e.target.value)}
                      placeholder="e.g., Nairobi, Kiambu, Machakos"
                      rows={3}
                      disabled={isFieldDisabled('deliveryCoverageZones')}
                      className="mt-2"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter zones separated by commas
                    </p>
                  </div>
                </div>

                {/* Marketing Configuration Section */}
                <div ref={marketingRef} className="space-y-6 bg-orange-50 p-6 rounded-lg border border-orange-200">
                  <h3 className="text-xl font-semibold text-orange-900">Marketing Configuration</h3>

                  {/* Marketing Enable */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="marketingEnabled"
                        checked={formData.marketingEnabled || false}
                        onChange={(e) => handleFieldChange('marketingEnabled', e.target.checked)}
                        disabled={isFieldDisabled('marketingEnabled')}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <Label htmlFor="marketingEnabled" className="text-sm font-medium">
                        Enable Marketing
                      </Label>
                    </div>
                    <p className="text-xs text-gray-500 pl-6">
                      When enabled, marketers can promote this product
                    </p>
                  </div>

                  {formData.marketingEnabled && (
                    <>
                      {/* Marketing Commission Type */}
                      <div>
                        <Label htmlFor="marketingCommissionType">Marketing Commission Type</Label>
                        <Select
                          value={formData.marketingCommissionType || 'flat'}
                          onValueChange={(value) => handleFieldChange('marketingCommissionType', value)}
                          disabled={isFieldDisabled('marketingCommission')}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select commission type" />
                          </SelectTrigger>
                          <SelectContent className="bg-white">
                            <SelectItem value="price_difference">Percentage of Price Difference (Discount Price - Base)</SelectItem>
                            <SelectItem value="flat">Flat Rate</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                          {formData.marketingCommissionType === 'percentage' && 'Commission calculated as percentage of base price'}
                          {formData.marketingCommissionType === 'price_difference' && 'Commission calculated as percentage of difference between discount and base price'}
                          {formData.marketingCommissionType === 'flat' && 'Fixed commission amount in Ksh'}
                        </p>
                      </div>

                      {/* Marketing Commission Amount */}
                      <div>
                        <Label htmlFor="marketingCommission">
                          Marketing Commission {formData.marketingCommissionType === 'flat' ? '(Ksh)' : '(%)'}
                        </Label>
                        <Input
                          id="marketingCommission"
                          type="number"
                          step={formData.marketingCommissionType === 'flat' ? '1' : '0.01'}
                          min="0"
                          value={formData.marketingCommission || ''}
                          onChange={(e) => handleFieldChange('marketingCommission', e.target.value)}
                          placeholder={formData.marketingCommissionType === 'flat' ? 'e.g., 500' : 'e.g., 10.00'}
                          disabled={isFieldDisabled('marketingCommission')}
                        />
                        {formData.marketingCommissionType === 'price_difference' && formData.basePrice && formData.discountPrice && (
                          <p className="text-xs text-blue-600 mt-1">
                            Price difference: KSh {Math.max(0, parseFloat(formData.discountPrice || 0) - parseFloat(formData.basePrice || 0)).toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* Marketing Duration */}
                      <div>
                        <Label>Marketing Duration</Label>
                        <p className="text-sm text-gray-500 mb-2">Select the period during which this product should be marketed</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="marketingStartDate" className="text-sm">Start Date</Label>
                            <Input
                              id="marketingStartDate"
                              type="date"
                              value={formData.marketingStartDate || ''}
                              onChange={(e) => handleFieldChange('marketingStartDate', e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                              disabled={isFieldDisabled('marketingStartDate')}
                            />
                          </div>
                          <div>
                            <Label htmlFor="marketingEndDate" className="text-sm">End Date</Label>
                            <Input
                              id="marketingEndDate"
                              type="date"
                              value={formData.marketingEndDate || ''}
                              onChange={(e) => handleFieldChange('marketingEndDate', e.target.value)}
                              min={formData.marketingStartDate || new Date().toISOString().split('T')[0]}
                              disabled={isFieldDisabled('marketingEndDate')}
                            />
                          </div>
                        </div>
                        {formData.marketingStartDate && formData.marketingEndDate && (
                          <p className="text-xs text-green-600 mt-2">
                            Duration: {Math.ceil((new Date(formData.marketingEndDate) - new Date(formData.marketingStartDate)) / (1000 * 60 * 60 * 24))} days
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Approval & Monitoring Section removed as requested */}

                {/* Approval buttons are handled in ProductListingMode component for pending products */}
                {effectiveIsListMode && initialProduct && initialProduct.status !== 'pending' && (
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mt-6">
                    <p className="text-yellow-800 text-sm">
                      <strong>Note:</strong> This product is in listing mode. Approval controls are available in the product listing view.
                    </p>
                  </div>
                )}

                {/* Action buttons - Clear and correct functionality */}
                {/* Action buttons - View Mode */}
                {effectiveIsViewMode && !isEditing && onEdit && (
                  <div className="flex justify-end space-x-4 pt-6 border-t bg-white mt-8">
                    <button
                      type="button"
                      onClick={() => onEdit(id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 min-w-[120px] relative z-20 border-2 border-blue-700 rounded-md flex items-center justify-center"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Product
                    </button>
                  </div>
                )}

                {/* Action buttons - Only show in Edit/Create/List mode */}
                {(!effectiveIsViewMode || isEditing) && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t bg-white mt-8 p-4 sm:p-0">
                    <AutoSaveIndicator lastSaved={autoLastSaved} isSaving={false} />
                    <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-end gap-3 w-full sm:w-auto">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/dashboard/products')}
                        disabled={loading}
                        className="bg-white hover:bg-gray-50 border-gray-300 text-gray-700 hover:text-gray-900 px-6 py-2 font-medium relative z-20"
                      >
                        Cancel
                      </Button>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`flex items-center justify-center px-8 py-2 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 min-w-[120px] relative z-20 border-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${effectiveIsListMode
                          ? 'bg-green-600 hover:bg-green-700 border-green-700'
                          : 'bg-blue-600 hover:bg-blue-700 border-blue-700'
                          }`}
                        style={{ color: 'white' }}
                        data-testid="submit-button"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" style={{ color: 'white' }} />
                            <span style={{ color: 'white', fontWeight: '600' }}>
                              {effectiveIsListMode ? 'Processing...' : (effectiveIsEditMode ? 'Updating...' : 'Creating...')}
                            </span>
                          </>
                        ) : (
                          <>
                            {effectiveIsListMode ? <Check className="h-4 w-4 mr-2" style={{ color: 'white' }} /> : <Save className="h-4 w-4 mr-2" style={{ color: 'white' }} />}
                            <span style={{ color: 'white', fontWeight: '700', fontSize: '14px' }}>
                              {(() => {
                                if (effectiveIsListMode) return 'List Product';
                                if (effectiveIsCreateMode) return 'Create Product';
                                return 'Update Product';
                              })()}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Changes Dialog */}
        <ChangesDialog
          open={showChangesDialog}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setShowChangesDialog(false);
              setLoading(false);
            }
          }}
          onConfirm={async () => {
            console.log('🚀 [ComradesProductForm] ChangesDialog: Confirm Update clicked');
            setShowChangesDialog(false);
            // Small delay to let dialog close animation finish and prevents state race
            setTimeout(async () => {
              console.log('🚀 [ComradesProductForm] ChangesDialog: Executing delayed performSave');
              await performSave();
            }, 100);
          }}
          changes={changes}
          itemName={formData.name || 'Product'}
          title="Review Changes"
          description="Please review the changes below before updating the product."
          actionLabel="Confirm Update"
        />

        <SystemFeedbackModal
          open={showModal}
          onOpenChange={setShowModal}
          type={modalConfig.type}
          title={modalConfig.title}
          description={modalConfig.description}
          onConfirm={modalConfig.onConfirm}
          confirmLabel={effectiveIsEditMode ? 'Done' : 'Back to Products'}
        />
      </div>
    </div>
  );
};

export default ComradesProductForm;
