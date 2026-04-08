import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';

import { settingsService, BusinessSettings, DEFAULT_SETTINGS, SeasonalRule } from './settingsService';

export type BillingFrequency = 'one-time' | 'weekly' | 'bi-weekly' | 'monthly' | 'flexible';

export interface RecurringPlan {
  id?: string;
  ownerId: string;
  customerId: string;
  servicePlanId?: string;
  name: string;
  price: number;
  frequency: BillingFrequency;
  status: 'active' | 'inactive' | 'paused';
  start_date: any;
  next_due_date: any;
  last_completed_date?: any;
  notes: string;
  created_at?: any;
  winter_mode_override?: 'pause' | 'stop' | 'reduce_frequency' | 'no_change';
  reduced_frequency_override?: 'weekly' | 'bi-weekly' | 'monthly';
  
  // New fields for flexible/seasonal logic
  interval_days?: number;
  override_enabled?: boolean;
  seasonal_enabled?: boolean;
  seasonal_rules?: SeasonalRule[];
}

const COLLECTION_NAME = 'recurring_plans';

const normalizeFrequency = (frequency?: string): BillingFrequency | undefined => {
  if (frequency === 'one_time' || frequency === 'one-time') return 'one-time';
  if (frequency === 'bi_weekly' || frequency === 'bi-weekly') return 'bi-weekly';
  if (frequency === 'weekly' || frequency === 'monthly' || frequency === 'flexible') return frequency;
  return undefined;
};

const applyFrequencyToDate = (nextDate: Date, date: Date, frequency: BillingFrequency, settings: BusinessSettings) => {
  switch (frequency) {
    case 'weekly':
      nextDate.setDate(date.getDate() + (settings.recurrence.weekly.days_between || 7));
      break;
    case 'bi-weekly':
      if (settings.recurrence.bi_weekly.mode === 'twice_per_month') {
        nextDate.setDate(date.getDate() + 15);
      } else {
        nextDate.setDate(date.getDate() + (settings.recurrence.bi_weekly.days_between || 14));
      }
      break;
    case 'monthly':
      if (settings.recurrence.monthly.mode === 'last_day') {
        nextDate.setMonth(date.getMonth() + 2, 0);
      } else {
        nextDate.setMonth(date.getMonth() + 1);
      }
      break;
    default:
      break;
  }
};

const isMonthDayInRange = (currentMonthDay: string, startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return false;

  if (startDate <= endDate) {
    return currentMonthDay >= startDate && currentMonthDay <= endDate;
  }

  return currentMonthDay >= startDate || currentMonthDay <= endDate;
};

export const recurringService = {
  subscribeToPlans: (callback: (plans: RecurringPlan[]) => void) => {
    let unsubscribePlans = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribePlans();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid));
      
      unsubscribePlans = onSnapshot(q, (snapshot) => {
        const plans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as RecurringPlan[];
        callback(plans);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      });
    });

    return () => {
      unsubscribePlans();
      unsubscribeAuth();
    };
  },

  addPlan: async (planData: Omit<RecurringPlan, 'ownerId' | 'created_at'>) => {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...planData,
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  updatePlan: async (id: string, data: Partial<RecurringPlan>) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      return await updateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  deletePlan: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
      return await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },

  calculateNextDueDate: async (currentDate: Date | Timestamp, frequency: BillingFrequency, plan?: RecurringPlan): Promise<Date> => {
    const date = currentDate instanceof Timestamp ? currentDate.toDate() : new Date(currentDate);
    const nextDate = new Date(date);
    const settings = await settingsService.getSettings();

    // Fetch service plan to get seasonal rules
    let seasonalEnabled = false;
    let seasonalRules: any[] = [];
    
    if (plan?.servicePlanId) {
      const planDoc = await getDoc(doc(db, 'service_plans', plan.servicePlanId));
      if (planDoc.exists()) {
        const planData = planDoc.data();
        seasonalEnabled = planData.seasonal_enabled || false;
        seasonalRules = planData.seasonal_rules || [];
      }
    }

    if (seasonalEnabled && seasonalRules.length > 0) {
      const rule = seasonalRules[0];
      const currentMonthDay = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;

      if (isMonthDayInRange(currentMonthDay, rule.start_date, rule.end_date)) {
        const offSeasonFrequency = normalizeFrequency(rule.off_season_frequency);

        if (offSeasonFrequency) {
          applyFrequencyToDate(nextDate, date, offSeasonFrequency, settings);
        } else if (rule.interval_days) {
          nextDate.setDate(date.getDate() + rule.interval_days);
        }

        return nextDate;
      }
    }

    // Check Winter Mode (legacy but keeping for compatibility if needed)
    if (settings.winter_mode.enabled) {
      const currentMonth = date.getMonth();
      const currentDay = date.getDate();
      
      const isWinter = (month: number, day: number) => {
        const start = settings.winter_mode.start_month * 100 + settings.winter_mode.start_day;
        const end = settings.winter_mode.end_month * 100 + settings.winter_mode.end_day;
        const current = month * 100 + day;
        
        if (start <= end) {
          return current >= start && current <= end;
        } else {
          return current >= start || current <= end;
        }
      };

      if (isWinter(currentMonth, currentDay)) {
        const behavior = plan?.winter_mode_override || settings.winter_mode.default_behavior;
        if (behavior === 'pause' || behavior === 'stop') {
          return nextDate; 
        }
        if (behavior === 'reduce_frequency') {
          frequency = plan?.reduced_frequency_override || settings.winter_mode.reduced_frequency || frequency;
        }
      }
    }

    applyFrequencyToDate(nextDate, date, frequency, settings);
    return nextDate;
  }
};
