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
import { localFallbackStore } from './localFallbackStore';

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
const LOCAL_FALLBACK_NAMESPACE = 'supplies';
type LocalSupplyRecord = SupplyRecord & { _local_deleted?: boolean };
const supplyCache = new Map<string, SupplyRecord>();
const toClientTimestamp = () => new Date().toISOString();

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
    let unsubscribeLocal = () => {};
    let primarySupplies: SupplyRecord[] = [];
    let localSupplies: LocalSupplyRecord[] = [];

    const normalizeLocalSupply = (ownerId: string, entry: Partial<LocalSupplyRecord>): SupplyRecord => ({
      id: entry.id,
      ownerId,
      name: entry.name || '',
      category: entry.category || '',
      unit: entry.unit || '',
      quantity_on_hand: entry.quantity_on_hand || 0,
      reorder_threshold: entry.reorder_threshold || 0,
      vendor: entry.vendor || '',
      notes: entry.notes || '',
      active: entry.active ?? true,
      last_restocked_at: entry.last_restocked_at as any,
      last_used_at: entry.last_used_at as any,
      created_at: entry.created_at as any,
      updated_at: entry.updated_at as any,
    });

    const emit = () => {
      const next = new Map<string, SupplyRecord>();
      primarySupplies.forEach((entry) => {
        if (!entry.id) return;
        next.set(entry.id, entry);
      });
      localSupplies.forEach((entry) => {
        if (!entry.id) return;
        if (entry._local_deleted) {
          next.delete(entry.id);
          return;
        }
        next.set(entry.id, normalizeLocalSupply(entry.ownerId, entry));
      });
      const merged = Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
      supplyCache.clear();
      merged.forEach((entry) => {
        if (entry.id) supplyCache.set(entry.id, entry);
      });
      callback(merged);
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeSupplies();
      unsubscribeLocal();
      primarySupplies = [];
      localSupplies = [];

      if (!user) {
        supplyCache.clear();
        callback([]);
        return;
      }

      unsubscribeSupplies = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid)),
        (snapshot) => {
          primarySupplies = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as SupplyRecord));
          emit();
        },
        (error) => {
          console.error('Primary supply subscription failed, using local fallback only:', error);
          primarySupplies = [];
          emit();
        }
      );

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalSupplyRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localSupplies = records;
        emit();
      });
    });

    return () => {
      unsubscribeSupplies();
      unsubscribeLocal();
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
      console.error('Primary supply save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<LocalSupplyRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...supply,
        ownerId: user.uid,
        created_at: toClientTimestamp() as any,
        updated_at: toClientTimestamp() as any,
      });
      return { id: localId };
    }
  },

  updateSupply: async (id: string, updates: Partial<SupplyRecord>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.updateRecord<LocalSupplyRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...updates,
          updated_at: toClientTimestamp() as any,
          _local_deleted: false,
        });
        return;
      }
      await updateDoc(doc(db, COLLECTION_NAME, id), {
        ...updates,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Primary supply update failed, updating local fallback instead:', error);
      const cachedSupply = supplyCache.get(id);
      localFallbackStore.upsertRecord<LocalSupplyRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedSupply || {
          id,
          ownerId: user.uid,
          name: updates.name || '',
          category: updates.category || '',
          unit: updates.unit || '',
          quantity_on_hand: updates.quantity_on_hand || 0,
          reorder_threshold: updates.reorder_threshold || 0,
          active: updates.active ?? true,
          created_at: toClientTimestamp() as any,
        }),
        ...updates,
        updated_at: toClientTimestamp() as any,
        _local_deleted: false,
      } as LocalSupplyRecord);
    }
  },
};
