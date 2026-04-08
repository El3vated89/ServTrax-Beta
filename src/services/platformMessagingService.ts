import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { waitForCurrentUser } from './authSessionService';

export interface PlatformMessagingConfig {
  admin_email_lock: string;
  sms_provider: 'twilio';
  email_provider: 'sendgrid';
  sms_enabled: boolean;
  email_enabled: boolean;
  in_app_notifications_enabled: boolean;
  twilio_account_sid: string;
  twilio_messaging_service_sid: string;
  twilio_from_number: string;
  sendgrid_from_email: string;
  sendgrid_from_name: string;
  secret_storage_status: string;
  created_at?: any;
  updated_at?: any;
}

const DOC_ID = 'messaging_providers';
const ADMIN_EMAIL = 'thomaslmiller89@gmail.com';

const defaultConfig: PlatformMessagingConfig = {
  admin_email_lock: ADMIN_EMAIL,
  sms_provider: 'twilio',
  email_provider: 'sendgrid',
  sms_enabled: false,
  email_enabled: false,
  in_app_notifications_enabled: true,
  twilio_account_sid: '',
  twilio_messaging_service_sid: '',
  twilio_from_number: '',
  sendgrid_from_email: '',
  sendgrid_from_name: 'ServTrax',
  secret_storage_status: 'API secrets must stay in secure backend/server config, not Firestore.',
};

export const platformMessagingService = {
  getDefaultConfig: () => defaultConfig,

  subscribeToConfig: (callback: (config: PlatformMessagingConfig) => void) => {
    let unsubscribeConfig = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeConfig();

      if (!user || user.email !== ADMIN_EMAIL) {
        callback(defaultConfig);
        return;
      }

      unsubscribeConfig = onSnapshot(doc(db, 'platform_settings', DOC_ID), (snapshot) => {
        callback(snapshot.exists()
          ? ({ ...defaultConfig, ...snapshot.data() } as PlatformMessagingConfig)
          : defaultConfig);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `platform_settings/${DOC_ID}`);
      });
    });

    return () => {
      unsubscribeConfig();
      unsubscribeAuth();
    };
  },

  ensureConfig: async () => {
    const user = await waitForCurrentUser();
    if (!user || user.email !== ADMIN_EMAIL) return;

    const docRef = doc(db, 'platform_settings', DOC_ID);
    const existing = await getDoc(docRef);

    if (!existing.exists()) {
      await setDoc(docRef, {
        ...defaultConfig,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      return;
    }

    await updateDoc(docRef, {
      admin_email_lock: ADMIN_EMAIL,
      updated_at: serverTimestamp(),
    });
  },

  saveConfig: async (updates: Partial<PlatformMessagingConfig>) => {
    const user = await waitForCurrentUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      throw new Error('Only the platform admin can update messaging providers.');
    }

    try {
      await setDoc(doc(db, 'platform_settings', DOC_ID), {
        ...defaultConfig,
        ...updates,
        admin_email_lock: ADMIN_EMAIL,
        updated_at: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `platform_settings/${DOC_ID}`);
    }
  },
};
