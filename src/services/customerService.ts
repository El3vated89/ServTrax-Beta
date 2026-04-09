import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';
import { savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

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
const LOCAL_FALLBACK_NAMESPACE = 'customers';
type LocalCustomer = Customer & { _local_deleted?: boolean };
const customerCache = new Map<string, Customer>();
const toClientTimestamp = () => new Date().toISOString();

const normalizeCustomerRecord = (ownerId: string, entry: Partial<LocalCustomer>): Customer => ({
  id: entry.id,
  ownerId,
  name: entry.name || '',
  phone: entry.phone || '',
  email: entry.email || '',
  street: entry.street || '',
  line2: entry.line2 || '',
  city: entry.city || '',
  state: entry.state || '',
  zip: entry.zip || '',
  notes: entry.notes || '',
  access_notes: entry.access_notes || '',
  status: entry.status || 'active',
  last_service_date: entry.last_service_date as any,
  created_at: entry.created_at as any,
  off_season_enabled: entry.off_season_enabled ?? false,
  off_season_rules: entry.off_season_rules || [],
  portal_enabled: entry.portal_enabled ?? false,
  portal_token: entry.portal_token || '',
  portal_plan_name_snapshot: entry.portal_plan_name_snapshot || '',
  portal_persistent_allowed: entry.portal_persistent_allowed ?? false,
  portal_show_history: entry.portal_show_history ?? false,
  portal_show_payment_status: entry.portal_show_payment_status ?? false,
  portal_show_quotes: entry.portal_show_quotes ?? false,
});

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
        primaryCustomers = snapshot.docs.map((entry) =>
          normalizeCustomerRecord(
            String(entry.data().ownerId || user.uid),
            {
              id: entry.id,
              ...entry.data(),
            } as Partial<LocalCustomer>
          )
        );
        emit();
      }, (error) => {
        console.error('Primary customer subscription failed, using local fallback only:', error);
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
      console.error('Primary customer save failed, saving locally instead:', error);
      localFallbackStore.upsertRecord<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...customerData,
        ownerId: user.uid,
        created_at: toClientTimestamp() as any,
      });
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
      console.error('Primary customer update failed, updating local fallback instead:', error);
      const cachedCustomer = customerCache.get(id);
      const normalizedFallback = normalizeCustomerRecord(
        user.uid,
        {
          id,
          ...(cachedCustomer || {}),
          ...data,
        } as Partial<LocalCustomer>
      );
      localFallbackStore.upsertRecord<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedCustomer || {
          created_at: toClientTimestamp() as any,
        }),
        ...normalizedFallback,
        id,
        _local_deleted: false,
      } as LocalCustomer);
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
      console.error('Primary customer delete failed, hiding it locally instead:', error);
      const cachedCustomer = customerCache.get(id);
      localFallbackStore.upsertRecord<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedCustomer || {
          id,
          ownerId: user.uid,
          name: '',
          phone: '',
          email: '',
          street: '',
          city: '',
          state: '',
          zip: '',
          notes: '',
          status: 'active',
          created_at: toClientTimestamp() as any,
        }),
        _local_deleted: true,
      } as LocalCustomer);
      throw cloudTruthService.buildDeleteError('Client');
    }
  }
};
