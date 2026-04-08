import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';

export type ExpenseCategory =
  | 'fuel'
  | 'supplies'
  | 'repair'
  | 'software'
  | 'dump_fees'
  | 'labor'
  | 'other';

export type ExpenseRecurrence = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type ExpenseStatus = 'active' | 'inactive';

export interface ExpenseRecord {
  id?: string;
  ownerId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  vendor?: string;
  notes?: string;
  expense_date: any;
  is_recurring: boolean;
  recurrence_frequency: ExpenseRecurrence;
  next_due_date?: any;
  status: ExpenseStatus;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION_NAME = 'expenses';
const LOCAL_FALLBACK_NAMESPACE = 'expenses';

export const expenseService = {
  subscribeToExpenses: (callback: (expenses: ExpenseRecord[]) => void) => {
    let unsubscribeExpenses = () => {};
    let unsubscribeLocal = () => {};
    let primaryExpenses: ExpenseRecord[] = [];
    let localExpenses: ExpenseRecord[] = [];

    const emit = () => {
      const deduped = new Map<string, ExpenseRecord>();
      [...localExpenses, ...primaryExpenses].forEach((entry) => {
        const key = entry.id || `${entry.title}:${entry.expense_date || entry.created_at || ''}`;
        deduped.set(key, entry);
      });
      callback(Array.from(deduped.values()));
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeExpenses();
      unsubscribeLocal();
      primaryExpenses = [];
      localExpenses = [];

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeExpenses = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid)),
        (snapshot) => {
          primaryExpenses = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ExpenseRecord));
          emit();
        },
        (error) => {
          console.error('Primary expense subscription failed, using local fallback only:', error);
          primaryExpenses = [];
          emit();
        }
      );

      unsubscribeLocal = localFallbackStore.subscribeToRecords<ExpenseRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localExpenses = records;
        emit();
      });
    });

    return () => {
      unsubscribeExpenses();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addExpense: async (expense: Omit<ExpenseRecord, 'id' | 'ownerId' | 'created_at' | 'updated_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...expense,
        ownerId: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Primary expense save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<ExpenseRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...expense,
        ownerId: user.uid,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return { id: localId };
    }
  },

  updateExpense: async (id: string, updates: Partial<ExpenseRecord>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.updateRecord<ExpenseRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...updates,
          updated_at: new Date().toISOString(),
        });
        return;
      }

      await updateDoc(doc(db, COLLECTION_NAME, id), {
        ...updates,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Primary expense update failed, updating local fallback instead:', error);
      localFallbackStore.updateRecord<ExpenseRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
        ...updates,
        updated_at: new Date().toISOString(),
      });
    }
  },
};
