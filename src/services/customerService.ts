import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';

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

const normalizeLocalCustomer = (ownerId: string, entry: Partial<LocalCustomer>): Customer => ({
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

const mergeCustomers = (primaryCustomers: Customer[], localCustomers: LocalCustomer[]) => {
  const next = new Map<string, Customer>();
  primaryCustomers.forEach((customer) => {
    if (!customer.id) return;
    next.set(customer.id, customer);
  });
  localCustomers.forEach((customer) => {
    if (!customer.id) return;
    if (customer._local_deleted) {
      next.delete(customer.id);
      return;
    }
    next.set(customer.id, normalizeLocalCustomer(customer.ownerId, customer));
  });
  const merged = Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
  customerCache.clear();
  merged.forEach((customer) => {
    if (customer.id) customerCache.set(customer.id, customer);
  });
  return merged;
};

export const customerService = {
  subscribeToCustomers: (callback: (customers: Customer[]) => void) => {
    let unsubscribeCustomers = () => {};
    let unsubscribeLocal = () => {};
    let primaryCustomers: Customer[] = [];
    let localCustomers: LocalCustomer[] = [];

    const emit = () => callback(mergeCustomers(primaryCustomers, localCustomers));

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeCustomers();
      unsubscribeLocal();
      primaryCustomers = [];
      localCustomers = [];

      if (!user) {
        customerCache.clear();
        callback([]);
        return;
      }

      const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid));
      
      unsubscribeCustomers = onSnapshot(q, (snapshot) => {
        primaryCustomers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Customer[];
        emit();
      }, (error) => {
        console.error('Primary customer subscription failed, using local fallback only:', error);
        primaryCustomers = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localCustomers = records;
        emit();
      });
    });

    return () => {
      unsubscribeCustomers();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addCustomer: async (customerData: Omit<Customer, 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...customerData,
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Primary customer save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...customerData,
        ownerId: user.uid,
        created_at: toClientTimestamp() as any,
      });
      return { id: localId };
    }
  },

  updateCustomer: async (id: string, data: Partial<Customer>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.updateRecord<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...data,
          _local_deleted: false,
        });
        return;
      }
      return await updateDoc(docRef, data);
    } catch (error) {
      console.error('Primary customer update failed, updating local fallback instead:', error);
      const cachedCustomer = customerCache.get(id);
      localFallbackStore.upsertRecord<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedCustomer || {
          id,
          ownerId: user.uid,
          name: data.name || '',
          phone: data.phone || '',
          email: data.email || '',
          street: data.street || '',
          city: data.city || '',
          state: data.state || '',
          zip: data.zip || '',
          notes: data.notes || '',
          status: data.status || 'active',
          created_at: toClientTimestamp() as any,
        }),
        ...data,
        _local_deleted: false,
      } as LocalCustomer);
    }
  },

  deleteCustomer: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.removeRecord<LocalCustomer>(LOCAL_FALLBACK_NAMESPACE, user.uid, id);
        customerCache.delete(id);
        return;
      }
      return await deleteDoc(docRef);
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
    }
  }
};
