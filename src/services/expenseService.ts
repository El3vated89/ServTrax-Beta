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

const waitForCurrentUser = async () => {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<typeof auth.currentUser>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const expenseService = {
  subscribeToExpenses: (callback: (expenses: ExpenseRecord[]) => void) => {
    let unsubscribeExpenses = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeExpenses();

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeExpenses = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid)),
        (snapshot) => {
          callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ExpenseRecord)));
        },
        (error) => handleFirestoreError(error, OperationType.GET, COLLECTION_NAME)
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
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...expense,
        ownerId: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  updateExpense: async (id: string, updates: Partial<ExpenseRecord>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      await updateDoc(doc(db, COLLECTION_NAME, id), {
        ...updates,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },
};
