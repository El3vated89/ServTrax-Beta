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
import { waitForCurrentUser } from './authSessionService';
import { SaveDebugContext, savePipelineService } from './savePipelineService';

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
    providerConfig: PlatformMessagingConfig,
    debugContext?: SaveDebugContext
  ) => {
    const user = await waitForCurrentUser({ debugContext });
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
      if (debugContext) {
        savePipelineService.log(debugContext, 'payload_built', {
          channel: payload.channel,
          recipient: payload.recipient,
          status,
          provider,
        });
        savePipelineService.log(debugContext, 'db_write_attempted', { collection: COLLECTION_NAME, action: 'send_message_log' });
      }
      const ref = await savePipelineService.withTimeout(addDoc(collection(db, COLLECTION_NAME), {
        ...payload,
        ownerId: user.uid,
        provider,
        status,
        error_message: errorMessage || null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }), {
        timeoutMessage: 'Timed out while logging the message delivery.',
        debugContext,
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { id: ref.id, action: 'send_message_log' });
      }

      return ref;
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },
};
