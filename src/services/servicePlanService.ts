import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

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
const servicePlanCache = new Map<string, ServicePlan>();

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
    let primaryPlans: ServicePlan[] = [];

    const emit = () => {
      const merged = [...primaryPlans].sort((left, right) => left.name.localeCompare(right.name));
      servicePlanCache.clear();
      merged.forEach((plan) => {
        if (plan.id) servicePlanCache.set(plan.id, plan);
      });
      callback(merged);
    };

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribePlans();
      primaryPlans = [];

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
        console.error('Primary service plan subscription failed:', error);
        primaryPlans = [];
        emit();
      });
    });

    return () => {
      unsubscribePlans();
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
      console.error('Primary service plan save failed:', error);
      throw cloudTruthService.buildCreateError('Service');
    }
  },

  updateServicePlan: async (id: string, updates: Partial<ServicePlan>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to update service plan');
    const docRef = doc(db, COLLECTION_NAME, id);
    let currentPlan: Partial<ServicePlan> = servicePlanCache.get(id) || {};

    const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
      COLLECTION_NAME,
      id,
      'Service plan update timed out while checking the recovered cloud record.'
    );

    if (!shouldUseLocalFallback) {
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
      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Service');
      }

      return await savePipelineService.withTimeout(updateDoc(docRef, safeUpdates), {
        timeoutMessage: 'Service plan update timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary service plan update failed:', error);
      throw cloudTruthService.buildUpdateError('Service');
    }
  },

  deleteServicePlan: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to delete service plan');
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Service plan delete timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Service');
      }
      return await savePipelineService.withTimeout(deleteDoc(docRef), {
        timeoutMessage: 'Service plan delete timed out while writing to the database.',
      });
    } catch (error) {
      console.error('Primary service plan delete failed:', error);
      throw cloudTruthService.buildDeleteError('Service');
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
