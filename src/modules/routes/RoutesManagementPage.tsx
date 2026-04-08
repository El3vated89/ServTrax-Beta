import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, Map as MapIcon, Plus, Search, Users } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { auth } from '../../firebase';
import { customerService, Customer } from '../../services/customerService';
import { jobService, Job } from '../../services/jobService';
import { routeOptimizationService } from '../../services/RouteOptimizationService';
import { routeService } from '../../services/RouteService';
import { BASE_CAMP } from './constants';
import RouteStopCard from './components/RouteStopCard';
import { BaseCamp, Route, RouteStatus, RouteStop } from './types';

type PlannerMode = 'day' | 'week';
type BuilderFilter = 'all' | 'draft' | 'in_progress';
type PanelMode = 'builder' | 'history';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toDate = (value: Timestamp | string | Date | undefined) => {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const sameDay = (left: Date, right: Date) => startOfDay(left).getTime() === startOfDay(right).getTime();

const startOfWeek = (value: Date) => {
  const next = startOfDay(value);
  const weekday = next.getDay();
  next.setDate(next.getDate() - weekday);
  return next;
};

const formatRouteDate = (value: Timestamp | string) =>
  toDate(value).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const routeStatusClasses: Record<RouteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-50 text-blue-600',
  in_progress: 'bg-amber-50 text-amber-600',
  completed: 'bg-green-50 text-green-600',
  archived: 'bg-slate-100 text-slate-600',
};

export default function RoutesManagementPage() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [plannerMode, setPlannerMode] = useState<PlannerMode>('week');
  const [panelMode, setPanelMode] = useState<PanelMode>('builder');
  const [builderFilter, setBuilderFilter] = useState<BuilderFilter>('all');
  const [selectedRouteStops, setSelectedRouteStops] = useState<RouteStop[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);
  const [baseCamp, setBaseCamp] = useState<BaseCamp>(BASE_CAMP);
  const [builderSearchQuery, setBuilderSearchQuery] = useState('');
  const [addStopSearchQuery, setAddStopSearchQuery] = useState('');
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadBaseCamp = async () => {
      const profile = await routeService.getBusinessProfile();
      if (profile?.base_camp_address) {
        setBaseCamp({
          label: profile.base_camp_label || 'Base Camp',
          address: profile.base_camp_address,
          lat: profile.base_camp_lat || BASE_CAMP.lat,
          lng: profile.base_camp_lng || BASE_CAMP.lng,
        });
      }
    };

    loadBaseCamp();

    const unsubscribeRoutes = routeService.subscribeToRoutes(setRoutes);
    return () => unsubscribeRoutes();
  }, []);

  useEffect(() => {
    let unsubscribeJobs: () => void = () => {};
    let unsubscribeCustomers: () => void = () => {};

    const authUnsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribeJobs();
      unsubscribeCustomers();

      if (!user) {
        setAvailableJobs([]);
        setAvailableCustomers([]);
        return;
      }

      unsubscribeJobs = jobService.subscribeToJobs(setAvailableJobs);
      unsubscribeCustomers = customerService.subscribeToCustomers(setAvailableCustomers);
    });

    return () => {
      authUnsubscribe();
      unsubscribeJobs();
      unsubscribeCustomers();
    };
  }, []);

  useEffect(() => {
    if (!selectedRouteId) {
      setSelectedRouteStops([]);
      return;
    }

    const unsubscribeStops = routeService.subscribeToRouteStops(selectedRouteId, setSelectedRouteStops);
    return () => unsubscribeStops();
  }, [selectedRouteId]);

  const selectedWeekDays = useMemo(() => {
    const weekStart = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + index);
      return day;
    });
  }, [selectedDate]);

  const routesInWindow = useMemo(() => {
    return routes.filter((route) => {
      const routeDate = toDate(route.route_date);
      if (plannerMode === 'day') return sameDay(routeDate, selectedDate);

      const weekStart = startOfWeek(selectedDate).getTime();
      const weekEnd = weekStart + (7 * MS_PER_DAY);
      const routeTime = startOfDay(routeDate).getTime();
      return routeTime >= weekStart && routeTime < weekEnd;
    });
  }, [plannerMode, routes, selectedDate]);

  const planningRoutes = useMemo(
    () => routesInWindow.filter((route) => !['completed', 'archived'].includes(route.status)),
    [routesInWindow]
  );

  const historyRoutes = useMemo(
    () => routesInWindow.filter((route) => ['completed', 'archived'].includes(route.status)),
    [routesInWindow]
  );

  const filteredPlanningRoutes = useMemo(() => {
    if (builderFilter === 'all') return planningRoutes;
    return planningRoutes.filter((route) => route.status === builderFilter);
  }, [builderFilter, planningRoutes]);

  const visibleRoutes = panelMode === 'history' ? historyRoutes : filteredPlanningRoutes;
  const selectedRoute = visibleRoutes.find((route) => route.id === selectedRouteId) || null;

  useEffect(() => {
    if (visibleRoutes.length === 0) {
      setSelectedRouteId(null);
      return;
    }

    const hasCurrentSelection = selectedRouteId && visibleRoutes.some((route) => route.id === selectedRouteId);
    if (!hasCurrentSelection) {
      const preferredRoute = visibleRoutes.find((route) => sameDay(toDate(route.route_date), selectedDate)) || visibleRoutes[0];
      setSelectedRouteId(preferredRoute.id || null);
    }
  }, [selectedDate, selectedRouteId, visibleRoutes]);

  const selectedDayRoute = planningRoutes.find((route) => sameDay(toDate(route.route_date), selectedDate)) || null;

  const visibleStops = useMemo(() => {
    const query = builderSearchQuery.trim().toLowerCase();
    if (!query) return selectedRouteStops;

    return selectedRouteStops.filter((stop) =>
      stop.customer_name_snapshot.toLowerCase().includes(query) ||
      stop.address_snapshot.toLowerCase().includes(query) ||
      stop.city_snapshot.toLowerCase().includes(query) ||
      stop.service_type_snapshot.toLowerCase().includes(query)
    );
  }, [builderSearchQuery, selectedRouteStops]);

  const routeStats = {
    planning: planningRoutes.length,
    drafts: planningRoutes.filter((route) => route.status === 'draft').length,
    inProgress: planningRoutes.filter((route) => route.status === 'in_progress').length,
    history: historyRoutes.length,
  };
  const canReorderVisibleStops = panelMode === 'builder' && builderSearchQuery.trim() === '';

  const handleCreateRouteForDay = async () => {
    setErrorMessage(null);

    try {
      const route = await routeService.ensureRouteForDate(selectedDate, baseCamp);
      if (route?.id) {
        setPanelMode('builder');
        setBuilderFilter('all');
        setSelectedRouteId(route.id);
      }
    } catch (error) {
      console.error('Error creating route for day:', error);
      setErrorMessage('Failed to create route for the selected day.');
    }
  };

  const handleShiftWindow = (direction: 'back' | 'forward') => {
    const increment = plannerMode === 'week' ? 7 : 1;
    const delta = direction === 'back' ? -increment : increment;
    setSelectedDate((current) => new Date(current.getTime() + (delta * MS_PER_DAY)));
  };

  const handleOpenDailyRoute = (route: Route) => {
    navigate('/map', {
      state: {
        selectedRouteDate: toDate(route.route_date).toISOString(),
      },
    });
  };

  const handleAddJobToRoute = async (job: Job) => {
    if (!selectedRoute?.id) return;
    setErrorMessage(null);

    try {
      const lat = baseCamp.lat + ((Math.random() - 0.5) * 0.1);
      const lng = baseCamp.lng + ((Math.random() - 0.5) * 0.1);

      await routeService.addRouteStop({
        route_id: selectedRoute.id,
        job_id: job.id,
        customer_id: job.customerId,
        stop_order: selectedRouteStops.length,
        manual_order: selectedRouteStops.length,
        optimized_order: selectedRouteStops.length,
        status: 'pending',
        due_state: 'due',
        city_snapshot: (job.address_snapshot || '').split(',')[1]?.trim() || '',
        address_snapshot: job.address_snapshot || '',
        lat_snapshot: lat,
        lng_snapshot: lng,
        service_type_snapshot: job.service_snapshot || 'General Service',
        customer_name_snapshot: job.customer_name_snapshot || 'Unknown Customer',
        price_snapshot: job.price_snapshot || 0,
        last_service_date_snapshot: job.completed_date || '',
        scheduled_date: job.scheduled_date || Timestamp.now(),
        due_date: job.scheduled_date || Timestamp.now(),
      });

      setAddStopSearchQuery('');
      setIsAddingStop(false);
    } catch (error) {
      console.error('Error adding job to route:', error);
      setErrorMessage('Failed to add this job to the route.');
    }
  };

  const handleAddCustomerToRoute = async (customer: Customer) => {
    if (!selectedRoute?.id) return;
    setErrorMessage(null);

    try {
      const jobRef = await jobService.addJob({
        customerId: customer.id!,
        customer_name_snapshot: customer.name,
        address_snapshot: [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
        phone_snapshot: customer.phone || '',
        service_snapshot: 'General Service',
        price_snapshot: 0,
        status: 'pending',
        payment_status: 'unpaid',
        visibility_mode: 'internal_only',
        is_billable: true,
        is_recurring: false,
        internal_notes: '',
        customer_notes: '',
        scheduled_date: Timestamp.now(),
      });

      if (!jobRef) throw new Error('Job creation failed while adding customer to route.');

      const lat = baseCamp.lat + ((Math.random() - 0.5) * 0.1);
      const lng = baseCamp.lng + ((Math.random() - 0.5) * 0.1);

      await routeService.addRouteStop({
        route_id: selectedRoute.id,
        customer_id: customer.id,
        job_id: jobRef.id,
        stop_order: selectedRouteStops.length,
        manual_order: selectedRouteStops.length,
        optimized_order: selectedRouteStops.length,
        status: 'pending',
        due_state: 'due',
        city_snapshot: customer.city || '',
        address_snapshot: [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
        lat_snapshot: lat,
        lng_snapshot: lng,
        service_type_snapshot: 'General Service',
        customer_name_snapshot: customer.name || 'Unknown Customer',
        price_snapshot: 0,
        scheduled_date: Timestamp.now(),
        due_date: Timestamp.now(),
      });

      setAddStopSearchQuery('');
      setIsAddingStop(false);
    } catch (error) {
      console.error('Error adding customer to route:', error);
      setErrorMessage('Failed to add this client to the route.');
    }
  };

  const handleOptimizeRoute = async () => {
    if (!selectedRoute?.id || selectedRouteStops.length === 0) return;
    setIsOptimizing(true);
    setErrorMessage(null);

    try {
      const optimizedStops = routeOptimizationService.optimizeRoute(
        selectedRouteStops,
        baseCamp,
        selectedRoute.return_to_base
      );

      const updates = optimizedStops.map((stop, index) => ({
        id: stop.id!,
        stop_order: index,
        manual_order: index,
      }));

      await routeService.batchUpdateStopOrders(updates);
      await routeService.updateRoute(selectedRoute.id, {
        optimization_mode: 'optimized',
        manual_override: false,
      });
    } catch (error) {
      console.error('Error optimizing route:', error);
      setErrorMessage('Failed to optimize the selected route.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleArrowReorder = async (index: number, direction: 'up' | 'down') => {
    if (!selectedRoute?.id) return;

    const reordered = [...selectedRouteStops];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= reordered.length) return;

    const moved = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = moved;

    setSelectedRouteStops(reordered);

    try {
      await routeService.batchUpdateStopOrders(
        reordered.map((stop, orderIndex) => ({
          id: stop.id!,
          stop_order: orderIndex,
          manual_order: orderIndex,
        }))
      );

      await routeService.updateRoute(selectedRoute.id, {
        manual_override: true,
      });
    } catch (error) {
      console.error('Error reordering route stops:', error);
      setErrorMessage('Failed to reorder route stops.');
    }
  };

  const handleRemoveStop = async (stop: RouteStop) => {
    if (!stop.id) return;

    const confirmed = window.confirm(`Remove ${stop.customer_name_snapshot} from this route?`);
    if (!confirmed) return;

    setErrorMessage(null);

    try {
      await routeService.deleteRouteStop(stop.id);
    } catch (error) {
      console.error('Error removing route stop:', error);
      setErrorMessage('Failed to remove this stop from the route.');
    }
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Route Builder</h2>
              <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                Daily Route Split
              </span>
            </div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">
              Plan saved routes here, then send the selected day to the daily route screen.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
              <button
                onClick={() => setPlannerMode('day')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  plannerMode === 'day' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setPlannerMode('week')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  plannerMode === 'week' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Week
              </button>
            </div>

            <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
              <button
                onClick={() => handleShiftWindow('back')}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
              <div className="px-2 text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {plannerMode === 'week' ? 'Selected Week' : 'Selected Day'}
                </p>
                <p className="text-sm font-black text-gray-900">
                  {plannerMode === 'week'
                    ? `${selectedWeekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${selectedWeekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => handleShiftWindow('forward')}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
          {selectedWeekDays.map((day) => {
            const hasRoute = routes.some((route) => sameDay(toDate(route.route_date), day));
            const isSelected = sameDay(day, selectedDate);

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`rounded-3xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100'
                    : 'bg-white text-gray-900 border-gray-100 hover:border-blue-200 hover:shadow-sm'
                }`}
              >
                <p className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </p>
                <p className="text-lg font-black mt-2">{day.getDate()}</p>
                <p className={`text-[10px] font-black uppercase tracking-widest mt-3 ${isSelected ? 'text-white' : hasRoute ? 'text-green-600' : 'text-gray-300'}`}>
                  {hasRoute ? 'Route Saved' : 'Open Day'}
                </p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <button
            onClick={() => {
              setPanelMode('builder');
              setBuilderFilter('all');
            }}
            className={`rounded-3xl p-5 border text-left transition-all ${
              panelMode === 'builder' && builderFilter === 'all'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100'
                : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
            }`}
          >
            <p className={`text-2xl font-black ${panelMode === 'builder' && builderFilter === 'all' ? 'text-white' : 'text-gray-900'}`}>
              {routeStats.planning}
            </p>
            <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${panelMode === 'builder' && builderFilter === 'all' ? 'text-blue-100' : 'text-gray-400'}`}>
              Planning Routes
            </p>
          </button>

          <button
            onClick={() => {
              setPanelMode('builder');
              setBuilderFilter('draft');
            }}
            className={`rounded-3xl p-5 border text-left transition-all ${
              panelMode === 'builder' && builderFilter === 'draft'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100'
                : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
            }`}
          >
            <p className={`text-2xl font-black ${panelMode === 'builder' && builderFilter === 'draft' ? 'text-white' : 'text-gray-900'}`}>
              {routeStats.drafts}
            </p>
            <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${panelMode === 'builder' && builderFilter === 'draft' ? 'text-blue-100' : 'text-gray-400'}`}>
              Draft
            </p>
          </button>

          <button
            onClick={() => {
              setPanelMode('builder');
              setBuilderFilter('in_progress');
            }}
            className={`rounded-3xl p-5 border text-left transition-all ${
              panelMode === 'builder' && builderFilter === 'in_progress'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100'
                : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
            }`}
          >
            <p className={`text-2xl font-black ${panelMode === 'builder' && builderFilter === 'in_progress' ? 'text-white' : 'text-gray-900'}`}>
              {routeStats.inProgress}
            </p>
            <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${panelMode === 'builder' && builderFilter === 'in_progress' ? 'text-blue-100' : 'text-gray-400'}`}>
              In Progress
            </p>
          </button>

          <button
            onClick={() => setPanelMode('history')}
            className={`rounded-3xl p-5 border text-left transition-all ${
              panelMode === 'history'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100'
                : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
            }`}
          >
            <p className={`text-2xl font-black ${panelMode === 'history' ? 'text-white' : 'text-gray-900'}`}>
              {routeStats.history}
            </p>
            <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${panelMode === 'history' ? 'text-blue-100' : 'text-gray-400'}`}>
              Route History
            </p>
          </button>
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <section className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-gray-900">
                {panelMode === 'history' ? 'Saved History' : 'Saved Routes'}
              </h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                {panelMode === 'history'
                  ? 'Completed and archived routes in the current window'
                  : 'Planning routes for the selected day or week'}
              </p>
            </div>

            {panelMode === 'builder' && !selectedDayRoute && (
              <button
                onClick={handleCreateRouteForDay}
                className="px-4 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-all"
              >
                Create Day Route
              </button>
            )}
          </div>

          <div className="space-y-3">
            {visibleRoutes.length === 0 && (
              <div className="rounded-3xl border-2 border-dashed border-gray-100 p-8 text-center">
                <p className="text-sm font-black text-gray-900">
                  {panelMode === 'history' ? 'No route history in this window yet.' : 'No saved routes in this window yet.'}
                </p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                  {panelMode === 'history' ? 'Complete routes from the daily route screen to build history.' : 'Create the selected day route to begin planning stops.'}
                </p>
              </div>
            )}

            {visibleRoutes.map((route) => {
              const isSelected = route.id === selectedRouteId;

              return (
                <button
                  key={route.id}
                  onClick={() => setSelectedRouteId(route.id || null)}
                  className={`w-full rounded-3xl border p-5 text-left transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100'
                      : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                        {formatRouteDate(route.route_date)}
                      </p>
                      <p className="text-lg font-black mt-2">{route.name}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      isSelected ? 'bg-white/15 text-white' : routeStatusClasses[route.status]
                    }`}>
                      {route.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className={`grid grid-cols-2 gap-3 mt-4 ${isSelected ? 'text-white' : 'text-gray-600'}`}>
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>Base Camp</p>
                      <p className="text-xs font-black mt-1 break-words">{route.base_camp_label}</p>
                    </div>
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>Owner Snapshot</p>
                      <p className="text-xs font-black mt-1 break-words">{route.created_by_name || 'Owner'}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6">
          {selectedRoute ? (
            <>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-black text-gray-900">{selectedRoute.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${routeStatusClasses[selectedRoute.status]}`}>
                      {selectedRoute.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">
                    {panelMode === 'history' ? 'Route history detail' : 'Planner detail and stop builder'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleOpenDailyRoute(selectedRoute)}
                    className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                  >
                    Open Daily Route
                  </button>
                  {panelMode === 'builder' && (
                    <>
                      <button
                        onClick={() => {
                          setAddStopSearchQuery('');
                          setIsAddingStop(true);
                        }}
                        className="px-5 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-all"
                      >
                        Add Stop
                      </button>
                      <button
                        onClick={handleOptimizeRoute}
                        disabled={isOptimizing || selectedRouteStops.length === 0}
                        className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                          isOptimizing || selectedRouteStops.length === 0
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {isOptimizing ? 'Optimizing' : 'Optimize Route'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scheduled</p>
                  <p className="text-lg font-black text-gray-900 mt-2">{formatRouteDate(selectedRoute.route_date)}</p>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Camp</p>
                  <p className="text-lg font-black text-gray-900 mt-2 break-words">{selectedRoute.base_camp_label}</p>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Assigned Team</p>
                  <p className="text-lg font-black text-gray-900 mt-2">{selectedRoute.assigned_team_name_snapshot || 'Coming Soon'}</p>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Assigned Users</p>
                  <p className="text-lg font-black text-gray-900 mt-2">
                    {selectedRoute.assigned_user_names_snapshot?.join(', ') || 'Coming Soon'}
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-gray-100 bg-gray-50 p-5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-black text-gray-900">Future Team Prep</p>
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                  Route assignments are ready for teams later without changing the route structure again.
                </p>
              </div>
              {panelMode === 'history' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <button className="rounded-3xl border border-gray-100 bg-white p-5 text-left">
                    <p className="text-2xl font-black text-gray-900">{selectedRouteStops.length}</p>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Stops Logged</p>
                  </button>
                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Started By</p>
                    <p className="text-lg font-black text-gray-900 mt-2">{selectedRoute.started_by_name || 'Not Recorded'}</p>
                    <p className="text-xs font-bold text-gray-500 mt-1">{selectedRoute.started_at ? formatRouteDate(selectedRoute.started_at) : 'No start timestamp yet'}</p>
                  </div>
                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Completed By</p>
                    <p className="text-lg font-black text-gray-900 mt-2">{selectedRoute.completed_by_name || 'Not Recorded'}</p>
                    <p className="text-xs font-bold text-gray-500 mt-1">{selectedRoute.completed_at ? formatRouteDate(selectedRoute.completed_at) : 'No completion timestamp yet'}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-black text-gray-900">
                      {panelMode === 'history' ? 'Route Log' : 'Route Stops'}
                    </h4>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                      {panelMode === 'history'
                        ? 'Tap completed stop cards to review the logged route history.'
                        : 'Reorder, remove, and optimize route stops before sending the day out.'}
                    </p>
                  </div>

                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      value={builderSearchQuery}
                      onChange={(event) => setBuilderSearchQuery(event.target.value)}
                      placeholder={panelMode === 'history' ? 'Search route log...' : 'Search route stops...'}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                {visibleStops.length === 0 ? (
                  <div className="rounded-[28px] border-2 border-dashed border-gray-100 p-10 text-center">
                    <p className="text-lg font-black text-gray-900">
                      {panelMode === 'history' ? 'No logged stops for this route yet.' : 'No stops on this route yet.'}
                    </p>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                      {panelMode === 'history'
                        ? 'Complete stops from the daily route screen to build route history.'
                        : 'Add jobs or clients here to build the selected route.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visibleStops.map((stop, index) => (
                      <RouteStopCard
                        key={stop.id}
                        stop={stop}
                        index={index}
                        totalStops={visibleStops.length}
                        onReorder={canReorderVisibleStops ? handleArrowReorder : undefined}
                        onRemove={panelMode === 'builder' ? handleRemoveStop : undefined}
                        hideReorder={!canReorderVisibleStops}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-[32px] border-2 border-dashed border-gray-100 p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <MapIcon className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mt-6">
                {panelMode === 'history' ? 'Select route history' : 'Select or create a route'}
              </h3>
              <p className="text-sm font-bold text-gray-400 mt-3 max-w-md mx-auto">
                {panelMode === 'history'
                  ? 'Pick a completed route from the left to inspect who worked it and when it finished.'
                  : 'Choose a saved planning route or create the selected day route to begin building stops.'}
              </p>
              {panelMode === 'builder' && (
                <button
                  onClick={handleCreateRouteForDay}
                  className="mt-6 px-6 py-4 bg-gray-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-800 transition-all"
                >
                  Create Selected Day Route
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {isAddingStop && selectedRoute && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[90vh] sm:h-auto sm:max-w-2xl rounded-[40px] p-8 overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Add Stop to Route</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Select a job or client to add</p>
              </div>
              <button
                onClick={() => setIsAddingStop(false)}
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ChevronRight className="h-6 w-6 rotate-45" />
              </button>
            </div>

            <div className="space-y-8">
              <div className="relative group mb-6">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                </div>
                <input
                  type="text"
                  value={addStopSearchQuery}
                  onChange={(event) => setAddStopSearchQuery(event.target.value)}
                  className="block w-full pl-14 pr-6 py-5 bg-gray-50 border border-gray-100 rounded-3xl text-sm font-bold text-gray-900 placeholder:text-gray-300 shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none"
                  placeholder="Search jobs or customers..."
                />
              </div>

              <section>
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Active Jobs</h4>
                <div className="grid grid-cols-1 gap-3">
                  {availableJobs
                    .filter((job) => job.status !== 'completed')
                    .filter((job) =>
                      job.customer_name_snapshot.toLowerCase().includes(addStopSearchQuery.toLowerCase()) ||
                      job.service_snapshot.toLowerCase().includes(addStopSearchQuery.toLowerCase())
                    )
                    .map((job) => (
                      <button
                        key={job.id}
                        onClick={() => handleAddJobToRoute(job)}
                        className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 hover:ring-2 hover:ring-blue-500 rounded-2xl transition-all text-left group"
                      >
                        <div>
                          <p className="text-sm font-black text-gray-900">{job.customer_name_snapshot}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{job.service_snapshot}</p>
                        </div>
                        <Plus className="h-5 w-5 text-gray-300 group-hover:text-blue-600" />
                      </button>
                    ))}
                </div>
              </section>

              <section>
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">All Clients</h4>
                <div className="grid grid-cols-1 gap-3">
                  {availableCustomers
                    .filter((customer) => customer.name.toLowerCase().includes(addStopSearchQuery.toLowerCase()))
                    .map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => handleAddCustomerToRoute(customer)}
                        className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 hover:ring-2 hover:ring-blue-500 rounded-2xl transition-all text-left group"
                      >
                        <div>
                          <p className="text-sm font-black text-gray-900">{customer.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {customer.city}, {customer.state}
                          </p>
                        </div>
                        <Plus className="h-5 w-5 text-gray-300 group-hover:text-blue-600" />
                      </button>
                    ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] w-full max-w-md px-4 animate-in slide-in-from-bottom-4">
          <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 shrink-0" />
              <p className="text-sm font-bold">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4 rotate-45" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
