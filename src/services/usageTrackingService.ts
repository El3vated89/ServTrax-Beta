import { doc, getDoc, increment, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { planConfigService } from './planConfigService';
import { storageService } from './StorageService';
import { handleFirestoreError, OperationType } from './verificationService';

export interface UsageCounter {
  ownerId: string;
  period_key: string;
  sms_used: number;
  email_used: number;
  storage_used_bytes: number;
  sms_limit: number;
  email_limit: number;
  storage_limit_bytes: number;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION_NAME = 'usage_counters';

const getCurrentPeriodKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getDocId = (ownerId: string, periodKey: string) => `${ownerId}_${periodKey}`;

const waitForCurrentUser = async () => {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<typeof auth.currentUser>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const usageTrackingService = {
  getCurrentPeriodKey,

  syncStorageUsageForCurrentUser: async () => {
    const user = await waitForCurrentUser();
    if (!user) return null;

    try {
      const summary = await storageService.getUsageSummary();
      const periodKey = getCurrentPeriodKey();
      const docId = getDocId(user.uid, periodKey);
      const usagePayload: UsageCounter = {
        ownerId: user.uid,
        period_key: periodKey,
        sms_used: 0,
        email_used: 0,
        storage_used_bytes: summary.used_bytes,
        sms_limit: 0,
        email_limit: 0,
        storage_limit_bytes: summary.limit_bytes,
      };

      await setDoc(
        doc(db, COLLECTION_NAME, docId),
        {
          ...usagePayload,
          updated_at: serverTimestamp(),
          created_at: serverTimestamp(),
        },
        { merge: true }
      );

      return usagePayload;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
      return null;
    }
  },

  subscribeToCurrentUsage: (callback: (usage: UsageCounter | null) => void) => {
    let unsubscribeUsage = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      unsubscribeUsage();

      if (!user) {
        callback(null);
        return;
      }

      await usageTrackingService.syncStorageUsageForCurrentUser();
      const docId = getDocId(user.uid, getCurrentPeriodKey());

      unsubscribeUsage = onSnapshot(
        doc(db, COLLECTION_NAME, docId),
        async (snapshot) => {
          if (snapshot.exists()) {
            callback(snapshot.data() as UsageCounter);
            return;
          }

          const summary = await storageService.getUsageSummary();
          callback({
            ownerId: user.uid,
            period_key: getCurrentPeriodKey(),
            sms_used: 0,
            email_used: 0,
            storage_used_bytes: summary.used_bytes,
            sms_limit: 0,
            email_limit: 0,
            storage_limit_bytes: summary.limit_bytes,
          });
        },
        (error) => handleFirestoreError(error, OperationType.GET, COLLECTION_NAME)
      );
    });

    return () => {
      unsubscribeUsage();
      unsubscribeAuth();
    };
  },

  recordUsage: async (channel: 'sms' | 'email', amount: number = 1) => {
    const user = await waitForCurrentUser();
    if (!user) return;

    try {
      const businessProfileSnap = await getDoc(doc(db, 'business_profiles', user.uid));
      const resolvedPlan = planConfigService.resolveBusinessPlan(
        businessProfileSnap.exists() ? businessProfileSnap.data() : null
      );
      const periodKey = getCurrentPeriodKey();
      const docId = getDocId(user.uid, periodKey);

      await setDoc(
        doc(db, COLLECTION_NAME, docId),
        {
          ownerId: user.uid,
          period_key: periodKey,
          sms_limit: resolvedPlan.limits.monthly_sms_limit,
          email_limit: resolvedPlan.limits.monthly_email_limit,
          storage_limit_bytes: resolvedPlan.storageLimitBytes,
          updated_at: serverTimestamp(),
          created_at: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, COLLECTION_NAME, docId),
        {
          [`${channel}_used`]: increment(amount),
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
    }
  },
};
