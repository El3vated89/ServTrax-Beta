import {
  addDoc,
  arrayUnion,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
  getDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';
import { mediaUploadService } from './mediaUploadService';
import { localFallbackStore } from './localFallbackStore';
import { SaveDebugContext, savePipelineService } from './savePipelineService';
import { cloudTruthService } from './cloudTruthService';

export type BugReportCategory =
  | 'ui_layout'
  | 'save_error'
  | 'portal'
  | 'billing'
  | 'routes'
  | 'settings'
  | 'messaging'
  | 'other';

export type BugReportStatus = 'open' | 'reviewed' | 'resolved';

export interface BugReport {
  id?: string;
  ownerId: string;
  reporter_uid: string;
  reporter_email: string;
  reporter_name: string;
  category: BugReportCategory;
  details: string;
  status: BugReportStatus;
  page_path: string;
  current_url: string;
  screenshot_data_url?: string;
  screenshot_content_type?: string;
  browser_info?: string;
  created_at?: any;
  updated_at?: any;
  source?: 'primary' | 'fallback_user_doc' | 'local_storage';
}

export interface CreateBugReportInput {
  reporter_name?: string;
  category: BugReportCategory;
  details: string;
  page_path: string;
  current_url: string;
  screenshot_data_url?: string;
  screenshot_content_type?: string;
}

const COLLECTION_NAME = 'bug_reports';
const FALLBACK_USER_FIELD = 'bug_report_fallbacks';
const LOCAL_FALLBACK_NAMESPACE = 'bug_reports';

const MAX_SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_QUALITY = 0.72;
const INLINE_BUG_REPORT_FALLBACK_LIMIT_BYTES = 300 * 1024;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = String(reader.result || '');
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const createClientTimestamp = () => new Date().toISOString();
const createFallbackId = () => `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeReportDate = (value: any) => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value?.toDate) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return 0;
};

const sortReports = (reports: BugReport[]) =>
  [...reports].sort((left, right) => normalizeReportDate(right.created_at) - normalizeReportDate(left.created_at));

const mapFallbackReport = (ownerId: string, rawReport: any): BugReport => ({
  id: `fallback:${ownerId}:${rawReport.fallback_id || rawReport.created_at || ''}`,
  ownerId,
  reporter_uid: rawReport.reporter_uid || ownerId,
  reporter_email: rawReport.reporter_email || '',
  reporter_name: rawReport.reporter_name || rawReport.reporter_email || 'Unknown User',
  category: rawReport.category || 'other',
  details: rawReport.details || '',
  status: rawReport.status || 'open',
  page_path: rawReport.page_path || '',
  current_url: rawReport.current_url || '',
  screenshot_data_url: rawReport.screenshot_data_url || '',
  screenshot_content_type: rawReport.screenshot_content_type || '',
  browser_info: rawReport.browser_info || '',
  created_at: rawReport.created_at,
  updated_at: rawReport.updated_at,
  source: 'fallback_user_doc',
});

const extractFallbackReports = (ownerId: string, data: any): BugReport[] => {
  const rawReports = Array.isArray(data?.[FALLBACK_USER_FIELD]) ? data[FALLBACK_USER_FIELD] : [];
  return rawReports.map((rawReport: any) => mapFallbackReport(ownerId, rawReport));
};

const mapLocalReport = (ownerId: string, rawReport: any): BugReport => ({
  id: rawReport.id,
  ownerId,
  reporter_uid: rawReport.reporter_uid || ownerId,
  reporter_email: rawReport.reporter_email || '',
  reporter_name: rawReport.reporter_name || rawReport.reporter_email || 'Unknown User',
  category: rawReport.category || 'other',
  details: rawReport.details || '',
  status: rawReport.status || 'open',
  page_path: rawReport.page_path || '',
  current_url: rawReport.current_url || '',
  screenshot_data_url: rawReport.screenshot_data_url || '',
  screenshot_content_type: rawReport.screenshot_content_type || '',
  browser_info: rawReport.browser_info || '',
  created_at: rawReport.created_at,
  updated_at: rawReport.updated_at,
  source: 'local_storage',
});

export const bugReportService = {
  categories: [
    { value: 'ui_layout' as BugReportCategory, label: 'UI / Layout' },
    { value: 'save_error' as BugReportCategory, label: 'Save Error' },
    { value: 'portal' as BugReportCategory, label: 'Portal / Share Links' },
    { value: 'billing' as BugReportCategory, label: 'Billing / Payments' },
    { value: 'routes' as BugReportCategory, label: 'Routes' },
    { value: 'settings' as BugReportCategory, label: 'Settings' },
    { value: 'messaging' as BugReportCategory, label: 'Messaging' },
    { value: 'other' as BugReportCategory, label: 'Other' },
  ],

  prepareScreenshot: async (file: File) => {
    const image = await loadImage(file);
    const scale = image.width > MAX_SCREENSHOT_WIDTH ? MAX_SCREENSHOT_WIDTH / image.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare screenshot');

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', SCREENSHOT_QUALITY);
  },

  createBugReport: async (input: CreateBugReportInput, debugContext?: SaveDebugContext) => {
    if (debugContext) {
      savePipelineService.log(debugContext, 'service_called', 'bugReportService.createBugReport');
    }
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    const buildReportPayload = (screenshotUpload: { downloadUrl: string; contentType: string } | null, screenshotUploadStatus: 'not_provided' | 'saved' | 'skipped_after_upload_failure', screenshotUploadError: string) => ({
      ownerId: user.uid,
      reporter_uid: user.uid,
      reporter_email: user.email || '',
      reporter_name: input.reporter_name || user.displayName || user.email || 'Unknown User',
      category: input.category,
      details: input.details.trim(),
      status: 'open' as BugReportStatus,
      page_path: input.page_path,
      current_url: input.current_url,
      screenshot_data_url: screenshotUpload?.downloadUrl || '',
      screenshot_content_type: screenshotUpload?.contentType || input.screenshot_content_type || '',
      screenshot_upload_status: screenshotUploadStatus,
      screenshot_upload_error: screenshotUploadError,
      browser_info: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    });

    try {
      let screenshotUpload = null;
      let screenshotUploadStatus: 'not_provided' | 'saved' | 'skipped_after_upload_failure' = input.screenshot_data_url
        ? 'saved'
        : 'not_provided';
      let screenshotUploadError = '';

      if (input.screenshot_data_url) {
        try {
          screenshotUpload = await mediaUploadService.uploadImageDataUrl({
            ownerId: user.uid,
            folder: 'bug_reports',
            dataUrl: input.screenshot_data_url,
            contentType: input.screenshot_content_type,
            fileNamePrefix: 'report',
            allowInlineFallback: true,
            maxInlineFallbackBytes: INLINE_BUG_REPORT_FALLBACK_LIMIT_BYTES,
            debugContext,
          });
        } catch (error) {
          screenshotUploadStatus = 'skipped_after_upload_failure';
          screenshotUploadError = error instanceof Error ? error.message : String(error);
          console.error('Bug report screenshot upload failed, saving report without screenshot:', error);
        }
      }

      const reportPayload = buildReportPayload(screenshotUpload, screenshotUploadStatus, screenshotUploadError);
      if (debugContext) {
        savePipelineService.log(debugContext, 'payload_built', {
          category: reportPayload.category,
          hasScreenshot: !!reportPayload.screenshot_data_url,
        });
      }

      try {
        if (debugContext) {
          savePipelineService.log(debugContext, 'db_write_attempted', COLLECTION_NAME);
        }
        const response = await savePipelineService.withTimeout(
          addDoc(collection(db, COLLECTION_NAME), {
            ...reportPayload,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          }),
          {
            timeoutMessage: 'Bug report save timed out while writing to the database.',
            debugContext,
          }
        );
        if (debugContext) {
          savePipelineService.log(debugContext, 'db_write_succeeded', response.id);
        }
        return response;
      } catch (primaryError) {
        if (debugContext) {
          savePipelineService.logError(debugContext, 'db_write_failed', primaryError);
          savePipelineService.log(debugContext, 'fallback_write_attempted', 'users/{uid}.bug_report_fallbacks');
        }
        console.error('Primary bug report save failed, falling back to user profile storage:', primaryError);
        const fallbackId = createFallbackId();
        const timestamp = createClientTimestamp();
        try {
          await savePipelineService.withTimeout(
            updateDoc(doc(db, 'users', user.uid), {
              [FALLBACK_USER_FIELD]: arrayUnion({
                fallback_id: fallbackId,
                ...reportPayload,
                created_at: timestamp,
                updated_at: timestamp,
              }),
              updated_at: serverTimestamp(),
            }),
            {
              timeoutMessage: 'Bug report fallback save timed out while writing to the user document.',
              debugContext,
            }
          );

          if (debugContext) {
            savePipelineService.log(debugContext, 'fallback_write_succeeded', `fallback:${user.uid}:${fallbackId}`);
          }

          return {
            id: `fallback:${user.uid}:${fallbackId}`,
          };
        } catch (fallbackError) {
          if (debugContext) {
            savePipelineService.logError(debugContext, 'fallback_write_failed', fallbackError);
          }
          console.error('User-doc bug report fallback failed:', fallbackError);
          throw cloudTruthService.buildCreateError('Bug report');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  subscribeToOwnBugReports: (callback: (reports: BugReport[]) => void) => {
    let unsubscribeReports = () => {};
    let unsubscribeFallbacks = () => {};
    let primaryReports: BugReport[] = [];
    let fallbackReports: BugReport[] = [];

    const emit = () => callback(sortReports([...fallbackReports, ...primaryReports]));

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeReports();
      unsubscribeFallbacks();
      primaryReports = [];
      fallbackReports = [];

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeReports = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid), orderBy('created_at', 'desc')),
        (snapshot) => {
          primaryReports = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data(), source: 'primary' } as BugReport));
          emit();
        },
        (error) => {
          console.error('Primary own bug report subscription failed, using fallback only:', error);
          primaryReports = [];
          emit();
        }
      );

      unsubscribeFallbacks = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          fallbackReports = snapshot.exists() ? extractFallbackReports(user.uid, snapshot.data()) : [];
          emit();
        },
        (error) => {
          console.error('Fallback own bug report subscription failed:', error);
        }
      );

    });

    return () => {
      unsubscribeReports();
      unsubscribeFallbacks();
      unsubscribeAuth();
    };
  },

  subscribeToAllBugReports: (callback: (reports: BugReport[]) => void) => {
    let primaryReports: BugReport[] = [];
    let fallbackReports: BugReport[] = [];

    const emit = () => callback(sortReports([...fallbackReports, ...primaryReports]));

    const unsubscribePrimary = onSnapshot(
      query(collection(db, COLLECTION_NAME), orderBy('created_at', 'desc')),
      (snapshot) => {
        primaryReports = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data(), source: 'primary' } as BugReport));
        emit();
      },
      (error) => {
        console.error('Primary bug report subscription failed, using fallback only:', error);
        primaryReports = [];
        emit();
      }
    );

    const unsubscribeFallbacks = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        fallbackReports = snapshot.docs.flatMap((entry) => extractFallbackReports(entry.id, entry.data()));
        emit();
      },
      (error) => {
        console.error('Fallback bug report subscription failed:', error);
      }
    );

    return () => {
      unsubscribePrimary();
      unsubscribeFallbacks();
    };
  },

  updateBugReportStatus: async (reportId: string, status: BugReportStatus) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      if (localFallbackStore.isLocalId(reportId, LOCAL_FALLBACK_NAMESPACE)) {
        throw cloudTruthService.buildUnsyncedRecordError('Bug report');
      }

      if (reportId.startsWith('fallback:')) {
        const [, ownerId, fallbackId] = reportId.split(':');
        const userDocRef = doc(db, 'users', ownerId);
        const userDoc = await getDoc(userDocRef);
        const existingFallbacks = Array.isArray(userDoc.data()?.[FALLBACK_USER_FIELD]) ? userDoc.data()?.[FALLBACK_USER_FIELD] : [];
        const nextFallbacks = existingFallbacks.map((entry: any) =>
          entry.fallback_id === fallbackId
            ? { ...entry, status, updated_at: createClientTimestamp() }
            : entry
        );

        await updateDoc(userDocRef, {
          [FALLBACK_USER_FIELD]: nextFallbacks,
          updated_at: serverTimestamp(),
        });
        return;
      }

      await updateDoc(doc(db, COLLECTION_NAME, reportId), {
        status,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${reportId}`);
    }
  },
};
