import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { SaveDebugContext, savePipelineService } from './savePipelineService';
import { isPlatformAdminIdentity, PLATFORM_ADMIN_EMAIL } from './platformAdminIdentity';

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
const defaultConfig: PlatformMessagingConfig = {
  admin_email_lock: PLATFORM_ADMIN_EMAIL,
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

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeConfig();

      if (!user || !isPlatformAdminIdentity(user)) {
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

  ensureConfig: async (debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user || !isPlatformAdminIdentity(user)) return;

    const docRef = doc(db, 'platform_settings', DOC_ID);
    const existing = await savePipelineService.withTimeout(getDoc(docRef), {
      timeoutMessage: 'Timed out while loading the messaging provider config.',
      debugContext,
    });

    if (!existing.exists()) {
      await savePipelineService.withTimeout(setDoc(docRef, {
        ...defaultConfig,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }), {
        timeoutMessage: 'Timed out while creating the messaging provider config.',
        debugContext,
      });
      return;
    }

    await savePipelineService.withTimeout(updateDoc(docRef, {
      admin_email_lock: PLATFORM_ADMIN_EMAIL,
      updated_at: serverTimestamp(),
    }), {
      timeoutMessage: 'Timed out while refreshing the messaging provider config.',
      debugContext,
    });
  },

  saveConfig: async (updates: Partial<PlatformMessagingConfig>, debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user || !isPlatformAdminIdentity(user)) {
      throw new Error('Only the platform admin can update messaging providers.');
    }

    try {
      if (debugContext) {
        savePipelineService.log(debugContext, 'payload_built', { keys: Object.keys(updates) });
        savePipelineService.log(debugContext, 'db_write_attempted', { collection: 'platform_settings', action: 'save_provider_config' });
      }
      await savePipelineService.withTimeout(setDoc(doc(db, 'platform_settings', DOC_ID), {
        ...defaultConfig,
        ...updates,
        admin_email_lock: PLATFORM_ADMIN_EMAIL,
        updated_at: serverTimestamp(),
      }, { merge: true }), {
        timeoutMessage: 'Timed out while saving the messaging provider config.',
        debugContext,
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { collection: 'platform_settings', action: 'save_provider_config' });
      }
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
      handleFirestoreError(error, OperationType.UPDATE, `platform_settings/${DOC_ID}`);
    }
  },
};
