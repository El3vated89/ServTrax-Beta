import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { jobService, Job } from '../services/jobService';
import { customerService, Customer } from '../services/customerService';
import { 
  ClipboardList, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  ChevronRight, 
  Users,
  Calendar
} from 'lucide-react';

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    const unsubscribeJobs = jobService.subscribeToJobs((data) => {
      setJobs(data);
    });
    const unsubscribeCustomers = customerService.subscribeToCustomers((data) => {
      setCustomers(data);
    });
    return () => {
      unsubscribeJobs();
      unsubscribeCustomers();
    };
  }, []);

  const today = new Date().toDateString();
  
  const jobsToday = jobs.filter(job => {
    if (!job.scheduled_date) return false;
    return new Date(job.scheduled_date).toDateString() === today;
  });
  const completedToday = jobsToday.filter(job => job.status === 'completed').length;
  const pendingToday = jobsToday.filter(job => job.status === 'pending' || job.status === 'approved').length;
  
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100 relative overflow-hidden group">
          <div className="relative z-10">
            <ClipboardList className="h-6 w-6 mb-4 text-blue-200" />
            <p className="text-3xl font-black">{jobsToday.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Jobs Today</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <CheckCircle className="h-6 w-6 mb-4 text-green-500" />
            <p className="text-3xl font-black text-gray-900">{completedToday}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Completed</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-green-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <Clock className="h-6 w-6 mb-4 text-orange-500" />
            <p className="text-3xl font-black text-gray-900">{pendingToday}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pending</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-orange-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <DollarSign className="h-6 w-6 mb-4 text-blue-600" />
            <p className="text-3xl font-black text-gray-900">${toCollect.toFixed(0)}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">To Collect</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

        {/* Recent Customers */}
        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Recent Clients
            </h3>
            <Link to="/customers" className="text-xs font-bold text-blue-600 hover:underline">View All</Link>
          </div>
          <div className="space-y-3">
            {customers.length === 0 ? (
              <div className="bg-gray-50 rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No clients added</p>
              </div>
            ) : (
              customers.slice(0, 5).map(customer => (
                <Link key={customer.id} to="/customers" state={{ editingCustomerId: customer.id }} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center font-bold text-lg text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{customer.name}</p>
                      <p className="text-xs font-medium text-gray-500 line-clamp-1">{[customer.street, customer.city].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-600 transition-colors" />
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
