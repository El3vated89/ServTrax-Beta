const MB = 1024 * 1024;
const GB = 1024 * MB;

export interface StoragePolicy {
  planName: string;
  limitBytes: number;
  retentionDays: number | null;
}

interface BusinessStorageProfile {
  plan_name?: string;
  custom_storage_cap?: number | null;
}

const normalizePlanName = (planName?: string) => (planName || 'Free').trim().toLowerCase();

const getBasePolicy = (planName?: string): StoragePolicy => {
  const normalized = normalizePlanName(planName);

  if (normalized.includes('pro')) {
    return { planName: 'Pro', limitBytes: 5 * GB, retentionDays: 365 };
  }

  if (normalized.includes('starter lite')) {
    return { planName: 'Starter Lite', limitBytes: 500 * MB, retentionDays: 30 };
  }

  if (normalized === 'starter' || normalized.includes('starter')) {
    return { planName: 'Starter', limitBytes: 1 * GB, retentionDays: 90 };
  }

  return { planName: 'Free', limitBytes: 100 * MB, retentionDays: 14 };
};

export const storagePolicyService = {
  resolvePolicy: (profile?: BusinessStorageProfile | null): StoragePolicy => {
    const basePolicy = getBasePolicy(profile?.plan_name);
    const customCap = profile?.custom_storage_cap;

    if (typeof customCap === 'number' && customCap > 0) {
      return {
        ...basePolicy,
        limitBytes: customCap,
      };
    }

    return basePolicy;
  },
};
