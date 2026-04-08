import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Route, RouteActivityLog, RouteActivityType, RouteStop } from '../modules/routes/types';
import { handleFirestoreError, OperationType } from './verificationService';

const COLLECTION_NAME = 'route_activity_logs';

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

export const routeActivityService = {
  subscribeToRouteActivity: (routeId: string, callback: (logs: RouteActivityLog[]) => void) => {
    if (!routeId) return () => {};

    const q = query(
      collection(db, COLLECTION_NAME),
      where('route_id', '==', routeId)
    );

    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...entry.data(),
      })) as RouteActivityLog[];

      logs.sort((left, right) => toMillis(right.occurred_at) - toMillis(left.occurred_at));
      callback(logs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${COLLECTION_NAME}/${routeId}`);
    });
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
    const user = auth.currentUser;
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
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      return null;
    }
  },
};
