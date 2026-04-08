import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot, orderBy, Timestamp, getDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { Route, RouteStop, RouteTemplate } from '../modules/routes/types';

const getActorNameSnapshot = () => auth.currentUser?.displayName || auth.currentUser?.email || auth.currentUser?.uid || 'Unknown User';

export const routeService = {
  getCurrentActorSnapshot: () => ({
    userId: auth.currentUser?.uid || '',
    name: getActorNameSnapshot()
  }),

  getBusinessProfile: async () => {
    const user = auth.currentUser;
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
    const user = auth.currentUser;
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
      if (!querySnapshot.empty) {
        // Sort in memory to avoid needing a composite index
        const routes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route));
        routes.sort((a, b) => {
          const timeA = a.created_at?.toMillis?.() || 0;
          const timeB = b.created_at?.toMillis?.() || 0;
          return timeB - timeA; // Descending order
        });
        return routes[0];
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'routes_by_date');
      return null;
    }
  },

  getRoutesByDate: async (date: Date) => {
    const user = auth.currentUser;
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
      return querySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Route));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'routes_by_date');
      return [];
    }
  },

  subscribeToRoutesByDate: (date: Date, callback: (routes: Route[]) => void) => {
    let unsubscribeRoutes = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRoutes();

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
        callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Route)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'routes_by_date');
      });
    });

    return () => {
      unsubscribeRoutes();
      unsubscribeAuth();
    };
  },

  subscribeToRoutes: (callback: (routes: Route[]) => void) => {
    let unsubscribeRoutes = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRoutes();

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
        const routes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Route[];
        callback(routes);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'routes');
      });
    });

    return () => {
      unsubscribeRoutes();
      unsubscribeAuth();
    };
  },

  subscribeToRouteStops: (routeId: string, callback: (stops: RouteStop[]) => void) => {
    const q = query(
      collection(db, 'route_stops'), 
      where('route_id', '==', routeId),
      orderBy('stop_order', 'asc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const stops = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RouteStop[];
      callback(stops);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `route_stops/${routeId}`);
    });
  },

  subscribeToAllRouteStops: (callback: (stops: RouteStop[]) => void) => {
    let unsubscribeStops = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeStops();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, 'route_stops'),
        where('ownerId', '==', user.uid)
      );

      unsubscribeStops = onSnapshot(q, (snapshot) => {
        const stops = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data()
        })) as RouteStop[];
        callback(stops);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'route_stops');
      });
    });

    return () => {
      unsubscribeStops();
      unsubscribeAuth();
    };
  },

  getRouteStops: async (routeId: string) => {
    const q = query(
      collection(db, 'route_stops'),
      where('route_id', '==', routeId),
      orderBy('stop_order', 'asc')
    );

    try {
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as RouteStop));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `route_stops/${routeId}`);
      return [];
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
    const user = auth.currentUser;
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
      handleFirestoreError(error, OperationType.WRITE, 'routes');
    }
  },

  updateRoute: async (id: string, data: Partial<Route>) => {
    const docRef = doc(db, 'routes', id);
    try {
      return await updateDoc(docRef, {
        ...data,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${id}`);
    }
  },

  addRouteStop: async (stopData: Omit<RouteStop, 'id' | 'created_at' | 'updated_at'>) => {
    const user = auth.currentUser;
    try {
      return await addDoc(collection(db, 'route_stops'), {
        ...stopData,
        ownerId: stopData.ownerId || user?.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'route_stops');
    }
  },

  updateRouteStop: async (id: string, data: Partial<RouteStop>) => {
    const docRef = doc(db, 'route_stops', id);
    try {
      return await updateDoc(docRef, {
        ...data,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `route_stops/${id}`);
    }
  },

  deleteRouteStop: async (id: string) => {
    const docRef = doc(db, 'route_stops', id);
    try {
      return await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `route_stops/${id}`);
    }
  },

  deleteRoute: async (id: string) => {
    const docRef = doc(db, 'routes', id);
    try {
      return await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `routes/${id}`);
    }
  },

  deleteRouteWithStops: async (id: string) => {
    const stops = await routeService.getRouteStops(id);
    await Promise.all(stops.filter((stop) => stop.id).map((stop) => routeService.deleteRouteStop(stop.id!)));
    await routeService.deleteRoute(id);
  },

  ensureRouteForDate: async (date: Date, baseCamp: { label: string; address: string; lat: number; lng: number }) => {
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
      ownerId: auth.currentUser?.uid || '',
      created_by: auth.currentUser?.uid || '',
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
      ownerId: auth.currentUser?.uid || '',
      created_by: auth.currentUser?.uid || '',
      created_by_name: getActorNameSnapshot(),
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
      ...newRouteData
    } as Route;
  },

  batchUpdateStopOrders: async (stops: { id: string, stop_order: number, manual_order: number }[]) => {
    // In a real app we might use a writeBatch, but for MVP we can do individual updates or a simple loop
    // Firestore writeBatch is better for atomicity
    try {
      const promises = stops.map(stop => 
        updateDoc(doc(db, 'route_stops', stop.id), {
          stop_order: stop.stop_order,
          manual_order: stop.manual_order,
          updated_at: serverTimestamp()
        })
      );
      await Promise.all(promises);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'route_stops_batch');
    }
  },

  seedSampleData: async () => {
    const user = auth.currentUser;
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
