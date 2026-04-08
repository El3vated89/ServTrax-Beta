import { Timestamp } from 'firebase/firestore';
import { Job } from './jobService';
import { RouteTemplate, RouteStop } from '../modules/routes/types';
import { routeService } from './RouteService';

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
};

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const normalizeCity = (value?: string) => (value || '').trim().toLowerCase();

const deriveJobCity = (job: Job) => {
  const parts = (job.address_snapshot || '').split(',');
  return normalizeCity(parts[1]);
};

const buildStableStopKey = (job: Job) => job.customerId || job.id || `${job.customer_name_snapshot}-${job.address_snapshot}`;

const buildStopFromJob = (
  routeId: string,
  job: Job,
  stopOrder: number,
  existingStop?: RouteStop,
  baseCamp?: { lat: number; lng: number }
): Omit<RouteStop, 'id' | 'created_at' | 'updated_at'> => ({
  route_id: routeId,
  job_id: job.id,
  customer_id: job.customerId,
  stop_order: stopOrder,
  manual_order: stopOrder,
  optimized_order: stopOrder,
  status: 'pending',
  due_state: job.status === 'delayed'
    ? 'delayed'
    : (() => {
        const scheduledDate = toDate(job.scheduled_date || job.next_due_date);
        if (!scheduledDate) return 'due';
        return startOfDay(scheduledDate).getTime() < startOfDay(new Date()).getTime() ? 'overdue' : 'due';
      })(),
  city_snapshot: deriveJobCity(job),
  address_snapshot: job.address_snapshot || '',
  lat_snapshot: existingStop?.lat_snapshot || baseCamp?.lat || 0,
  lng_snapshot: existingStop?.lng_snapshot || baseCamp?.lng || 0,
  service_type_snapshot: job.service_snapshot || 'General Service',
  customer_name_snapshot: job.customer_name_snapshot || 'Unknown Customer',
  price_snapshot: job.price_snapshot || 0,
  last_service_date_snapshot: job.last_completed_date || job.completed_date || '',
  scheduled_date: job.scheduled_date || job.next_due_date || Timestamp.now(),
  due_date: job.next_due_date || job.scheduled_date || Timestamp.now(),
  notes_internal: '',
});

export const routePlanningService = {
  isTemplateActiveForDate: (template: RouteTemplate, date: Date) => {
    if (template.preferred_day == null) return true;
    return date.getDay() === template.preferred_day;
  },

  getEligibleJobsForTemplate: (jobs: Job[], template: RouteTemplate, date: Date) => {
    const selectedDay = endOfDay(date).getTime();
    const templateArea = normalizeCity(template.service_area);

    return jobs
      .filter((job) => !['completed', 'canceled', 'quote'].includes(job.status))
      .filter((job) => {
        const scheduledDate = toDate(job.next_due_date || job.scheduled_date);
        return scheduledDate ? startOfDay(scheduledDate).getTime() <= selectedDay : false;
      })
      .filter((job) => {
        if (job.status === 'skipped' && !template.include_skipped) return false;
        if (job.status === 'delayed' && !template.include_delayed) return false;

        const scheduledDate = toDate(job.next_due_date || job.scheduled_date);
        const isOverdue = scheduledDate ? startOfDay(scheduledDate).getTime() < startOfDay(date).getTime() : false;
        if (isOverdue && !template.include_overdue) return false;
        return true;
      })
      .filter((job) => {
        if (!templateArea) return true;
        return deriveJobCity(job) === templateArea;
      })
      .sort((left, right) => {
        const leftDate = toDate(left.next_due_date || left.scheduled_date)?.getTime() || 0;
        const rightDate = toDate(right.next_due_date || right.scheduled_date)?.getTime() || 0;
        if (leftDate !== rightDate) return leftDate - rightDate;
        return left.customer_name_snapshot.localeCompare(right.customer_name_snapshot);
      });
  },

  syncTemplateRun: async (template: RouteTemplate, date: Date, jobs: Job[], baseCamp: { label: string; address: string; lat: number; lng: number }) => {
    if (!template.id) return null;

    const run = await routeService.ensureRouteRunForTemplate(template, date, baseCamp);
    if (!run?.id) return null;

    const eligibleJobs = routePlanningService.getEligibleJobsForTemplate(jobs, template, date);
    const existingStops = await routeService.getRouteStops(run.id);
    const existingByKey = new Map(existingStops.map((stop) => [stop.customer_id || stop.job_id || `${stop.customer_name_snapshot}-${stop.address_snapshot}`, stop]));

    const desiredStops = eligibleJobs.map((job, index) => {
      const existingStop = existingByKey.get(buildStableStopKey(job));
      return {
        existingStop,
        stopData: buildStopFromJob(run.id!, job, index, existingStop, baseCamp),
      };
    });

    const desiredJobIds = new Set(eligibleJobs.map((job) => job.id).filter(Boolean));

    for (const stop of existingStops) {
      if (stop.job_id && !desiredJobIds.has(stop.job_id)) {
        await routeService.deleteRouteStop(stop.id!);
      }
    }

    for (let index = 0; index < desiredStops.length; index += 1) {
      const entry = desiredStops[index];
      if (entry.existingStop?.id) {
        await routeService.updateRouteStop(entry.existingStop.id, {
          ...entry.stopData,
          stop_order: index,
          manual_order: index,
          optimized_order: index,
        });
      } else {
        await routeService.addRouteStop(entry.stopData);
      }
    }

    return run;
  },
};
