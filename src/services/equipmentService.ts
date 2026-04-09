import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';

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
const LOCAL_FALLBACK_NAMESPACE = 'equipment';
type LocalEquipment = Equipment & { _local_deleted?: boolean };
const equipmentCache = new Map<string, Equipment>();
const toClientTimestamp = () => new Date().toISOString();

const normalizeLocalEquipment = (ownerId: string, entry: Partial<LocalEquipment>): Equipment => ({
  id: entry.id,
  ownerId,
  name: entry.name || '',
  brand: entry.brand || '',
  model: entry.model || '',
  serial_number: entry.serial_number || '',
  part_number: entry.part_number || '',
  notes: entry.notes || '',
  service_history: entry.service_history || [],
  created_at: entry.created_at as any,
});

const mergeEquipment = (primaryEquipment: Equipment[], localEquipment: LocalEquipment[]) => {
  const next = new Map<string, Equipment>();
  primaryEquipment.forEach((entry) => {
    if (!entry.id) return;
    next.set(entry.id, entry);
  });
  localEquipment.forEach((entry) => {
    if (!entry.id) return;
    if (entry._local_deleted) {
      next.delete(entry.id);
      return;
    }
    next.set(entry.id, normalizeLocalEquipment(entry.ownerId, entry));
  });
  const merged = Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
  equipmentCache.clear();
  merged.forEach((entry) => {
    if (entry.id) equipmentCache.set(entry.id, entry);
  });
  return merged;
};

export const equipmentService = {
  subscribeToEquipment: (callback: (equipment: Equipment[]) => void) => {
    let unsubscribeEquipment = () => {};
    let unsubscribeLocal = () => {};
    let primaryEquipment: Equipment[] = [];
    let localEquipment: LocalEquipment[] = [];

    const emit = () => callback(mergeEquipment(primaryEquipment, localEquipment));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeEquipment();
      unsubscribeLocal();
      primaryEquipment = [];
      localEquipment = [];

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
        console.error('Primary equipment subscription failed, using local fallback only:', error);
        primaryEquipment = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalEquipment>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localEquipment = records;
        emit();
      });
    });

    return () => {
      unsubscribeEquipment();
      unsubscribeLocal();
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
      console.error('Primary equipment save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<LocalEquipment>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...equipmentData,
        ownerId: user.uid,
        created_at: toClientTimestamp() as any,
      });
      return { id: localId };
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
        localFallbackStore.updateRecord<LocalEquipment>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...data,
          _local_deleted: false,
        });
        return;
      }
      return await updateDoc(docRef, data);
    } catch (error) {
      console.error('Primary equipment update failed, updating local fallback instead:', error);
      const cachedEquipment = equipmentCache.get(id);
      localFallbackStore.upsertRecord<LocalEquipment>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedEquipment || {
          id,
          ownerId: user.uid,
          name: data.name || '',
          brand: data.brand || '',
          model: data.model || '',
          serial_number: data.serial_number || '',
          part_number: data.part_number || '',
          notes: data.notes || '',
          service_history: data.service_history || [],
          created_at: toClientTimestamp() as any,
        }),
        ...data,
        _local_deleted: false,
      } as LocalEquipment);
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
        localFallbackStore.removeRecord<LocalEquipment>(LOCAL_FALLBACK_NAMESPACE, user.uid, id);
        equipmentCache.delete(id);
        return;
      }
      return await deleteDoc(docRef);
    } catch (error) {
      console.error('Primary equipment delete failed, hiding it locally instead:', error);
      const cachedEquipment = equipmentCache.get(id);
      localFallbackStore.upsertRecord<LocalEquipment>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedEquipment || {
          id,
          ownerId: user.uid,
          name: '',
          brand: '',
          model: '',
          serial_number: '',
          part_number: '',
          notes: '',
          service_history: [],
          created_at: toClientTimestamp() as any,
        }),
        _local_deleted: true,
      } as LocalEquipment);
    }
  }
};
