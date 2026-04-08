import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, ClipboardList, Wrench, Menu, Bell, LogOut, Settings as SettingsIcon, X, Search, Map, Plus, Camera, MessageSquare, HardDrive, Route as RouteIcon, User as UserIcon, Shield, CreditCard, Receipt, Package, Flag, CheckCircle, AlertCircle } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import PhotoCaptureFlow from './PhotoCaptureFlow';
import { jobService, Job } from '../services/jobService';
import { routeService } from '../services/RouteService';
import { Route, RouteStop } from '../modules/routes/types';
import { storageService } from '../services/StorageService';
import { alertService } from '../services/alertService';
import { userProfileService } from '../services/userProfileService';
import { quoteService, Quote } from '../services/quoteService';
import { bugReportService, BugReportCategory } from '../services/bugReportService';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isPhotoCaptureOpen, setIsPhotoCaptureOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [reportCategory, setReportCategory] = useState<BugReportCategory>('ui_layout');
  const [reportDetails, setReportDetails] = useState('');
  const [reportScreenshotDataUrl, setReportScreenshotDataUrl] = useState('');
  const [reportScreenshotContentType, setReportScreenshotContentType] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportErrorMessage, setReportErrorMessage] = useState<string | null>(null);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  
  const defaultBottomNavItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/jobs', icon: ClipboardList, label: 'Jobs' },
    { path: '/customers', icon: Users, label: 'Clients' },
    { path: '/routes', icon: RouteIcon, label: 'Routes' },
  ];

  const defaultMenuItems = [
    { path: '/map', icon: Map, label: 'Daily Route' },
    { path: '/profile', icon: UserIcon, label: 'Profile' },
    { path: '/equip', icon: Wrench, label: 'Equipment' },
    { path: '/messaging', icon: MessageSquare, label: 'Messaging' },
    { path: '/billing', icon: CreditCard, label: 'Billing' },
    { path: '/expenses', icon: Receipt, label: 'Expenses' },
    { path: '/supplies', icon: Package, label: 'Supplies' },
    { path: '/storage', icon: HardDrive, label: 'Storage' },
    { path: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];

  useEffect(() => {
    let latestJobs: Job[] = [];
    let latestRoutes: Route[] = [];
    let latestRouteStops: RouteStop[] = [];
    let latestQuotes: Quote[] = [];
    let latestStorage = { used_bytes: 0, limit_bytes: 0 };

    const recomputeAlerts = () => {
      setAlertCount(alertService.buildOperationalAlerts(latestJobs, latestRoutes, latestRouteStops, latestQuotes, latestStorage).length);
    };

    const unsubscribeJobs = jobService.subscribeToJobs((jobs) => {
      latestJobs = jobs;
      recomputeAlerts();
    });

    const unsubscribeRoutes = routeService.subscribeToRoutes((routes) => {
      latestRoutes = routes;
      recomputeAlerts();
    });

    const unsubscribeRouteStops = routeService.subscribeToAllRouteStops((routeStops) => {
      latestRouteStops = routeStops;
      recomputeAlerts();
    });

    const unsubscribeQuotes = quoteService.subscribeToQuotes((quotes) => {
      latestQuotes = quotes;
      recomputeAlerts();
    });

    const unsubscribeProfile = userProfileService.subscribeToCurrentUserProfile((profile) => {
      setProfile(profile);
      setIsPlatformAdmin(userProfileService.isPlatformAdmin(profile));
    });

    const loadStorageSummary = async () => {
      const summary = await storageService.getUsageSummary();
      latestStorage = { used_bytes: summary.used_bytes, limit_bytes: summary.limit_bytes };
      recomputeAlerts();
    };

    loadStorageSummary();

    return () => {
      unsubscribeJobs();
      unsubscribeRoutes();
      unsubscribeRouteStops();
      unsubscribeQuotes();
      unsubscribeProfile();
    };
  }, []);

  useEffect(() => {
    if (!reportSuccessMessage) return undefined;
    const timeout = window.setTimeout(() => setReportSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [reportSuccessMessage]);

  const isStaff = profile?.role === 'staff';
  const canAccessRoutes = userProfileService.hasPermission(profile, 'route_access');
  const canAccessCustomers = userProfileService.hasPermission(profile, 'customer_access');
  const canAccessJobs = userProfileService.hasPermission(profile, 'job_interaction_access');
  const canAccessExpenses = userProfileService.hasPermission(profile, 'expense_entry_access');

  const bottomNavItems = isStaff
    ? [
        ...(canAccessJobs ? [{ path: '/jobs', icon: ClipboardList, label: 'Jobs' }] : []),
        ...(canAccessCustomers ? [{ path: '/customers', icon: Users, label: 'Clients' }] : []),
        ...(canAccessRoutes ? [{ path: '/map', icon: RouteIcon, label: 'Routes' }] : []),
        { path: '/profile', icon: UserIcon, label: 'Profile' },
      ]
    : defaultBottomNavItems;

  const menuItems = isStaff
    ? [
        ...(canAccessRoutes ? [{ path: '/map', icon: Map, label: 'Daily Route' }] : []),
        ...(canAccessExpenses ? [{ path: '/expenses', icon: Receipt, label: 'Expenses' }] : []),
        { path: '/profile', icon: UserIcon, label: 'Profile' },
      ]
    : defaultMenuItems;

  const allMenuItems = isPlatformAdmin
    ? [...menuItems, { path: '/controller', icon: Shield, label: 'Controller' }]
    : menuItems;
  const sidebarItems = [...bottomNavItems, ...allMenuItems].filter(
    (item, index, items) => items.findIndex((entry) => entry.path === item.path) === index
  );

  useEffect(() => {
    if (!isStaff) return;

    const allowedPaths = new Set<string>(['/profile']);
    if (canAccessRoutes) {
      allowedPaths.add('/map');
      allowedPaths.add('/routes');
    }
    if (canAccessJobs) allowedPaths.add('/jobs');
    if (canAccessCustomers) allowedPaths.add('/customers');
    if (canAccessExpenses) allowedPaths.add('/expenses');

    if (!allowedPaths.has(location.pathname)) {
      navigate(canAccessRoutes ? '/map' : canAccessExpenses ? '/expenses' : '/profile', { replace: true });
    }
  }, [isStaff, canAccessRoutes, canAccessJobs, canAccessCustomers, canAccessExpenses, location.pathname, navigate]);

  const handleSignOut = () => {
    signOut(auth);
  };

  const resetReportForm = () => {
    setIsReportModalOpen(false);
    setReportCategory('ui_layout');
    setReportDetails('');
    setReportScreenshotDataUrl('');
    setReportScreenshotContentType('');
    setReportErrorMessage(null);
    setIsSubmittingReport(false);
  };

  const handleReportScreenshotChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const preparedScreenshot = await bugReportService.prepareScreenshot(file);
      setReportScreenshotDataUrl(preparedScreenshot);
      setReportScreenshotContentType(file.type || 'image/jpeg');
      setReportErrorMessage(null);
    } catch (error) {
      console.error('Error preparing screenshot:', error);
      setReportErrorMessage('Failed to prepare screenshot.');
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportDetails.trim()) {
      setReportErrorMessage('Add the problem details before sending the report.');
      return;
    }

    setIsSubmittingReport(true);
    setReportErrorMessage(null);

    try {
      await bugReportService.createBugReport({
        reporter_name: profile?.name || auth.currentUser?.displayName || '',
        category: reportCategory,
        details: reportDetails,
        page_path: `${location.pathname}${location.search || ''}`,
        current_url: window.location.href,
        screenshot_data_url: reportScreenshotDataUrl || undefined,
        screenshot_content_type: reportScreenshotContentType || undefined,
      });

      resetReportForm();
      setReportSuccessMessage('Report saved to controller');
    } catch (error) {
      console.error('Error submitting report:', error);
      setReportErrorMessage('Failed to save report.');
      setIsSubmittingReport(false);
    }
  };

  const closeMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 sm:pb-0">
      {/* Desktop Sidebar (Hidden on mobile) */}
      <aside className="hidden sm:flex flex-col w-64 fixed inset-y-0 bg-white border-r border-gray-100 z-50">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <ClipboardList className="text-white h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tighter leading-none">ServTrax</h1>
              <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest leading-none mt-1">Velocity</p>
            </div>
          </div>

          <nav className="space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                    isActive 
                      ? 'bg-blue-50 text-blue-600 shadow-sm' 
                      : 'text-gray-400 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-8 border-t border-gray-50">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all w-full"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="sm:pl-64 min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="flex justify-between h-20 items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 text-gray-500 sm:hidden hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="hidden sm:flex items-center bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100 w-64 group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                  <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-500" />
                  <input 
                    type="text" 
                    placeholder="Search anything..." 
                    className="bg-transparent border-none focus:ring-0 text-sm font-medium ml-2 w-full placeholder:text-gray-300"
                  />
                </div>
                <h1 className="text-xl font-black text-gray-900 sm:hidden">ServTrax</h1>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setReportErrorMessage(null);
                    setIsReportModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                >
                  <Flag className="h-5 w-5" />
                  <span className="hidden sm:inline text-xs font-black uppercase tracking-widest">Report</span>
                </button>
                <Link to="/alerts" className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all relative">
                  <Bell className="h-6 w-6" />
                  {alertCount > 0 && (
                    <span className="absolute top-2 right-2 min-w-5 h-5 px-1 bg-red-500 rounded-full border-2 border-white text-[10px] text-white font-black flex items-center justify-center">
                      {alertCount}
                    </span>
                  )}
                </Link>
                <Link to="/profile" className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center text-white font-black text-sm">
                  TM
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Side Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[60] sm:hidden">
            <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={closeMenu}></div>
            <div className="fixed inset-y-0 left-0 flex flex-col w-72 bg-white shadow-2xl">
              <div className="flex items-center justify-between h-20 px-6 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <ClipboardList className="text-white h-5 w-5" />
                  </div>
                  <span className="text-lg font-black text-gray-900 tracking-tight">ServTrax</span>
                </div>
                <button onClick={closeMenu} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-6 px-4">
                <nav className="space-y-2">
                  {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={closeMenu}
                        className={`flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-bold transition-all ${
                          isActive 
                            ? 'bg-blue-50 text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className={`h-6 w-6 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
              <div className="p-6 border-t border-gray-100">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-bold text-red-500 hover:bg-red-50 transition-all w-full"
                >
                  <LogOut className="h-6 w-6" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
          <Outlet />
        </main>

        {isPhotoCaptureOpen && (
          <PhotoCaptureFlow onClose={() => setIsPhotoCaptureOpen(false)} />
        )}

        {isReportModalOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/50 p-4">
            <div className="bg-white rounded-[32px] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div>
                  <h3 className="text-xl font-black text-gray-900">Send Report</h3>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">
                    Temporary top-bar report flow
                  </p>
                </div>
                <button onClick={resetReportForm} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmitReport} className="p-8 space-y-6">
                {reportErrorMessage && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-bold text-red-700">{reportErrorMessage}</p>
                  </div>
                )}

                <div className="rounded-3xl bg-gray-50 border border-gray-100 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Current Page</p>
                  <p className="text-sm font-black text-gray-900 mt-2 break-all">{location.pathname || '/'}</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <label className="block">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Category</span>
                    <select
                      value={reportCategory}
                      onChange={(event) => setReportCategory(event.target.value as BugReportCategory)}
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {bugReportService.categories.map((category) => (
                        <option key={category.value} value={category.value}>{category.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">What&apos;s wrong?</span>
                    <textarea
                      value={reportDetails}
                      onChange={(event) => setReportDetails(event.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none min-h-[140px]"
                      placeholder="Describe the problem, what you expected, and what happened instead."
                    />
                  </label>

                  <label className="block">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Screenshot</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReportScreenshotChange}
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-3">
                      Optional. This gets attached to the controller report.
                    </p>
                  </label>

                  {reportScreenshotDataUrl && (
                    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Screenshot Preview</p>
                      <img
                        src={reportScreenshotDataUrl}
                        alt="Report screenshot preview"
                        className="w-full rounded-2xl border border-gray-100 bg-white object-contain max-h-72"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setReportScreenshotDataUrl('');
                          setReportScreenshotContentType('');
                        }}
                        className="px-4 py-2 rounded-2xl bg-white border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-600 hover:bg-gray-100 transition-all"
                      >
                        Remove Screenshot
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={resetReportForm}
                    className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReport}
                    className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                      isSubmittingReport ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <Flag className="h-4 w-4" />
                    {isSubmittingReport ? 'Sending...' : 'Send Report'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-6 left-6 right-6 bg-white/90 backdrop-blur-lg border border-gray-100 shadow-2xl rounded-3xl sm:hidden z-50 px-2 py-2">
          <div className="flex justify-around items-center relative">
            {/* Home & Jobs */}
            {bottomNavItems.slice(0, 2).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center py-2 px-3 rounded-2xl transition-all ${
                    isActive 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-400 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-[10px] mt-1 font-black uppercase tracking-tighter">{item.label}</span>
                </Link>
              );
            })}

            {/* Central Add Button */}
            <div className="relative -mt-12">
              {isAddMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[-1]" 
                    onClick={() => setIsAddMenuOpen(false)}
                  />
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-48 bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 space-y-1 animate-in fade-in slide-in-from-bottom-4 duration-200">
                    <Link 
                      to="/jobs" 
                      state={{ openAddModal: true }}
                      onClick={() => setIsAddMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <ClipboardList className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-bold">Create Quote</span>
                    </Link>
                    <Link 
                      to="/customers" 
                      state={{ openAddModal: true }}
                      onClick={() => setIsAddMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <Users className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-bold">Add Client</span>
                    </Link>
                    <button 
                      onClick={() => {
                        setIsAddMenuOpen(false);
                        setIsPhotoCaptureOpen(true);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors w-full text-left"
                    >
                      <Camera className="h-5 w-5 text-purple-600" />
                      <span className="text-sm font-bold">Take Photo</span>
                    </button>
                    <Link
                      to="/billing"
                      state={{ openPaymentModal: true }}
                      onClick={() => setIsAddMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <CreditCard className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-bold">Quick Payment</span>
                    </Link>
                    <Link
                      to="/expenses"
                      state={{ openAddExpense: true }}
                      onClick={() => setIsAddMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <Receipt className="h-5 w-5 text-amber-600" />
                      <span className="text-sm font-bold">Quick Expense</span>
                    </Link>
                  </div>
                </>
              )}
              <button
                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all transform ${
                  isAddMenuOpen ? 'bg-gray-900 rotate-45 scale-90' : 'bg-blue-600 hover:scale-105'
                } text-white`}
              >
                <Plus className="h-8 w-8" />
              </button>
            </div>

            {/* Clients & Map */}
            {bottomNavItems.slice(2).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center py-2 px-3 rounded-2xl transition-all ${
                    isActive 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-400 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-[10px] mt-1 font-black uppercase tracking-tighter">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {reportSuccessMessage && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
            <div className="rounded-2xl shadow-2xl px-5 py-4 bg-green-600 text-white flex items-center gap-3">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-bold">{reportSuccessMessage}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
