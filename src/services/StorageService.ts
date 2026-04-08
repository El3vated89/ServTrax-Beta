import { db, auth } from '../firebase';
import { collection, query, getDocs, deleteDoc, doc, Timestamp, orderBy, where, getDoc, updateDoc } from 'firebase/firestore';
import { storagePolicyService } from './storagePolicyService';

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
}

const getBusinessProfile = async (userId: string) => {
  const profileSnap = await getDoc(doc(db, 'business_profiles', userId));
  return profileSnap.exists() ? profileSnap.data() : null;
};

const waitForCurrentUser = async () => {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<typeof auth.currentUser>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const storageService = {
  getUsageSummary: async () => {
    const user = await waitForCurrentUser();
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
    const businessProfile = await getBusinessProfile(user.uid);
    const policy = storagePolicyService.resolvePolicy(businessProfile);
    const assetsSnapshot = await getDocs(q);
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
  getAssets: async () => {
    const user = await waitForCurrentUser();
    if (!user) return [];

    const q = query(
      collection(db, 'verification_records'), 
      where('ownerId', '==', user.uid)
    );
    const snapshot = await getDocs(q);
    
    const assets = await Promise.all(snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      let customer_name = 'Unknown';
      let jobId = data.jobId || 'N/A';
      let customerId = data.customerId || undefined;
      
      if (data.jobId) {
        try {
          const jobSnap = await getDoc(doc(db, 'jobs', data.jobId));
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
          const customerSnap = await getDoc(doc(db, 'customers', data.customerId));
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
        uploaded_at: data.created_at || Timestamp.now()
      } as StorageAsset;
    }));
    
    // Sort client-side to avoid index errors
    return assets.sort((a, b) => b.uploaded_at.seconds - a.uploaded_at.seconds);
  },
  updateAsset: async (id: string, data: Partial<StorageAsset>) => {
    await updateDoc(doc(db, 'verification_records', id), data);
  },
  deleteAsset: async (id: string) => {
    await deleteDoc(doc(db, 'verification_records', id));
  },
  bulkDeleteAssets: async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteDoc(doc(db, 'verification_records', id))));
  }
};
