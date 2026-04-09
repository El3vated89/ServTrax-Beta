import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot, orderBy, Timestamp, getDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';
import { Route, RouteStop, RouteTemplate } from '../modules/routes/types';
import { localFallbackStore } from './localFallbackStore';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';

const getActorNameSnapshot = () => auth.currentUser?.displayName || auth.currentUser?.email || auth.currentUser?.uid || 'Unknown User';
const LOCAL_ROUTE_NAMESPACE = 'routes';
const LOCAL_ROUTE_STOP_NAMESPACE = 'route_stops';

type LocalRoute = Route & { _local_deleted?: boolean };
type LocalRouteStop = RouteStop & { _local_deleted?: boolean };

const routeCache = new Map<string, Route>();
const routeStopCache = new Map<string, RouteStop>();

const toClientTimestamp = () => new Date().toISOString();
const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return 0;
};

const toJsDate = (value: any) => {
  if (!value) return new Date(0);
  if (typeof value === 'string') return new Date(value);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const shouldUseRecoveredLocalFallback = (collectionName: string, id: string, timeoutMessage: string) =>
  cloudBackedLocalIdService.shouldUseLocalFallback(collectionName, id, timeoutMessage);

const normalizeLocalRoute = (ownerId: string, entry: Partial<LocalRoute>): Route => ({
  id: entry.id,
  ownerId,
  name: entry.name || 'Route',
  template_id: entry.template_id || '',
  template_name: entry.template_name || '',
  template_mode: entry.template_mode,
  template_day: entry.template_day ?? null,
  template_area: entry.template_area || '',
  route_run_index: entry.route_run_index || 1,
  route_run_total: entry.route_run_total || 1,
  route_run_label: entry.route_run_label || '',
  route_capacity: entry.route_capacity || 15,
  route_date: entry.route_date || toClientTimestamp(),
  status: entry.status || 'draft',
  base_camp_label: entry.base_camp_label || 'Base Camp',
  base_camp_address: entry.base_camp_address || '',
  base_camp_lat: entry.base_camp_lat || 0,
  base_camp_lng: entry.base_camp_lng || 0,
  return_to_base: entry.return_to_base ?? true,
  optimization_mode: entry.optimization_mode || 'none',
  manual_override: entry.manual_override ?? false,
  created_by: entry.created_by || ownerId,
  created_by_name: entry.created_by_name || getActorNameSnapshot(),
  assigned_team_id: entry.assigned_team_id || '',
  assigned_team_name_snapshot: entry.assigned_team_name_snapshot || '',
  assigned_user_ids: entry.assigned_user_ids || [],
  assigned_user_names_snapshot: entry.assigned_user_names_snapshot || [],
  started_at: entry.started_at as any,
  started_by_user_id: entry.started_by_user_id || '',
  started_by_name: entry.started_by_name || '',
  completed_at: entry.completed_at as any,
  completed_by_user_id: entry.completed_by_user_id || '',
  completed_by_name: entry.completed_by_name || '',
  created_at: entry.created_at as any,
  updated_at: entry.updated_at as any,
});

const normalizeLocalRouteStop = (ownerId: string, entry: Partial<LocalRouteStop>): RouteStop => ({
  id: entry.id,
  ownerId,
  route_id: entry.route_id || '',
  customer_id: entry.customer_id || '',
  job_id: entry.job_id || '',
  stop_order: entry.stop_order || 0,
  manual_order: entry.manual_order || 0,
  optimized_order: entry.optimized_order || 0,
  status: entry.status || 'pending',
  due_state: entry.due_state || 'due',
  city_snapshot: entry.city_snapshot || '',
  address_snapshot: entry.address_snapshot || '',
  lat_snapshot: entry.lat_snapshot || 0,
  lng_snapshot: entry.lng_snapshot || 0,
  service_type_snapshot: entry.service_type_snapshot || '',
  customer_name_snapshot: entry.customer_name_snapshot || '',
  price_snapshot: entry.price_snapshot || 0,
  last_service_date_snapshot: entry.last_service_date_snapshot as any,
  scheduled_date: entry.scheduled_date || toClientTimestamp(),
  due_date: entry.due_date || toClientTimestamp(),
  delayed_reason: entry.delayed_reason || '',
  completed_at: entry.completed_at as any,
  completed_by_user_id: entry.completed_by_user_id || '',
  completed_by_name: entry.completed_by_name || '',
  assigned_user_id: entry.assigned_user_id || '',
  assigned_user_name_snapshot: entry.assigned_user_name_snapshot || '',
  verification_id: entry.verification_id || '',
  notes_internal: entry.notes_internal || '',
  created_at: entry.created_at as any,
  updated_at: entry.updated_at as any,
});

const mergeRoutes = (primaryRoutes: Route[], localRoutes: LocalRoute[]) => {
  const next = new Map<string, Route>();
  primaryRoutes.forEach((route) => {
    if (!route.id) return;
    next.set(route.id, route);
  });
  localRoutes.forEach((route) => {
    if (!route.id) return;
    if (route._local_deleted) {
      next.delete(route.id);
      return;
    }
    next.set(route.id, normalizeLocalRoute(route.ownerId, route));
  });
  const merged = Array.from(next.values()).sort((left, right) => toMillis(right.route_date) - toMillis(left.route_date));
  routeCache.clear();
  merged.forEach((route) => {
    if (route.id) routeCache.set(route.id, route);
  });
  return merged;
};

const mergeRouteStops = (primaryStops: RouteStop[], localStops: LocalRouteStop[]) => {
  const next = new Map<string, RouteStop>();
  primaryStops.forEach((stop) => {
    if (!stop.id) return;
    next.set(stop.id, stop);
  });
  localStops.forEach((stop) => {
    if (!stop.id) return;
    if (stop._local_deleted) {
      next.delete(stop.id);
      return;
    }
    next.set(stop.id, normalizeLocalRouteStop(stop.ownerId || '', stop));
  });
  const merged = Array.from(next.values()).sort((left, right) => left.stop_order - right.stop_order);
  routeStopCache.clear();
  merged.forEach((stop) => {
    if (stop.id) routeStopCache.set(stop.id, stop);
  });
  return merged;
};

export const routeService = {
  getCurrentActorSnapshot: () => ({
    userId: auth.currentUser?.uid || '',
    name: getActorNameSnapshot()
  }),

  getBusinessProfile: async () => {
    const user = await waitForCurrentUser();
    if (!user) return null;
    try {
      const docRef = doc(db, 'business_profiles', user.uid);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'business_profiles');
      return null;
    }
  },

  getRouteByDate: async (date: Date) => {
    const user = await waitForCurrentUser();
    if (!user) return null;

    // Set start and end of day
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'routes'),
      where('ownerId', '==', user.uid),
      where('route_date', '>=', Timestamp.fromDate(start)),
      where('route_date', '<=', Timestamp.fromDate(end))
    );

    try {
      const querySnapshot = await getDocs(q);
      const primaryRoutes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route));
      const localRoutes = localFallbackStore.readRecords<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid);
      const routes = mergeRoutes(primaryRoutes, localRoutes).filter((route) => {
        const routeDate = toJsDate(route.route_date);
        return routeDate >= start && routeDate <= end;
      });
      return routes[0] || null;
    } catch (error) {
      console.error('Primary route lookup failed, using local fallback only:', error);
      const localRoutes = localFallbackStore.readRecords<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid);
      return mergeRoutes([], localRoutes).find((route) => {
        const routeDate = toJsDate(route.route_date);
        return routeDate >= start && routeDate <= end;
      }) || null;
    }
  },

  getRoutesByDate: async (date: Date) => {
    const user = await waitForCurrentUser();
    if (!user) return [];

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'routes'),
      where('ownerId', '==', user.uid),
      where('route_date', '>=', Timestamp.fromDate(start)),
      where('route_date', '<=', Timestamp.fromDate(end))
    );

    try {
      const querySnapshot = await getDocs(q);
      const primaryRoutes = querySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Route));
      const localRoutes = localFallbackStore.readRecords<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid);
      return mergeRoutes(primaryRoutes, localRoutes).filter((route) => {
        const routeDate = toJsDate(route.route_date);
        return routeDate >= start && routeDate <= end;
      });
    } catch (error) {
      console.error('Primary route list lookup failed, using local fallback only:', error);
      const localRoutes = localFallbackStore.readRecords<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid);
      return mergeRoutes([], localRoutes).filter((route) => {
        const routeDate = toJsDate(route.route_date);
        return routeDate >= start && routeDate <= end;
      });
    }
  },

  subscribeToRoutesByDate: (date: Date, callback: (routes: Route[]) => void) => {
    let unsubscribeRoutes = () => {};
    let unsubscribeLocal = () => {};
    let primaryRoutes: Route[] = [];
    let localRoutes: LocalRoute[] = [];

    const emit = () => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      callback(
        mergeRoutes(primaryRoutes, localRoutes).filter((route) => {
          const routeDate = toJsDate(route.route_date);
          return routeDate >= start && routeDate <= end;
        })
      );
    };

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeRoutes();
      unsubscribeLocal();
      primaryRoutes = [];
      localRoutes = [];

      if (!user) {
        callback([]);
        return;
      }

      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'routes'),
        where('ownerId', '==', user.uid),
        where('route_date', '>=', Timestamp.fromDate(start)),
        where('route_date', '<=', Timestamp.fromDate(end)),
        orderBy('route_date', 'asc')
      );

      unsubscribeRoutes = onSnapshot(q, (snapshot) => {
        primaryRoutes = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Route));
        emit();
      }, (error) => {
        console.error('Primary route-by-date subscription failed, using local fallback only:', error);
        primaryRoutes = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid, (records) => {
        localRoutes = records;
        emit();
      });
    });

    return () => {
      unsubscribeRoutes();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  subscribeToRoutes: (callback: (routes: Route[]) => void) => {
    let unsubscribeRoutes = () => {};
    let unsubscribeLocal = () => {};
    let primaryRoutes: Route[] = [];
    let localRoutes: LocalRoute[] = [];

    const emit = () => callback(mergeRoutes(primaryRoutes, localRoutes));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeRoutes();
      unsubscribeLocal();
      primaryRoutes = [];
      localRoutes = [];

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, 'routes'), 
        where('ownerId', '==', user.uid),
        orderBy('route_date', 'desc')
      );
      
      unsubscribeRoutes = onSnapshot(q, (snapshot) => {
        primaryRoutes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Route[];
        emit();
      }, (error) => {
        console.error('Primary routes subscription failed, using local fallback only:', error);
        primaryRoutes = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid, (records) => {
        localRoutes = records;
        emit();
      });
    });

    return () => {
      unsubscribeRoutes();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  subscribeToRouteStops: (routeId: string, callback: (stops: RouteStop[]) => void) => {
    let unsubscribeStops = () => {};
    let unsubscribeLocal = () => {};
    let primaryStops: RouteStop[] = [];
    let localStops: LocalRouteStop[] = [];

    const emit = () =>
      callback(mergeRouteStops(primaryStops, localStops).filter((stop) => stop.route_id === routeId));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeStops();
      unsubscribeLocal();
      primaryStops = [];
      localStops = [];

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, 'route_stops'),
        where('route_id', '==', routeId),
        orderBy('stop_order', 'asc')
      );

      unsubscribeStops = onSnapshot(q, (snapshot) => {
        primaryStops = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as RouteStop[];
        emit();
      }, (error) => {
        console.error('Primary route stop subscription failed, using local fallback only:', error);
        primaryStops = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, (records) => {
        localStops = records;
        emit();
      });
    });

    return () => {
      unsubscribeStops();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  subscribeToAllRouteStops: (callback: (stops: RouteStop[]) => void) => {
    let unsubscribeStops = () => {};
    let unsubscribeLocal = () => {};
    let primaryStops: RouteStop[] = [];
    let localStops: LocalRouteStop[] = [];

    const emit = () => callback(mergeRouteStops(primaryStops, localStops));

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeStops();
      unsubscribeLocal();
      primaryStops = [];
      localStops = [];

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, 'route_stops'),
        where('ownerId', '==', user.uid)
      );

      unsubscribeStops = onSnapshot(q, (snapshot) => {
        primaryStops = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data()
        })) as RouteStop[];
        emit();
      }, (error) => {
        console.error('Primary route stops subscription failed, using local fallback only:', error);
        primaryStops = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, (records) => {
        localStops = records;
        emit();
      });
    });

    return () => {
      unsubscribeStops();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  getRouteStops: async (routeId: string) => {
    const user = await waitForCurrentUser();
    if (!user) return [];

    const q = query(
      collection(db, 'route_stops'),
      where('route_id', '==', routeId),
      orderBy('stop_order', 'asc')
    );

    try {
      const querySnapshot = await getDocs(q);
      const primaryStops = querySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as RouteStop));
      const localStops = localFallbackStore.readRecords<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid);
      return mergeRouteStops(primaryStops, localStops).filter((stop) => stop.route_id === routeId);
    } catch (error) {
      console.error('Primary route stop lookup failed, using local fallback only:', error);
      const localStops = localFallbackStore.readRecords<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid);
      return mergeRouteStops([], localStops).filter((stop) => stop.route_id === routeId);
    }
  },

  getRouteByTemplateAndDate: async (templateId: string, date: Date, runIndex?: number) => {
    const routes = await routeService.getRoutesByDate(date);
    return routes.find((route) =>
      route.template_id === templateId &&
      (runIndex == null || (route.route_run_index || 1) === runIndex)
    ) || null;
  },

  createRoute: async (routeData: Omit<Route, 'id' | 'ownerId' | 'created_by' | 'created_at' | 'updated_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      return await addDoc(collection(db, 'routes'), {
        ...routeData,
        ownerId: user.uid,
        created_by: user.uid,
        created_by_name: getActorNameSnapshot(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Primary route save failed, saving locally instead:', error);
      const timestamp = toClientTimestamp();
      const localId = localFallbackStore.upsertRecord<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_ROUTE_NAMESPACE),
        ...routeData,
        ownerId: user.uid,
        created_by: user.uid,
        created_by_name: getActorNameSnapshot(),
        created_at: timestamp as any,
        updated_at: timestamp as any,
      });
      return { id: localId };
    }
  },

  updateRoute: async (id: string, data: Partial<Route>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'routes', id);
    try {
      const shouldUseLocalFallback = await shouldUseRecoveredLocalFallback(
        'routes',
        id,
        'Route update timed out while checking the recovered cloud record.'
      );
      if (shouldUseLocalFallback) {
        localFallbackStore.updateRecord<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid, id, {
          ...data,
          updated_at: toClientTimestamp() as any,
          _local_deleted: false,
        });
        return;
      }
      return await updateDoc(docRef, {
        ...data,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Primary route update failed, updating local fallback instead:', error);
      const cachedRoute = routeCache.get(id);
      localFallbackStore.upsertRecord<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid, {
        ...(cachedRoute || {
          id,
          ownerId: user.uid,
          name: data.name || 'Route',
          route_date: data.route_date || toClientTimestamp(),
          status: data.status || 'draft',
          base_camp_label: data.base_camp_label || 'Base Camp',
          base_camp_address: data.base_camp_address || '',
          base_camp_lat: data.base_camp_lat || 0,
          base_camp_lng: data.base_camp_lng || 0,
          return_to_base: data.return_to_base ?? true,
          optimization_mode: data.optimization_mode || 'none',
          manual_override: data.manual_override ?? false,
          created_by: user.uid,
          created_by_name: getActorNameSnapshot(),
          created_at: toClientTimestamp() as any,
        }),
        ...data,
        updated_at: toClientTimestamp() as any,
        _local_deleted: false,
      } as LocalRoute);
    }
  },

  addRouteStop: async (stopData: Omit<RouteStop, 'id' | 'created_at' | 'updated_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    try {
      return await addDoc(collection(db, 'route_stops'), {
        ...stopData,
        ownerId: stopData.ownerId || user?.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Primary route stop save failed, saving locally instead:', error);
      const timestamp = toClientTimestamp();
      const localId = localFallbackStore.upsertRecord<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_ROUTE_STOP_NAMESPACE),
        ...stopData,
        ownerId: stopData.ownerId || user.uid,
        created_at: timestamp as any,
        updated_at: timestamp as any,
      });
      return { id: localId };
    }
  },

  updateRouteStop: async (id: string, data: Partial<RouteStop>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'route_stops', id);
    try {
      const shouldUseLocalFallback = await shouldUseRecoveredLocalFallback(
        'route_stops',
        id,
        'Route stop update timed out while checking the recovered cloud record.'
      );
      if (shouldUseLocalFallback) {
        localFallbackStore.updateRecord<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, id, {
          ...data,
          updated_at: toClientTimestamp() as any,
          _local_deleted: false,
        });
        return;
      }
      return await updateDoc(docRef, {
        ...data,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Primary route stop update failed, updating local fallback instead:', error);
      const cachedStop = routeStopCache.get(id);
      localFallbackStore.upsertRecord<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, {
        ...(cachedStop || {
          id,
          ownerId: user.uid,
          route_id: data.route_id || '',
          stop_order: data.stop_order || 0,
          manual_order: data.manual_order || data.stop_order || 0,
          optimized_order: data.optimized_order || data.stop_order || 0,
          status: data.status || 'pending',
          due_state: data.due_state || 'due',
          city_snapshot: data.city_snapshot || '',
          address_snapshot: data.address_snapshot || '',
          lat_snapshot: data.lat_snapshot || 0,
          lng_snapshot: data.lng_snapshot || 0,
          service_type_snapshot: data.service_type_snapshot || '',
          customer_name_snapshot: data.customer_name_snapshot || '',
          scheduled_date: data.scheduled_date || toClientTimestamp(),
          due_date: data.due_date || toClientTimestamp(),
          created_at: toClientTimestamp() as any,
        }),
        ...data,
        updated_at: toClientTimestamp() as any,
        _local_deleted: false,
      } as LocalRouteStop);
    }
  },

  deleteRouteStop: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'route_stops', id);
    try {
      const shouldUseLocalFallback = await shouldUseRecoveredLocalFallback(
        'route_stops',
        id,
        'Route stop delete timed out while checking the recovered cloud record.'
      );
      if (shouldUseLocalFallback) {
        localFallbackStore.removeRecord<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, id);
        routeStopCache.delete(id);
        return;
      }
      return await deleteDoc(docRef);
    } catch (error) {
      console.error('Primary route stop delete failed, hiding it locally instead:', error);
      const cachedStop = routeStopCache.get(id);
      localFallbackStore.upsertRecord<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, {
        ...(cachedStop || {
          id,
          ownerId: user.uid,
          route_id: '',
          stop_order: 0,
          manual_order: 0,
          optimized_order: 0,
          status: 'pending',
          due_state: 'due',
          city_snapshot: '',
          address_snapshot: '',
          lat_snapshot: 0,
          lng_snapshot: 0,
          service_type_snapshot: '',
          customer_name_snapshot: '',
          scheduled_date: toClientTimestamp(),
          due_date: toClientTimestamp(),
          created_at: toClientTimestamp() as any,
        }),
        updated_at: toClientTimestamp() as any,
        _local_deleted: true,
      } as LocalRouteStop);
    }
  },

  deleteRoute: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');
    const docRef = doc(db, 'routes', id);
    try {
      const shouldUseLocalFallback = await shouldUseRecoveredLocalFallback(
        'routes',
        id,
        'Route delete timed out while checking the recovered cloud record.'
      );
      if (shouldUseLocalFallback) {
        localFallbackStore.removeRecord<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid, id);
        routeCache.delete(id);
        return;
      }
      return await deleteDoc(docRef);
    } catch (error) {
      console.error('Primary route delete failed, hiding it locally instead:', error);
      const cachedRoute = routeCache.get(id);
      localFallbackStore.upsertRecord<LocalRoute>(LOCAL_ROUTE_NAMESPACE, user.uid, {
        ...(cachedRoute || {
          id,
          ownerId: user.uid,
          name: 'Route',
          route_date: toClientTimestamp(),
          status: 'draft',
          base_camp_label: 'Base Camp',
          base_camp_address: '',
          base_camp_lat: 0,
          base_camp_lng: 0,
          return_to_base: true,
          optimization_mode: 'none',
          manual_override: false,
          created_by: user.uid,
          created_by_name: getActorNameSnapshot(),
          created_at: toClientTimestamp() as any,
        }),
        updated_at: toClientTimestamp() as any,
        _local_deleted: true,
      } as LocalRoute);
    }
  },

  deleteRouteWithStops: async (id: string) => {
    const stops = await routeService.getRouteStops(id);
    await Promise.all(stops.filter((stop) => stop.id).map((stop) => routeService.deleteRouteStop(stop.id!)));
    await routeService.deleteRoute(id);
  },

  ensureRouteForDate: async (date: Date, baseCamp: { label: string; address: string; lat: number; lng: number }) => {
    const user = await waitForCurrentUser();
    if (!user) return null;

    const existingRoute = await routeService.getRouteByDate(date);
    if (existingRoute) return existingRoute;

    const newRouteData = {
      name: `Route for ${date.toLocaleDateString()}`,
      route_date: Timestamp.fromDate(date),
      status: 'draft' as const,
      base_camp_label: baseCamp.label,
      base_camp_address: baseCamp.address,
      base_camp_lat: baseCamp.lat,
      base_camp_lng: baseCamp.lng,
      return_to_base: true,
      optimization_mode: 'none' as const,
      manual_override: false
    };

    const newRouteRef = await routeService.createRoute(newRouteData);
    if (!newRouteRef) return null;

    return {
      id: newRouteRef.id,
      ownerId: user.uid,
      created_by: user.uid,
      created_by_name: getActorNameSnapshot(),
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
      ...newRouteData
    } as Route;
  },

  ensureRouteRunForTemplate: async (
    template: RouteTemplate,
    date: Date,
    baseCamp: { label: string; address: string; lat: number; lng: number },
    runIndex: number = 1,
    runTotal: number = 1
  ) => {
    const user = await waitForCurrentUser();
    if (!user) return null;

    if (!template.id) return null;

    const existingRoute = await routeService.getRouteByTemplateAndDate(template.id, date, runIndex);
    if (existingRoute) return existingRoute;

    const routeLabel = runTotal > 1 ? `Run ${runIndex}` : 'Run 1';
    const routeCapacity = template.max_stops_per_run || 15;

    const newRouteData = {
      name: runTotal > 1
        ? `${template.name} - ${routeLabel}`
        : `${template.name} - ${date.toLocaleDateString()}`,
      template_id: template.id,
      template_name: template.name,
      template_mode: template.mode,
      template_day: template.preferred_day ?? null,
      template_area: template.service_area || '',
      route_run_index: runIndex,
      route_run_total: runTotal,
      route_run_label: routeLabel,
      route_capacity: routeCapacity,
      route_date: Timestamp.fromDate(date),
      status: 'draft' as const,
      base_camp_label: baseCamp.label,
      base_camp_address: baseCamp.address,
      base_camp_lat: baseCamp.lat,
      base_camp_lng: baseCamp.lng,
      return_to_base: true,
      optimization_mode: 'none' as const,
      manual_override: false
    };

    const newRouteRef = await routeService.createRoute(newRouteData);
    if (!newRouteRef) return null;

    return {
      id: newRouteRef.id,
      ownerId: user.uid,
      created_by: user.uid,
      created_by_name: getActorNameSnapshot(),
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
      ...newRouteData
    } as Route;
  },

  batchUpdateStopOrders: async (stops: { id: string, stop_order: number, manual_order: number }[]) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      await Promise.all(stops.map(async (stop) => {
        const shouldUseLocalFallback = await shouldUseRecoveredLocalFallback(
          'route_stops',
          stop.id,
          'Route stop order save timed out while checking the recovered cloud record.'
        );
        if (shouldUseLocalFallback) {
          localFallbackStore.updateRecord<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, stop.id, {
            stop_order: stop.stop_order,
            manual_order: stop.manual_order,
            updated_at: toClientTimestamp() as any,
            _local_deleted: false,
          });
          return;
        }

        try {
          await updateDoc(doc(db, 'route_stops', stop.id), {
            stop_order: stop.stop_order,
            manual_order: stop.manual_order,
            updated_at: serverTimestamp()
          });
        } catch (error) {
          const cachedStop = routeStopCache.get(stop.id);
          localFallbackStore.upsertRecord<LocalRouteStop>(LOCAL_ROUTE_STOP_NAMESPACE, user.uid, {
            ...(cachedStop || {
              id: stop.id,
              ownerId: user.uid,
              route_id: '',
              status: 'pending',
              due_state: 'due',
              city_snapshot: '',
              address_snapshot: '',
              lat_snapshot: 0,
              lng_snapshot: 0,
              service_type_snapshot: '',
              customer_name_snapshot: '',
              scheduled_date: toClientTimestamp(),
              due_date: toClientTimestamp(),
              created_at: toClientTimestamp() as any,
            }),
            stop_order: stop.stop_order,
            manual_order: stop.manual_order,
            optimized_order: stop.manual_order,
            updated_at: toClientTimestamp() as any,
            _local_deleted: false,
          } as LocalRouteStop);
        }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'route_stops_batch');
    }
  },

  seedSampleData: async () => {
    const user = await waitForCurrentUser();
    if (!user) return;

    const today = new Date();
    const route = await routeService.getRouteByDate(today);
    let routeId = route?.id;

    if (!routeId) {
      const newRoute = await routeService.createRoute({
        name: `Sample Route - ${today.toLocaleDateString()}`,
        route_date: Timestamp.fromDate(today),
        status: 'draft',
        base_camp_label: 'Main Office',
        base_camp_address: '123 Business Way, San Francisco, CA',
        base_camp_lat: 37.7749,
        base_camp_lng: -122.4194,
        return_to_base: true,
        optimization_mode: 'none',
        manual_override: false
      });
      routeId = newRoute?.id;
    }

    if (!routeId) return;

    const sampleStops = [
      {
        customer_id: 'sample-customer-1',
        job_id: 'sample-job-1',
        customer_name_snapshot: 'Acme Corp',
        address_snapshot: '555 Market St, San Francisco, CA',
        city_snapshot: 'San Francisco',
        service_type_snapshot: 'Weekly Maintenance',
        last_service_date_snapshot: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        lat_snapshot: 37.7897,
        lng_snapshot: -122.4004,
      },
      {
        customer_id: 'sample-customer-2',
        job_id: 'sample-job-2',
        customer_name_snapshot: 'Global Tech',
        address_snapshot: '101 California St, San Francisco, CA',
        city_snapshot: 'San Francisco',
        service_type_snapshot: 'Equipment Repair',
        last_service_date_snapshot: Timestamp.fromDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)),
        lat_snapshot: 37.7937,
        lng_snapshot: -122.3998,
      },
      {
        customer_id: 'sample-customer-3',
        job_id: 'sample-job-3',
        customer_name_snapshot: 'City Hall',
        address_snapshot: '1 Dr Carlton B Goodlett Pl, San Francisco, CA',
        city_snapshot: 'San Francisco',
        service_type_snapshot: 'Inspection',
        last_service_date_snapshot: Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        lat_snapshot: 37.7792,
        lng_snapshot: -122.4192,
      }
    ];

    for (let i = 0; i < sampleStops.length; i++) {
      const stop = sampleStops[i];
      await routeService.addRouteStop({
        route_id: routeId,
        stop_order: i,
        manual_order: i,
        optimized_order: i,
        status: 'pending',
        due_state: 'due',
        ...stop,
        scheduled_date: Timestamp.now(),
        due_date: Timestamp.now(),
      });
    }
  }
};
