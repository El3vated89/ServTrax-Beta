import { db } from '../firebase';
import { collection, query, getDocs, deleteDoc, doc, Timestamp, orderBy, where, getDoc, updateDoc } from 'firebase/firestore';
import { storagePolicyService } from './storagePolicyService';
import { handleFirestoreError, OperationType } from './verificationService';
import { localFallbackStore } from './localFallbackStore';
import { waitForCurrentUser } from './authSessionService';
import { SaveDebugContext, savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

export interface StorageAsset {
  id: string;
  customer_name: string;
  customerId?: string;
  jobId: string;
  file_size_bytes: number;
  uploaded_at: Timestamp;
  visibility_mode: 'internal_only' | 'shareable';
  expires_at?: Timestamp;
  notes?: string;
  photo_urls?: string[];
  ownerId: string;
  source?: 'primary';
}

const LOCAL_FALLBACK_NAMESPACE = 'verification_records';

const getBusinessProfile = async (userId: string, debugContext?: SaveDebugContext) => {
  const profileSnap = await savePipelineService.withTimeout(
    getDoc(doc(db, 'business_profiles', userId)),
    {
      timeoutMessage: 'Timed out while loading the business profile for storage.',
      debugContext,
    }
  );
  return profileSnap.exists() ? profileSnap.data() : null;
};

export const storageService = {
  getUsageSummary: async (debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    const fallbackPolicy = storagePolicyService.resolvePolicy();
    if (!user) return {
      used_bytes: 0,
      limit_bytes: fallbackPolicy.limitBytes,
      asset_count: 0,
      plan_name: fallbackPolicy.planName,
      storage_cap: fallbackPolicy.limitBytes,
      retention_days: fallbackPolicy.retentionDays,
    };

    const q = query(collection(db, 'verification_records'), where('ownerId', '==', user.uid));
    const businessProfile = await getBusinessProfile(user.uid, debugContext);
    const policy = storagePolicyService.resolvePolicy(businessProfile);
    const assetsSnapshot = await savePipelineService.withTimeout(getDocs(q), {
      timeoutMessage: 'Timed out while loading storage usage records.',
      debugContext,
    });
    let totalBytes = 0;
    assetsSnapshot.forEach(doc => {
      const data = doc.data();
      const urls = data.photo_urls || (data.photo_url ? [data.photo_url] : []);
      const size = data.file_size_bytes || (urls.reduce((sum: number, url: string) => sum + (url.length || 0), 0) * 0.75);
      totalBytes += size;
    });
    return {
      used_bytes: totalBytes,
      limit_bytes: policy.limitBytes,
      asset_count: assetsSnapshot.size,
      plan_name: policy.planName,
      storage_cap: policy.limitBytes,
      retention_days: policy.retentionDays,
    };
  },
  getAssets: async (debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) return [];

    const q = query(
      collection(db, 'verification_records'), 
      where('ownerId', '==', user.uid)
    );
    const snapshot = await savePipelineService.withTimeout(getDocs(q), {
      timeoutMessage: 'Timed out while loading storage assets.',
      debugContext,
    });
    
    const primaryAssets = await Promise.all(snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      let customer_name = 'Unknown';
      let jobId = data.jobId || 'N/A';
      let customerId = data.customerId || undefined;
      
      if (data.jobId) {
        try {
          const jobSnap = await savePipelineService.withTimeout(getDoc(doc(db, 'jobs', data.jobId)), {
            timeoutMessage: 'Timed out while loading job details for storage assets.',
            debugContext,
          });
          if (jobSnap.exists()) {
            const jobData = jobSnap.data();
            customer_name = jobData.customer_name_snapshot || 'Unknown';
            jobId = jobData.id || data.jobId;
          }
        } catch (e) {
          console.error("Error fetching job details, skipping:", e);
          // Fallback to defaults if permission is denied
        }
      } else if (data.customerId) {
        try {
          const customerSnap = await savePipelineService.withTimeout(getDoc(doc(db, 'customers', data.customerId)), {
            timeoutMessage: 'Timed out while loading customer details for storage assets.',
            debugContext,
          });
          if (customerSnap.exists()) {
            const customerData = customerSnap.data();
            customer_name = customerData.name || 'Unknown';
          }
        } catch (e) {
          console.error("Error fetching customer details, skipping:", e);
        }
      }
      
      return {
        id: docSnap.id,
        ...data,
        file_size_bytes: data.file_size_bytes || 0,
        customer_name,
        jobId,
        customerId,
        ownerId: data.ownerId,
        uploaded_at: data.created_at || Timestamp.now(),
        source: 'primary',
      } as StorageAsset;
    }));

    return [...primaryAssets].sort((a, b) => b.uploaded_at.seconds - a.uploaded_at.seconds);
  },
  updateAsset: async (id: string, data: Partial<StorageAsset>, debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        'verification_records',
        id,
        'Storage update timed out while checking the recovered cloud record.'
      );
      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Storage asset');
      }
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', { id, action: 'update_storage_asset' });
      }
      await savePipelineService.withTimeout(updateDoc(doc(db, 'verification_records', id), data), {
        timeoutMessage: 'Timed out while updating the storage asset.',
        debugContext,
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { id, action: 'update_storage_asset' });
      }
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
      handleFirestoreError(error, OperationType.UPDATE, `verification_records/${id}`);
    }
  },
  deleteAsset: async (id: string, debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        'verification_records',
        id,
        'Storage delete timed out while checking the recovered cloud record.'
      );
      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Storage asset');
      }
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', { id, action: 'delete_storage_asset' });
      }
      await savePipelineService.withTimeout(deleteDoc(doc(db, 'verification_records', id)), {
        timeoutMessage: 'Timed out while deleting the storage asset.',
        debugContext,
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { id, action: 'delete_storage_asset' });
      }
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
      handleFirestoreError(error, OperationType.DELETE, `verification_records/${id}`);
    }
  },
  bulkDeleteAssets: async (ids: string[], debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    try {
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', { count: ids.length, action: 'bulk_delete_storage_assets' });
      }
      await savePipelineService.withTimeout(
        Promise.all(ids.map(async (id) => {
          const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
            'verification_records',
            id,
            'Storage bulk delete timed out while checking the recovered cloud record.'
          );
          if (shouldUseLocalFallback) {
            throw cloudTruthService.buildUnsyncedRecordError('Storage asset');
          }
          await deleteDoc(doc(db, 'verification_records', id));
        })),
        {
          timeoutMessage: 'Timed out while deleting the selected storage assets.',
          debugContext,
        }
      );
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { count: ids.length, action: 'bulk_delete_storage_assets' });
      }
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
      handleFirestoreError(error, OperationType.DELETE, 'verification_records_bulk');
    }
  }
};
