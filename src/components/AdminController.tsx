import { useEffect, useMemo, useState } from 'react';
import { BarChart3, DollarSign, HardDrive, Shield, Users, Activity, AlertTriangle, Route as RouteIcon, ClipboardList, Save, Mail, Smartphone, BellRing, Flag } from 'lucide-react';
import { adminService, AdminMetrics } from '../services/adminService';
import { userProfileService } from '../services/userProfileService';
import { platformMessagingService, PlatformMessagingConfig } from '../services/platformMessagingService';
import { BillingFramework, BillingPlanDefinition, planConfigService } from '../services/planConfigService';
import { bugReportService, BugReport } from '../services/bugReportService';
import { savePipelineService } from '../services/savePipelineService';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatReportDate = (value: any) => {
  if (!value) return '';
  if (value?.toDate) return value.toDate().toLocaleString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
};

export default function AdminController() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [providerConfig, setProviderConfig] = useState<PlatformMessagingConfig>(platformMessagingService.getDefaultConfig());
  const [billingFramework, setBillingFramework] = useState<BillingFramework>(planConfigService.getDefaultFramework());
  const [isSavingProviders, setIsSavingProviders] = useState(false);
  const [isSavingPlans, setIsSavingPlans] = useState(false);
  const [savingBusinessOwnerId, setSavingBusinessOwnerId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = userProfileService.subscribeToCurrentUserProfile((profile) => {
      setIsAdmin(userProfileService.isPlatformAdmin(profile));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setMetrics(null);
      setBugReports([]);
      return;
    }

    const loadMetrics = async () => {
      const nextMetrics = await adminService.getMetrics();
      setMetrics(nextMetrics);
    };

    loadMetrics();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    return bugReportService.subscribeToAllBugReports(setBugReports);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setBillingFramework(planConfigService.getDefaultFramework());
      return;
    }

    planConfigService.ensureFramework();
    return planConfigService.subscribeToFramework(setBillingFramework);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setProviderConfig(platformMessagingService.getDefaultConfig());
      return;
    }

    platformMessagingService.ensureConfig();
    return platformMessagingService.subscribeToConfig(setProviderConfig);
  }, [isAdmin]);

  useEffect(() => {
    if (!saveMessage) return undefined;
    const timeout = window.setTimeout(() => setSaveMessage(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [saveMessage]);

  const activePlanList = useMemo(
    () => Object.entries(metrics?.activePlans || {}).sort((left, right) => right[1] - left[1]),
    [metrics]
  );

  const updatePlan = (planKey: BillingPlanDefinition['key'], updater: (plan: BillingPlanDefinition) => BillingPlanDefinition) => {
    setBillingFramework((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) => (plan.key === planKey ? updater(plan) : plan)),
    }));
  };

  const handleSaveProviders = async () => {
    const debugContext = {
      flow: 'admin-controller-save-providers',
      traceId: savePipelineService.createTraceId('admin-controller-save-providers'),
    };

    setIsSavingProviders(true);
    setErrorMessage(null);
    try {
      savePipelineService.log(debugContext, 'save_started');
      savePipelineService.log(debugContext, 'validation_passed');
      savePipelineService.log(debugContext, 'service_called', 'platformMessagingService.saveConfig');
      await savePipelineService.withTimeout(platformMessagingService.saveConfig(providerConfig, debugContext), {
        timeoutMessage: 'Saving the provider settings took too long. Please try again.',
        debugContext,
      });
      setSaveMessage('Provider foundation saved');
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
    } catch (error) {
      console.error('Error saving provider foundation:', error);
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save provider foundation.');
    } finally {
      setIsSavingProviders(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  const handleSavePlans = async () => {
    const debugContext = {
      flow: 'admin-controller-save-plans',
      traceId: savePipelineService.createTraceId('admin-controller-save-plans'),
    };

    setIsSavingPlans(true);
    setErrorMessage(null);

    try {
      savePipelineService.log(debugContext, 'save_started');
      savePipelineService.log(debugContext, 'validation_passed');
      savePipelineService.log(debugContext, 'service_called', 'planConfigService.saveFramework');
      await savePipelineService.withTimeout(planConfigService.saveFramework(billingFramework, debugContext), {
        timeoutMessage: 'Saving the plan framework took too long. Please try again.',
        debugContext,
      });
      const nextMetrics = await savePipelineService.withTimeout(adminService.getMetrics(), {
        timeoutMessage: 'Timed out while refreshing controller metrics.',
        debugContext,
      });
      setMetrics(nextMetrics);
      setSaveMessage('Plan framework saved');
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
    } catch (error) {
      console.error('Error saving billing framework:', error);
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save plan framework.');
    } finally {
      setIsSavingPlans(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  const handleSaveBusinessPlan = async (ownerId: string, planKey: string, subscriptionStatus: string, storageAddOnQuantity: number) => {
    const debugContext = {
      flow: 'admin-controller-save-business-plan',
      traceId: savePipelineService.createTraceId(`admin-controller-save-business-plan-${ownerId}`),
    };

    setSavingBusinessOwnerId(ownerId);
    setErrorMessage(null);

    try {
      savePipelineService.log(debugContext, 'save_started');
      const selectedPlan = billingFramework.plans.find((plan) => plan.key === planKey) || billingFramework.plans[0];
      savePipelineService.log(debugContext, 'validation_passed');
      savePipelineService.log(debugContext, 'service_called', 'adminService.updateBusinessPlan');
      await savePipelineService.withTimeout(adminService.updateBusinessPlan(ownerId, {
        plan_key: selectedPlan.key,
        plan_name: selectedPlan.label,
        subscription_status: subscriptionStatus,
        storage_add_on_quantity: Math.max(0, storageAddOnQuantity),
      }, debugContext), {
        timeoutMessage: 'Saving the business plan took too long. Please try again.',
        debugContext,
      });

      const nextMetrics = await savePipelineService.withTimeout(adminService.getMetrics(), {
        timeoutMessage: 'Timed out while refreshing controller metrics.',
        debugContext,
      });
      setMetrics(nextMetrics);
      setSaveMessage(`Updated ${nextMetrics.businessPlans.find((entry) => entry.ownerId === ownerId)?.businessName || 'business'} plan`);
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
    } catch (error) {
      console.error('Error saving business plan:', error);
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save business plan.');
    } finally {
      setSavingBusinessOwnerId(null);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-16 text-center">
        <Shield className="h-10 w-10 text-gray-300 mx-auto mb-4" />
        <p className="text-xl font-black text-gray-900">Controller Access Restricted</p>
        <p className="text-sm font-bold text-gray-400 mt-2">This internal system is only available to platform admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">ServTrax Controller</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Internal platform operations dashboard</p>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4">
          <p className="text-sm font-bold text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <Users className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{metrics?.totalUsers || 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Users</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <BarChart3 className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{metrics?.activeBusinesses || 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Active Businesses</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <HardDrive className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{formatBytes(metrics?.totalStorageBytes || 0)}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">System Storage</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <Activity className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{metrics?.recentJobCount || 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Jobs Last 7 Days</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <ClipboardList className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{metrics?.totalRouteTemplates || 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Route Templates</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <RouteIcon className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{metrics?.totalRouteRuns || 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Route Runs</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <RouteIcon className="h-6 w-6 mb-4 text-green-600" />
          <p className="text-3xl font-black text-gray-900">{metrics?.activeRouteRunsToday || 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Active Runs Today</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <AlertTriangle className="h-6 w-6 mb-4 text-amber-600" />
          <p className="text-3xl font-black text-gray-900">{metrics?.routeRunsMissingCrewLabelToday || 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Runs Missing Crew Label</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <DollarSign className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-sm font-black text-gray-900 leading-tight">{metrics?.placeholders.platformRevenue || 'Placeholder'}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-4">Platform Revenue</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <Flag className="h-6 w-6 mb-4 text-red-500" />
          <p className="text-3xl font-black text-gray-900">{bugReports.filter((report) => report.status === 'open').length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Open Reports</p>
        </div>
      </div>

      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <Flag className="h-5 w-5 text-red-500" />
          <div>
            <h3 className="text-lg font-black text-gray-900">Bug Reports</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
              Temporary top-bar reports land here until the report flow moves into settings
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {bugReports.length === 0 ? (
            <p className="text-sm font-bold text-gray-400">No bug reports submitted yet.</p>
          ) : bugReports.map((report) => (
            <div key={report.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
              <div className="flex flex-col xl:flex-row gap-5">
                {report.screenshot_data_url && (
                  <a href={report.screenshot_data_url} target="_blank" rel="noreferrer" className="xl:w-56 shrink-0">
                    <img
                      src={report.screenshot_data_url}
                      alt="Bug report screenshot"
                      className="w-full rounded-2xl border border-gray-100 bg-white object-cover max-h-56"
                    />
                  </a>
                )}

                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                      report.status === 'resolved'
                        ? 'bg-green-100 text-green-700'
                        : report.status === 'reviewed'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {report.status}
                    </span>
                    <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-white text-gray-600 border border-gray-200">
                      {report.category.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {formatReportDate(report.created_at)}
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-black text-gray-900">{report.reporter_name || report.reporter_email}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{report.reporter_email}</p>
                  </div>

                  <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Page</p>
                    <p className="text-sm font-black text-gray-900 mt-2 break-all">{report.page_path}</p>
                  </div>

                  <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Details</p>
                    <p className="text-sm font-bold text-gray-700 mt-2 whitespace-pre-wrap">{report.details}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['open', 'reviewed', 'resolved'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => report.id && bugReportService.updateBugReportStatus(report.id, status)}
                        className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          report.status === status
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        Mark {status}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-black text-gray-900">Plan Framework</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
              One source of truth for pricing, limits, feature gates, and storage add-ons
            </p>
          </div>
          <button
            onClick={handleSavePlans}
            disabled={isSavingPlans}
            className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              isSavingPlans ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Save className="h-4 w-4" />
            {isSavingPlans ? 'Saving...' : 'Save Plan Framework'}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {billingFramework.plans.map((plan) => (
            <div key={plan.key} className="rounded-3xl border border-gray-100 bg-gray-50 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black text-gray-900">{plan.label}</p>
                  <p className="text-sm font-bold text-gray-500 mt-1">{plan.description}</p>
                </div>
                <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 border border-gray-200">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Active</span>
                  <input
                    type="checkbox"
                    checked={plan.active}
                    onChange={(event) => updatePlan(plan.key, (current) => ({ ...current, active: event.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Monthly Price</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.monthly_price}
                    onChange={(event) => updatePlan(plan.key, (current) => ({ ...current, monthly_price: Number(event.target.value || 0) }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Annual Price</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.annual_price}
                    onChange={(event) => updatePlan(plan.key, (current) => ({ ...current, annual_price: Number(event.target.value || 0) }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Storage (MB)</span>
                  <input
                    type="number"
                    min="0"
                    value={Math.round(plan.limits.storage_limit_bytes / (1024 * 1024))}
                    onChange={(event) => updatePlan(plan.key, (current) => ({
                      ...current,
                      limits: {
                        ...current.limits,
                        storage_limit_bytes: Number(event.target.value || 0) * 1024 * 1024,
                      },
                    }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Retention (Days)</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.limits.retention_days ?? 0}
                    onChange={(event) => updatePlan(plan.key, (current) => ({
                      ...current,
                      limits: {
                        ...current.limits,
                        retention_days: Number(event.target.value || 0),
                      },
                    }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Max Active Jobs</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.limits.max_active_jobs}
                    onChange={(event) => updatePlan(plan.key, (current) => ({
                      ...current,
                      limits: {
                        ...current.limits,
                        max_active_jobs: Number(event.target.value || 0),
                      },
                    }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Route Runs / Day</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.limits.max_route_runs_per_day}
                    onChange={(event) => updatePlan(plan.key, (current) => ({
                      ...current,
                      limits: {
                        ...current.limits,
                        max_route_runs_per_day: Number(event.target.value || 0),
                      },
                    }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">SMS / Month</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.limits.monthly_sms_limit}
                    onChange={(event) => updatePlan(plan.key, (current) => ({
                      ...current,
                      limits: {
                        ...current.limits,
                        monthly_sms_limit: Number(event.target.value || 0),
                      },
                    }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Email / Month</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.limits.monthly_email_limit}
                    onChange={(event) => updatePlan(plan.key, (current) => ({
                      ...current,
                      limits: {
                        ...current.limits,
                        monthly_email_limit: Number(event.target.value || 0),
                      },
                    }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Team Members</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.limits.max_team_members}
                    onChange={(event) => updatePlan(plan.key, (current) => ({
                      ...current,
                      limits: {
                        ...current.limits,
                        max_team_members: Number(event.target.value || 0),
                      },
                    }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ['customer_portal', 'Portal'],
                  ['persistent_portal', 'Persistent Portal'],
                  ['team_mode', 'Teams'],
                  ['storage_add_on', 'Storage Add-On'],
                  ['sms_delivery', 'SMS'],
                  ['email_delivery', 'Email'],
                ].map(([featureKey, label]) => (
                  <label key={featureKey} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                    <span className="text-sm font-black text-gray-900">{label}</span>
                    <input
                      type="checkbox"
                      checked={plan.feature_flags[featureKey as keyof BillingPlanDefinition['feature_flags']]}
                      onChange={(event) => updatePlan(plan.key, (current) => ({
                        ...current,
                        feature_flags: {
                          ...current.feature_flags,
                          [featureKey]: event.target.checked,
                        },
                      }))}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                ))}
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Effective Pricing</p>
                <p className="text-sm font-black text-gray-900 mt-2">
                  {formatCurrency(plan.monthly_price)} monthly / {formatCurrency(plan.annual_price)} annual
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-gray-100 bg-gray-50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-black text-gray-900">Storage Add-On</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                Global add-on increments that can be attached per business
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <span className="text-sm font-black text-gray-900">Enabled</span>
              <input
                type="checkbox"
                checked={billingFramework.storage_add_on.enabled}
                onChange={(event) => setBillingFramework((prev) => ({
                  ...prev,
                  storage_add_on: {
                    ...prev.storage_add_on,
                    enabled: event.target.checked,
                  },
                }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Increment (GB)</span>
              <input
                type="number"
                min="1"
                value={Math.max(1, Math.round(billingFramework.storage_add_on.increment_bytes / (1024 * 1024 * 1024)))}
                onChange={(event) => setBillingFramework((prev) => ({
                  ...prev,
                  storage_add_on: {
                    ...prev.storage_add_on,
                    increment_bytes: Number(event.target.value || 1) * 1024 * 1024 * 1024,
                  },
                }))}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Price / Increment</span>
              <input
                type="number"
                min="0"
                value={billingFramework.storage_add_on.price_per_increment}
                onChange={(event) => setBillingFramework((prev) => ({
                  ...prev,
                  storage_add_on: {
                    ...prev.storage_add_on,
                    price_per_increment: Number(event.target.value || 0),
                  },
                }))}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Max Increments</span>
              <input
                type="number"
                min="0"
                value={billingFramework.storage_add_on.max_increments}
                onChange={(event) => setBillingFramework((prev) => ({
                  ...prev,
                  storage_add_on: {
                    ...prev.storage_add_on,
                    max_increments: Number(event.target.value || 0),
                  },
                }))}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="text-lg font-black text-gray-900">Business Plans</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
              Upgrade, downgrade, pause, and attach storage add-ons without hardcoded limits
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {metrics?.businessPlans.length ? metrics.businessPlans.map((business) => (
            <div key={business.ownerId} className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_220px_220px_180px_160px] gap-4 items-end">
                <div>
                  <p className="text-sm font-black text-gray-900">{business.businessName}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                    {formatBytes(business.storageLimitBytes)} storage limit • {business.activeJobCount} active jobs • {business.todayRouteRuns} runs today
                  </p>
                </div>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Plan</span>
                  <select
                    value={business.planKey}
                    onChange={(event) => setMetrics((prev) => prev ? ({
                      ...prev,
                      businessPlans: prev.businessPlans.map((entry) => entry.ownerId === business.ownerId ? {
                        ...entry,
                        planKey: event.target.value,
                        planName: billingFramework.plans.find((plan) => plan.key === event.target.value)?.label || entry.planName,
                      } : entry),
                    }) : prev)}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {billingFramework.plans.filter((plan) => plan.active).map((plan) => (
                      <option key={plan.key} value={plan.key}>{plan.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Status</span>
                  <select
                    value={business.subscriptionStatus}
                    onChange={(event) => setMetrics((prev) => prev ? ({
                      ...prev,
                      businessPlans: prev.businessPlans.map((entry) => entry.ownerId === business.ownerId ? {
                        ...entry,
                        subscriptionStatus: event.target.value,
                      } : entry),
                    }) : prev)}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="trialing">Trialing</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past Due</option>
                    <option value="paused">Paused</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Storage Add-Ons</span>
                  <input
                    type="number"
                    min="0"
                    value={business.storageAddOnQuantity}
                    onChange={(event) => setMetrics((prev) => prev ? ({
                      ...prev,
                      businessPlans: prev.businessPlans.map((entry) => entry.ownerId === business.ownerId ? {
                        ...entry,
                        storageAddOnQuantity: Number(event.target.value || 0),
                      } : entry),
                    }) : prev)}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <button
                  onClick={() => handleSaveBusinessPlan(
                    business.ownerId,
                    business.planKey,
                    business.subscriptionStatus,
                    business.storageAddOnQuantity
                  )}
                  disabled={savingBusinessOwnerId === business.ownerId}
                  className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                    savingBusinessOwnerId === business.ownerId ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Save className="h-4 w-4" />
                  {savingBusinessOwnerId === business.ownerId ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )) : (
            <p className="text-sm font-bold text-gray-400">No business plans available yet.</p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-black text-gray-900 mb-6">Plan Distribution</h3>
          <div className="space-y-3">
            {activePlanList.length === 0 ? (
              <p className="text-sm font-bold text-gray-400">No plan data yet</p>
            ) : activePlanList.map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                <span className="text-sm font-black text-gray-900">{plan}</span>
                <span className="text-sm font-black text-blue-600">{count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-black text-gray-900 mb-6">User Directory</h3>
          <div className="space-y-3">
            {metrics?.users.length ? metrics.users.slice(0, 10).map((user) => (
              <div key={user.uid} className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-gray-900">{user.name || user.email}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">{user.role}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{user.active ? 'Active' : 'Inactive'}</p>
                  </div>
                </div>
              </div>
            )) : <p className="text-sm font-bold text-gray-400">No users found yet</p>}
          </div>
        </section>

        <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-black text-gray-900 mb-6">Top Storage Usage</h3>
          <div className="space-y-3">
            {metrics?.storageByBusiness.length ? metrics.storageByBusiness.map((entry) => (
              <div key={entry.ownerId} className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm font-black text-gray-900">{entry.businessName}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{formatBytes(entry.usedBytes)}</p>
              </div>
            )) : <p className="text-sm font-bold text-gray-400">No storage usage yet</p>}
          </div>
        </section>

        <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-black text-gray-900 mb-6">Recent Activity</h3>
          <div className="space-y-3">
            {metrics?.recentActivityByBusiness.length ? metrics.recentActivityByBusiness.map((entry) => (
              <div key={entry.ownerId} className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm font-black text-gray-900">{entry.businessName}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{entry.activityCount} job events in the last week</p>
              </div>
            )) : <p className="text-sm font-bold text-gray-400">No recent activity yet</p>}
          </div>
        </section>

        <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-black text-gray-900 mb-2">Route System Load</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">
            Activity and run health across businesses
          </p>
          <div className="space-y-3">
            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="text-sm font-black text-gray-900">Route activity last 7 days</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{metrics?.routeActivityLast7Days || 0} logged actions</p>
            </div>
            {metrics?.routeActivityByBusiness.length ? metrics.routeActivityByBusiness.map((entry) => (
              <div key={entry.ownerId} className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm font-black text-gray-900">{entry.businessName}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{entry.activityCount} route events in the last week</p>
              </div>
            )) : <p className="text-sm font-bold text-gray-400">No route activity logged yet</p>}
          </div>
        </section>

        <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-black text-gray-900 mb-2">Usage Tracking</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">
            Current month SMS, email, and storage usage by business
          </p>
          <div className="space-y-3">
            {metrics?.usageByBusiness.length ? metrics.usageByBusiness.map((entry) => (
              <div key={entry.ownerId} className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm font-black text-gray-900">{entry.businessName}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                  SMS {entry.smsUsed}/{entry.smsLimit || 0} • Email {entry.emailUsed}/{entry.emailLimit || 0}
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                  Storage {formatBytes(entry.storageUsedBytes)} / {formatBytes(entry.storageLimitBytes)}
                </p>
              </div>
            )) : <p className="text-sm font-bold text-gray-400">No usage data recorded yet</p>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900">Messaging Providers</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                Locked to {providerConfig.admin_email_lock}
              </p>
            </div>
            <button
              onClick={handleSaveProviders}
              disabled={isSavingProviders}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                isSavingProviders ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Save className="h-4 w-4" />
              {isSavingProviders ? 'Saving...' : 'Save Providers'}
            </button>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl bg-gray-50 border border-gray-100 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-black text-gray-900">SMS Provider</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Twilio Foundation</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Account SID</span>
                  <input
                    type="text"
                    value={providerConfig.twilio_account_sid}
                    onChange={(event) => setProviderConfig((prev) => ({ ...prev, twilio_account_sid: event.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="AC..."
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Messaging Service SID</span>
                  <input
                    type="text"
                    value={providerConfig.twilio_messaging_service_sid}
                    onChange={(event) => setProviderConfig((prev) => ({ ...prev, twilio_messaging_service_sid: event.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="MG..."
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">From Number</span>
                  <input
                    type="text"
                    value={providerConfig.twilio_from_number}
                    onChange={(event) => setProviderConfig((prev) => ({ ...prev, twilio_from_number: event.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+1..."
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-white border border-gray-200 px-4 py-3">
                  <span className="text-sm font-black text-gray-900">SMS notifications enabled</span>
                  <input
                    type="checkbox"
                    checked={providerConfig.sms_enabled}
                    onChange={(event) => setProviderConfig((prev) => ({ ...prev, sms_enabled: event.target.checked }))}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-gray-50 border border-gray-100 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-black text-gray-900">Email Provider</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">SendGrid Foundation</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">From Email</span>
                  <input
                    type="email"
                    value={providerConfig.sendgrid_from_email}
                    onChange={(event) => setProviderConfig((prev) => ({ ...prev, sendgrid_from_email: event.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="notifications@..."
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">From Name</span>
                  <input
                    type="text"
                    value={providerConfig.sendgrid_from_name}
                    onChange={(event) => setProviderConfig((prev) => ({ ...prev, sendgrid_from_name: event.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ServTrax"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-white border border-gray-200 px-4 py-3">
                  <span className="text-sm font-black text-gray-900">Email notifications enabled</span>
                  <input
                    type="checkbox"
                    checked={providerConfig.email_enabled}
                    onChange={(event) => setProviderConfig((prev) => ({ ...prev, email_enabled: event.target.checked }))}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-gray-50 border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-4">
                <BellRing className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-black text-gray-900">Notification Foundation</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">In-app + provider readiness</p>
                </div>
              </div>
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-white border border-gray-200 px-4 py-3 mb-4">
                <span className="text-sm font-black text-gray-900">In-app notifications enabled</span>
                <input
                  type="checkbox"
                  checked={providerConfig.in_app_notifications_enabled}
                  onChange={(event) => setProviderConfig((prev) => ({ ...prev, in_app_notifications_enabled: event.target.checked }))}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
              <p className="text-sm font-bold text-gray-500">{providerConfig.secret_storage_status}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-black text-gray-900">Stripe / Billing</h3>
          </div>
          <p className="text-sm font-bold text-gray-500">{metrics?.placeholders.stripeStatus}</p>
        </div>
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-black text-gray-900">Overages / Plan Controls</h3>
          </div>
          <p className="text-sm font-bold text-gray-500">{metrics?.placeholders.overageMonitoring}</p>
          <p className="text-sm font-bold text-gray-500 mt-3">{metrics?.placeholders.planAdjustments}</p>
        </div>
      </div>

      {saveMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
          <div className="rounded-2xl shadow-2xl px-5 py-4 bg-green-600 text-white flex items-center gap-3">
            <Save className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold">{saveMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
