import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, getDoc, Timestamp, getDocs, limit } from 'firebase/firestore';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { storagePolicyService } from './storagePolicyService';
import { mediaUploadService } from './mediaUploadService';
import { localFallbackStore } from './localFallbackStore';
import { SaveDebugContext, savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface VerificationRecord {
  id?: string;
  jobId?: string;
  customerId?: string;
  ownerId?: string;
  photo_url?: string;
  photo_urls?: string[];
  file_size_bytes?: number;
  notes: string;
  visibility?: string;
  expires_at?: any;
  created_at?: any;
}

const COLLECTION_NAME = 'verification_records';
const INLINE_VERIFICATION_FALLBACK_LIMIT_BYTES = 450 * 1024;
const LOCAL_FALLBACK_NAMESPACE = 'verification_records';

const resolveVerificationFolder = (record: Partial<VerificationRecord>) => {
  if (record.jobId) return `verification_records/jobs/${record.jobId}`;
  if (record.customerId) return `verification_records/customers/${record.customerId}`;
  return 'verification_records/unassigned';
};

const normalizeVerificationPhotos = async (
  userId: string,
  record: Partial<VerificationRecord>,
  debugContext?: SaveDebugContext
) => {
  const nextRecord: Partial<VerificationRecord> = { ...record };
  const folder = resolveVerificationFolder(record);

  if (Array.isArray(record.photo_urls) && record.photo_urls.length > 0) {
    const uploads = await mediaUploadService.uploadImageDataUrls({
      ownerId: userId,
      folder,
      dataUrls: record.photo_urls,
      fileNamePrefix: 'proof',
      allowInlineFallback: true,
      maxInlineFallbackBytes: INLINE_VERIFICATION_FALLBACK_LIMIT_BYTES,
      debugContext,
    });
    nextRecord.photo_urls = uploads.map((entry) => entry.downloadUrl);

    if (!nextRecord.photo_url && nextRecord.photo_urls.length === 1) {
      nextRecord.photo_url = nextRecord.photo_urls[0];
    }
  } else if (record.photo_url) {
    const upload = await mediaUploadService.uploadImageDataUrl({
      ownerId: userId,
      folder,
      dataUrl: record.photo_url,
      fileNamePrefix: 'proof',
      allowInlineFallback: true,
      maxInlineFallbackBytes: INLINE_VERIFICATION_FALLBACK_LIMIT_BYTES,
      debugContext,
    });
    nextRecord.photo_url = upload.downloadUrl;
  }

  return nextRecord;
};

const normalizeLocalVerification = (ownerId: string, record: any): VerificationRecord => ({
  id: record.id,
  ownerId,
  jobId: record.jobId,
  customerId: record.customerId,
  photo_url: record.photo_url,
  photo_urls: record.photo_urls || [],
  file_size_bytes: Number(record.file_size_bytes || 0),
  notes: record.notes || '',
  visibility: record.visibility || 'shareable',
  expires_at: record.expires_at || null,
  created_at: record.created_at || new Date().toISOString(),
});

export const verificationService = {
  subscribeToJobVerifications: (jobId: string, callback: (records: VerificationRecord[]) => void) => {
    let unsubscribeRecords = () => {};
    let unsubscribeLocal = () => {};
    let primaryRecords: VerificationRecord[] = [];
    let localRecords: VerificationRecord[] = [];

    const emit = () => {
      const next = [...localRecords, ...primaryRecords]
        .filter((entry) => entry.jobId === jobId)
        .sort((left, right) => {
          const leftTime = new Date(left.created_at?.toDate?.() || left.created_at || 0).getTime();
          const rightTime = new Date(right.created_at?.toDate?.() || right.created_at || 0).getTime();
          return rightTime - leftTime;
        });
      callback(next);
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRecords();
      unsubscribeLocal();
      primaryRecords = [];
      localRecords = [];

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid),
        where('jobId', '==', jobId)
      );

      unsubscribeRecords = onSnapshot(q, (snapshot) => {
        primaryRecords = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as VerificationRecord[];
        emit();
      }, (error) => {
        console.error('Primary job verification subscription failed, using local fallback only:', error);
        primaryRecords = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<any>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localRecords = records.map((entry) => normalizeLocalVerification(user.uid, entry));
        emit();
      });
    });

    return () => {
      unsubscribeRecords();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addVerification: async (
    record: Omit<VerificationRecord, 'id' | 'ownerId' | 'created_at'>,
    debugContext?: SaveDebugContext
  ) => {
    if (debugContext) {
      savePipelineService.log(debugContext, 'service_called', 'verificationService.addVerification');
    }
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('Must be logged in to add verification');

    const businessProfileSnap = await savePipelineService.withTimeout(
      getDoc(doc(db, 'business_profiles', user.uid)),
      {
        timeoutMessage: 'Verification save timed out while loading the business profile.',
        debugContext,
      }
    );
    const storagePolicy = storagePolicyService.resolvePolicy(
      businessProfileSnap.exists() ? businessProfileSnap.data() : null
    );
    const expiresAt = storagePolicy.retentionDays != null
      ? Timestamp.fromMillis(Date.now() + storagePolicy.retentionDays * 24 * 60 * 60 * 1000)
      : null;

    const normalizedRecord = await normalizeVerificationPhotos(user.uid, record, debugContext);

    const newRecord = {
      ...normalizedRecord,
      ownerId: user.uid,
      visibility: 'shareable', // Default to shareable so the public proof page can read it
      expires_at: expiresAt,
      created_at: serverTimestamp()
    };

    if (debugContext) {
      savePipelineService.log(debugContext, 'payload_built', {
        jobId: newRecord.jobId || null,
        customerId: newRecord.customerId || null,
        hasPhoto: !!newRecord.photo_url || !!newRecord.photo_urls?.length,
      });
    }

    try {
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', COLLECTION_NAME);
      }
      const response = await savePipelineService.withTimeout(addDoc(collection(db, COLLECTION_NAME), newRecord), {
        timeoutMessage: 'Verification save timed out while writing to the database.',
        debugContext,
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', response.id);
      }
      return response;
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
        savePipelineService.log(debugContext, 'fallback_write_attempted', LOCAL_FALLBACK_NAMESPACE);
      }
      console.error('Primary verification save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<VerificationRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...newRecord,
        notes: newRecord.notes || '',
        expires_at: expiresAt ? expiresAt.toDate().toISOString() : null,
        created_at: new Date().toISOString(),
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'fallback_write_succeeded', localId);
      }
      return { id: localId };
    }
  },
  
  updateVerification: async (id: string, data: Partial<VerificationRecord>, debugContext?: SaveDebugContext) => {
    if (debugContext) {
      savePipelineService.log(debugContext, 'service_called', 'verificationService.updateVerification');
      savePipelineService.log(debugContext, 'payload_built', { id });
    }
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('Must be logged in to update verification');
    try {
      const normalizedData = await normalizeVerificationPhotos(user.uid, data, debugContext);
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Verification update timed out while checking the recovered cloud record.'
      );
      if (shouldUseLocalFallback) {
        localFallbackStore.updateRecord<VerificationRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...normalizedData,
          updated_at: new Date().toISOString(),
        } as Partial<VerificationRecord>);
        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', id);
        }
        return;
      }
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', `${COLLECTION_NAME}/${id}`);
      }
      await savePipelineService.withTimeout(updateDoc(doc(db, COLLECTION_NAME, id), normalizedData), {
        timeoutMessage: 'Verification update timed out while writing to the database.',
        debugContext,
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', id);
      }
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
        savePipelineService.log(debugContext, 'fallback_write_attempted', id);
      }
      console.error('Primary verification update failed, updating local fallback instead:', error);
      localFallbackStore.updateRecord<VerificationRecord>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
        ...data,
        updated_at: new Date().toISOString(),
      } as Partial<VerificationRecord>);
      if (debugContext) {
        savePipelineService.log(debugContext, 'fallback_write_succeeded', id);
      }
    }
  },

  subscribeToAllVerifications: (callback: (records: VerificationRecord[]) => void) => {
    let unsubscribeRecords = () => {};
    let unsubscribeLocal = () => {};
    let primaryRecords: VerificationRecord[] = [];
    let localRecords: VerificationRecord[] = [];

    const emit = () => {
      const next = [...localRecords, ...primaryRecords].sort((left, right) => {
        const leftTime = new Date(left.created_at?.toDate?.() || left.created_at || 0).getTime();
        const rightTime = new Date(right.created_at?.toDate?.() || right.created_at || 0).getTime();
        return rightTime - leftTime;
      });
      callback(next);
    };

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeRecords();
      unsubscribeLocal();
      primaryRecords = [];
      localRecords = [];

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribeRecords = onSnapshot(q, (snapshot) => {
        primaryRecords = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as VerificationRecord[];
        emit();
      }, (error) => {
        console.error('Primary verification subscription failed, using local fallback only:', error);
        primaryRecords = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<any>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localRecords = records.map((entry) => normalizeLocalVerification(user.uid, entry));
        emit();
      });
    });

    return () => {
      unsubscribeRecords();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  jobHasProofPhotos: async (jobId: string) => {
    const user = await waitForCurrentUser();
    if (!user) return false;

    const snapshot = await getDocs(
      query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid),
        where('jobId', '==', jobId),
        limit(5)
      )
    );

    const snapshotHasPhotos = snapshot.docs.some((entry) => {
      const data = entry.data() as VerificationRecord;
      return !!data.photo_url || !!data.photo_urls?.length;
    });

    if (snapshotHasPhotos) return true;

    const localRecords = localFallbackStore
      .readRecords<any>(LOCAL_FALLBACK_NAMESPACE, user.uid)
      .map((entry) => normalizeLocalVerification(user.uid, entry));

    return localRecords.some((entry) =>
      entry.jobId === jobId && (!!entry.photo_url || !!entry.photo_urls?.length)
    );
  }
};
