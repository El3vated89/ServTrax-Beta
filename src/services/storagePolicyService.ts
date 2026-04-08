import { BusinessPlanProfile, planConfigService } from './planConfigService';

export interface StoragePolicy {
  planName: string;
  limitBytes: number;
  retentionDays: number | null;
}

export const storagePolicyService = {
  resolvePolicy: (profile?: BusinessPlanProfile | null): StoragePolicy => {
    const resolvedPlan = planConfigService.resolveBusinessPlan(profile);

    return {
      planName: resolvedPlan.planLabel,
      limitBytes: resolvedPlan.storageLimitBytes,
      retentionDays: resolvedPlan.limits.retention_days,
    };
  },
};
