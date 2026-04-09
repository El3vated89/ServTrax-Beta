import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

export interface Job {
  id?: string;
  ownerId: string;
  customerId: string;
  servicePlanId?: string;
  recurringPlanId?: string;
  customer_name_snapshot: string;
  address_snapshot: string;
  phone_snapshot: string;
  service_snapshot: string;
  price_snapshot: number;
  billing_frequency?: 'one-time' | 'weekly' | 'bi-weekly' | 'monthly' | 'flexible';
  scheduled_date?: any;
  completed_date?: any;
  last_completed_date?: any;
  next_due_date?: any;
  status: 'quote' | 'pending' | 'approved' | 'completed' | 'canceled' | 'skipped' | 'delayed';
  payment_status: 'unpaid' | 'paid';
  visibility_mode: 'internal_only' | 'shareable';
  share_token?: string;
  share_expires_at?: any;
  is_billable: boolean;
  is_recurring: boolean;
  internal_notes: string;
  customer_notes: string;
  created_at?: any;
  approved_at?: any;
  service_setup_type?: 'one-time' | 'recurring' | 'flexible';
  interval_days?: number;
  override_enabled?: boolean;
  seasonal_enabled?: boolean;
  seasonal_rules?: any[];
  portal_visible?: boolean;
}

const COLLECTION_NAME = 'jobs';
const jobCache = new Map<string, Job>();

const mergeJobs = (primaryJobs: Job[]) => {
  const merged = [...primaryJobs];
  jobCache.clear();
  merged.forEach((job) => {
    if (job.id) jobCache.set(job.id, job);
  });
  return merged;
};

export const jobService = {
  subscribeToJobs: (callback: (jobs: Job[]) => void) => {
    let unsubscribeJobs = () => {};
    let primaryJobs: Job[] = [];

    const emit = () => callback(mergeJobs(primaryJobs));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeJobs();
      primaryJobs = [];

      if (!user) {
        jobCache.clear();
        callback([]);
        return;
      }

      const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid));

      unsubscribeJobs = onSnapshot(q, (snapshot) => {
        primaryJobs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Job[];
        emit();
      }, (error) => {
        console.error('Primary jobs subscription failed:', error);
        primaryJobs = [];
        emit();
      });
    });

    return () => {
      unsubscribeJobs();
      unsubscribeAuth();
    };
  },

  addJob: async (jobData: Omit<Job, 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await savePipelineService.withTimeout(
        addDoc(collection(db, COLLECTION_NAME), {
          ...jobData,
          ownerId: user.uid,
          created_at: serverTimestamp()
        }),
        {
          timeoutMessage: 'Job save timed out while writing to the database.',
        }
      );
    } catch (error) {
      console.error('Primary job save failed:', error);
      throw cloudTruthService.buildCreateError('Job');
    }
  },

  updateJob: async (
    id: string,
    data: Partial<Job>,
    options: {
      requirePrimaryWrite?: boolean;
    } = {}
  ) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Job update timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        if (options.requirePrimaryWrite) {
          throw cloudTruthService.buildUnsyncedRecordError('Job');
        }
        throw cloudTruthService.buildUnsyncedRecordError('Job');
      }
      return await savePipelineService.withTimeout(updateDoc(docRef, data), {
        timeoutMessage: 'Job update timed out while writing to the database.',
      });
    } catch (error) {
      if (options.requirePrimaryWrite) {
        throw error;
      }
      console.error('Primary job update failed:', error);
      throw cloudTruthService.buildUpdateError('Job');
    }
  },

  deleteJob: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Job delete timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Job');
      }
      return await savePipelineService.withTimeout(deleteDoc(docRef), {
        timeoutMessage: 'Job delete timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary job delete failed:', error);
      throw cloudTruthService.buildDeleteError('Job');
    }
  }
};
