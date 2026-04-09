import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';
import { databaseStatusService } from './databaseStatusService';

export interface Customer {
  id?: string;
  ownerId: string;
  name: string;
  phone: string;
  email: string;
  street: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  access_notes?: string;
  status: 'active' | 'inactive';
  last_service_date?: any;
  created_at?: any;
  off_season_enabled?: boolean;
  off_season_rules?: any[]; // Using any[] to avoid circular dependency or complex imports if SeasonalRule is only in settings
  portal_enabled?: boolean;
  portal_token?: string;
  portal_plan_name_snapshot?: string;
  portal_persistent_allowed?: boolean;
  portal_show_history?: boolean;
  portal_show_payment_status?: boolean;
  portal_show_quotes?: boolean;
}

const COLLECTION_NAME = 'customers';
const customerCache = new Map<string, Customer>();

const mergeCustomers = (primaryCustomers: Customer[]) => {
  const merged = [...primaryCustomers].sort((left, right) => left.name.localeCompare(right.name));
  customerCache.clear();
  merged.forEach((customer) => {
    if (customer.id) customerCache.set(customer.id, customer);
  });
  return merged;
};

export const customerService = {
  subscribeToCustomers: (callback: (customers: Customer[]) => void) => {
    let unsubscribeCustomers = () => {};
    let primaryCustomers: Customer[] = [];

    const emit = () => callback(mergeCustomers(primaryCustomers));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeCustomers();
      primaryCustomers = [];

      if (!user) {
        customerCache.clear();
        callback([]);
        return;
      }

      const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid));
      
      unsubscribeCustomers = onSnapshot(q, (snapshot) => {
        primaryCustomers = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as Customer[];
        emit();
      }, (error) => {
        console.error('Primary customer subscription failed:', error);
        databaseStatusService.reportIssue(error, 'customers');
        primaryCustomers = [];
        emit();
      });
    });

    return () => {
      unsubscribeCustomers();
      unsubscribeAuth();
    };
  },

  addCustomer: async (customerData: Omit<Customer, 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await savePipelineService.withTimeout(
        addDoc(collection(db, COLLECTION_NAME), {
          ...customerData,
          ownerId: user.uid,
          created_at: serverTimestamp()
        }),
        {
          timeoutMessage: 'Customer save timed out while writing to the database.',
        }
      );
    } catch (error) {
      console.error('Primary customer save failed:', error);
      throw cloudTruthService.buildCreateError('Client');
    }
  },

  updateCustomer: async (id: string, data: Partial<Customer>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      const cachedCustomer = customerCache.get(id);
      const safeData: Partial<Customer> = {
        ...data,
        status: data.status ?? cachedCustomer?.status ?? 'active',
        portal_enabled: data.portal_enabled ?? cachedCustomer?.portal_enabled ?? false,
        portal_token: data.portal_token ?? cachedCustomer?.portal_token ?? '',
        portal_plan_name_snapshot: data.portal_plan_name_snapshot ?? cachedCustomer?.portal_plan_name_snapshot ?? '',
        portal_persistent_allowed: data.portal_persistent_allowed ?? cachedCustomer?.portal_persistent_allowed ?? false,
        portal_show_history: data.portal_show_history ?? cachedCustomer?.portal_show_history ?? false,
        portal_show_payment_status: data.portal_show_payment_status ?? cachedCustomer?.portal_show_payment_status ?? false,
        portal_show_quotes: data.portal_show_quotes ?? cachedCustomer?.portal_show_quotes ?? false,
      };

      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Customer update timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Client');
      }
      return await savePipelineService.withTimeout(updateDoc(docRef, safeData), {
        timeoutMessage: 'Customer update timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary customer update failed:', error);
      throw cloudTruthService.buildUpdateError('Client');
    }
  },

  deleteCustomer: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Customer delete timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Client');
      }
      return await savePipelineService.withTimeout(deleteDoc(docRef), {
        timeoutMessage: 'Customer delete timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary customer delete failed:', error);
      throw cloudTruthService.buildDeleteError('Client');
    }
  }
};
