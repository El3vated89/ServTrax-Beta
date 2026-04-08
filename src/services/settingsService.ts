import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';

export interface SeasonalRule {
  id?: string;
  service_id?: string;
  start_date?: string; // MM-DD
  end_date?: string; // MM-DD
  interval_days: number;
  off_season_frequency?: string;
  on_season_frequency?: string;
  label?: string;
}

export interface BusinessSettings {
  recurrence: {
    weekly: {
      days_between: number;
    };
    bi_weekly: {
      mode: '14_days' | 'twice_per_month';
      days_between?: number;
    };
    monthly: {
      mode: 'same_day' | 'last_day';
    };
  };
  winter_mode: {
    enabled: boolean;
    start_month: number; // 0-11
    start_day: number;
    end_month: number;
    end_day: number;
    default_behavior: 'pause' | 'stop' | 'reduce_frequency' | 'no_change';
    reduced_frequency?: 'weekly' | 'bi-weekly' | 'monthly';
  };
  grace_ranges: {
    due_grace_days: number;
    overdue_grace_days: number;
    critical_overdue_days: number;
  };
  seasonal_enabled: boolean;
  seasonal_defaults: {
    default_interval_days: number;
    seasonal_rules: SeasonalRule[];
    service_specific_rules: { [servicePlanId: string]: SeasonalRule[] };
  };
  storage_settings: {
    temporary_link_duration_days: number;
    allow_no_expiration: boolean;
  };
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  recurrence: {
    weekly: { days_between: 7 },
    bi_weekly: { mode: '14_days', days_between: 14 },
    monthly: { mode: 'same_day' }
  },
  winter_mode: {
    enabled: false,
    start_month: 10, // November
    start_day: 1,
    end_month: 2, // March
    end_day: 1,
    default_behavior: 'no_change'
  },
  grace_ranges: {
    due_grace_days: 0,
    overdue_grace_days: 4,
    critical_overdue_days: 5
  },
  seasonal_enabled: false,
  seasonal_defaults: {
    default_interval_days: 7,
    seasonal_rules: [],
    service_specific_rules: {}
  },
  storage_settings: {
    temporary_link_duration_days: 14,
    allow_no_expiration: false
  }
};

export const settingsService = {
  getSettings: async (): Promise<BusinessSettings> => {
    const user = await waitForCurrentUser();
    if (!user) return DEFAULT_SETTINGS;

    try {
      const docRef = doc(db, 'business_settings', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { ...DEFAULT_SETTINGS, ...docSnap.data() } as BusinessSettings;
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'business_settings');
      return DEFAULT_SETTINGS;
    }
  },

  updateSettings: async (settings: Partial<BusinessSettings>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      const docRef = doc(db, 'business_settings', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        await updateDoc(docRef, settings);
      } else {
        await setDoc(docRef, { ...DEFAULT_SETTINGS, ...settings });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'business_settings');
    }
  }
};
