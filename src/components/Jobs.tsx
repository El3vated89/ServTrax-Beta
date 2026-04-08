import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Calendar, MapPin, CheckCircle, X, Camera, Share2, Copy, Map, AlertCircle, Briefcase, User, Upload, ChevronRight, ChevronLeft, CreditCard, ClipboardList, ChevronDown, MessageSquare, FileText, Repeat, ArrowRight, Settings as SettingsIcon, Clock, CheckSquare, Trash2 } from 'lucide-react';
import { jobService, Job } from '../services/jobService';
import { customerService, Customer } from '../services/customerService';
import { verificationService } from '../services/verificationService';
import { servicePlanService, ServicePlan } from '../services/servicePlanService';
import { renderProofMessage, templateService, MessageTemplate } from '../services/templateService';
import { recurringService, RecurringPlan, BillingFrequency } from '../services/recurringService';
import { settingsService, BusinessSettings } from '../services/settingsService';
import { quoteService, Quote } from '../services/quoteService';
import { Timestamp, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { compressImage } from '../utils/imageCompression';
import { getPublicOrigin } from '../utils';
import { auth, db } from '../firebase';
import Markdown from 'react-markdown';

export default function Jobs() {
  const location = useLocation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [sharingJob, setSharingJob] = useState<Job | null>(null);
  const [recurringPlans, setRecurringPlans] = useState<RecurringPlan[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  // Update current message when sharingJob or template index changes
  useEffect(() => {
    if (sharingJob) {
      const proofLink = `${getPublicOrigin()}/#/proof/${sharingJob.id}/${sharingJob.share_token}`;
      setCurrentMessage(renderProofMessage(templates[currentTemplateIndex] || null, {
        customerName: sharingJob.customer_name_snapshot,
        serviceName: sharingJob.service_snapshot,
        price: sharingJob.price_snapshot,
        proofLink
      }));
    }
  }, [sharingJob, currentTemplateIndex, templates]);

  useEffect(() => {
    if (templates.length > 0 && currentTemplateIndex >= templates.length) {
      setCurrentTemplateIndex(0);
    }
  }, [templates.length, currentTemplateIndex]);
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed' | 'due'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [viewingJob, setViewingJob] = useState<Job | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ type: 'edit' | 'delete', job: Job } | null>(null);
  
  // Verification state
  const [verifyingJobId, setVerifyingJobId] = useState<string | null>(null);
  const [verificationPhotoUrl, setVerificationPhotoUrl] = useState('');
  const [verificationThumbnailUrl, setVerificationThumbnailUrl] = useState('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);

  // Share state
  const [showShareSuccess, setShowShareSuccess] = useState<Job | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [copied, setCopied] = useState(false);

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedServicePlanId, setSelectedServicePlanId] = useState('');
  const [customServiceType, setCustomServiceType] = useState('');
  const [price, setPrice] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>('one-time');
  const [serviceSetupType, setServiceSetupType] = useState<'one-time' | 'recurring' | 'flexible'>('one-time');
  const [internalNotes, setInternalNotes] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');

  // New Customer state
  const [isCreatingNewCustomer, setIsCreatingNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerStreet, setNewCustomerStreet] = useState('');
  const [newCustomerLine2, setNewCustomerLine2] = useState('');
  const [newCustomerCity, setNewCustomerCity] = useState('');
  const [newCustomerState, setNewCustomerState] = useState('');
  const [newCustomerZip, setNewCustomerZip] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [newCustomerAccessNotes, setNewCustomerAccessNotes] = useState('');

  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    const unsubscribeJobs = jobService.subscribeToJobs(setJobs);
    const unsubscribeCustomers = customerService.subscribeToCustomers(setCustomers);
    const unsubscribePlans = servicePlanService.subscribeToServicePlans(setServicePlans);
    const unsubscribeTemplates = templateService.subscribeToTemplates(setTemplates);
    const unsubscribeRecurring = recurringService.subscribeToPlans(setRecurringPlans);
    const unsubscribeQuotes = quoteService.subscribeToQuotes(setQuotes);
    
    settingsService.getSettings().then(setBusinessSettings);

    return () => {
      unsubscribeJobs();
      unsubscribeCustomers();
      unsubscribePlans();
      unsubscribeTemplates();
      unsubscribeRecurring();
      unsubscribeQuotes();
    };
  }, []);

  useEffect(() => {
    if (jobs.length === 0) return;

    if (location.state?.viewingJobId) {
      const job = jobs.find(j => j.id === location.state.viewingJobId);
      if (job) {
        setViewingJob(job);
        navigate(location.pathname, { replace: true });
      }
    }
    if (location.state?.editingJobId) {
      const job = jobs.find(j => j.id === location.state.editingJobId);
      if (job) {
        setEditingJob(job);
        navigate(location.pathname, { replace: true });
      }
    }
    if (location.state?.openAddModal) {
      setIsAdding(true);
      navigate(location.pathname, { replace: true });
    }
    if (location.state?.openVerifyModal) {
      // Find the first pending job to verify
      const pendingJob = jobs.find(j => j.status === 'pending');
      if (pendingJob) {
        setVerifyingJobId(pendingJob.id!);
      } else {
        setErrorMessage("No pending jobs found to verify.");
      }
      navigate(location.pathname, { replace: true });
    }
  }, [jobs, location.state, location.pathname, navigate]);

  const handleServicePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const planId = e.target.value;
    setSelectedServicePlanId(planId);
    if (planId !== 'custom') {
      const plan = servicePlans.find(p => p.id === planId);
      if (plan) {
        setPrice(plan.price.toString());
      }
    } else {
      setPrice('');
    }
  };

  const handleAddJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return;

    let finalServiceType = customServiceType;
    if (selectedServicePlanId !== 'custom') {
      const plan = servicePlans.find(p => p.id === selectedServicePlanId);
      if (plan) finalServiceType = plan.name;
    }

    const fullAddress = [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

    const jobPayload: any = {
      customerId: customer.id!,
      customer_name_snapshot: customer.name,
      address_snapshot: fullAddress,
      phone_snapshot: customer.phone || '',
      service_snapshot: finalServiceType,
      price_snapshot: Number(price) || 0,
      scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
      status: isRecurring ? 'approved' : 'pending',
      payment_status: 'unpaid',
      visibility_mode: 'internal_only',
      is_billable: true,
      is_recurring: isRecurring,
      billing_frequency: billingFrequency,
      internal_notes: internalNotes || '',
      customer_notes: ''
    };

    if (selectedServicePlanId !== 'custom') {
      jobPayload.servicePlanId = selectedServicePlanId;
    }

    try {
      if (isRecurring) {
        // Create recurring plan
        const plan = await recurringService.addPlan({
          customerId: customer.id!,
          servicePlanId: selectedServicePlanId !== 'custom' ? selectedServicePlanId : undefined,
          name: finalServiceType,
          price: Number(price) || 0,
          frequency: billingFrequency,
          status: 'active',
          start_date: scheduledDate ? new Date(scheduledDate).toISOString() : new Date().toISOString(),
          next_due_date: scheduledDate ? new Date(scheduledDate).toISOString() : new Date().toISOString(),
          notes: internalNotes || ''
        });
        if (plan) {
          jobPayload.recurringPlanId = plan.id;
        }
      }

      await jobService.addJob(jobPayload);
      setIsAdding(false);
      setSelectedCustomerId('');
      setSelectedServicePlanId('');
      setCustomServiceType('');
      setPrice('');
      setScheduledDate('');
      setBillingFrequency('one-time');
      setIsRecurring(false);
      setInternalNotes('');
    } catch (error: any) {
      console.error('Error adding job:', error);
      let msg = 'Failed to add job. Please check your permissions and try again.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Failed to add job: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }
      setErrorMessage(msg);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      setVerificationPhotoUrl(compressed.dataUrl);
      setVerificationThumbnailUrl(compressed.thumbnailUrl);
    } catch (error) {
      console.error('Error compressing image:', error);
      setErrorMessage('Failed to process image. Please try another photo.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleVerifyJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingJobId) return;
    setErrorMessage(null);

    try {
      // 1. Add verification record
      await verificationService.addVerification({
        jobId: verifyingJobId,
        photo_url: verificationPhotoUrl || 'https://picsum.photos/seed/verification/400/300', // Placeholder if empty
        notes: verificationNotes
      });

      // 2. Ensure job has a share token if it doesn't already
      const currentJob = jobs.find(j => j.id === verifyingJobId);
      const updateData: Partial<Job> = { 
        status: 'completed', 
        completed_date: Timestamp.now() 
      };

      if (!currentJob?.share_token) {
        updateData.share_token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        updateData.visibility_mode = 'shareable';
      }

      // 3. Update job status to completed
      await jobService.updateJob(verifyingJobId, updateData);

      // 4. Update customer's last service date
      if (currentJob?.customerId) {
        await customerService.updateCustomer(currentJob.customerId, {
          last_service_date: new Date().toISOString()
        });
      }

      // 5. Handle Recurring Logic
      if (currentJob?.is_recurring && currentJob.recurringPlanId && currentJob.billing_frequency) {
        // Fetch the plan to get its configuration
        const planDoc = await getDoc(doc(db, 'recurring_plans', currentJob.recurringPlanId));
        const planData = planDoc.exists() ? { id: planDoc.id, ...planDoc.data() } as RecurringPlan : undefined;
        
        const nextDate = await recurringService.calculateNextDueDate(new Date(), currentJob.billing_frequency as BillingFrequency, planData);
        
        // Update recurring plan
        await recurringService.updatePlan(currentJob.recurringPlanId, {
          last_completed_date: serverTimestamp(),
          next_due_date: nextDate.toISOString()
        });

        // Create next job
        await jobService.addJob({
          ...currentJob,
          id: undefined, // New ID
          status: 'approved',
          scheduled_date: nextDate.toISOString(),
          completed_date: null,
          payment_status: 'unpaid',
          share_token: undefined,
          visibility_mode: 'internal_only'
        });
      }

      const updatedJob = { ...currentJob, ...updateData } as Job;
      setVerifyingJobId(null);
      setVerificationPhotoUrl('');
      setVerificationThumbnailUrl('');
      setVerificationNotes('');
      
      // Show share success modal
      setShowShareSuccess(updatedJob);
    } catch (error: any) {
      console.error('Error verifying job:', error);
      let msg = 'Failed to verify job. Please check your permissions and try again.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Verification failed: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }
      setErrorMessage(msg);
    }
  };

  const handleShareJob = async (job: Job) => {
    setErrorMessage(null);
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Expire in 24 hours

      if (job.visibility_mode === 'internal_only' || !job.share_token) {
        const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await jobService.updateJob(job.id!, {
          visibility_mode: 'shareable',
          share_token: shareToken,
          share_expires_at: Timestamp.fromDate(expiresAt)
        });
        setSharingJob({ ...job, visibility_mode: 'shareable', share_token: shareToken, share_expires_at: Timestamp.fromDate(expiresAt) });
      } else {
        // Even if it has a token, we should probably refresh the expiration if they share it again
        await jobService.updateJob(job.id!, {
          share_expires_at: Timestamp.fromDate(expiresAt)
        });
        setSharingJob({ ...job, share_expires_at: Timestamp.fromDate(expiresAt) });
      }
    } catch (error) {
      console.error('Error sharing job:', error);
      setErrorMessage('Failed to share job. Please try again.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openMap = (address: string) => {
    window.location.href = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
  };

  const handleApproveJob = async (jobId: string) => {
    setErrorMessage(null);
    try {
      await jobService.updateJob(jobId, { status: 'approved' });
    } catch (error: any) {
      console.error('Error approving job:', error);
      let msg = 'Failed to approve job. Please check your permissions and try again.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Approval failed: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }
      setErrorMessage(msg);
    }
  };

  const handleEditJob = (job: Job) => {
    console.log("handleEditJob called for:", job.id);
    setEditingJob(job);
    setEditPrice(job.price_snapshot?.toString() || '0');
    
    let dateStr = '';
    if (job.scheduled_date) {
      try {
        // Handle both string and Timestamp formats just in case
        const dateObj = typeof job.scheduled_date === 'string' 
          ? new Date(job.scheduled_date) 
          : job.scheduled_date.toDate ? job.scheduled_date.toDate() : new Date();
        dateStr = dateObj.toISOString().split('T')[0];
      } catch (e) {
        console.error("Error parsing date:", e);
      }
    }
    setEditDate(dateStr);
    setEditNotes(job.internal_notes || '');
    setErrorMessage(null);
  };

  const handleAddQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    let customerId = selectedCustomerId;
    let customerName = '';
    let fullAddress = '';
    let phone = '';

    try {
      if (isCreatingNewCustomer) {
        const newCustomer = await customerService.addCustomer({
          name: newCustomerName,
          phone: newCustomerPhone,
          email: newCustomerEmail,
          street: newCustomerStreet,
          line2: newCustomerLine2,
          city: newCustomerCity,
          state: newCustomerState,
          zip: newCustomerZip,
          status: 'active',
          notes: newCustomerNotes || 'Created via Quote flow',
          access_notes: newCustomerAccessNotes
        });
        if (newCustomer) {
          customerId = newCustomer.id!;
          customerName = newCustomerName;
          fullAddress = [newCustomerStreet, newCustomerLine2, newCustomerCity, newCustomerState, newCustomerZip].filter(Boolean).join(', ');
          phone = newCustomerPhone;
        }
      } else {
        const customer = customers.find(c => c.id === selectedCustomerId);
        if (!customer) return;
        customerId = customer.id!;
        customerName = customer.name;
        fullAddress = [customer.street, customer.line2, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
        phone = customer.phone || '';
      }

      let finalServiceType = customServiceType;
      if (selectedServicePlanId !== 'custom') {
        const plan = servicePlans.find(p => p.id === selectedServicePlanId);
        if (plan) finalServiceType = plan.name;
      }

      const quotePayload: any = {
        customerId,
        customer_name_snapshot: customerName,
        address_snapshot: fullAddress,
        phone_snapshot: phone,
        service_snapshot: finalServiceType,
        price_snapshot: Number(price) || 0,
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        status: 'quote',
        payment_status: 'unpaid',
        visibility_mode: 'internal_only',
        is_billable: true,
        is_recurring: serviceSetupType === 'recurring' || serviceSetupType === 'flexible',
        billing_frequency: serviceSetupType === 'recurring' ? billingFrequency : (serviceSetupType === 'flexible' ? 'flexible' : 'one-time'),
        service_setup_type: serviceSetupType,
        internal_notes: internalNotes || '',
        customer_notes: '',
        created_at: serverTimestamp()
      };

      await jobService.addJob(quotePayload);
      setIsAdding(false);
      resetForm();
    } catch (error: any) {
      console.error('Error adding quote:', error);
      setErrorMessage('Failed to create quote. Please try again.');
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setSelectedServicePlanId('');
    setCustomServiceType('');
    setPrice('');
    setScheduledDate('');
    setBillingFrequency('one-time');
    setServiceSetupType('one-time');
    setInternalNotes('');
    setIsCreatingNewCustomer(false);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerEmail('');
    setNewCustomerStreet('');
    setNewCustomerLine2('');
    setNewCustomerCity('');
    setNewCustomerState('');
    setNewCustomerZip('');
    setNewCustomerNotes('');
    setNewCustomerAccessNotes('');
  };

  const handleConvertQuoteToJob = async (quote: Job) => {
    try {
      const updateData: Partial<Job> = {
        status: quote.service_setup_type === 'one-time' ? 'pending' : 'approved',
        approved_at: serverTimestamp()
      };

      if (quote.service_setup_type === 'recurring' || quote.service_setup_type === 'flexible') {
        const plan = await recurringService.addPlan({
          customerId: quote.customerId,
          name: quote.service_snapshot,
          price: quote.price_snapshot,
          frequency: quote.billing_frequency as BillingFrequency,
          status: 'active',
          start_date: quote.scheduled_date || new Date().toISOString(),
          next_due_date: quote.scheduled_date || new Date().toISOString(),
          notes: quote.internal_notes || ''
        });
        if (plan) {
          updateData.recurringPlanId = plan.id;
          if (!quote.scheduled_date) {
            updateData.scheduled_date = new Date().toISOString();
          }
        }
      }

      await jobService.updateJob(quote.id!, updateData);
      setActiveTab('today');
    } catch (error) {
      console.error('Error converting quote:', error);
      setErrorMessage('Failed to convert quote to job.');
    }
  };
  const handleSkipJob = async (job: Job) => {
    if (!job.id || !job.recurringPlanId || !job.billing_frequency) return;
    setErrorMessage(null);

    try {
      const nextDate = await recurringService.calculateNextDueDate(new Date(), job.billing_frequency as BillingFrequency, recurringPlans.find(p => p.id === job.recurringPlanId));
      
      // Update job to skipped
      await jobService.updateJob(job.id, { status: 'skipped' });

      // Update recurring plan next due date
      await recurringService.updatePlan(job.recurringPlanId, {
        next_due_date: nextDate.toISOString()
      });

      // Create next job
      await jobService.addJob({
        ...job,
        id: undefined,
        status: 'approved',
        scheduled_date: nextDate.toISOString(),
        completed_date: null,
        payment_status: 'unpaid',
        share_token: undefined,
        visibility_mode: 'internal_only'
      });
    } catch (error: any) {
      console.error('Error skipping job:', error);
      setErrorMessage('Failed to skip job.');
    }
  };

  const handleDelayJob = async (job: Job, days: number) => {
    if (!job.id || !job.scheduled_date) return;
    setErrorMessage(null);

    try {
      const currentScheduled = new Date(job.scheduled_date);
      currentScheduled.setDate(currentScheduled.getDate() + days);
      
      await jobService.updateJob(job.id, {
        scheduled_date: currentScheduled.toISOString(),
        status: 'delayed'
      });
    } catch (error: any) {
      console.error('Error delaying job:', error);
      setErrorMessage('Failed to delay job.');
    }
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob || !editingJob.id) return;
    setErrorMessage(null);

    try {
      await jobService.updateJob(editingJob.id, {
        price_snapshot: editPrice ? parseFloat(editPrice) : 0,
        scheduled_date: editDate ? new Date(editDate).toISOString() : null,
        internal_notes: editNotes
      });

      // If it's a recurring job, we might also want to update the recurring plan
      if (editingJob.recurringPlanId) {
        await recurringService.updatePlan(editingJob.recurringPlanId, {
          price: editPrice ? parseFloat(editPrice) : 0
        });
      }

      setEditingJob(null);
    } catch (error: any) {
      console.error('Error updating job:', error);
      let msg = 'Failed to update job. Please check your permissions and try again.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Update failed: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }
      setErrorMessage(msg);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await jobService.deleteJob(jobId);
      setConfirmingAction(null);
      if (viewingJob?.id === jobId) setViewingJob(null);
    } catch (error: any) {
      console.error('Error deleting job:', error);
      setErrorMessage('Failed to delete job. Please try again.');
    }
  };

  const getJobStatusColor = (job: Job) => {
    if (job.status === 'completed') return 'bg-green-50 text-green-600';
    if (job.status === 'quote') return 'bg-purple-50 text-purple-600';
    if (!job.scheduled_date) return 'bg-blue-50 text-blue-600';

    const scheduledDate = new Date(job.scheduled_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    scheduledDate.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - scheduledDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const grace = businessSettings?.grace_ranges || { due_grace_days: 0, overdue_grace_days: 4, critical_overdue_days: 5 };

    if (diffDays <= grace.due_grace_days) return 'bg-green-50 text-green-600'; // Upcoming or Today (within grace)
    if (diffDays <= grace.overdue_grace_days) return 'bg-orange-50 text-orange-600'; // Recently overdue
    return 'bg-red-50 text-red-600'; // Critical (Red)
  };

  const getJobStatusBadge = (job: Job) => {
    if (job.status === 'completed') return 'bg-green-100 text-green-700';
    if (job.status === 'quote') return 'bg-purple-100 text-purple-700';
    if (!job.scheduled_date) return 'bg-blue-100 text-blue-700';

    const scheduledDate = new Date(job.scheduled_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    scheduledDate.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - scheduledDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const grace = businessSettings?.grace_ranges || { due_grace_days: 0, overdue_grace_days: 4, critical_overdue_days: 5 };

    if (diffDays <= grace.due_grace_days) return 'bg-green-100 text-green-700';
    if (diffDays <= grace.overdue_grace_days) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  const filteredJobs = jobs.filter(job => {
    // Search filter
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      job.customer_name_snapshot.toLowerCase().includes(searchLower) ||
      job.service_snapshot.toLowerCase().includes(searchLower) ||
      job.address_snapshot.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    if (activeTab === 'completed') return job.status === 'completed';
    if (activeTab === 'due') return job.status === 'skipped' || job.status === 'delayed' || job.status === 'quote';
    
    if (activeTab === 'today') {
      if (job.status === 'completed' || job.status === 'skipped' || job.status === 'delayed' || job.status === 'quote') return false;
      if (!job.scheduled_date) return job.status === 'approved' || job.status === 'pending';
      const isToday = new Date(job.scheduled_date).toDateString() === new Date().toDateString();
      return isToday;
    }
    if (activeTab === 'upcoming') {
      if (job.status === 'completed' || job.status === 'skipped' || job.status === 'delayed') return false;
      if (!job.scheduled_date) return false;
      const isFuture = new Date(job.scheduled_date) > new Date();
      return isFuture;
    }
    return true;
  });

  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end px-2">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Jobs</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Track and verify work</p>
        </div>
      </header>

      {errorMessage && !isAdding && !verifyingJobId && !sharingJob && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-2xl shadow-sm">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <p className="text-sm font-bold text-red-700">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs & Search */}
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
          <button 
            onClick={() => setActiveTab('today')}
            className={`flex-1 min-w-[80px] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === 'today' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Today
          </button>
          <button 
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 min-w-[80px] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === 'upcoming' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Upcoming
          </button>
          <button 
            onClick={() => setActiveTab('due')}
            className={`flex-1 min-w-[80px] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === 'due' ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Due
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={`flex-1 min-w-[80px] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === 'completed' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            History
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
            <User className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search jobs, customers, or addresses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-100 rounded-[24px] py-5 pl-14 pr-6 text-sm font-bold text-gray-900 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Jobs List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredJobs.length === 0 ? (
          <div className="col-span-full bg-gray-50 rounded-3xl p-16 text-center border-2 border-dashed border-gray-200">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No jobs found</p>
          </div>
        ) : (
          filteredJobs.map(job => (
            <div key={job.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${getJobStatusColor(job)}`}>
                    {job.customer_name_snapshot.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight">{job.service_snapshot}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{job.customer_name_snapshot}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${getJobStatusBadge(job)}`}>
                  {job.status === 'pending' ? 'Pending' : job.status === 'quote' ? 'Quote' : job.status}
                </span>
              </div>
              
              <div className="space-y-2 mb-6">
                <div className="flex items-center text-sm font-bold text-gray-500">
                  <Calendar className="h-4 w-4 mr-2 text-blue-600" />
                  {job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-gray-500">
                  <div className="flex items-center flex-1 min-w-0">
                    <MapPin className="h-4 w-4 mr-2 text-blue-600 flex-shrink-0" />
                    <span className="truncate">{job.address_snapshot || 'No address'}</span>
                  </div>
                  {job.address_snapshot && job.address_snapshot !== 'No address' && (
                    <button 
                      onClick={() => openMap(job.address_snapshot)}
                      className="ml-2 p-2 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    >
                      <Map className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="mt-auto flex flex-wrap gap-3">
                {job.status === 'quote' && (
                  <button 
                    onClick={() => handleConvertQuoteToJob(job)}
                    className="flex-1 min-w-[120px] bg-green-600 text-white py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-700 shadow-lg shadow-green-100 flex justify-center items-center transition-all active:scale-95"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Quote
                  </button>
                )}

                {(job.status === 'approved' || job.status === 'pending' || job.status === 'delayed' || job.status === 'skipped') && (
                  <div className="flex w-full gap-2 mb-2">
                    <button 
                      onClick={() => handleSkipJob(job)}
                      className="flex-1 bg-gray-50 text-gray-600 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all active:scale-95 flex items-center justify-center"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Skip
                    </button>
                    <button 
                      onClick={() => handleDelayJob(job, 1)}
                      className="flex-1 bg-gray-50 text-gray-600 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all active:scale-95 flex items-center justify-center"
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      +1 Day
                    </button>
                  </div>
                )}

                {job.status === 'pending' && (
                  <button 
                    onClick={() => handleApproveJob(job.id!)}
                    className="flex-1 min-w-[120px] bg-green-600 text-white py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-700 shadow-lg shadow-green-100 flex justify-center items-center transition-all active:scale-95"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </button>
                )}
                
                <button 
                  onClick={() => {
                    if (job.status === 'completed') {
                      setConfirmingAction({ type: 'edit', job });
                    } else {
                      handleEditJob(job);
                    }
                  }}
                  className="flex-1 min-w-[120px] bg-gray-50 text-gray-600 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all active:scale-95"
                >
                  Edit
                </button>

                {job.status === 'completed' ? (
                  <>
                    <button 
                      onClick={() => handleShareJob(job)}
                      className="flex-1 min-w-[120px] bg-blue-50 text-blue-600 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 flex justify-center items-center transition-all active:scale-95"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share Proof
                    </button>
                    <button 
                      onClick={() => setConfirmingAction({ type: 'delete', job })}
                      className="flex-1 min-w-[120px] bg-red-50 text-red-600 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-all active:scale-95"
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => setViewingJob(job)}
                      className="flex-1 min-w-[120px] bg-gray-50 text-gray-600 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all active:scale-95"
                    >
                      Details
                    </button>
                    <button 
                      onClick={() => setVerifyingJobId(job.id!)}
                      className="flex-1 min-w-[120px] bg-blue-600 text-white py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 flex justify-center items-center transition-all active:scale-95"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Verify
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Job Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[200] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-lg rounded-[40px] p-8 overflow-y-auto shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Briefcase className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Edit Job</h3>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Update service details</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingJob(null)} 
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-2xl shadow-sm flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm font-bold text-red-700">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleUpdateJob} className="space-y-6">
              <div className="space-y-5">
                <div className="bg-gray-50 p-6 rounded-3xl space-y-4 border border-gray-100">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Customer</label>
                    <div className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 text-sm font-black text-gray-400">
                      {editingJob.customer_name_snapshot}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Service Type</label>
                    <div className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 text-sm font-black text-gray-400">
                      {editingJob.service_snapshot}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Price ($)</label>
                    <input 
                      type="number" 
                      required 
                      min="0" 
                      step="0.01" 
                      value={editPrice} 
                      onChange={e => setEditPrice(e.target.value)} 
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 text-sm font-black text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Scheduled Date</label>
                    <input 
                      type="date" 
                      value={editDate} 
                      onChange={e => setEditDate(e.target.value)} 
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 text-sm font-black text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Internal Notes</label>
                  <textarea 
                    value={editNotes} 
                    onChange={e => setEditNotes(e.target.value)} 
                    rows={4} 
                    placeholder="Add any specific instructions..." 
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none resize-none" 
                  />
                </div>

              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  className="w-full bg-blue-600 text-white py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Job Details Modal */}
      {viewingJob && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[200] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-lg rounded-[40px] p-8 overflow-y-auto shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Briefcase className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Job Details</h3>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Service Information</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setViewingJob(null)} 
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-8">
              {/* Core Info */}
              <div className="bg-gray-50 rounded-3xl p-6 space-y-6 border border-gray-100">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</h4>
                    <p className="text-sm font-black text-gray-900 leading-tight">{viewingJob.customer_name_snapshot}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Service Type</h4>
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded-lg uppercase tracking-widest">
                      {viewingJob.service_snapshot}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200/50">
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Scheduled</h4>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      {new Date(viewingJob.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Price</h4>
                    <p className="text-sm font-black text-gray-900">${viewingJob.price_snapshot.toFixed(2)}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200/50">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Location</h4>
                  <div className="flex items-start gap-2 text-sm font-bold text-gray-700">
                    <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <p>{viewingJob.address_snapshot || 'No address provided'}</p>
                  </div>
                </div>
              </div>

              {/* Notes Sections */}
              {(viewingJob.customer_notes || viewingJob.internal_notes) && (
                <div className="space-y-4">
                  {viewingJob.customer_notes && (
                    <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-3xl">
                      <div className="flex items-center gap-2 mb-3">
                        <User className="h-4 w-4 text-blue-600" />
                        <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Customer Notes</h4>
                      </div>
                      <p className="text-sm font-bold text-blue-900 leading-relaxed">{viewingJob.customer_notes}</p>
                    </div>
                  )}
                  
                  {viewingJob.internal_notes && (
                    <div className="bg-gray-50 border border-gray-100 p-6 rounded-3xl">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="h-4 w-4 text-gray-400" />
                        <h4 className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Internal Notes</h4>
                      </div>
                      <p className="text-sm font-bold text-gray-600 leading-relaxed">{viewingJob.internal_notes}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4">
                <button 
                  type="button" 
                  onClick={() => setViewingJob(null)}
                  className="w-full py-5 bg-gray-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-200 active:scale-95"
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Success Modal */}
      {showShareSuccess && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[250] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl relative animate-in fade-in zoom-in duration-200 text-center">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">Job Completed!</h3>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Verification saved successfully</p>
            
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-8 text-left">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</p>
              <p className="text-sm font-black text-gray-900">{showShareSuccess.customer_name_snapshot}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{showShareSuccess.service_snapshot}</p>
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

      {/* Confirmation Modal */}
      {confirmingAction && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[400] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl relative animate-in fade-in zoom-in duration-200 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
              confirmingAction.type === 'delete' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
            }`}>
              {confirmingAction.type === 'delete' ? <X className="h-10 w-10" /> : <AlertCircle className="h-10 w-10" />}
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">
              {confirmingAction.type === 'delete' ? 'Delete Completed Job?' : 'Edit Completed Job?'}
            </h3>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">
              {confirmingAction.type === 'delete' 
                ? 'This action cannot be undone. All verification data will be lost.' 
                : 'Editing a completed job may affect service history records.'}
            </p>
            
            <div className="space-y-3">
              <button 
                onClick={() => {
                  console.log("Confirm button clicked, type:", confirmingAction.type, "job:", confirmingAction.job);
                  if (confirmingAction.type === 'delete') {
                    handleDeleteJob(confirmingAction.job.id!);
                  } else {
                    handleEditJob(confirmingAction.job);
                    setConfirmingAction(null);
                  }
                }}
                className={`w-full py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl transition-all ${
                  confirmingAction.type === 'delete' 
                    ? 'bg-red-600 text-white shadow-red-100 hover:bg-red-700' 
                    : 'bg-orange-600 text-white shadow-orange-100 hover:bg-orange-700'
                }`}
              >
                Confirm {confirmingAction.type}
              </button>
              <button 
                onClick={() => setConfirmingAction(null)}
                className="w-full bg-gray-50 text-gray-500 py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {sharingJob && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[350] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative animate-in fade-in zoom-in duration-200">
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
              <button onClick={() => setSharingJob(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
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
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{sharingJob.service_snapshot}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Price</p>
                    <p className="text-sm font-black text-blue-600">${sharingJob.price_snapshot}</p>
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
                        <ChevronLeft className="h-4 w-4" />
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
                    <textarea
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      className="w-full bg-transparent text-sm font-bold text-gray-600 leading-relaxed italic resize-none outline-none"
                      rows={4}
                    />
                    <button 
                      onClick={() => copyToClipboard(currentMessage)}
                      className="absolute top-2 right-2 p-2 bg-white text-gray-400 hover:text-blue-600 rounded-xl shadow-sm opacity-0 group-hover:opacity-100 transition-all border border-gray-100"
                    >
                      {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <ClipboardList className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Send via SMS Button */}
                  <a 
                    href={`sms:?body=${encodeURIComponent(currentMessage)}`}
                    className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Send via SMS
                  </a>

                  {/* Customer Copy Button */}
                  <button 
                    onClick={() => {
                      copyToClipboard(currentMessage);
                    }}
                    className="w-full py-3 px-4 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center justify-center gap-2 border border-blue-100"
                  >
                    <User className="h-3 w-3" />
                    Copy Customer Message
                  </button>

                  {/* Payment Copy Button */}
                  <button 
                    onClick={() => {
                      const proofLink = `${getPublicOrigin()}/#/proof/${sharingJob.id}/${sharingJob.share_token}`;
                      copyToClipboard(renderProofMessage(templates[currentTemplateIndex] || null, {
                        customerName: sharingJob.customer_name_snapshot,
                        serviceName: sharingJob.service_snapshot,
                        price: sharingJob.price_snapshot,
                        proofLink,
                        paymentDue: true
                      }));
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
                  <input 
                    type="text" 
                    readOnly 
                    value={`${getPublicOrigin()}/#/proof/${sharingJob.id}/${sharingJob.share_token}`}
                    className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-xs font-bold text-gray-600 outline-none"
                  />
                  <button 
                    onClick={() => copyToClipboard(`${getPublicOrigin()}/#/proof/${sharingJob.id}/${sharingJob.share_token}`)}
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
                    const url = `${getPublicOrigin()}/#/proof/${sharingJob.id}/${sharingJob.share_token}`;
                    if (navigator.share) {
                      navigator.share({
                        title: 'Service Proof',
                        text: currentMessage,
                        url: url
                      });
                    } else {
                      window.location.href = `mailto:?subject=Service Proof&body=${encodeURIComponent(currentMessage)}`;
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

      {/* Verify Job Modal */}
      {verifyingJobId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-lg rounded-3xl p-6 overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Finish Job</h3>
                <p className="text-sm text-gray-500">Complete the final steps for this service.</p>
              </div>
              <button onClick={() => { setVerifyingJobId(null); setErrorMessage(null); }} className="text-gray-400 hover:text-gray-500 p-1">
                <X className="h-6 w-6" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleVerifyJob} className="space-y-6">
              {/* Step 1: Photos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 1: Upload Photos</h4>
                  {verificationPhotoUrl && (
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase">Uploaded</span>
                  )}
                </div>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-200 border-dashed rounded-2xl relative overflow-hidden bg-gray-50 hover:bg-gray-100 transition-colors">
                  {verificationThumbnailUrl ? (
                    <div className="relative w-full">
                      <img src={verificationThumbnailUrl} alt="Preview" className="mx-auto h-40 w-full object-cover rounded-xl" />
                      <button 
                        type="button"
                        onClick={() => {
                          setVerificationPhotoUrl('');
                          setVerificationThumbnailUrl('');
                        }}
                        className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-red-600 rounded-full p-1.5 shadow-sm hover:bg-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 text-center">
                      <div className="flex gap-3 justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('file-upload-camera') as HTMLInputElement;
                            input?.click();
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-100 transition-all border border-blue-100"
                        >
                          <Camera className="h-4 w-4" />
                          Take Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('file-upload-gallery') as HTMLInputElement;
                            input?.click();
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-50 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all border border-gray-200"
                        >
                          <Upload className="h-4 w-4" />
                          Upload File
                        </button>
                      </div>
                      <input 
                        id="file-upload-camera" 
                        type="file" 
                        accept="image/*"
                        capture="environment"
                        className="sr-only" 
                        onChange={handlePhotoUpload}
                        disabled={isCompressing}
                      />
                      <input 
                        id="file-upload-gallery" 
                        type="file" 
                        accept="image/*"
                        className="sr-only" 
                        onChange={handlePhotoUpload}
                        disabled={isCompressing}
                      />
                      <p className="text-xs text-gray-400">Capture the completed work for the client.</p>
                    </div>
                  )}
                </div>
                {isCompressing && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 font-medium">
                    <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full" />
                    Optimizing image...
                  </div>
                )}
              </div>

              {/* Step 2: Communication */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 2: Client Communication</h4>
                
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1">Service Notes</label>
                    <textarea 
                      value={verificationNotes} 
                      onChange={e => setVerificationNotes(e.target.value)} 
                      rows={3} 
                      placeholder="Add a note for the customer..."
                      className="block w-full border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white" 
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">Include in Customer Message</span>
                      <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Show notes to client</span>
                    </div>
                    <div className="w-10 h-5 rounded-full bg-blue-600 relative cursor-pointer">
                      <div className="absolute top-1 left-6 w-3 h-3 rounded-full bg-white" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">Send Completion Notification</span>
                      <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">SMS & Email Alert</span>
                    </div>
                    <div className="w-10 h-5 rounded-full bg-blue-600 relative cursor-pointer">
                      <div className="absolute top-1 left-6 w-3 h-3 rounded-full bg-white" />
                    </div>
                  </div>
                </div>

                {/* SMS Preview */}
                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Preview of SMS</h5>
                  <div className="bg-[#E9E9EB] p-4 rounded-2xl rounded-bl-none max-w-[90%] relative">
                    <p className="text-sm text-gray-900 leading-relaxed">
                      Hi {jobs.find(j => j.id === verifyingJobId)?.customer_name_snapshot}, your {jobs.find(j => j.id === verifyingJobId)?.service_snapshot} is complete! 
                      {verificationNotes ? `\n\nNote: ${verificationNotes}` : ''}
                      {"\n\n"}View photos here: servtrax.com/p/abc123xyz
                    </p>
                    <div className="absolute -left-2 bottom-0 w-4 h-4 bg-[#E9E9EB] rounded-full" />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={isCompressing}
                  className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  Complete & Notify Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Quote Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-lg rounded-3xl p-8 overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Create Quote</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Draft a new service quote</p>
              </div>
              <button type="button" onClick={() => { setIsAdding(false); resetForm(); setErrorMessage(null); }} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-2xl">
                <p className="text-sm font-bold text-red-700">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleAddQuote} className="space-y-6">
              <div className="space-y-4">
                {/* Customer Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2 ml-1">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Customer</label>
                    <button 
                      type="button"
                      onClick={() => setIsCreatingNewCustomer(!isCreatingNewCustomer)}
                      className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors"
                    >
                      {isCreatingNewCustomer ? (
                        <><X className="h-3 w-3" /> Cancel New</>
                      ) : (
                        <><Plus className="h-3 w-3" /> New Customer</>
                      )}
                    </button>
                  </div>
                  
                  {isCreatingNewCustomer ? (
                    <div className="space-y-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 animate-in fade-in slide-in-from-top-2 duration-200">
                      <input 
                        type="text" 
                        required 
                        placeholder="Full Name" 
                        value={newCustomerName}
                        onChange={e => setNewCustomerName(e.target.value)}
                        className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          type="email" 
                          placeholder="Email" 
                          value={newCustomerEmail}
                          onChange={e => setNewCustomerEmail(e.target.value)}
                          className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <input 
                          type="tel" 
                          placeholder="Phone" 
                          value={newCustomerPhone}
                          onChange={e => setNewCustomerPhone(e.target.value)}
                          className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <input 
                          type="text" 
                          required 
                          placeholder="Service Address (Line 1)" 
                          value={newCustomerStreet}
                          onChange={e => setNewCustomerStreet(e.target.value)}
                          className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <input 
                          type="text" 
                          placeholder="Line 2 (Optional)" 
                          value={newCustomerLine2}
                          onChange={e => setNewCustomerLine2(e.target.value)}
                          className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input 
                            type="text" 
                            required 
                            placeholder="City" 
                            value={newCustomerCity}
                            onChange={e => setNewCustomerCity(e.target.value)}
                            className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <input 
                            type="text" 
                            required 
                            placeholder="ST" 
                            maxLength={2}
                            value={newCustomerState}
                            onChange={e => setNewCustomerState(e.target.value)}
                            className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <input 
                            type="text" 
                            required 
                            placeholder="Zip" 
                            value={newCustomerZip}
                            onChange={e => setNewCustomerZip(e.target.value)}
                            className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <textarea 
                          placeholder="Internal Notes (Optional)" 
                          value={newCustomerNotes}
                          onChange={e => setNewCustomerNotes(e.target.value)}
                          rows={2}
                          className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <textarea 
                          placeholder="Access Notes (Optional)" 
                          value={newCustomerAccessNotes}
                          onChange={e => setNewCustomerAccessNotes(e.target.value)}
                          rows={2}
                          className="w-full bg-white border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <select required value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                      <option value="" disabled>Select a customer</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Service Details */}
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Service Type</label>
                  <select required value={selectedServicePlanId} onChange={handleServicePlanChange} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                    <option value="" disabled>Select a service</option>
                    {servicePlans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (${p.price})</option>
                    ))}
                    <option value="custom">Custom Service...</option>
                  </select>
                </div>

                {selectedServicePlanId === 'custom' && (
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Custom Service Name</label>
                    <input type="text" required value={customServiceType} onChange={e => setCustomServiceType(e.target.value)} placeholder="e.g. One-time Cleanup" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Price ($)</label>
                    <input type="number" required min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Date (Optional)</label>
                    <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                  </div>
                </div>

                {/* Service Setup Type */}
                <div className="pt-4 border-t border-gray-50">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Service Setup</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['one-time', 'recurring', 'flexible'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setServiceSetupType(type)}
                        className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex flex-col items-center gap-1 ${
                          serviceSetupType === type 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' 
                            : 'bg-white text-gray-400 border-gray-100 hover:border-blue-200'
                        }`}
                      >
                        {type === 'one-time' && <Calendar className="h-3 w-3" />}
                        {type === 'recurring' && <Repeat className="h-3 w-3" />}
                        {type === 'flexible' && <Clock className="h-3 w-3" />}
                        {type.replace('-', ' ')}
                      </button>
                    ))}
                  </div>

                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Internal Notes</label>
                  <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2} placeholder="Add any specific instructions..." className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              </div>

              <div className="pt-4">
                <button type="submit" className="w-full bg-blue-600 text-white py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">
                  Create Quote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-24 right-6 sm:bottom-12 sm:right-12 flex flex-col gap-4 z-30">
        <button 
          onClick={() => { setIsAdding(true); setErrorMessage(null); }}
          className="bg-blue-600 text-white rounded-3xl p-5 shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:scale-110 transition-all group active:scale-95"
          title="Create Quote"
        >
          <Plus className="h-8 w-8 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>
    </div>
    </div>
  );
}
