import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Route, RouteActivityLog, RouteActivityType, RouteStop } from '../modules/routes/types';
import { waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';

const COLLECTION_NAME = 'route_activity_logs';
const LOCAL_FALLBACK_NAMESPACE = 'route_activity_logs';

type LocalRouteActivityLog = RouteActivityLog & { _local_deleted?: boolean };

const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  return 0;
};

const actorSnapshot = () => ({
  userId: auth.currentUser?.uid || '',
  name: auth.currentUser?.displayName || auth.currentUser?.email || auth.currentUser?.uid || 'Unknown User',
});

const toClientTimestamp = () => new Date().toISOString();

const normalizeLocalLog = (ownerId: string, entry: LocalRouteActivityLog): RouteActivityLog => ({
  id: entry.id,
  ownerId,
  route_id: entry.route_id,
  route_stop_id: entry.route_stop_id || '',
  template_id: entry.template_id || '',
  route_name_snapshot: entry.route_name_snapshot || '',
  route_run_label_snapshot: entry.route_run_label_snapshot || '',
  assigned_team_name_snapshot: entry.assigned_team_name_snapshot || '',
  stop_customer_name_snapshot: entry.stop_customer_name_snapshot || '',
  event_type: entry.event_type,
  actor_user_id: entry.actor_user_id || ownerId,
  actor_name: entry.actor_name || 'Unknown User',
  summary: entry.summary || '',
  occurred_at: entry.occurred_at || entry.created_at || toClientTimestamp(),
  created_at: entry.created_at as any,
});

const mergeLogs = (primaryLogs: RouteActivityLog[], localLogs: LocalRouteActivityLog[]) => {
  const next = new Map<string, RouteActivityLog>();

  primaryLogs.forEach((log) => {
    if (!log.id) return;
    next.set(log.id, log);
  });

  localLogs.forEach((log) => {
    if (!log.id) return;
    if (log._local_deleted) {
      next.delete(log.id);
      return;
    }
    next.set(log.id, normalizeLocalLog(log.ownerId, log));
  });

  return Array.from(next.values()).sort((left, right) => toMillis(right.occurred_at) - toMillis(left.occurred_at));
};

export const routeActivityService = {
  subscribeToRouteActivity: (routeId: string, callback: (logs: RouteActivityLog[]) => void) => {
    if (!routeId) return () => {};

    let unsubscribeLogs = () => {};
    let unsubscribeLocal = () => {};
    let primaryLogs: RouteActivityLog[] = [];
    let localLogs: LocalRouteActivityLog[] = [];

    const emit = () => callback(mergeLogs(primaryLogs, localLogs));

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeLogs();
      unsubscribeLocal();
      primaryLogs = [];
      localLogs = [];

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('route_id', '==', routeId)
      );

      unsubscribeLogs = onSnapshot(q, (snapshot) => {
        primaryLogs = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as RouteActivityLog[];
        emit();
      }, (error) => {
        console.error('Primary route activity subscription failed, using local fallback only:', error);
        primaryLogs = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalRouteActivityLog>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localLogs = records.filter((entry) => entry.route_id === routeId);
        emit();
      });
    });

    return () => {
      unsubscribeLogs();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addActivity: async ({
    route,
    eventType,
    summary,
    stop,
  }: {
    route: Route;
    eventType: RouteActivityType;
    summary: string;
    stop?: RouteStop | null;
  }) => {
    const user = await waitForCurrentUser();
    if (!user || !route.id) return null;

    const actor = actorSnapshot();

    try {
      return await addDoc(collection(db, COLLECTION_NAME), {
        ownerId: user.uid,
        route_id: route.id,
        route_stop_id: stop?.id || '',
        template_id: route.template_id || '',
        route_name_snapshot: route.template_name || route.name,
        route_run_label_snapshot: route.route_run_label || '',
        assigned_team_name_snapshot: route.assigned_team_name_snapshot || '',
        stop_customer_name_snapshot: stop?.customer_name_snapshot || '',
        event_type: eventType,
        actor_user_id: actor.userId,
        actor_name: actor.name,
        summary,
        occurred_at: serverTimestamp(),
        created_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Primary route activity save failed:', error);
      return null;
    }
  },
};
