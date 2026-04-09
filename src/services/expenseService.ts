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
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';
import { savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';

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

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
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
      return await savePipelineService.withTimeout(
        addDoc(collection(db, COLLECTION_NAME), {
          ...expense,
          ownerId: user.uid,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Expense save timed out while writing to the database.',
        }
      );
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
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Expense update timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        localFallbackStore.updateRecord<ExpenseRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...updates,
          updated_at: new Date().toISOString(),
        });
        return;
      }

      await savePipelineService.withTimeout(
        updateDoc(doc(db, COLLECTION_NAME, id), {
          ...updates,
          updated_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Expense update timed out while writing to the database.',
        }
      );
    } catch (error) {
      console.error('Primary expense update failed, updating local fallback instead:', error);
      localFallbackStore.updateRecord<ExpenseRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
        ...updates,
        updated_at: new Date().toISOString(),
      });
    }
  },
};
