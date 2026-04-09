import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { RouteTemplate } from '../modules/routes/types';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

const COLLECTION_NAME = 'route_templates';
const DEFAULT_MAX_STOPS_PER_RUN = 15;
const ABSOLUTE_MAX_STOPS_PER_RUN = 20;
const LOCAL_FALLBACK_NAMESPACE = 'route_templates';

type LocalRouteTemplate = RouteTemplate & { _local_deleted?: boolean };

const templateCache = new Map<string, RouteTemplate>();

const normalizeTemplate = (template: Omit<RouteTemplate, 'ownerId' | 'created_at' | 'updated_at'>) => ({
  ...template,
  preferred_day: template.preferred_day ?? null,
  service_area: template.service_area?.trim() || '',
  max_stops_per_run: Math.min(ABSOLUTE_MAX_STOPS_PER_RUN, Math.max(1, template.max_stops_per_run || DEFAULT_MAX_STOPS_PER_RUN)),
  include_overdue: template.include_overdue ?? true,
  include_skipped: template.include_skipped ?? true,
  include_delayed: template.include_delayed ?? true,
});

const toClientTimestamp = () => new Date().toISOString();

const normalizeLocalTemplate = (ownerId: string, entry: Partial<LocalRouteTemplate>): RouteTemplate => ({
  id: entry.id,
  ownerId,
  name: entry.name || 'Route Template',
  mode: entry.mode || 'custom',
  cadence: entry.cadence || 'manual',
  preferred_day: entry.preferred_day ?? null,
  service_area: entry.service_area || '',
  max_stops_per_run: entry.max_stops_per_run || DEFAULT_MAX_STOPS_PER_RUN,
  include_overdue: entry.include_overdue ?? true,
  include_skipped: entry.include_skipped ?? true,
  include_delayed: entry.include_delayed ?? true,
  created_at: entry.created_at as any,
  updated_at: entry.updated_at as any,
});

const mergeTemplates = (primaryTemplates: RouteTemplate[], localTemplates: LocalRouteTemplate[]) => {
  const next = new Map<string, RouteTemplate>();

  primaryTemplates.forEach((template) => {
    if (!template.id) return;
    next.set(template.id, template);
  });

  localTemplates.forEach((template) => {
    if (!template.id) return;
    if (template._local_deleted) {
      next.delete(template.id);
      return;
    }
    next.set(template.id, normalizeLocalTemplate(template.ownerId, template));
  });

  const merged = Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
  templateCache.clear();
  merged.forEach((template) => {
    if (template.id) templateCache.set(template.id, template);
  });
  return merged;
};

export const routeTemplateService = {
  subscribeToTemplates: (callback: (templates: RouteTemplate[]) => void) => {
    let unsubscribeTemplates = () => {};
    let unsubscribeLocal = () => {};
    let primaryTemplates: RouteTemplate[] = [];
    let localTemplates: LocalRouteTemplate[] = [];

    const emit = () => callback(mergeTemplates(primaryTemplates, localTemplates));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeTemplates();
      unsubscribeLocal();
      primaryTemplates = [];
      localTemplates = [];

      if (!user) {
        templateCache.clear();
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribeTemplates = onSnapshot(q, (snapshot) => {
        primaryTemplates = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as RouteTemplate[];
        emit();
      }, (error) => {
        console.error('Primary route template subscription failed, using local fallback only:', error);
        primaryTemplates = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalRouteTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localTemplates = records;
        emit();
      });
    });

    return () => {
      unsubscribeTemplates();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addTemplate: async (template: Omit<RouteTemplate, 'id' | 'ownerId' | 'created_at' | 'updated_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ...normalizeTemplate(template),
        ownerId: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Primary route template save failed:', error);
      throw cloudTruthService.buildCreateError('Route template');
    }
  },

  updateTemplate: async (id: string, updates: Partial<RouteTemplate>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const nextData = {
        ...updates,
        preferred_day: updates.preferred_day ?? null,
        service_area: updates.service_area?.trim() || '',
        max_stops_per_run: Math.min(ABSOLUTE_MAX_STOPS_PER_RUN, Math.max(1, updates.max_stops_per_run || DEFAULT_MAX_STOPS_PER_RUN)),
        updated_at: serverTimestamp(),
      };
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Route template update timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Route template');
      }
      return await updateDoc(docRef, nextData);
    } catch (error) {
      console.error('Primary route template update failed:', error);
      throw cloudTruthService.buildUpdateError('Route template');
    }
  },

  deleteTemplate: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Route template delete timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Route template');
      }
      return await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
      console.error('Primary route template delete failed:', error);
      throw cloudTruthService.buildDeleteError('Route template');
    }
  },
};
