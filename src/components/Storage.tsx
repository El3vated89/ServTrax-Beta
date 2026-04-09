import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  HardDrive, Trash2, CheckSquare, Square, FileText, AlertCircle, 
  Download, Search, Filter, X, ChevronRight, Calendar, User, 
  Briefcase, Clock, CheckCircle2, MoreHorizontal 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { storageService, StorageAsset } from '../services/StorageService';
import { usageTrackingService, UsageCounter } from '../services/usageTrackingService';
import { jobService, Job } from '../services/jobService';
import { customerService, Customer } from '../services/customerService';
import { Timestamp } from 'firebase/firestore';
import { subscribeToResolvedUser } from '../services/authSessionService';
import { databaseStatusService } from '../services/databaseStatusService';

export default function Storage() {
  const [assets, setAssets] = useState<StorageAsset[]>([]);
  const [summary, setSummary] = useState({ used_bytes: 0, limit_bytes: 0, asset_count: 0, plan_name: '', storage_cap: 0, retention_days: null as number | null });
  const [usage, setUsage] = useState<UsageCounter | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'expiring' | 'unassigned' | 'largest'>('all');
  const [selectedAsset, setSelectedAsset] = useState<StorageAsset | null>(null);
  const [isBulkMode, setIsBulkMode] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [isSettingExpiration, setIsSettingExpiration] = useState(false);
  const [editJobId, setEditJobId] = useState('');
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editExpirationDays, setEditExpirationDays] = useState('30');
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [summaryResult, assetsResult] = await Promise.allSettled([
        storageService.getUsageSummary(),
        storageService.getAssets()
      ]);

      let nextAssets: StorageAsset[] = [];
      let nextError: string | null = null;

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value);
      } else {
        console.error('Error loading storage summary:', summaryResult.reason);
        databaseStatusService.reportIssue(summaryResult.reason, 'storage_summary');
        nextError = databaseStatusService.getUserMessage(summaryResult.reason, 'storage_summary');
      }

      if (assetsResult.status === 'fulfilled') {
        nextAssets = assetsResult.value;
        setAssets(assetsResult.value);
      } else {
        console.error('Error loading storage assets:', assetsResult.reason);
        databaseStatusService.reportIssue(assetsResult.reason, 'storage_assets');
        nextError = databaseStatusService.getUserMessage(assetsResult.reason, 'storage_assets');
      }

      try {
        await usageTrackingService.syncStorageUsageForCurrentUser();
      } catch (syncError) {
        console.error('Error syncing storage usage:', syncError);
      }

      if (summaryResult.status === 'rejected' && assetsResult.status === 'rejected') {
        nextError = databaseStatusService.getUserMessage(assetsResult.reason, 'storage');
      }

      setErrorMessage(nextError);
      return nextAssets;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      if (user) {
        loadData();
        return;
      }

      setAssets([]);
      setSummary({ used_bytes: 0, limit_bytes: 0, asset_count: 0, plan_name: '', storage_cap: 0, retention_days: null });
      setUsage(null);
      setIsLoading(false);
    });

    return () => {
      unsubscribeAuth();
    };
  }, [loadData]);

  useEffect(() => {
    const unsubscribeJobs = jobService.subscribeToJobs(setJobs);
    const unsubscribeCustomers = customerService.subscribeToCustomers(setCustomers);
    const unsubscribeUsage = usageTrackingService.subscribeToCurrentUsage(setUsage);
    return () => {
      unsubscribeJobs();
      unsubscribeCustomers();
      unsubscribeUsage();
    };
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const filteredAssets = useMemo(() => {
    let result = assets.filter(asset => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        asset.customer_name.toLowerCase().includes(searchLower) ||
        (asset.jobId && asset.jobId.toLowerCase().includes(searchLower));
      
      if (!matchesSearch) return false;

      if (filterType === 'expiring') return !!asset.expires_at;
      if (filterType === 'unassigned') return !asset.jobId || asset.jobId === 'N/A';
      return true;
    });

    if (filterType === 'largest') {
      result = [...result].sort((a, b) => (b.file_size_bytes || 0) - (a.file_size_bytes || 0));
    }

    return result;
  }, [assets, searchQuery, filterType]);

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
    setIsBulkMode(newSelected.size > 0);
  };

  const handleDeleteAsset = async (id: string) => {
    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await storageService.deleteAsset(id);
      await loadData();
      setSelectedAsset(null);
      setShowDeleteConfirm(false);
      setSuccessMessage('Asset deleted successfully.');
    } catch (error) {
      console.error('Error deleting asset:', error);
      setErrorMessage('Failed to delete the asset.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const idsToDelete = Array.from(selectedIds);
      await storageService.bulkDeleteAssets(idsToDelete);
      await loadData();
      setSelectedIds(new Set());
      setIsBulkMode(false);
      setShowBulkDeleteConfirm(false);
      setSuccessMessage('Selected assets deleted successfully.');
    } catch (error) {
      console.error('Error bulk deleting assets:', error);
      setErrorMessage('Failed to delete the selected assets.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkReassign = async () => {
    if (selectedIds.size === 0) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const idsToUpdate = Array.from(selectedIds);
      await Promise.all(idsToUpdate.map(id => 
        storageService.updateAsset(id, { jobId: editJobId, customerId: editCustomerId })
      ));
      
      await loadData();
      setIsReassigning(false);
      setSelectedIds(new Set());
      setIsBulkMode(false);
      setSuccessMessage('Selected assets reassigned successfully.');
    } catch (error) {
      console.error('Error bulk reassigning assets:', error);
      setErrorMessage('Failed to reassign the selected assets.');
    }
  };

  const handleBulkSetExpiration = async () => {
    if (selectedIds.size === 0) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const expirationDate = getBoundedExpirationDate(editExpirationDays);
      
      const idsToUpdate = Array.from(selectedIds);
      await Promise.all(idsToUpdate.map(id => 
        storageService.updateAsset(id, { expires_at: expirationDate })
      ));
      
      await loadData();
      setIsSettingExpiration(false);
      setSelectedIds(new Set());
      setIsBulkMode(false);
      setSuccessMessage('Expiration updated for the selected assets.');
    } catch (error) {
      console.error('Error bulk setting expiration:', error);
      setErrorMessage('Failed to update expiration for the selected assets.');
    }
  };

  const handleDeleteAssetClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleUpdateSingleAsset = async () => {
    if (!selectedAsset) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await storageService.updateAsset(selectedAsset.id, {
        jobId: editJobId,
        customerId: editCustomerId
      });
      const refreshedAssets = await loadData();
      setIsReassigning(false);
      setSelectedAsset(refreshedAssets.find((asset) => asset.id === selectedAsset.id) || null);
      setSuccessMessage('Asset assignment updated successfully.');
    } catch (error) {
      console.error('Error updating asset:', error);
      setErrorMessage('Failed to update the asset assignment.');
    }
  };

  const handleSetSingleExpiration = async () => {
    if (!selectedAsset) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const expirationDate = getBoundedExpirationDate(editExpirationDays);
      await storageService.updateAsset(selectedAsset.id, { expires_at: expirationDate });
      const refreshedAssets = await loadData();
      setIsSettingExpiration(false);
      setSelectedAsset(refreshedAssets.find((asset) => asset.id === selectedAsset.id) || null);
      setSuccessMessage('Asset expiration updated successfully.');
    } catch (error) {
      console.error('Error setting expiration:', error);
      setErrorMessage('Failed to update asset expiration.');
    }
  };

  const handleRemoveExpiration = async () => {
    if (!selectedAsset) return;
    if (summary.retention_days) {
      setErrorMessage(`This plan requires automatic expiration after ${summary.retention_days} days.`);
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await storageService.updateAsset(selectedAsset.id, { expires_at: undefined });
      const refreshedAssets = await loadData();
      setSelectedAsset(refreshedAssets.find((asset) => asset.id === selectedAsset.id) || null);
      setSuccessMessage('Asset expiration removed successfully.');
    } catch (error) {
      console.error('Error removing expiration:', error);
      setErrorMessage('Failed to remove asset expiration.');
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
  };

  const getBoundedExpirationDate = (requestedDays: string) => {
    const parsedDays = parseInt(requestedDays, 10);
    const safeDays = Number.isNaN(parsedDays) || parsedDays <= 0 ? 1 : parsedDays;
    const boundedDays = summary.retention_days ? Math.min(safeDays, summary.retention_days) : safeDays;
    return Timestamp.fromMillis(Date.now() + boundedDays * 24 * 60 * 60 * 1000);
  };

  const effectiveUsedBytes = usage?.storage_used_bytes ?? summary.used_bytes;
  const effectiveLimitBytes = usage?.storage_limit_bytes || summary.limit_bytes || 0;
  const percentageUsed = effectiveLimitBytes > 0
    ? (effectiveUsedBytes / effectiveLimitBytes) * 100
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40 px-4 py-4">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Storage</h1>
              {filteredAssets.length > 0 && (
                <button 
                  onClick={() => {
                    if (selectedIds.size === filteredAssets.length) {
                      setSelectedIds(new Set());
                      setIsBulkMode(false);
                    } else {
                      const allIds = new Set(filteredAssets.map(a => a.id));
                      setSelectedIds(allIds);
                      setIsBulkMode(true);
                    }
                  }}
                  className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors"
                >
                  {selectedIds.size === filteredAssets.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{summary.plan_name || 'Free'}</span>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                {summary.retention_days ? `${summary.retention_days} Day Retention` : 'No Auto Expiration'}
              </span>
              <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-full">
                <HardDrive className="h-4 w-4 text-gray-500" />
                <span className="text-xs font-black text-gray-600 uppercase tracking-widest">
                  {percentageUsed.toFixed(0)}% Full
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                type="text"
                placeholder="Search customer or job..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border-none rounded-2xl py-3 pl-11 pr-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <select 
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="bg-gray-50 border-none rounded-2xl px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="expiring">Expiring</option>
              <option value="unassigned">Unassigned</option>
              <option value="largest">Largest</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Storage Usage</p>
            <p className="text-sm font-black text-gray-900 mt-2">{formatSize(usage?.storage_used_bytes || summary.used_bytes)}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
              Limit {formatSize(usage?.storage_limit_bytes || summary.limit_bytes)}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">SMS Usage</p>
            <p className="text-sm font-black text-gray-900 mt-2">{usage?.sms_used || 0}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
              Limit {usage?.sms_limit || 0}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Email Usage</p>
            <p className="text-sm font-black text-gray-900 mt-2">{usage?.email_used || 0}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
              Limit {usage?.email_limit || 0}
            </p>
          </div>
        </div>
      </div>

      {/* List Content */}
      <div className="max-w-xl mx-auto px-4 py-6">
        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-sm font-bold text-red-700">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 px-4 py-3">
            <p className="text-sm font-bold text-green-700">{successMessage}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Loading Assets...</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-gray-100 rounded-[40px] flex items-center justify-center mx-auto mb-4">
              <FileText className="h-10 w-10 text-gray-300" />
            </div>
            <p className="text-lg font-black text-gray-900">No assets found</p>
            <p className="text-sm font-bold text-gray-500 mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAssets.map(asset => (
              <motion.div 
                layout
                key={asset.id}
                onClick={() => setSelectedAsset(asset)}
                className={`bg-white p-3 rounded-3xl border transition-all active:scale-[0.98] cursor-pointer flex items-center gap-4 ${selectedIds.has(asset.id) ? 'border-blue-500 bg-blue-50/30' : 'border-gray-100'}`}
              >
                {/* Checkbox */}
                <button 
                  onClick={(e) => toggleSelect(asset.id, e)}
                  className="p-1"
                >
                  {selectedIds.has(asset.id) ? (
                    <CheckSquare className="h-6 w-6 text-blue-600" />
                  ) : (
                    <Square className="h-6 w-6 text-gray-200" />
                  )}
                </button>

                {/* Thumbnail */}
                <div className="w-14 h-14 bg-gray-100 rounded-2xl overflow-hidden flex-shrink-0">
                  {asset.photo_urls?.[0] ? (
                    <img 
                      src={asset.photo_urls[0]} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                      alt=""
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="h-6 w-6 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-gray-900 truncate">{asset.customer_name}</p>
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                    <span className="truncate">{asset.jobId !== 'N/A' ? asset.jobId : 'Unassigned'}</span>
                    <span>•</span>
                    <span>{formatDate(asset.uploaded_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      {formatSize(asset.file_size_bytes)}
                    </span>
                    {asset.expires_at && (
                      <span className="flex items-center gap-1 bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                        <Clock className="h-3 w-3" />
                        Expires {formatDate(asset.expires_at)}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-gray-300" />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {isBulkMode && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 z-[100] max-w-xl mx-auto"
          >
            <div className="bg-gray-900 rounded-[32px] p-4 shadow-2xl flex items-center justify-between gap-4">
              <div className="pl-2">
                <p className="text-white font-black text-sm">{selectedIds.size} Selected</p>
                <button 
                  onClick={() => { setSelectedIds(new Set()); setIsBulkMode(false); }}
                  className="text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-white"
                >
                  Clear Selection
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsReassigning(true)}
                  className="bg-gray-800 text-white p-3 rounded-2xl hover:bg-gray-700 transition-colors"
                >
                  <Briefcase className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setIsSettingExpiration(true)}
                  className="bg-gray-800 text-white p-3 rounded-2xl hover:bg-gray-700 transition-colors"
                >
                  <Clock className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="bg-red-600 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo Details Sheet */}
      <AnimatePresence>
        {selectedAsset && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAsset(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative bg-white w-full max-w-xl rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Header with Close */}
                <div className="flex items-center justify-between p-6 border-b border-gray-50">
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">Photo Details</h2>
                  <button 
                    onClick={() => setSelectedAsset(null)}
                    className="bg-gray-100 p-2 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-900" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto">
                  <div className="space-y-6">
                    {/* Actions at the Top */}
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => {
                          setEditCustomerId(selectedAsset.customerId || '');
                          setEditJobId(selectedAsset.jobId || '');
                          setIsReassigning(true);
                        }}
                        className="bg-blue-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <User className="h-4 w-4" />
                        Reassign
                      </button>
                      <button 
                        onClick={() => setIsSettingExpiration(true)}
                        className="bg-gray-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-gray-100 hover:bg-gray-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Clock className="h-4 w-4" />
                        Set Expiry
                      </button>
                      <a 
                        href={selectedAsset.photo_urls?.[0]} 
                        download 
                        target="_blank" 
                        rel="noreferrer"
                        className="bg-gray-100 text-gray-700 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                      <button 
                        onClick={handleDeleteAssetClick}
                        className="bg-red-50 text-red-600 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-100 transition-all active:scale-95 flex items-center justify-center gap-2 border border-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-3xl">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</p>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-blue-600" />
                          <p className="font-bold text-gray-900 truncate">{selectedAsset.customer_name}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-3xl">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Job Assignment</p>
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-blue-600" />
                          <p className="font-bold text-gray-900 truncate">{selectedAsset.jobId !== 'N/A' ? selectedAsset.jobId : 'Unassigned'}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-3xl">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">File Size</p>
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-blue-600" />
                          <p className="font-bold text-gray-900">{formatSize(selectedAsset.file_size_bytes)}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-3xl">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Upload Date</p>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-blue-600" />
                          <p className="font-bold text-gray-900">{formatDate(selectedAsset.uploaded_at)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Expiration Status */}
                    <div className={`p-4 rounded-3xl border flex items-center justify-between ${selectedAsset.expires_at ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'}`}>
                      <div className="flex items-center gap-3">
                        {selectedAsset.expires_at ? (
                          <Clock className="h-5 w-5 text-orange-600" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        )}
                        <div>
                          <p className={`text-xs font-black uppercase tracking-widest ${selectedAsset.expires_at ? 'text-orange-600' : 'text-green-600'}`}>
                            {selectedAsset.expires_at ? 'Expiring Asset' : 'Permanent Storage'}
                          </p>
                          <p className="text-sm font-bold text-gray-900">
                            {selectedAsset.expires_at ? `Expires on ${formatDate(selectedAsset.expires_at)}` : 'No expiration set'}
                          </p>
                        </div>
                      </div>
                      {selectedAsset.expires_at && !summary.retention_days && (
                        <button 
                          onClick={handleRemoveExpiration}
                          className="text-[10px] font-black text-orange-600 uppercase tracking-widest hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Image Preview at the Bottom */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Photo Preview</p>
                      <div className="relative rounded-[32px] overflow-hidden bg-gray-100 border border-gray-100">
                        {selectedAsset.photo_urls?.[0] ? (
                          <img 
                            src={selectedAsset.photo_urls[0]} 
                            className="w-full h-auto object-contain max-h-[500px]" 
                            referrerPolicy="no-referrer"
                            alt=""
                          />
                        ) : (
                          <div className="aspect-video flex items-center justify-center">
                            <FileText className="h-12 w-12 text-gray-300" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reassign Modal */}
      <AnimatePresence>
        {isReassigning && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReassigning(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl"
            >
              <h3 className="text-xl font-black text-gray-900 mb-6">Reassign Asset(s)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Customer</label>
                  <select 
                    value={editCustomerId} 
                    onChange={e => setEditCustomerId(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 text-sm font-bold text-gray-900 appearance-none"
                  >
                    <option value="">-- No Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Job</label>
                  <select 
                    value={editJobId} 
                    onChange={e => setEditJobId(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 text-sm font-bold text-gray-900 appearance-none"
                  >
                    <option value="">-- No Job --</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.customer_name_snapshot} - {j.address_snapshot}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsReassigning(false)} 
                    className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-2xl font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={isBulkMode ? handleBulkReassign : handleUpdateSingleAsset} 
                    className="flex-1 bg-blue-600 text-white py-3 rounded-2xl font-bold text-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Set Expiration Modal */}
      <AnimatePresence>
        {isSettingExpiration && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingExpiration(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl"
            >
              <h3 className="text-xl font-black text-gray-900 mb-6">Set Expiration</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Expires In (Days)</label>
                  <select 
                    value={editExpirationDays} 
                    onChange={e => setEditExpirationDays(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 text-sm font-bold text-gray-900 appearance-none"
                  >
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="365">1 Year</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsSettingExpiration(false)} 
                    className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-2xl font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={isBulkMode ? handleBulkSetExpiration : handleSetSingleExpiration} 
                    className="flex-1 bg-blue-600 text-white py-3 rounded-2xl font-bold text-sm"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && selectedAsset && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[600] flex justify-center items-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="h-10 w-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Delete Photo?</h3>
              <p className="text-gray-500 text-sm font-medium mb-8 leading-relaxed">
                This action cannot be undone. This photo will be permanently removed from storage.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteAsset(selectedAsset.id)}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 shadow-lg shadow-red-100 transition-all disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {showBulkDeleteConfirm && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[600] flex justify-center items-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="h-10 w-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Delete {selectedIds.size} Photos?</h3>
              <p className="text-gray-500 text-sm font-medium mb-8 leading-relaxed">
                This action cannot be undone. All selected photos will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 shadow-lg shadow-red-100 transition-all disabled:opacity-50"
                >
                  {isBulkDeleting ? 'Deleting...' : 'Delete All'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
