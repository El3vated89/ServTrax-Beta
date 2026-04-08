import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';

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

const MAX_SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_QUALITY = 0.72;

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

  createBugReport: async (input: CreateBugReportInput) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ownerId: user.uid,
        reporter_uid: user.uid,
        reporter_email: user.email || '',
        reporter_name: input.reporter_name || user.displayName || user.email || 'Unknown User',
        category: input.category,
        details: input.details.trim(),
        status: 'open',
        page_path: input.page_path,
        current_url: input.current_url,
        screenshot_data_url: input.screenshot_data_url || '',
        screenshot_content_type: input.screenshot_content_type || '',
        browser_info: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  subscribeToOwnBugReports: (callback: (reports: BugReport[]) => void) => {
    let unsubscribeReports = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeReports();

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeReports = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid), orderBy('created_at', 'desc')),
        (snapshot) => {
          callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as BugReport)));
        },
        (error) => handleFirestoreError(error, OperationType.GET, COLLECTION_NAME)
      );
    });

    return () => {
      unsubscribeReports();
      unsubscribeAuth();
    };
  },

  subscribeToAllBugReports: (callback: (reports: BugReport[]) => void) => {
    const unsubscribe = onSnapshot(
      query(collection(db, COLLECTION_NAME), orderBy('created_at', 'desc')),
      (snapshot) => {
        callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as BugReport)));
      },
      (error) => handleFirestoreError(error, OperationType.GET, COLLECTION_NAME)
    );

    return () => unsubscribe();
  },

  updateBugReportStatus: async (reportId: string, status: BugReportStatus) => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, reportId), {
        status,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${reportId}`);
    }
  },
};
