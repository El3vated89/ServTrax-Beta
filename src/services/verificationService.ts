import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, getDoc, Timestamp, getDocs, limit } from 'firebase/firestore';
import { waitForCurrentUser } from './authSessionService';
import { storagePolicyService } from './storagePolicyService';
import { mediaUploadService } from './mediaUploadService';

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

const resolveVerificationFolder = (record: Partial<VerificationRecord>) => {
  if (record.jobId) return `verification_records/jobs/${record.jobId}`;
  if (record.customerId) return `verification_records/customers/${record.customerId}`;
  return 'verification_records/unassigned';
};

const normalizeVerificationPhotos = async (userId: string, record: Partial<VerificationRecord>) => {
  const nextRecord: Partial<VerificationRecord> = { ...record };
  const folder = resolveVerificationFolder(record);

  if (Array.isArray(record.photo_urls) && record.photo_urls.length > 0) {
    const uploads = await mediaUploadService.uploadImageDataUrls({
      ownerId: userId,
      folder,
      dataUrls: record.photo_urls,
      fileNamePrefix: 'proof',
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
    });
    nextRecord.photo_url = upload.downloadUrl;
  }

  return nextRecord;
};

export const verificationService = {
  subscribeToJobVerifications: (jobId: string, callback: (records: VerificationRecord[]) => void) => {
    let unsubscribeRecords = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRecords();

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
        const records = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as VerificationRecord[];
        callback(records);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      });
    });

    return () => {
      unsubscribeRecords();
      unsubscribeAuth();
    };
  },

  addVerification: async (record: Omit<VerificationRecord, 'id' | 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to add verification');

    const businessProfileSnap = await getDoc(doc(db, 'business_profiles', user.uid));
    const storagePolicy = storagePolicyService.resolvePolicy(
      businessProfileSnap.exists() ? businessProfileSnap.data() : null
    );
    const expiresAt = storagePolicy.retentionDays != null
      ? Timestamp.fromMillis(Date.now() + storagePolicy.retentionDays * 24 * 60 * 60 * 1000)
      : null;

    const normalizedRecord = await normalizeVerificationPhotos(user.uid, record);

    const newRecord = {
      ...normalizedRecord,
      ownerId: user.uid,
      visibility: 'shareable', // Default to shareable so the public proof page can read it
      expires_at: expiresAt,
      created_at: serverTimestamp()
    };

    try {
      return await addDoc(collection(db, COLLECTION_NAME), newRecord);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },
  
  updateVerification: async (id: string, data: Partial<VerificationRecord>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to update verification');
    try {
      const normalizedData = await normalizeVerificationPhotos(user.uid, data);
      await updateDoc(doc(db, COLLECTION_NAME, id), normalizedData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  subscribeToAllVerifications: (callback: (records: VerificationRecord[]) => void) => {
    let unsubscribeRecords = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRecords();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribeRecords = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as VerificationRecord[];
        callback(records);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      });
    });

    return () => {
      unsubscribeRecords();
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

    return snapshot.docs.some((entry) => {
      const data = entry.data() as VerificationRecord;
      return !!data.photo_url || !!data.photo_urls?.length;
    });
  }
};
