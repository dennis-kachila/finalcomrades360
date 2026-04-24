import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useToast } from '../../components/ui/use-toast';
import { productApi } from '../../services/api';
import { useCategories } from '../../contexts/CategoriesContext';
import { formatKES, parsePriceInput } from '../../utils/currency';
import { Loader2, ArrowLeft, Upload, Video, Save, Check, Edit, Package } from 'lucide-react';
import AutoSaveIndicator from '../../components/ui/AutoSaveIndicator';
import { resolveImageUrl, FALLBACK_IMAGE } from '../../utils/imageUtils';
import ChangesDialog from '../../components/ui/changes-dialog';
import Dialog from '../../components/Dialog';

import FastFoodForm from '../dashboard/FastFoodForm';
import ServiceForm from '../../components/services/ServiceForm';
import { Dialog as UiDialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import SystemFeedbackModal from '../../components/ui/SystemFeedbackModal';

// Category detection constants
const CATEGORY_TYPES = {
  FOOD_DRINKS: 'food_drinks',
  SERVICES: 'services',
  REGULAR: 'regular'
};

// Enhanced keyword patterns for better detection
const CATEGORY_PATTERNS = {
  [CATEGORY_TYPES.FOOD_DRINKS]: [
    'food', 'drink', 'beverage', 'restaurant', 'cafe', 'kitchen', 'cook',
    'snack', 'meal', 'cuisine', 'dining', 'eatery', 'nutrition', 'culinary',
    'burger', 'pizza', 'sandwich', 'salad', 'soup', 'coffee', 'tea',
    'juice', 'water', 'soda', 'alcohol', 'wine', 'beer', 'hot meal', 'hotel meal',
    'food & drinks', 'food and drinks', 'drinks & food', 'drinks and food'
  ],
  [CATEGORY_TYPES.SERVICES]: [
    'service', 'services', 'repair', 'maintenance', 'cleaning', 'tutoring', 'consulting',
    'installation', 'delivery', 'professional', 'technical', 'support',
    'plumbing', 'electrical', 'carpentry', 'painting', 'gardening',
    'tutoring', 'training', 'coaching', 'advice', 'inspection',
    'student services', 'student service', 'academic', 'educational'
  ]
};

// Grouped Units of Measure and labels
const UOM_GROUPS = {
  'General Retail / Consumer Goods': ['pcs', 'pack', 'set', 'pair', 'dozen', 'unit', 'box'],
  'Food & Beverages': ['g', 'kg', 'ml', 'L', 'bottle', 'can', 'cup', 'jar', 'box', 'sachet', 'tray'],
  'Fashion & Apparel': ['pcs', 'pair', 'set'],
  'Electronics': ['unit', 'pack', 'pcs'],
  'Cosmetics & Health': ['ml', 'L', 'g', 'kg', 'tube', 'jar', 'bottle'],
  'Home & Office': ['pcs', 'set', 'box', 'roll', 'sheet']
};

const UOM_LABELS = {
  pcs: 'Piece (pcs)',
  pack: 'Pack',
  set: 'Set',
  pair: 'Pair',
  dozen: 'Dozen',
  unit: 'Unit',
  box: 'Box',
  g: 'Gram (g)',
  kg: 'Kilogram (kg)',
  ml: 'Millilitre (ml)',
  L: 'Litre (L)',
  bottle: 'Bottle',
  can: 'Can',
  cup: 'Cup',
  jar: 'Jar',
  sachet: 'Sachet',
  tray: 'Tray',
  roll: 'Roll',
  sheet: 'Sheet'
};

const ProductForm = ({ mode: propMode = 'create' }) => {
  const params = useParams();
  const location = useLocation();

  // Detect mode from props, URL path, or presence of an ID
  const isEditRoute = location.pathname.includes('/edit');
  const mode = (propMode === 'edit' || isEditRoute || !!params.id) ? 'edit' : 'create';

  const productId = mode === 'edit' ? params.id : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { categories: allCategories, getSubcategoriesByCategory } = useCategories();

  // Local storage key for draft products
  const DRAFT_KEY = 'seller_product_draft';

  // Track if we have a draft
  const [hasDraft, setHasDraft] = useState(false);

  // State for showing save feedback
  const [showSaved, setShowSaved] = useState(false);
  const [lastAutoSaved, setLastAutoSaved] = useState(() => {
    // Restore last save timestamp from draft on mount
    try {
      const draft = localStorage.getItem('seller_product_draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        return parsed.lastSaved ? new Date(parsed.lastSaved) : null;
      }
    } catch (e) {}
    return null;
  });
  const saveTimeoutRef = useRef(null);
  const initialRender = useRef(true);

  // State for media files and previews
  const [coverPreview, setCoverPreview] = useState('');
  const [galleryPreviews, setGalleryPreviews] = useState([]);
  const [videoPreview, setVideoPreview] = useState('');
  const [productVideo, setProductVideo] = useState(null);
  const [coverImage, setCoverImage] = useState(null); // Will be File object or string URL
  const [galleryImages, setGalleryImages] = useState([]); // Mix of File objects and string URLs
  const [existingImages, setExistingImages] = useState([]); // Original image URLs from server
  const [galleryExistingImages, setGalleryExistingImages] = useState([]); // Existing gallery images that haven't been removed
  const [removedIdx, setRemovedIdx] = useState(new Set());
  const [coverImageType, setCoverImageType] = useState('existing'); // 'existing' | 'file' | 'none'
  const [videoType, setVideoType] = useState('existing'); // 'existing' | 'file' | 'none'

  // Image resolution function - handles base64, external URLs, and file paths


  // State to track if we've updated the product (for refreshing data)
  const [hasUpdated, setHasUpdated] = useState(false);

  // State to track original product data for change comparison
  const [originalProductData, setOriginalProductData] = useState(null);

  // State to show success message with changes
  const [savedProduct, setSavedProduct] = useState(null); // Track the saved product for "View" action
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', description: '' });
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [changes, setChanges] = useState([]);

  // Smart form switching state
  const [currentFormType, setCurrentFormType] = useState(CATEGORY_TYPES.REGULAR);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [productName, setProductName] = useState(''); // Track product name for form switching

  // Additional state variables for specifications and physical features
  const [newFeature, setNewFeature] = useState('');
  const [newPhysicalFeature, setNewPhysicalFeature] = useState({ name: '', value: '' });
  const [initialProduct, setInitialProduct] = useState(null);
  const [showAllUom, setShowAllUom] = useState(false);

  // Filter categories based on product taxonomy
  const filteredCategories = useMemo(() => {
    if (!allCategories) return [];
    return allCategories.filter(cat => 
      String(cat.taxonomyType || 'product') === 'product'
    );
  }, [allCategories]);

  // FastFoodForm Success Handler
  const handleFastFoodSuccess = () => {
    toast({
      title: 'Success',
      description: mode === 'edit' ? 'Food item updated successfully' : 'Food item created successfully',
    });
    navigate('/seller/products?tab=pending');
  };

  // Clear draft from local storage - defined early so it can be used in getInitialFormData
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
      setShowSaved(false);
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }, []);

  // Enhanced category detection with detailed logging
  const detectCategoryType = useCallback((categoryName, subcategoryName = '') => {
    const searchText = `${categoryName || ''} ${subcategoryName || ''}`.toLowerCase().trim();

    console.log('🔍 [ProductForm] detectCategoryType DEBUG:', {
      categoryName,
      subcategoryName,
      searchText,
      availablePatterns: CATEGORY_PATTERNS[CATEGORY_TYPES.FOOD_DRINKS]
    });

    if (!searchText) {
      console.log('❌ [ProductForm] No category name provided, defaulting to regular');
      return CATEGORY_TYPES.REGULAR;
    }

    // Check for food & drinks patterns
    const foodMatches = CATEGORY_PATTERNS[CATEGORY_TYPES.FOOD_DRINKS].filter(pattern => {
      const isMatch = searchText.includes(pattern.toLowerCase());
      if (isMatch) console.log(`🎯 [ProductForm] Pattern match found: "${pattern}" in "${searchText}"`);
      return isMatch;
    });

    if (foodMatches.length > 0) {
      console.log('✅ [ProductForm] Food & Drinks FINAL MATCH:', foodMatches);
      return CATEGORY_TYPES.FOOD_DRINKS;
    }

    // Check for services patterns
    const serviceMatches = CATEGORY_PATTERNS[CATEGORY_TYPES.SERVICES].filter(pattern =>
      searchText.includes(pattern.toLowerCase())
    );
    if (serviceMatches.length > 0) {
      console.log('✅ [ProductForm] Services FINAL MATCH:', serviceMatches);
      return CATEGORY_TYPES.SERVICES;
    }

    console.log('❌ [ProductForm] No patterns matched, defaulting to regular');
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

  // Helper to find category/subcategory name by ID
  const getCategoryName = (id) => {
    const category = allCategories.find(cat => cat.id === id || cat._id === id);
    return category ? category.name : `[Category ${id}]`;
  };

  const getSubcategoryName = (categoryId, subcategoryId) => {
    const category = allCategories.find(cat => cat.id === categoryId || cat._id === categoryId);
    if (!category) return `[Subcategory ${subcategoryId}]`;

    const subcatList = category.Subcategory || category.subcategories || [];
    if (!Array.isArray(subcatList)) return `[Subcategory ${subcategoryId}]`;

    const subcategory = subcatList.find(
      sub => sub.id === subcategoryId || sub._id === subcategoryId
    );
    return subcategory ? subcategory.name : `[Subcategory ${subcategoryId}]`;
  };

  // Get form type info for display
  const getFormTypeInfo = () => {
    switch (currentFormType) {
      case CATEGORY_TYPES.FOOD_DRINKS:
        return {
          title: '🍽️ Food & Drinks Form',
          description: 'Specialized form for restaurant and food items',
          color: 'orange',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200'
        };
      case CATEGORY_TYPES.SERVICES:
        return {
          title: '🛠️ Services Form',
          description: 'Form for professional services and consultations',
          color: 'purple',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-200'
        };
      default:
        return {
          title: '📦 Regular Product Form',
          description: 'Standard product form for general merchandise',
          color: 'blue',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
    }
  };

  // Initialize form data based on whether we're creating or editing
  const getInitialFormData = useCallback(() => {
    if (mode === 'edit' && productId) {
      // For edit mode, we'll load data from API
      return {
        name: '',
        brand: '',
        model: '',
        condition: 'Brand New', // Default condition
        shortDescription: '',
        fullDescription: '',
        basePrice: '',
        displayPrice: '',
        discountPrice: '',
        discountPercentage: '0',
        stock: '',
        categoryId: '',
        subcategoryId: '',
        unitOfMeasure: '',
        keyFeatures: [],
        physicalFeatures: {},
        specifications: {},
        variants: [],
        keywords: '',
        newSpecName: '',
        newSpecValue: '',
        weight: '',
        length: '',
        width: '',
        height: '',
        deliveryMethod: 'Pickup',
        warranty: '',
        returnPolicy: '',
        deliveryCoverageZones: '',
        // Additional fields
        sku: '',
        barcode: '',
        lowStockThreshold: '5',
        compareAtPrice: '',
        cost: '',
        metaTitle: '',
        metaDescription: '',
        metaKeywords: '',
        marketingEnabled: false,
        marketingDuration: 30, // Default duration
        marketingCommission: '0',
        marketingCommissionType: 'flat',
        featured: false,
        isFlashSale: false,
        flashSalePrice: '',
        flashSaleStart: '',
        flashSaleEnd: '',
        isDigital: false,
        downloadUrl: ''
      };
    }

    // For new products, try to restore an autosaved draft
    const blankForm = {
      name: '',
      brand: '',
      model: '',
      condition: 'Brand New',
      shortDescription: '',
      fullDescription: '',
      basePrice: '',
      stock: '',
      categoryId: '',
      subcategoryId: '',
      unitOfMeasure: '',
      keyFeatures: [],
      physicalFeatures: {},
      specifications: {},
      variants: [],
      keywords: '',
      newSpecName: '',
      newSpecValue: '',
      weight: '',
      length: '',
      width: '',
      height: '',
      deliveryMethod: 'Pickup',
      warranty: '',
      returnPolicy: '',
      deliveryCoverageZones: '',
      // Additional fields
      sku: '',
      barcode: '',
      lowStockThreshold: '5',
      compareAtPrice: '',
      cost: '',
      metaTitle: '',
      metaDescription: '',
      metaKeywords: '',
      // Hidden fields defaults
      displayPrice: '',
      discountPrice: '',
      discountPercentage: '0',
      deliveryFeeType: 'flat',
      deliveryFee: '0',
      marketingEnabled: false,
      marketingDuration: 30, // Default duration
      marketingCommission: '0',
      marketingCommissionType: 'flat',
      featured: false,
      isFlashSale: false,
      flashSalePrice: '',
      flashSaleStart: '',
      flashSaleEnd: '',
      isDigital: false,
      downloadUrl: ''
    };

    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        // Exclude non-serializable/media fields that were stripped during save
        const { coverImage: _ci, galleryImages: _gi, video: _v, lastSaved: _ls, ...rest } = parsed;
        return { ...blankForm, ...rest };
      }
    } catch (e) {
      console.warn('[ProductForm] Could not restore draft:', e);
    }

    return blankForm;
  }, [mode, productId]);

  // Form data state - initializes from draft for create mode
  const [formData, setFormData] = useState(getInitialFormData);

  // On create mode mount, check if there's a draft to signal hasDraft
  useEffect(() => {
    if (mode !== 'edit') {
      try {
        const draft = localStorage.getItem(DRAFT_KEY);
        if (draft) {
          const parsed = JSON.parse(draft);
          setHasDraft(true);
          // Also restore productName for form-type detection
          if (parsed.name) setProductName(parsed.name);
        } else {
          setHasDraft(false);
        }
      } catch (e) {
        setHasDraft(false);
      }
    }
  }, [mode, productId]);

  // Update subcategories when category changes
  const subcategories = useMemo(() => {
    if (!formData.categoryId) return [];
    const category = allCategories.find(cat =>
      String(cat.id) === String(formData.categoryId) || String(cat._id) === String(formData.categoryId)
    );
    // Categories from backend store subcategories on `Subcategory`
    // Fall back to `subcategories` if present for compatibility
    return category?.Subcategory || category?.subcategories || [];
  }, [formData.categoryId, allCategories]);

  // Initialize UoM expansion from storage when category changes
  useEffect(() => {
    const key = `uom_expanded_seller_${formData.categoryId || 'none'}`;
    const saved = localStorage.getItem(key);
    setShowAllUom(saved === 'true');
  }, [formData.categoryId]);

  // Auto-calculate Marketing Duration based on Start/End Dates
  useEffect(() => {
    if (formData.marketingStartDate && formData.marketingEndDate) {
      const start = new Date(formData.marketingStartDate);
      const end = new Date(formData.marketingEndDate);
      // Calculate difference in milliseconds
      const diffTime = end - start;
      // Convert to days (ceil to ensure at least 1 day if any time diff)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0) {
        setFormData(prev => ({ ...prev, marketingDuration: diffDays === 0 ? 1 : diffDays }));
      }
    }
  }, [formData.marketingStartDate, formData.marketingEndDate]);

  // Clear draft function is already defined above

  // Debounced save to draft
  const saveDraft = useCallback((data) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set a new timeout for saving
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const draftToSave = {
          ...data,
          // Don't save files in the draft as they can't be serialized
          coverImage: null,
          galleryImages: [],
          video: null,
          lastSaved: new Date().toISOString()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draftToSave));
        setHasDraft(true);

        // Show saved indicator
        const now = new Date();
        setLastAutoSaved(now);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      } catch (error) {
        console.error('Error saving draft:', error);
      }
    }, 1000); // 1 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Update clearDraft to reset all form state
  const clearDraftAndReset = useCallback(() => {
    clearDraft();
    setFormData({
      name: '',
      brand: '',
      model: '',
      condition: 'Brand New',
      shortDescription: '',
      fullDescription: '',
      basePrice: '',
      stock: '',
      categoryId: '',
      subcategoryId: '',
      unitOfMeasure: '',
      keyFeatures: [],
      physicalFeatures: {},
      specifications: {},
      variants: [],
      keywords: '',
      newSpecName: '',
      newSpecValue: '',
      weight: '',
      length: '',
      width: '',
      height: '',
      deliveryMethod: 'Pickup',
      warranty: '',
      returnPolicy: '',
    });
    setInitialProduct(null);
    setCoverImage(null);
    setGalleryImages([]);
    setProductVideo(null);
    setCoverPreview('');
    setGalleryPreviews([]);
    setVideoPreview('');
    setExistingImages([]);
    setGalleryExistingImages([]);
    setRemovedIdx(new Set());
    setCoverImageType('none');
    setVideoType('none');
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  }, [clearDraft]);

  // Load existing product on edit
  useEffect(() => {
    if (mode !== 'edit' || !productId) return;

    let alive = true;
    setLoading(true);

    productApi.getById(productId)
      .then(res => {
        if (!alive) return;
        const product = res.data || {};
        setInitialProduct(product);

        // Extract category and subcategory IDs
        let categoryId = product.categoryId || '';
        let subcategoryId = product.subcategoryId || '';

        // Parse tags data
        const tags = product.tags || {};
        const attributes = tags.attributes || {};
        // Handle variants - with backward compatibility for 'prices' field
        let variants = Array.isArray(tags.variants) ? tags.variants : (Array.isArray(product.variants) ? product.variants : []);
        variants = variants.map(v => {
          if (v.prices && !v.optionDetails) {
            const optionDetails = {};
            Object.entries(v.prices).forEach(([opt, price]) => {
              optionDetails[opt] = { basePrice: price };
            });
            return { ...v, optionDetails };
          }
          return v;
        });

        const logistics = tags.logistics || {};
        const media = tags.media || {};

        // Deeply unwrap multiply-JSON-stringified values (handles triple/quadruple nesting)
        const deepUnwrap = (val) => {
          let current = val;
          for (let i = 0; i < 10; i++) {
            if (typeof current !== 'string') break;
            const t = current.trim();
            if (!(t.startsWith('[') || t.startsWith('{') || t.startsWith('"'))) break;
            try { current = JSON.parse(t); } catch { break; }
          }
          return current;
        };

        // Helper to safely parse JSON, handling any level of stringification
        const safeParseJson = (val, defaultVal) => {
          if (!val) return defaultVal;
          if (typeof val === 'object') return val;
          const result = deepUnwrap(val);
          return (result !== undefined && result !== null) ? result : defaultVal;
        };

        // Handle keyFeatures - deep-unwrap and normalise to a flat string array
        const rawKeyFeatures = product.keyFeatures || tags.keyFeatures;
        let keyFeatures = deepUnwrap(rawKeyFeatures);
        if (Array.isArray(keyFeatures)) {
          keyFeatures = keyFeatures
            .map(item => deepUnwrap(item))
            .flat(Infinity)
            .map(item => String(item).replace(/^["\[\]]+|["\[\]]+$/g, '').trim())
            .filter(Boolean);
        } else if (typeof keyFeatures === 'string' && keyFeatures.includes('\n')) {
          keyFeatures = keyFeatures.split('\n').map(f => f.trim()).filter(Boolean);
        } else if (typeof keyFeatures === 'string') {
          keyFeatures = keyFeatures ? [keyFeatures.replace(/^["\[\]]+|["\[\]]+$/g, '').trim()].filter(Boolean) : [];
        } else if (typeof keyFeatures === 'object' && keyFeatures !== null) {
          keyFeatures = Object.values(keyFeatures).map(v => String(v).trim()).filter(Boolean);
        } else {
          keyFeatures = [];
        }

        // Handle specifications - ensure it's always an object
        let specifications = safeParseJson(product.specifications || tags.specifications, {});
        if (typeof specifications !== 'object' || Array.isArray(specifications)) {
          specifications = {}; // Reset if invalid type
        }

        // Handle physical features/attributes
        // Prioritize product.attributes if storing there, else tags.attributes
        let physicalFeatures = safeParseJson(product.attributes || tags.attributes || {}, {});
        if (typeof physicalFeatures !== 'object' || Array.isArray(physicalFeatures)) {
          physicalFeatures = {};
        }

        // Handle media files
        let coverImage = '';
        let galleryImages = [];
        let videoUrl = '';

        if (product.coverImage) {
          coverImage = product.coverImage;
        }

        if (product.galleryImages) {
          let g = product.galleryImages;
          if (typeof g === 'string') { try { g = JSON.parse(g); } catch (e) { } }
          if (Array.isArray(g)) galleryImages = g;
        }

        if (!coverImage && Array.isArray(product.images) && product.images.length > 0) {
          coverImage = product.images[0];
          if (galleryImages.length === 0) galleryImages = product.images.slice(1);
        }

        if (media.videoUrl) {
          videoUrl = media.videoUrl;
        }

        const formDataToSet = {
          name: product.name || '',
          brand: product.brand || '',
          model: product.model || '',
          condition: product.condition || tags.condition || 'Brand New',
          shortDescription: product.shortDescription || product.description || '',
          fullDescription: product.fullDescription || '',
          basePrice: product.basePrice || '',
          stock: product.stock || '',
          categoryId: String(categoryId || ''),
          subcategoryId: String(subcategoryId || ''),
          unitOfMeasure: product.unitOfMeasure || 'pcs', // Default to 'pcs' if not set
          keyFeatures: keyFeatures,
          physicalFeatures: physicalFeatures,
          specifications: specifications,
          variants: variants.length > 0 ? variants : [], // Ensure it's an array
          keywords: product.keywords || '',
          newSpecName: '',
          newSpecValue: '',
          // Ensure shipping & warranty fields are populated
          weight: product.weight || '',
          length: product.length || '',
          width: product.width || '',
          height: product.height || '',
          deliveryMethod: product.deliveryMethod || 'Pickup',
          deliveryCoverageZones: product.deliveryCoverageZones ? (Array.isArray(product.deliveryCoverageZones) ? product.deliveryCoverageZones.join(', ') : String(product.deliveryCoverageZones)) : '',
          deliveryFeeType: product.deliveryFeeType || (product.logistics?.deliveryFeeType) || 'flat',
          deliveryFee: product.deliveryFee || (product.logistics?.deliveryFee) || 0,
          warranty: product.warranty || '',
          returnPolicy: product.returnPolicy || '',
          // Store category objects for robust display
          category: product.category,
          subcategory: product.subcategory || product.Subcategory,
          Subcategory: product.Subcategory || product.subcategory,
          // Marketing Configuration
          marketingEnabled: product.marketingEnabled || false,
          marketingCommissionType: product.marketingCommissionType || 'flat',
          marketingCommission: product.marketingCommissionType === 'percentage' ? (product.marketingCommissionPercentage || 0) : (product.marketingCommission || 0),
          marketingStartDate: product.marketingStartDate ? new Date(product.marketingStartDate).toISOString().split('T')[0] : '',
          marketingEndDate: product.marketingEndDate ? new Date(product.marketingEndDate).toISOString().split('T')[0] : '',
          marketingDuration: product.marketingDuration || 0
        };

        // If dates are provided, calculate duration for the first time
        if (formDataToSet.marketingStartDate && formDataToSet.marketingEndDate) {
          const start = new Date(formDataToSet.marketingStartDate);
          const end = new Date(formDataToSet.marketingEndDate);
          const diffTime = end.getTime() - start.getTime();
          const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          formDataToSet.marketingDuration = diffDays;
        }

        setFormData(formDataToSet);

        // Debug log to see what we're setting
        console.log('🔍 Edit mode - Setting category and subcategory:', {
          originalCategoryId: categoryId,
          originalSubcategoryId: subcategoryId,
          categoryId: String(categoryId || ''),
          subcategoryId: String(subcategoryId || ''),
          allCategoriesCount: allCategories.length,
          category: allCategories.find(cat =>
            String(cat.id) === String(categoryId) || String(cat._id) === String(categoryId)
          )?.name || 'Not found'
        });


        // Set media states
        setExistingImages(product.images || []);
        setRemovedIdx(new Set());
        setGalleryExistingImages([]); // Reset existing gallery images

        // Handle cover image
        if (coverImage) {
          const coverUrl = resolveImageUrl(coverImage);
          setCoverPreview(coverUrl);
          setCoverImage(coverImage);
          setCoverImageType('existing');
        } else {
          setCoverPreview('');
          setCoverImage(null);
          setCoverImageType('none');
        }

        // Handle gallery images - properly separate existing from new
        let galleryImagesArray = [];
        if (galleryImages.length > 0) {
          galleryImagesArray = galleryImages;
        } else if (Array.isArray(product.images) && product.images.length > 0) {
          // First image is cover, rest are gallery
          galleryImagesArray = product.images.slice(1);
        }

        if (galleryImagesArray.length > 0) {
          setGalleryExistingImages(galleryImagesArray);
          setGalleryImages(galleryImagesArray.map(img => ({
            url: img,
            isExisting: true,
            preview: resolveImageUrl(img)
          })));
          setGalleryPreviews(galleryImagesArray.map(img => resolveImageUrl(img)));
        } else {
          setGalleryExistingImages([]);
          setGalleryImages([]);
          setGalleryPreviews([]);
        }

        // Handle video
        if (videoUrl) {
          setVideoPreview(videoUrl);
          setProductVideo(null);
          setVideoType('existing');
        } else {
          setVideoPreview('');
          setProductVideo(null);
          setVideoType('none');
        }

        // Store original product data for change comparison
        setOriginalProductData({
          name: product.name,
          brand: product.brand,
          model: product.model,
          condition: product.condition || tags.condition || 'Brand New',
          shortDescription: product.shortDescription || product.description || '',
          fullDescription: product.fullDescription || '',
          basePrice: product.basePrice || '',
          stock: product.stock || '',
          categoryId: String(categoryId || ''),
          subcategoryId: String(subcategoryId || ''),
          unitOfMeasure: product.unitOfMeasure || 'pcs',
          keyFeatures: keyFeatures,
          specifications: specifications,
          variants: variants.length > 0 ? variants : [],
          keywords: product.keywords || '',
          weight: product.weight || '',
          length: product.length || '',
          width: product.width || '',
          height: product.height || '',
          deliveryMethod: product.deliveryMethod || 'Pickup',
          warranty: product.warranty || '',
          returnPolicy: product.returnPolicy || '',
          marketingEnabled: product.marketingEnabled || false,
          marketingCommissionType: product.marketingCommissionType || 'flat',
          marketingCommission: product.marketingCommissionType === 'percentage' ? (product.marketingCommissionPercentage || 0) : (product.marketingCommission || 0),
          marketingStartDate: product.marketingStartDate ? new Date(product.marketingStartDate).toISOString().split('T')[0] : '',
          marketingEndDate: product.marketingEndDate ? new Date(product.marketingEndDate).toISOString().split('T')[0] : '',
          marketingDuration: product.marketingDuration || 30
        });

        // Image states will be handled by the next useEffect or separate logic
      })
      .catch(error => {
        console.error('Error loading product:', error);
        toast({
          title: 'Error',
          description: 'Failed to load product data',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false };
  }, [mode, productId, toast, hasUpdated]);

  // Separate useEffect to handle category-dependent initialization
  // This handles the race condition where categories load after product data
  useEffect(() => {
    if (!formData.categoryId || allCategories.length === 0) return;

    const categoryId = formData.categoryId;
    const subcategoryId = formData.subcategoryId;

    const category = allCategories.find(cat =>
      String(cat.id) === String(categoryId) || String(cat._id) === String(categoryId)
    );

    if (category) {
      console.log('[ProductForm] Category found, initializing type and subcategories');
      const subcatList = category.Subcategory || category.subcategories || [];
      const subcategory = subcatList.find(sub =>
        String(sub.id) === String(subcategoryId) || String(sub._id) === String(subcategoryId)
      );

      const detectedType = detectCategoryType(category.name, subcategory?.name || '');
      setCurrentFormType(detectedType);
    } else {
      console.warn('[ProductForm] Category not found in allCategories:', categoryId);
    }
  }, [formData.categoryId, formData.subcategoryId, allCategories]);

  // Function to compare original and updated product data
  const compareProductChanges = (original, updated) => {
    const changes = [];

    // Helper function to compare values
    const hasChanged = (field, oldValue, newValue) => {
      if (field === 'keyFeatures') {
        // Special handling for Key Features to avoid false positives
        const normalizeKeyFeatures = (features) => {
          if (!features) return [];
          if (Array.isArray(features)) {
            return features.map(f => String(f).trim()).filter(Boolean).sort();
          }
          if (typeof features === 'string') {
            return features.split('\n').map(f => String(f).trim()).filter(Boolean).sort();
          }
          return [];
        };

        const normalizedOld = normalizeKeyFeatures(oldValue);
        const normalizedNew = normalizeKeyFeatures(newValue);

        // Only report change if there's an actual difference
        if (normalizedOld.length === 0 && normalizedNew.length === 0) return false;
        return JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew);
      }

      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        // Check if both arrays are empty
        if (oldValue.length === 0 && newValue.length === 0) return false;
        return JSON.stringify(oldValue.sort()) !== JSON.stringify(newValue.sort());
      }
      if (typeof oldValue === 'object' && typeof newValue === 'object' && oldValue !== null && newValue !== null) {
        // Check if both objects are empty
        const oldKeys = Object.keys(oldValue);
        const newKeys = Object.keys(newValue);
        if (oldKeys.length === 0 && newKeys.length === 0) return false;
        return JSON.stringify(oldValue) !== JSON.stringify(newValue);
      }
      // Handle null/undefined cases
      const oldStr = String(oldValue || '');
      const newStr = String(newValue || '');
      // Don't report change if both are empty
      if (!oldStr && !newStr) return false;
      return oldStr !== newStr;
    };

    // Helper function to get field display name
    const getFieldName = (field) => {
      const fieldNames = {
        name: 'Product Name',
        brand: 'Brand',
        model: 'Model',
        condition: 'Condition',
        shortDescription: 'Short Description',
        fullDescription: 'Full Description',
        basePrice: 'Base Price',
        stock: 'Stock Quantity',
        categoryId: 'Category',
        subcategoryId: 'Subcategory',
        unitOfMeasure: 'Unit of Measure',
        keyFeatures: 'Key Features',
        physicalFeatures: 'Physical Features',
        specifications: 'Specifications',
        variants: 'Product Variants',
        keywords: 'Keywords',
        weight: 'Weight',
        length: 'Length',
        width: 'Width',
        height: 'Height',
        deliveryMethod: 'Delivery Method',
        deliveryCoverageZones: 'Delivery Coverage Zones',
        deliveryFeeType: 'Delivery Fee Type',
        deliveryFee: 'Delivery Fee',
        warranty: 'Warranty',
        returnPolicy: 'Return Policy'
      };
      return fieldNames[field] || field;
    };

    // Helper function to format value for display
    const formatValue = (value, field) => {
      if (field === 'categoryId' || field === 'subcategoryId') {
        // Convert IDs to names
        if (field === 'categoryId') {
          const category = allCategories.find(cat =>
            String(cat.id) === String(value) || String(cat._id) === String(value)
          );
          return category ? `${category.emoji} ${category.name}` : value || 'Not selected';
        } else if (field === 'subcategoryId') {
          // Find the category first to get the right subcategories
          const currentCategoryId = formData.categoryId || original.categoryId;
          const category = allCategories.find(cat =>
            String(cat.id) === String(currentCategoryId) || String(cat._id) === String(currentCategoryId)
          );
          if (category && (category.Subcategory || category.subcategories)) {
            const subcategories = category.Subcategory || category.subcategories || [];
            const subcategory = subcategories.find(sub =>
              String(sub.id) === String(value) || String(sub._id) === String(value)
            );
            return subcategory ? `${subcategory.emoji} ${subcategory.name}` : value || 'Not selected';
          }
          // Fallback: search all subcategories
          const allSubcategories = allCategories.flatMap(cat => cat.Subcategory || cat.subcategories || []);
          const subcategory = allSubcategories.find(sub =>
            String(sub.id) === String(value) || String(sub._id) === String(value)
          );
          return subcategory ? `${subcategory.emoji} ${subcategory.name}` : value || 'Not selected';
        }
      }

      if (Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : 'None';
      }
      if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value);
        if (entries.length > 0) {
          return entries.map(([key, val]) => `${key}: ${val}`).join('; ');
        }
        return 'None';
      }
      return value || 'Not set';
    };

    // Compare each field
    Object.keys(updated).forEach(field => {
      if (hasChanged(field, original[field], updated[field])) {
        changes.push({
          field: getFieldName(field),
          before: formatValue(original[field], field),
          after: formatValue(updated[field], field)
        });
      }
    });

    return changes;
  };

  // Auto-save when form data changes (both create and edit modes)
  useEffect(() => {
    if (!initialRender.current) {
      saveDraft(formData);
    }
  }, [formData, saveDraft]);

  // Handle beforeunload to warn about unsaved changes
  useEffect(() => {
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
  }, [formData]);

  // Mark initial render as complete
  useEffect(() => {
    initialRender.current = false;
  }, []);

  // Clean up blob URLs when component unmounts or when coverPreview changes
  useEffect(() => {
    return () => {
      // Clean up blob URLs to prevent memory leaks
      if (coverPreview && coverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
      galleryPreviews.forEach(preview => {
        if (preview && preview.startsWith('blob:')) {
          URL.revokeObjectURL(preview);
        }
      });
      if (videoPreview && videoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreview);
      }
    };
  }, [coverPreview, galleryPreviews, videoPreview]);

  // Debug effect to track cover image state changes
  useEffect(() => {
    if (mode === 'edit') {
      console.log('Cover image state:', {
        coverImageType,
        coverImage: coverImage instanceof File ? `File: ${coverImage.name}` : coverImage,
        coverPreview: coverPreview?.substring(0, 50) + '...'
      });
    }
  }, [coverImageType, coverImage, coverPreview, mode]);

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

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };



  // Handle category change
  const handleCategoryChange = (value) => {
    console.log('[DEBUG] [ProductForm] handleCategoryChange FIRED with value:', value);
    console.log('[DEBUG] [ProductForm] Current formData.categoryId:', formData.categoryId);
    console.log('[DEBUG] [ProductForm] Current allCategories length:', allCategories?.length);

    // Get the current product name from form data if available
    const currentProductName = formData.name || productName || '';

    setFormData(prev => {
      const newData = {
        ...prev,
        categoryId: value,
        // Reset subcategory when category changes
        subcategoryId: ''
      };
      console.log('📝 [ProductForm] Setting local formData state:', newData);
      return newData;
    });

    // Enhanced category detection and form type switching
    const category = findCategoryById(value);
    console.log('📝 [ProductForm] Category lookup result:', category);

    if (category) {
      const detectedType = detectCategoryType(category.name, '');
      console.log('🔄 [ProductForm] SWITCHING form type from', currentFormType, 'to', detectedType);

      setCurrentFormType(detectedType);

      // Preserve the product name when switching form types
      if (currentProductName) {
        setFormData(prev => ({
          ...prev,
          name: currentProductName
        }));
      }

      // Show notification for form type change
      if (detectedType === CATEGORY_TYPES.FOOD_DRINKS) {
        toast({
          title: '🍽️ Food & Drinks Form',
          description: `Switched to food & drinks form for "${category.name}"`,
        });
      } else if (detectedType === CATEGORY_TYPES.SERVICES) {
        toast({
          title: '🛠️ Services Form',
          description: `Switched to services form for "${category.name}"`,
        });
      } else {
        toast({
          title: '📦 Regular Product Form',
          description: `Using regular form for "${category.name}"`,
        });
      }
    } else {
      console.warn('⚠️ [ProductForm] CRITICAL: Category not found for ID:', value, '. Available categories:', allCategories.map(c => `${c.id}:${c.name}`));
    }
  };

  // Handle subcategory change
  const handleSubcategoryChange = (value) => {
    console.log('📝 [ProductForm] handleSubcategoryChange TRIGGERED with value:', value);

    setFormData(prev => ({
      ...prev,
      subcategoryId: value
    }));

    // Also trigger form type detection on subcategory change
    const category = findCategoryById(formData.categoryId);
    const subcategory = findSubcategoryById(category, value);

    console.log('📝 [ProductForm] Subcategory detection:', { category: category?.name, subcategory: subcategory?.name });

    if (category || subcategory) {
      const detectedType = detectCategoryType(category?.name || '', subcategory?.name || '');
      console.log('🔄 [ProductForm] SWITCHING form type (via subcat) from', currentFormType, 'to', detectedType);
      setCurrentFormType(detectedType);
    }
  };

  // Handle cover image change
  const handleCoverImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Revoke the previous blob URL if it was a file upload
      if (coverImage instanceof File && coverPreview) {
        URL.revokeObjectURL(coverPreview);
      }

      const newPreviewUrl = URL.createObjectURL(file);

      // Update all state at once to ensure consistency
      setCoverImage(file);
      setCoverPreview(newPreviewUrl);
      setCoverImageType('file');
    }
  };

  // Remove cover image
  const removeCoverImage = () => {
    // Revoke the current preview URL if it's a blob (file upload)
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }

    // Reset cover image state
    if (coverImageType === 'existing' && typeof coverImage === 'string') {
      // Keep the existing image URL but mark as removed
      setCoverImage(coverImage);
      setCoverPreview('');
      setCoverImageType('none');
    } else {
      // Clear everything for new uploads
      setCoverImage(null);
      setCoverPreview('');
      setCoverImageType('none');
    }
  };

  // Handle gallery images change
  const handleGalleryImagesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      const availableSlots = Math.max(0, 5 - galleryImages.filter(img => img.isExisting !== true).length);
      const newImages = files.slice(0, availableSlots);

      const newImageObjects = newImages.map(file => ({
        file: file,
        isExisting: false,
        preview: URL.createObjectURL(file)
      }));

      setGalleryImages(prev => [...prev, ...newImageObjects]);

      // Create previews
      const newPreviews = newImages.map(file => URL.createObjectURL(file));
      setGalleryPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  // Remove a gallery image
  const removeGalleryImage = (index) => {
    const imageToRemove = galleryImages[index];

    // Revoke blob URL if it's a file upload
    if (imageToRemove && !imageToRemove.isExisting && imageToRemove.preview && imageToRemove.preview.startsWith('blob:')) {
      URL.revokeObjectURL(imageToRemove.preview);
    }

    if (imageToRemove && imageToRemove.isExisting) {
      // If it's an existing image, track it for removal on server
      setRemovedIdx(prev => {
        const newSet = new Set(prev);
        newSet.add(index);
        return newSet;
      });
      // Update gallery existing images array
      const nonExistingImageCount = galleryImages.slice(0, index).filter(img => !img.isExisting).length;
      setGalleryExistingImages(prev =>
        prev.filter((_, i) => i !== index - nonExistingImageCount)
      );
    }

    setGalleryImages(prev => prev.filter((_, i) => i !== index));
    setGalleryPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Restore a removed existing gallery image
  const restoreGalleryImage = (index) => {
    const imageToRestore = galleryImages[index];

    setRemovedIdx(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });

    // Re-add to gallery existing images
    if (imageToRestore && imageToRestore.url) {
      const nonExistingImageCountBefore = galleryImages.slice(0, index).filter(img => !img.isExisting).length;
      setGalleryExistingImages(prev => {
        const newArray = [...prev];
        newArray.splice(index - nonExistingImageCountBefore, 0, imageToRestore.url);
        return newArray;
      });
    }
  };

  // Handle video change
  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProductVideo(file);
      setVideoPreview(URL.createObjectURL(file));
      setVideoType('file');
    }
  };

  // Remove video
  const removeVideo = () => {
    setProductVideo(null);
    setVideoPreview('');
    setVideoType('none');
  };

  // Handle adding a new feature
  const handleAddFeature = () => {
    if (formData.newFeature?.trim()) {
      setFormData(prev => ({
        ...prev,
        keyFeatures: [...prev.keyFeatures, formData.newFeature.trim()],
        newFeature: ''
      }));
    }
  };

  // Handle removing a feature
  const handleRemoveFeature = (index) => {
    setFormData(prev => ({
      ...prev,
      keyFeatures: prev.keyFeatures.filter((_, i) => i !== index)
    }));
  };

  // Handle Enter key press in the feature input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddFeature();
    }
  };

  // Check for duplicate products by seller
  const checkDuplicate = async () => {
    const categoryContext = formData.categoryId || formData.subcategoryId;
    if (!formData.name || !categoryContext) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in product name and category first',
        variant: 'default',
      });
      return;
    }

    try {
      const params = {
        name: formData.name,
        categoryId: categoryContext
      };
      if (mode === 'edit' && productId) params.excludeId = productId;

      const response = await productApi.checkDuplicate(params);

      if (response.data?.duplicate) {
        toast({
          title: 'Duplicate Found',
          description: 'You already have a product with this name in the selected category',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'No Duplicates',
          description: 'Product name is available for this category',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Duplicate check failed:', error);
      toast({
        title: 'Check Failed',
        description: 'Unable to check for duplicates',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    // In edit mode, detect changes and show dialog
    if (mode === 'edit' && originalProductData) {
      const detectedChanges = compareProductChanges(originalProductData, formData);
      if (detectedChanges.length > 0) {
        setChanges(detectedChanges);
        setShowChangesDialog(true);
        return;
      } else {
        toast({
          title: 'No Changes',
          description: 'No changes detected to save.',
        });
        return;
      }
    }

    // For create mode or if changes confirmed, save directly
    // For create mode or if changes confirmed, save directly
    await performSave(false);
  };

  const isSavingRef = React.useRef(false);
  const performSave = async (isDraft = false) => {
    if (isSavingRef.current) return; // prevent concurrent saves
    isSavingRef.current = true;
    setLoading(true);
    console.log('[ProductForm] performSave formData:', {
      keyFeatures: formData.keyFeatures,
      specifications: formData.specifications,
      physicalFeatures: formData.physicalFeatures
    });

    // Validate required fields (skip strict validation for drafts)
    if (!isDraft) {
      const missing = [];
      if (!formData.name?.trim()) missing.push('Name');
      if (!formData.basePrice || isNaN(parseFloat(formData.basePrice))) missing.push('Base Price');
      if (!formData.stock || isNaN(parseInt(formData.stock, 10))) missing.push('Stock');
      if (!formData.shortDescription?.trim()) missing.push('Short Description');
      if (!formData.fullDescription?.trim()) missing.push('Full Description');
      if (!formData.unitOfMeasure?.trim()) missing.push('Unit of Measure');
      if (!formData.categoryId && !formData.subcategoryId) missing.push('Category');

      if (missing.length > 0) {
        const msg = `Please provide the following required fields: ${missing.join(', ')}.`;
        toast({
          title: 'Validation Error',
          description: msg,
          variant: 'destructive',
        });
        setErrorMsg(msg);
        setLoading(false);
        isSavingRef.current = false;
        return;
      }

      // Validate media requirements only for new products
      if (mode === 'create') {
        if (!coverImage) {
          toast({
            title: 'Validation Error',
            description: 'Please upload a cover image',
            variant: 'destructive',
          });
          setErrorMsg('Please upload a cover image.');
          setLoading(false);
          isSavingRef.current = false;
          return;
        }

        const totalGalleryCount = galleryImages.length;
        if (totalGalleryCount < 2) {
          toast({
            title: 'Missing Images',
            description: 'Please add at least 2 gallery images.',
            variant: 'destructive',
          });
          setErrorMsg('Please add at least 2 gallery images.');
          setLoading(false);
          isSavingRef.current = false;
          return;
        }

        if (totalGalleryCount > 5) {
          toast({
            title: 'Too Many Images',
            description: 'You can add up to 5 gallery images.',
            variant: 'destructive',
          });
          setErrorMsg('You can add up to 5 gallery images.');
          setLoading(false);
          isSavingRef.current = false;
          return;
        }
      }
    }

    try {
      // Check for duplicates automatically before submission (skip if saving as draft)
      if (!isDraft) {
        const duplicateParams = {
          name: formData.name,
          categoryId: formData.categoryId || formData.subcategoryId
        };
        if (mode === 'edit' && productId) duplicateParams.excludeId = productId;

        const duplicateResponse = await productApi.checkDuplicate(duplicateParams);
        if (duplicateResponse.data?.duplicate) {
          toast({
            title: 'Duplicate Product',
            description: 'You already have a product with this name in the selected category. Please choose a different name or category.',
            variant: 'destructive',
          });
          setErrorMsg('You already have a product with this name in the selected category. Please choose a different name or category.');
          setLoading(false);
          isSavingRef.current = false;
          return;
        }
      }

      // Helper for client-side image compression
      const compressImage = (file, maxWidth = 1280, maxHeight = 1280, quality = 0.8) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onerror = () => {
            console.warn('[compressImage] FileReader failed, using original file:', file.name);
            resolve(file); // fallback to original
          };
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onerror = () => {
              console.warn('[compressImage] Image failed to load, using original file:', file.name);
              resolve(file); // fallback to original
            };
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
                if (!blob) {
                  // canvas.toBlob returned null — fall back to original file
                  console.warn('[compressImage] canvas.toBlob returned null, using original file:', file.name, `(${(file.size / 1024).toFixed(1)} KB)`);
                  resolve(file);
                  return;
                }
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                console.log(`[compressImage] ✅ ${file.name}: ${(file.size / 1024).toFixed(1)} KB → ${(compressedFile.size / 1024).toFixed(1)} KB`);
                resolve(compressedFile);
              }, 'image/jpeg', quality);
            };
          };
        });
      };

      // Handle form submission
      const formDataToSend = new FormData();

      // Handle cover image
      if (coverImageType === 'file' && coverImage instanceof File) {
        // New cover image uploaded
        console.log('Compressing and adding cover image');
        const compressedCover = await compressImage(coverImage);
        formDataToSend.append('coverImage', compressedCover, coverImage.name);
      } else if (mode === 'edit' && coverImageType === 'existing' && typeof coverImage === 'string') {
        // Keep existing cover image in edit mode
        formDataToSend.append('existingCoverImage', coverImage);
      } else if (mode === 'edit' && coverImageType === 'none') {
        // Remove existing cover image
        formDataToSend.append('removeCoverImage', 'true');
      }

      // Handle gallery images
      const newGalleryFiles = galleryImages.filter(img => img.isExisting === false).map(img => img.file);
      const existingGalleryUrls = galleryImages.filter(img => img.isExisting === true && !removedIdx.has(galleryImages.indexOf(img))).map(img => img.url);

      // Add new gallery files with compression
      for (const file of newGalleryFiles) {
        console.log('Compressing and adding gallery image', file.name);
        const compressedFile = await compressImage(file);
        formDataToSend.append('galleryImages', compressedFile, file.name);
      }

      // In edit mode, send existing gallery images that should be kept
      if (mode === 'edit' && existingGalleryUrls.length > 0) {
        formDataToSend.append('existingGalleryImages', JSON.stringify(existingGalleryUrls));
      }

      // In edit mode, send removed gallery image indices
      if (mode === 'edit' && removedIdx.size > 0) {
        formDataToSend.append('removedGalleryIndices', JSON.stringify(Array.from(removedIdx)));
      }

      // Handle video
      if (videoType === 'file' && productVideo instanceof File) {
        formDataToSend.append('video', productVideo);
      } else if (mode === 'edit' && videoType === 'existing') {
        // Keep existing video in edit mode
        formDataToSend.append('existingVideo', videoPreview);
      } else if (mode === 'edit' && videoType === 'none') {
        // Remove existing video
        formDataToSend.append('removeVideo', 'true');
      }

      // Add all product data fields to FormData (ALWAYS, not just when files exist)
      // Tell the backend this is a draft so it skips image/required-field validation
      if (isDraft) formDataToSend.append('draft', 'true');
      // Basic fields
      formDataToSend.append('name', formData.name || '');
      formDataToSend.append('brand', formData.brand || '');
      formDataToSend.append('model', formData.model || '');
      formDataToSend.append('shortDescription', formData.shortDescription || '');
      formDataToSend.append('fullDescription', formData.fullDescription || '');
      formDataToSend.append('basePrice', formData.basePrice || '');
      if (formData.displayPrice && parseFloat(formData.displayPrice) > 0) {
        formDataToSend.append('displayPrice', formData.displayPrice);
      }
      formDataToSend.append('discountPercentage', formData.discountPercentage || 0);
      formDataToSend.append('discountPrice', formData.discountPrice || formData.basePrice || '');
      formDataToSend.append('stock', formData.stock || '');
      formDataToSend.append('unitOfMeasure', formData.unitOfMeasure || 'pcs');
      formDataToSend.append('keywords', formData.keywords || '');

      // Category fields
      if (formData.categoryId) formDataToSend.append('categoryId', formData.categoryId);
      if (formData.subcategoryId !== undefined && formData.subcategoryId !== null && formData.subcategoryId !== '') {
        formDataToSend.append('subcategoryId', formData.subcategoryId);
      }

      // Shipping & Warranty fields
      if (formData.weight !== undefined && formData.weight !== null && formData.weight !== '') formDataToSend.append('weight', formData.weight);
      if (formData.length !== undefined && formData.length !== null && formData.length !== '') formDataToSend.append('length', formData.length);
      if (formData.width !== undefined && formData.width !== null && formData.width !== '') formDataToSend.append('width', formData.width);
      if (formData.height !== undefined && formData.height !== null && formData.height !== '') formDataToSend.append('height', formData.height);
      if (formData.deliveryMethod) formDataToSend.append('deliveryMethod', formData.deliveryMethod);
      if (formData.warranty) formDataToSend.append('warranty', formData.warranty);
      if (formData.returnPolicy) formDataToSend.append('returnPolicy', formData.returnPolicy);
      // JSON fields
      if (formData.keyFeatures) {
        let featuresToSend = formData.keyFeatures;
        // Convert string input (from textarea) to array
        if (typeof featuresToSend === 'string') {
          featuresToSend = featuresToSend.split('\n').map(f => f.trim()).filter(Boolean);
        }

        if (Array.isArray(featuresToSend) && featuresToSend.length > 0) {
          formDataToSend.append('keyFeatures', JSON.stringify(featuresToSend));
        }
      }
      if (formData.physicalFeatures && Object.keys(formData.physicalFeatures).length > 0) {
        formDataToSend.append('physicalFeatures', JSON.stringify(formData.physicalFeatures));
      }
      if (formData.specifications && Object.keys(formData.specifications).length > 0) {
        formDataToSend.append('specifications', JSON.stringify(formData.specifications));
      }
      if (formData.variants && formData.variants.length > 0) {
        formDataToSend.append('variants', JSON.stringify(formData.variants));
      }

      // Additional fields
      if (formData.sku) formDataToSend.append('sku', formData.sku);
      if (formData.barcode) formDataToSend.append('barcode', formData.barcode);
      if (formData.lowStockThreshold !== undefined && formData.lowStockThreshold !== null && formData.lowStockThreshold !== '') {
        formDataToSend.append('lowStockThreshold', formData.lowStockThreshold);
      }
      if (formData.compareAtPrice !== undefined && formData.compareAtPrice !== null && formData.compareAtPrice !== '') {
        formDataToSend.append('compareAtPrice', formData.compareAtPrice);
      }
      if (formData.cost !== undefined && formData.cost !== null && formData.cost !== '') {
        formDataToSend.append('cost', formData.cost);
      }

      // SEO fields
      if (formData.metaTitle) formDataToSend.append('metaTitle', formData.metaTitle);
      if (formData.metaDescription) formDataToSend.append('metaDescription', formData.metaDescription);
      if (formData.metaKeywords) formDataToSend.append('metaKeywords', formData.metaKeywords);

      // Delivery fields
      if (formData.deliveryFee !== undefined && formData.deliveryFee !== null && formData.deliveryFee !== '') formDataToSend.append('deliveryFee', formData.deliveryFee);
      if (formData.deliveryFeeType) formDataToSend.append('deliveryFeeType', formData.deliveryFeeType);
      if (formData.deliveryCoverageZones) {
        let zones = formData.deliveryCoverageZones;
        // If already an array, use it directly; if string, split by comma
        if (!Array.isArray(zones)) {
          zones = String(zones).split(',').map(z => z.trim()).filter(Boolean);
        } else {
          zones = zones.map(z => String(z).trim()).filter(Boolean);
        }
        formDataToSend.append('deliveryCoverageZones', JSON.stringify(zones));
      }
      // Marketing fields
      if (formData.marketingEnabled !== undefined) formDataToSend.append('marketingEnabled', formData.marketingEnabled);
      if (formData.marketingCommission) formDataToSend.append('marketingCommission', formData.marketingCommission);
      if (formData.marketingCommissionType) formDataToSend.append('marketingCommissionType', formData.marketingCommissionType);

      // Featured flag
      if (formData.featured !== undefined) formDataToSend.append('featured', formData.featured);

      // Flash sale fields
      if (formData.isFlashSale !== undefined) formDataToSend.append('isFlashSale', formData.isFlashSale);
      if (formData.flashSalePrice) formDataToSend.append('flashSalePrice', formData.flashSalePrice);
      if (formData.flashSaleStart) formDataToSend.append('flashSaleStart', formData.flashSaleStart);
      if (formData.flashSaleEnd) formDataToSend.append('flashSaleEnd', formData.flashSaleEnd);

      // Digital product fields
      if (formData.isDigital !== undefined) formDataToSend.append('isDigital', formData.isDigital);
      if (formData.downloadUrl) formDataToSend.append('downloadUrl', formData.downloadUrl);

      // DEBUG: log every field in FormData before sending
      console.log('📦 [ProductForm] FormData entries being sent:');
      for (const [key, value] of formDataToSend.entries()) {
        if (value instanceof File) {
          console.log(`  ${key}: [File] ${value.name} (${(value.size / 1024).toFixed(1)} KB)`);
        } else {
          console.log(`  ${key}: "${value}"`);
        }
      }

      let response;
      if (mode === 'edit' && productId) {
        // Update existing product
        console.log('Updating product with ID:', productId);
        console.log('FormData to send:', formDataToSend);
        response = await productApi.update(productId, formDataToSend);
        console.log('Update response:', response);
        toast({
          title: 'Success',
          description: 'Product updated successfully',
        });
      } else {
        // Create new product
        console.log('Creating new product');
        response = await productApi.create(formDataToSend);
        console.log('Create response:', response);

        // Capture the created product to enable "View" button
        if (response.data && response.data.product) {
          setSavedProduct(response.data.product);
        } else if (response.data) {
          // Fallback if structure is flat (though controller sends { product: ... })
          setSavedProduct(response.data);
        }

        toast({
          title: 'Success',
          description: 'Product created successfully',
        });
      }

      setModalConfig({
        type: 'success',
        title: mode === 'edit' ? 'Product Updated!' : 'Product Created!',
        description: mode === 'edit' ? 'Your changes have been saved successfully.' : 'Your product has been created successfully and is awaiting admin approval.',
        onConfirm: () => {
          if (mode !== 'edit') {
            navigate('/seller/products');
          }
          setShowModal(false); // Close the modal
        }
      });
      setShowModal(true);
      clearDraft();

      if (mode === 'edit') {
        setOriginalProductData({ ...formData });
        setHasUpdated(prev => !prev);
      }

    } catch (error) {
      console.error('Error saving product:', error);

      let errorMessage = 'Failed to save product';
      if (error.response?.data?.message || error.response?.data?.error) {
        errorMessage = error.response.data.message || error.response.data.error;
        
        // Handle validation details
        const missingFields = error.response.data?.details?.fields || error.response.data?.missing;
        if (missingFields && Array.isArray(missingFields) && missingFields.length > 0) {
          errorMessage += `: Missing ${missingFields.join(', ')}`;
        } 
        else if (error.response.data?.errors && Array.isArray(error.response.data.errors)) {
          const fieldErrors = error.response.data.errors.map(e => e.field || e.path).filter(Boolean);
          if (fieldErrors.length > 0) {
            errorMessage += `: Invalid ${[...new Set(fieldErrors)].join(', ')}`;
          }
        }
      }

      // Set and show error dialog
      setModalConfig({
        type: 'error',
        title: 'Error Saving Product',
        description: errorMessage,
        onConfirm: () => setShowModal(false) // Close the modal
      });
      setErrorMsg(errorMessage);
      setShowModal(true);

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      isSavingRef.current = false;
    }
  };

  // Handle removing existing images in edit mode
  const toggleRemoveExisting = (idx) => {
    setRemovedIdx(prev => {
      const copy = new Set(prev);
      if (copy.has(idx)) copy.delete(idx);
      else copy.add(idx);
      return copy;
    });
  };

  // Dynamic attribute schema based on category name
  useEffect(() => {
    const cat = allCategories.find(c => String(c.id) === String(formData.categoryId));
    const name = (cat?.name || '').toLowerCase();
    let schema = [];
    if (name.includes('food')) {
      schema = [
        { key: 'ingredients', label: 'Ingredients', placeholder: 'List ingredients' },
        { key: 'servingSize', label: 'Serving Size', placeholder: 'e.g., 250g' },
        { key: 'expiry', label: 'Expiry Time', placeholder: 'e.g., 6 months' },
      ];
    } else if (name.includes('electronic') || name.includes('electronics')) {
      schema = [
        { key: 'brand', label: 'Brand', placeholder: 'e.g., Samsung' },
        { key: 'model', label: 'Model', placeholder: 'e.g., Galaxy A15' },
        { key: 'warranty', label: 'Warranty', placeholder: 'e.g., 12 months' },
        { key: 'specs', label: 'Specs', placeholder: 'e.g., 8GB RAM, 128GB' },
      ];
    } else {
      schema = [];
    }
    // Note: This schema is used for dynamic attributes, but we're keeping it for compatibility
  }, [formData.categoryId, allCategories]);

  return (
    <div className="px-3 py-4 sm:p-4 md:p-6 w-auto overflow-x-hidden mx-2 sm:mx-0">
      {mode === 'edit' && (
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => navigate('/seller/products')}
            className="flex items-center gap-2 border-gray-200 text-gray-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Products
          </Button>
        </div>
      )}

      {(loading && mode === 'edit') ? (
        <div className="flex items-center justify-center p-12 text-gray-500">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3"></div>
          Loading product details...
        </div>
      ) : (
        <>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight mb-6">{mode === 'edit' ? 'Edit Product' : 'Create Product'}</h1>

          {/* Smart Form Type Indicator */}
          {(currentFormType === CATEGORY_TYPES.FOOD_DRINKS || currentFormType === CATEGORY_TYPES.SERVICES) && (
            <div className={`mb-6 p-4 rounded-lg border-2 ${getFormTypeInfo().borderColor} ${getFormTypeInfo().bgColor} animate-pulse`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{getFormTypeInfo().title.split(' ')[0]}</span>
                    <div>
                      <h3 className={`text-lg font-semibold text-${getFormTypeInfo().color}-900`}>
                        {getFormTypeInfo().title.split(' ').slice(1).join(' ')}
                      </h3>
                      <p className={`text-sm text-${getFormTypeInfo().color}-700`}>
                        {getFormTypeInfo().description}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDebugInfo(!showDebugInfo)}
                  className={`px-3 py-1 text-xs rounded-full border border-${getFormTypeInfo().color}-300 bg-${getFormTypeInfo().color}-100 text-${getFormTypeInfo().color}-700 hover:bg-${getFormTypeInfo().color}-200 transition-colors`}
                >
                  {showDebugInfo ? 'Hide Debug' : 'Show Debug'}
                </button>
              </div>
            </div>
          )}

          {/* Debug Information Panel */}
          {showDebugInfo && (
            <div className="mb-6 p-4 bg-gray-100 border border-gray-300 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">🔧 Debug Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="font-medium text-gray-700">Current Form Type:</span>
                  <div className="text-gray-600">{currentFormType}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Selected Category ID:</span>
                  <div className="text-gray-600">{formData.categoryId || 'None'}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Selected Subcategory ID:</span>
                  <div className="text-gray-600">{formData.subcategoryId || 'None'}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Category Name:</span>
                  <div className="text-gray-600">{getCategoryName(formData.categoryId) || 'None'}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Subcategory Name:</span>
                  <div className="text-gray-600">{getSubcategoryName(formData.categoryId, formData.subcategoryId) || 'None'}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Form Mode:</span>
                  <div className="text-gray-600">{mode === 'edit' ? 'Edit' : 'Create'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Specialized Forms Section */}
          <div className="mb-8">
            {currentFormType === CATEGORY_TYPES.FOOD_DRINKS ? (
              <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                <FastFoodForm
                  onSuccess={handleFastFoodSuccess}
                  onCancel={() => navigate('/seller/products')}
                  id={productId}
                  mode={mode}
                  product={{
                    ...initialProduct,
                    ...formData,
                    name: formData.name || productName || initialProduct?.name || ''
                  }}
                  isSellerContext={true}
                  apiType="product"
                />
              </div>
            ) : currentFormType === CATEGORY_TYPES.SERVICES ? (
              <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
                <ServiceForm
                  onSuccess={() => {
                    toast({
                      title: 'Success',
                      description: mode === 'edit' ? 'Service updated successfully' : 'Service created successfully',
                    });
                    navigate('/seller/products?tab=pending');
                  }}
                  onCancel={() => navigate('/seller/products')}
                  initialData={{
                    ...initialProduct,
                    ...formData,
                    title: formData.name || productName || initialProduct?.title || ''
                  }}
                  isEditing={mode === 'edit'}
                  mode={mode}
                />
              </div>
            ) : (
              /* Standard Product Form - always shown for regular catalog items */
              <form onSubmit={handleSubmit} className="space-y-6">
                {errorMsg && (
                  <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200">
                    {errorMsg}
                  </div>
                )}

                {/* Product Name */}
                <div>
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name || ''}
                    onChange={handleChange}
                    placeholder="Enter product name"
                    required
                    maxLength={20}
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-[10px] text-gray-500 font-medium">Character limit for cleaner card display</p>
                    <p className={`text-[10px] font-bold ${formData.name?.length >= 18 ? 'text-red-500' : 'text-gray-500'}`}>
                      {formData.name?.length || 0}/20
                    </p>
                  </div>
                </div>

                {/* Category and Subcategory - Same Line */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="categoryId">Category *</Label>
                    <select
                      id="categoryId"
                      name="categoryId"
                      value={formData.categoryId || ''}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      required
                      className="w-full h-10 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 hover:bg-blue-100 transition-colors"
                    >
                      <option value="">Select category</option>
                      {(filteredCategories || []).map(cat => (
                        <option key={cat.id || cat._id} value={String(cat.id || cat._id)}>
                          {cat.emoji} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="subcategoryId">Subcategory *</Label>
                    <select
                      id="subcategoryId"
                      name="subcategoryId"
                      value={formData.subcategoryId || ''}
                      onChange={(e) => handleSubcategoryChange(e.target.value)}
                      disabled={!formData.categoryId}
                      required
                      className="w-full h-10 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select subcategory</option>
                      {getSubcategoriesByCategory(formData.categoryId).map(sub => (
                        <option key={sub.id || sub._id} value={String(sub.id || sub._id)}>
                          {sub.emoji} {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Brand and Model - Same Line */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Input
                      id="brand"
                      name="brand"
                      value={formData.brand}
                      onChange={handleChange}
                      placeholder="Enter brand name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="model">Model</Label>
                    <Input
                      id="model"
                      name="model"
                      value={formData.model}
                      onChange={handleChange}
                      placeholder="Enter model"
                    />
                  </div>
                </div>

                {/* Keywords */}
                <div>
                  <Label htmlFor="keywords">Keywords *</Label>
                  <Input
                    id="keywords"
                    name="keywords"
                    value={formData.keywords}
                    onChange={handleChange}
                    placeholder="Comma-separated keywords"
                    required
                  />
                </div>

                {/* Unit of Measure, Stock, and Pricing */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="unitOfMeasure">Unit of Measure *</Label>
                    <Select
                      value={formData.unitOfMeasure || 'pcs'}
                      onValueChange={(value) => {
                        if (value === '__more__') {
                          setShowAllUom(true);
                          const key = `uom_expanded_seller_${formData.categoryId || 'none'}`;
                          try { localStorage.setItem(key, 'true'); } catch (_) { }
                          return;
                        }
                        handleFieldChange('unitOfMeasure', value);
                      }}
                      required
                    >
                      <SelectTrigger className="bg-blue-50 border-blue-200 hover:bg-blue-100">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent className="bg-blue-50 border border-blue-200">
                        {(() => {
                          const cat = allCategories.find(c => String(c.id) === String(formData.categoryId));
                          const name = (cat?.name || '').toLowerCase();
                          let rec = [];
                          if (name.includes('food') || name.includes('beverage')) rec = UOM_GROUPS['Food & Beverages'];
                          else if (name.includes('fashion') || name.includes('apparel') || name.includes('clothing')) rec = UOM_GROUPS['Fashion & Apparel'];
                          else if (name.includes('electronic')) rec = UOM_GROUPS['Electronics'];
                          else if (name.includes('cosmetic') || name.includes('health') || name.includes('beauty')) rec = UOM_GROUPS['Cosmetics & Health'];
                          else if (name.includes('home') || name.includes('office')) rec = UOM_GROUPS['Home & Office'];
                          else rec = UOM_GROUPS['General Retail / Consumer Goods'];

                          const seen = new Set();
                          const items = [];
                          // Recommended units first
                          rec.forEach(u => {
                            if (!seen.has(u)) {
                              seen.add(u);
                              items.push(<SelectItem key={`rec_${u}`} value={u}>{UOM_LABELS[u] || u}</SelectItem>);
                            }
                          });

                          if (!showAllUom) {
                            items.push(<SelectItem key="__more__" value="__more__">More...</SelectItem>);
                            return items;
                          }

                          const allUnits = Array.from(new Set(Object.values(UOM_GROUPS).flat()));
                          allUnits.forEach(u => {
                            if (!seen.has(u)) {
                              seen.add(u);
                              items.push(<SelectItem key={`all_${u}`} value={u}>{UOM_LABELS[u] || u}</SelectItem>);
                            }
                          });
                          return items;
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="stock">
                      Stock *
                      {mode === 'edit' && (
                        <span className="ml-2 text-xs text-gray-500">Current: {formData.stock || '—'}</span>
                      )}
                    </Label>
                    <Input
                      id="stock"
                      name="stock"
                      type="number"
                      value={formData.stock}
                      onChange={handleChange}
                      placeholder="Enter stock quantity"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="basePrice">
                      Base Price (KES) *
                      {mode === 'edit' && (
                        <span className="ml-2 text-xs text-gray-500">Current: {formData.basePrice || '—'}</span>
                      )}
                    </Label>
                    <Input
                      id="basePrice"
                      name="basePrice"
                      type="number"
                      step="0.01"
                      value={formData.basePrice}
                      onChange={handleChange}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                {/* Variants */}
                <div className="space-y-4 border p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label>Product Variants (Optional)</Label>
                    <div className="flex items-center gap-2">
                      {formData.variants && formData.variants.length > 0 && (
                        <span className="text-sm text-gray-500">
                          {formData.variants.length} variant(s) configured
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            variants: [
                              ...(prev.variants || []),
                              {
                                name: '',
                                options: [''],
                                optionDetails: {} // Store { optionValue: { basePrice, displayPrice, discountPercentage, stock } }
                              }
                            ]
                          }));
                        }}
                      >
                        Add Variant
                      </Button>
                    </div>
                  </div>

                  {formData.variants?.map((variant, variantIndex) => (
                    <div key={variantIndex} className="space-y-4 p-4 border rounded-md">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <Label>Variant Name</Label>
                          <Input
                            type="text"
                            value={variant.name}
                            onChange={(e) => {
                              const newVariants = [...formData.variants];
                              newVariants[variantIndex] = {
                                ...variant,
                                name: e.target.value
                              };
                              setFormData({ ...formData, variants: newVariants });
                            }}
                            placeholder="e.g., Color, Size, Material"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Options (press Enter or comma to add)</Label>
                          <div className="flex flex-wrap gap-2 items-center border rounded-md p-2 min-h-10">
                            {(variant.options || []).filter(opt => opt).map((option, i) => (
                              <div key={i} className="flex items-center bg-blue-50 text-blue-800 px-2 py-1 rounded-full text-sm">
                                {option}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newOptions = [...(variant.options || [])];
                                    newOptions.splice(i, 1);

                                    const newOptionDetails = { ...(variant.optionDetails || {}) };
                                    delete newOptionDetails[option];

                                    const newVariants = [...formData.variants];
                                    newVariants[variantIndex] = {
                                      ...variant,
                                      options: newOptions.filter(Boolean),
                                      optionDetails: newOptionDetails
                                    };

                                    setFormData({ ...formData, variants: newVariants });
                                  }}
                                  className="ml-1 text-blue-500 hover:text-blue-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <input
                              type="text"
                              value={variant.newOption || ''}
                              onChange={(e) => {
                                const newVariants = [...formData.variants];
                                newVariants[variantIndex] = {
                                  ...variant,
                                  newOption: e.target.value
                                };
                                setFormData({ ...formData, variants: newVariants });
                              }}
                              onKeyDown={(e) => {
                                if ((e.key === ',' || e.key === 'Enter') && variant.newOption?.trim()) {
                                  e.preventDefault();
                                  const option = variant.newOption.trim();
                                  const newOptions = [...new Set([...(variant.options || []), option])];

                                  const newVariants = [...formData.variants];
                                  newVariants[variantIndex] = {
                                    ...variant,
                                    options: newOptions.filter(Boolean),
                                    newOption: ''
                                  };

                                  setFormData({ ...formData, variants: newVariants });
                                }
                              }}
                              onBlur={() => {
                                if (variant.newOption?.trim()) {
                                  const option = variant.newOption.trim();
                                  const newOptions = [...new Set([...(variant.options || []), option])];

                                  const newVariants = [...formData.variants];
                                  newVariants[variantIndex] = {
                                    ...variant,
                                    options: newOptions.filter(Boolean),
                                    newOption: ''
                                  };

                                  setFormData({ ...formData, variants: newVariants });
                                }
                              }}
                              placeholder={(variant.options || []).length ? '' : "e.g., Small, Medium, Large"}
                              className="flex-1 border-0 focus:ring-0 focus:outline-none bg-transparent min-w-[100px]"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 ml-auto"
                              onClick={() => {
                                const newVariants = formData.variants.filter((_, i) => i !== variantIndex);
                                setFormData({ ...formData, variants: newVariants });
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Press Enter or comma to add options
                          </p>
                        </div>
                      </div>

                      {(variant.options || []).filter(opt => opt).length > 0 && variant.name && (
                        <div className="mt-4 overflow-x-auto">
                          <Label>Variant Options and Prices</Label>
                          <table className="min-w-full mt-2 border rounded-md">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                  {variant.name}
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                  Base Price (KES)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 shadow-inner">
                              {(variant.options || []).filter(opt => opt).map((option, optionIndex) => {
                                const details = (variant.optionDetails || {})[option] || {};

                                const updateDetail = (field, value) => {
                                  const newVariants = [...formData.variants];
                                  const currentDetails = variant.optionDetails || {};
                                  newVariants[variantIndex] = {
                                    ...variant,
                                    optionDetails: {
                                      ...currentDetails,
                                      [option]: {
                                        ...currentDetails[option],
                                        [field]: value
                                      }
                                    }
                                  };
                                  setFormData({ ...formData, variants: newVariants });
                                };

                                return (
                                  <tr key={optionIndex} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">
                                      {option}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={details.basePrice || ''}
                                        onChange={(e) => updateDetail('basePrice', e.target.value)}
                                        placeholder="0"
                                        className="w-24 border-blue-200 focus:border-blue-500 focus:ring-blue-100"
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
                        {formData.variants.length === 1 ? (
                          `This will create ${(formData.variants[0].options || []).length} product variants.`
                        ) : (
                          `This will create ${formData.variants.reduce((acc, curr) => acc * (((curr.options || []).length) || 1), 1)} product variants.`
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {/* Short Description */}
                <div>
                  <Label htmlFor="shortDescription">Short Description *</Label>
                  <Textarea
                    id="shortDescription"
                    name="shortDescription"
                    value={formData.shortDescription}
                    onChange={handleChange}
                    placeholder="Enter a brief description of the product"
                    rows={3}
                    required
                  />
                </div>

                {/* Full Description */}
                <div>
                  <Label htmlFor="fullDescription">Full Description *</Label>
                  <Textarea
                    id="fullDescription"
                    name="fullDescription"
                    value={formData.fullDescription}
                    onChange={handleChange}
                    placeholder="Enter detailed product description"
                    rows={6}
                    required
                  />
                </div>

                {/* Specifications */}
                <div className="space-y-4">
                  <div>
                    <Label>Specifications</Label>
                    <p className="text-sm text-gray-500 mb-2">Add technical specifications</p>

                    {/* Add New Specification Row */}
                    <div className="flex gap-4 mb-4">
                      <div className="flex-1">
                        <Input
                          type="text"
                          value={formData.newSpecName || ''}
                          onChange={(e) => handleFieldChange('newSpecName', e.target.value)}
                          placeholder="Specification name (e.g., Weight, Dimensions)"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="text"
                          value={formData.newSpecValue || ''}
                          onChange={(e) => handleFieldChange('newSpecValue', e.target.value)}
                          placeholder="Value (e.g., 1.5kg, 30x20x10cm)"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          if (formData.newSpecName && formData.newSpecValue) {
                            setFormData(prev => ({
                              ...prev,
                              specifications: {
                                ...prev.specifications,
                                [formData.newSpecName]: formData.newSpecValue
                              },
                              newSpecName: '',
                              newSpecValue: ''
                            }));
                          }
                        }}
                        variant="outline"
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
                                className="text-red-500 hover:text-red-700"
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
                <div className="space-y-2">
                  <Label htmlFor="keyFeatures">Key Features</Label>
                  <Textarea
                    id="keyFeatures"
                    value={Array.isArray(formData.keyFeatures) ? formData.keyFeatures.join('\n') : (typeof formData.keyFeatures === 'string' ? formData.keyFeatures : '')}
                    onChange={(e) => {
                      // Store as raw string to allow easy editing with newlines
                      setFormData(prev => ({
                        ...prev,
                        keyFeatures: e.target.value
                      }));
                    }}
                    onKeyDown={(e) => {
                      // Allow all normal keyboard input for the Key Features field
                      if (e.key === ' ' || e.key === 'Enter') {
                        return;
                      }
                    }}
                    placeholder="Enter key features (e.g., 'Wireless connectivity', 'Long battery life'). Press Enter for a new line."
                    className="min-h-[100px] resize-y"
                    rows={4}
                  />
                  <p className="text-xs text-gray-500">You can enter multiple lines or sentences.</p>
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
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="text"
                          value={newPhysicalFeature.value || ''}
                          onChange={(e) => setNewPhysicalFeature({ ...newPhysicalFeature, value: e.target.value })}
                          placeholder="Value (e.g., Black, 1.5kg)"
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
                      >
                        Add
                      </Button>
                    </div>

                    {/* Display Added Features */}
                    {Object.keys(formData.physicalFeatures || {}).length > 0 && (
                      <div className="border rounded-md p-4 space-y-2">
                        {Object.entries(formData.physicalFeatures).map(([key, value]) => (
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
                                className="text-red-500 hover:text-red-700"
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

                {/* Media Upload */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Media Upload</h3>

                  {/* Cover Image */}
                  <div>
                    <Label htmlFor="coverImage">
                      Cover Image {mode !== 'edit' && '*'}
                    </Label>
                    <Input
                      id="coverImage"
                      type="file"
                      accept="image/*"
                      onChange={handleCoverImageChange}
                      className="mt-2"
                    />
                    {coverPreview && (
                      <div className="mt-2 relative inline-block">
                        <img src={coverPreview} alt="Cover preview" className="max-w-xs max-h-32 object-cover rounded border" />
                        <button
                          type="button"
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 shadow-lg"
                          onClick={removeCoverImage}
                          title="Remove cover image"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {mode === 'edit' ? 'Upload a new image to replace the current cover, or remove the current image' : 'Upload a cover image'}
                    </p>
                  </div>

                  {/* Gallery Images */}
                  <div>
                    <Label htmlFor="galleryImages">
                      Gallery Images
                      {mode === 'edit' && galleryExistingImages.length > 0 && (
                        <span className="ml-2 text-sm text-green-600">({galleryExistingImages.length} existing)</span>
                      )}
                    </Label>
                    <Input
                      id="galleryImages"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGalleryImagesChange}
                    />
                    {galleryPreviews.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {galleryImages.map((imageObj, index) => {
                          const isExisting = imageObj.isExisting;
                          const isRemoved = removedIdx.has(index);

                          return (
                            <div key={index} className={`relative ${isRemoved ? 'opacity-50' : ''}`}>
                              <img
                                src={imageObj.preview || imageObj}
                                alt={`Gallery ${index + 1}`}
                                className="max-w-xs max-h-32 object-cover rounded border"
                              />
                              {isExisting ? (
                                <div className="absolute -top-1 -right-1 flex gap-1">
                                  <button
                                    type="button"
                                    className={`${isRemoved ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white rounded-full w-6 h-6 flex items-center justify-center text-sm shadow-lg`}
                                    onClick={() => isRemoved ? restoreGalleryImage(index) : removeGalleryImage(index)}
                                    title={isRemoved ? 'Restore image' : 'Remove image'}
                                  >
                                    {isRemoved ? '+' : '×'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 shadow-lg"
                                  onClick={() => removeGalleryImage(index)}
                                  title="Remove image"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {mode === 'edit' && galleryExistingImages.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Click the × button to remove existing images, or + to restore removed ones. Upload new images to add more.
                      </p>
                    )}
                  </div>

                  {/* Video */}
                  <div>
                    <Label htmlFor="video">
                      Product Video (optional)
                      {mode === 'edit' && videoType === 'existing' && (
                        <span className="ml-2 text-sm text-green-600">(Existing video)</span>
                      )}
                    </Label>
                    {videoPreview && (
                      <div className="mt-2 relative inline-block">
                        <video src={videoPreview} controls className="max-w-xs max-h-32 rounded border" />
                        <button
                          type="button"
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 shadow-lg"
                          onClick={removeVideo}
                          title="Remove video"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <Input
                      id="video"
                      type="file"
                      accept="video/*"
                      onChange={handleVideoChange}
                      className="mt-2"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {mode === 'edit' ? 'Upload a new video to replace the current one, or remove the current video' : 'Upload a product video (optional)'}
                    </p>
                  </div>
                </div>


                {/* Shipping & Warranty Section */}
                <div className="space-y-6 border-t pt-6">
                  <h3 className="text-lg font-medium">Shipping & Warranty</h3>

                  {/* Weight */}
                  <div>
                    <Label htmlFor="weight">Weight</Label>
                    <Input
                      id="weight"
                      type="text"
                      value={formData.weight || ''}
                      onChange={(e) => handleFieldChange('weight', e.target.value)}
                      placeholder="e.g., 5kg, 10lbs"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Product weight (include units like kg, g, lbs)
                    </p>
                  </div>

                  {/* Dimensions */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="length">Length</Label>
                      <Input
                        id="length"
                        type="text"
                        value={formData.length || ''}
                        onChange={(e) => handleFieldChange('length', e.target.value)}
                        placeholder="e.g., 10cm, 5in"
                      />
                    </div>
                    <div>
                      <Label htmlFor="width">Width</Label>
                      <Input
                        id="width"
                        type="text"
                        value={formData.width || ''}
                        onChange={(e) => handleFieldChange('width', e.target.value)}
                        placeholder="e.g., 20cm, 8in"
                      />
                    </div>
                    <div>
                      <Label htmlFor="height">Height</Label>
                      <Input
                        id="height"
                        type="text"
                        value={formData.height || ''}
                        onChange={(e) => handleFieldChange('height', e.target.value)}
                        placeholder="e.g., 30cm, 12in"
                      />
                    </div>
                  </div>

                  {/* Delivery Method */}
                  <div>
                    <Label htmlFor="deliveryMethod">Delivery Method *</Label>
                    <Select
                      value={formData.deliveryMethod || 'Pickup'}
                      onValueChange={(value) => handleFieldChange('deliveryMethod', value)}
                      required
                    >
                      <SelectTrigger className="w-full bg-blue-50 border-blue-200 hover:bg-blue-100">
                        <SelectValue placeholder="Select delivery method">
                          {formData.deliveryMethod || 'Pickup'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-blue-50 border border-blue-200">
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
                      value={formData.warranty || ''}
                      onChange={(e) => handleFieldChange('warranty', e.target.value)}
                      placeholder="e.g., 12 months manufacturer warranty"
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
                      value={formData.returnPolicy || ''}
                      onChange={(e) => handleFieldChange('returnPolicy', e.target.value)}
                      placeholder="Describe the return policy for this product"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Return and refund policy details
                    </p>
                  </div>

                </div>




                {/* Submit Buttons */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <AutoSaveIndicator lastSaved={lastAutoSaved} isSaving={false} />
                    {hasDraft && (
                      <Button type="button" variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-red-500" onClick={clearDraftAndReset}>
                        Clear Draft
                      </Button>
                    )}
                  </div>
                  {errorMsg && (
                    <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-2 shadow-sm rounded-r-md">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">Failed to create product</h3>
                          <div className="mt-2 text-sm text-red-700">
                            <p>{errorMsg}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {mode === 'edit' ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {mode === 'edit' ? 'Update Product' : 'Create Product'}
                      </>
                    )}
                  </Button>
                </div>

              </form>
            )}
          </div>

          <ChangesDialog
            open={showChangesDialog}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                setShowChangesDialog(false);
                setLoading(false);
              }
            }}
            onConfirm={() => performSave(false)}
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
            confirmLabel={mode === 'edit' ? 'Done' : 'Back to Products'}
          />
        </>
      )}
    </div>
  );
};

export default ProductForm;
