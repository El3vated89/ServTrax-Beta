import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';

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

export const customerService = {
  subscribeToCustomers: (callback: (customers: Customer[]) => void) => {
    let unsubscribeCustomers = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeCustomers();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(collection(db, 'customers'), where('ownerId', '==', user.uid));
      
      unsubscribeCustomers = onSnapshot(q, (snapshot) => {
        const customers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Customer[];
        callback(customers);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'customers');
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
      return await addDoc(collection(db, 'customers'), {
        ...customerData,
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customers');
    }
  },

  updateCustomer: async (id: string, data: Partial<Customer>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'customers', id);
    try {
      return await updateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `customers/${id}`);
    }
  },

  deleteCustomer: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'customers', id);
    try {
      return await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
    }
  }
};
