import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { RouteTemplate } from '../modules/routes/types';
import { handleFirestoreError, OperationType } from './verificationService';

const COLLECTION_NAME = 'route_templates';
const DEFAULT_MAX_STOPS_PER_RUN = 15;
const ABSOLUTE_MAX_STOPS_PER_RUN = 20;

const normalizeTemplate = (template: Omit<RouteTemplate, 'ownerId' | 'created_at' | 'updated_at'>) => ({
  ...template,
  preferred_day: template.preferred_day ?? null,
  service_area: template.service_area?.trim() || '',
  max_stops_per_run: Math.min(ABSOLUTE_MAX_STOPS_PER_RUN, Math.max(1, template.max_stops_per_run || DEFAULT_MAX_STOPS_PER_RUN)),
  include_overdue: template.include_overdue ?? true,
  include_skipped: template.include_skipped ?? true,
  include_delayed: template.include_delayed ?? true,
});

export const routeTemplateService = {
  subscribeToTemplates: (callback: (templates: RouteTemplate[]) => void) => {
    let unsubscribeTemplates = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeTemplates();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribeTemplates = onSnapshot(q, (snapshot) => {
        const templates = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as RouteTemplate[];
        templates.sort((left, right) => left.name.localeCompare(right.name));
        callback(templates);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      });
    });

    return () => {
      unsubscribeTemplates();
      unsubscribeAuth();
    };
  },

  addTemplate: async (template: Omit<RouteTemplate, 'id' | 'ownerId' | 'created_at' | 'updated_at'>) => {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...normalizeTemplate(template),
        ownerId: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  updateTemplate: async (id: string, updates: Partial<RouteTemplate>) => {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const nextData = {
        ...updates,
        preferred_day: updates.preferred_day ?? null,
        service_area: updates.service_area?.trim() || '',
        max_stops_per_run: Math.min(ABSOLUTE_MAX_STOPS_PER_RUN, Math.max(1, updates.max_stops_per_run || DEFAULT_MAX_STOPS_PER_RUN)),
        updated_at: serverTimestamp(),
      };
      return await updateDoc(docRef, nextData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  deleteTemplate: async (id: string) => {
    try {
      return await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },
};
