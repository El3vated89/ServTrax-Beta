import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';
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
const LOCAL_FALLBACK_NAMESPACE = 'jobs';
type LocalJob = Job & { _local_deleted?: boolean };
const jobCache = new Map<string, Job>();
const toClientTimestamp = () => new Date().toISOString();

const normalizeLocalJob = (ownerId: string, entry: Partial<LocalJob>): Job => ({
  id: entry.id,
  ownerId,
  customerId: entry.customerId || '',
  servicePlanId: entry.servicePlanId || '',
  recurringPlanId: entry.recurringPlanId || '',
  customer_name_snapshot: entry.customer_name_snapshot || '',
  address_snapshot: entry.address_snapshot || '',
  phone_snapshot: entry.phone_snapshot || '',
  service_snapshot: entry.service_snapshot || '',
  price_snapshot: entry.price_snapshot || 0,
  billing_frequency: entry.billing_frequency,
  scheduled_date: entry.scheduled_date as any,
  completed_date: entry.completed_date as any,
  last_completed_date: entry.last_completed_date as any,
  next_due_date: entry.next_due_date as any,
  status: entry.status || 'pending',
  payment_status: entry.payment_status || 'unpaid',
  visibility_mode: entry.visibility_mode || 'internal_only',
  share_token: entry.share_token || '',
  share_expires_at: entry.share_expires_at as any,
  is_billable: entry.is_billable ?? true,
  is_recurring: entry.is_recurring ?? false,
  internal_notes: entry.internal_notes || '',
  customer_notes: entry.customer_notes || '',
  created_at: entry.created_at as any,
  approved_at: entry.approved_at as any,
  service_setup_type: entry.service_setup_type,
  interval_days: entry.interval_days,
  override_enabled: entry.override_enabled,
  seasonal_enabled: entry.seasonal_enabled,
  seasonal_rules: entry.seasonal_rules,
  portal_visible: entry.portal_visible,
});

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
        console.error('Primary jobs subscription failed, using local fallback only:', error);
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
      console.error('Primary job save failed, saving locally instead:', error);
      localFallbackStore.upsertRecord<LocalJob>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...jobData,
        ownerId: user.uid,
        created_at: toClientTimestamp() as any,
      });
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
      console.error('Primary job update failed, updating local fallback instead:', error);
      const cachedJob = jobCache.get(id);
      localFallbackStore.upsertRecord<LocalJob>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedJob || {
          id,
          ownerId: user.uid,
          customerId: data.customerId || '',
          customer_name_snapshot: data.customer_name_snapshot || '',
          address_snapshot: data.address_snapshot || '',
          phone_snapshot: data.phone_snapshot || '',
          service_snapshot: data.service_snapshot || '',
          price_snapshot: data.price_snapshot || 0,
          status: data.status || 'pending',
          payment_status: data.payment_status || 'unpaid',
          visibility_mode: data.visibility_mode || 'internal_only',
          is_billable: data.is_billable ?? true,
          is_recurring: data.is_recurring ?? false,
          internal_notes: data.internal_notes || '',
          customer_notes: data.customer_notes || '',
          created_at: toClientTimestamp() as any,
        }),
        ...data,
        _local_deleted: false,
        } as LocalJob);
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
      console.error('Primary job delete failed, hiding it locally instead:', error);
      const cachedJob = jobCache.get(id);
      localFallbackStore.upsertRecord<LocalJob>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedJob || {
          id,
          ownerId: user.uid,
          customerId: '',
          customer_name_snapshot: '',
          address_snapshot: '',
          phone_snapshot: '',
          service_snapshot: '',
          price_snapshot: 0,
          status: 'pending',
          payment_status: 'unpaid',
          visibility_mode: 'internal_only',
          is_billable: true,
          is_recurring: false,
          internal_notes: '',
          customer_notes: '',
          created_at: toClientTimestamp() as any,
        }),
        _local_deleted: true,
      } as LocalJob);
      throw cloudTruthService.buildDeleteError('Job');
    }
  }
};
