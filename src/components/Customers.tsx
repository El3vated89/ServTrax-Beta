import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, Phone, X, Map, History, CheckCircle, Clock, Copy, Link as LinkIcon, RefreshCcw } from 'lucide-react';
import { customerService, Customer } from '../services/customerService';
import { jobService, Job } from '../services/jobService';
import { quoteService, Quote } from '../services/quoteService';
import { customerPortalService } from '../services/customerPortalService';
import { BillingFramework, BusinessPlanProfile, planConfigService } from '../services/planConfigService';
import { Timestamp, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { savePipelineService } from '../services/savePipelineService';

export default function Customers() {
  const location = useLocation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [notes, setNotes] = useState('');
  const [customerJobs, setCustomerJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<BusinessPlanProfile | null>(null);
  const [billingFramework, setBillingFramework] = useState<BillingFramework | null>(null);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portalShowHistory, setPortalShowHistory] = useState(true);
  const [portalShowPaymentStatus, setPortalShowPaymentStatus] = useState(false);
  const [portalShowQuotes, setPortalShowQuotes] = useState(true);
  const [portalToken, setPortalToken] = useState('');
  const [portalCopied, setPortalCopied] = useState(false);
  const portalCapabilities = customerPortalService.getCapabilities(businessProfile, billingFramework);
  const portalLink = editingCustomer?.id && portalToken
    ? customerPortalService.buildPortalLink(editingCustomer.id, portalToken)
    : '';

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone || '');
    setEmail(customer.email || '');
    setStreet(customer.street || '');
    setCity(customer.city || '');
    setState(customer.state || '');
    setZip(customer.zip || '');
    setNotes(customer.notes || '');
    setPortalEnabled(!!customer.portal_enabled);
    setPortalShowHistory(customer.portal_show_history ?? true);
    setPortalShowPaymentStatus(!!customer.portal_show_payment_status);
    setPortalShowQuotes(customer.portal_show_quotes ?? true);
    setPortalToken(customer.portal_token || '');
    setPortalCopied(false);
  };

  useEffect(() => {
    const unsubscribe = customerService.subscribeToCustomers(setCustomers);
    const unsubscribeJobs = jobService.subscribeToJobs(setAllJobs);
    const unsubscribeQuotes = quoteService.subscribeToQuotes(setQuotes);
    const unsubscribeFramework = planConfigService.subscribeToFramework(setBillingFramework);
    let unsubscribeProfile = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeProfile();

      if (!user) {
        setBusinessProfile(null);
        return;
      }

      unsubscribeProfile = onSnapshot(doc(db, 'business_profiles', user.uid), (profileSnap) => {
        if (!profileSnap.exists()) {
          setBusinessProfile(null);
          return;
        }

        setBusinessProfile(profileSnap.data() as BusinessPlanProfile);
      }, () => {
        setBusinessProfile(null);
      });
    });

    return () => {
      unsubscribe();
      unsubscribeJobs();
      unsubscribeQuotes();
      unsubscribeFramework();
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (customers.length === 0) return;

    if (location.state?.editingCustomerId) {
      const customer = customers.find(c => c.id === location.state.editingCustomerId);
      if (customer) {
        openEditModal(customer);
        navigate(location.pathname, { replace: true });
      }
    }
    if (location.state?.openAddModal) {
      setIsAdding(true);
      navigate(location.pathname, { replace: true });
    }
  }, [customers, location.state, location.pathname, navigate]);

  useEffect(() => {
    if (editingCustomer) {
      const jobs = allJobs.filter(j => j.customerId === editingCustomer.id);
      setCustomerJobs(jobs.sort((a, b) => {
        const dateA = a.created_at instanceof Timestamp ? a.created_at.toDate() : new Date(a.created_at);
        const dateB = b.created_at instanceof Timestamp ? b.created_at.toDate() : new Date(b.created_at);
        return dateB.getTime() - dateA.getTime();
      }));
    } else {
      setCustomerJobs([]);
    }
  }, [editingCustomer, allJobs]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    if (!portalCopied) return undefined;
    const timeout = window.setTimeout(() => setPortalCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [portalCopied]);

  useEffect(() => {
    if (!editingCustomer || !portalCapabilities.allowsPortal || !portalEnabled || portalToken) return;
    setPortalToken(customerPortalService.createPortalToken());
  }, [editingCustomer, portalCapabilities.allowsPortal, portalEnabled, portalToken]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const debugContext = {
      flow: editingCustomer ? 'customer_update' : 'customer_create',
      traceId: savePipelineService.createTraceId(editingCustomer ? 'customer_update' : 'customer_create'),
    };

    savePipelineService.log(debugContext, 'save_started');
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingCustomer(true);
    try {
      if (editingCustomer && editingCustomer.id) {
        savePipelineService.log(debugContext, 'validation_passed');
        const nextPortalEnabled = portalCapabilities.allowsPortal ? portalEnabled : false;
        const nextPortalToken = nextPortalEnabled ? (portalToken || customerPortalService.createPortalToken()) : '';
        const updates: Partial<Customer> = {
          name,
          phone,
          email,
          street,
          city,
          state,
          zip,
          notes,
          status: editingCustomer.status || 'active',
          portal_enabled: nextPortalEnabled,
          portal_token: nextPortalToken || '',
          portal_plan_name_snapshot: portalCapabilities.planLabel,
          portal_persistent_allowed: portalCapabilities.allowsPersistentPortal,
          portal_show_history: nextPortalEnabled ? portalShowHistory : false,
          portal_show_payment_status: nextPortalEnabled ? portalShowPaymentStatus : false,
          portal_show_quotes: nextPortalEnabled ? portalShowQuotes : false,
        };

        const customerUpdateResponse = await savePipelineService.withTimeout(
          customerService.updateCustomer(editingCustomer.id, updates),
          {
            timeoutMs: 25000,
            timeoutMessage: 'Client update took too long and was stopped. Please try again.',
            debugContext,
          }
        );
        savePipelineService.log(debugContext, 'response_received', 'customer_updated');

        const updatedCustomer: Customer = {
          ...editingCustomer,
          ...updates,
          ownerId: editingCustomer.ownerId,
          name,
          phone,
          email,
          street,
          city,
          state,
          zip,
          notes,
          portal_token: nextPortalToken || '',
        };

        if (nextPortalEnabled) {
          setPortalToken(nextPortalToken);
          await savePipelineService.withTimeout(
            customerPortalService.syncPortalContent(updatedCustomer, allJobs, quotes, portalCapabilities.planLabel),
            {
              timeoutMs: 25000,
              timeoutMessage: 'Portal sync took too long and was stopped. The client record saved, but portal content will need another try.',
              debugContext,
            }
          );
        } else {
          await savePipelineService.withTimeout(customerPortalService.disablePortal(editingCustomer.id), {
            timeoutMs: 25000,
            timeoutMessage: 'Portal disable took too long and was stopped. The client record saved, but portal cleanup will need another try.',
            debugContext,
          });
        }

        setEditingCustomer(null);
        savePipelineService.log(debugContext, 'ui_success_handler_fired');
        setSuccessMessage('Client updated successfully.');
      } else {
        savePipelineService.log(debugContext, 'validation_passed');
        const customerCreateResponse = await savePipelineService.withTimeout(
          customerService.addCustomer({
            name,
            phone,
            email,
            street,
            city,
            state,
            zip,
            notes,
            status: 'active',
          }),
          {
            timeoutMs: 25000,
            timeoutMessage: 'Client save took too long and was stopped. Please try again.',
            debugContext,
          }
        );
        savePipelineService.log(debugContext, 'response_received', customerCreateResponse?.id || 'customer_saved');
        setIsAdding(false);
        savePipelineService.log(debugContext, 'ui_success_handler_fired');
        setSuccessMessage('Client added successfully.');
      }
      setName('');
      setPhone('');
      setEmail('');
      setStreet('');
      setCity('');
      setState('');
      setZip('');
      setNotes('');
    } catch (error) {
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      console.error('Error saving customer:', error);
      const nextMessage = error instanceof Error && error.message
        ? error.message
        : 'Failed to save client.';
      setErrorMessage(nextMessage);
    } finally {
      setIsSavingCustomer(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  const closeEditModal = () => {
    setEditingCustomer(null);
    setIsAdding(false);
    setName('');
    setPhone('');
    setEmail('');
    setStreet('');
    setCity('');
    setState('');
    setZip('');
    setNotes('');
    setPortalEnabled(false);
    setPortalShowHistory(true);
    setPortalShowPaymentStatus(false);
    setPortalShowQuotes(true);
    setPortalToken('');
    setPortalCopied(false);
  };

  const filteredCustomers = customers.filter(c => {
    const searchLower = searchQuery.toLowerCase();
    const fullAddress = `${c.street} ${c.city} ${c.state} ${c.zip}`.toLowerCase();
    return (
      c.name.toLowerCase().includes(searchLower) ||
      fullAddress.includes(searchLower) ||
      (c.phone && c.phone.includes(searchLower)) ||
      (c.email && c.email.toLowerCase().includes(searchLower))
    );
  });

  const getFullAddress = (c: Customer) => {
    const parts = [c.street, c.city, c.state, c.zip].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'No address';
  };

  const openMap = (address: string) => {
    window.open(`https://maps.google.com/?q=${encodeURIComponent(address)}`, '_blank');
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end px-2">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Clients</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Manage your customer base</p>
        </div>
      </header>

      {errorMessage && (
        <div className="mx-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
          <p className="text-sm font-bold text-red-700">{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="mx-2 rounded-2xl border border-green-100 bg-green-50 px-4 py-3">
          <p className="text-sm font-bold text-green-700">{successMessage}</p>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-14 pr-6 py-5 bg-white border border-gray-100 rounded-3xl text-sm font-bold text-gray-900 placeholder:text-gray-300 shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none"
          placeholder="Search clients by name, address, phone..."
        />
      </div>

      {/* Customer List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full bg-gray-50 rounded-3xl p-16 text-center border-2 border-dashed border-gray-200">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No clients found</p>
          </div>
        ) : (
          filteredCustomers.map(customer => {
            const fullAddress = getFullAddress(customer);
            return (
              <div key={customer.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center font-black text-lg text-blue-600">
                      {customer.name.charAt(0)}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-black text-gray-900 leading-tight">{customer.name}</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${customer.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {customer.status}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                          customer.portal_enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          Portal {customer.portal_enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => openEditModal(customer)}
                    className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                  >
                    <Plus className="h-5 w-5 rotate-45" />
                  </button>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center text-sm font-bold text-gray-500">
                    <MapPin className="h-4 w-4 mr-2 text-blue-600 flex-shrink-0" />
                    <span className="truncate">{fullAddress}</span>
                    {fullAddress !== 'No address' && (
                      <button 
                        onClick={() => openMap(fullAddress)}
                        className="ml-2 p-1.5 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Map className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center text-sm font-bold text-gray-500">
                    <Phone className="h-4 w-4 mr-2 text-blue-600 flex-shrink-0" />
                    {customer.phone || 'No phone'}
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-50">
                  <button 
                    onClick={() => openEditModal(customer)} 
                    className="w-full py-3 px-4 bg-gray-50 text-gray-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                  >
                    View Details
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Customer Modal */}
      {(isAdding || editingCustomer) && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[110] flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-8 pt-8 pb-6 border-b border-gray-100">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{editingCustomer ? 'Edit Client' : 'Add Client'}</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Customer information and details</p>
              </div>
              <button type="button" onClick={closeEditModal} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="flex-1 overflow-y-auto px-8 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Smith" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Phone Number</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                  </div>
                </div>
                
                <div className="pt-4 border-t border-gray-50">
                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4">Service Address</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Street Address</label>
                      <input type="text" required value={street} onChange={e => setStreet(e.target.value)} placeholder="123 Main St" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                    </div>
                    <div className="grid grid-cols-6 gap-3">
                      <div className="col-span-3">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">City</label>
                        <input type="text" required value={city} onChange={e => setCity(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">ST</label>
                        <input type="text" required value={state} onChange={e => setState(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Zip</label>
                        <input type="text" required value={zip} onChange={e => setZip(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Internal Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Gate codes, pet info, etc..." className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                </div>

                <div className="pt-6 border-t border-gray-50 space-y-4">
                  <div>
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Customer Portal</h4>
                    <p className="text-xs font-bold text-gray-500">
                      Temporary proof links stay per-job. The customer portal is a separate persistent customer-facing history view.
                    </p>
                  </div>

                  {!editingCustomer ? (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <p className="text-xs font-bold text-gray-500">Save this client first to enable portal access.</p>
                    </div>
                  ) : !portalCapabilities.allowsPortal ? (
                    <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                      <p className="text-xs font-bold text-amber-700">
                        {portalCapabilities.planLabel} uses temporary proof links only. Persistent customer portal access starts on Starter or Pro.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Access Mode</p>
                          <p className="text-sm font-black text-gray-900 mt-2">
                            {portalEnabled ? 'Persistent Portal' : 'Temporary Links Only'}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">
                            Per customer
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Portal Plan</p>
                          <p className="text-sm font-black text-gray-900 mt-2">{portalCapabilities.planLabel}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">
                            Temporary proof links still separate
                          </p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-black text-gray-900">Enable Customer Portal</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Persistent portal access for this customer
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPortalEnabled((prev) => !prev)}
                            className={`w-12 h-6 rounded-full transition-all relative ${portalEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${portalEnabled ? 'left-7' : 'left-1'}`} />
                          </button>
                        </div>

                        <div className={`${portalEnabled ? '' : 'opacity-50 pointer-events-none'} space-y-3`}>
                          <div className="bg-white rounded-2xl p-4 border border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Portal Customization</p>
                            <p className="text-xs font-bold text-gray-500 mt-2">
                              Control what this customer can see in the portal. Internal notes and internal-only proof never appear here.
                            </p>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-black text-gray-900">Show Job History</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Completed shareable proof history</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPortalShowHistory((prev) => !prev)}
                              className={`w-12 h-6 rounded-full transition-all relative ${portalShowHistory ? 'bg-blue-600' : 'bg-gray-200'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${portalShowHistory ? 'left-7' : 'left-1'}`} />
                            </button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-black text-gray-900">Show Payment Status</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Paid vs unpaid visibility</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPortalShowPaymentStatus((prev) => !prev)}
                              className={`w-12 h-6 rounded-full transition-all relative ${portalShowPaymentStatus ? 'bg-blue-600' : 'bg-gray-200'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${portalShowPaymentStatus ? 'left-7' : 'left-1'}`} />
                            </button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-black text-gray-900">Show Quotes</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer-visible quote snapshots</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPortalShowQuotes((prev) => !prev)}
                              className={`w-12 h-6 rounded-full transition-all relative ${portalShowQuotes ? 'bg-blue-600' : 'bg-gray-200'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${portalShowQuotes ? 'left-7' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {portalEnabled && portalLink && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Portal Link</p>
                            <button
                              type="button"
                              onClick={() => setPortalToken(customerPortalService.createPortalToken())}
                              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700"
                            >
                              <RefreshCcw className="h-3 w-3" />
                              Regenerate
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-[10px] font-bold text-gray-600 break-all leading-tight">
                              {portalLink}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(portalLink);
                                setPortalCopied(true);
                              }}
                              className={`px-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                                portalCopied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'
                              }`}
                            >
                              {portalCopied ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <a
                            href={portalLink}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full inline-flex items-center justify-center gap-2 py-4 bg-gray-50 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all border border-gray-100"
                          >
                            <LinkIcon className="h-4 w-4" />
                            Open Portal
                          </a>
                          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                            <p className="text-xs font-bold text-blue-700">
                              Portal access is persistent on {portalCapabilities.planLabel}. Temporary proof links stay separate and still expire by your storage settings.
                            </p>
                          </div>
                          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                            <p className="text-xs font-bold text-amber-700">
                              Temporary access mode: this portal currently opens with the portal link plus the customer phone number. This reduced-security placeholder is being logged in the portal record for later hardening.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {editingCustomer && (
                  <div className="pt-6 border-t border-gray-50">
                    <div className="flex items-center gap-2 mb-4">
                      <History className="h-4 w-4 text-blue-600" />
                      <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Service History</h4>
                    </div>
                    
                    <div className="space-y-3">
                      {customerJobs.length === 0 ? (
                        <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No service history found</p>
                        </div>
                      ) : (
                        customerJobs.map(job => (
                          <div 
                            key={job.id} 
                            onClick={() => navigate('/jobs', { state: { viewingJobId: job.id } })}
                            className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between group cursor-pointer hover:border-blue-200 hover:shadow-md transition-all"
                          >
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-xl ${job.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                {job.status === 'completed' ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                              </div>
                              <div>
                                <p className="text-sm font-black text-gray-900">{job.service_snapshot}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  {job.completed_date 
                                    ? `Completed: ${new Date(job.completed_date).toLocaleDateString()}`
                                    : `Scheduled: ${job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : 'TBD'}`}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-gray-900">${job.price_snapshot}</p>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${
                                job.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {job.status}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

                <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="w-full bg-blue-600 text-white py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingCustomer ? 'Saving...' : editingCustomer ? 'Update Client' : 'Save Client'}
                </button>
                </div>
              </form>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button 
        onClick={() => setIsAdding(true)}
        className="fixed bottom-24 right-6 sm:bottom-12 sm:right-12 bg-blue-600 text-white rounded-3xl p-5 shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:scale-110 transition-all z-30 group active:scale-95"
      >
        <Plus className="h-8 w-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>
    </div>
  );
}
