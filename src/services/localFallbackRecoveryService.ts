import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { localFallbackStore } from './localFallbackStore';
import { savePipelineService } from './savePipelineService';

interface RecoveryTarget {
  namespace: string;
  collectionName: string;
}

interface RecoverySummary {
  recoveredCount: number;
  skippedCount: number;
  failedCount: number;
}

const RECOVERY_TARGETS: RecoveryTarget[] = [
  { namespace: 'customers', collectionName: 'customers' },
  { namespace: 'service_plans', collectionName: 'service_plans' },
  { namespace: 'jobs', collectionName: 'jobs' },
  { namespace: 'quotes', collectionName: 'quotes' },
  { namespace: 'expenses', collectionName: 'expenses' },
  { namespace: 'equipment', collectionName: 'equipment' },
  { namespace: 'supplies', collectionName: 'supplies' },
  { namespace: 'team_members', collectionName: 'team_members' },
  { namespace: 'message_templates', collectionName: 'message_templates' },
  { namespace: 'verification_records', collectionName: 'verification_records' },
  { namespace: 'route_templates', collectionName: 'route_templates' },
  { namespace: 'routes', collectionName: 'routes' },
  { namespace: 'route_stops', collectionName: 'route_stops' },
  { namespace: 'route_activity_logs', collectionName: 'route_activity_logs' },
  { namespace: 'billing_records', collectionName: 'billing_records' },
  { namespace: 'payment_entries', collectionName: 'payment_entries' },
];

const stripLocalOnlyFields = (record: Record<string, any>, ownerId: string) => {
  const nextRecord: Record<string, any> = { ...record };
  delete nextRecord._local_deleted;
  nextRecord.ownerId = ownerId;
  return nextRecord;
};

const recoverNamespace = async (
  ownerId: string,
  target: RecoveryTarget
) => {
  const records = localFallbackStore.readRecords<Record<string, any>>(target.namespace, ownerId);
  let recoveredCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const record of records) {
    const recordId = typeof record?.id === 'string' ? record.id : '';
    if (!recordId) {
      skippedCount += 1;
      continue;
    }

    if (record?._local_deleted) {
      localFallbackStore.removeRecord(target.namespace, ownerId, recordId);
      skippedCount += 1;
      continue;
    }

    try {
      const docRef = doc(collection(db, target.collectionName), recordId);
      const existing = await savePipelineService.withTimeout(getDoc(docRef), {
        timeoutMessage: `Recovery timed out while checking ${target.collectionName}/${recordId}.`,
      });

      if (!existing.exists()) {
        await savePipelineService.withTimeout(setDoc(docRef, stripLocalOnlyFields(record, ownerId)), {
          timeoutMessage: `Recovery timed out while writing ${target.collectionName}/${recordId}.`,
        });
      }

      cloudBackedLocalIdService.markCloudBacked(target.collectionName, recordId);
      localFallbackStore.removeRecord(target.namespace, ownerId, recordId);
      recoveredCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(`Failed to recover local fallback record for ${target.collectionName}/${recordId}:`, error);
    }
  }

  return { recoveredCount, skippedCount, failedCount };
};

export const localFallbackRecoveryService = {
  recoverCurrentUserData: async (): Promise<RecoverySummary> => {
    const debugContext = {
      flow: 'local-fallback-recovery',
      traceId: savePipelineService.createTraceId('local-fallback-recovery'),
    };

    savePipelineService.log(debugContext, 'save_started');
    const user = await waitForCurrentUser({ debugContext });
    if (!user) {
      savePipelineService.log(debugContext, 'response_received', 'no-user');
      return { recoveredCount: 0, skippedCount: 0, failedCount: 0 };
    }

    let recoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const target of RECOVERY_TARGETS) {
      const result = await recoverNamespace(user.uid, target);
      recoveredCount += result.recoveredCount;
      skippedCount += result.skippedCount;
      failedCount += result.failedCount;
    }

    savePipelineService.log(debugContext, 'response_received', {
      recoveredCount,
      skippedCount,
      failedCount,
    });

    return {
      recoveredCount,
      skippedCount,
      failedCount,
    };
  },
};
