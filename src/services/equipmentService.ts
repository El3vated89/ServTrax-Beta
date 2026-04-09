import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

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

const COLLECTION_NAME = 'equipment';
const equipmentCache = new Map<string, Equipment>();
const mergeEquipment = (primaryEquipment: Equipment[]) => {
  const merged = [...primaryEquipment].sort((left, right) => left.name.localeCompare(right.name));
  equipmentCache.clear();
  merged.forEach((entry) => {
    if (entry.id) equipmentCache.set(entry.id, entry);
  });
  return merged;
};

export const equipmentService = {
  subscribeToEquipment: (callback: (equipment: Equipment[]) => void) => {
    let unsubscribeEquipment = () => {};
    let primaryEquipment: Equipment[] = [];

    const emit = () => callback(mergeEquipment(primaryEquipment));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeEquipment();
      primaryEquipment = [];

      if (!user) {
        equipmentCache.clear();
        callback([]);
        return;
      }

      const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid));
      
      unsubscribeEquipment = onSnapshot(q, (snapshot) => {
        primaryEquipment = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Equipment[];
        emit();
      }, (error) => {
        console.error('Primary equipment subscription failed:', error);
        primaryEquipment = [];
        emit();
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
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...equipmentData,
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Primary equipment save failed:', error);
      throw cloudTruthService.buildCreateError('Equipment');
    }
  },

  updateEquipment: async (id: string, data: Partial<Equipment>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Equipment update timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Equipment');
      }
      return await updateDoc(docRef, data);
    } catch (error) {
      console.error('Primary equipment update failed:', error);
      throw cloudTruthService.buildUpdateError('Equipment');
    }
  },

  deleteEquipment: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Equipment delete timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Equipment');
      }
      return await deleteDoc(docRef);
    } catch (error) {
      console.error('Primary equipment delete failed:', error);
      throw cloudTruthService.buildDeleteError('Equipment');
    }
  }
};
