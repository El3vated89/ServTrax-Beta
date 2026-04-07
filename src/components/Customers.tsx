import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, Phone, X, Map, History, Briefcase, Calendar, CheckCircle, Clock, Trash2, Snowflake } from 'lucide-react';
import { customerService, Customer } from '../services/customerService';
import { jobService, Job } from '../services/jobService';
import { Timestamp } from 'firebase/firestore';

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
  const [offSeasonEnabled, setOffSeasonEnabled] = useState(false);
  const [offSeasonRules, setOffSeasonRules] = useState<any[]>([]);
  const [customerJobs, setCustomerJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);

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
    setOffSeasonEnabled(customer.off_season_enabled || false);
    setOffSeasonRules(customer.off_season_rules || []);
  };

  useEffect(() => {
    const unsubscribe = customerService.subscribeToCustomers(setCustomers);
    const unsubscribeJobs = jobService.subscribeToJobs(setAllJobs);

    return () => {
      unsubscribe();
      unsubscribeJobs();
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

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCustomer && editingCustomer.id) {
        await customerService.updateCustomer(editingCustomer.id, {
          name,
          phone,
          email,
          street,
          city,
          state,
          zip,
          notes,
          off_season_enabled: offSeasonEnabled,
          off_season_rules: offSeasonRules,
        });
        setEditingCustomer(null);
      } else {
        await customerService.addCustomer({
          name,
          phone,
          email,
          street,
          city,
          state,
          zip,
          notes,
          status: 'active',
          off_season_enabled: offSeasonEnabled,
          off_season_rules: offSeasonRules,
        });
        setIsAdding(false);
      }
      setName('');
      setPhone('');
      setEmail('');
      setStreet('');
      setCity('');
      setState('');
      setZip('');
      setNotes('');
      setOffSeasonEnabled(false);
      setOffSeasonRules([]);
    } catch (error) {
      console.error('Error saving customer:', error);
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
    setOffSeasonEnabled(false);
    setOffSeasonRules([]);
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
                    <div>
                      <h3 className="text-lg font-black text-gray-900 leading-tight">{customer.name}</h3>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${customer.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {customer.status}
                      </span>
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
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-lg rounded-3xl p-8 overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{editingCustomer ? 'Edit Client' : 'Add Client'}</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Customer information and details</p>
              </div>
              <button type="button" onClick={closeEditModal} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-6">
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

                <div className="pt-4 border-t border-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Snowflake className="h-4 w-4 text-blue-600" />
                      <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Off-Season Overrides</h4>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={offSeasonEnabled} onChange={e => setOffSeasonEnabled(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {offSeasonEnabled && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer-specific seasonal rules</p>
                        <button
                          type="button"
                          onClick={() => setOffSeasonRules([...offSeasonRules, { start_date: '11-01', end_date: '03-31', interval_days: 14, label: 'Winter' }])}
                          className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700"
                        >
                          + Add Rule
                        </button>
                      </div>

                      {offSeasonRules.map((rule, idx) => (
                        <div key={idx} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                          <div className="flex justify-between items-center">
                            <input 
                              type="text" 
                              placeholder="Rule Label" 
                              value={rule.label}
                              onChange={e => {
                                const newRules = [...offSeasonRules];
                                newRules[idx].label = e.target.value;
                                setOffSeasonRules(newRules);
                              }}
                              className="text-xs font-black text-gray-900 bg-transparent border-none p-0 focus:ring-0 w-full"
                            />
                            <button 
                              type="button" 
                              onClick={() => setOffSeasonRules(offSeasonRules.filter((_, i) => i !== idx))}
                              className="p-1 text-gray-400 hover:text-red-500 transition-all"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Start</label>
                              <input 
                                type="text" 
                                placeholder="MM-DD"
                                value={rule.start_date}
                                onChange={e => {
                                  const newRules = [...offSeasonRules];
                                  newRules[idx].start_date = e.target.value;
                                  setOffSeasonRules(newRules);
                                }}
                                className="w-full bg-white border-gray-100 rounded-lg py-2 px-3 text-xs font-bold text-gray-900 outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">End</label>
                              <input 
                                type="text" 
                                placeholder="MM-DD"
                                value={rule.end_date}
                                onChange={e => {
                                  const newRules = [...offSeasonRules];
                                  newRules[idx].end_date = e.target.value;
                                  setOffSeasonRules(newRules);
                                }}
                                className="w-full bg-white border-gray-100 rounded-lg py-2 px-3 text-xs font-bold text-gray-900 outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Days</label>
                              <input 
                                type="number" 
                                value={rule.interval_days}
                                onChange={e => {
                                  const newRules = [...offSeasonRules];
                                  newRules[idx].interval_days = Number(e.target.value);
                                  setOffSeasonRules(newRules);
                                }}
                                className="w-full bg-white border-gray-100 rounded-lg py-2 px-3 text-xs font-bold text-gray-900 outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Internal Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Gate codes, pet info, etc..." className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
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
                <button type="submit" className="w-full bg-blue-600 text-white py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">
                  {editingCustomer ? 'Update Client' : 'Save Client'}
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
