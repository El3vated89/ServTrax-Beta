import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';
import { UserProfile } from './userProfileService';
import { planConfigService, SubscriptionStatus } from './planConfigService';
import { SaveDebugContext, savePipelineService } from './savePipelineService';

interface AdminBusinessProfile {
  id: string;
  business_name?: string;
  ownerId?: string;
  plan_key?: string;
  plan_name?: string;
  subscription_status?: SubscriptionStatus;
  storage_add_on_quantity?: number;
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

interface AdminUsageCounterRecord {
  id: string;
  ownerId?: string;
  period_key?: string;
  sms_used?: number;
  email_used?: number;
  storage_used_bytes?: number;
  sms_limit?: number;
  email_limit?: number;
  storage_limit_bytes?: number;
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
  usageByBusiness: Array<{
    ownerId: string;
    businessName: string;
    smsUsed: number;
    smsLimit: number;
    emailUsed: number;
    emailLimit: number;
    storageUsedBytes: number;
    storageLimitBytes: number;
  }>;
  businessPlans: Array<{
    ownerId: string;
    businessName: string;
    planKey: string;
    planName: string;
    subscriptionStatus: string;
    storageAddOnQuantity: number;
    storageLimitBytes: number;
    activeJobCount: number;
    todayRouteRuns: number;
  }>;
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

const safeReadCollection = async <T>(
  collectionName: string,
  debugContext?: SaveDebugContext
): Promise<T[]> => {
  try {
    if (debugContext) {
      savePipelineService.log(debugContext, 'db_write_attempted', { action: 'admin_read_collection', collectionName });
    }

    const snapshot = await savePipelineService.withTimeout(getDocs(collection(db, collectionName)), {
      timeoutMessage: `Timed out while loading controller data from ${collectionName}.`,
      debugContext,
    });

    if (debugContext) {
      savePipelineService.log(debugContext, 'db_write_succeeded', { action: 'admin_read_collection', collectionName, count: snapshot.size });
    }

    return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as T));
  } catch (error) {
    console.error(`Controller read failed for ${collectionName}, continuing with partial metrics:`, error);
    if (debugContext) {
      savePipelineService.logError(debugContext, 'db_write_failed', error);
    }
    return [];
  }
};

export const adminService = {
  getMetrics: async (debugContext?: SaveDebugContext): Promise<AdminMetrics> => {
    try {
      const user = await waitForCurrentUser({ debugContext });
      if (!user) {
        throw new Error('User not authenticated');
      }

      const [users, businesses, records, jobs, routeTemplates, routes, routeActivity, usageCounters] = await Promise.all([
        safeReadCollection<Record<string, any>>('users', debugContext).then((entries) =>
          entries.map((entry) => ({ uid: String(entry.uid || entry.id || ''), ...entry } as UserProfile))
        ),
        safeReadCollection<AdminBusinessProfile>('business_profiles', debugContext),
        safeReadCollection<AdminVerificationRecord>('verification_records', debugContext),
        safeReadCollection<AdminJobRecord>('jobs', debugContext),
        safeReadCollection<AdminRouteTemplateRecord>('route_templates', debugContext),
        safeReadCollection<AdminRouteRecord>('routes', debugContext),
        safeReadCollection<AdminRouteActivityRecord>('route_activity_logs', debugContext),
        safeReadCollection<AdminUsageCounterRecord>('usage_counters', debugContext),
      ]);

      const businessNameByOwner = businesses.reduce<Record<string, string>>((lookup, business) => {
        lookup[business.ownerId || business.id] = business.business_name || 'Unnamed Business';
        return lookup;
      }, {});

      const ownerIdsFromBusinesses = businesses.map((business) => business.ownerId || business.id).filter(Boolean);
      const ownerIdsFromUsers = users.map((entry) => entry.uid).filter(Boolean);
      const uniqueUserIds = Array.from(new Set([...ownerIdsFromUsers, ...ownerIdsFromBusinesses]));

      const usersById = users.reduce<Record<string, UserProfile>>((lookup, entry) => {
        if (entry.uid) {
          lookup[entry.uid] = entry;
        }
        return lookup;
      }, {});

      const normalizedUsers = uniqueUserIds
        .map((uid) => {
          const userEntry = usersById[uid];
          const matchingBusiness = businesses.find((business) => (business.ownerId || business.id) === uid);
          return {
            uid,
            email: userEntry?.email || '',
            name: userEntry?.name || matchingBusiness?.business_name || userEntry?.email || 'Unknown User',
            role: userEntry?.role || (uid === user.uid ? 'admin' : 'owner'),
            active: userEntry?.active !== false,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name));

      const planCounts = businesses.reduce<Record<string, number>>((counts, business) => {
        const planName = planConfigService.resolveBusinessPlan(business).planLabel;
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
      const activeJobsByOwner = jobs.reduce<Record<string, number>>((totals, job) => {
        if (['completed', 'canceled'].includes(job.status || '')) return totals;
        const ownerId = job.ownerId || 'unknown';
        totals[ownerId] = (totals[ownerId] || 0) + 1;
        return totals;
      }, {});
      const todayRouteRunsByOwner = routes.reduce<Record<string, number>>((totals, route) => {
        const routeDate = toDate(route.route_date);
        if (!routeDate) return totals;
        const routeDay = new Date(routeDate);
        routeDay.setHours(0, 0, 0, 0);
        if (routeDay.getTime() !== todayStart.getTime()) return totals;
        const ownerId = route.ownerId || 'unknown';
        totals[ownerId] = (totals[ownerId] || 0) + 1;
        return totals;
      }, {});
      const businessPlans = businesses
        .map((business) => {
          const ownerId = business.ownerId || business.id;
          const resolvedPlan = planConfigService.resolveBusinessPlan(business);

          return {
            ownerId,
            businessName: business.business_name || 'Unnamed Business',
            planKey: resolvedPlan.planKey,
            planName: resolvedPlan.planLabel,
            subscriptionStatus: business.subscription_status || 'active',
            storageAddOnQuantity: Number(business.storage_add_on_quantity || 0),
            storageLimitBytes: resolvedPlan.storageLimitBytes,
            activeJobCount: activeJobsByOwner[ownerId] || 0,
            todayRouteRuns: todayRouteRunsByOwner[ownerId] || 0,
          };
        })
        .sort((left, right) => left.businessName.localeCompare(right.businessName));
      const currentPeriodKey = new Date().toISOString().slice(0, 7);
      const usageByBusiness = businessPlans
        .map((business) => {
          const usage = usageCounters.find((entry) => entry.ownerId === business.ownerId && entry.period_key === currentPeriodKey);
          return {
            ownerId: business.ownerId,
            businessName: business.businessName,
            smsUsed: Number(usage?.sms_used || 0),
            smsLimit: Number(usage?.sms_limit || 0),
            emailUsed: Number(usage?.email_used || 0),
            emailLimit: Number(usage?.email_limit || 0),
            storageUsedBytes: Number(usage?.storage_used_bytes || storageByOwner[business.ownerId] || 0),
            storageLimitBytes: Number(usage?.storage_limit_bytes || business.storageLimitBytes || 0),
          };
        })
        .sort((left, right) => right.storageUsedBytes - left.storageUsedBytes)
        .slice(0, 8);

      return {
        totalUsers: normalizedUsers.length,
        activeBusinesses: businesses.length,
        activePlans: planCounts,
        totalStorageBytes: Object.values(storageByOwner).reduce((sum, size) => sum + size, 0),
        users: normalizedUsers,
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
        usageByBusiness,
        businessPlans,
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
        usageByBusiness: [],
        businessPlans: [],
        placeholders: {
          stripeStatus: 'Unavailable',
          platformRevenue: 'Unavailable',
          overageMonitoring: 'Unavailable',
          planAdjustments: 'Unavailable',
        },
      };
    }
  },

  updateBusinessPlan: async (
    ownerId: string,
    updates: {
      plan_key: string;
      plan_name: string;
      subscription_status: string;
      storage_add_on_quantity: number;
    },
    debugContext?: SaveDebugContext
  ) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    try {
      if (debugContext) {
        savePipelineService.log(debugContext, 'payload_built', { ownerId, keys: Object.keys(updates) });
        savePipelineService.log(debugContext, 'db_write_attempted', { path: `business_profiles/${ownerId}` });
      }
      await savePipelineService.withTimeout(updateDoc(doc(db, 'business_profiles', ownerId), updates), {
        timeoutMessage: 'Timed out while updating the business plan.',
        debugContext,
      });
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', { path: `business_profiles/${ownerId}` });
      }
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
      }
      handleFirestoreError(error, OperationType.UPDATE, `business_profiles/${ownerId}`);
    }
  },
};
