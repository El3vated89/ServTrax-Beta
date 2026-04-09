import { doc, getDoc, increment, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { planConfigService } from './planConfigService';
import { storageService } from './StorageService';
import { handleFirestoreError, OperationType } from './verificationService';
import { waitForCurrentUser } from './authSessionService';
import { SaveDebugContext, savePipelineService } from './savePipelineService';

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

const getResolvedUsageLimits = async (userId: string, debugContext?: SaveDebugContext) => {
  const businessProfileSnap = await savePipelineService.withTimeout(getDoc(doc(db, 'business_profiles', userId)), {
    timeoutMessage: 'Timed out while loading the business profile for usage tracking.',
    debugContext,
  });
  const resolvedPlan = planConfigService.resolveBusinessPlan(
    businessProfileSnap.exists() ? businessProfileSnap.data() : null
  );

  return {
    sms_limit: resolvedPlan.limits.monthly_sms_limit,
    email_limit: resolvedPlan.limits.monthly_email_limit,
    storage_limit_bytes: resolvedPlan.storageLimitBytes,
  };
};

export const usageTrackingService = {
  getCurrentPeriodKey,

  syncStorageUsageForCurrentUser: async (debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) return null;

    try {
      const summary = await storageService.getUsageSummary(debugContext);
      const resolvedLimits = await getResolvedUsageLimits(user.uid, debugContext);
      const periodKey = getCurrentPeriodKey();
      const docId = getDocId(user.uid, periodKey);
      const usagePayload: UsageCounter = {
        ownerId: user.uid,
        period_key: periodKey,
        sms_used: 0,
        email_used: 0,
        storage_used_bytes: summary.used_bytes,
        sms_limit: resolvedLimits.sms_limit,
        email_limit: resolvedLimits.email_limit,
        storage_limit_bytes: summary.limit_bytes || resolvedLimits.storage_limit_bytes,
      };

      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', { id: docId, action: 'sync_storage_usage' });
      }
      await savePipelineService.withTimeout(
        setDoc(
          doc(db, COLLECTION_NAME, docId),
          {
            ...usagePayload,
            updated_at: serverTimestamp(),
            created_at: serverTimestamp(),
          },
          { merge: true }
        ),
        {
          timeoutMessage: 'Timed out while syncing storage usage.',
          debugContext,
        }
      );
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { id: docId, action: 'sync_storage_usage' });
      }

      return usagePayload;
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
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
          const resolvedLimits = await getResolvedUsageLimits(user.uid);

          if (snapshot.exists()) {
            const snapshotData = snapshot.data() as UsageCounter;
            callback({
              ...snapshotData,
              sms_limit: snapshotData.sms_limit || resolvedLimits.sms_limit,
              email_limit: snapshotData.email_limit || resolvedLimits.email_limit,
              storage_limit_bytes: snapshotData.storage_limit_bytes || resolvedLimits.storage_limit_bytes,
            });
            return;
          }

          const summary = await storageService.getUsageSummary();
          callback({
            ownerId: user.uid,
            period_key: getCurrentPeriodKey(),
            sms_used: 0,
            email_used: 0,
            storage_used_bytes: summary.used_bytes,
            sms_limit: resolvedLimits.sms_limit,
            email_limit: resolvedLimits.email_limit,
            storage_limit_bytes: summary.limit_bytes || resolvedLimits.storage_limit_bytes,
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

  recordUsage: async (channel: 'sms' | 'email', amount: number = 1, debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) return;

    try {
      const businessProfileSnap = await savePipelineService.withTimeout(getDoc(doc(db, 'business_profiles', user.uid)), {
        timeoutMessage: 'Timed out while loading the business profile for usage tracking.',
        debugContext,
      });
      const resolvedPlan = planConfigService.resolveBusinessPlan(
        businessProfileSnap.exists() ? businessProfileSnap.data() : null
      );
      const periodKey = getCurrentPeriodKey();
      const docId = getDocId(user.uid, periodKey);

      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', { id: docId, channel, amount, action: 'record_usage' });
      }
      await savePipelineService.withTimeout(
        setDoc(
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
        ),
        {
          timeoutMessage: 'Timed out while preparing the usage counter.',
          debugContext,
        }
      );

      await savePipelineService.withTimeout(
        setDoc(
          doc(db, COLLECTION_NAME, docId),
          {
            [`${channel}_used`]: increment(amount),
            updated_at: serverTimestamp(),
          },
          { merge: true }
        ),
        {
          timeoutMessage: 'Timed out while recording usage.',
          debugContext,
        }
      );
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { id: docId, channel, amount, action: 'record_usage' });
      }
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
    }
  },
};
