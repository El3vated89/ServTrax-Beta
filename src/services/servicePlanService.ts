import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { waitForCurrentUser } from './authSessionService';

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

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribePlans();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribePlans = onSnapshot(q, (snapshot) => {
        const plans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ServicePlan[];
        callback(plans);
      }, (error) => {
        console.error("Error fetching service plans:", error);
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

    return await addDoc(collection(db, COLLECTION_NAME), newPlan);
  },

  updateServicePlan: async (id: string, updates: Partial<ServicePlan>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to update service plan');
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    const currentPlan: Partial<ServicePlan> = docSnap.exists() ? docSnap.data() as ServicePlan : {};
    const safeUpdates: Partial<ServicePlan> = {
      ...updates,
      billing_frequency: normalizeBillingFrequency(updates.billing_frequency || currentPlan.billing_frequency)
    };

    if ('seasonal_rules' in updates) {
      safeUpdates.seasonal_rules = normalizeSeasonalRules(updates.seasonal_rules);
    }

    return await updateDoc(docRef, safeUpdates);
  },

  deleteServicePlan: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to delete service plan');
    const docRef = doc(db, COLLECTION_NAME, id);
    return await deleteDoc(docRef);
  },

  initializeDefaultServices: async () => {
    const user = await waitForCurrentUser();
    if (!user) return;

    const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid), where('name', '==', 'Lawn Service (basic)'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      await addDoc(collection(db, COLLECTION_NAME), {
        name: 'Lawn Service (basic)',
        description: 'Basic lawn mowing service',
        price: 50,
        billing_frequency: 'bi_weekly',
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    }
  }
};
