import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';

export interface Equipment {
  id?: string;
  ownerId: string;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
  part_number: string;
  notes: string;
  service_history: {
    date: string;
    description: string;
  }[];
  created_at?: any;
}

export const equipmentService = {
  subscribeToEquipment: (callback: (equipment: Equipment[]) => void) => {
    let unsubscribeEquipment = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeEquipment();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(collection(db, 'equipment'), where('ownerId', '==', user.uid));
      
      unsubscribeEquipment = onSnapshot(q, (snapshot) => {
        const equipment = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Equipment[];
        callback(equipment);
      }, (error) => {
        console.error("Error fetching equipment:", error);
      });
    });

    return () => {
      unsubscribeEquipment();
      unsubscribeAuth();
    };
  },

  addEquipment: async (equipmentData: Omit<Equipment, 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, 'equipment'), {
        ...equipmentData,
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'equipment');
    }
  },

  updateEquipment: async (id: string, data: Partial<Equipment>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'equipment', id);
    try {
      return await updateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `equipment/${id}`);
    }
  },

  deleteEquipment: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'equipment', id);
    try {
      return await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `equipment/${id}`);
    }
  }
};
