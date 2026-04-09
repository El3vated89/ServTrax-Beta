import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { BillingFrequency } from './recurringService';
import { localFallbackStore } from './localFallbackStore';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';

export interface Quote {
  id?: string;
  ownerId: string;
  customerId: string;
  customer_name_snapshot: string;
  address_snapshot: string;
  phone_snapshot: string;
  service_snapshot: string;
  price_snapshot: number;
  billing_frequency: BillingFrequency;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  notes: string;
  portal_visible?: boolean;
  created_at?: any;
  approved_at?: any;
}

const COLLECTION_NAME = 'quotes';
const LOCAL_FALLBACK_NAMESPACE = 'quotes';
type LocalQuote = Quote & { _local_deleted?: boolean };
const quoteCache = new Map<string, Quote>();
const toClientTimestamp = () => new Date().toISOString();

const normalizeLocalQuote = (ownerId: string, entry: Partial<LocalQuote>): Quote => ({
  id: entry.id,
  ownerId,
  customerId: entry.customerId || '',
  customer_name_snapshot: entry.customer_name_snapshot || '',
  address_snapshot: entry.address_snapshot || '',
  phone_snapshot: entry.phone_snapshot || '',
  service_snapshot: entry.service_snapshot || '',
  price_snapshot: entry.price_snapshot || 0,
  billing_frequency: (entry.billing_frequency as BillingFrequency) || 'one-time',
  status: entry.status || 'draft',
  notes: entry.notes || '',
  portal_visible: entry.portal_visible,
  created_at: entry.created_at as any,
  approved_at: entry.approved_at as any,
});

const mergeQuotes = (primaryQuotes: Quote[], localQuotes: LocalQuote[]) => {
  const next = new Map<string, Quote>();

  primaryQuotes.forEach((quote) => {
    if (!quote.id) return;
    next.set(quote.id, quote);
  });

  localQuotes.forEach((quote) => {
    if (!quote.id) return;
    if (quote._local_deleted) {
      next.delete(quote.id);
      return;
    }
    next.set(quote.id, normalizeLocalQuote(quote.ownerId, quote));
  });

  const merged = Array.from(next.values());
  quoteCache.clear();
  merged.forEach((quote) => {
    if (quote.id) quoteCache.set(quote.id, quote);
  });
  return merged;
};

export const quoteService = {
  subscribeToQuotes: (callback: (quotes: Quote[]) => void) => {
    let unsubscribeQuotes = () => {};
    let unsubscribeLocal = () => {};
    let primaryQuotes: Quote[] = [];
    let localQuotes: LocalQuote[] = [];

    const emit = () => callback(mergeQuotes(primaryQuotes, localQuotes));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeQuotes();
      unsubscribeLocal();
      primaryQuotes = [];
      localQuotes = [];

      if (!user) {
        quoteCache.clear();
        callback([]);
        return;
      }

      const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid));

      unsubscribeQuotes = onSnapshot(q, (snapshot) => {
        primaryQuotes = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as Quote[];
        emit();
      }, (error) => {
        console.error('Primary quote subscription failed, using local fallback only:', error);
        primaryQuotes = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalQuote>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localQuotes = records;
        emit();
      });
    });

    return () => {
      unsubscribeQuotes();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addQuote: async (quoteData: Omit<Quote, 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...quoteData,
        ownerId: user.uid,
        created_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Primary quote save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<LocalQuote>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...quoteData,
        ownerId: user.uid,
        created_at: toClientTimestamp() as any,
      });
      return { id: localId };
    }
  },

  updateQuote: async (id: string, data: Partial<Quote>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);

    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Quote update timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        localFallbackStore.updateRecord<LocalQuote>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...data,
          _local_deleted: false,
        });
        return;
      }

      return await updateDoc(docRef, data);
    } catch (error) {
      console.error('Primary quote update failed, updating local fallback instead:', error);
      const cachedQuote = quoteCache.get(id);
      localFallbackStore.upsertRecord<LocalQuote>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedQuote || {
          id,
          ownerId: user.uid,
          customerId: data.customerId || '',
          customer_name_snapshot: data.customer_name_snapshot || '',
          address_snapshot: data.address_snapshot || '',
          phone_snapshot: data.phone_snapshot || '',
          service_snapshot: data.service_snapshot || '',
          price_snapshot: data.price_snapshot || 0,
          billing_frequency: (data.billing_frequency as BillingFrequency) || 'one-time',
          status: data.status || 'draft',
          notes: data.notes || '',
          created_at: toClientTimestamp() as any,
        }),
        ...data,
        _local_deleted: false,
      } as LocalQuote);
    }
  },

  deleteQuote: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);

    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Quote delete timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        localFallbackStore.removeRecord<LocalQuote>(LOCAL_FALLBACK_NAMESPACE, user.uid, id);
        quoteCache.delete(id);
        return;
      }

      return await deleteDoc(docRef);
    } catch (error) {
      console.error('Primary quote delete failed, hiding it locally instead:', error);
      const cachedQuote = quoteCache.get(id);
      localFallbackStore.upsertRecord<LocalQuote>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedQuote || {
          id,
          ownerId: user.uid,
          customerId: '',
          customer_name_snapshot: '',
          address_snapshot: '',
          phone_snapshot: '',
          service_snapshot: '',
          price_snapshot: 0,
          billing_frequency: 'one-time',
          status: 'draft',
          notes: '',
          created_at: toClientTimestamp() as any,
        }),
        _local_deleted: true,
      } as LocalQuote);
    }
  },
};
