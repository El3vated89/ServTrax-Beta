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
import { savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

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
export const expenseService = {
  subscribeToExpenses: (callback: (expenses: ExpenseRecord[]) => void) => {
    let unsubscribeExpenses = () => {};
    let primaryExpenses: ExpenseRecord[] = [];
    const emit = () => callback([...primaryExpenses]);

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeExpenses();
      primaryExpenses = [];

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
          console.error('Primary expense subscription failed:', error);
          primaryExpenses = [];
          emit();
        }
      );
    });

    return () => {
      unsubscribeExpenses();
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
      console.error('Primary expense save failed:', error);
      throw cloudTruthService.buildCreateError('Expense');
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
        throw cloudTruthService.buildUnsyncedRecordError('Expense');
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
      console.error('Primary expense update failed:', error);
      throw cloudTruthService.buildUpdateError('Expense');
    }
  },
};
