import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Plus, X, Save, AlertCircle, CheckCircle, Trash2, Briefcase, Upload, Snowflake, MessageSquare, HardDrive } from 'lucide-react';
import { servicePlanService, ServicePlan } from '../services/servicePlanService';
import { settingsService, BusinessSettings, DEFAULT_SETTINGS } from '../services/settingsService';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const createDefaultOffSeasonRule = () => ({
  start_date: '',
  end_date: '',
  interval_days: 7,
  label: 'Off-season',
  off_season_frequency: 'monthly'
});

export default function Settings() {
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  const [editingSeasonalPlanId, setEditingSeasonalPlanId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Plan Form
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const [planFrequency, setPlanFrequency] = useState<'one_time' | 'weekly' | 'bi_weekly' | 'monthly'>('one_time');
  const [planRequiresPhotos, setPlanRequiresPhotos] = useState(true);
  const [planSeasonalEnabled, setPlanSeasonalEnabled] = useState(false);
  const [planSeasonalRules, setPlanSeasonalRules] = useState<any[]>([]);
  const [confirmSeasonalRuleDelete, setConfirmSeasonalRuleDelete] = useState<{ planId?: string; draft?: boolean } | null>(null);

  // Business Profile Form
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessTagline, setBusinessTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [baseCampLabel, setBaseCampLabel] = useState('');
  const [baseCampAddress, setBaseCampAddress] = useState('');
  const [baseCampLat, setBaseCampLat] = useState<number | ''>('');
  const [baseCampLng, setBaseCampLng] = useState<number | ''>('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // System Preferences Form
  const [dueGraceDays, setDueGraceDays] = useState('0');
  const [overdueGraceDays, setOverdueGraceDays] = useState('4');
  const [criticalOverdueDays, setCriticalOverdueDays] = useState('5');
  const [tempLinkDuration, setTempLinkDuration] = useState('14');
  const [allowNoExpiration, setAllowNoExpiration] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingStorageSettings, setIsSavingStorageSettings] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const unsubscribe = servicePlanService.subscribeToServicePlans((data) => {
      setServicePlans(data);
    });

    const loadBusinessProfile = async () => {
      if (!auth.currentUser) return;
      const docRef = doc(db, 'business_profiles', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBusinessName(data.business_name || '');
        setBusinessPhone(data.phone || '');
        setBusinessEmail(data.email || '');
        setBusinessTagline(data.business_tagline || '');
        setLogoUrl(data.logo_url || '');
        setBusinessAddress(data.address || '');
        setBaseCampLabel(data.base_camp_label || '');
        setBaseCampAddress(data.base_camp_address || '');
        setBaseCampLat(data.base_camp_lat || '');
        setBaseCampLng(data.base_camp_lng || '');
      }
    };

    const loadSettings = async () => {
      const settingsData = await settingsService.getSettings();
      setSettings(settingsData);
      setDueGraceDays(settingsData.grace_ranges.due_grace_days.toString());
      setOverdueGraceDays(settingsData.grace_ranges.overdue_grace_days.toString());
      setCriticalOverdueDays(settingsData.grace_ranges.critical_overdue_days.toString());
      setTempLinkDuration(settingsData.storage_settings.temporary_link_duration_days.toString());
      setAllowNoExpiration(settingsData.storage_settings.allow_no_expiration || false);
    };

    loadBusinessProfile();
    loadSettings();

    return () => unsubscribe();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await settingsService.updateSettings({
        grace_ranges: {
          due_grace_days: Number(dueGraceDays),
          overdue_grace_days: Number(overdueGraceDays),
          critical_overdue_days: Number(criticalOverdueDays)
        }
      });
      setSuccessMessage('System settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setErrorMessage('Failed to save system settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveStorageSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStorageSettings(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await settingsService.updateSettings({
        storage_settings: {
          temporary_link_duration_days: Number(tempLinkDuration),
          allow_no_expiration: allowNoExpiration
        }
      });
      setSuccessMessage('Storage settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error saving storage settings:', error);
      setErrorMessage('Failed to save storage settings.');
    } finally {
      setIsSavingStorageSettings(false);
    }
  };

  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (editingPlanId) {
        await servicePlanService.updateServicePlan(editingPlanId, {
          name: planName,
          description: planDescription,
          price: Number(planPrice),
          billing_frequency: planFrequency,
          requires_photos: planRequiresPhotos,
          seasonal_enabled: planSeasonalEnabled,
          seasonal_rules: planSeasonalRules.slice(0, 1)
        });
        setSuccessMessage('Service plan updated successfully!');
      } else {
        await servicePlanService.addServicePlan({
          name: planName,
          description: planDescription,
          price: Number(planPrice),
          billing_frequency: planFrequency,
          requires_photos: planRequiresPhotos,
          seasonal_enabled: planSeasonalEnabled,
          seasonal_rules: planSeasonalRules.slice(0, 1)
        });
        setSuccessMessage('Service plan added successfully!');
      }
      setIsAddingPlan(false);
      setEditingPlanId(null);
      setPlanName('');
      setPlanDescription('');
      setPlanPrice('');
      setPlanFrequency('one_time');
      setPlanRequiresPhotos(true);
      setPlanSeasonalEnabled(false);
      setPlanSeasonalRules([]);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error saving service plan:', error);
      setErrorMessage('Failed to save service plan. Please check your permissions.');
    }
  };

  const toggleRequiresPhotos = async (plan: ServicePlan) => {
    if (!plan.id) return;
    try {
      await servicePlanService.updateServicePlan(plan.id, {
        requires_photos: !plan.requires_photos
      });
    } catch (error) {
      console.error('Error updating plan:', error);
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeletePlan = async (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await servicePlanService.deleteServicePlan(confirmDeleteId);
      setConfirmDeleteId(null);
    } catch (error) {
      console.error('Error deleting plan:', error);
    }
  };

  const confirmDeleteSeasonalRule = async () => {
    if (!confirmSeasonalRuleDelete) return;

    try {
      if (confirmSeasonalRuleDelete.draft) {
        setPlanSeasonalRules([]);
      } else if (confirmSeasonalRuleDelete.planId) {
        await servicePlanService.updateServicePlan(confirmSeasonalRuleDelete.planId, {
          seasonal_enabled: false,
          seasonal_rules: []
        });
      }
      setConfirmSeasonalRuleDelete(null);
    } catch (error) {
      console.error('Error deleting seasonal rule:', error);
      setErrorMessage('Failed to delete seasonal rule. Please check your permissions.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsSavingProfile(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const docRef = doc(db, 'business_profiles', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      const data = {
        ownerId: auth.currentUser.uid,
        business_name: businessName,
        phone: businessPhone,
        email: businessEmail,
        business_tagline: businessTagline,
        logo_url: logoUrl,
        address: businessAddress,
        base_camp_label: baseCampLabel,
        base_camp_address: baseCampAddress,
        base_camp_lat: baseCampLat === '' ? null : Number(baseCampLat),
        base_camp_lng: baseCampLng === '' ? null : Number(baseCampLng)
      };
      if (docSnap.exists()) {
        await updateDoc(docRef, data);
      } else {
        await setDoc(docRef, data);
      }
      setSuccessMessage('Business profile saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error saving business profile:', error);
      setErrorMessage('Failed to save business profile. Please check your permissions.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end px-2">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Settings</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Manage your business profile and services</p>
        </div>
      </header>

      {errorMessage && !isAddingPlan && (
        <div className="mx-2 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm font-bold text-red-700 flex-grow">{errorMessage}</p>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
            <X className="h-4 w-4 text-red-500" />
          </button>
        </div>
      )}

      {successMessage && !isAddingPlan && (
        <div className="mx-2 bg-green-50 border border-green-100 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-sm font-bold text-green-700 flex-grow">{successMessage}</p>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-green-100 rounded-lg transition-colors">
            <X className="h-4 w-4 text-green-500" />
          </button>
        </div>
      )}

      <div className="space-y-8">
        {/* Business Profile */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Business Profile</h3>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Business Logo</label>
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="h-16 w-16 bg-white rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <Upload className="h-6 w-6 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-gray-500 mb-2">Upload your business logo</p>
                    <input
                      type="text"
                      placeholder="Logo URL (Placeholder for future upload)"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2 px-4 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Business Name</label>
                <input type="text" required value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Velocity Services" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Business Tagline</label>
                <input type="text" value={businessTagline} onChange={e => setBusinessTagline(e.target.value)} placeholder="Your business tagline" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Business Phone</label>
                <input type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="(555) 000-0000" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Business Email</label>
                <input type="email" value={businessEmail} onChange={e => setBusinessEmail(e.target.value)} placeholder="office@velocity.com" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Business Address</label>
              <input type="text" value={businessAddress} onChange={e => setBusinessAddress(e.target.value)} placeholder="123 Business Way, Suite 100" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
            </div>

            <div className="pt-8 border-t border-gray-50">
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-6">Default Base Camp (Routing)</h4>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Base Camp Label</label>
                  <input type="text" value={baseCampLabel} onChange={e => setBaseCampLabel(e.target.value)} placeholder="e.g. Main Yard, North Office" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Base Camp Address</label>
                  <input type="text" value={baseCampAddress} onChange={e => setBaseCampAddress(e.target.value)} placeholder="Full address for navigation" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Latitude</label>
                    <input type="number" step="any" value={baseCampLat} onChange={e => setBaseCampLat(e.target.value === '' ? '' : Number(e.target.value))} placeholder="28.1883" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Longitude</label>
                    <input type="number" step="any" value={baseCampLng} onChange={e => setBaseCampLng(e.target.value === '' ? '' : Number(e.target.value))} placeholder="-82.6515" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-4">
              <button 
                disabled={isSavingProfile} 
                type="submit" 
                className="bg-blue-600 text-white py-4 px-8 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
                <Save className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>

        {/* Services */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Services</h3>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Customize your services, pricing, and seasonal rules</p>
            </div>
            <button 
              onClick={() => { setIsAddingPlan(true); setEditingPlanId(null); setPlanName(''); setPlanDescription(''); setPlanPrice(''); setPlanFrequency('one_time'); setPlanRequiresPhotos(true); setPlanSeasonalEnabled(false); setPlanSeasonalRules([]); setErrorMessage(null); setSuccessMessage(null); }} 
              className="bg-blue-600 text-white py-3 px-6 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-95 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Service
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {servicePlans.length === 0 ? (
              <div className="col-span-full bg-gray-50 rounded-3xl p-16 text-center border-2 border-dashed border-gray-200">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No service plans configured</p>
              </div>
            ) : (
              servicePlans.map(plan => (
                <div key={plan.id} className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-lg font-black text-gray-900 leading-tight">{plan.name}</h4>
                        <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase tracking-widest">
                          Every {plan.billing_frequency === 'weekly' ? '7' : plan.billing_frequency === 'bi_weekly' ? '14' : '30'} Days
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-400 line-clamp-2">{plan.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { setEditingPlanId(plan.id!); setPlanName(plan.name); setPlanDescription(plan.description); setPlanPrice(plan.price.toString()); setPlanFrequency(plan.billing_frequency as 'one_time' | 'weekly' | 'bi_weekly' | 'monthly'); setPlanRequiresPhotos(plan.requires_photos); setPlanSeasonalEnabled(plan.seasonal_enabled); setPlanSeasonalRules((plan.seasonal_rules || []).slice(0, 1)); setIsAddingPlan(true); }}
                        className="text-[10px] font-black text-gray-600 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-lg hover:bg-gray-200"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDeletePlan(plan.id!)} 
                        className="text-[10px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-3 py-1 rounded-lg hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                    <button 
                      onClick={() => setEditingSeasonalPlanId(plan.id!)}
                      className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-lg hover:bg-blue-100"
                    >
                      Edit Seasonal Rules
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </section>

        {/* System Preferences */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <SettingsIcon className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">System Preferences</h3>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-8">
            <div className="space-y-6">
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Grace Periods (Color Tags)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Due Grace (Green)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" required value={dueGraceDays} onChange={e => setDueGraceDays(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 transition-all outline-none" />
                    <span className="text-xs font-bold text-gray-400">days</span>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400 font-bold uppercase">Up to this many days overdue is Green</p>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Overdue Grace (Orange)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" required value={overdueGraceDays} onChange={e => setOverdueGraceDays(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 transition-all outline-none" />
                    <span className="text-xs font-bold text-gray-400">days</span>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400 font-bold uppercase">Up to this many days overdue is Orange</p>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Critical (Red)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" required value={criticalOverdueDays} onChange={e => setCriticalOverdueDays(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 transition-all outline-none" />
                    <span className="text-xs font-bold text-gray-400">days</span>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400 font-bold uppercase">After this many days overdue is Red</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button 
                disabled={isSavingSettings} 
                type="submit" 
                className="bg-purple-600 text-white py-4 px-8 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-purple-700 shadow-xl shadow-purple-100 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingSettings ? 'Saving...' : 'Save System Preferences'}
                <Save className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>

        {/* Messaging Settings */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Messaging Settings</h3>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Templates and message behavior live here</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">Templates</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Managed in Messaging</p>
            </div>
            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">Payment Instructions</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Coming soon</p>
            </div>
            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">AI / SMS</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Disabled placeholder</p>
            </div>
          </div>
        </section>

        {/* Storage Settings */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <HardDrive className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Storage Settings</h3>
          </div>

          <form onSubmit={handleSaveStorageSettings} className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Temporary Link Duration</label>
                <select 
                  value={tempLinkDuration} 
                  onChange={e => setTempLinkDuration(e.target.value)} 
                  className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 transition-all outline-none"
                >
                  <option value="14">14 Days (Free Tier)</option>
                  <option value="30">30 Days</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <div>
                  <label className="block text-xs font-black text-gray-900 uppercase tracking-widest mb-1">No Expiration</label>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Only available for Starter/Pro</p>
                </div>
                <button
                  type="button"
                  disabled={true}
                  className="w-12 h-6 rounded-full relative transition-all duration-300 bg-gray-200 cursor-not-allowed"
                >
                  <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 left-1" />
                </button>
              </div>
            </div>

            <div className="pt-4">
              <button 
                disabled={isSavingStorageSettings} 
                type="submit" 
                className="bg-purple-600 text-white py-4 px-8 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-purple-700 shadow-xl shadow-purple-100 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingStorageSettings ? 'Saving...' : 'Save Storage Settings'}
                <Save className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Add Plan Modal */}
      {isAddingPlan && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-lg rounded-3xl p-8 overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{editingPlanId ? 'Edit Service' : 'Add New Service'}</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{editingPlanId ? 'Update service offering' : 'Define a new service offering'}</p>
              </div>
              <button onClick={() => { setIsAddingPlan(false); setEditingPlanId(null); setErrorMessage(null); }} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm font-bold text-red-700">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleAddPlan} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Service Name</label>
                  <input type="text" required value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Weekly Lawn Mowing" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Description</label>
                  <textarea value={planDescription} onChange={e => setPlanDescription(e.target.value)} rows={2} placeholder="Briefly describe what's included..." className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Price ($)</label>
                  <input type="number" required min="0" step="0.01" value={planPrice} onChange={e => setPlanPrice(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Billing Frequency</label>
                  <select required value={planFrequency} onChange={e => setPlanFrequency(e.target.value as any)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none appearance-none">
                    <option value="one_time">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi_weekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-gray-900 uppercase tracking-tight">Requires Photos</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Technician must upload photos</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setPlanRequiresPhotos(!planRequiresPhotos)}
                    className={`w-12 h-6 rounded-full relative transition-all duration-300 ${planRequiresPhotos ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${planRequiresPhotos ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div className="p-5 bg-gray-50 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-gray-900 uppercase tracking-tight">Seasonal Frequency</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Enable one off-season rule for this service</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlanSeasonalEnabled(!planSeasonalEnabled)}
                      className={`w-12 h-6 rounded-full relative transition-all duration-300 ${planSeasonalEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${planSeasonalEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  
                  {planSeasonalEnabled && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Off-Season Rule</h5>
                        {planSeasonalRules.length === 0 && (
                          <button
                            type="button"
                            onClick={() => setPlanSeasonalRules([createDefaultOffSeasonRule()])}
                            className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700"
                          >
                            + Add Off-Season Rule
                          </button>
                        )}
                      </div>
                      {planSeasonalRules[0] && (
                        <div className="bg-white p-3 rounded-xl border border-gray-100 space-y-2">
                          <div className="flex justify-between items-center">
                            <input 
                              type="text" 
                              placeholder="Label (e.g. Winter)" 
                              value={planSeasonalRules[0].label}
                              onChange={e => {
                                setPlanSeasonalRules([{ ...planSeasonalRules[0], label: e.target.value }]);
                              }}
                              className="text-xs font-bold text-gray-900 bg-transparent border-none p-0 focus:ring-0 w-full"
                            />
                            <button 
                              type="button" 
                              onClick={() => setConfirmSeasonalRuleDelete({ draft: true })}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input 
                              type="text" 
                              placeholder="Start (MM-DD)"
                              value={planSeasonalRules[0].start_date}
                              onChange={e => {
                                setPlanSeasonalRules([{ ...planSeasonalRules[0], start_date: e.target.value }]);
                              }}
                              className="w-full bg-gray-50 border-none rounded-lg py-1.5 px-2 text-[10px] font-bold"
                            />
                            <input 
                              type="text" 
                              placeholder="End (MM-DD)"
                              value={planSeasonalRules[0].end_date}
                              onChange={e => {
                                setPlanSeasonalRules([{ ...planSeasonalRules[0], end_date: e.target.value }]);
                              }}
                              className="w-full bg-gray-50 border-none rounded-lg py-1.5 px-2 text-[10px] font-bold"
                            />
                            <input 
                              type="number" 
                              placeholder="Interval"
                              value={planSeasonalRules[0].interval_days}
                              onChange={e => {
                                setPlanSeasonalRules([{ ...planSeasonalRules[0], interval_days: Number(e.target.value) }]);
                              }}
                              className="w-full bg-gray-50 border-none rounded-lg py-1.5 px-2 text-[10px] font-bold"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-blue-600 text-white py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">
                  {editingPlanId ? 'Save Changes' : 'Save Service Offering'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seasonal Rules Modal */}
      {editingSeasonalPlanId && servicePlans.find(p => p.id === editingSeasonalPlanId) && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-lg rounded-3xl p-8 overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Seasonal Rules</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{servicePlans.find(p => p.id === editingSeasonalPlanId)?.name}</p>
              </div>
              <button onClick={() => setEditingSeasonalPlanId(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {(() => {
              const plan = servicePlans.find(p => p.id === editingSeasonalPlanId)!;
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-gray-900 uppercase tracking-tight">Seasonal Frequency</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Enable one off-season rule for this service</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => servicePlanService.updateServicePlan(plan.id!, { seasonal_enabled: !plan.seasonal_enabled, seasonal_rules: (plan.seasonal_rules || []).slice(0, 1) })}
                      className={`w-12 h-6 rounded-full relative transition-all duration-300 ${plan.seasonal_enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${plan.seasonal_enabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  
                  {plan.seasonal_enabled && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Off-Season Rule</h5>
                        {(plan.seasonal_rules || []).length === 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              servicePlanService.updateServicePlan(plan.id!, {
                                seasonal_rules: [createDefaultOffSeasonRule()]
                              });
                            }}
                            className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700"
                          >
                            + Add Off-Season Rule
                          </button>
                        )}
                      </div>
                      {(plan.seasonal_rules || [])[0] && (
                        <div className="bg-white p-3 rounded-xl border border-gray-100 space-y-2">
                          <div className="flex justify-between items-center">
                            <input 
                              type="text" 
                              placeholder="Label (e.g. Winter)" 
                              value={(plan.seasonal_rules || [])[0].label}
                              onChange={e => {
                                const rule = (plan.seasonal_rules || [])[0];
                                servicePlanService.updateServicePlan(plan.id!, { seasonal_rules: [{ ...rule, label: e.target.value }] });
                              }}
                              className="text-xs font-bold text-gray-900 bg-transparent border-none p-0 focus:ring-0 w-full"
                            />
                            <button 
                              type="button" 
                              onClick={() => setConfirmSeasonalRuleDelete({ planId: plan.id! })}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input 
                              type="text" 
                              placeholder="Start (MM-DD)"
                              value={(plan.seasonal_rules || [])[0].start_date}
                              onChange={e => {
                                const rule = (plan.seasonal_rules || [])[0];
                                servicePlanService.updateServicePlan(plan.id!, { seasonal_rules: [{ ...rule, start_date: e.target.value }] });
                              }}
                              className="w-full bg-gray-50 border-none rounded-lg py-1.5 px-2 text-[10px] font-bold"
                            />
                            <input 
                              type="text" 
                              placeholder="End (MM-DD)"
                              value={(plan.seasonal_rules || [])[0].end_date}
                              onChange={e => {
                                const rule = (plan.seasonal_rules || [])[0];
                                servicePlanService.updateServicePlan(plan.id!, { seasonal_rules: [{ ...rule, end_date: e.target.value }] });
                              }}
                              className="w-full bg-gray-50 border-none rounded-lg py-1.5 px-2 text-[10px] font-bold"
                            />
                            <select 
                              value={(plan.seasonal_rules || [])[0].off_season_frequency || 'monthly'}
                              onChange={e => {
                                const rule = (plan.seasonal_rules || [])[0];
                                servicePlanService.updateServicePlan(plan.id!, { seasonal_rules: [{ ...rule, off_season_frequency: e.target.value }] });
                              }}
                              className="w-full bg-gray-50 border-none rounded-lg py-1.5 px-2 text-[10px] font-bold"
                            >
                              <option value="weekly">Weekly</option>
                              <option value="bi-weekly">Bi-Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[300] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Delete Service Plan?</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 uppercase tracking-widest leading-relaxed">
              This action cannot be undone. Are you sure you want to delete this service plan?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-red-700 shadow-xl shadow-red-100 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmSeasonalRuleDelete && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[300] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Delete Off-Season Rule?</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 uppercase tracking-widest leading-relaxed">
              This action cannot be undone. Are you sure you want to delete this off-season rule?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmSeasonalRuleDelete(null)}
                className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteSeasonalRule}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-red-700 shadow-xl shadow-red-100 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
