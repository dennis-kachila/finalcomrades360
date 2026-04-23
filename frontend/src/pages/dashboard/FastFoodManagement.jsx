import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, Ban, Trash2, Edit, Check,
  Plus, Search, Utensils, Clock, Loader2, X,
  CheckCircle, CheckCircle2, Star, User, MessageSquare,
  Filter, ChevronDown, Sliders, Square, CheckSquare, Trash,
  ExternalLink, Settings, ArrowRight, List, MapPin
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useToast } from '../../components/ui/use-toast';
import { fastFoodService } from '../../services/fastFoodService';
import { reviewService } from '../../services/reviewService';
import { platformService } from '../../services/platformService';
import { resolveImageUrl } from '../../utils/imageUtils';
import { recursiveParse, normalizeIngredient } from '../../utils/parsingUtils';
import FastFoodCard from '../../components/FastFoodCard';
import FastFoodForm from './FastFoodForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import AdminPasswordDialog from '../../components/AdminPasswordDialog';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import { useAuth } from '../../contexts/AuthContext';

/**
 * FastFoodTable Column Decisions:
 * 1. Item (Image + Name): Quick visual identification + ID for audit.
 * 2. Category: Grouping context (Snacks vs Meals).
 * 3. Vendor (Name + Role): Crucial for distinguishing between SuperAdmin items and Seller items.
 * 4. Pricing (Display + Discount): Real-time profit/marketing visibility.
 * 5. Prep Details (Time + Daily Limit): Operational indicators for capacity management.
 * 6. Status (Platform + Visibility): Multi-layered status for moderation (Suspended, Private, Pending).
 */
const renderFastFoodTable = (items, {
  handleViewItem,
  handleEditItem, // New handler
  handleListProduct,
  fetchFastFoods,
  toast,
  selectedIds,
  onSelect,
  onSelectAll,
  optimisticUpdate,
  requirePassword,
  fastFoodService,
  user,
  isPrivileged,
  navigate,
  setConfirmationDialog,
  handleViewChanges
}) => (
  <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-gray-50/50 border-b border-gray-100">
          <th className="px-4 py-4 w-10">
            <button
              onClick={onSelectAll}
              className="text-gray-400 hover:text-orange-600 transition-colors"
            >
              {selectedIds.length === items.length && items.length > 0
                ? <CheckSquare size={18} className="text-orange-600" />
                : <Square size={18} />
              }
            </button>
          </th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Fast Food Item</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Vendor Context</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Pricing (KES)</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Prep & Limit</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Status</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const isPending = item.reviewStatus === 'pending';
          const isSuspended = !item.isActive; // Suspended items have isActive = false
          const isHidden = !item.isActive;

          return (
            <tr key={item.id} className={`hover:bg-gray-50/80 transition-all group ${isSuspended ? 'bg-red-50/10' : ''} ${isSelected ? 'bg-orange-50/50' : ''}`}>
              {/* Selection Checkbox */}
              <td className="px-4 py-4">
                <button
                  onClick={() => onSelect(item.id)}
                  className="text-gray-400 hover:text-orange-600 transition-colors"
                >
                  {isSelected ? <CheckSquare size={18} className="text-orange-600" /> : <Square size={18} />}
                </button>
              </td>
              {/* Item Info */}
              <td className="px-4 py-4">
                <div className="flex items-center">
                  <div className="h-12 w-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 mr-3 flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                    <img
                      src={resolveImageUrl(item.mainImage)}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      onError={(e) => { e.target.src = '/fallback-food.png' }}
                    />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 group-hover:text-orange-600 transition-colors">{item.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">#{String(item.id || '').substring(0, 8)}</div>
                  </div>
                </div>
              </td>

              {/* Category */}
              <td className="px-4 py-4">
                <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-bold rounded-md border border-orange-100 uppercase">
                  {item.category || 'Food'}
                </span>
              </td>

              {/* Vendor Context */}
              <td className="px-4 py-4">
                <div className="flex flex-col">
                  <div className="flex items-center text-sm font-semibold text-gray-700">
                    <User size={12} className="mr-1 text-gray-400" />
                    {item.kitchenVendor || item.vendorDetail?.name || 'Main Kitchen'}
                  </div>
                  <div className="mt-1 flex items-center">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${item.vendorDetail?.role === 'super_admin'
                      ? 'bg-purple-600 text-white'
                      : 'bg-blue-100 text-blue-700'
                      }`}>
                      {item.vendorDetail?.role?.replace('_', ' ') || 'Seller'}
                    </span>
                  </div>
                </div>
              </td>

              {/* Pricing */}
              <td className="px-4 py-4 text-center">
                <div className="flex flex-col items-center">
                  {!isPrivileged ? (
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-black text-blue-600">
                        KES {item.basePrice || 0}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-black text-gray-900">
                        {item.displayPrice ? `KES ${item.displayPrice}` : 'Price Not Set'}
                      </span>
                      {item.discountPercentage > 0 && (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-gray-400 line-through">
                            KES {item.basePrice}
                          </span>
                          <span className="text-[9px] text-green-600 font-bold bg-green-50 px-1 rounded">
                            -{item.discountPercentage}%
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </td>

              {/* Prep & Limit */}
              <td className="px-4 py-4 text-center">
                <div className="inline-flex flex-col items-center text-xs text-gray-500 font-medium">
                  <div className="flex items-center text-orange-600 font-bold">
                    <Clock size={12} className="mr-1" />
                    {item.preparationTimeMinutes || 15}m
                  </div>
                  <div className="mt-1 text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-600">
                    Limit: {item.dailyLimit || '∞'}
                  </div>
                </div>
              </td>

              {/* Status & Live Status */}
              <td className="px-4 py-4 text-center">
                <div className="flex flex-col items-center space-y-2">
                  {/* Platform Status */}
                  <span className={`px-2 py-0.5 text-[9px] font-black rounded-full border shadow-sm ${isPending ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' :
                    isSuspended ? 'bg-red-600 text-white border-red-700' :
                      'bg-green-100 text-green-700 border-green-200'
                    }`}>
                    {item.reviewStatus?.toUpperCase() || 'ACTIVE'}
                  </span>

                  {/* Real-time "OPEN/CLOSED" Badge */}
                  {(() => {
                    const availability = fastFoodService.getAvailabilityStatus(item);
                    const isOpen = availability.state === 'OPEN';
                    return (
                      <div className="flex flex-col items-center">
                        <span className={`px-3 py-1 text-[10px] font-black rounded-lg shadow-sm flex items-center gap-1.5 transition-all ${isOpen
                          ? 'bg-green-500 text-white animate-pulse ring-2 ring-green-500/20'
                          : 'bg-gray-200 text-gray-500'
                          }`} title={availability.reason}>
                          <div className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-gray-400'}`} />
                          {availability.state || 'CLOSED'}
                        </span>
                        {!isOpen && availability.reason && (
                          <span className="text-[8px] text-gray-400 mt-1 max-w-[80px] leading-tight truncate">
                            {availability.reason}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {isHidden && (
                    <span className="px-2 py-0.5 text-[9px] font-black bg-gray-700 text-white rounded-full flex items-center">
                      <EyeOff size={8} className="mr-1" /> HIDDEN
                    </span>
                  )}
                </div>
              </td>

              {/* Actions */}
              <td className="px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  {(isPending || item.reviewStatus === 'draft') ? (
                    <>
                      {/* View Changes - Admin Only */}
                      {/* View Changes - Admin Only (Safe check) */}
                      {isPending && item.hasBeenApproved && isPrivileged && (
                        <button
                          onClick={() => handleViewChanges(item)}
                          className="p-1.5 text-purple-600 hover:text-white hover:bg-purple-600 rounded-lg transition-all border border-purple-200"
                          title="View Changes"
                        >
                          <Settings size={16} />
                        </button>
                      )}

                      {/* Review Details - For Pending Items */}
                      {isPending && (
                        <button
                          onClick={() => handleViewItem(item)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Review Details"
                        >
                          <Eye size={16} />
                        </button>
                      )}

                      {/* Edit - For Drafts */}
                      {(!isPending && item.reviewStatus === 'draft') && (
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Draft"
                        >
                          <Edit size={16} />
                        </button>
                      )}

                      {/* Approve & List - Admin Only */}
                      {isPending && isPrivileged && (
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-1.5 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition-all"
                          title="Approve & List"
                        >
                          <Check size={16} />
                        </button>
                      )}

                      {/* Delete Button - Available for Pending/Drafts too */}
                      <button
                        onClick={async () => {
                          console.log('Delete button clicked for item:', item.name);
                          try {
                            const reason = await requirePassword(`Delete "${item.name}"`, true, 'Reason for deletion');
                            await fastFoodService.deleteFastFood(item.id, reason);
                            fetchFastFoods();
                            toast({ title: 'Deleted Successfully', description: `"${item.name}" has been removed.` });
                          } catch (err) {
                            if (err?.message) toast({ variant: 'destructive', title: 'Delete Failed', description: err.message });
                          }
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEditItem(item)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="View/Edit"
                      >
                        <Edit size={16} />
                      </button>

                      {/* Shop Status Toggle Dropdown (availabilityMode) */}
                      <div className="relative inline-block" title="Select Availability Mode">
                        <select
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                          value={item.availabilityMode || 'AUTO'}
                          onChange={(e) => {
                            const nextMode = e.target.value;
                            optimisticUpdate(
                              item.id,
                              { availabilityMode: nextMode },
                              nextMode === 'OPEN' ? 'Shop is now FORCED OPEN' : (nextMode === 'CLOSED' ? 'Shop is now FORCED CLOSED' : 'Shop is now FOLLOWING SCHEDULE'),
                              'Failed to update availability.',
                              `Availability: ${nextMode}`
                            );
                          }}
                        >
                          <option value="AUTO">📅 Auto Schedule</option>
                          <option value="OPEN">🍽️ Force Open</option>
                          <option value="CLOSED">🚫 Force Closed</option>
                        </select>
                        <button
                          className={`p-1.5 rounded-lg transition-all shadow-sm border pointer-events-none focus:outline-none focus:ring-0 ${item.availabilityMode === 'OPEN' ? 'text-green-600 bg-green-50 border-green-200' :
                            item.availabilityMode === 'CLOSED' ? 'text-red-500 bg-red-50 border-red-200' :
                              'text-blue-500 bg-blue-50 border-blue-200 hover:bg-blue-100'
                            }`}
                        >
                          {item.availabilityMode === 'OPEN' ? <Utensils size={16} className="text-green-600 animate-bounce" /> :
                            item.availabilityMode === 'CLOSED' ? <Ban size={16} className="text-red-500" /> :
                              <Clock size={16} className="text-blue-500" />}
                        </button>
                      </div>

                      {/* Visibility Toggle - Restricted to Admin/SuperAdmin */}
                      {isPrivileged && (
                        <button
                          onClick={() => {
                            const newActive = !item.isActive;
                            optimisticUpdate(item.id, { isActive: newActive }, `Item is now ${newActive ? 'Visible' : 'Hidden'}`);
                          }}
                          className={`p-1.5 rounded-lg transition-all ${item.isActive ? 'text-gray-500 hover:text-amber-600 hover:bg-amber-50' : 'text-amber-600 hover:bg-amber-600 hover:text-white'}`}
                          title={item.isActive ? "Hide from Menu" : "Show on Menu"}
                        >
                          {item.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}

                      {/* Suspension Toggle - Restricted to Admin/SuperAdmin */}
                      {isPrivileged && (
                        <button
                          onClick={() => {
                            const newActive = isSuspended ? true : false;
                            optimisticUpdate(item.id, { isActive: newActive }, `Item ${isSuspended ? 'Activated' : 'Suspended'}`);
                          }}
                          className={`p-1.5 rounded-lg transition-all ${isSuspended ? 'text-green-600 hover:bg-green-600 hover:text-white' : 'text-red-500 hover:bg-red-500 hover:text-white'}`}
                          title={isSuspended ? "Unsuspend Item" : "Suspend Item"}
                        >
                          <Ban size={16} />
                        </button>
                      )}

                      <button
                        onClick={async () => {
                          console.log('Delete button clicked for item:', item.name);
                          try {
                            console.log('Requesting password for delete...');
                            const reason = await requirePassword(`Delete "${item.name}"`, true, 'Reason for deletion');
                            console.log('Password confirmed, reason:', reason);
                            await fastFoodService.deleteFastFood(item.id, reason);
                            fetchFastFoods();
                            setConfirmationDialog({
                              isOpen: true,
                              success: true,
                              title: 'Deleted Successfully',
                              message: `"${item.name}" has been permanently removed from the system.`
                            });
                          } catch (err) {
                            console.error('Delete error:', err);
                            if (err && err.message) {
                              setConfirmationDialog({
                                isOpen: true,
                                success: false,
                                title: 'Delete Failed',
                                message: err.message || 'Failed to delete item. Please try again.'
                              });
                            }
                          }
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all"
                        title="Delete Forever"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div >
);

const renderDeletedFastFoodTable = (items, {
  handleRestoreItem,
  handlePermanentDeleteItem,
  fetchFastFoods,
  toast,
  navigate
}) => (
  <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-gray-50/50 border-b border-gray-100">
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Fast Food Item</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Deleted At</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Auto-Delete At</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Reason</th>
          <th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {items.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50/80 transition-all group">
            <td className="px-4 py-4">
              <div className="flex items-center">
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 mr-3 flex-shrink-0 shadow-sm">
                  <img
                    src={resolveImageUrl(item.mainImage)}
                    alt={item.name}
                    className="h-full w-full object-cover opacity-50 grayscale"
                    onError={(e) => { e.target.src = '/fallback-food.png' }}
                  />
                </div>
                <div>
                  <div className="font-bold text-gray-700">{item.name}</div>
                  <div className="text-[10px] text-gray-400 font-mono">Original ID: #{item.originalId}</div>
                </div>
              </div>
            </td>
            <td className="px-4 py-4 text-sm text-gray-500">
              {new Date(item.deletedAt).toLocaleDateString()}
            </td>
            <td className="px-4 py-4 text-sm text-red-500 font-medium">
              {new Date(item.autoDeleteAt).toLocaleDateString()}
            </td>
            <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
              {item.deletionReason || 'No reason provided'}
            </td>
            <td className="px-4 py-4 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => handleRestoreItem(item)}
                  className="px-3 py-1.5 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-green-200"
                >
                  <ArrowRight size={14} /> Restore
                </button>
                <button
                  onClick={() => handlePermanentDeleteItem(item)}
                  className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-red-200"
                >
                  <Trash size={14} /> Purge
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const renderFastFoodGrid = (items, {
  handleViewItem,
  handleEditItem,
  handleListProduct,
  fetchFastFoods,
  toast,
  navigate,
  optimisticUpdate,
  requirePassword,
  fastFoodService,
  setConfirmationDialog,
  handleViewChanges,
  user,
  isPrivileged
}) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
    {items.map((fastFood) => (
      <div key={fastFood.id} className="relative group">
        {/* Management Badges */}
        <div className="absolute top-2 left-2 z-10 flex flex-col space-y-1 text-white">
          {fastFood.reviewStatus === 'pending' && <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500 rounded-full shadow-sm animate-pulse">PENDING</span>}
          {!fastFood.isActive && <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600 rounded-full shadow-sm">SUSPENDED</span>}
          {!fastFood.isActive && <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-700 rounded-full shadow-sm border border-gray-600">HIDDEN</span>}
        </div>

        <FastFoodCard
          item={fastFood}
          navigate={navigate}
          onView={() => handleViewItem(fastFood)}
          clickable={false}
          showBasePrice={!isPrivileged}
          renderActions={() => {
            return (
              <div className="mt-0 grid grid-cols-2 gap-1 w-full">
                {fastFood.reviewStatus === 'pending' ? (
                  <>
                    {/* Admin Actions: Changes & List in one row, Edit below */}
                    {isPrivileged ? (
                      <div className="col-span-2 grid grid-cols-2 gap-1">
                        {fastFood.hasBeenApproved ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewChanges(fastFood); }}
                            className="w-full px-1 py-1 text-[10px] sm:text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 flex items-center justify-center transition-colors shadow-sm"
                            title="View Changes"
                          >
                            <Settings className="h-3 w-3 mr-1" /> Changes
                          </button>
                        ) : (
                          <div className="w-full px-1 py-1 text-[8px] sm:text-[10px] uppercase font-bold text-orange-500 bg-orange-50 border border-orange-100 rounded flex items-center justify-center italic">New Item</div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleListProduct(fastFood); }}
                          className="w-full px-1 py-1 text-[10px] sm:text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center justify-center transition-colors shadow-sm"
                          title="Review & List"
                        >
                          <Check className="h-3 w-3 mr-1" /> List
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Seller Actions: Edit & Delete in one row */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditItem(fastFood); }}
                          className="w-full px-1 py-1 text-[10px] sm:text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center transition-colors"
                          title="Edit Details"
                        >
                          <Edit className="h-3 w-3 mr-1" /> Edit
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const reason = await requirePassword(`Delete Pending "${fastFood.name}"`, true, 'Optional reason for withdrawal');
                              await fastFoodService.deleteFastFood(fastFood.id, reason);
                              fetchFastFoods();
                              setConfirmationDialog({
                                isOpen: true,
                                success: true,
                                title: 'Item Withdrawn',
                                message: `"${fastFood.name}" has been removed from pending review.`
                              });
                            } catch (err) {
                              if (err && err.message) {
                                toast({ variant: 'destructive', title: 'Action Failed', description: err.message });
                              }
                            }
                          }}
                          className="w-full px-1 py-1 text-[10px] sm:text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 flex items-center justify-center transition-colors"
                          title="Withdraw Item"
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditItem(fastFood); }}
                      className="w-full px-1 py-1 text-[10px] sm:text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center transition-colors"
                    >
                      <Edit className="h-4 w-4 mr-1" /> Edit
                    </button>

                    {/* Status/Availability Cycle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const modes = ['AUTO', 'OPEN', 'CLOSED'];
                        const currentMode = fastFood.availabilityMode || 'AUTO';
                        const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];

                        optimisticUpdate(
                          fastFood.id,
                          { availabilityMode: nextMode },
                          nextMode === 'OPEN' ? 'FORCED OPEN' : (nextMode === 'CLOSED' ? 'FORCED CLOSED' : 'FOLLOWING SCHEDULE'),
                          'Failed to update availability.',
                          `Availability: ${nextMode}`
                        );
                      }}
                      className={`w-full px-1 py-1 text-[10px] sm:text-xs font-bold rounded border flex items-center justify-center transition-all ${fastFood.availabilityMode === 'OPEN' ? 'bg-green-50 text-green-700 border-green-200' :
                        fastFood.availabilityMode === 'CLOSED' ? 'bg-red-50 text-red-700 border-red-200 shadow-inner' :
                          'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      title={`Mode: ${fastFood.availabilityMode || 'AUTO'}. Click to toggle.`}
                    >
                      {fastFood.availabilityMode === 'OPEN' ? <Utensils size={12} className="mr-1 animate-bounce" /> :
                        fastFood.availabilityMode === 'CLOSED' ? <Ban size={12} className="mr-1" /> :
                          <Clock size={12} className="mr-1" />}
                      {fastFood.availabilityMode || 'AUTO'}
                    </button>

                    {/* Suspension Toggle - Restricted */}
                    {isPrivileged && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const isSuspended = !fastFood.isActive;
                          const newActive = isSuspended ? true : false;
                          optimisticUpdate(fastFood.id, { isActive: newActive }, `Item ${isSuspended ? 'Activated' : 'Suspended'}`);
                        }}
                        className={`w-full px-1 py-1 text-[10px] sm:text-xs font-medium text-white rounded flex items-center justify-center transition-colors ${!fastFood.isActive ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-500 hover:bg-red-600'}`}
                      >
                        <Ban size={14} className="mr-1" /> {!fastFood.isActive ? 'Activate' : 'Suspend'}
                      </button>
                    )}

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const reason = await requirePassword(`Delete "${fastFood.name}"`, true, 'Reason for deletion');
                          await fastFoodService.deleteFastFood(fastFood.id, reason);
                          fetchFastFoods();
                          setConfirmationDialog({
                            isOpen: true,
                            success: true,
                            title: 'Deleted Successfully',
                            message: `"${fastFood.name}" has been permanently removed from the system.`
                          });
                        } catch (err) {
                          if (err && err.message) {
                            setConfirmationDialog({
                              isOpen: true,
                              success: false,
                              title: 'Delete Failed',
                              message: err.message || 'Failed to delete item. Please try again.'
                            });
                          }
                        }
                      }}
                      className="w-full px-1 py-1 text-[10px] sm:text-xs font-medium text-red-600 bg-white border border-red-300 rounded hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Del
                    </button>
                  </>
                )
                }
              </div >
            );
          }}
        />
      </div >
    ))}
  </div >
);

/* Helper Component to Format Complex Change Values */
const ChangeValueDisplay = ({ value, fieldName = "" }) => {
  const finalValue = recursiveParse(value);

  if (finalValue === null || finalValue === undefined) return <span className="text-gray-400 italic">N/A</span>;

  if (typeof finalValue === 'boolean') {
    return <span className={finalValue ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{String(finalValue)}</span>;
  }

  // Special handling for Ingredients List
  if (fieldName === 'ingredients') {
    let validList = [];
    if (Array.isArray(finalValue)) validList = finalValue;
    else if (typeof finalValue === 'string') validList = [finalValue]; // Single string item fallback

    if (validList.length === 0) return <span className="text-gray-400 italic">Empty</span>;

    return (
      <div className="flex flex-col gap-1 items-start">
        {validList.map((item, i) => {
          const { name, quantity } = normalizeIngredient(item);
          if (!name) return null;

          return (
            <span key={i} className="px-2 py-1 bg-white/40 border border-gray-200 rounded text-xs font-medium">
              {name} {quantity && `(${quantity})`}
            </span>
          );
        }).filter(Boolean)}
      </div>
    );
  }

  // Handle Arrays (Generic)
  if (Array.isArray(finalValue)) {
    if (finalValue.length === 0) return <span className="text-gray-400 italic">Empty List</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {finalValue.map((v, i) => (
          <span key={i} className="px-1.5 py-0.5 bg-white/60 rounded border text-gray-700 font-medium text-[10px]">
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
        ))}
      </div>
    );
  }

  // Handle Objects (Generic)
  if (typeof finalValue === 'object') {
    return <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(finalValue, null, 2)}</pre>;
  }

  return <span className="text-gray-800 font-medium break-all">{String(finalValue)}</span>;
};

const FastFoodManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'super_admin';

  const [fastFoods, setFastFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showListForm, setShowListForm] = useState(false);
  const [selectedItemForListing, setSelectedItemForListing] = useState(null);
  const [formMode, setFormMode] = useState('edit');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: '', message: '' });

  // Review Sub-tabs (New vs Edited)
  const [reviewSubTab, setReviewSubTab] = useState('new'); // 'new' | 'edited'

  // Changes Dialog State
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [selectedItemForChanges, setSelectedItemForChanges] = useState(null);

  // Reviews State
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Password Dialog State
  const [passwordDialog, setPasswordDialog] = useState({
    isOpen: false,
    actionDescription: '',
    requiresReason: false,
    reasonLabel: 'Reason',
    onConfirm: null
  });

  // Confirmation Dialog State
  const [confirmationDialog, setConfirmationDialog] = useState({
    isOpen: false,
    success: true,
    title: '',
    message: ''
  });

  // Hero Settings: Now handled in independent page
  // const [isHeroSettingsOpen, setIsHeroSettingsOpen] = useState(false);
  // const [heroSettings, setHeroSettings] = useState(...)

  // We keep the state commented out or remove entirely to clean up.
  // Removing valid code for clarity as per user request to move functionality.

  const handleSaveHeroSettings = async () => {
    try {
      await platformService.updateConfig('fast_food_hero', heroSettings);
      toast({ title: 'Success', description: 'Hero Settings Saved to Server!' });
      setIsHeroSettingsOpen(false);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save settings. ' + (err.message || ''), variant: 'destructive' });
    }
  };

  // Helper to require password before action
  const requirePassword = (actionDescription, requiresReason = false, reasonLabel = 'Reason') => {
    return new Promise((resolve, reject) => {
      setPasswordDialog({
        isOpen: true,
        actionDescription,
        requiresReason,
        reasonLabel,
        onConfirm: resolve
      });
    });
  };

  // Enhanced Generic Optimistic Update Helper (with password protection)
  const optimisticUpdate = async (id, updates, successMsg, errorMsg, toastTitle = 'Success') => {
    const itemName = fastFoods.find(f => f.id === id)?.name || 'Unknown Item';

    // Create user-friendly action description
    let actionDesc = '';
    let requiresReason = false;
    let reasonLabel = 'Reason';

    if (updates.isActive === false) {
      actionDesc = `Suspend "${itemName}"`;
      requiresReason = true;
      reasonLabel = 'Reason for suspension';
    } else if (updates.isActive === true) {
      actionDesc = `Activate "${itemName}"`;
    } else if (updates.isActive === false) {
      actionDesc = `Hide "${itemName}"`;
    } else if (updates.isActive === true) {
      actionDesc = `Show "${itemName}"`;
    } else if (updates.availabilityMode) {
      actionDesc = `Set "${itemName}" to ${updates.availabilityMode} mode`;
    } else {
      actionDesc = `Update "${itemName}"`;
    }

    let reason = '';
    try {
      reason = await requirePassword(actionDesc, requiresReason, reasonLabel);
    } catch {
      return; // User cancelled
    }
    const previousFoods = [...fastFoods];

    console.log(`[OPTIMISTIC DEBUG] Action for: ${itemName} (ID: ${id})`, { updates });

    // 1. Update UI immediately
    setFastFoods(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));

    try {
      // Include reason in payload if provided
      const payload = reason ? { ...updates, reason } : updates;
      const response = await fastFoodService.updateFastFood(id, payload);
      console.log(`[OPTIMISTIC DEBUG] Server Success for: ${itemName}`, response);

      // Show success confirmation dialog
      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: toastTitle || 'Success',
        message: successMsg || `"${itemName}" has been updated successfully.`
      });
    } catch (err) {
      console.error(`[OPTIMISTIC DEBUG] FAILED for: ${itemName}`, err);
      setFastFoods(previousFoods); // Rollback

      // Show failure confirmation dialog
      setConfirmationDialog({
        isOpen: true,
        success: false,
        title: 'Action Failed',
        message: errorMsg || err.message || `Failed to update "${itemName}". Changes have been reverted.`
      });
    }
  };

  // Selection and Advanced Filtering state
  const [selectedIds, setSelectedIds] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // NEW FILTERS
  const [minPriceFilter, setMinPriceFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkAvailabilityMode, setBulkAvailabilityMode] = useState('OPEN');

  const location = useLocation();
  const listRef = useRef(null);

  // Get active tab from URL search params
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || 'all';

  const setActiveTab = (tab) => {
    const newSearchParams = new URLSearchParams(location.search);
    if (tab === 'all') {
      newSearchParams.delete('tab');
    } else {
      newSearchParams.set('tab', tab);
    }
    navigate(`${location.pathname}?${newSearchParams.toString()}`);
  };

  useEffect(() => {
    const querySearch = searchParams.get('search');
    if (querySearch) {
      setSearchTerm(querySearch);
      
      // Auto-open edit modal if action=edit is passed
      const action = searchParams.get('action');
      if (action === 'edit') {
         // The actual item logic needs the item object. We'll let the user click it from the filtered list.
      }
    }
  }, [location.search]);

  // Fetch fast food items
  const fetchFastFoods = async () => {
    try {
      setLoading(true);

      const isPrivileged = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'super_admin';

      let response;
      if (activeTab === 'deleted') {
        response = await fastFoodService.getDeletedFastFoods();
      } else if (isPrivileged) {
        response = await fastFoodService.getAllFastFoods({ includeInactive: true });
      } else {
        // For sellers, fetch only their own items
        response = await fastFoodService.getVendorFastFoods('me');
      }

      // Handle response structure variations
      if (Array.isArray(response)) {
        setFastFoods(response);
      } else if (response?.success && Array.isArray(response.data)) {
        setFastFoods(response.data);
      } else if (Array.isArray(response?.data)) {
        setFastFoods(response.data);
      } else {
        setFastFoods([]);
      }

    } catch (error) {
      console.error('Error fetching fast food items:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch fast food items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleListProduct = (item) => {
    setSelectedItemForListing(item);
    setFormMode('edit');
    setShowListForm(true);
  };

  const handleEditProduct = (item) => {
    setSelectedItemForListing(item);
    setFormMode('edit');
    setShowListForm(true);
  };

  const handleViewItem = (item) => {
    setSelectedItemForListing(item);
    setFormMode('view');
    setShowListForm(true);
  };

  const handleViewChanges = (item) => {
    setSelectedItemForChanges(item);
    setShowChangesDialog(true);
  };

  const handleApproveChanges = async (item) => {
    try {
      const reason = await requirePassword(`Approve changes to "${item.name}"`, false);
      await fastFoodService.updateFastFood(item.id, { status: 'active', reviewStatus: 'approved' });
      fetchFastFoods();
      setShowChangesDialog(false);
      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: 'Changes Approved',
        message: `Changes to "${item.name}" have been approved and the item is now live.`
      });
    } catch (err) {
      if (err && err.message) {
        setConfirmationDialog({
          isOpen: true,
          success: false,
          title: 'Approval Failed',
          message: err.message || 'Failed to approve changes.'
        });
      }
    }
  };

  const handleRejectChanges = async (item) => {
    try {
      const reason = await requirePassword(`Reject changes to "${item.name}"`, true, 'Reason for rejection');
      await fastFoodService.updateFastFood(item.id, { status: 'rejected', reviewStatus: 'rejected', rejectionReason: reason });
      fetchFastFoods();
      setShowChangesDialog(false);
      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: 'Changes Rejected',
        message: `Changes to "${item.name}" have been rejected.`
      });
    } catch (err) {
      if (err && err.message) {
        setConfirmationDialog({
          isOpen: true,
          success: false,
          title: 'Rejection Failed',
          message: err.message || 'Failed to reject changes.'
        });
      }
    }
  };

  const handleRestoreItem = async (item) => {
    if (!window.confirm(`Are you sure you want to RESTORE "${item.name}"? It will be returned to the active menu immediately.`)) return;
    try {
      setLoading(true);
      await fastFoodService.restoreFastFood(item.id);
      toast({ title: 'Restored', description: `"${item.name}" has been restored successfully.` });
      fetchFastFoods();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Restore Failed', description: err.message || 'Failed to restore item.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDeleteItem = async (item) => {
    if (!window.confirm(`⚠️ PERMANENT DELETE: Are you sure you want to PURGE "${item.name}"? This action cannot be undone.`)) return;
    try {
      const password = await requirePassword(`Permanently Purge "${item.name}"`, false);
      setLoading(true);
      await fastFoodService.permanentlyDeleteFastFood(item.id);
      toast({ title: 'Purged', description: `"${item.name}" has been permanently removed.` });
      fetchFastFoods();
    } catch (err) {
      if (err?.message) toast({ variant: 'destructive', title: 'Purge Failed', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFastFoods();
  }, [activeTab]);

  // Fetch reviews when tab is active
  useEffect(() => {
    if (activeTab === 'reviews') {
      fetchReviews();
    }
  }, [activeTab]);

  const fetchReviews = async () => {
    setReviewsLoading(true);
    try {
      const isPrivileged = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'super_admin';

      let result;
      if (isPrivileged) {
        result = await reviewService.getAllReviews(); // Fetch all for admin
      } else {
        result = await reviewService.getVendorReviews('me'); // Fetch only for this vendor
      }

      if (result.success) {
        setReviews(result.data);
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load reviews', variant: 'destructive' });
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleReviewAction = async (id, action) => {
    try {
      if (action === 'delete') {
        await reviewService.deleteReview(id);
        toast({ title: 'Deleted', description: 'Review deleted.' });
      } else {
        await reviewService.updateReviewStatus(id, action); // 'approved' or 'rejected'
        toast({ title: 'Updated', description: `Review marked as ${action}.` });
      }
      fetchReviews(); // Refresh
    } catch (err) {
      toast({ title: 'Error', description: 'Action failed', variant: 'destructive' });
    }
  };

  // Filter fast foods based on search, category, and status
  const filteredFastFoods = useMemo(() => {
    return fastFoods.filter(fastFood => {
      // 1. Base Search (Item Name / Desc)
      const matchesSearch = fastFood.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (fastFood.shortDescription && fastFood.shortDescription.toLowerCase().includes(searchTerm.toLowerCase()));

      if (activeTab === 'deleted') return matchesSearch;

      // 2. Tab Context
      let matchesTab = true;
      if (activeTab === 'approve') {
        matchesTab = fastFood.reviewStatus === 'pending';
        // Sub-filter for New vs Edited
        if (matchesTab) {
          if (reviewSubTab === 'new') {
            // New Items: Not previously approved
            matchesTab = !fastFood.hasBeenApproved;
          } else {
            // Edited Items: Previously approved
            matchesTab = fastFood.hasBeenApproved;
          }
        }
      } else if (activeTab === 'approved') {
        matchesTab = fastFood.approved === true; // Only show approved items in 'all' tab
      } else if (activeTab === 'mine') {
        // My Fast Food: Only show items created by this super admin
        matchesTab = fastFood.vendor === user?.id;
      }

      // 3. Status Filter (Enhanced)
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'active') matchesStatus = fastFood.isActive && fastFood.approved;
        else if (statusFilter === 'pending') matchesStatus = fastFood.reviewStatus === 'pending';
        else if (statusFilter === 'suspended') matchesStatus = !fastFood.isActive;
        else if (statusFilter === 'hidden') matchesStatus = !fastFood.isActive;
        else if (statusFilter === 'available') matchesStatus = fastFoodService.getAvailabilityStatus(fastFood).isAvailable;
      }

      const matchesCategory = categoryFilter === 'all' || fastFood.category === categoryFilter;

      // 4. Price Range Filter
      const price = parseFloat(fastFood.displayPrice || 0);
      const matchesMinPrice = !minPriceFilter || price >= parseFloat(minPriceFilter);
      const matchesMaxPrice = !maxPriceFilter || price <= parseFloat(maxPriceFilter);

      return matchesSearch && matchesStatus && matchesTab &&
        matchesCategory &&
        matchesMinPrice && matchesMaxPrice;
    });
  }, [fastFoods, searchTerm, statusFilter, activeTab, categoryFilter, minPriceFilter, maxPriceFilter, reviewSubTab]);

  // Handle individual selection
  const handleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Handle select all for current filtered list
  const handleSelectAll = (items) => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(item => item.id));
    }
  };

  // Bulk operation logic (with password protection)
  const handleBulkAction = async (action) => {
    if (selectedIds.length === 0) return;

    const itemsToProcess = filteredFastFoods.filter(item => selectedIds.includes(item.id));
    const count = selectedIds.length;
    const itemWord = count === 1 ? 'item' : 'items';

    const actionDescriptions = {
      delete: `Delete ${count} ${itemWord}`,
      hide: `Hide ${count} ${itemWord} from menu`,
      show: `Show ${count} ${itemWord} on menu`,
      suspend: `Suspend ${count} ${itemWord}`,
      unsuspend: `Unsuspend ${count} ${itemWord}`
    };

    // Determine if reason is required
    const requiresReason = action === 'delete' || action === 'suspend';
    const reasonLabel = action === 'delete' ? 'Reason for deletion' : 'Reason for suspension';

    let reason = '';
    try {
      reason = await requirePassword(
        actionDescriptions[action] || `Perform "${action}" on ${count} ${itemWord}`,
        requiresReason,
        reasonLabel
      );
    } catch {
      return; // User cancelled
    }
    if (action === 'delete') {
      setBulkLoading(true);
      try {
        await Promise.all(itemsToProcess.map(item => fastFoodService.deleteFastFood(item.id, reason)));
        setConfirmationDialog({
          isOpen: true,
          success: true,
          title: 'Bulk Delete Successful',
          message: `Successfully deleted ${selectedIds.length} item(s).`
        });
        setSelectedIds([]);
        fetchFastFoods();
      } catch (err) {
        setConfirmationDialog({
          isOpen: true,
          success: false,
          title: 'Bulk Delete Failed',
          message: err.message || 'Failed to delete some items. Please try again.'
        });
      } finally {
        setBulkLoading(false);
      }
      return;
    }

    // Optimistic Update for other actions
    setBulkLoading(true);
    const previousFoods = [...fastFoods];

    // Determine updates
    let updates = {};
    if (action === 'hide') updates = { isActive: false };
    else if (action === 'show') updates = { isActive: true };
    else if (action === 'suspend') updates = { status: 'suspended' };
    else if (action === 'unsuspend') updates = { status: 'active' };

    console.log(`[OPTIMISTIC DEBUG] Bulk ${action} for ${selectedIds.length} items`, updates);

    // 1. Update UI immediately
    setFastFoods(prev => prev.map(f =>
      selectedIds.includes(f.id) ? { ...f, ...updates } : f
    ));

    try {
      const promises = selectedIds.map(id => {
        // Include reason for suspend actions
        const payload = (action === 'suspend' && reason) ? { ...updates, reason } : updates;
        return fastFoodService.updateFastFood(id, payload);
      });
      await Promise.all(promises);

      setConfirmationDialog({
        isOpen: true,
        success: true,
        title: `Bulk ${action.charAt(0).toUpperCase() + action.slice(1)} Successful`,
        message: `Successfully ${action === 'hide' ? 'hid' : action === 'show' ? 'showed' : action === 'suspend' ? 'suspended' : 'unsuspended'} ${selectedIds.length} item(s).`
      });
      setSelectedIds([]);
    } catch (err) {
      console.error(`[OPTIMISTIC DEBUG] Bulk ${action} FAILED`, err);
      setFastFoods(previousFoods); // Rollback
      setConfirmationDialog({
        isOpen: true,
        success: false,
        title: `Bulk ${action.charAt(0).toUpperCase() + action.slice(1)} Failed`,
        message: err.message || `Failed to ${action} some items. Changes have been reverted.`
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // Bulk Availability Mode logic (with password protection)
  const getAvailabilityModePayload = (mode) => {
    if (mode === 'OPEN') return { availabilityMode: 'OPEN', isAvailable: true };
    if (mode === 'CLOSED') return { availabilityMode: 'CLOSED', isAvailable: false };
    return { availabilityMode: 'AUTO', isAvailable: true };
  };

  const handleBulkAvailabilityMode = async (mode = bulkAvailabilityMode) => {
    if (selectedIds.length === 0) return;
    if (!mode) return;

    // Filter out null/undefined IDs
    const validIds = selectedIds.filter(id => id != null);
    if (validIds.length === 0) {
      toast({
        title: "No Valid Items",
        description: "Please select valid items to update.",
        variant: 'destructive'
      });
      return;
    }

    try {
      await requirePassword(`Set ${validIds.length} item(s) to ${mode} mode`);
    } catch {
      return; // User cancelled
    }

    console.log(`[DEBUG] Bulk Availability action triggered for ${validIds.length} items. Target Mode: ${mode}`);
    setBulkLoading(true);

    const previousFoods = [...fastFoods]; // Rollback cache
    const modePayload = getAvailabilityModePayload(mode);
    try {
      // 1. Optimistic update
      setFastFoods(prev => prev.map(f =>
        validIds.includes(f.id) ? { ...f, ...modePayload } : f
      ));

      // 2. Background task
      const promises = validIds.map(id => {
        return fastFoodService.updateFastFood(id, modePayload);
      });

      const results = await Promise.all(promises);
      console.log(`[DEBUG] All bulk updates completed:`, results);

      toast({
        title: "Bulk Mode Updated",
        description: `Successfully set ${validIds.length} items to ${mode}.`
      });

      setSelectedIds([]);
    } catch (error) {
      console.error('Bulk availability error:', error);
      setFastFoods(previousFoods); // Rollback
      toast({
        title: "Operation Failed",
        description: "Restoring previous product states.",
        variant: 'destructive'
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // Extract unique categories for filter
  const uniqueCategories = useMemo(() => {
    const cats = new Set(fastFoods.map(item => item.category).filter(Boolean));
    return Array.from(cats);
  }, [fastFoods]);

  // Aggregate all reviews from all fast food items
  const allReviews = useMemo(() => {
    const reviews = [];
    fastFoods.forEach(item => {
      if (item.reviews && Array.isArray(item.reviews)) {
        item.reviews.forEach(review => {
          reviews.push({
            ...review,
            itemName: item.name,
            itemId: item.id
          });
        });
      }
    });
    // Sort reviews by date descending if available
    return reviews.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [fastFoods]);

  const scrollToList = () => {
    if (listRef.current) {
      listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-transparent pb-32">
      <div className="w-full">

        {/* Tab Navigation Bar - Docked at the top */}
        <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-md px-0 py-2 mb-3 border-b border-gray-200 shadow-sm">
          <div className="w-full flex items-center justify-between">
            <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-gray-100 overflow-x-auto w-full scrollbar-transparent items-center">
              {/* Feature Tabs */}
              {[
                { id: 'all', label: 'All Items', icon: <Utensils className="mr-1" size={14} /> },
                { id: 'create', label: 'Create', icon: <Plus className="mr-1" size={14} /> },
                { id: 'approve', label: isPrivileged ? 'Review' : 'Pending', icon: <CheckCircle className="mr-1" size={14} /> },
                { id: 'approved', label: isPrivileged ? 'Approved' : 'My Approved', icon: <CheckCircle2 className="mr-1" size={14} /> },
                { id: 'deleted', label: 'Recycle Bin', icon: <Trash className="mr-1" size={14} /> },
                ...(user?.role === 'superadmin' || user?.role === 'super_admin' ? [{ id: 'mine', label: 'Mine', icon: <Utensils className="mr-1" size={14} /> }] : []),
                { id: 'reviews', label: 'Reviews', icon: <Star className="mr-1" size={14} /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 'create') {
                      const basePath = location.pathname.includes('/dashboard') ? '/dashboard/fastfood' : '/seller/fast-food';
                      navigate(`${basePath}/new`);
                    } else {
                      setActiveTab(tab.id);
                    }
                  }}
                  className={`flex items-center px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap flex-shrink-0 relative ${activeTab === tab.id
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-orange-600 hover:bg-orange-50'
                    }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.id === 'approve' && fastFoods.filter(item => item.reviewStatus === 'pending').length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg animate-bounce">
                      {fastFoods.filter(item => item.reviewStatus === 'pending').length}
                    </span>
                  )}
                </button>
              ))}

              {/* Separator */}
              <div className="w-[1px] h-5 bg-gray-200 mx-0.5 flex-shrink-0" />

              {/* Action Buttons within scrollable area */}
              {/* Only Super Admin can see Hero Settings */}
              {(user?.role === 'superadmin' || user?.role === 'super_admin') && (
                <Button
                  onClick={() => {
                    const basePath = location.pathname.includes('/seller') ? '/seller/fast-food' : '/dashboard/fastfood';
                    navigate(`${basePath}/hero-settings`);
                  }}
                  variant="outline"
                  className="flex items-center gap-1 border-orange-200 text-orange-700 hover:bg-orange-50 text-xs px-2 py-1.5 flex-shrink-0"
                >
                  <Settings className="w-3 h-3" />
                  Hero
                </Button>
              )}



              <button
                onClick={() => navigate('/dashboard/fastfood/batch-system')}
                className="flex items-center px-3 py-2 text-xs font-semibold rounded-lg text-blue-600 hover:bg-blue-50 border border-blue-200 whitespace-nowrap flex-shrink-0"
              >
                <List className="mr-1 h-3 w-3" />
                Batch
              </button>

              <button
                onClick={() => navigate('/dashboard/fastfood/pickup-points')}
                className="flex items-center px-3 py-2 text-xs font-semibold rounded-lg text-purple-600 hover:bg-purple-50 border border-purple-200 whitespace-nowrap flex-shrink-0"
              >
                <MapPin className="mr-1 h-3 w-3" />
                Pickup
              </button>

              <button
                onClick={() => navigate('/fastfood?tab=live', { state: { returnTo: location.pathname, returnLabel: 'Back to FastFood Management' } })}
                className="flex items-center px-3 py-2 text-xs font-semibold rounded-lg text-orange-600 hover:bg-orange-50 border border-orange-200 whitespace-nowrap flex-shrink-0"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Live
              </button>

            </div>
          </div>
        </div>

        <div className="px-0">

          {activeTab !== 'reviews' && (
            <>
              {/* Review Sub-Tabs (New vs Edited) - MOVED HERE FOR VISIBILITY */}
              {activeTab === 'approve' && (
                <div className="flex gap-2 mb-4 px-0 animate-in slide-in-from-top duration-300">
                  <button
                    onClick={() => setReviewSubTab('new')}
                    className={`flex-1 py-4 px-4 rounded-xl border-2 transition-all font-bold flex items-center justify-center gap-3 shadow-sm ${reviewSubTab === 'new'
                      ? 'bg-orange-600 text-white border-orange-600 shadow-orange-200 ring-2 ring-orange-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300 hover:text-orange-600'
                      }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${reviewSubTab === 'new' ? 'bg-white' : 'bg-orange-500'}`} />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="uppercase text-xs opacity-70 mb-0.5">New Items</span>
                      <span className="text-lg font-black tracking-tight">Pending Approval</span>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${reviewSubTab === 'new' ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>
                      {fastFoods.filter(f => f.reviewStatus === 'pending' && !f.hasBeenApproved).length}
                    </span>
                  </button>

                  <button
                    onClick={() => setReviewSubTab('edited')}
                    className={`flex-1 py-4 px-4 rounded-xl border-2 transition-all font-bold flex items-center justify-center gap-3 shadow-sm ${reviewSubTab === 'edited'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200 ring-2 ring-blue-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                      }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${reviewSubTab === 'edited' ? 'bg-white' : 'bg-blue-500'}`} />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="uppercase text-xs opacity-70 mb-0.5">Edited Items</span>
                      <span className="text-lg font-black tracking-tight">Pending Review</span>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${reviewSubTab === 'edited' ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>
                      {fastFoods.filter(f => f.reviewStatus === 'pending' && f.hasBeenApproved).length}
                    </span>
                  </button>
                </div>
              )}

              {/* 3-State legend / Helpful Tips - Hide in Review Mode */}
              {activeTab !== 'approve' && (
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl shadow-md p-2 sm:p-3 mb-4 text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Utensils size={60} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="bg-white/20 p-1 rounded-md"><Sliders size={14} /></span>
                      <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Availability Legend</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                      <div className="flex items-center gap-2 bg-white/10 p-1.5 sm:p-2.5 rounded-lg border border-white/10">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-500 flex items-center justify-center border border-white/30 shadow-sm">
                          <Clock size={12} className="sm:w-4 sm:h-4" />
                        </div>
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase">Schedule</p>
                          <p className="hidden sm:block text-[9px] opacity-80 leading-tight">Follows your weekly calendar.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-white/10 p-1.5 sm:p-2.5 rounded-lg border border-white/10">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-green-500 flex items-center justify-center border border-white/30 shadow-sm animate-pulse">
                          <Utensils size={12} className="sm:w-4 sm:h-4" />
                        </div>
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase">Open</p>
                          <p className="hidden sm:block text-[9px] opacity-80 leading-tight">Instant open. Ignores schedule.</p>
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex items-center gap-2 bg-white/10 p-1.5 sm:p-2.5 rounded-lg border border-white/10">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-red-500 flex items-center justify-center border border-white/30 shadow-sm">
                          <Ban size={12} className="sm:w-4 sm:h-4" />
                        </div>
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase">Closed</p>
                          <p className="hidden sm:block text-[9px] opacity-80 leading-tight">Instant close. Ignores schedule.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}



              {/* Action Bar */}
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6 border border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search fast food items, categories, or descriptions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-12 py-6 border-gray-200 focus:border-orange-500 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              {activeTab !== 'approve' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6">
                  <div
                    className="bg-white rounded-xl shadow-sm p-3 sm:p-6 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      scrollToList();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] sm:text-sm text-gray-600 uppercase font-medium">Total Items</p>
                        <p className="text-lg sm:text-2xl font-bold text-gray-900">{fastFoods.length}</p>
                      </div>
                      <Utensils className="text-orange-500 h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                  </div>

                  <div
                    className="bg-white rounded-xl shadow-sm p-3 sm:p-6 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setStatusFilter('active');
                      scrollToList();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] sm:text-sm text-gray-600 uppercase font-medium">Active Items</p>
                        <p className="text-lg sm:text-2xl font-bold text-green-600">
                          {fastFoods.filter(item => item.isActive).length}
                        </p>
                      </div>
                      <Eye className="text-green-500 h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                  </div>

                  <div
                    className="bg-white rounded-xl shadow-sm p-3 sm:p-6 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setStatusFilter('all');
                      scrollToList();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] sm:text-sm text-gray-600 uppercase font-medium">Categories</p>
                        <p className="text-lg sm:text-2xl font-bold text-blue-600">
                          {new Set(fastFoods.map(item => item.category)).size}
                        </p>
                      </div>
                      <Search className="text-blue-500 h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                  </div>

                  <div
                    className="bg-white rounded-xl shadow-sm p-3 sm:p-6 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setStatusFilter('available');
                      scrollToList();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] sm:text-sm text-gray-600 uppercase font-medium">Available Now</p>
                        <p className="text-lg sm:text-2xl font-bold text-purple-600">
                          {fastFoods.filter(item => {
                            const availability = fastFoodService.getAvailabilityStatus(item);
                            return availability.isAvailable;
                          }).length}
                        </p>
                      </div>
                      <Clock className="text-purple-500 h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Dynamic Content View */}

          {activeTab === 'reviews' ? (
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">FastFood Reviews</h2>
                <p className="text-sm text-gray-500 mt-1">Manage and respond to customer reviews for all fast food items</p>
              </div>
              {reviewsLoading ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="animate-spin text-orange-500 h-8 w-8" />
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-12">
                  <Star className="mx-auto text-gray-300 text-4xl h-10 w-10 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No reviews found</h3>
                  <p className="text-gray-500">Reviews submitted by customers will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {reviews.map((review) => (
                    <div key={review.id} className="p-6 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold mr-4">
                            {review.User?.username?.[0]?.toUpperCase() || <User size={20} />}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {review.User?.username || 'Anonymous'} <span className="text-xs text-gray-400 font-normal">({review.User?.email})</span>
                            </h4>
                            <div className="flex items-center text-sm text-gray-500 mt-0.5">
                              <span className="flex mr-2">
                                {[...Array(5)].map((_, i) => (
                                  <Star key={i} className={`h-3 w-3 ${i < (review.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                ))}
                              </span>
                              <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                              <span className="mx-2">•</span>
                              <span className="text-orange-600 font-medium">on {review.FastFood?.name || 'Unknown Item'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${review.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                            review.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                            {review.status}
                          </span>
                          <div className="text-xs text-gray-400">ID: #{review.id}</div>
                        </div>
                      </div>
                      <div className="mt-4 pl-14">
                        <div className="flex items-start bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <MessageSquare className="text-gray-400 mt-0.5 mr-2 flex-shrink-0 h-3 w-3" />
                          <p className="text-gray-700 text-sm leading-relaxed italic">
                            "{review.comment || 'No comment provided'}"
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end space-x-2 pl-14">
                        {review.status === 'pending' && (
                          <>
                            <Button size="sm" onClick={() => handleReviewAction(review.id, 'approved')} className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white shadow-sm">
                              <Check size={14} className="mr-1" /> Approve
                            </Button>
                            <Button size="sm" onClick={() => handleReviewAction(review.id, 'rejected')} variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 shadow-sm">
                              <Ban size={14} className="mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        <Button size="sm" onClick={() => handleReviewAction(review.id, 'delete')} variant="ghost" className="h-8 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 size={14} className="mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* FastFood Grid (All, Approve, Approved) */
            <div ref={listRef}>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">
                      {activeTab === 'approve' ? 'Pending Approval' : activeTab === 'approved' ? 'Approved Items' : 'All FastFood Items'}
                      <span className="ml-2 px-3 py-1 bg-orange-100 text-orange-600 text-sm rounded-full">
                        {filteredFastFoods.length} Items
                      </span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {activeTab === 'approve'
                        ? 'Review and approve new fast food entries'
                        : activeTab === 'approved'
                          ? 'Live items currently visible to customers'
                          : 'Manage all fast food items on the platform'
                      }
                    </p>
                  </div>



                  {/* Advanced Filters */}
                  {activeTab === 'all' && (
                    <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">

                      {/* Price Range */}
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          placeholder="Min KES"
                          value={minPriceFilter}
                          onChange={(e) => setMinPriceFilter(e.target.value)}
                          className="w-20 bg-gray-50 border-gray-200 text-xs focus:ring-orange-500 rounded-lg px-2"
                        />
                        <span className="text-gray-300">-</span>
                        <Input
                          type="number"
                          placeholder="Max KES"
                          value={maxPriceFilter}
                          onChange={(e) => setMaxPriceFilter(e.target.value)}
                          className="w-20 bg-gray-50 border-gray-200 text-xs focus:ring-orange-500 rounded-lg px-2"
                        />
                      </div>

                      {/* Category Filter */}
                      <div className="relative">
                        <select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-[120px] pl-3 pr-8 py-2 font-medium"
                        >
                          <option value="all">All Cats</option>
                          {uniqueCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>

                      {/* Status Filter */}
                      <div className="relative">
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-[110px] pl-3 pr-8 py-2 font-medium"
                        >
                          <option value="all">All Status</option>
                          <option value="active">Active/Live</option>
                          <option value="pending">Pending</option>
                          <option value="suspended">Suspended</option>
                          <option value="hidden">Hidden</option>
                          <option value="available">Available Now</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>

                      <button
                        onClick={() => {
                          setCategoryFilter('all');
                          setSearchTerm('');
                          setStatusFilter('all');
                          setMinPriceFilter('');
                          setMaxPriceFilter('');
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 rounded-lg border border-transparent hover:border-red-100"
                        title="Reset All Filters"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bulk Actions Bar */}
              {selectedIds.length > 0 && activeTab === 'all' && (
                <div className="bg-orange-600 text-white rounded-xl shadow-lg p-4 mb-6 flex items-center justify-between sticky top-40 z-10 animate-in slide-in-from-top duration-300">
                  <div className="flex items-center">
                    <div className="bg-white/20 p-2 rounded-lg mr-4">
                      <CheckSquare size={20} />
                    </div>
                    <div>
                      <span className="font-bold">{selectedIds.length}</span> items selected
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60 mr-2">Bulk Actions:</span>
                    <button
                      onClick={() => handleBulkAction('show')}
                      className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all"
                    >
                      <Eye size={14} className="mr-1.5" /> Show
                    </button>
                    <button
                      onClick={() => handleBulkAction('hide')}
                      className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all"
                    >
                      <EyeOff size={14} className="mr-1.5" /> Hide
                    </button>
                    <div className="w-[1px] h-4 bg-white/20 mx-1" />
                    <button
                      onClick={() => handleBulkAction('unsuspend')}
                      className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all"
                    >
                      <Check size={14} className="mr-1.5" /> Unsuspend
                    </button>
                    <button
                      onClick={() => handleBulkAction('suspend')}
                      className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all"
                    >
                      <Ban size={14} className="mr-1.5" /> Suspend
                    </button>
                    <div className="w-[1px] h-4 bg-white/20 mx-1" />
                    <select
                      value={bulkAvailabilityMode}
                      onChange={(e) => setBulkAvailabilityMode(e.target.value)}
                      className="px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-[10px] font-bold text-white outline-none"
                      title="Select availability mode to apply"
                    >
                      <option value="AUTO" className="text-gray-900">AUTO</option>
                      <option value="OPEN" className="text-gray-900">OPEN</option>
                      <option value="CLOSED" className="text-gray-900">CLOSED</option>
                    </select>
                    <button
                      onClick={() => handleBulkAvailabilityMode()}
                      className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold transition-all border border-white/10"
                    >
                      Apply Mode
                    </button>
                    <div className="w-[1px] h-4 bg-white/20 mx-1" />
                    <button
                      onClick={() => handleBulkAction('delete')}
                      className="flex items-center px-3 py-1.5 bg-red-500 hover:bg-red-400 rounded-lg text-xs font-bold transition-all border border-red-400/50"
                    >
                      <Trash2 size={14} className="mr-1.5" /> Delete
                    </button>
                    <button
                      onClick={() => setSelectedIds([])}
                      className="ml-4 p-1.5 hover:bg-white/10 rounded-full transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col justify-center items-center py-32 bg-white rounded-xl shadow-sm border border-gray-100">
                  <Loader2 className="animate-spin text-orange-500 text-4xl h-10 w-10 mb-4" />
                  <span className="text-gray-500 font-medium">Syncing fast food data...</span>
                </div>
              ) : filteredFastFoods.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Utensils className="text-gray-300 text-4xl h-10 w-10" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No fast food items found</h3>
                  <p className="text-gray-500 max-w-xs mx-auto mb-8">
                    {searchTerm
                      ? `No results for "${searchTerm}". Try a different search term.`
                      : 'Get started by adding your first fast food item to the platform.'
                    }
                  </p>
                  {!searchTerm && (
                    <Button
                      onClick={() => {
                        const basePath = location.pathname.includes('/dashboard') ? '/dashboard/fastfood' : '/seller/fast-food';
                        navigate(`${basePath}/new`);
                      }}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-6 rounded-xl shadow-lg shadow-orange-200 transition-all hover:-translate-y-1"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Your First Item
                    </Button>
                  )}
                </div>
              ) : (
                <div className="pb-10">
                  {activeTab === 'deleted' ? (
                    renderDeletedFastFoodTable(filteredFastFoods, {
                      handleRestoreItem,
                      handlePermanentDeleteItem,
                      fetchFastFoods,
                      toast,
                      navigate
                    })
                  ) : activeTab === 'all' ? (
                    <>
                      {/* Mobile: card grid */}
                      <div className="block md:hidden">
                        {renderFastFoodGrid(filteredFastFoods, {
                          handleViewItem,
                          handleEditItem: (item) => {
                            setSelectedItemForListing(item);
                            setFormMode('edit');
                            setShowListForm(true);
                          },
                          handleListProduct,
                          fetchFastFoods,
                          toast,
                          navigate,
                          optimisticUpdate,
                          requirePassword,
                          fastFoodService,
                          setConfirmationDialog,
                          handleViewChanges,
                          user,
                          isPrivileged
                        })}
                      </div>
                      {/* Desktop: full table */}
                      <div className="hidden md:block">
                        {renderFastFoodTable(filteredFastFoods, {
                          handleViewItem,
                          handleEditItem: (item) => {
                            setSelectedItemForListing(item);
                            setFormMode('edit');
                            setShowListForm(true);
                          },
                          handleListProduct,
                          fetchFastFoods,
                          toast,
                          selectedIds,
                          onSelect: handleSelect,
                          onSelectAll: () => handleSelectAll(filteredFastFoods),
                          optimisticUpdate,
                          requirePassword,
                          fastFoodService,
                          user,
                          isPrivileged,
                          navigate,
                          setConfirmationDialog,
                          handleViewChanges
                        })}
                      </div>
                    </>
                  ) : (
                    renderFastFoodGrid(filteredFastFoods, {
                      handleViewItem,
                      handleEditItem: (item) => {
                        setSelectedItemForListing(item);
                        setFormMode('edit');
                        setShowListForm(true);
                      },
                      handleListProduct,
                      fetchFastFoods,
                      toast,
                      navigate,
                      optimisticUpdate,
                      requirePassword,
                      fastFoodService,
                      setConfirmationDialog,
                      handleViewChanges,
                      user,
                      isPrivileged
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* List Modal */}
          {showListForm && selectedItemForListing && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-3 sm:p-6 border-b border-gray-100 flex justify-between items-start sm:items-center bg-gray-50/50">
                  <div className="min-w-0 pr-2">
                    <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
                      {formMode === 'view' ? 'View FastFood' : (selectedItemForListing?.status === 'pending' && isPrivileged) ? 'List FastFood' : 'Edit FastFood'}
                    </h2>
                    <p className="text-gray-500 text-xs sm:text-sm mt-0.5 truncate">
                      {formMode === 'view'
                        ? `View details for "${selectedItemForListing.name}"`
                        : (selectedItemForListing?.status === 'pending' && isPrivileged)
                          ? `Review and publish "${selectedItemForListing.name}"`
                          : `Update "${selectedItemForListing.name}"`}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowListForm(false)}
                    className="flex-shrink-0 p-2 hover:bg-white hover:shadow-md rounded-full transition-all text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-0">
                  <FastFoodForm
                    product={selectedItemForListing}
                    id={selectedItemForListing.id}
                    mode={formMode}
                    listMode={isPrivileged && selectedItemForListing?.reviewStatus === 'pending' && formMode === 'edit'}
                    isSellerContext={!isPrivileged} // Seller view for non-admins
                    onAfterSave={() => {
                      console.log('🔄 FastFood background refresh (Modal) triggered');
                      fetchFastFoods();
                    }}
                    onSuccess={(isEditMode) => {
                      console.log('✅ FastFood onSuccess called (Modal), isEditMode:', isEditMode);
                      // The success dialog is now handled by FastFoodForm internally.
                      // When the user closes the form's dialog, it calls onSuccess.
                      // We just need to ensure data is fresh and close the modal container.
                      fetchFastFoods();
                      setShowListForm(false);
                      setSelectedItemForListing(null);
                    }}
                    onEdit={() => setFormMode('edit')}
                    onCancel={() => setShowListForm(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Redundant Parent Success Dialog Removed - Managed by Child Forms */}
        </div>

        {/* View Changes Dialog */}
        {showChangesDialog && selectedItemForChanges && (
          <Dialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  Review Changes: {selectedItemForChanges.name}
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-2">
                  {selectedItemForChanges.hasBeenApproved
                    ? 'Seller has edited this previously approved item. Review the changes below.'
                    : 'New item pending approval'}
                </p>
              </DialogHeader>

              {/* Item Card Preview */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-700">📸 Item Preview</h3>
                <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-50/30">
                  <FastFoodCard
                    item={selectedItemForChanges}
                    navigate={navigate}
                    clickable={false}
                  />
                </div>
              </div>

              {/* Changed Fields Notice */}
              {selectedItemForChanges.hasBeenApproved && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4">
                  <div className="flex items-start">
                    <MessageSquare className="h-5 w-5 text-amber-600 mr-2 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-800">Edited Item</h4>
                      <p className="text-xs text-amber-700 mt-1">
                        This item was previously approved and is currently live. The seller has submitted updates for review.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Change Log specifically for Approved Editing */}
              {selectedItemForChanges.changes && selectedItemForChanges.changes.length > 0 && (
                <div className="mb-6 border rounded-lg overflow-hidden border-amber-200">
                  <div className="bg-amber-100 px-4 py-2 border-b border-amber-200 flex justify-between items-center">
                    <h4 className="text-sm font-bold text-amber-900 flex items-center">
                      <span className="mr-2">📝</span> Change Log
                    </h4>
                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      {selectedItemForChanges.changes.length} Updates
                    </span>
                  </div>
                  <div className="bg-white divide-y divide-gray-100 max-h-96 overflow-y-auto">
                    <div className="bg-white border rounded-lg overflow-hidden border-amber-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-amber-50">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">
                              Attribute
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-red-800 uppercase tracking-wider">
                              Original Value (Before)
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                              New Value (After)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {(Array.isArray(selectedItemForChanges.changes) ? selectedItemForChanges.changes : []).map((change, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700 capitalize">
                                {change.field.replace(/([A-Z])/g, ' $1').trim()}
                              </td>
                              <td className="px-6 py-4 text-sm text-red-600 bg-red-50/30">
                                <ChangeValueDisplay value={change.oldValue} fieldName={change.field} />
                              </td>
                              <td className="px-6 py-4 text-sm text-green-700 bg-green-50/30">
                                <ChangeValueDisplay value={change.newValue} fieldName={change.field} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!Array.isArray(selectedItemForChanges.changes) || selectedItemForChanges.changes.length === 0) && (
                        <div className="p-4 text-center text-gray-500 italic">No specific field changes detected.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Price</p>
                  <p className="text-lg font-bold text-green-700">
                    {selectedItemForChanges.displayPrice ? `KES ${selectedItemForChanges.displayPrice}` : 'Not Set'}
                  </p>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                  <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Prep Time</p>
                  <p className="text-lg font-bold text-orange-700">{selectedItemForChanges.preparationTimeMinutes} min</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Category</p>
                  <p className="text-lg font-bold text-blue-700">{selectedItemForChanges.category}</p>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                  <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Status</p>
                  <p className="text-lg font-bold text-purple-700">{selectedItemForChanges.status?.toUpperCase()}</p>
                </div>
              </div>

              {/* Detailed Content Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Description */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 border-b pb-2 mb-2">Description</h4>
                    <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-md">
                      {selectedItemForChanges.description || selectedItemForChanges.shortDescription || 'No description provided.'}
                    </p>
                  </div>

                  {/* Ingredients */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 border-b pb-2 mb-2">Ingredients</h4>
                    <div className="flex flex-col gap-1.5">
                      {(() => {
                        const recursiveParse = (val) => {
                          if (typeof val !== 'string') return val;
                          const trimmed = val.trim();
                          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                            (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
                            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
                            try {
                              const parsed = JSON.parse(val);
                              if (parsed !== val) return recursiveParse(parsed);
                            } catch (e) { }
                          }
                          return val;
                        };

                        let items = recursiveParse(selectedItemForChanges.ingredients);
                        if (typeof items === 'string' && items.includes('\n')) {
                          items = items.split('\n').filter(Boolean);
                        }

                        if (Array.isArray(items)) {
                          return items.length > 0 ? (
                            items.map((ing, idx) => {
                              const parsedIng = recursiveParse(ing);
                              let label = '';
                              let qty = '';

                              if (parsedIng && typeof parsedIng === 'object') {
                                // Try to unwrap name if it's stringified
                                const unwrappedName = recursiveParse(parsedIng.name);

                                if (Array.isArray(unwrappedName)) {
                                  // Found a nested list! Show the first one or join them?
                                  // For simplicity in this small UI, we'll just show them as multiple entries if possible
                                  // BUT this map returns one div per idx. So we join them.
                                  label = unwrappedName.map(sub => {
                                    const p = recursiveParse(sub);
                                    return p.name || (typeof p === 'string' ? p : '?');
                                  }).join(', ');
                                } else if (typeof unwrappedName === 'string') {
                                  label = unwrappedName;
                                } else {
                                  label = parsedIng.name || JSON.stringify(parsedIng);
                                }

                                qty = parsedIng.quantity ? ` (${parsedIng.quantity} ${parsedIng.unit || ''})` : '';
                              } else {
                                label = typeof parsedIng === 'string' ? parsedIng : JSON.stringify(parsedIng);
                              }

                              return (
                                <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 text-yellow-800 text-xs rounded-lg border border-yellow-200/50 shadow-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
                                  <span className="font-medium">
                                    {label}{qty}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-sm text-gray-400 italic">No ingredients listed</span>
                          );
                        }

                        return <p className="text-sm text-gray-600 px-2">{items || 'No ingredients listed'}</p>;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Tags & Meta */}
                <div className="space-y-4">
                  {/* Tags */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 border-b pb-2 mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        let items = selectedItemForChanges.tags;
                        if (typeof items === 'string') {
                          try { items = JSON.parse(items); } catch (e) { items = []; }
                        }
                        if (!Array.isArray(items)) items = [];

                        return items.length > 0 ? (
                          items.map((tag, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                              #{tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400 italic">No tags</span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Timeline info */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 border-b pb-2 mb-2">Timeline</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Updated:</span>
                        <span className="font-medium text-gray-900">{new Date(selectedItemForChanges.updatedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Created At:</span>
                        <span className="font-medium text-gray-900">{new Date(selectedItemForChanges.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <Button
                  onClick={() => {
                    setShowChangesDialog(false);
                    handleViewItem(selectedItemForChanges);
                  }}
                  variant="outline"
                  className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Open in Form
                </Button>
                <Button
                  onClick={() => handleApproveChanges(selectedItemForChanges)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Changes
                </Button>
                <Button
                  onClick={() => handleRejectChanges(selectedItemForChanges)}
                  variant="destructive"
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Hero Settings Dialog Removed - Replaced by standalone page */}
        {/* Admin Password Dialog */}
        <AdminPasswordDialog
          isOpen={passwordDialog.isOpen}
          onClose={() => setPasswordDialog({
            isOpen: false,
            actionDescription: '',
            requiresReason: false,
            reasonLabel: 'Reason',
            onConfirm: null
          })}
          onConfirm={async (reason) => {
            if (passwordDialog.onConfirm) {
              await passwordDialog.onConfirm(reason);
            }
          }}
          actionDescription={passwordDialog.actionDescription}
          requiresReason={passwordDialog.requiresReason}
          reasonLabel={passwordDialog.reasonLabel}
        />

        {/* Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={confirmationDialog.isOpen}
          onClose={() => setConfirmationDialog({ isOpen: false, success: true, title: '', message: '' })}
          success={confirmationDialog.success}
          title={confirmationDialog.title}
          message={confirmationDialog.message}
        />
      </div>
    </div >
  );
};

export default FastFoodManagement;