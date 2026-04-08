import { useEffect, useMemo, useState } from 'react';
import { BarChart3, DollarSign, HardDrive, Shield, Users, Activity, AlertTriangle, Route as RouteIcon, ClipboardList, Save, Mail, Smartphone, BellRing } from 'lucide-react';
import { adminService, AdminMetrics } from '../services/adminService';
import { userProfileService } from '../services/userProfileService';
import { platformMessagingService, PlatformMessagingConfig } from '../services/platformMessagingService';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

export default function AdminController() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [providerConfig, setProviderConfig] = useState<PlatformMessagingConfig>(platformMessagingService.getDefaultConfig());
  const [isSavingProviders, setIsSavingProviders] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = userProfileService.subscribeToCurrentUserProfile((profile) => {
      setIsAdmin(userProfileService.isPlatformAdmin(profile));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setMetrics(null);
      return;
    }

    const loadMetrics = async () => {
      const nextMetrics = await adminService.getMetrics();
      setMetrics(nextMetrics);
    };

    loadMetrics();
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

  const handleSaveProviders = async () => {
    setIsSavingProviders(true);
    try {
      await platformMessagingService.saveConfig(providerConfig);
      setSaveMessage('Provider foundation saved');
    } finally {
      setIsSavingProviders(false);
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
      </div>

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
