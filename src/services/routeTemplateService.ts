import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { RouteTemplate } from '../modules/routes/types';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';

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
      console.error('Primary route template save failed, saving locally instead:', error);
      const createdAt = toClientTimestamp();
      const localId = localFallbackStore.upsertRecord<LocalRouteTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...normalizeTemplate(template),
        ownerId: user.uid,
        created_at: createdAt as any,
        updated_at: createdAt as any,
      });
      return { id: localId };
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
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.updateRecord<LocalRouteTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...nextData,
          updated_at: toClientTimestamp() as any,
          _local_deleted: false,
        });
        return;
      }
      return await updateDoc(docRef, nextData);
    } catch (error) {
      console.error('Primary route template update failed, updating local fallback instead:', error);
      const cachedTemplate = templateCache.get(id);
      localFallbackStore.upsertRecord<LocalRouteTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedTemplate || {
          id,
          ownerId: user.uid,
          name: updates.name || 'Route Template',
          mode: (updates.mode as any) || 'custom',
          cadence: (updates.cadence as any) || 'manual',
          include_overdue: updates.include_overdue ?? true,
          include_skipped: updates.include_skipped ?? true,
          include_delayed: updates.include_delayed ?? true,
        }),
        ...updates,
        preferred_day: updates.preferred_day ?? cachedTemplate?.preferred_day ?? null,
        service_area: updates.service_area?.trim() || cachedTemplate?.service_area || '',
        max_stops_per_run: Math.min(ABSOLUTE_MAX_STOPS_PER_RUN, Math.max(1, updates.max_stops_per_run || cachedTemplate?.max_stops_per_run || DEFAULT_MAX_STOPS_PER_RUN)),
        updated_at: toClientTimestamp() as any,
        _local_deleted: false,
      } as LocalRouteTemplate);
    }
  },

  deleteTemplate: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.removeRecord<LocalRouteTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, id);
        templateCache.delete(id);
        return;
      }
      return await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
      console.error('Primary route template delete failed, hiding it locally instead:', error);
      const cachedTemplate = templateCache.get(id);
      localFallbackStore.upsertRecord<LocalRouteTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedTemplate || {
          id,
          ownerId: user.uid,
          name: 'Route Template',
          mode: 'custom',
          cadence: 'manual',
          include_overdue: true,
          include_skipped: true,
          include_delayed: true,
        }),
        updated_at: toClientTimestamp() as any,
        _local_deleted: true,
      } as LocalRouteTemplate);
    }
  },
};
