import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';
import { BillingFrequency } from './recurringService';

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

export const quoteService = {
  subscribeToQuotes: (callback: (quotes: Quote[]) => void) => {
    let unsubscribeQuotes = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeQuotes();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid));
      
      unsubscribeQuotes = onSnapshot(q, (snapshot) => {
        const quotes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Quote[];
        callback(quotes);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
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
        created_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  updateQuote: async (id: string, data: Partial<Quote>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      return await updateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  deleteQuote: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      return await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  }
};
