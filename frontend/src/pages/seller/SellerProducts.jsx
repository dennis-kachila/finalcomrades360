import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaTrash } from 'react-icons/fa'
import api, { productApi } from '../../services/api'
import { fastFoodService } from '../../services/fastFoodService';
import FastFoodCard from '../../components/FastFoodCard';
import { resolveImageUrl, FALLBACK_IMAGE } from '../../utils/imageUtils';
import { Eye, EyeOff, Ban, Clock, Utensils, Edit } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/use-toast';
import { formatPrice } from '../../utils/currency';
import DeleteConfirmationModal from '../../components/modals/DeleteConfirmationModal';


export default function SellerProducts() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('approved_products'); // approved_products, approved_fastfood, pending_products, pending_fastfood
  const [products, setProducts] = useState([]);
  const [fastFoods, setFastFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [currentPage, setCurrentPage] = useState(1);

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, product: null });
  const { toast } = useToast();

  // Optimistic Update Helper
  const optimisticUpdate = async (id, updates, successMsg) => {
    const previousFoods = [...fastFoods];
    setFastFoods(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));

    try {
      await fastFoodService.updateFastFood(id, updates);
      toast({ title: 'Success', description: successMsg });
    } catch (err) {
      console.error('Update failed:', err);
      setFastFoods(previousFoods); // Rollback
      toast({ title: 'Error', description: 'Failed to update item', variant: 'destructive' });
    }
  };

  // Handle delete product (Regular)
  const handleDeleteProduct = async (productId) => {
    setDeleteModal({ isOpen: true, product: products.find(p => p.id === productId) });
  };

  // Handle delete fast food
  const handleDeleteFastFood = async (fastFoodId) => {
    if (window.confirm('Are you sure you want to delete this fast food item?')) {
      try {
        await fastFoodService.deleteFastFood(fastFoodId);
        setFastFoods(prev => prev.filter(item => item.id !== fastFoodId));
      } catch (error) {
        console.error('Failed to delete fast food:', error);
        alert('Failed to delete item.');
      }
    }
  };


  // Handle confirmed delete with reason and password
  const handleConfirmedDelete = async (productId, reason, password, isApproved) => {
    try {
      if (isApproved) {
        // For approved products, submit deletion request to admin
        await api.post('/products/request-deletion', {
          productId,
          reason,
          password
        });
        alert('Deletion request submitted to admin for approval.');
      } else {
        // For unapproved products, direct deletion with password
        await api.delete(`/products/${productId}`, { data: { password, reason } });
        // Remove from local state
        setProducts(prev => prev.filter(item => item.id !== productId));
        alert('Product deleted successfully.');
      }
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.message || error?.message || 'Failed to process deletion request.';
      console.error('Error processing deletion:', { status, msg, data: error?.response?.data });
      throw new Error(msg);
    }
  };

  // Removed local resolveImageUrl as it is now imported from utils/imageUtils

  useEffect(() => {
    let alive = true;
    const pageSize = 12;

    const load = async () => {
      setLoading(true);
      try {
        const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch Timeout')), ms));

        let url = '';
        if (activeTab === 'approved_products') url = `/seller/products?approved=true&page=${currentPage}&pageSize=${pageSize}`;
        else if (activeTab === 'approved_fastfood') url = `/fastfood/vendor/me?approved=true&page=${currentPage}&pageSize=${pageSize}`;
        else if (activeTab === 'pending_products') url = `/seller/products?approved=false&page=${currentPage}&pageSize=${pageSize}`;
        else if (activeTab === 'pending_fastfood') url = `/fastfood/vendor/me?approved=false&page=${currentPage}&pageSize=${pageSize}`;

        const res = await Promise.race([api.get(url), timeout(30000)]);

        if (!alive) return;

        const dataObj = res.data;
        const list = Array.isArray(dataObj.data) ? dataObj.data : (dataObj.data?.data || []);
        const metaData = dataObj.meta || { total: list.length, page: 1, totalPages: 1 };

        if (activeTab.includes('product')) {
          setProducts(list);
          setFastFoods([]);
        } else {
          setFastFoods(list);
          setProducts([]);
        }
        setMeta(metaData);
      } catch (e) {
        console.error('Failed to load listings:', e);
        toast({ title: 'Error', description: 'Failed to load items. Please try again.', variant: 'destructive' });
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [activeTab, currentPage]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };


  // Filter Logic
  const approvedProducts = products.filter(p => p.approved);
  const pendingProducts = products.filter(p => !p.approved);

  const approvedFastFood = fastFoods.filter(f => f.approved);
  const pendingFastFood = fastFoods.filter(f => !f.approved);


  const renderTabs = () => (
    <div className="flex flex-nowrap overflow-x-auto scrollbar-hide border-b border-gray-200 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
      <button
        onClick={() => handleTabChange('approved_products')}
        className={`flex-shrink-0 mr-2 sm:mr-4 py-2 px-2 sm:px-4 font-medium text-[11px] sm:text-sm focus:outline-none transition-colors duration-200 border-b-2 ${activeTab === 'approved_products' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
      >
        Approved Products
      </button>
      <button
        onClick={() => handleTabChange('approved_fastfood')}
        className={`flex-shrink-0 mr-2 sm:mr-4 py-2 px-2 sm:px-4 font-medium text-[11px] sm:text-sm focus:outline-none transition-colors duration-200 border-b-2 ${activeTab === 'approved_fastfood' ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
      >
        Approved Fast Food
      </button>
      <button
        onClick={() => handleTabChange('pending_products')}
        className={`flex-shrink-0 mr-2 sm:mr-4 py-2 px-2 sm:px-4 font-medium text-[11px] sm:text-sm focus:outline-none transition-colors duration-200 border-b-2 ${activeTab === 'pending_products' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
      >
        Pending Products
      </button>
      <button
        onClick={() => handleTabChange('pending_fastfood')}
        className={`flex-shrink-0 py-2 px-2 sm:px-4 font-medium text-[11px] sm:text-sm focus:outline-none transition-colors duration-200 border-b-2 ${activeTab === 'pending_fastfood' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
      >
        Pending Fast Food
      </button>
    </div>
  );

  const renderProductCard = (p, isPending = false) => {
    return (
      <div key={p.id} className="group w-full bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col h-full border border-gray-100">
        <div className="relative h-28 sm:h-40 md:h-48 overflow-hidden bg-gray-100">
          <img
            src={resolveImageUrl((p.images || [])[0])}
            alt={p.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = resolveImageUrl(null); }}
          />
          {isPending ? (
            <div className="absolute top-2 right-2 z-10">
              {p.reviewStatus === 'rejected' ? (
                <span className="text-[10px] px-2 py-1 rounded bg-red-100 text-red-800 font-bold shadow-sm">Rejected</span>
              ) : p.reviewStatus === 'changes_requested' ? (
                <span className="text-[10px] px-2 py-1 rounded bg-amber-100 text-amber-800 font-bold shadow-sm">Changes Requested</span>
              ) : (
                <span className="text-[10px] px-2 py-1 rounded bg-gray-200 text-gray-700 font-bold shadow-sm">Pending</span>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-2 sm:px-3 py-2 flex-grow flex flex-col">
          <h3 className="font-display font-semibold text-gray-900 mb-1 text-sm sm:text-base tracking-tight truncate group-hover:text-blue-600 transition-colors" title={p.name}>{p.name}</h3>
          
          <div className="mb-1.5 flex flex-wrap gap-x-1.5 gap-y-0 items-baseline">
            <span className="font-sans text-sm sm:text-base font-black text-gray-900">
              {formatPrice(p.basePrice || 0)}
            </span>
            <span className="text-[10px] text-gray-500">Stock: {p.stock}</span>
          </div>

          {isPending && !p.approved && p.reviewNotes ? (
            <div className="text-[10px] bg-yellow-50 text-yellow-800 p-1.5 rounded mb-2 border border-yellow-100 line-clamp-2">
              <span className="font-bold">Note:</span> {p.reviewNotes}
            </div>
          ) : null}
        </div>

        <div className="flex gap-1 p-2 mt-auto pt-3 border-t border-gray-100">
          <Link
            to={`/seller/products/${p.id}/view`}
            className="flex-1 py-1.5 text-center text-[10px] sm:text-xs font-bold text-white bg-blue-800 hover:bg-blue-900 rounded transition-colors truncate"
            title="View Details"
          >
            View
          </Link>
          <Link
            to={`/seller/products/${p.id}/edit`}
            className="flex-1 py-1.5 text-center text-[10px] sm:text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors truncate"
            title="Edit Product"
          >
            Edit
          </Link>
          <button
            onClick={() => handleDeleteProduct(p.id)}
            className="px-2 py-1.5 text-[10px] bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200 rounded transition-colors"
            title="Delete"
          >
            <FaTrash size={12} />
          </button>
        </div>
      </div>
    );
  };

  const renderFastFoodList = (items) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {items.map(item => {
        const isPending = item.status === 'pending' || (item.status === 'draft' && item.reviewStatus === 'pending');

        return (
          <div key={item.id} className="w-full">
            <FastFoodCard
              item={item}
              clickable={false}
              showBasePrice={true}
              renderActions={() => (
                <div className={`grid ${isPending ? 'grid-cols-3' : 'grid-cols-4'} gap-1 mt-2 pt-2 border-t border-gray-100`}>
                  {/* View Button */}
                  <Link
                    to={`/seller/fast-food/view/${item.id}`}
                    className="flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition-colors"
                    title="View Details"
                  >
                    <Eye size={16} />
                  </Link>

                  {/* Edit Button - Only for Pending */}
                  {isPending && (
                    <Link
                      to={`/seller/fast-food/edit/${item.id}`}
                      className="flex items-center justify-center p-2 text-green-600 hover:bg-green-50 rounded border border-green-200 transition-colors"
                      title="Edit Fast Food Item"
                    >
                      <Edit size={16} />
                    </Link>
                  )}

                  {/* Availability Toggle - Only for Approved */}
                  {!isPending && (
                    <button
                      onClick={() => {
                        const modes = ['AUTO', 'OPEN', 'CLOSED'];
                        const currentMode = item.availabilityMode || 'AUTO';
                        const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
                        optimisticUpdate(item.id, { availabilityMode: nextMode }, `Mode: ${nextMode}`);
                      }}
                      className={`flex items-center justify-center p-2 rounded border transition-colors ${item.availabilityMode === 'OPEN' ? 'bg-green-50 text-green-600 border-green-200' :
                        item.availabilityMode === 'CLOSED' ? 'bg-red-50 text-red-600 border-red-200' :
                          'bg-blue-50 text-blue-600 border-blue-200'
                        }`}
                      title={`Current: ${item.availabilityMode || 'AUTO'}`}
                    >
                      {item.availabilityMode === 'OPEN' ? <Utensils size={16} /> :
                        item.availabilityMode === 'CLOSED' ? <Ban size={16} /> :
                          <Clock size={16} />}
                    </button>
                  )}

                  {/* Visibility Toggle - Only for Approved */}
                  {!isPending && (
                    <button
                      onClick={() => optimisticUpdate(item.id, { isActive: !item.isActive }, item.isActive ? 'Item Hidden' : 'Item Visible')}
                      className={`flex items-center justify-center p-2 rounded border transition-colors ${!item.isActive ? 'bg-gray-100 text-gray-500 border-gray-300' :
                        'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                        }`}
                      title={item.isActive ? 'Hide from Menu' : 'Show on Menu'}
                    >
                      {item.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  )}

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteFastFood(item.id)}
                    className="flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
                    title="Delete"
                  >
                    <FaTrash size={14} />
                  </button>
                </div>
              )}
            />
          </div>
        );
      })}
    </div>
  );


  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2"></div>
        Loading products...
      </div>
    );
  }

  return (
    <div className="p-0 sm:p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight">My Listings</h1>
        <Link to="/seller/products/add" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          + Add New
        </Link>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, product: null })}
        product={deleteModal.product}
        onConfirm={handleConfirmedDelete}
      />

      {renderTabs()}

      <div className="min-h-[300px]">
        {activeTab === 'approved_products' && (
          products.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {products.map(p => renderProductCard(p))}
            </div>
          ) : (
            <EmptyState icon="📦" message="No approved products yet." subMessage="Your approved items will appear here." />
          )
        )}

        {activeTab === 'pending_products' && (
          products.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {products.map(p => renderProductCard(p, true))}
            </div>
          ) : (
            <EmptyState icon="⏳" message="No pending products." subMessage="All your products have been processed." />
          )
        )}

        {activeTab === 'approved_fastfood' && (
          fastFoods.length > 0 ? renderFastFoodList(fastFoods) :
            <EmptyState icon="🍔" message="No approved fast food items." subMessage="Start by adding a fast food item!" />
        )}

        {activeTab === 'pending_fastfood' && (
          fastFoods.length > 0 ? renderFastFoodList(fastFoods) :
            <EmptyState icon="🕒" message="No pending fast food items." subMessage="Your kitchen queue is clear." />
        )}
      </div>

      {/* Pagination Controls */}
      {meta.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {[...Array(meta.totalPages)].map((_, i) => {
              const page = i + 1;
              // Simple logic to show current, first, last, and neighbors
              if (
                page === 1 ||
                page === meta.totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1)
              ) {
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${currentPage === page
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    {page}
                  </button>
                );
              } else if (
                page === currentPage - 2 ||
                page === currentPage + 2
              ) {
                return <span key={page} className="px-1 text-gray-400">...</span>;
              }
              return null;
            })}
          </div>
          <button
            disabled={currentPage === meta.totalPages}
            onClick={() => setCurrentPage(prev => Math.min(meta.totalPages, prev + 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

    </div>
  )
}



const EmptyState = ({ icon, message, subMessage }) => (
  <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
    <div className="text-4xl mb-3">{icon}</div>
    <h3 className="text-lg font-medium text-gray-900">{message}</h3>
    <p className="text-sm text-gray-500">{subMessage}</p>
  </div>
);
