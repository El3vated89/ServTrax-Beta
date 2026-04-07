import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';

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
    const user = auth.currentUser;
    if (!user) return () => {};

    const q = query(collection(db, 'equipment'), where('ownerId', '==', user.uid));
    
    return onSnapshot(q, (snapshot) => {
      const equipment = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Equipment[];
      callback(equipment);
    }, (error) => {
      console.error("Error fetching equipment:", error);
    });
  },

  addEquipment: async (equipmentData: Omit<Equipment, 'ownerId' | 'created_at'>) => {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    return addDoc(collection(db, 'equipment'), {
      ...equipmentData,
      ownerId: user.uid,
      created_at: serverTimestamp()
    });
  },

  updateEquipment: async (id: string, data: Partial<Equipment>) => {
    const docRef = doc(db, 'equipment', id);
    return updateDoc(docRef, data);
  },

  deleteEquipment: async (id: string) => {
    const docRef = doc(db, 'equipment', id);
    return deleteDoc(docRef);
  }
};
