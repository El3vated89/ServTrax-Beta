import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { BillingFrequency } from './recurringService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

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
const quoteCache = new Map<string, Quote>();

const mergeQuotes = (primaryQuotes: Quote[]) => {
  const merged = [...primaryQuotes];
  quoteCache.clear();
  merged.forEach((quote) => {
    if (quote.id) quoteCache.set(quote.id, quote);
  });
  return merged;
};

export const quoteService = {
  subscribeToQuotes: (callback: (quotes: Quote[]) => void) => {
    let unsubscribeQuotes = () => {};
    let primaryQuotes: Quote[] = [];

    const emit = () => callback(mergeQuotes(primaryQuotes));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeQuotes();
      primaryQuotes = [];

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
        console.error('Primary quote subscription failed:', error);
        primaryQuotes = [];
        emit();
      });
    });

    return () => {
      unsubscribeQuotes();
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
      console.error('Primary quote save failed:', error);
      throw cloudTruthService.buildCreateError('Quote');
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
        throw cloudTruthService.buildUnsyncedRecordError('Quote');
      }

      return await updateDoc(docRef, data);
    } catch (error) {
      console.error('Primary quote update failed:', error);
      throw cloudTruthService.buildUpdateError('Quote');
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
        throw cloudTruthService.buildUnsyncedRecordError('Quote');
      }

      return await deleteDoc(docRef);
    } catch (error) {
      console.error('Primary quote delete failed:', error);
      throw cloudTruthService.buildDeleteError('Quote');
    }
  },
};
