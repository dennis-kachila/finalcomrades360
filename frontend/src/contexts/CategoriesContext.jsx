import React, { createContext, useState, useContext, useEffect, useRef, useMemo } from 'react';
import api, { productApi } from '../services/api';
import { toast } from '../components/ui/use-toast';

const CategoriesContext = createContext();

// Module-level cache — survives Strict Mode double-invoke and remounts
// Always start fresh on module load (page refresh / hot reload)
let _catCache = null;
let _catCacheTime = 0;
let _catFetching = false;
const CAT_TTL_MS = 2 * 60 * 1000; // 2 minutes (reduced from 5 to catch schema changes faster)

export const CategoriesProvider = ({ children }) => {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(false); // Start with false for instant loading
  const [isInitialized, setIsInitialized] = useState(false);

  const fetchingRef = useRef(false)
  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      console.debug('[Categories] loadCategories START');
      const now = Date.now();

      // Serve from cache if still fresh
      if (_catCache && (now - _catCacheTime) < CAT_TTL_MS) {
        console.debug('[Categories] Serving from cache');
        if (isMounted) {
          setCategories(_catCache.categories);
          setSubcategories(_catCache.subcategories);
          setIsInitialized(true);
          setLoading(false);
        }
        return;
      }

      // Block concurrent fetches but WAIT if one is in progress
      if (_catFetching) {
        console.debug('[Categories] Waiting for in-progress fetch...');

        return new Promise((resolve) => {
          let retries = 0;
          const interval = setInterval(() => {
            if (_catCache) {
              clearInterval(interval);
              if (isMounted) {
                setCategories(_catCache.categories);
                setSubcategories(_catCache.subcategories);
                setIsInitialized(true);
                setLoading(false);
              }
              resolve();
            }
            if (++retries > 40) { // 20 seconds total wait
              console.warn('[Categories] Polling timeout waiting for cache');
              clearInterval(interval);
              resolve();
            }
          }, 500);
        });
      }

      _catFetching = true;
      setLoading(true);
      try {
        console.debug('[Categories] Fetching /categories from API...');

        const categoriesRes = await api.get('/categories', { timeout: 15000 });
        const rawData = Array.isArray(categoriesRes?.data) ? categoriesRes.data : [];
        console.debug('[Categories] API responded with', rawData.length, 'items');

        // Normalise each category so both 'Subcategory' and 'subcategories' keys always exist
        const categoriesData = rawData.map(category => {
          if (!category) return null;

          const rawName = typeof category.name === 'string' ? category.name : 'Unknown Category';
          // ENSURE name is clean (detect and remove training counts if they exist)
          const cleanName = rawName.replace(/\s*\(\d+\s*items\)$/i, '').replace(/\s*\(\d+\)$/, '').trim();

          const subList = Array.isArray(category.Subcategory) ? category.Subcategory :
            Array.isArray(category.subcategories) ? category.subcategories : [];

          const subs = subList.map(sub => {
            if (!sub) return null;
            const subName = typeof sub.name === 'string' ? sub.name : 'Unknown Subcategory';
            return {
              ...sub,
              name: subName.replace(/\s*\(\d+\s*items\)$/i, '').replace(/\s*\(\d+\)$/, '').trim()
            };
          }).filter(Boolean);

          return {
            ...category,
            name: cleanName,
            taxonomyType: category.taxonomyType || 'product', // Default to product
            Subcategory: subs,      // capital S — used by FastFoodForm, ComradesProductForm
            subcategories: subs,    // lowercase — used by ServiceForm, getSubcategoriesByCategory
          };
        }).filter(Boolean);

        const allSubcategories = [];
        categoriesData.forEach(category => {
          allSubcategories.push(...(category.subcategories || []));
        });

        // ALWAYS update module-level cache so subsequent mounts can use it
        _catCache = { categories: categoriesData, subcategories: allSubcategories };
        _catCacheTime = Date.now();
        console.log('[Categories] Successfully loaded and cached', categoriesData.length, 'categories');

        if (isMounted) {
          setCategories(categoriesData);
          setSubcategories(allSubcategories);
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('[Categories] Failed to load:', err?.message || err);
        if (isMounted) setIsInitialized(true);
      } finally {
        _catFetching = false;
        setLoading(false);
      }
    };

    loadCategories();
    return () => { isMounted = false; };
  }, []);

  const refreshCategories = async () => {
    console.log('[DEBUG] CategoriesContext: refreshCategories called manually');
    _catCache = null;
    _catCacheTime = 0;
  };

  // Get subcategories for a specific category
  const getSubcategoriesByCategory = (categoryId) => {
    const category = categories.find(cat => String(cat.id) === String(categoryId));
    return category?.subcategories || [];
  };

  // Check if a category name already exists (case-insensitive)
  const isCategoryNameTaken = (name, excludeId = null) => {
    return categories.some(
      cat => cat.name.toLowerCase() === name.toLowerCase() && String(cat.id) !== String(excludeId)
    );
  };

  // Check if a subcategory name already exists within a category (case-insensitive)
  const isSubcategoryNameTaken = (categoryId, name, excludeId = null) => {
    const category = categories.find(cat => String(cat.id) === String(categoryId));
    const subcategories = category?.subcategories || [];
    return subcategories.some(
      sub => sub.name.toLowerCase() === name.toLowerCase() && String(sub.id) !== String(excludeId)
    );
  };

  const addCategory = async (newCategory) => {
    try {
      // Check for duplicate category name
      if (isCategoryNameTaken(newCategory.name)) {
        throw new Error('A category with this name already exists. Please choose a different name.');
      }

      // Use admin endpoint for category creation
      const response = await api.post('/admin/categories', newCategory);
      const createdCategory = response.data;

      setCategories(prevCategories => [...prevCategories, createdCategory]);

      toast({
        title: 'Success',
        description: 'Category created successfully',
        variant: 'default',
      });

      return createdCategory;
    } catch (error) {
      console.error('Error creating category:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create category',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const addSubcategory = async (categoryId, newSubcategory) => {
    try {
      // Check if category exists
      const category = categories.find(cat => cat.id === categoryId);
      if (!category) {
        throw new Error('Category not found');
      }

      // Check for duplicate subcategory name within the same category
      if (isSubcategoryNameTaken(categoryId, newSubcategory.name)) {
        throw new Error('A subcategory with this name already exists in this category. Please choose a different name.');
      }

      // Use admin endpoint for subcategory creation
      const response = await api.post(`/admin/categories/${categoryId}/subcategories`, newSubcategory);
      const createdSubcategory = response.data;

      // Add to the specific category's subcategories array
      setCategories(prevCategories =>
        prevCategories.map(cat =>
          String(cat.id) === String(categoryId)
            ? {
              ...cat,
              subcategories: [...(cat.subcategories || []), createdSubcategory]
            }
            : cat
        )
      );

      toast({
        title: 'Success',
        description: 'Subcategory created successfully',
        variant: 'default',
      });

      return createdSubcategory;
    } catch (error) {
      console.error('Error creating subcategory:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create subcategory',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Delete methods temporarily disabled - backend delete endpoints not implemented
  const deleteCategory = async (categoryId) => {
    try {
      // Use admin endpoint for category deletion
      await api.delete(`/admin/categories/${categoryId}`);
      setCategories(prevCategories => prevCategories.filter(cat => String(cat.id) !== String(categoryId)));
      toast({
        title: 'Success',
        description: 'Category deleted successfully',
        variant: 'default',
      });
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete category',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteSubcategory = async (categoryId, subcategoryId) => {
    try {
      // Use admin endpoint for subcategory deletion
      await api.delete(`/admin/categories/${categoryId}/subcategories/${subcategoryId}`);
      setCategories(prevCategories =>
        prevCategories.map(cat => {
          if (String(cat.id) === String(categoryId)) {
            return {
              ...cat,
              subcategories: cat.subcategories?.filter(sub => String(sub.id) !== String(subcategoryId)) || []
            };
          }
          return cat;
        })
      );
      toast({
        title: 'Success',
        description: 'Subcategory deleted successfully',
        variant: 'default',
      });
      return true;
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete subcategory',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Get combined categories with their subcategories
  const getCategoriesWithSubcategories = () => {
    return categories.map(category => ({
      ...category,
      subcategories: category.subcategories || []
    }));
  };

  const contextValue = useMemo(() => ({
    categories,
    subcategories,
    loading,
    isInitialized,
    addCategory,
    addSubcategory,
    deleteCategory,
    deleteSubcategory,
    getSubcategoriesByCategory,
    getCategoriesWithSubcategories,
    isCategoryNameTaken,
    isSubcategoryNameTaken,
    refreshCategories
  }), [
    categories,
    subcategories,
    loading,
    isInitialized,
    addCategory,
    addSubcategory,
    deleteCategory,
    deleteSubcategory,
    getSubcategoriesByCategory,
    getCategoriesWithSubcategories,
    isCategoryNameTaken,
    isSubcategoryNameTaken,
    refreshCategories
  ]);

  return (
    <CategoriesContext.Provider value={contextValue}>
      {children}
    </CategoriesContext.Provider>
  );
};

export const useCategories = () => {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
};

export default CategoriesContext;
