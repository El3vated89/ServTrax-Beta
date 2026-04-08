import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, getDoc, Timestamp, getDocs, limit } from 'firebase/firestore';
import { waitForCurrentUser } from './authSessionService';
import { storagePolicyService } from './storagePolicyService';

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

    const newRecord = {
      ...record,
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
      await updateDoc(doc(db, COLLECTION_NAME, id), data);
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
