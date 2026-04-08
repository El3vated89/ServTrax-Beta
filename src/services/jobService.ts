import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';

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
}

export const jobService = {
  subscribeToJobs: (callback: (jobs: Job[]) => void) => {
    let unsubscribeJobs = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeJobs();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(collection(db, 'jobs'), where('ownerId', '==', user.uid));

      unsubscribeJobs = onSnapshot(q, (snapshot) => {
        const jobs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Job[];
        callback(jobs);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'jobs');
      });
    });

    return () => {
      unsubscribeJobs();
      unsubscribeAuth();
    };
  },

  addJob: async (jobData: Omit<Job, 'ownerId' | 'created_at'>) => {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, 'jobs'), {
        ...jobData,
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'jobs');
    }
  },

  updateJob: async (id: string, data: Partial<Job>) => {
    const docRef = doc(db, 'jobs', id);
    try {
      return await updateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `jobs/${id}`);
    }
  },

  deleteJob: async (id: string) => {
    const docRef = doc(db, 'jobs', id);
    try {
      return await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `jobs/${id}`);
    }
  }
};
