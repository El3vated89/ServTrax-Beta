import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, ChevronRight, Clock, HardDrive, Route as RouteIcon } from 'lucide-react';
import { jobService, Job } from '../services/jobService';
import { routeService } from '../services/RouteService';
import { Route } from '../modules/routes/types';
import { storageService } from '../services/StorageService';
import { alertService } from '../services/alertService';
import { quoteService, Quote } from '../services/quoteService';

export default function Alerts() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [storageSummary, setStorageSummary] = useState({ used_bytes: 0, limit_bytes: 0 });

  useEffect(() => {
    const unsubscribeJobs = jobService.subscribeToJobs(setJobs);
    const unsubscribeRoutes = routeService.subscribeToRoutes(setRoutes);
    const unsubscribeQuotes = quoteService.subscribeToQuotes(setQuotes);

    const loadStorageSummary = async () => {
      const summary = await storageService.getUsageSummary();
      setStorageSummary({ used_bytes: summary.used_bytes, limit_bytes: summary.limit_bytes });
    };

    loadStorageSummary();

    return () => {
      unsubscribeJobs();
      unsubscribeRoutes();
      unsubscribeQuotes();
    };
  }, []);

  const alerts = useMemo(
    () => alertService.buildOperationalAlerts(jobs, routes, quotes, storageSummary),
    [jobs, quotes, routes, storageSummary]
  );

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Alerts</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Operational events that need action</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl">
          <Bell className="h-5 w-5" />
          <span className="text-sm font-black">{alerts.length}</span>
        </div>
      </header>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-[40px] p-16 border-2 border-dashed border-gray-200 text-center">
          <Bell className="h-10 w-10 text-gray-300 mx-auto mb-4" />
          <p className="text-xl font-black text-gray-900">No alerts right now</p>
          <p className="text-sm font-bold text-gray-400 mt-2">The system is clear at the moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              to={alert.link}
              state={alert.linkState}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  alert.severity === 'critical'
                    ? 'bg-red-50 text-red-600'
                    : alert.severity === 'warning'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-blue-50 text-blue-600'
                }`}>
                  {alert.id.includes('storage')
                    ? <HardDrive className="h-6 w-6" />
                    : alert.id.includes('route')
                      ? <RouteIcon className="h-6 w-6" />
                      : alert.id.includes('carryover') || alert.id.includes('overdue')
                        ? <AlertTriangle className="h-6 w-6" />
                        : <Clock className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900">{alert.title}</p>
                  <p className="text-sm font-bold text-gray-500 mt-2">{alert.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {alert.count != null && (
                  <span className="text-sm font-black text-gray-900">{alert.count}</span>
                )}
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
