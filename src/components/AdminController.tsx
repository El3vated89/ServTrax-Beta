import { useEffect, useMemo, useState } from 'react';
import { BarChart3, DollarSign, HardDrive, Shield, Users, Activity, AlertTriangle } from 'lucide-react';
import { adminService, AdminMetrics } from '../services/adminService';
import { userProfileService } from '../services/userProfileService';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

export default function AdminController() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = userProfileService.subscribeToCurrentUserProfile((profile) => {
      setIsAdmin(userProfileService.isPlatformAdmin(profile));
    });

    const loadMetrics = async () => {
      const nextMetrics = await adminService.getMetrics();
      setMetrics(nextMetrics);
    };

    loadMetrics();

    return () => unsubscribe();
  }, []);

  const activePlanList = useMemo(
    () => Object.entries(metrics?.activePlans || {}).sort((left, right) => right[1] - left[1]),
    [metrics]
  );

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

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
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
          <DollarSign className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-sm font-black text-gray-900 leading-tight">{metrics?.placeholders.platformRevenue || 'Placeholder'}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-4">Platform Revenue</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    </div>
  );
}
