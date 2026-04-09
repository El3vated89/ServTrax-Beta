import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';
import { savePipelineService } from './savePipelineService';

export interface ServicePlan {
  id?: string;
  ownerId?: string;
  name: string;
  description: string;
  price: number;
  billing_frequency: string;
  requires_photos?: boolean;
  seasonal_enabled?: boolean;
  seasonal_rules?: any[];
  created_at?: any;
}

const COLLECTION_NAME = 'service_plans';
const LOCAL_FALLBACK_NAMESPACE = 'service_plans';
type LocalServicePlan = ServicePlan & { _local_deleted?: boolean };
const servicePlanCache = new Map<string, ServicePlan>();
const toClientTimestamp = () => new Date().toISOString();

const normalizeBillingFrequency = (frequency?: string) => {
  if (frequency === 'one-time') return 'one_time';
  if (frequency === 'bi-weekly') return 'bi_weekly';
  return frequency || 'one_time';
};

const getIntervalDaysForFrequency = (frequency?: string) => {
  if (frequency === 'weekly') return 7;
  if (frequency === 'bi_weekly' || frequency === 'bi-weekly') return 14;
  if (frequency === 'monthly') return 30;
  return 7;
};

const normalizeSeasonalFrequency = (frequency?: string) => {
  if (frequency === 'bi-weekly') return 'bi_weekly';
  if (frequency === 'weekly' || frequency === 'bi_weekly' || frequency === 'monthly') return frequency;
  return 'monthly';
};

const normalizeSeasonalRules = (rules?: any[]) => (rules || []).slice(0, 1).map(rule => {
  const offSeasonFrequency = normalizeSeasonalFrequency(rule.off_season_frequency);

  return {
    ...rule,
    off_season_frequency: offSeasonFrequency,
    interval_days: Number(rule.interval_days) || getIntervalDaysForFrequency(offSeasonFrequency)
  };
});

export const servicePlanService = {
  subscribeToServicePlans: (callback: (plans: ServicePlan[]) => void) => {
    let unsubscribePlans = () => {};
    let unsubscribeLocal = () => {};
    let primaryPlans: ServicePlan[] = [];
    let localPlans: LocalServicePlan[] = [];

    const normalizeLocalPlan = (ownerId: string, entry: Partial<LocalServicePlan>): ServicePlan => ({
      id: entry.id,
      ownerId,
      name: entry.name || '',
      description: entry.description || '',
      price: entry.price || 0,
      billing_frequency: normalizeBillingFrequency(entry.billing_frequency),
      requires_photos: entry.requires_photos ?? false,
      seasonal_enabled: entry.seasonal_enabled ?? false,
      seasonal_rules: normalizeSeasonalRules(entry.seasonal_rules),
      created_at: entry.created_at as any,
    });

    const emit = () => {
      const next = new Map<string, ServicePlan>();
      primaryPlans.forEach((plan) => {
        if (!plan.id) return;
        next.set(plan.id, plan);
      });
      localPlans.forEach((plan) => {
        if (!plan.id) return;
        if (plan._local_deleted) {
          next.delete(plan.id);
          return;
        }
        next.set(plan.id, normalizeLocalPlan(plan.ownerId || '', plan));
      });
      const merged = Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
      servicePlanCache.clear();
      merged.forEach((plan) => {
        if (plan.id) servicePlanCache.set(plan.id, plan);
      });
      callback(merged);
    };

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribePlans();
      unsubscribeLocal();
      primaryPlans = [];
      localPlans = [];

      if (!user) {
        servicePlanCache.clear();
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribePlans = onSnapshot(q, (snapshot) => {
        primaryPlans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ServicePlan[];
        emit();
      }, (error) => {
        console.error('Primary service plan subscription failed, using local fallback only:', error);
        primaryPlans = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalServicePlan>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localPlans = records;
        emit();
      });
    });

    return () => {
      unsubscribePlans();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addServicePlan: async (plan: Omit<ServicePlan, 'id' | 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to add service plan');

    const newPlan = {
      ...plan,
      billing_frequency: normalizeBillingFrequency(plan.billing_frequency),
      seasonal_rules: normalizeSeasonalRules(plan.seasonal_rules),
      ownerId: user.uid,
      created_at: serverTimestamp()
    };

    try {
      return await savePipelineService.withTimeout(addDoc(collection(db, COLLECTION_NAME), newPlan), {
        timeoutMessage: 'Service plan save timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary service plan save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<LocalServicePlan>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...newPlan,
        created_at: toClientTimestamp() as any,
      });
      return { id: localId };
    }
  },

  updateServicePlan: async (id: string, updates: Partial<ServicePlan>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to update service plan');
    const docRef = doc(db, COLLECTION_NAME, id);
    let currentPlan: Partial<ServicePlan> = servicePlanCache.get(id) || {};

    if (!localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
      try {
        const docSnap = await savePipelineService.withTimeout(getDoc(docRef), {
          timeoutMessage: 'Service plan update timed out while loading the current record.',
        });
        currentPlan = docSnap.exists() ? docSnap.data() as ServicePlan : currentPlan;
      } catch (error) {
        console.error('Unable to load current service plan before update, using cached plan instead:', error);
      }
    }

    const safeUpdates: Partial<ServicePlan> = {
      ...updates,
      billing_frequency: normalizeBillingFrequency(updates.billing_frequency || currentPlan.billing_frequency)
    };

    if ('seasonal_rules' in updates) {
      safeUpdates.seasonal_rules = normalizeSeasonalRules(updates.seasonal_rules);
    }

    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.updateRecord<LocalServicePlan>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...safeUpdates,
          _local_deleted: false,
        });
        return;
      }

      return await savePipelineService.withTimeout(updateDoc(docRef, safeUpdates), {
        timeoutMessage: 'Service plan update timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary service plan update failed, updating local fallback instead:', error);
      localFallbackStore.upsertRecord<LocalServicePlan>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(currentPlan as LocalServicePlan),
        id,
        ownerId: user.uid,
        ...safeUpdates,
        _local_deleted: false,
      });
    }
  },

  deleteServicePlan: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to delete service plan');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.removeRecord<LocalServicePlan>(LOCAL_FALLBACK_NAMESPACE, user.uid, id);
        servicePlanCache.delete(id);
        return;
      }
      return await savePipelineService.withTimeout(deleteDoc(docRef), {
        timeoutMessage: 'Service plan delete timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary service plan delete failed, hiding it locally instead:', error);
      const currentPlan = servicePlanCache.get(id);
      localFallbackStore.upsertRecord<LocalServicePlan>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(currentPlan || {
          id,
          ownerId: user.uid,
          name: '',
          description: '',
          price: 0,
          billing_frequency: 'one_time',
          created_at: toClientTimestamp() as any,
        }),
        _local_deleted: true,
      } as LocalServicePlan);
    }
  },

  initializeDefaultServices: async () => {
    const user = await waitForCurrentUser();
    if (!user) return;

    const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid), where('name', '==', 'Lawn Service (basic)'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      await servicePlanService.addServicePlan({
        name: 'Lawn Service (basic)',
        description: 'Basic lawn mowing service',
        price: 50,
        billing_frequency: 'bi_weekly',
      });
    }
  }
};
