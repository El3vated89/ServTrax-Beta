import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { jobService, Job } from '../services/jobService';
import { customerService, Customer } from '../services/customerService';
import { routeService } from '../services/RouteService';
import { Route } from '../modules/routes/types';
import { quoteService, Quote } from '../services/quoteService';
import { 
  AlertTriangle,
  ClipboardList, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  ChevronRight, 
  Users,
  Calendar,
  Route as RouteIcon,
  FileText
} from 'lucide-react';

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

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    const unsubscribeJobs = jobService.subscribeToJobs((data) => {
      setJobs(data);
    });
    const unsubscribeCustomers = customerService.subscribeToCustomers((data) => {
      setCustomers(data);
    });
    const unsubscribeRoutes = routeService.subscribeToRoutes(setRoutes);
    const unsubscribeQuotes = quoteService.subscribeToQuotes(setQuotes);
    return () => {
      unsubscribeJobs();
      unsubscribeCustomers();
      unsubscribeRoutes();
      unsubscribeQuotes();
    };
  }, []);

  const todayDate = startOfDay(new Date());
  const today = todayDate.toDateString();

  const jobsToday = jobs.filter(job => {
    const dueDate = toDate(job.next_due_date || job.scheduled_date);
    if (!dueDate) return false;
    return startOfDay(dueDate).toDateString() === today;
  });
  const completedToday = jobsToday.filter(job => job.status === 'completed').length;
  const pendingToday = jobsToday.filter(job => job.status === 'pending' || job.status === 'approved').length;
  const overdueJobs = jobs.filter(job => {
    if (['completed', 'canceled', 'quote'].includes(job.status)) return false;
    const dueDate = toDate(job.next_due_date || job.scheduled_date);
    return dueDate ? startOfDay(dueDate).getTime() < todayDate.getTime() : false;
  });
  const carryoverJobs = jobs.filter(job => ['skipped', 'delayed'].includes(job.status));
  const quotesAwaitingApproval = quotes.filter((quote) => quote.status === 'sent');
  const todayRoutes = routes.filter((route) => {
    const routeDate = toDate(route.route_date);
    return routeDate ? startOfDay(routeDate).getTime() === todayDate.getTime() : false;
  });
  const routeDraftCount = todayRoutes.filter((route) => route.status === 'draft').length;
  const routeActiveCount = todayRoutes.filter((route) => route.status === 'in_progress').length;
  
  // Calculate total unpaid amount for all jobs
  const toCollect = jobs.filter(job => job.payment_status === 'unpaid' && job.status === 'completed')
                        .reduce((sum, job) => sum + (job.price_snapshot || 0), 0);

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Track. Verify. Get Paid.</p>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Today is</p>
          <p className="text-sm font-bold text-gray-900">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </header>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Link to="/jobs" className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100 relative overflow-hidden group">
          <div className="relative z-10">
            <ClipboardList className="h-6 w-6 mb-4 text-blue-200" />
            <p className="text-3xl font-black">{jobsToday.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Due Today</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link to="/jobs" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-green-200 hover:shadow-md transition-all">
          <div className="relative z-10">
            <CheckCircle className="h-6 w-6 mb-4 text-green-500" />
            <p className="text-3xl font-black text-gray-900">{completedToday}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Completed</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-green-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link to="/jobs" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-orange-200 hover:shadow-md transition-all">
          <div className="relative z-10">
            <Clock className="h-6 w-6 mb-4 text-orange-500" />
            <p className="text-3xl font-black text-gray-900">{pendingToday}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pending</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-orange-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link to="/jobs" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-blue-200 hover:shadow-md transition-all">
          <div className="relative z-10">
            <DollarSign className="h-6 w-6 mb-4 text-blue-600" />
            <p className="text-3xl font-black text-gray-900">${toCollect.toFixed(0)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">To Collect</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link
          to="/routes"
          state={{ selectedDate: new Date().toISOString() }}
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-red-200 hover:shadow-md transition-all"
        >
          <div className="relative z-10">
            <AlertTriangle className="h-6 w-6 mb-4 text-red-500" />
            <p className="text-3xl font-black text-gray-900">{overdueJobs.length + carryoverJobs.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Needs Attention</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-red-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link
          to="/jobs"
          state={{ activeTab: 'quotes' }}
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-purple-200 hover:shadow-md transition-all"
        >
          <div className="relative z-10">
            <FileText className="h-6 w-6 mb-4 text-purple-600" />
            <p className="text-3xl font-black text-gray-900">{quotesAwaitingApproval.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Quotes Awaiting Approval</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-purple-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Today's Jobs */}
        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Today's Schedule
            </h3>
            <Link to="/jobs" className="text-xs font-bold text-blue-600 hover:underline">View All</Link>
          </div>
          <div className="space-y-3">
            {jobsToday.length === 0 ? (
              <div className="bg-gray-50 rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No jobs scheduled</p>
              </div>
            ) : (
              jobsToday.map(job => (
                <Link key={job.id} to="/jobs" state={{ viewingJobId: job.id }} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                      job.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {job.customer_name_snapshot.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{job.customer_name_snapshot}</p>
                      <p className="text-xs font-medium text-gray-500">{job.service_snapshot}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                      job.status === 'completed' ? 'bg-green-100 text-green-700' : 
                      job.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {job.status === 'pending' ? 'Pending' : job.status}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Route Status */}
        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <RouteIcon className="h-4 w-4 text-blue-600" />
              Route Status
            </h3>
            <Link to="/routes" state={{ selectedDate: new Date().toISOString() }} className="text-xs font-bold text-blue-600 hover:underline">Open Routes</Link>
          </div>
          <div className="space-y-3">
            <Link to="/routes" state={{ selectedDate: new Date().toISOString() }} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <RouteIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Draft Route Runs</p>
                  <p className="text-xs font-medium text-gray-500">Runs generated but not started</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider bg-blue-100 text-blue-700">{routeDraftCount}</span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>
            <Link to="/map" state={{ selectedRouteDate: new Date().toISOString() }} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                  <RouteIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Active Route Runs</p>
                  <p className="text-xs font-medium text-gray-500">Runs currently in progress today</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider bg-green-100 text-green-700">{routeActiveCount}</span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>
            <Link to="/routes" state={{ selectedDate: new Date().toISOString() }} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-50 text-gray-600 flex items-center justify-center">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Same-Day Runs</p>
                  <p className="text-xs font-medium text-gray-500">Separate route links available for today</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider bg-gray-100 text-gray-700">{todayRoutes.length}</span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>
          </div>
        </section>

        {/* Needs Attention */}
        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Needs Attention
            </h3>
            <Link to="/routes" state={{ selectedDate: new Date().toISOString() }} className="text-xs font-bold text-blue-600 hover:underline">Open Planner</Link>
          </div>
          <div className="space-y-3">
            {[...overdueJobs, ...carryoverJobs].length === 0 ? (
              <div className="bg-gray-50 rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Nothing overdue or carried over</p>
              </div>
            ) : (
              [...overdueJobs, ...carryoverJobs].slice(0, 5).map(job => (
                <Link key={job.id} to="/routes" state={{ selectedDate: new Date().toISOString() }} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-colors ${
                      job.status === 'delayed' || job.status === 'skipped'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {job.customer_name_snapshot.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{job.customer_name_snapshot}</p>
                      <p className="text-xs font-medium text-gray-500 line-clamp-1">{job.service_snapshot}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                      job.status === 'delayed' || job.status === 'skipped'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {job.status === 'delayed' || job.status === 'skipped' ? 'Carryover' : 'Overdue'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      <footer className="pt-12 text-center">
        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">Powered by ServTrax Velocity</p>
      </footer>
    </div>
  );
}
