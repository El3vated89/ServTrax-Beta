import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  GripVertical,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { jobService, Job } from '../../services/jobService';
import { routeActivityService } from '../../services/routeActivityService';
import { routePlanningService } from '../../services/routePlanningService';
import { routeTemplateService } from '../../services/routeTemplateService';
import { routeService } from '../../services/RouteService';
import { BASE_CAMP } from './constants';
import RouteStopCard from './components/RouteStopCard';
import { BaseCamp, Route, RouteActivityLog, RouteStop, RouteTemplate, RouteTemplateCadence, RouteTemplateMode } from './types';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toDate = (value: any) => {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const toDateInputValue = (value: Date) => {
  const local = new Date(value);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
};

const getJobTimingState = (job: Job, selectedDate: Date) => {
  const rawDate = job.next_due_date || job.scheduled_date;
  if (!rawDate) return 'unscheduled';
  const jobDate = startOfDay(toDate(rawDate)).getTime();
  const selectedDay = startOfDay(selectedDate).getTime();
  if (jobDate < selectedDay) return 'overdue';
  if (job.status === 'skipped' || job.status === 'delayed') return 'carryover';
  if (jobDate === selectedDay) return 'due';
  return 'upcoming';
};

const formatRouteDate = (value: any) =>
  toDate(value).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const formatRouteDateTime = (value: any) =>
  toDate(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const cadenceLabels: Record<RouteTemplateCadence, string> = {
  weekly: 'Weekly',
  bi_weekly: 'Bi-weekly',
  monthly: 'Monthly',
  manual: 'Manual',
};

const modeLabels: Record<RouteTemplateMode, string> = {
  day: 'Day',
  area: 'Area',
  hybrid: 'Day + Area',
  custom: 'Custom',
};

const defaultTemplateForm = {
  id: '',
  name: '',
  mode: 'hybrid' as RouteTemplateMode,
  cadence: 'weekly' as RouteTemplateCadence,
  preferred_day: new Date().getDay().toString(),
  service_area: '',
  max_stops_per_run: '15',
  include_overdue: true,
  include_skipped: true,
  include_delayed: true,
};

export default function RoutesManagementPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [baseCamp, setBaseCamp] = useState<BaseCamp>(BASE_CAMP);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStopsByRoute, setRunStopsByRoute] = useState<Record<string, RouteStop[]>>({});
  const [draftStops, setDraftStops] = useState<RouteStop[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncingRun, setIsSyncingRun] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(defaultTemplateForm);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [hasUnsavedOrder, setHasUnsavedOrder] = useState(false);
  const [isSavingRunDetails, setIsSavingRunDetails] = useState(false);
  const [runDetailsForm, setRunDetailsForm] = useState({
    route_run_label: '',
    assigned_team_name_snapshot: '',
  });
  const [activityLogs, setActivityLogs] = useState<RouteActivityLog[]>([]);

  useEffect(() => {
    const routeState = location.state as { selectedDate?: string; selectedTemplateId?: string } | null;
    if (routeState?.selectedDate) {
      const nextDate = new Date(routeState.selectedDate);
      if (!Number.isNaN(nextDate.getTime())) {
        setSelectedDate(nextDate);
      }
    }
    if (routeState?.selectedTemplateId) {
      setSelectedTemplateId(routeState.selectedTemplateId);
    }
  }, [location.state]);

  useEffect(() => {
    const unsubscribeTemplates = routeTemplateService.subscribeToTemplates(setTemplates);
    const unsubscribeRoutes = routeService.subscribeToRoutes(setRoutes);
    const unsubscribeJobs = jobService.subscribeToJobs(setJobs);

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

    return () => {
      unsubscribeTemplates();
      unsubscribeRoutes();
      unsubscribeJobs();
    };
  }, []);

  useEffect(() => {
    if (templates.length === 0) {
      setSelectedTemplateId(null);
      return;
    }

    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id || null);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!saveMessage && !errorMessage) return undefined;
    const timeout = window.setTimeout(() => {
      setSaveMessage(null);
      setErrorMessage(null);
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, saveMessage]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;

  const matchingRuns = useMemo(() => {
    if (!selectedTemplate?.id) return [];

    return routes
      .filter((route) => route.template_id === selectedTemplate.id)
      .sort((left, right) => toDate(right.route_date).getTime() - toDate(left.route_date).getTime());
  }, [routes, selectedTemplate]);

  const currentRuns = useMemo(() => {
    if (!selectedTemplate?.id) return [] as Route[];

    return matchingRuns.filter((route) => startOfDay(toDate(route.route_date)).getTime() === startOfDay(selectedDate).getTime())
      .sort((left, right) => (left.route_run_index || 1) - (right.route_run_index || 1));
  }, [matchingRuns, selectedDate, selectedTemplate]);

  useEffect(() => {
    if (!currentRuns?.length) {
      setActiveRunId(null);
      return;
    }

    if (!activeRunId || !currentRuns.some((route) => route.id === activeRunId)) {
      setActiveRunId(currentRuns[0].id || null);
    }
  }, [activeRunId, currentRuns]);

  useEffect(() => {
    if (!currentRuns?.length) {
      setRunStopsByRoute({});
      return;
    }

    const nextRunIds = new Set(currentRuns.map((route) => route.id).filter(Boolean) as string[]);
    const unsubscribes = currentRuns
      .filter((route) => route.id)
      .map((route) => routeService.subscribeToRouteStops(route.id!, (stops) => {
        setRunStopsByRoute((previous) => ({ ...previous, [route.id!]: stops }));
      }));

    setRunStopsByRoute((previous) => {
      const nextEntries = Object.entries(previous).filter(([routeId]) => nextRunIds.has(routeId));
      return Object.fromEntries(nextEntries);
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentRuns]);

  const activeRun = useMemo(
    () => currentRuns?.find((route) => route.id === activeRunId) || currentRuns?.[0] || null,
    [activeRunId, currentRuns]
  );

  const activeStops = useMemo(
    () => (activeRun?.id ? runStopsByRoute[activeRun.id] || [] : []),
    [activeRun?.id, runStopsByRoute]
  );

  useEffect(() => {
    setDraftStops(activeStops);
    setHasUnsavedOrder(false);
  }, [activeStops]);

  useEffect(() => {
    if (!activeRun?.id) {
      setActivityLogs([]);
      return;
    }

    return routeActivityService.subscribeToRouteActivity(activeRun.id, setActivityLogs);
  }, [activeRun?.id]);

  useEffect(() => {
    setRunDetailsForm({
      route_run_label: activeRun?.route_run_label || '',
      assigned_team_name_snapshot: activeRun?.assigned_team_name_snapshot || '',
    });
  }, [activeRun?.assigned_team_name_snapshot, activeRun?.route_run_label, activeRun?.id]);

  const eligibleJobs = useMemo(() => {
    if (!selectedTemplate) return [];
    return routePlanningService.getEligibleJobsForTemplate(jobs, selectedTemplate, selectedDate);
  }, [jobs, selectedDate, selectedTemplate]);

  const assignedJobIds = useMemo(
    () => new Set(
      Object.values(runStopsByRoute)
        .flat()
        .map((stop) => stop.job_id)
        .filter(Boolean)
    ),
    [runStopsByRoute]
  );

  const filteredJobs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return eligibleJobs.filter((job) => {
      const matchesSearch = !query ||
        (job.customer_name_snapshot || '').toLowerCase().includes(query) ||
        (job.service_snapshot || '').toLowerCase().includes(query) ||
        (job.address_snapshot || '').toLowerCase().includes(query);
      return matchesSearch;
    });
  }, [eligibleJobs, searchQuery]);

  const runLookup = useMemo(
    () => new Map(currentRuns.filter((route) => route.id).map((route) => [route.id!, route])),
    [currentRuns]
  );

  const assignedStopByJobId = useMemo(() => {
    const map = new Map<string, RouteStop>();
    Object.values(runStopsByRoute)
      .flat()
      .forEach((stop) => {
        if (stop.job_id) {
          map.set(stop.job_id, stop);
        }
      });
    return map;
  }, [runStopsByRoute]);

  const assignedRunByJobId = useMemo(() => {
    const map = new Map<string, Route>();
    Object.entries(runStopsByRoute).forEach(([routeId, stops]) => {
      const route = runLookup.get(routeId);
      if (!route) return;

      stops.forEach((stop) => {
        if (stop.job_id) {
          map.set(stop.job_id, route);
        }
      });
    });
    return map;
  }, [runLookup, runStopsByRoute]);

  const queueStats = useMemo(() => ({
    due: eligibleJobs.filter((job) => getJobTimingState(job, selectedDate) === 'due').length,
    overdue: eligibleJobs.filter((job) => getJobTimingState(job, selectedDate) === 'overdue').length,
    unassigned: eligibleJobs.filter((job) => !assignedJobIds.has(job.id)).length,
    assigned: eligibleJobs.filter((job) => assignedJobIds.has(job.id)).length,
    carryover: eligibleJobs.filter((job) => ['skipped', 'delayed'].includes(job.status)).length,
  }), [eligibleJobs, selectedDate, assignedJobIds]);

  const queueSections = useMemo(() => {
    const sectionOrder = ['overdue', 'carryover', 'due', 'upcoming'] as const;
    return sectionOrder
      .map((key) => ({
        key,
        label: key === 'carryover' ? 'Carryover Work' : key.charAt(0).toUpperCase() + key.slice(1),
        jobs: filteredJobs.filter((job) => getJobTimingState(job, selectedDate) === key),
      }))
      .filter((section) => section.jobs.length > 0);
  }, [filteredJobs, selectedDate]);

  const templateHistory = matchingRuns.slice(0, 6);
  const isPreferredDayMatch = selectedTemplate ? routePlanningService.isTemplateActiveForDate(selectedTemplate, selectedDate) : true;

  const openCreateTemplate = () => {
    setTemplateForm({
      ...defaultTemplateForm,
      preferred_day: selectedDate.getDay().toString(),
      max_stops_per_run: '15',
    });
    setIsTemplateModalOpen(true);
  };

  const openEditTemplate = (template: RouteTemplate) => {
    setTemplateForm({
      id: template.id || '',
      name: template.name,
      mode: template.mode,
      cadence: template.cadence,
      preferred_day: template.preferred_day == null ? '' : String(template.preferred_day),
      service_area: template.service_area || '',
      max_stops_per_run: String(template.max_stops_per_run || 15),
      include_overdue: template.include_overdue,
      include_skipped: template.include_skipped,
      include_delayed: template.include_delayed,
    });
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedName = templateForm.name.trim();
    if (!trimmedName) {
      setErrorMessage('Route template name is required.');
      return;
    }

    const payload = {
      name: trimmedName,
      mode: templateForm.mode,
      cadence: templateForm.cadence,
      preferred_day: templateForm.preferred_day === '' ? null : Number(templateForm.preferred_day),
      service_area: templateForm.service_area,
      max_stops_per_run: Number(templateForm.max_stops_per_run || 15),
      include_overdue: templateForm.include_overdue,
      include_skipped: templateForm.include_skipped,
      include_delayed: templateForm.include_delayed,
    };

    try {
      if (templateForm.id) {
        await routeTemplateService.updateTemplate(templateForm.id, payload);
        setSaveMessage('Route template updated');
      } else {
        const ref = await routeTemplateService.addTemplate(payload as Omit<RouteTemplate, 'id' | 'ownerId' | 'created_at' | 'updated_at'>);
        if (ref?.id) {
          setSelectedTemplateId(ref.id);
        }
        setSaveMessage('Route template created');
      }

      setIsTemplateModalOpen(false);
    } catch (error) {
      console.error('Error saving route template:', error);
      setErrorMessage('Failed to save route template.');
    }
  };

  const handleDeleteTemplate = async (template: RouteTemplate) => {
    if (!template.id) return;
    const confirmed = window.confirm(`Delete ${template.name}?`);
    if (!confirmed) return;

    try {
      await routeTemplateService.deleteTemplate(template.id);
      setSaveMessage('Route template deleted');
    } catch (error) {
      console.error('Error deleting route template:', error);
      setErrorMessage('Failed to delete route template.');
    }
  };

  const handleSyncRun = async () => {
    if (!selectedTemplate) return;
    setIsSyncingRun(true);
    setErrorMessage(null);

    try {
      const runs = await routePlanningService.syncTemplateRuns(selectedTemplate, selectedDate, jobs, baseCamp);
      if (runs?.[0]?.id) {
        setActiveRunId(runs[0].id);
      }
      await Promise.all(
        (runs || []).map((run) =>
          routeActivityService.addActivity({
            route: run,
            eventType: 'run_generated',
            summary: currentRuns?.length
              ? 'Planner refreshed this run from the current due work.'
              : 'Planner generated this run from the current due work.',
          })
        )
      );
      setSaveMessage(currentRuns?.length ? 'Route runs refreshed' : 'Route runs generated');
    } catch (error) {
      console.error('Error syncing route run:', error);
      setErrorMessage('Failed to generate this route run.');
    } finally {
      setIsSyncingRun(false);
    }
  };

  const moveDraftStop = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= draftStops.length || fromIndex === toIndex) return;

    const nextStops = [...draftStops];
    const [movedStop] = nextStops.splice(fromIndex, 1);
    nextStops.splice(toIndex, 0, movedStop);
    setDraftStops(nextStops);
    setHasUnsavedOrder(true);
  };

  const handleArrowReorder = (index: number, direction: 'up' | 'down') => {
    moveDraftStop(index, direction === 'up' ? index - 1 : index + 1);
  };

  const handleSaveRouteOrder = async () => {
    if (!activeRun?.id || draftStops.length === 0) return;
    setIsSavingOrder(true);
    setErrorMessage(null);

    try {
      await routeService.batchUpdateStopOrders(
        draftStops
          .filter((stop) => stop.id)
          .map((stop, index) => ({
            id: stop.id!,
            stop_order: index,
            manual_order: index,
          }))
      );
      await routeService.updateRoute(activeRun.id, { manual_override: true });
      await routeActivityService.addActivity({
        route: activeRun,
        eventType: 'order_saved',
        summary: `Saved the stop order for ${activeRun.assigned_team_name_snapshot || activeRun.route_run_label || 'this run'}.`,
      });
      setHasUnsavedOrder(false);
      setSaveMessage('Route order saved');
    } catch (error) {
      console.error('Error saving route order:', error);
      setErrorMessage('Failed to save route order.');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSaveRunDetails = async () => {
    if (!activeRun?.id) return;
    setIsSavingRunDetails(true);
    setErrorMessage(null);

    const nextRunLabel = runDetailsForm.route_run_label.trim() || activeRun.route_run_label || 'Run 1';
    const nextTeamName = runDetailsForm.assigned_team_name_snapshot.trim();

    try {
      await routeService.updateRoute(activeRun.id, {
        route_run_label: nextRunLabel,
        assigned_team_name_snapshot: nextTeamName,
      });
      await routeActivityService.addActivity({
        route: {
          ...activeRun,
          route_run_label: nextRunLabel,
          assigned_team_name_snapshot: nextTeamName,
        },
        eventType: 'run_details_updated',
        summary: nextTeamName
          ? `Updated this run for ${nextTeamName}.`
          : 'Updated this run label and details.',
      });
      setSaveMessage('Run details saved');
    } catch (error) {
      console.error('Error saving run details:', error);
      setErrorMessage('Failed to save run details.');
    } finally {
      setIsSavingRunDetails(false);
    }
  };

  const handleRemoveStop = async (stop: RouteStop) => {
    if (!stop.id || !activeRun) return;
    const confirmed = window.confirm(`Remove ${stop.customer_name_snapshot} from this run?`);
    if (!confirmed) return;

    try {
      await routeService.deleteRouteStop(stop.id);
      await routeActivityService.addActivity({
        route: activeRun,
        stop,
        eventType: 'stop_removed',
        summary: `Removed ${stop.customer_name_snapshot} from this run.`,
      });
      setSaveMessage('Stop removed from route run');
    } catch (error) {
      console.error('Error removing route stop:', error);
      setErrorMessage('Failed to remove route stop.');
    }
  };

  const handleOpenDailyRoute = () => {
    if (!activeRun?.id) return;
    navigate('/map', {
      state: {
        selectedRouteId: activeRun.id,
        selectedRouteDate: selectedDate.toISOString(),
      },
    });
  };

  const handleAddJobToRun = async (job: Job) => {
    if (!activeRun?.id || !job.id) {
      setErrorMessage('Generate a route run first, then place this job into it.');
      return;
    }

    if (assignedStopByJobId.has(job.id)) {
      setErrorMessage('This job is already placed on a route run.');
      return;
    }

    const maxStops = routePlanningService.getMaxStopsPerRun(activeRun.route_capacity || selectedTemplate?.max_stops_per_run);
    if (activeStops.length >= maxStops) {
      setErrorMessage(`This run is full at ${maxStops} stops. Use another same-day run first.`);
      return;
    }

    try {
      const stopData = routePlanningService.buildRouteStopFromJob(
        activeRun.id,
        job,
        activeStops.length,
        baseCamp,
        selectedDate
      );

      const stopRef = await routeService.addRouteStop(stopData);
      await routeActivityService.addActivity({
        route: activeRun,
        eventType: 'stop_added',
        stop: stopRef?.id ? { ...stopData, id: stopRef.id } as RouteStop : undefined,
        summary: `Added ${job.customer_name_snapshot} to ${activeRun.assigned_team_name_snapshot || activeRun.route_run_label || 'this run'}.`,
      });
      setSaveMessage('Job added to the current route run');
    } catch (error) {
      console.error('Error adding job to route run:', error);
      setErrorMessage('Failed to add this job to the current route run.');
    }
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Routes</h2>
              <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                Templates + Runs
              </span>
            </div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">
              Start with a reusable route template, then generate the current run from work that is actually due.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
              <span className="pl-2 text-[10px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">
                Run Date
              </span>
              <button
                onClick={() => setSelectedDate(new Date(selectedDate.getTime() - (24 * 60 * 60 * 1000)))}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
              <input
                type="date"
                value={toDateInputValue(selectedDate)}
                onChange={(event) => {
                  const nextDate = new Date(`${event.target.value}T12:00:00`);
                  if (!Number.isNaN(nextDate.getTime())) {
                    setSelectedDate(nextDate);
                  }
                }}
                className="px-2 py-2 bg-transparent text-sm font-black text-gray-900 outline-none"
              />
              <button
                onClick={() => setSelectedDate(new Date(selectedDate.getTime() + (24 * 60 * 60 * 1000)))}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={openCreateTemplate}
              className="px-5 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Route Template
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-3xl border border-gray-100 bg-white p-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Due</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{queueStats.due}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Overdue</p>
            <p className="text-2xl font-black text-red-600 mt-2">{queueStats.overdue}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Carryover</p>
            <p className="text-2xl font-black text-amber-600 mt-2">{queueStats.carryover}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Assigned</p>
            <p className="text-2xl font-black text-blue-600 mt-2">{queueStats.assigned}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unassigned</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{queueStats.unassigned}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
        <aside className="space-y-4">
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Route Templates</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                  Day, area, or hybrid routes
                </p>
              </div>
              <button
                onClick={openCreateTemplate}
                className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {templates.length === 0 && (
                <div className="rounded-3xl border-2 border-dashed border-gray-200 p-8 text-center">
                  <p className="text-sm font-black text-gray-500">No route templates yet</p>
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-2">
                    Create one for a day, area, or both
                  </p>
                  <button
                    onClick={openCreateTemplate}
                    className="mt-4 px-4 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                  >
                    Create First Template
                  </button>
                </div>
              )}

              {templates.map((template) => {
                const isSelected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id || null)}
                    className={`w-full text-left rounded-3xl border p-4 transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 shadow-lg shadow-blue-50'
                        : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-gray-900">{template.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                          {modeLabels[template.mode]} • {cadenceLabels[template.cadence]}
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      {template.preferred_day != null && (
                        <span className="px-2 py-1 rounded-full bg-white text-[10px] font-black uppercase tracking-widest text-gray-600 border border-blue-100">
                          {days[template.preferred_day]}
                        </span>
                      )}
                      {template.service_area && (
                        <span className="px-2 py-1 rounded-full bg-white text-[10px] font-black uppercase tracking-widest text-gray-600 border border-blue-100">
                          {template.service_area}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          {!selectedTemplate && (
            <div className="bg-white rounded-[32px] border-2 border-dashed border-gray-200 p-12 text-center">
              <p className="text-xl font-black text-gray-900">Select or create a route template</p>
              <p className="text-sm font-bold text-gray-400 mt-2">
                Reusable templates are how the planner knows what route to generate again next cycle.
              </p>
              <button
                onClick={openCreateTemplate}
                className="mt-6 px-5 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
              >
                New Route Template
              </button>
            </div>
          )}

          {selectedTemplate && (
            <>
              <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-2xl font-black text-gray-900 tracking-tight">{selectedTemplate.name}</h3>
                      <span className="px-3 py-1 rounded-full bg-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        {modeLabels[selectedTemplate.mode]}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        {cadenceLabels[selectedTemplate.cadence]}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {selectedTemplate.preferred_day != null && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-blue-600" />
                          {days[selectedTemplate.preferred_day]}
                        </div>
                      )}
                      {selectedTemplate.service_area && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-blue-600" />
                          {selectedTemplate.service_area}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-blue-600" />
                        {selectedTemplate.max_stops_per_run || 15} stops max per run
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-600" />
                        Same-day runs can split across future crews
                      </div>
                    </div>

                    {!isPreferredDayMatch && selectedTemplate.preferred_day != null && (
                      <div className="flex items-center gap-3 rounded-2xl bg-amber-50 text-amber-700 px-4 py-3 border border-amber-100">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <p className="text-xs font-bold">
                          This template prefers {days[selectedTemplate.preferred_day]}, but you can still generate this run for {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => openEditTemplate(selectedTemplate)}
                      className="px-4 py-3 bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(selectedTemplate)}
                      className="px-4 py-3 bg-red-50 text-red-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-all flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
                  <button
                    onClick={handleSyncRun}
                    disabled={isSyncingRun}
                    className={`rounded-3xl px-5 py-4 text-left transition-all border ${
                      isSyncingRun
                        ? 'bg-gray-100 border-gray-100 text-gray-400'
                        : 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-100 hover:bg-blue-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RefreshCw className={`h-5 w-5 ${isSyncingRun ? 'animate-spin' : ''}`} />
                      <div>
                        <p className="text-sm font-black">{currentRuns?.length ? 'Refresh Route Runs' : 'Generate Route Runs'}</p>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${isSyncingRun ? 'text-gray-400' : 'text-blue-100'}`}>
                          {currentRuns?.length ? 'Re-balance same-day route runs from what is due' : 'Create same-day route runs from due work'}
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handleSaveRouteOrder}
                    disabled={!activeRun || !hasUnsavedOrder || isSavingOrder}
                    className={`rounded-3xl px-5 py-4 text-left transition-all border ${
                      !activeRun || !hasUnsavedOrder || isSavingOrder
                        ? 'bg-gray-100 border-gray-100 text-gray-400'
                        : 'bg-white border-gray-200 text-gray-900 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Save className="h-5 w-5" />
                      <div>
                        <p className="text-sm font-black">{isSavingOrder ? 'Saving Order...' : 'Save Route Order'}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                          Keep this stop order for the current run
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handleOpenDailyRoute}
                    disabled={!activeRun}
                    className={`rounded-3xl px-5 py-4 text-left transition-all border ${
                      !activeRun
                        ? 'bg-gray-100 border-gray-100 text-gray-400'
                        : 'bg-white border-gray-200 text-gray-900 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight className="h-5 w-5" />
                      <div>
                        <p className="text-sm font-black">Open Daily Route</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                          Run this generated route in the field view
                        </p>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Template</p>
                    <p className="text-sm font-black text-gray-900 mt-2">Reusable</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      Generates new runs from work that is due
                    </p>
                  </div>
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Runs For Date</p>
                    <p className="text-sm font-black text-gray-900 mt-2">{currentRuns.length || 0}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      Same-day runs can split for separate crews
                    </p>
                  </div>
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Needs Placement</p>
                    <p className="text-sm font-black text-gray-900 mt-2">{queueStats.unassigned}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      Due work not yet assigned to a run
                    </p>
                  </div>
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Max Stops / Run</p>
                    <p className="text-sm font-black text-gray-900 mt-2">
                      {routePlanningService.getMaxStopsPerRun(selectedTemplate.max_stops_per_run)}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      Auto-splits into extra runs after this
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
                <div className="space-y-6">
                  <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                      <div>
                        <h4 className="text-lg font-black text-gray-900">Work Queue</h4>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                          Due work, overdue work, and carryover that belongs to this route
                        </p>
                      </div>

                      <div className="relative w-full md:w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Search queue..."
                          className="w-full pl-11 pr-4 py-3 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-6">
                      {queueSections.length === 0 && (
                        <div className="rounded-3xl border-2 border-dashed border-gray-200 p-10 text-center">
                          <p className="text-base font-black text-gray-900">No matching work right now</p>
                          <p className="text-sm font-bold text-gray-400 mt-2">
                            Try another route date or relax this template&apos;s area filters.
                          </p>
                        </div>
                      )}

                      {queueSections.map((section) => (
                        <div key={section.key} className="space-y-3">
                          <div className="flex items-center gap-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                              {section.label}
                            </p>
                            <div className="h-px flex-1 bg-gray-100" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                              {section.jobs.length}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            {section.jobs.map((job) => {
                              const timingState = getJobTimingState(job, selectedDate);
                              const isAssigned = Boolean(job.id && assignedJobIds.has(job.id));
                              const assignedRun = job.id ? assignedRunByJobId.get(job.id) : null;
                              const isOnActiveRun = Boolean(job.id && activeRun?.id && assignedStopByJobId.get(job.id)?.route_id === activeRun.id);

                              return (
                                <div
                                  key={job.id}
                                  className="rounded-3xl border border-gray-100 bg-gray-50 p-4"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-black text-gray-900">{job.customer_name_snapshot}</p>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                                        {job.service_snapshot}
                                      </p>
                                      <p className="text-xs font-bold text-gray-500 mt-3">{job.address_snapshot}</p>
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                        timingState === 'overdue'
                                          ? 'bg-red-100 text-red-700'
                                          : timingState === 'carryover'
                                            ? 'bg-amber-100 text-amber-700'
                                            : timingState === 'due'
                                              ? 'bg-blue-100 text-blue-700'
                                              : 'bg-gray-200 text-gray-600'
                                      }`}>
                                        {timingState}
                                      </span>
                                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                        isAssigned ? 'bg-green-100 text-green-700' : 'bg-white text-gray-500 border border-gray-200'
                                      }`}>
                                        {isAssigned ? 'Placed' : 'Needs Placement'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="mt-4 flex flex-wrap items-center gap-3">
                                    {assignedRun ? (
                                      <>
                                        <button
                                          onClick={() => {
                                            setActiveRunId(assignedRun.id || null);
                                            if (assignedRun.route_date) {
                                              setSelectedDate(toDate(assignedRun.route_date));
                                            }
                                          }}
                                          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-blue-300 hover:bg-blue-50 transition-all"
                                        >
                                          {isOnActiveRun
                                            ? 'On Current Run'
                                            : `Open ${assignedRun.assigned_team_name_snapshot || assignedRun.route_run_label || 'Assigned Run'}`}
                                        </button>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                          {assignedRun.route_run_label || 'Run 1'} • {assignedRun.status.replace('_', ' ')}
                                        </p>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => handleAddJobToRun(job)}
                                          disabled={!activeRun}
                                          className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                            !activeRun
                                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100'
                                          }`}
                                        >
                                          {activeRun ? 'Add To Current Run' : 'Generate Run First'}
                                        </button>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                          {activeRun
                                            ? `${activeStops.length}/${routePlanningService.getMaxStopsPerRun(activeRun.route_capacity || selectedTemplate.max_stops_per_run)} stops used`
                                            : 'No active run selected'}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between gap-4 mb-6">
                      <div>
                        <h4 className="text-lg font-black text-gray-900">Recent Runs</h4>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                          This route template&apos;s recent generated runs
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {templateHistory.length === 0 && (
                        <div className="rounded-3xl border-2 border-dashed border-gray-200 p-8 text-center">
                          <p className="text-sm font-black text-gray-500">No route runs yet</p>
                          <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-2">
                            Generate the first run for this template
                          </p>
                        </div>
                      )}

                      {templateHistory.map((route) => (
                        <button
                          key={route.id}
                          onClick={() => {
                            setSelectedDate(toDate(route.route_date));
                            setActiveRunId(route.id || null);
                          }}
                          className={`w-full text-left rounded-3xl border p-4 transition-all ${
                            route.id === activeRun?.id
                              ? 'border-blue-600 bg-blue-50 shadow-lg shadow-blue-50'
                              : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-gray-900">{formatRouteDate(route.route_date)}</p>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                                {(route.assigned_team_name_snapshot || route.route_run_label || 'Run 1')} • {route.status.replace('_', ' ')}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-black text-gray-900">Current Run Draft</h4>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                        {activeRun ? `${formatRouteDate(activeRun.route_date)} • ${activeRun.route_run_label || 'Run 1'}` : 'Generate runs to start ordering stops'}
                      </p>
                    </div>

                    {hasUnsavedOrder && (
                      <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest">
                        Unsaved Order
                      </span>
                    )}
                  </div>

                  {currentRuns.length > 1 && (
                    <div className="flex flex-wrap gap-3">
                      {currentRuns.map((route) => (
                        <button
                          key={route.id}
                          onClick={() => setActiveRunId(route.id || null)}
                          className={`px-4 py-3 rounded-2xl border text-left transition-all ${
                            route.id === activeRun?.id
                              ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                              : 'bg-white text-gray-700 border-gray-100 hover:border-blue-200 hover:bg-blue-50'
                          }`}
                        >
                          <p className="text-xs font-black uppercase tracking-widest">
                            {route.assigned_team_name_snapshot || route.route_run_label || 'Run'}
                          </p>
                          <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${
                            route.id === activeRun?.id ? 'text-blue-100' : 'text-gray-400'
                          }`}>
                            {(runStopsByRoute[route.id || ''] || []).length}/{routePlanningService.getMaxStopsPerRun(route.route_capacity || selectedTemplate.max_stops_per_run)} stops
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {activeRun && (
                    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-black text-gray-900">Run Details</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                            Keep same-day runs clear for future crew assignments
                          </p>
                        </div>
                        <button
                          onClick={handleSaveRunDetails}
                          disabled={isSavingRunDetails}
                          className={`px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                            isSavingRunDetails
                              ? 'bg-gray-200 text-gray-400'
                              : 'bg-white border border-gray-200 text-gray-900 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {isSavingRunDetails ? 'Saving...' : 'Save Run Details'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            Run Label
                          </label>
                          <input
                            type="text"
                            value={runDetailsForm.route_run_label}
                            onChange={(event) => setRunDetailsForm((prev) => ({ ...prev, route_run_label: event.target.value }))}
                            placeholder="Run 1, North Loop, Monday A..."
                            className="w-full px-4 py-3 bg-white rounded-2xl border border-gray-200 text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            Crew / Team Placeholder
                          </label>
                          <input
                            type="text"
                            value={runDetailsForm.assigned_team_name_snapshot}
                            onChange={(event) => setRunDetailsForm((prev) => ({ ...prev, assigned_team_name_snapshot: event.target.value }))}
                            placeholder="Crew 1, Thomas + Jake, Truck B..."
                            className="w-full px-4 py-3 bg-white rounded-2xl border border-gray-200 text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!activeRun && (
                    <div className="rounded-3xl border-2 border-dashed border-gray-200 p-10 text-center">
                      <p className="text-base font-black text-gray-900">No route runs for this date yet</p>
                      <p className="text-sm font-bold text-gray-400 mt-2">
                        Generate route runs to pull in the work due for this template.
                      </p>
                    </div>
                  )}

                  {activeRun && draftStops.length === 0 && (
                    <div className="rounded-3xl border-2 border-dashed border-gray-200 p-10 text-center">
                      <p className="text-base font-black text-gray-900">No stops on this run</p>
                      <p className="text-sm font-bold text-gray-400 mt-2">
                        Refresh the run to pull matching due work back in.
                      </p>
                    </div>
                  )}

                  {activeRun && draftStops.length > 0 && (
                    <div className="space-y-4">
                      <div className="rounded-3xl bg-gray-50 border border-gray-100 p-4 flex items-center gap-3">
                        <GripVertical className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-black text-gray-900">Drag or arrow the stops into order</p>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                            Save the route order when you are happy with the run
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {draftStops.map((stop, index) => (
                          <div
                            key={stop.id}
                            draggable
                            onDragStart={() => setDraggedStopId(stop.id || null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              const fromIndex = draftStops.findIndex((item) => item.id === draggedStopId);
                              if (fromIndex >= 0) {
                                moveDraftStop(fromIndex, index);
                              }
                              setDraggedStopId(null);
                            }}
                            onDragEnd={() => setDraggedStopId(null)}
                            className={draggedStopId === stop.id ? 'opacity-60' : ''}
                          >
                            <RouteStopCard
                              stop={stop}
                              index={index}
                              totalStops={draftStops.length}
                              onReorder={handleArrowReorder}
                              onRemove={handleRemoveStop}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeRun && (
                    <div className="rounded-3xl border border-gray-100 bg-white p-5 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-black text-gray-900">Recent Route Activity</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                            Started, completed, delayed, removed, and saved actions on this run
                          </p>
                        </div>
                      </div>

                      {activityLogs.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center">
                          <p className="text-sm font-black text-gray-500">No route activity yet</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activityLogs.slice(0, 6).map((log) => (
                            <div key={log.id} className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-black text-gray-900">{log.summary}</p>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                                    {log.actor_name}
                                  </p>
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">
                                  {formatRouteDateTime(log.occurred_at)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[90] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[40px] p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                  {templateForm.id ? 'Edit Route Template' : 'New Route Template'}
                </h3>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-2">
                  Reusable route structure for future generated runs
                </p>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Route Template Name
                  </label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Monday, Oldsmar, North Friday..."
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Template Type
                  </label>
                  <select
                    value={templateForm.mode}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, mode: event.target.value as RouteTemplateMode }))}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="day">Day</option>
                    <option value="area">Area</option>
                    <option value="hybrid">Day + Area</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Cadence
                  </label>
                  <select
                    value={templateForm.cadence}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, cadence: event.target.value as RouteTemplateCadence }))}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="bi_weekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Preferred Day
                  </label>
                  <select
                    value={templateForm.preferred_day}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, preferred_day: event.target.value }))}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">No fixed day</option>
                    {days.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Service Area
                  </label>
                  <input
                    type="text"
                    value={templateForm.service_area}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, service_area: event.target.value }))}
                    placeholder="Oldsmar, Tampa, North..."
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Max Stops Per Run
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={templateForm.max_stops_per_run}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, max_stops_per_run: event.target.value }))}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="rounded-3xl bg-gray-50 border border-gray-100 p-5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Include In Route Generation</p>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm font-black text-gray-900">Overdue work</span>
                    <input
                      type="checkbox"
                      checked={templateForm.include_overdue}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, include_overdue: event.target.checked }))}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm font-black text-gray-900">Skipped work</span>
                    <input
                      type="checkbox"
                      checked={templateForm.include_skipped}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, include_skipped: event.target.checked }))}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm font-black text-gray-900">Delayed work</span>
                    <input
                      type="checkbox"
                      checked={templateForm.include_delayed}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, include_delayed: event.target.checked }))}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-5 py-3 bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(saveMessage || errorMessage) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
          <div className={`rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3 ${
            errorMessage ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}>
            {errorMessage ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <p className="text-sm font-bold">{errorMessage || saveMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
