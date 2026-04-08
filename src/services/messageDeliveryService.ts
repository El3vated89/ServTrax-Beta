import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { PlatformMessagingConfig } from './platformMessagingService';
import { handleFirestoreError, OperationType } from './verificationService';

export type MessageChannel = 'sms' | 'email';
export type MessageDeliveryStatus = 'blocked' | 'queued' | 'sent' | 'failed';

export interface MessageDeliveryRecord {
  id?: string;
  ownerId: string;
  channel: MessageChannel;
  provider: 'twilio' | 'sendgrid';
  recipient: string;
  recipient_label: string;
  template_id?: string;
  template_name?: string;
  subject?: string;
  body: string;
  status: MessageDeliveryStatus;
  error_message?: string;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION_NAME = 'message_deliveries';

const waitForCurrentUser = async () => {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<typeof auth.currentUser>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const messageDeliveryService = {
  subscribeToDeliveries: (callback: (deliveries: MessageDeliveryRecord[]) => void) => {
    let unsubscribeDeliveries = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeDeliveries();

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeDeliveries = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid)),
        (snapshot) => {
          callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as MessageDeliveryRecord)));
        },
        (error) => handleFirestoreError(error, OperationType.GET, COLLECTION_NAME)
      );
    });

    return () => {
      unsubscribeDeliveries();
      unsubscribeAuth();
    };
  },

  sendMessage: async (
    payload: Omit<MessageDeliveryRecord, 'id' | 'ownerId' | 'status' | 'provider' | 'created_at' | 'updated_at'>,
    providerConfig: PlatformMessagingConfig
  ) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const isSms = payload.channel === 'sms';
    const provider = isSms ? 'twilio' : 'sendgrid';
    const providerEnabled = isSms ? providerConfig.sms_enabled : providerConfig.email_enabled;

    let status: MessageDeliveryStatus = 'blocked';
    let errorMessage = '';

    if (!providerEnabled) {
      errorMessage = isSms
        ? 'SMS is not enabled in the ServTrax Controller yet.'
        : 'Email is not enabled in the ServTrax Controller yet.';
    } else {
      status = 'queued';
      errorMessage = 'Queued for secure backend delivery. Live provider execution requires a protected server endpoint.';
    }

    try {
      const ref = await addDoc(collection(db, COLLECTION_NAME), {
        ...payload,
        ownerId: user.uid,
        provider,
        status,
        error_message: errorMessage || null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      return ref;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },
};
