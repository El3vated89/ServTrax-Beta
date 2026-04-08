import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Map as MapIcon, 
  List, 
  Filter, 
  Settings, 
  MoreVertical, 
  ArrowUpDown, 
  Zap, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Search, 
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  GripVertical,
  X,
  Share2,
  Camera,
  Upload,
  ClipboardList,
  User,
  CreditCard
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { auth } from '../../firebase';
import { routeService } from '../../services/RouteService';
import { routeOptimizationService } from '../../services/RouteOptimizationService';
import { featureFlagService, FeatureFlags } from '../../services/featureFlagService';
import { jobService, Job } from '../../services/jobService';
import { customerService, Customer } from '../../services/customerService';
import { Route, RouteStop, RouteStatus, StopDueState, OptimizationMode, BaseCamp } from './types';
import { BASE_CAMP } from './constants';
import RouteMap from './components/RouteMap';
import RouteStopCard from './components/RouteStopCard';
import VerifyStopModal from './components/VerifyStopModal';
import { compressImage } from '../../utils/imageCompression';
import { Timestamp } from 'firebase/firestore';
import { getPublicOrigin } from '../../utils';

import { verificationService } from '../../services/verificationService';
import { renderProofMessage, templateService, MessageTemplate } from '../../services/templateService';

export default function ActiveRoutePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [flags] = useState<FeatureFlags>(featureFlagService.getFlags());
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [stopToVerify, setStopToVerify] = useState<RouteStop | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [baseCamp, setBaseCamp] = useState<BaseCamp>(BASE_CAMP);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [groupMode, setGroupMode] = useState<'order' | 'city'>('order');
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({});
  const [isCompressing, setIsCompressing] = useState(false);
  const [verificationPhotoUrls, setVerificationPhotoUrls] = useState<string[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState(0);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentPhotos = showShareSuccess?.photo_urls || verificationPhotoUrls;
    if (currentPhotos.length >= 1) {
      setErrorMessage('Maximum 1 photo allowed.');
      return;
    }

    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      const newUrl = compressed.dataUrl;
      
      if (showShareSuccess) {
        const newPhotoUrls = [...(showShareSuccess.photo_urls || []), newUrl];
        setShowShareSuccess(prev => ({
          ...prev,
          photo_urls: newPhotoUrls
        }));
        
        // Update the verification record in Firestore if it exists
        if (showShareSuccess.verification_id && !showShareSuccess.verification_id.startsWith('sample-')) {
          await verificationService.updateVerification(showShareSuccess.verification_id, {
            photo_urls: newPhotoUrls
          });
        }
      } else {
        setVerificationPhotoUrls(prev => [...prev, newUrl]);
      }
    } catch (error) {
      console.error('Error compressing image:', error);
    } finally {
      setIsCompressing(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [stopSearchQuery, setStopSearchQuery] = useState('');
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [showShareSuccess, setShowShareSuccess] = useState<any>(null);
  const [sharingJob, setSharingJob] = useState<any>(null);
  const [paymentDue, setPaymentDue] = useState(false);
  const [copied, setCopied] = useState(false);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [stopFilter, setStopFilter] = useState<'open' | 'completed' | 'overdue' | 'delayed' | 'all'>('open');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getShareProofLink = (job: any) => `${getPublicOrigin()}/#/proof/${job.id}/${job.share_token}`;
  const getCurrentShareMessage = (includePaymentDue = paymentDue) => {
    if (!sharingJob) return '';

    return renderProofMessage(templates[currentTemplateIndex] || null, {
      customerName: sharingJob.customer_name_snapshot,
      serviceName: sharingJob.service_snapshot || sharingJob.service_type_snapshot,
      price: sharingJob.price_snapshot || '0.00',
      proofLink: getShareProofLink(sharingJob),
      paymentDue: includePaymentDue
    });
  };

  useEffect(() => {
    let unsubscribeJobs: () => void = () => {};
    let unsubscribeCustomers: () => void = () => {};
    let unsubscribeTemplates: () => void = () => {};

    const setupSubscriptions = () => {
      unsubscribeJobs = jobService.subscribeToJobs(setAvailableJobs);
      unsubscribeCustomers = customerService.subscribeToCustomers(setAvailableCustomers);
      unsubscribeTemplates = templateService.subscribeToTemplates(setTemplates);
    };

    // Use onAuthStateChanged to ensure we have a user before subscribing
    const authUnsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setupSubscriptions();
      } else {
        setAvailableJobs([]);
        setAvailableCustomers([]);
        setTemplates([]);
      }
    });

    return () => {
      authUnsubscribe();
      unsubscribeJobs();
      unsubscribeCustomers();
      unsubscribeTemplates();
    };
  }, []);

  useEffect(() => {
    if (templates.length > 0 && currentTemplateIndex >= templates.length) {
      setCurrentTemplateIndex(0);
    }
  }, [templates.length, currentTemplateIndex]);

  useEffect(() => {
    const routeState = location.state as { selectedRouteDate?: string; selectedRouteId?: string } | null;
    if (routeState?.selectedRouteDate) {
      const nextDate = new Date(routeState.selectedRouteDate);
      if (!Number.isNaN(nextDate.getTime())) {
        setSelectedDate(nextDate);
      }
    }
    if (routeState?.selectedRouteId) {
      setSelectedRouteId(routeState.selectedRouteId);
    }
  }, [location.state]);

  useEffect(() => {
    const handleShareRouteStop = (e: Event) => {
      const customEvent = e as CustomEvent<RouteStop>;
      const stop = customEvent.detail;
      const fullJob = stop.job_id ? availableJobs.find(j => j.id === stop.job_id) : null;
      const job = fullJob || {
        id: stop.job_id || null,
        customer_name_snapshot: stop.customer_name_snapshot,
        service_type_snapshot: stop.service_type_snapshot,
        service_snapshot: stop.service_type_snapshot,
        price_snapshot: stop.price_snapshot || 0
      };
      handleShareJob(job);
    };

    window.addEventListener('share-route-stop', handleShareRouteStop);

    return () => {
      window.removeEventListener('share-route-stop', handleShareRouteStop);
    };
  }, [availableJobs]);

  useEffect(() => {
    const loadBaseCamp = async () => {
      const profile = await routeService.getBusinessProfile();
      if (profile?.base_camp_address) {
        setBaseCamp({
          label: profile.base_camp_label || 'Base Camp',
          address: profile.base_camp_address,
          lat: profile.base_camp_lat || BASE_CAMP.lat,
          lng: profile.base_camp_lng || BASE_CAMP.lng,
        });
      }
    };
    loadBaseCamp();
  }, []);

  useEffect(() => {
    const unsubscribeRoutes = routeService.subscribeToRoutesByDate(selectedDate, (data) => {
      setRoutes(data);
    });

    return () => unsubscribeRoutes();
  }, [selectedDate]);

  useEffect(() => {
    if (activeRoute?.id) {
      setStops([]); // Clear stops while loading new route
      const unsubscribeStops = routeService.subscribeToRouteStops(activeRoute.id, (data) => {
        setStops(data);
      });
      return () => unsubscribeStops();
    } else {
      setStops([]);
    }
  }, [activeRoute?.id]);

  useEffect(() => {
    setStopFilter('open');
  }, [activeRoute?.id, selectedDate]);

  useEffect(() => {
    if (routes.length === 0) {
      setActiveRoute(null);
      return;
    }

    const nextActiveRoute = routes.find((route) => route.id === selectedRouteId) || routes[0];
    setActiveRoute(nextActiveRoute);
    setSelectedRouteId(nextActiveRoute?.id || null);
  }, [routes, selectedRouteId]);

  const handleArrowReorder = async (index: number, direction: 'up' | 'down') => {
    const newStops = [...stops];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newStops.length) return;

    const temp = newStops[index];
    newStops[index] = newStops[targetIndex];
    newStops[targetIndex] = temp;

    setStops(newStops);
    if (activeRoute?.id) {
      const updates = newStops.map((stop, i) => ({
        id: stop.id!,
        stop_order: i,
        manual_order: i,
      }));
      await routeService.batchUpdateStopOrders(updates);
      await routeService.updateRoute(activeRoute.id, { manual_override: true });
    }
  };

  const handleOptimize = async () => {
    if (!activeRoute?.id || stops.length === 0) return;
    setIsOptimizing(true);
    setErrorMessage(null);
    
    // Simulate optimization delay
    setTimeout(async () => {
      try {
        const optimized = routeOptimizationService.optimizeRoute(stops, baseCamp, activeRoute.return_to_base);
        const updates = optimized.map((stop, index) => ({
          id: stop.id!,
          stop_order: index,
          manual_order: index,
        }));
        await routeService.batchUpdateStopOrders(updates);
        setStops(optimized);
        await routeService.updateRoute(activeRoute.id!, { 
          optimization_mode: 'optimized',
          manual_override: false 
        });
        setActiveRoute(prev => prev ? { ...prev, optimization_mode: 'optimized' } : null);
      } catch (error: any) {
        console.error('Error optimizing route:', error);
        setErrorMessage('Failed to optimize route. Please check your permissions.');
      } finally {
        setIsOptimizing(false);
      }
    }, 1000);
  };

  const handleDelayStop = async (stop: RouteStop) => {
    if (!stop.id) return;
    setErrorMessage(null);
    try {
      await routeService.updateRouteStop(stop.id, {
        due_state: 'delayed',
        delayed_reason: 'Rescheduled by field tech'
      });
    } catch (error: any) {
      console.error('Error delaying stop:', error);
      setErrorMessage('Failed to delay stop.');
    }
  };

  const handleAddJobToRoute = async (job: Job) => {
    if (!activeRoute?.id) return;
    setErrorMessage(null);

    const routeCapacity = activeRoute.route_capacity || 15;
    if (stops.length >= routeCapacity) {
      setErrorMessage(`This run is full at ${routeCapacity} stops. Open another same-day run or refresh the planner.`);
      return;
    }
    
    try {
      // Generate some random coordinates around base camp if missing
      const lat = baseCamp ? baseCamp.lat + (Math.random() - 0.5) * 0.1 : 37.7749;
      const lng = baseCamp ? baseCamp.lng + (Math.random() - 0.5) * 0.1 : -122.4194;

      await routeService.addRouteStop({
        route_id: activeRoute.id,
        job_id: job.id,
        customer_id: job.customerId,
        stop_order: stops.length,
        manual_order: stops.length,
        optimized_order: stops.length,
        status: 'pending',
        due_state: 'due',
        city_snapshot: (job.address_snapshot || '').split(',')[1]?.trim() || '',
        address_snapshot: job.address_snapshot || '',
        lat_snapshot: lat,
        lng_snapshot: lng,
        service_type_snapshot: job.service_snapshot || 'General Service',
        customer_name_snapshot: job.customer_name_snapshot || 'Unknown Customer',
        price_snapshot: job.price_snapshot || 0,
        last_service_date_snapshot: job.completed_date || '',
        scheduled_date: job.scheduled_date || Timestamp.now(),
        due_date: job.scheduled_date || Timestamp.now()
      });
      setIsAddingStop(false);
    } catch (error: any) {
      console.error('Error adding job to route:', error);
      setErrorMessage('Failed to add job to route.');
    }
  };

  const handleAddCustomerToRoute = async (customer: Customer) => {
    if (!activeRoute?.id) return;
    setErrorMessage(null);

    const routeCapacity = activeRoute.route_capacity || 15;
    if (stops.length >= routeCapacity) {
      setErrorMessage(`This run is full at ${routeCapacity} stops. Open another same-day run or refresh the planner.`);
      return;
    }

    try {
      // Create a job for this customer first so we have a job ID for sharing
      const jobRef = await jobService.addJob({
        customerId: customer.id!,
        customer_name_snapshot: customer.name,
        address_snapshot: [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
        phone_snapshot: customer.phone || '',
        service_snapshot: 'General Service',
        price_snapshot: 0,
        status: 'pending',
        payment_status: 'unpaid',
        visibility_mode: 'internal_only',
        is_billable: true,
        is_recurring: false,
        internal_notes: '',
        customer_notes: '',
        scheduled_date: Timestamp.now()
      });

      if (!jobRef) throw new Error('Failed to create job for route stop');

      // Generate some random coordinates around base camp if missing
      const lat = baseCamp ? baseCamp.lat + (Math.random() - 0.5) * 0.1 : 37.7749;
      const lng = baseCamp ? baseCamp.lng + (Math.random() - 0.5) * 0.1 : -122.4194;

      await routeService.addRouteStop({
        route_id: activeRoute.id,
        customer_id: customer.id,
        job_id: jobRef.id,
        stop_order: stops.length,
        manual_order: stops.length,
        optimized_order: stops.length,
        status: 'pending',
        due_state: 'due',
        city_snapshot: customer.city || '',
        address_snapshot: [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
        lat_snapshot: lat,
        lng_snapshot: lng,
        service_type_snapshot: 'General Service',
        customer_name_snapshot: customer.name || 'Unknown Customer',
        price_snapshot: 0,
        scheduled_date: Timestamp.now(),
        due_date: Timestamp.now()
      });
      setIsAddingStop(false);
    } catch (error: any) {
      console.error('Error adding customer to route:', error);
      setErrorMessage('Failed to add customer to route.');
    }
  };

  const handleStatusChange = async (stop: RouteStop, status: 'pending' | 'completed' | 'canceled') => {
    if (!stop.id) return;
    setErrorMessage(null);
    
    if (status === 'completed') {
      setStopToVerify(stop);
      return;
    }

    try {
      await routeService.updateRouteStop(stop.id, {
        status,
        due_state: 'due'
      });
    } catch (error: any) {
      console.error('Error updating stop status:', error);
      setErrorMessage('Failed to update stop status.');
    }
  };

  const handleVerifyStop = async (stop: RouteStop, notes: string, photoUrls: string[]) => {
    if (!stop.id) return;
    setErrorMessage(null);

    try {
      const actor = routeService.getCurrentActorSnapshot();
      const completedAt = Timestamp.now();
      let currentJobId = stop.job_id;

      // If no job linked, create one now so we can share proof
      if (!currentJobId) {
        const jobRef = await jobService.addJob({
          customerId: stop.customer_id || 'unknown',
          customer_name_snapshot: stop.customer_name_snapshot,
          address_snapshot: stop.address_snapshot,
          phone_snapshot: '',
          service_snapshot: stop.service_type_snapshot,
          price_snapshot: stop.price_snapshot || 0,
          status: 'completed',
          payment_status: 'unpaid',
          visibility_mode: 'internal_only',
          is_billable: true,
          is_recurring: false,
          internal_notes: notes || '',
          customer_notes: '',
          scheduled_date: stop.scheduled_date,
          completed_date: completedAt
        });
        if (jobRef) {
          currentJobId = jobRef.id;
          // Update stop with new job ID
          await routeService.updateRouteStop(stop.id, {
            job_id: currentJobId
          });
        }
      }

      // Update job if linked
      if (currentJobId && !currentJobId.startsWith('sample-')) {
        await jobService.updateJob(currentJobId, {
          status: 'completed',
          completed_date: completedAt
        });
      }

      // Add verification record (we can still add this for sample jobs)
      let verificationId = '';
      if (currentJobId) {
        const vRef = await verificationService.addVerification({
          jobId: currentJobId,
          photo_urls: photoUrls,
          notes: notes || 'Service completed and verified via route.'
        });
        if (vRef) verificationId = vRef.id;
      }

      // Update customer if linked
      if (stop.customer_id && !stop.customer_id.startsWith('sample-')) {
        await customerService.updateCustomer(stop.customer_id, {
          last_service_date: completedAt
        });
      }

      await routeService.updateRouteStop(stop.id, {
        status: 'completed',
        due_state: 'completed',
        completed_at: completedAt,
        completed_by_user_id: actor.userId,
        completed_by_name: actor.name,
        notes_internal: notes,
        verification_id: verificationId || undefined
      });

      setStopToVerify(null);
      setVerificationPhotoUrls([]);
      
      const fullJob = currentJobId ? availableJobs.find(j => j.id === currentJobId) : null;
      
      // Show share success modal
      setShowShareSuccess({
        ...(fullJob || {
          id: currentJobId || null,
          customer_name_snapshot: stop.customer_name_snapshot,
          service_type_snapshot: stop.service_type_snapshot,
          service_snapshot: stop.service_type_snapshot,
          price_snapshot: stop.price_snapshot || 0,
          payment_status: 'unpaid'
        }),
        photo_urls: photoUrls,
        verification_id: verificationId
      });
    } catch (error: any) {
      console.error('Error verifying stop:', error);
      let msg = 'Failed to verify stop. Please check your permissions.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Verification failed: ${parsed.error}`;
      } catch (e) {}
      setErrorMessage(msg);
    }
  };

  const handleShareJob = async (job: any) => {
    setErrorMessage(null);
    const isPaymentDue = job.payment_status === 'unpaid' && (job.price_snapshot || 0) > 0;
    setPaymentDue(isPaymentDue);
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Expire in 24 hours

      if (job.visibility_mode === 'internal_only' || !job.share_token) {
        const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        if (job.id && !job.id.startsWith('sample-')) {
          await jobService.updateJob(job.id, {
            visibility_mode: 'shareable',
            share_token: shareToken,
            share_expires_at: Timestamp.fromDate(expiresAt)
          });
        }
        setSharingJob({ ...job, visibility_mode: 'shareable', share_token: shareToken, share_expires_at: Timestamp.fromDate(expiresAt) });
      } else {
        if (job.id && !job.id.startsWith('sample-')) {
          await jobService.updateJob(job.id, {
            share_expires_at: Timestamp.fromDate(expiresAt)
          });
        }
        setSharingJob({ ...job, share_expires_at: Timestamp.fromDate(expiresAt) });
      }
    } catch (error: any) {
      console.error('Error sharing job:', error);
      let msg = 'Failed to generate share link.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Sharing failed: ${parsed.error}`;
      } catch (e) {}
      setErrorMessage(msg);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartRoute = async () => {
    if (!activeRoute?.id) return;
    setErrorMessage(null);
    try {
      const actor = routeService.getCurrentActorSnapshot();
      const startedAt = Timestamp.now();
      await routeService.updateRoute(activeRoute.id, {
        status: 'in_progress',
        started_at: startedAt,
        started_by_user_id: actor.userId,
        started_by_name: actor.name
      });
      setActiveRoute(prev => prev ? ({
        ...prev,
        status: 'in_progress',
        started_at: startedAt,
        started_by_user_id: actor.userId,
        started_by_name: actor.name
      }) : null);
    } catch (error: any) {
      console.error('Error starting route:', error);
      setErrorMessage('Failed to start route.');
    }
  };

  const handleCompleteRoute = async () => {
    if (!activeRoute?.id) return;
    setErrorMessage(null);
    try {
      const actor = routeService.getCurrentActorSnapshot();
      const completedAt = Timestamp.now();
      await routeService.updateRoute(activeRoute.id, {
        status: 'completed',
        completed_at: completedAt,
        completed_by_user_id: actor.userId,
        completed_by_name: actor.name
      });
      setActiveRoute(prev => prev ? ({
        ...prev,
        status: 'completed',
        completed_at: completedAt,
        completed_by_user_id: actor.userId,
        completed_by_name: actor.name
      }) : null);
    } catch (error: any) {
      console.error('Error completing route:', error);
      setErrorMessage('Failed to complete route.');
    }
  };

  const handleSeedData = async () => {
    setErrorMessage(null);
    try {
      await routeService.seedSampleData();
    } catch (error: any) {
      console.error('Error seeding data:', error);
      setErrorMessage('Failed to seed sample data.');
    }
  };

  const handleSort = async (mode: OptimizationMode) => {
    if (!activeRoute?.id || stops.length === 0) return;
    
    let sorted: RouteStop[] = [];
    if (mode === 'close_to_far' || mode === 'far_to_close') {
      sorted = routeOptimizationService.sortByDistance(stops, baseCamp, mode);
    } else {
      return;
    }

    const updates = sorted.map((stop, index) => ({
      id: stop.id!,
      stop_order: index,
      manual_order: index,
    }));
    await routeService.batchUpdateStopOrders(updates);
    setStops(sorted);
    await routeService.updateRoute(activeRoute.id, { 
      optimization_mode: mode,
      manual_override: false 
    });
    setActiveRoute(prev => prev ? { ...prev, optimization_mode: mode } : null);
  };

  const toggleCity = (city: string) => {
    setExpandedCities(prev => ({ ...prev, [city]: !prev[city] }));
  };

  const filteredStops = stops.filter((stop) => {
    const matchesSearch =
      stop.customer_name_snapshot.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stop.address_snapshot.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stop.city_snapshot.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (stopFilter === 'completed') return stop.due_state === 'completed';
    if (stopFilter === 'overdue') return stop.due_state === 'overdue';
    if (stopFilter === 'delayed') return stop.due_state === 'delayed';
    if (stopFilter === 'all') return true;

    return stop.due_state !== 'completed';
  });

  const stopsByCity = routeOptimizationService.groupByCity(filteredStops);

  const stats = {
    total: stops.length,
    completed: stops.filter(s => s.due_state === 'completed').length,
    due: stops.filter(s => s.due_state === 'due').length,
    overdue: stops.filter(s => s.due_state === 'overdue').length,
    delayed: stops.filter(s => s.due_state === 'delayed').length,
  };

  return (
    <div className="space-y-8 pb-32">
      {/* Header */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                {activeRoute?.template_name || activeRoute?.name || 'Daily Route'}
              </h2>
              <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                {activeRoute?.status || 'Draft'}
              </span>
              {activeRoute?.route_run_label && (
                <span className="px-3 py-1 bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                  {activeRoute.route_run_label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <button 
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 86400000))}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <button 
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 86400000))}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </p>
              {activeRoute?.route_capacity && (
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                  Capacity {stops.length}/{activeRoute.route_capacity}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeRoute?.status === 'draft' && stops.length > 0 && (
              <button 
                onClick={handleStartRoute}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-2xl shadow-lg font-black text-sm hover:bg-green-700 transition-all"
              >
                <Zap className="h-4 w-4" />
                Start Route
              </button>
            )}

            {activeRoute?.status === 'in_progress' && (
              <button 
                onClick={handleCompleteRoute}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl shadow-lg font-black text-sm hover:bg-blue-700 transition-all"
              >
                <CheckCircle className="h-4 w-4" />
                Complete Route
              </button>
            )}
            
            <button 
              onClick={() => setIsAddingStop(true)}
              disabled={!activeRoute?.id}
              className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl shadow-lg font-black text-sm hover:bg-gray-800 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Stop
            </button>
          </div>
        </div>

        {routes.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {routes.map((route) => (
              <button
                key={route.id}
                onClick={() => setSelectedRouteId(route.id || null)}
                className={`px-4 py-3 rounded-2xl border text-left transition-all ${
                  activeRoute?.id === route.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                    : 'bg-white text-gray-700 border-gray-100 hover:border-blue-200 hover:bg-blue-50'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-widest">
                  {route.assigned_team_name_snapshot || route.route_run_label || route.template_name || route.name}
                </p>
                <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${
                  activeRoute?.id === route.id ? 'text-blue-100' : 'text-gray-400'
                }`}>
                  {route.status.replace('_', ' ')} {route.route_capacity ? `• ${route.route_capacity} max` : ''}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button
            onClick={() => setStopFilter('open')}
            className={`rounded-3xl p-5 border text-left transition-all ${
              stopFilter === 'open' ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100' : 'bg-white border-gray-100 shadow-sm hover:border-blue-200'
            }`}
          >
            <p className={`text-2xl font-black ${stopFilter === 'open' ? 'text-white' : 'text-gray-900'}`}>{stats.total - stats.completed}</p>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${stopFilter === 'open' ? 'text-blue-100' : 'text-gray-400'}`}>Stops Left</p>
          </button>
          <button
            onClick={() => setStopFilter('completed')}
            className={`rounded-3xl p-5 border text-left transition-all ${
              stopFilter === 'completed' ? 'bg-green-600 text-white border-green-600 shadow-xl shadow-green-100' : 'bg-white border-gray-100 shadow-sm hover:border-green-200'
            }`}
          >
            <p className={`text-2xl font-black ${stopFilter === 'completed' ? 'text-white' : 'text-green-600'}`}>{stats.completed}</p>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${stopFilter === 'completed' ? 'text-green-100' : 'text-gray-400'}`}>Completed</p>
          </button>
          <button
            onClick={() => setStopFilter('overdue')}
            className={`rounded-3xl p-5 border text-left transition-all ${
              stopFilter === 'overdue' ? 'bg-red-600 text-white border-red-600 shadow-xl shadow-red-100' : 'bg-white border-gray-100 shadow-sm hover:border-red-200'
            }`}
          >
            <p className={`text-2xl font-black ${stopFilter === 'overdue' ? 'text-white' : 'text-red-600'}`}>{stats.overdue}</p>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${stopFilter === 'overdue' ? 'text-red-100' : 'text-gray-400'}`}>Overdue</p>
          </button>
          <button
            onClick={() => setStopFilter('delayed')}
            className={`rounded-3xl p-5 border text-left transition-all ${
              stopFilter === 'delayed' ? 'bg-orange-600 text-white border-orange-600 shadow-xl shadow-orange-100' : 'bg-white border-gray-100 shadow-sm hover:border-orange-200'
            }`}
          >
            <p className={`text-2xl font-black ${stopFilter === 'delayed' ? 'text-white' : 'text-orange-600'}`}>{stats.delayed}</p>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${stopFilter === 'delayed' ? 'text-orange-100' : 'text-gray-400'}`}>Delayed</p>
          </button>
        </div>
      </header>

      {/* Controls Bar */}
      <div className="flex flex-col gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search stops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex flex-nowrap items-center gap-2 w-full sm:w-auto">
            {flags.routes_basic && (
              <button 
                onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${
                  viewMode === 'map' ? 'bg-blue-600 text-white shadow-blue-100' : 'bg-blue-600 text-white shadow-blue-100'
                }`}
              >
                {viewMode === 'list' ? <MapIcon className="h-4 w-4" /> : <List className="h-4 w-4" />}
                {viewMode === 'list' ? 'Map' : 'List'}
              </button>
            )}
            {flags.routes_optimization && (
              <button 
                onClick={handleOptimize}
                disabled={isOptimizing}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${
                  isOptimizing ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700'
                }`}
              >
                <Zap className={`h-4 w-4 ${isOptimizing ? 'animate-pulse' : ''}`} />
                {isOptimizing ? 'Optimizing...' : 'Optimize'}
              </button>
            )}
            <button 
              onClick={() => handleSort(activeRoute?.optimization_mode === 'close_to_far' ? 'far_to_close' : 'close_to_far')} 
              className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Map Section - Integrated */}
      <AnimatePresence>
        {flags.routes_basic && viewMode === 'map' && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <RouteMap 
              stops={filteredStops} 
              baseCamp={baseCamp}
              onMarkerSelect={setSelectedStop} 
              selectedStop={selectedStop}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Route List / Grouped View */}
      <div className="space-y-8">
          {groupMode === 'order' ? (
            <div className="space-y-4">
              {filteredStops.map((stop, index) => (
                <RouteStopCard 
                  key={stop.id} 
                  stop={stop} 
                  index={index} 
                  totalStops={stops.length}
                  onSelect={setSelectedStop}
                  onDelay={handleDelayStop}
                  onStatusChange={handleStatusChange}
                  onReorder={handleArrowReorder}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-10">
              {Object.entries(stopsByCity).map(([city, cityStops]) => (
                <div key={city} className="space-y-4">
                  <div className="flex items-center gap-4 px-2">
                    <div className="h-px flex-1 bg-gray-100" />
                    <div className="flex items-center gap-3 px-6 py-2 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100">
                      <MapIcon className="h-4 w-4" />
                      <h4 className="text-xs font-black uppercase tracking-[0.2em]">{city}</h4>
                      <span className="bg-white/20 px-2 py-0.5 rounded-lg text-[10px] font-black">
                        {cityStops.length}
                      </span>
                    </div>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  
                  <div className="space-y-4">
                    {cityStops.map((stop, index) => (
                      <RouteStopCard 
                        key={stop.id} 
                        stop={stop} 
                        index={index} 
                        totalStops={stops.length}
                        onSelect={setSelectedStop}
                        onDelay={handleDelayStop}
                        onStatusChange={handleStatusChange}
                        hideReorder={true}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Empty State */}
      {stops.length === 0 && (
        <div className="bg-white rounded-[40px] p-20 border-2 border-dashed border-gray-100 flex flex-col items-center text-center space-y-6">
          <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
            <MapIcon className="h-10 w-10 text-blue-600" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900">
              {activeRoute ? 'No route stops on this run' : 'No generated route run for this date'}
            </h3>
            <p className="text-gray-400 font-bold max-w-xs mx-auto mt-2">
              {activeRoute
                ? 'Add work to this run or go back to the route planner to refresh what is due.'
                : 'Generate a route run from the route planner first, then open it here for daily execution.'}
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => {
                navigate('/routes', {
                  state: {
                    selectedDate: selectedDate.toISOString(),
                    selectedTemplateId: activeRoute?.template_id,
                  },
                });
              }}
              className="flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-3xl font-black shadow-2xl hover:bg-gray-800 transition-all"
            >
              <Plus className="h-5 w-5" />
              Open Route Planner
            </button>
            {activeRoute && (
              <button
                onClick={() => setIsAddingStop(true)}
                className="flex items-center gap-2 px-8 py-4 bg-blue-50 text-blue-600 rounded-3xl font-black border border-blue-100 hover:bg-blue-100 transition-all"
              >
                <Plus className="h-5 w-5" />
                Add Stop
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add Stop Modal */}
      {isAddingStop && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[90vh] sm:h-auto sm:max-w-2xl rounded-[40px] p-8 overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Add Stop to Route</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Select a job or client to add</p>
              </div>
              <button onClick={() => setIsAddingStop(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-8">
              {/* Search Bar */}
              <div className="relative group mb-6">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                </div>
                <input
                  type="text"
                  value={stopSearchQuery}
                  onChange={(e) => setStopSearchQuery(e.target.value)}
                  className="block w-full pl-14 pr-6 py-5 bg-gray-50 border border-gray-100 rounded-3xl text-sm font-bold text-gray-900 placeholder:text-gray-300 shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none"
                  placeholder="Search jobs or customers..."
                />
              </div>

              {/* Jobs Section */}
              <section>
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Active Jobs</h4>
                <div className="grid grid-cols-1 gap-3">
                  {availableJobs
                    .filter(j => j.status !== 'completed')
                    .filter(j => 
                      j.customer_name_snapshot.toLowerCase().includes(stopSearchQuery.toLowerCase()) ||
                      j.service_snapshot.toLowerCase().includes(stopSearchQuery.toLowerCase())
                    )
                    .map(job => (
                      <button
                        key={job.id}
                        onClick={() => handleAddJobToRoute(job)}
                        className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 hover:ring-2 hover:ring-blue-500 rounded-2xl transition-all text-left group"
                      >
                        <div>
                          <p className="text-sm font-black text-gray-900">{job.customer_name_snapshot}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{job.service_snapshot}</p>
                        </div>
                        <Plus className="h-5 w-5 text-gray-300 group-hover:text-blue-600" />
                      </button>
                    ))}
                </div>
              </section>

              {/* Customers Section */}
              <section>
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">All Clients</h4>
                <div className="grid grid-cols-1 gap-3">
                  {availableCustomers
                    .filter(c => c.name.toLowerCase().includes(stopSearchQuery.toLowerCase()))
                    .map(customer => (
                      <button
                        key={customer.id}
                        onClick={() => handleAddCustomerToRoute(customer)}
                        className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 hover:ring-2 hover:ring-blue-500 rounded-2xl transition-all text-left group"
                      >
                        <div>
                          <p className="text-sm font-black text-gray-900">{customer.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{customer.city}, {customer.state}</p>
                        </div>
                        <Plus className="h-5 w-5 text-gray-300 group-hover:text-blue-600" />
                      </button>
                    ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Verify Stop Modal */}
      {stopToVerify && (
        <VerifyStopModal
          stop={stopToVerify}
          onClose={() => setStopToVerify(null)}
          onVerify={(stop, notes, photoUrls) => handleVerifyStop(stop, notes, photoUrls)}
        />
      )}

      {/* Error Message Toast */}
      {errorMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] w-full max-w-md px-4 animate-in slide-in-from-bottom-4">
          <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-bold">{errorMessage}</p>
            </div>
            <button 
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Share Success Modal */}
      {showShareSuccess && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[250] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Job Verified!</h3>
            <p className="text-sm font-bold text-gray-500 mb-6 uppercase tracking-widest">Service has been recorded</p>
            
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-6 text-left">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</p>
              <p className="text-sm font-black text-gray-900">{showShareSuccess.customer_name_snapshot}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{showShareSuccess.service_type_snapshot}</p>
              
              {/* Photos Display */}
              {(showShareSuccess.photo_urls || verificationPhotoUrls).length > 0 && (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                  {(showShareSuccess.photo_urls || verificationPhotoUrls).map((url: string, i: number) => (
                    <img 
                      key={i} 
                      src={url} 
                      alt={`Verification ${i + 1}`} 
                      className="h-16 w-16 object-cover rounded-xl border border-gray-200 flex-shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ))}
                </div>
              )}
            </div>
            
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => document.getElementById('file-upload-camera-success')?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-100 transition-all border border-blue-100"
                >
                  <Camera className="h-4 w-4" />
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('file-upload-gallery-success')?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-50 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all border border-gray-200"
                >
                  <Upload className="h-4 w-4" />
                  Upload File
                </button>
              </div>
              <input 
                id="file-upload-camera-success" 
                type="file" 
                accept="image/*"
                capture="environment"
                className="sr-only" 
                onChange={handlePhotoUpload}
              />
              <input 
                id="file-upload-gallery-success" 
                type="file" 
                accept="image/*"
                className="sr-only" 
                onChange={handlePhotoUpload}
              />
              {showShareSuccess.id && (
                <button 
                  onClick={() => {
                    const job = showShareSuccess;
                    setShowShareSuccess(null);
                    handleShareJob(job);
                  }}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all flex items-center justify-center gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  Share Proof Link
                </button>
              )}
              <button 
                onClick={() => setShowShareSuccess(null)}
                className="w-full py-4 text-sm font-black text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Link Modal */}
      {sharingJob && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[250] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Share2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Share Proof</h3>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Send link to client</p>
                </div>
              </div>
              <button onClick={() => setSharingJob(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Customer Info */}
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</p>
                    <p className="text-sm font-black text-gray-900">{sharingJob.customer_name_snapshot}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{sharingJob.service_snapshot || sharingJob.service_type_snapshot}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex flex-col items-end gap-2">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Price</p>
                        <p className="text-sm font-black text-blue-600">${sharingJob.price_snapshot || '0.00'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Payment Due</span>
                        <div className="flex items-center gap-1">
                          <span className={`text-[8px] font-black uppercase ${!paymentDue ? 'text-blue-600' : 'text-gray-300'}`}>OFF</span>
                          <button 
                            onClick={() => setPaymentDue(!paymentDue)}
                            className={`w-10 h-5 rounded-full transition-all relative ${paymentDue ? 'bg-green-500' : 'bg-gray-200'}`}
                          >
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${paymentDue ? 'left-6' : 'left-1'}`} />
                          </button>
                          <span className={`text-[8px] font-black uppercase ${paymentDue ? 'text-green-600' : 'text-gray-300'}`}>ON</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Message Templates */}
              <div className="space-y-3">
                <div className="flex justify-between items-center ml-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Message Templates</label>
                  {templates.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentTemplateIndex((prev) => (prev > 0 ? prev - 1 : templates.length - 1))}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <ChevronDown className="h-4 w-4 rotate-90" />
                      </button>
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                        {currentTemplateIndex + 1} / {templates.length}
                      </span>
                      <button 
                        onClick={() => setCurrentTemplateIndex((prev) => (prev < templates.length - 1 ? prev + 1 : 0))}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 relative group">
                    <p className="text-xs font-bold text-gray-600 leading-relaxed italic break-words">
                      {getCurrentShareMessage()}
                    </p>
                    <button 
                      onClick={() => {
                        copyToClipboard(getCurrentShareMessage());
                      }}
                      className="absolute top-2 right-2 p-2 bg-white text-gray-400 hover:text-blue-600 rounded-xl shadow-sm transition-all border border-gray-100"
                    >
                      {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <ClipboardList className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Customer Copy Button */}
                  <button 
                    onClick={() => {
                      copyToClipboard(getCurrentShareMessage(false));
                    }}
                    className="w-full py-3 px-4 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center justify-center gap-2 border border-blue-100"
                  >
                    <User className="h-3 w-3" />
                    Copy Customer Message
                  </button>

                  {/* Payment Copy Button */}
                  <button 
                    onClick={() => {
                      copyToClipboard(getCurrentShareMessage(true));
                    }}
                    className="w-full py-3 px-4 bg-green-50 text-green-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition-all flex items-center justify-center gap-2 border border-green-100"
                  >
                    <CreditCard className="h-3 w-3" />
                    Copy Payment Message
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Direct Link</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-[10px] font-bold text-gray-600 break-all leading-tight">
                    {getShareProofLink(sharingJob)}
                  </div>
                  <button 
                    onClick={() => copyToClipboard(getShareProofLink(sharingJob))}
                    className={`px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                      copied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => {
                    const url = getShareProofLink(sharingJob);
                    const message = getCurrentShareMessage();
                    if (navigator.share) {
                      navigator.share({
                        title: 'Service Proof',
                        text: message,
                        url: url
                      });
                    } else {
                      window.location.href = `mailto:?subject=Service Proof&body=${encodeURIComponent(message)}`;
                    }
                  }}
                  className="w-full bg-blue-600 text-white py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all flex items-center justify-center gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  Send via System Share
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
