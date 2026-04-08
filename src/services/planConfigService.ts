import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { waitForCurrentUser } from './authSessionService';

export type PlanKey = 'free' | 'starter_lite' | 'starter' | 'pro';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
export type PlanFeatureKey =
  | 'customer_portal'
  | 'persistent_portal'
  | 'team_mode'
  | 'storage_add_on'
  | 'sms_delivery'
  | 'email_delivery';

export interface BillingPlanDefinition {
  key: PlanKey;
  label: string;
  monthly_price: number;
  annual_price: number;
  description: string;
  active: boolean;
  sort_order: number;
  feature_flags: Record<PlanFeatureKey, boolean>;
  limits: {
    storage_limit_bytes: number;
    retention_days: number | null;
    max_active_jobs: number;
    max_route_runs_per_day: number;
    monthly_sms_limit: number;
    monthly_email_limit: number;
    max_team_members: number;
  };
}

export interface StorageAddOnConfig {
  enabled: boolean;
  label: string;
  increment_bytes: number;
  price_per_increment: number;
  max_increments: number;
}

export interface BillingFramework {
  plans: BillingPlanDefinition[];
  storage_add_on: StorageAddOnConfig;
  created_at?: any;
  updated_at?: any;
}

export interface BusinessPlanProfile {
  ownerId?: string;
  plan_key?: string;
  plan_name?: string;
  subscription_status?: SubscriptionStatus;
  storage_add_on_quantity?: number;
  custom_storage_cap?: number | null;
}

export interface ResolvedBusinessPlan {
  planKey: PlanKey;
  planLabel: string;
  subscriptionStatus: SubscriptionStatus;
  plan: BillingPlanDefinition;
  featureFlags: Record<PlanFeatureKey, boolean>;
  limits: BillingPlanDefinition['limits'];
  storageLimitBytes: number;
  storageAddOnBytes: number;
  storageAddOnQuantity: number;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;
const ADMIN_EMAIL = 'thomaslmiller89@gmail.com';
const COLLECTION_NAME = 'platform_catalog';
const DOC_ID = 'billing_framework';
const TEMP_ENABLE_ALL_FEATURES = true;
const ALL_FEATURE_FLAGS: Record<PlanFeatureKey, boolean> = {
  customer_portal: true,
  persistent_portal: true,
  team_mode: true,
  storage_add_on: true,
  sms_delivery: true,
  email_delivery: true,
};

const DEFAULT_FRAMEWORK: BillingFramework = {
  plans: [
    {
      key: 'free',
      label: 'Free',
      monthly_price: 0,
      annual_price: 0,
      description: 'Solo starter tier with core workflow and limited storage.',
      active: true,
      sort_order: 1,
      feature_flags: {
        customer_portal: false,
        persistent_portal: false,
        team_mode: false,
        storage_add_on: false,
        sms_delivery: false,
        email_delivery: false,
      },
      limits: {
        storage_limit_bytes: 100 * MB,
        retention_days: 14,
        max_active_jobs: 150,
        max_route_runs_per_day: 1,
        monthly_sms_limit: 0,
        monthly_email_limit: 25,
        max_team_members: 0,
      },
    },
    {
      key: 'starter_lite',
      label: 'Starter Lite',
      monthly_price: 19,
      annual_price: 190,
      description: 'Low-cost upgrade for operators who need more storage and messaging.',
      active: true,
      sort_order: 2,
      feature_flags: {
        customer_portal: false,
        persistent_portal: false,
        team_mode: false,
        storage_add_on: true,
        sms_delivery: true,
        email_delivery: true,
      },
      limits: {
        storage_limit_bytes: 500 * MB,
        retention_days: 30,
        max_active_jobs: 400,
        max_route_runs_per_day: 2,
        monthly_sms_limit: 250,
        monthly_email_limit: 500,
        max_team_members: 0,
      },
    },
    {
      key: 'starter',
      label: 'Starter',
      monthly_price: 49,
      annual_price: 490,
      description: 'Core paid plan with persistent portal access and larger operating limits.',
      active: true,
      sort_order: 3,
      feature_flags: {
        customer_portal: true,
        persistent_portal: true,
        team_mode: false,
        storage_add_on: true,
        sms_delivery: true,
        email_delivery: true,
      },
      limits: {
        storage_limit_bytes: 1 * GB,
        retention_days: 90,
        max_active_jobs: 1200,
        max_route_runs_per_day: 4,
        monthly_sms_limit: 1000,
        monthly_email_limit: 2500,
        max_team_members: 0,
      },
    },
    {
      key: 'pro',
      label: 'Pro',
      monthly_price: 99,
      annual_price: 990,
      description: 'Higher-capacity plan with team access and larger communication limits.',
      active: true,
      sort_order: 4,
      feature_flags: {
        customer_portal: true,
        persistent_portal: true,
        team_mode: true,
        storage_add_on: true,
        sms_delivery: true,
        email_delivery: true,
      },
      limits: {
        storage_limit_bytes: 5 * GB,
        retention_days: 365,
        max_active_jobs: 5000,
        max_route_runs_per_day: 12,
        monthly_sms_limit: 5000,
        monthly_email_limit: 10000,
        max_team_members: 25,
      },
    },
  ],
  storage_add_on: {
    enabled: true,
    label: 'Storage Add-On',
    increment_bytes: 1 * GB,
    price_per_increment: 15,
    max_increments: 10,
  },
};

let cachedFramework: BillingFramework = DEFAULT_FRAMEWORK;

const normalizePlanKey = (planValue?: string | null): PlanKey => {
  const normalized = (planValue || '').trim().toLowerCase();

  if (normalized === 'starter_lite' || normalized.includes('starter lite')) {
    return 'starter_lite';
  }

  if (normalized === 'starter' || normalized.includes('starter')) {
    return 'starter';
  }

  if (normalized === 'pro' || normalized.includes('pro')) {
    return 'pro';
  }

  return 'free';
};

const buildPlanMap = (plans?: Partial<BillingPlanDefinition>[]) => {
  const incomingPlans = Array.isArray(plans) ? plans : [];
  return incomingPlans.reduce<Record<PlanKey, Partial<BillingPlanDefinition>>>((map, plan) => {
    const key = normalizePlanKey(plan?.key || plan?.label);
    map[key] = {
      ...map[key],
      ...plan,
      key,
    };
    return map;
  }, {} as Record<PlanKey, Partial<BillingPlanDefinition>>);
};

const normalizeFramework = (framework?: Partial<BillingFramework> | null): BillingFramework => {
  const planMap = buildPlanMap(framework?.plans);

  return {
    ...DEFAULT_FRAMEWORK,
    ...framework,
    plans: DEFAULT_FRAMEWORK.plans
      .map((defaultPlan) => {
        const incomingPlan = planMap[defaultPlan.key] || {};
        return {
          ...defaultPlan,
          ...incomingPlan,
          key: defaultPlan.key,
          label: incomingPlan.label || defaultPlan.label,
          feature_flags: {
            ...(TEMP_ENABLE_ALL_FEATURES
              ? ALL_FEATURE_FLAGS
              : {
                  ...defaultPlan.feature_flags,
                  ...(incomingPlan.feature_flags || {}),
                }),
          },
          limits: {
            ...defaultPlan.limits,
            ...(incomingPlan.limits || {}),
          },
        };
      })
      .sort((left, right) => left.sort_order - right.sort_order),
    storage_add_on: {
      ...DEFAULT_FRAMEWORK.storage_add_on,
      ...(framework?.storage_add_on || {}),
    },
  };
};

const getDocRef = () => doc(db, COLLECTION_NAME, DOC_ID);

export const planConfigService = {
  normalizePlanKey,

  getDefaultFramework: () => DEFAULT_FRAMEWORK,

  getCachedFramework: () => cachedFramework,

  getDefaultBusinessPlanFields: () => ({
    plan_key: 'free' as PlanKey,
    plan_name: 'Free',
    subscription_status: 'active' as SubscriptionStatus,
    storage_add_on_quantity: 0,
    custom_storage_cap: null,
  }),

  hydrateFramework: async () => {
    const user = await waitForCurrentUser();

    if (!user) {
      cachedFramework = DEFAULT_FRAMEWORK;
      return cachedFramework;
    }

    try {
      const snapshot = await getDoc(getDocRef());
      cachedFramework = snapshot.exists()
        ? normalizeFramework(snapshot.data() as BillingFramework)
        : DEFAULT_FRAMEWORK;

      return cachedFramework;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${COLLECTION_NAME}/${DOC_ID}`);
      cachedFramework = DEFAULT_FRAMEWORK;
      return cachedFramework;
    }
  },

  subscribeToFramework: (callback: (framework: BillingFramework) => void) => {
    let unsubscribeDoc = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeDoc();

      if (!user) {
        cachedFramework = DEFAULT_FRAMEWORK;
        callback(DEFAULT_FRAMEWORK);
        return;
      }

      unsubscribeDoc = onSnapshot(
        getDocRef(),
        (snapshot) => {
          cachedFramework = snapshot.exists()
            ? normalizeFramework(snapshot.data() as BillingFramework)
            : DEFAULT_FRAMEWORK;
          callback(cachedFramework);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `${COLLECTION_NAME}/${DOC_ID}`);
          callback(cachedFramework);
        }
      );
    });

    return () => {
      unsubscribeDoc();
      unsubscribeAuth();
    };
  },

  ensureFramework: async () => {
    const user = await waitForCurrentUser();
    if (!user || user.email !== ADMIN_EMAIL) return;

    try {
      const snapshot = await getDoc(getDocRef());
      if (!snapshot.exists()) {
        await setDoc(getDocRef(), {
          ...DEFAULT_FRAMEWORK,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
        cachedFramework = DEFAULT_FRAMEWORK;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${COLLECTION_NAME}/${DOC_ID}`);
    }
  },

  saveFramework: async (framework: BillingFramework) => {
    const user = await waitForCurrentUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      throw new Error('Only the platform admin can update plan settings.');
    }

    const normalizedFramework = normalizeFramework(framework);

    try {
      await setDoc(
        getDocRef(),
        {
          ...normalizedFramework,
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );
      cachedFramework = normalizedFramework;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${DOC_ID}`);
    }
  },

  resolveBusinessPlan: (
    profile?: BusinessPlanProfile | null,
    framework?: BillingFramework | null
  ): ResolvedBusinessPlan => {
    const activeFramework = normalizeFramework(framework || cachedFramework);
    const planKey = normalizePlanKey(profile?.plan_key || profile?.plan_name);
    const plan = activeFramework.plans.find((entry) => entry.key === planKey) || activeFramework.plans[0];
    const requestedAddOns = Math.max(0, Number(profile?.storage_add_on_quantity || 0));
    const allowedAddOns =
      plan.feature_flags.storage_add_on && activeFramework.storage_add_on.enabled
        ? Math.min(requestedAddOns, activeFramework.storage_add_on.max_increments)
        : 0;
    const storageAddOnBytes = allowedAddOns * activeFramework.storage_add_on.increment_bytes;

    let storageLimitBytes = plan.limits.storage_limit_bytes + storageAddOnBytes;
    if (typeof profile?.custom_storage_cap === 'number' && profile.custom_storage_cap > 0) {
      storageLimitBytes = profile.custom_storage_cap;
    }

    return {
      planKey,
      planLabel: plan.label,
      subscriptionStatus: profile?.subscription_status || 'active',
      plan,
      featureFlags: {
        ...(TEMP_ENABLE_ALL_FEATURES ? ALL_FEATURE_FLAGS : plan.feature_flags),
        storage_add_on: plan.feature_flags.storage_add_on && activeFramework.storage_add_on.enabled,
      },
      limits: {
        ...plan.limits,
        storage_limit_bytes: storageLimitBytes,
      },
      storageLimitBytes,
      storageAddOnBytes,
      storageAddOnQuantity: allowedAddOns,
    };
  },

  isFeatureEnabled: (
    feature: PlanFeatureKey,
    profile?: BusinessPlanProfile | ResolvedBusinessPlan | null,
    framework?: BillingFramework | null
  ) => {
    const resolved = profile && 'featureFlags' in profile
      ? profile
      : planConfigService.resolveBusinessPlan(profile as BusinessPlanProfile | null | undefined, framework);

    return resolved.featureFlags[feature];
  },
};
