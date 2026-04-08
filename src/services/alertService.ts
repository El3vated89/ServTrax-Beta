import { Timestamp } from 'firebase/firestore';
import { Job } from './jobService';
import { Route } from '../modules/routes/types';
import { Quote } from './quoteService';

export interface OperationalAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  link: string;
  linkState?: Record<string, any>;
  count?: number;
}

export interface StorageAlertSummary {
  used_bytes: number;
  limit_bytes: number;
}

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const alertService = {
  buildOperationalAlerts: (jobs: Job[], routes: Route[], quotes: Quote[] = [], storageSummary?: StorageAlertSummary): OperationalAlert[] => {
    const today = startOfDay(new Date());

    const overdueJobs = jobs.filter((job) => {
      if (['completed', 'canceled', 'quote'].includes(job.status)) return false;
      const dueDate = toDate(job.next_due_date || job.scheduled_date);
      return dueDate ? startOfDay(dueDate).getTime() < today.getTime() : false;
    });

    const carryoverJobs = jobs.filter((job) => ['skipped', 'delayed'].includes(job.status));

    const todayRoutes = routes.filter((route) => {
      const routeDate = toDate(route.route_date);
      return routeDate ? startOfDay(routeDate).getTime() === today.getTime() : false;
    });

    const draftRoutes = todayRoutes.filter((route) => route.status === 'draft');
    const inProgressRoutes = todayRoutes.filter((route) => route.status === 'in_progress');
    const sentQuotes = quotes.filter((quote) => quote.status === 'sent');

    const alerts: OperationalAlert[] = [];

    if (overdueJobs.length > 0) {
      alerts.push({
        id: 'overdue-jobs',
        title: 'Overdue Work Needs Placement',
        description: `${overdueJobs.length} overdue job${overdueJobs.length === 1 ? '' : 's'} still need attention.`,
        severity: 'critical',
        link: '/routes',
        linkState: { selectedDate: new Date().toISOString() },
        count: overdueJobs.length,
      });
    }

    if (carryoverJobs.length > 0) {
      alerts.push({
        id: 'carryover-jobs',
        title: 'Carryover Work Is Waiting',
        description: `${carryoverJobs.length} skipped or delayed job${carryoverJobs.length === 1 ? '' : 's'} should be reviewed.`,
        severity: 'warning',
        link: '/routes',
        linkState: { selectedDate: new Date().toISOString() },
        count: carryoverJobs.length,
      });
    }

    if (draftRoutes.length > 0) {
      alerts.push({
        id: 'draft-routes',
        title: 'Today Has Draft Route Runs',
        description: `${draftRoutes.length} route run${draftRoutes.length === 1 ? '' : 's'} for today have not been started.`,
        severity: 'warning',
        link: '/map',
        linkState: { selectedRouteDate: new Date().toISOString() },
        count: draftRoutes.length,
      });
    }

    if (inProgressRoutes.length > 0) {
      alerts.push({
        id: 'active-routes',
        title: 'Route Runs Are In Progress',
        description: `${inProgressRoutes.length} route run${inProgressRoutes.length === 1 ? '' : 's'} are still active today.`,
        severity: 'info',
        link: '/map',
        linkState: { selectedRouteDate: new Date().toISOString() },
        count: inProgressRoutes.length,
      });
    }

    if (sentQuotes.length > 0) {
      alerts.push({
        id: 'sent-quotes',
        title: 'Quotes Awaiting Approval',
        description: `${sentQuotes.length} quote${sentQuotes.length === 1 ? '' : 's'} are still waiting on a customer decision.`,
        severity: 'info',
        link: '/jobs',
        linkState: { activeTab: 'quotes' },
        count: sentQuotes.length,
      });
    }

    if (storageSummary?.limit_bytes) {
      const usageRatio = storageSummary.used_bytes / storageSummary.limit_bytes;
      if (usageRatio >= 0.8) {
        alerts.push({
          id: 'storage-usage',
          title: 'Storage Is Near Capacity',
          description: `Storage is at ${Math.round(usageRatio * 100)}% of the current limit.`,
          severity: usageRatio >= 0.95 ? 'critical' : 'warning',
          link: '/storage',
          count: Math.round(usageRatio * 100),
        });
      }
    }

    return alerts;
  },
};
