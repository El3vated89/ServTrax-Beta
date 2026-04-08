import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { UserProfile } from './userProfileService';

interface AdminBusinessProfile {
  id: string;
  business_name?: string;
  ownerId?: string;
  plan_name?: string;
  custom_storage_cap?: number;
}

interface AdminVerificationRecord {
  id: string;
  ownerId?: string;
  photo_urls?: string[];
  photo_url?: string;
  file_size_bytes?: number;
}

interface AdminJobRecord {
  id: string;
  ownerId?: string;
  customer_name_snapshot?: string;
  created_at?: any;
  completed_date?: any;
  status?: string;
}

interface AdminRouteTemplateRecord {
  id: string;
  ownerId?: string;
}

interface AdminRouteRecord {
  id: string;
  ownerId?: string;
  route_date?: any;
  status?: string;
  assigned_team_name_snapshot?: string;
}

interface AdminRouteActivityRecord {
  id: string;
  ownerId?: string;
  occurred_at?: any;
}

export interface AdminMetrics {
  totalUsers: number;
  activeBusinesses: number;
  activePlans: Record<string, number>;
  totalStorageBytes: number;
  users: Array<{ uid: string; email: string; name: string; role: string; active: boolean }>;
  storageByBusiness: Array<{ ownerId: string; businessName: string; usedBytes: number }>;
  recentActivityByBusiness: Array<{ ownerId: string; businessName: string; activityCount: number }>;
  recentJobCount: number;
  totalRouteTemplates: number;
  totalRouteRuns: number;
  activeRouteRunsToday: number;
  routeRunsMissingCrewLabelToday: number;
  routeActivityLast7Days: number;
  routeActivityByBusiness: Array<{ ownerId: string; businessName: string; activityCount: number }>;
  placeholders: {
    stripeStatus: string;
    platformRevenue: string;
    overageMonitoring: string;
    planAdjustments: string;
  };
}

const toDate = (value: any) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

export const adminService = {
  getMetrics: async (): Promise<AdminMetrics> => {
    try {
      const [usersSnapshot, businessSnapshot, verificationSnapshot, jobsSnapshot, routeTemplatesSnapshot, routesSnapshot, routeActivitySnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'business_profiles')),
        getDocs(collection(db, 'verification_records')),
        getDocs(collection(db, 'jobs')),
        getDocs(collection(db, 'route_templates')),
        getDocs(collection(db, 'routes')),
        getDocs(collection(db, 'route_activity_logs')),
      ]);

      const users = usersSnapshot.docs.map((entry) => ({ uid: entry.id, ...entry.data() } as UserProfile));
      const businesses = businessSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as AdminBusinessProfile));
      const records = verificationSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as AdminVerificationRecord));
      const jobs = jobsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as AdminJobRecord));
      const routeTemplates = routeTemplatesSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as AdminRouteTemplateRecord));
      const routes = routesSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as AdminRouteRecord));
      const routeActivity = routeActivitySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as AdminRouteActivityRecord));

      const planCounts = businesses.reduce<Record<string, number>>((counts, business) => {
        const planName = business.plan_name || 'Free Tier';
        counts[planName] = (counts[planName] || 0) + 1;
        return counts;
      }, {});

      const storageByOwner = records.reduce<Record<string, number>>((totals, record) => {
        const ownerId = record.ownerId || 'unknown';
        const photoUrls = record.photo_urls || (record.photo_url ? [record.photo_url] : []);
        const estimatedBytes = record.file_size_bytes || (photoUrls.reduce((sum, url) => sum + (url?.length || 0), 0) * 0.75);
        totals[ownerId] = (totals[ownerId] || 0) + estimatedBytes;
        return totals;
      }, {});

      const businessNameByOwner = businesses.reduce<Record<string, string>>((lookup, business) => {
        lookup[business.ownerId || business.id] = business.business_name || 'Unnamed Business';
        return lookup;
      }, {});

      const activityThreshold = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const activityByOwner = jobs.reduce<Record<string, number>>((totals, job) => {
        const activityDate = toDate(job.completed_date || job.created_at);
        if (!activityDate || activityDate.getTime() < activityThreshold) return totals;
        const ownerId = job.ownerId || 'unknown';
        totals[ownerId] = (totals[ownerId] || 0) + 1;
        return totals;
      }, {});
      const routeActivityByOwner = routeActivity.reduce<Record<string, number>>((totals, entry) => {
        const activityDate = toDate(entry.occurred_at);
        if (!activityDate || activityDate.getTime() < activityThreshold) return totals;
        const ownerId = entry.ownerId || 'unknown';
        totals[ownerId] = (totals[ownerId] || 0) + 1;
        return totals;
      }, {});
      const activeRouteRunsToday = routes.filter((route) => {
        const routeDate = toDate(route.route_date);
        if (!routeDate) return false;
        const routeDay = new Date(routeDate);
        routeDay.setHours(0, 0, 0, 0);
        return routeDay.getTime() === todayStart.getTime() && route.status === 'in_progress';
      }).length;
      const routeRunsMissingCrewLabelToday = routes.filter((route) => {
        const routeDate = toDate(route.route_date);
        if (!routeDate) return false;
        const routeDay = new Date(routeDate);
        routeDay.setHours(0, 0, 0, 0);
        return routeDay.getTime() === todayStart.getTime() && !route.assigned_team_name_snapshot;
      }).length;

      return {
        totalUsers: users.length,
        activeBusinesses: businesses.length,
        activePlans: planCounts,
        totalStorageBytes: Object.values(storageByOwner).reduce((sum, size) => sum + size, 0),
        users: users
          .map((user) => ({
            uid: user.uid,
            email: user.email || '',
            name: user.name || '',
            role: user.role || 'owner',
            active: user.active !== false,
          }))
          .sort((left, right) => left.email.localeCompare(right.email)),
        storageByBusiness: Object.entries(storageByOwner)
          .map(([ownerId, usedBytes]) => ({
            ownerId,
            businessName: businessNameByOwner[ownerId] || 'Unnamed Business',
            usedBytes,
          }))
          .sort((left, right) => right.usedBytes - left.usedBytes)
          .slice(0, 8),
        recentActivityByBusiness: Object.entries(activityByOwner)
          .map(([ownerId, activityCount]) => ({
            ownerId,
            businessName: businessNameByOwner[ownerId] || 'Unnamed Business',
            activityCount,
          }))
          .sort((left, right) => right.activityCount - left.activityCount)
          .slice(0, 8),
        recentJobCount: Object.values(activityByOwner).reduce((sum, count) => sum + count, 0),
        totalRouteTemplates: routeTemplates.length,
        totalRouteRuns: routes.length,
        activeRouteRunsToday,
        routeRunsMissingCrewLabelToday,
        routeActivityLast7Days: Object.values(routeActivityByOwner).reduce((sum, count) => sum + count, 0),
        routeActivityByBusiness: Object.entries(routeActivityByOwner)
          .map(([ownerId, activityCount]) => ({
            ownerId,
            businessName: businessNameByOwner[ownerId] || 'Unnamed Business',
            activityCount,
          }))
          .sort((left, right) => right.activityCount - left.activityCount)
          .slice(0, 8),
        placeholders: {
          stripeStatus: 'Placeholder until platform billing collections are connected.',
          platformRevenue: 'Placeholder until ServTrax Stripe revenue data is stored.',
          overageMonitoring: 'Placeholder until automated storage overage flags are written.',
          planAdjustments: 'Placeholder until manual plan override records are tracked.',
        },
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'admin_metrics');
      return {
        totalUsers: 0,
        activeBusinesses: 0,
        activePlans: {},
        totalStorageBytes: 0,
        users: [],
        storageByBusiness: [],
        recentActivityByBusiness: [],
        recentJobCount: 0,
        totalRouteTemplates: 0,
        totalRouteRuns: 0,
        activeRouteRunsToday: 0,
        routeRunsMissingCrewLabelToday: 0,
        routeActivityLast7Days: 0,
        routeActivityByBusiness: [],
        placeholders: {
          stripeStatus: 'Unavailable',
          platformRevenue: 'Unavailable',
          overageMonitoring: 'Unavailable',
          planAdjustments: 'Unavailable',
        },
      };
    }
  },
};
