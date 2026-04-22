import React, { useEffect, useState, useMemo } from 'react';
import api from '../../services/api';
import { FaEdit, FaTrash, FaPlus, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';

export default function EnhancedCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [addingSubcategory, setAddingSubcategory] = useState(null);
  const [newSubcategory, setNewSubcategory] = useState({ name: '', emoji: '📝' });
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const { user: currentUser } = useAuth();

  const resetAlerts = () => { setError(''); setSuccess(''); };

  // Password verification function
  const verifyPassword = async (password) => {
    try {
      setVerifying(true);
      const response = await api.post('/auth/verify-password', {
        password: password
      });
      // Update to use success instead of valid to match backend response
      return response.data.success;
    } catch (error) {
      console.error('Password verification failed:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
      }
      return false;
    } finally {
      setVerifying(false);
    }
  };

  // Show password dialog before sensitive operations
  const requirePasswordConfirmation = (action, data) => {
    setPendingAction({ action, data });
    setShowPasswordDialog(true);
    setPassword('');
    setPasswordError('');
  };

  // Handle password dialog submit
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    
    if (!password.trim()) {
      setPasswordError('Password is required');
      return;
    }

    try {
      setVerifying(true);
      const response = await api.post('/auth/verify-password', {
        password: password
      });
      
      if (response.data.success) {
        // Password verified, execute the pending action
        setShowPasswordDialog(false);
        const { action, data } = pendingAction;
        
        // Execute the action based on type
        try {
          switch (action) {
            case 'deleteCategory':
              await deleteCategory(data.categoryId);
              break;
            case 'deleteSubcategory':
              await deleteSubcategory(data.categoryId, data.subcategoryId);
              break;
            case 'saveChanges':
              await data.saveChanges();
              break;
            default:
              console.error('Unknown pending action:', action);
          }
          
          // Clear pending action and password on success
          setPendingAction(null);
          setPassword('');
          setPasswordError('');
        } catch (error) {
          // Handle action execution errors
          setError(error.response?.data?.error || 'An error occurred while processing your request');
        }
      } else {
        setPasswordError('Invalid password. Please try again.');
      }
    } catch (error) {
      console.error('Password verification error:', error);
      setPasswordError(error.response?.data?.message || 'Error verifying password. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const closePasswordDialog = () => {
    setShowPasswordDialog(false);
    setPendingAction(null);
    setPassword('');
    setPasswordError('');
    setVerifying(false);
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError(''); // Clear any previous errors
      console.log('🔄 Loading categories...');
      
      const r = await api.get('/categories');
      console.log('✅ Categories loaded successfully:', r.data.length, 'categories found');
      
      setCategories(r.data);
      setSuccess('Categories refreshed successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      console.error('❌ Failed to load categories:', e);
      
      if (e.response) {
        console.error('📊 Response status:', e.response.status);
        console.error('📊 Response data:', e.response.data);
      }
      
      setError(e.response?.data?.error || e.response?.data?.message || 'Failed to load categories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const toggleExpanded = (catId) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  const handleEditCategory = (category) => {
    // Set the category to be edited
    setEditingCategory(category);
    setNewSubcategory({ name: category.name, emoji: category.emoji || '📝' });
  };

  const handleEditSubcategory = (parentCategory, subcategory) => {
    // Set the subcategory to be edited
    setEditingCategory({ ...subcategory, parentId: parentCategory.id, parentName: parentCategory.name });
    setNewSubcategory({ name: subcategory.name, emoji: subcategory.emoji || '📝' });
  };

  const handleCreateCategory = async (e) => {
    // Prevent default form submission
    if (e) {
      e.preventDefault();
    }
    
    if (!newSubcategory.name.trim()) {
      setError('Please enter a category name');
      return false;
    }

    // Check if user is authenticated and has admin privileges
    if (!currentUser || !currentUser.role || !['admin', 'super_admin', 'superadmin'].includes(currentUser.role.toLowerCase())) {
      setError('You do not have permission to create categories. Admin access required.');
      return false;
    }

    // Verify token exists
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required. Please log in as an admin.');
      return false;
    }

    try {
      console.log('🚀 Creating category...');
      console.log('👤 Current user:', currentUser);
      console.log('🔑 Token exists:', !!token);
      console.log('📝 Category data:', {
        name: newSubcategory.name.trim(),
        emoji: newSubcategory.emoji
      });

      const response = await api.post('/categories/admin/categories', {
        name: newSubcategory.name.trim(),
        emoji: newSubcategory.emoji
      });
      
      console.log('✅ Category creation successful:', response.data);
      setSuccess('Category created successfully');
      setShowCreateForm(false);
      setNewSubcategory({ name: '', emoji: '📝' });
      
      // Force refresh categories list with a slight delay to ensure backend has processed
      setTimeout(async () => {
        console.log('🔄 Refreshing categories list after creation...');
        await loadCategories();
      }, 500);
      
      return true;
    } catch (e) {
      console.error('❌ Category creation failed:', e);
      
      // Enhanced error handling
      if (e.response) {
        console.error('📊 Response status:', e.response.status);
        console.error('📊 Response data:', e.response.data);
        
        if (e.response.status === 401) {
          setError('Authentication failed. Please log out and log back in as an admin.');
        } else if (e.response.status === 403) {
          setError('You do not have permission to create categories. Admin access required.');
        } else if (e.response.status === 500 && e.response.data?.error?.includes('already exists')) {
          setError(`A category with the name "${newSubcategory.name}" already exists. Please choose a different name.`);
        } else {
          setError(e.response.data?.error || e.response.data?.message || 'Failed to create category');
        }
      } else if (e.request) {
        setError('Network error: Unable to connect to server. Please check if the backend is running.');
      } else {
        setError(e.message || 'Failed to create category');
      }
      return false;
    }
  };

  const handleSaveEdit = async () => {
    if (!newSubcategory.name.trim()) {
      setError('Please enter a name');
      return;
    }

    // Set up the save operation that will be executed after password verification
    const saveChanges = async () => {
      try {
        if (editingCategory.parentId) {
          // Edit subcategory
          await api.put(`/categories/admin/categories/${editingCategory.parentId}/subcategories/${editingCategory.id}`, {
            name: newSubcategory.name.trim(),
            emoji: newSubcategory.emoji
          });
          setSuccess('Subcategory updated successfully');
        } else {
          // Edit category
          await api.put(`/categories/admin/categories/${editingCategory.id}`, {
            name: newSubcategory.name.trim(),
            emoji: newSubcategory.emoji
          });
          setSuccess('Category updated successfully');
        }
        setEditingCategory(null);
        setNewSubcategory({ name: '', emoji: '📝' });
        loadCategories();
      } catch (e) {
        console.error('❌ Update failed with details:', e.response?.data);
        setError(e.response?.data?.details || e.response?.data?.error || 'Failed to update');
      }
    };

    // Require password confirmation before saving
    requirePasswordConfirmation('saveChanges', { saveChanges });
  };

  const deleteCategory = async (categoryId) => {
    console.log('🗑️ Delete category clicked:', { categoryId });
    
    // Check user role using the proper AuthContext
    console.log('👤 Current user from AuthContext:', currentUser);
    console.log('👤 User role:', currentUser?.role);
    
    if (!currentUser || !currentUser.role || !['admin', 'super_admin', 'superadmin'].includes(currentUser.role.toLowerCase())) {
      setError('You do not have permission to delete categories. Admin access required.');
      return;
    }
    
    if (!window.confirm('Are you sure you want to delete this category? This will also delete all its subcategories and products.')) {
      console.log('User cancelled deletion');
      return;
    }
    
    resetAlerts();
    
    try {
      console.log('🚀 Sending category delete request...');
      
      // First, update the local state immediately for instant UI feedback
      setCategories(prevCategories => {
        const updatedCategories = prevCategories.filter(category => category.id !== categoryId);
        console.log('💨 Updated categories state immediately - removed category ID:', categoryId);
        return updatedCategories;
      });
      
      const response = await api.delete(`/categories/admin/categories/${categoryId}`);
      console.log('✅ Category delete response:', response);
      
      setSuccess('Category deleted successfully');
      
      // Sync with server to ensure consistency
      loadCategories();
    } catch (e) {
      console.error('❌ Category delete failed:', e);
      
      // Revert the local state change if the server request failed
      console.log('🔄 Reverting local state due to server error');
      loadCategories();
      
      if (e.response) {
        console.error('Response status:', e.response.status);
        console.error('Response data:', e.response.data);
        setError(`Failed to delete category (${e.response.status}): ${e.response.data?.error || e.response.data?.message || 'Server error'}`);
      } else if (e.request) {
        console.error('Network error - no response received');
        setError('Network error: Unable to connect to server. Please check if the backend is running.');
      } else {
        console.error('Request setup error:', e.message);
        setError(`Request error: ${e.message}`);
      }
    }
  };

  const deleteSubcategory = async (categoryId, subcategoryId) => {
    console.log('🗑️ Delete subcategory clicked:', { categoryId, subcategoryId });
    
    if (!window.confirm('Are you sure you want to delete this subcategory? This may affect products.')) {
      console.log('User cancelled deletion');
      return;
    }
    
    resetAlerts();
    
    // First, update the local state immediately for instant UI feedback
    setCategories(prevCategories => {
      const updatedCategories = prevCategories.map(category => {
        if (category.id === categoryId) {
          return {
            ...category,
            Subcategory: (category.Subcategory || []).filter(subcat => subcat.id !== subcategoryId)
          };
        }
        return category;
      });
      console.log('💨 Updated categories state immediately');
      return updatedCategories;
    });
    
    try {
      console.log('🚀 Sending delete request...');
      console.log('API endpoint:', `/categories/admin/categories/${categoryId}/subcategories/${subcategoryId}`);
      
      const response = await api.delete(`/categories/admin/categories/${categoryId}/subcategories/${subcategoryId}`);
      console.log('✅ Delete response:', response);
      
      setSuccess('Subcategory deleted successfully');
      
      // Sync with server to ensure consistency
      loadCategories();
    } catch (e) {
      console.error('❌ Delete failed:', e);
      
      // Revert the local state change if the server request failed
      console.log('🔄 Reverting local state due to server error');
      loadCategories();
      
      // More detailed error handling
      if (e.response) {
        console.error('Response status:', e.response.status);
        console.error('Response data:', e.response.data);
        console.error('Response headers:', e.response.headers);
        setError(`Failed to delete subcategory (${e.response.status}): ${e.response.data?.error || e.response.data?.message || 'Server error'}`);
      } else if (e.request) {
        console.error('Network error - no response received');
        setError('Network error: Unable to connect to server. Please check if the backend is running.');
      } else {
        console.error('Request setup error:', e.message);
        setError(`Request error: ${e.message}`);
      }
    }
  };

  const handleAddSubcategory = async (categoryId) => {
    if (!newSubcategory.name.trim()) {
      setError('Please enter a subcategory name');
      return;
    }

    // Generate a temporary ID for the optimistic update
    const tempId = `temp-${Date.now()}`;
    const newSubcatData = {
      id: tempId,
      name: newSubcategory.name.trim(),
      emoji: newSubcategory.emoji,
      categoryId: categoryId
    };

    // Update local state immediately for instant feedback
    setCategories(prevCategories => {
      const updatedCategories = prevCategories.map(category => {
        if (category.id === categoryId) {
          return {
            ...category,
            Subcategory: [...(category.Subcategory || []), newSubcatData]
          };
        }
        return category;
      });
      console.log('💨 Added subcategory to local state immediately');
      return updatedCategories;
    });

    try {
      const response = await api.post(`/categories/admin/categories/${categoryId}/subcategories`, {
        name: newSubcategory.name.trim(),
        emoji: newSubcategory.emoji,
        categoryId: categoryId
      });
      
      console.log('✅ Subcategory created successfully:', response.data);
      setSuccess('Subcategory added successfully');
      setAddingSubcategory(null);
      setNewSubcategory({ name: '', emoji: '📝' });
      
      // Force refresh categories list with a slight delay to ensure backend has processed
      setTimeout(async () => {
        console.log('🔄 Refreshing categories list after subcategory creation...');
        await loadCategories();
      }, 500);
    } catch (e) {
      console.error('❌ Failed to add subcategory:', e);
      
      // Revert the local state change if the server request failed
      setCategories(prevCategories => {
        const revertedCategories = prevCategories.map(category => {
          if (category.id === categoryId) {
            return {
              ...category,
              Subcategory: (category.Subcategory || []).filter(subcat => subcat.id !== tempId)
            };
          }
          return category;
        });
        console.log('🔄 Reverted local state due to server error');
        return revertedCategories;
      });
      
      setError(e.response?.data?.error || 'Failed to add subcategory');
    }
  };

  const renderCategoryTree = (cats, depth = 0) => {
    return cats.map(cat => {
      const subcategories = Array.isArray(cat.subcategories) && cat.subcategories.length
        ? cat.subcategories
        : Array.isArray(cat.Subcategory)
          ? cat.Subcategory
          : [];
      const hasChildren = subcategories.length > 0;
      const isExpanded = expandedCats.has(cat.id);

      return (
        <React.Fragment key={cat.id}>
          {/* Main Category Row */}
          <tr className="border-b hover:bg-gray-50">
            <td className="p-3">
              <button
                type="button"
                onClick={() => toggleExpanded(cat.id)}
                className="w-full text-left hover:bg-gray-100 p-2 rounded-md transition-colors"
              >
                <div style={{ paddingLeft: depth * 20 }} className="flex items-center gap-2">
                  <span className="text-gray-500 hover:text-gray-700 p-1 inline-flex items-center justify-center w-6">
                    {isExpanded ? <FaChevronDown className="text-xs" /> : <FaChevronRight className="text-xs" />}
                  </span>
                  <span className="text-lg mr-2">{cat.emoji || '📦'}</span>
                  <span className="font-medium">{cat.name}</span>
                </div>
              </button>
            </td>
            <td className="p-3 font-mono text-sm">{cat.id}</td>
            <td className="p-3 text-sm">{cat.slug || '-'}</td>
            <td className="p-3 text-sm">{cat.parentId ? 'Subcategory' : 'Main Category'}</td>
            <td className="p-3">
              <div className="flex gap-2">
                <button
                  className="btn btn-xs text-blue-600 hover:bg-blue-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditCategory(cat);
                  }}
                >
                  <FaEdit className="mr-1" size={12} />
                  Edit
                </button>
                <button
                  className="btn btn-xs text-red-600 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    requirePasswordConfirmation('deleteCategory', { categoryId: cat.id });
                  }}
                >
                  <FaTrash className="mr-1" size={12} />
                  Delete
                </button>
              </div>
            </td>
          </tr>

          {/* Subcategories */}
          {hasChildren && isExpanded && subcategories.map(subcat => (
            <tr key={subcat.id} className="border-b hover:bg-gray-50">
              <td className="p-3">
                <div style={{ paddingLeft: (depth + 1) * 20 }} className="flex items-center gap-2">
                  <span className="w-4" />
                  <span className="text-lg mr-2">{subcat.emoji || '📝'}</span>
                  <span className="font-medium">{subcat.name}</span>
                </div>
              </td>
              <td className="p-3 font-mono text-sm">{subcat.id}</td>
              <td className="p-3 text-sm">{subcat.slug || '-'}</td>
              <td className="p-3 text-sm">Subcategory</td>
              <td className="p-3">
                <div className="flex gap-2">
                  <button
                    className="btn btn-xs text-blue-600 hover:bg-blue-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditSubcategory(cat, subcat);
                    }}
                  >
                    <FaEdit className="mr-1" size={12} />
                    Edit
                  </button>
                  <button
                    className="btn btn-xs text-red-600 hover:bg-red-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      requirePasswordConfirmation('deleteSubcategory', { categoryId: cat.id, subcategoryId: subcat.id });
                    }}
                  >
                    <FaTrash className="mr-1" size={12} />
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {/* Add Subcategory Row */}
          {isExpanded && (
            <tr>
              <td colSpan={5} className="p-3">
                <div className="ml-8">
                  {addingSubcategory === cat.id ? (
                    <div className="bg-gray-50 p-3 rounded-md border border-dashed border-gray-300">
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="text"
                          value={newSubcategory.emoji}
                          onChange={(e) => setNewSubcategory(prev => ({ ...prev, emoji: e.target.value }))}
                          placeholder="Emoji"
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          maxLength={4}
                        />
                        <input
                          type="text"
                          value={newSubcategory.name}
                          onChange={(e) => setNewSubcategory(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Enter subcategory name"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => {
                            setAddingSubcategory(null);
                            setNewSubcategory({ name: '', emoji: '📝' });
                          }}
                          className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddSubcategory(cat.id)}
                          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingSubcategory(cat.id);
                        setNewSubcategory({ name: '', emoji: '📝' });
                      }}
                      className="flex items-center text-sm text-blue-600 hover:text-blue-800 ml-4"
                    >
                      <FaPlus className="mr-1 text-xs" />
                      <span>Add Subcategory</span>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  const flatCategories = useMemo(() => {
    const out = [];
    const walk = (arr, prefix = '') => {
      (arr || []).forEach(c => {
        const label = prefix ? `${prefix} / ${c.name}` : c.name;
        out.push({ id: c.id, name: label });
        if (Array.isArray(c.subcategories) && c.subcategories.length) {
          walk(c.subcategories, label);
        }
      });
    };
    walk(categories);
    return out;
  }, [categories]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Category Management</h1>
        <div className="flex gap-2">
          <button
            className="btn btn-success"
            onClick={() => setShowCreateForm(true)}
          >
            Create Category
          </button>
          <button 
            className={`btn ${loading ? 'opacity-75' : ''}`} 
            onClick={loadCategories} 
            disabled={loading}
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="p-3 rounded bg-red-100 text-red-700">{error}</div>}
      {success && <div className="p-3 rounded bg-green-100 text-green-700">{success}</div>}

      {/* Category Tree */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b bg-gray-50">
                <th className="p-3">Category Name</th>
                <th className="p-3">ID</th>
                <th className="p-3">Slug</th>
                <th className="p-3">Type</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(categories) && categories.length > 0 ? (
                renderCategoryTree(categories)
              ) : (
                <tr>
                  <td className="p-3 text-gray-600" colSpan={5}>
                    {loading ? 'Loading categories...' : 'No categories found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Category Modal */}
      {(showCreateForm || editingCategory) && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded shadow-lg w-[95%] max-w-md">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold text-lg">
                {editingCategory ? 'Edit Category' : 'Create Category'}
              </div>
              <button
                className="btn"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingCategory(null);
                  setNewSubcategory({ name: '', emoji: '📝' });
                }}
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <form onSubmit={(e) => {
                e.preventDefault();
                console.log('🚨 Form submitted! editingCategory:', editingCategory, 'showCreateForm:', showCreateForm);
                if (editingCategory) {
                  console.log('🔄 Calling handleSaveEdit...');
                  handleSaveEdit();
                } else {
                  console.log('🔄 Calling handleCreateCategory...');
                  handleCreateCategory(e);
                }
              }}>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4">
                    {editingCategory && editingCategory.parentId ? (
                      <span>Editing subcategory: <strong>{editingCategory.parentName}</strong></span>
                    ) : (
                      <span>Creating new main category</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Emoji
                    </label>
                    <input
                      type="text"
                      value={newSubcategory.emoji}
                      onChange={(e) => setNewSubcategory(prev => ({ ...prev, emoji: e.target.value }))}
                      placeholder="📦"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newSubcategory.name}
                      onChange={(e) => setNewSubcategory(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter category name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setShowCreateForm(false);
                        setNewSubcategory({ name: '', emoji: '📝' });
                      }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      {editingCategory ? 'Update' : 'Create'} Category
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Confirmation Dialog */}
      {showPasswordDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg w-[95%] max-w-md">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Admin Confirmation</h3>
                    <p className="text-sm text-gray-600">Verify your identity to continue</p>
                  </div>
                </div>
              </div>
            </div>
            
            <form onSubmit={handlePasswordSubmit} className="p-6">
              <div className="mb-4">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter your admin password to confirm this action
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                  placeholder="Your admin password"
                  autoFocus
                />
                {passwordError && (
                  <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                )}
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                <div className="flex">
                  <svg className="w-5 h-5 text-amber-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm text-amber-700">
                      <strong>Security Notice:</strong> This action requires admin verification.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closePasswordDialog}
                  disabled={verifying}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifying || !password.trim()}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {verifying ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Verifying...
                    </div>
                  ) : (
                    'Confirm Action'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{flatCategories.length}</div>
          <div className="text-gray-600">Total Categories</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {categories.filter(c => !c.parentId).length}
          </div>
          <div className="text-gray-600">Main Categories</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">
            {flatCategories.length - categories.filter(c => !c.parentId).length}
          </div>
          <div className="text-gray-600">Subcategories</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">
            {Math.max(...categories.map(c => c.subcategories?.length || 0), 0)}
          </div>
          <div className="text-gray-600">Max Subcategories</div>
        </div>
      </div>
    </div>
  );
}