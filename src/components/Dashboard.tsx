import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp, doc, onSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  Receipt,
  Route as RouteIcon,
  Users,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { jobService, Job } from '../services/jobService';
import { routeService } from '../services/RouteService';
import { Route, RouteStop } from '../modules/routes/types';
import { quoteService, Quote } from '../services/quoteService';
import { billingService, BillingRecord, PaymentEntry } from '../services/billingService';
import { expenseService, ExpenseRecord } from '../services/expenseService';
import { planConfigService, BillingFramework, BusinessPlanProfile } from '../services/planConfigService';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

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

const isSameMonth = (value: any, reference: Date) => {
  const parsed = toDate(value);
  if (!parsed) return false;
  return parsed.getFullYear() === reference.getFullYear() && parsed.getMonth() === reference.getMonth();
};

const formatCurrency = (amount: number) => currencyFormatter.format(Number.isFinite(amount) ? amount : 0);

type AttentionItem = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeClassName: string;
  iconClassName: string;
  to: string;
  state?: Record<string, unknown>;
};

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessPlanProfile | null>(null);
  const [billingFramework, setBillingFramework] = useState<BillingFramework | null>(null);

  useEffect(() => {
    const unsubscribeJobs = jobService.subscribeToJobs((data) => {
      setJobs(data);
    });
    const unsubscribeRoutes = routeService.subscribeToRoutes(setRoutes);
    const unsubscribeRouteStops = routeService.subscribeToAllRouteStops(setRouteStops);
    const unsubscribeQuotes = quoteService.subscribeToQuotes(setQuotes);
    const unsubscribeBilling = billingService.subscribeToBillingRecords(setBillingRecords);
    const unsubscribePayments = billingService.subscribeToPaymentEntries(setPaymentEntries);
    const unsubscribeExpenses = expenseService.subscribeToExpenses(setExpenses);
    const unsubscribeFramework = planConfigService.subscribeToFramework(setBillingFramework);

    let unsubscribeBusinessProfile = () => {};
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeBusinessProfile();

      if (!user) {
        setBusinessProfile(null);
        return;
      }

      unsubscribeBusinessProfile = onSnapshot(doc(db, 'business_profiles', user.uid), (snapshot) => {
        setBusinessProfile(snapshot.exists() ? (snapshot.data() as BusinessPlanProfile) : null);
      });
    });

    return () => {
      unsubscribeJobs();
      unsubscribeRoutes();
      unsubscribeRouteStops();
      unsubscribeQuotes();
      unsubscribeBilling();
      unsubscribePayments();
      unsubscribeExpenses();
      unsubscribeFramework();
      unsubscribeBusinessProfile();
      unsubscribeAuth();
    };
  }, []);

  const resolvedPlan = useMemo(
    () => planConfigService.resolveBusinessPlan(businessProfile, billingFramework),
    [businessProfile, billingFramework]
  );
  const isTeamMode = resolvedPlan.featureFlags.team_mode;

  const todayDate = startOfDay(new Date());
  const today = todayDate.toDateString();

  const jobsToday = jobs.filter((job) => {
    const dueDate = toDate(job.next_due_date || job.scheduled_date);
    if (!dueDate) return false;
    return startOfDay(dueDate).toDateString() === today;
  });
  const completedToday = jobsToday.filter((job) => job.status === 'completed').length;
  const overdueJobs = jobs.filter((job) => {
    if (['completed', 'canceled', 'quote'].includes(job.status)) return false;
    const dueDate = toDate(job.next_due_date || job.scheduled_date);
    return dueDate ? startOfDay(dueDate).getTime() < todayDate.getTime() : false;
  });
  const carryoverJobs = jobs.filter((job) => ['skipped', 'delayed'].includes(job.status));
  const quotesAwaitingApproval = quotes.filter((quote) => quote.status === 'sent');

  const todayRoutes = routes.filter((route) => {
    const routeDate = toDate(route.route_date);
    return routeDate ? startOfDay(routeDate).getTime() === todayDate.getTime() : false;
  });
  const todayRouteIds = new Set(todayRoutes.map((route) => route.id).filter(Boolean));
  const assignedTodayJobIds = new Set(
    routeStops
      .filter((stop) => stop.route_id && todayRouteIds.has(stop.route_id))
      .map((stop) => stop.job_id)
      .filter(Boolean)
  );
  const needsPlacementJobs = jobs.filter((job) => {
    if (!job.id || ['completed', 'canceled', 'quote'].includes(job.status)) return false;
    const dueDate = toDate(job.next_due_date || job.scheduled_date);
    const isDueNow = dueDate ? startOfDay(dueDate).getTime() <= todayDate.getTime() : false;
    const isCarryover = ['skipped', 'delayed'].includes(job.status);
    return (isDueNow || isCarryover) && !assignedTodayJobIds.has(job.id);
  });
  const routeDraftCount = todayRoutes.filter((route) => route.status === 'draft').length;
  const routeActiveCount = todayRoutes.filter((route) => route.status === 'in_progress').length;

  const openBilling = billingRecords.filter((record) => ['due', 'partial', 'overdue'].includes(record.status));
  const overdueBilling = billingRecords.filter((record) => record.status === 'overdue');
  const toCollect = openBilling.reduce((sum, record) => sum + Number(record.balance_due || 0), 0);
  const collectedThisMonth = paymentEntries
    .filter((entry) => isSameMonth(entry.received_at, todayDate))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const expensesThisMonth = expenses
    .filter((entry) => isSameMonth(entry.expense_date, todayDate))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const attentionItems: AttentionItem[] = [
    ...overdueJobs.slice(0, 2).map((job) => ({
      id: `job-overdue-${job.id}`,
      title: job.customer_name_snapshot,
      subtitle: job.service_snapshot,
      badge: 'Overdue Job',
      badgeClassName: 'bg-red-100 text-red-700',
      iconClassName: 'bg-red-50 text-red-600',
      to: '/jobs',
      state: { activeTab: 'due', viewingJobId: job.id },
    })),
    ...carryoverJobs.slice(0, 2).map((job) => ({
      id: `job-carryover-${job.id}`,
      title: job.customer_name_snapshot,
      subtitle: job.service_snapshot,
      badge: 'Carryover',
      badgeClassName: 'bg-amber-100 text-amber-700',
      iconClassName: 'bg-amber-50 text-amber-600',
      to: '/jobs',
      state: { activeTab: 'due', viewingJobId: job.id },
    })),
    ...overdueBilling.slice(0, 2).map((record) => ({
      id: `billing-overdue-${record.id}`,
      title: record.customer_name_snapshot,
      subtitle: record.label,
      badge: 'Billing Overdue',
      badgeClassName: 'bg-red-100 text-red-700',
      iconClassName: 'bg-red-50 text-red-600',
      to: '/billing',
    })),
    ...quotesAwaitingApproval.slice(0, 2).map((quote) => ({
      id: `quote-${quote.id}`,
      title: quote.customer_name_snapshot,
      subtitle: quote.service_snapshot || 'Quote awaiting approval',
      badge: 'Quote Pending',
      badgeClassName: 'bg-purple-100 text-purple-700',
      iconClassName: 'bg-purple-50 text-purple-600',
      to: '/jobs',
      state: { activeTab: 'quotes', viewingJobId: quote.id },
    })),
    ...(isTeamMode && needsPlacementJobs.length > 0
      ? [
          {
            id: 'route-placement',
            title: `${needsPlacementJobs.length} jobs still need a route`,
            subtitle: 'Today has due work waiting on route placement',
            badge: 'Needs Placement',
            badgeClassName: 'bg-blue-100 text-blue-700',
            iconClassName: 'bg-blue-50 text-blue-600',
            to: '/routes',
            state: { selectedDate: new Date().toISOString() },
          },
        ]
      : []),
  ].slice(0, 5);

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Track. Verify. Get Paid.</p>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Today is</p>
          <p className="text-sm font-bold text-gray-900">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Link to="/jobs" className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100 relative overflow-hidden group">
          <div className="relative z-10">
            <ClipboardList className="h-6 w-6 mb-4 text-blue-200" />
            <p className="text-3xl font-black">{jobsToday.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Due Today</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link to="/billing" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-blue-200 hover:shadow-md transition-all">
          <div className="relative z-10">
            <DollarSign className="h-6 w-6 mb-4 text-blue-600" />
            <p className="text-3xl font-black text-gray-900">{formatCurrency(toCollect)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Money Due</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link to="/billing" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-green-200 hover:shadow-md transition-all">
          <div className="relative z-10">
            <CheckCircle className="h-6 w-6 mb-4 text-green-500" />
            <p className="text-3xl font-black text-gray-900">{formatCurrency(collectedThisMonth)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Money In</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-green-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link to="/expenses" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-orange-200 hover:shadow-md transition-all">
          <div className="relative z-10">
            <Receipt className="h-6 w-6 mb-4 text-orange-500" />
            <p className="text-3xl font-black text-gray-900">{formatCurrency(expensesThisMonth)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Expenses</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-orange-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </Link>

        <Link to="/jobs" state={{ activeTab: 'due' }} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-red-200 hover:shadow-md transition-all">
          <div className="relative z-10">
            <AlertTriangle className="h-6 w-6 mb-4 text-red-500" />
            <p className="text-3xl font-black text-gray-900">{overdueJobs.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Overdue Jobs</p>
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
        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Today&apos;s Schedule
            </h3>
            <Link to="/jobs" className="text-xs font-bold text-blue-600 hover:underline">View All</Link>
          </div>
          <div className="space-y-3">
            {jobsToday.length === 0 ? (
              <div className="bg-gray-50 rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No jobs scheduled</p>
              </div>
            ) : (
              jobsToday.map((job) => (
                <Link
                  key={job.id}
                  to="/jobs"
                  state={{ viewingJobId: job.id }}
                  className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group"
                >
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
                      job.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : job.status === 'approved'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-orange-100 text-orange-700'
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

        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-600" />
              Billing Snapshot
            </h3>
            <Link to="/billing" className="text-xs font-bold text-blue-600 hover:underline">Open Billing</Link>
          </div>
          <div className="space-y-3">
            <Link to="/billing" className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
              <div>
                <p className="text-sm font-bold text-gray-900">Outstanding Billing</p>
                <p className="text-xs font-medium text-gray-500">Open balances still waiting to be collected</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-blue-600">{formatCurrency(toCollect)}</span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>

            <Link to="/billing" className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
              <div>
                <p className="text-sm font-bold text-gray-900">Money In This Month</p>
                <p className="text-xs font-medium text-gray-500">Payments received this month</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-green-600">{formatCurrency(collectedThisMonth)}</span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>

            <Link to="/expenses" className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
              <div>
                <p className="text-sm font-bold text-gray-900">Expenses This Month</p>
                <p className="text-xs font-medium text-gray-500">Operating costs logged this month</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-orange-600">{formatCurrency(expensesThisMonth)}</span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>

            <Link to="/billing" className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
              <div>
                <p className="text-sm font-bold text-gray-900">Overdue Billing Records</p>
                <p className="text-xs font-medium text-gray-500">Customers with billing already past due</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider bg-red-100 text-red-700">
                  {overdueBilling.length}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Needs Attention
            </h3>
            <Link to="/alerts" className="text-xs font-bold text-blue-600 hover:underline">Open Alerts</Link>
          </div>
          <div className="space-y-3">
            {attentionItems.length === 0 ? (
              <div className="bg-gray-50 rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Nothing urgent right now</p>
              </div>
            ) : (
              attentionItems.map((item) => (
                <Link key={item.id} to={item.to} state={item.state} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${item.iconClassName}`}>
                      {item.title.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{item.title}</p>
                      <p className="text-xs font-medium text-gray-500 line-clamp-1">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${item.badgeClassName}`}>
                      {item.badge}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {isTeamMode && (
        <section className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <RouteIcon className="h-4 w-4 text-blue-600" />
              Route Status
            </h3>
            <Link to="/routes" state={{ selectedDate: new Date().toISOString() }} className="text-xs font-bold text-blue-600 hover:underline">
              Open Routes
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
      )}

      <footer className="pt-12 text-center">
        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">Powered by ServTrax Velocity</p>
      </footer>
    </div>
  );
}
