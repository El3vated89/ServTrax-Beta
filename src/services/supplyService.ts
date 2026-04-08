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

export interface SupplyRecord {
  id?: string;
  ownerId: string;
  name: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_threshold: number;
  vendor?: string;
  notes?: string;
  active: boolean;
  last_restocked_at?: any;
  last_used_at?: any;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION_NAME = 'supplies';

const waitForCurrentUser = async () => {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<typeof auth.currentUser>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const supplyService = {
  subscribeToSupplies: (callback: (supplies: SupplyRecord[]) => void) => {
    let unsubscribeSupplies = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeSupplies();

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeSupplies = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid)),
        (snapshot) => {
          callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as SupplyRecord)));
        },
        (error) => handleFirestoreError(error, OperationType.GET, COLLECTION_NAME)
      );
    });

    return () => {
      unsubscribeSupplies();
      unsubscribeAuth();
    };
  },

  addSupply: async (supply: Omit<SupplyRecord, 'id' | 'ownerId' | 'created_at' | 'updated_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...supply,
        ownerId: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  updateSupply: async (id: string, updates: Partial<SupplyRecord>) => {
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
