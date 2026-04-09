import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertCircle, Calendar, CheckCircle, FileText, Info, LockKeyhole, MapPin } from 'lucide-react';
import { auth, db } from '../firebase';
import {
  CustomerPortalHistoryItem,
  CustomerPortalQuoteItem,
  CustomerPortalRecord,
  customerPortalService,
} from '../services/customerPortalService';

const toDate = (value: any) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

export default function PublicCustomerPortal() {
  const { customerId, portalToken } = useParams<{ customerId: string; portalToken: string }>();
  const [customerPortal, setCustomerPortal] = useState<CustomerPortalRecord | null>(null);
  const [jobs, setJobs] = useState<CustomerPortalHistoryItem[]>([]);
  const [quotes, setQuotes] = useState<CustomerPortalQuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessLoading, setAccessLoading] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [portalSource, setPortalSource] = useState<'public' | 'internal_preview'>('public');

  const requiresPhoneGate = !!customerPortal &&
    customerPortal.portal_access_mode === 'phone_only_temporary' &&
    !!customerPortal.portal_phone_hash;

  useEffect(() => {
    const loadPortal = async () => {
      if (!customerId || !portalToken) {
        setError('Invalid portal link.');
        setLoading(false);
        return;
      }

      try {
        let portalData: CustomerPortalRecord | null = null;

        const portalSnap = await getDoc(doc(db, 'public_customer_portals', portalToken));
        if (portalSnap.exists()) {
          const publicPortalData = { customerId: portalSnap.id, ...portalSnap.data() } as CustomerPortalRecord;
          if (
            publicPortalData.portal_enabled &&
            publicPortalData.portal_token === portalToken &&
            publicPortalData.customerId === customerId
          ) {
            portalData = publicPortalData;
            setPortalSource('public');
          }
        }

        if (!portalData) {
          try {
            const legacyPortalSnap = await getDocs(
              query(
                collection(db, 'public_customer_portals'),
                where('portal_token', '==', portalToken),
                limit(1)
              )
            );

            if (!legacyPortalSnap.empty) {
              const entry = legacyPortalSnap.docs[0];
              const legacyPortalData = { customerId, ...entry.data() } as CustomerPortalRecord;
              if (
                legacyPortalData.portal_enabled &&
                legacyPortalData.portal_token === portalToken &&
                (!legacyPortalData.customerId || legacyPortalData.customerId === customerId)
              ) {
                portalData = legacyPortalData;
                setPortalSource('public');
              }
            }
          } catch (legacyError) {
            console.warn('Legacy public portal lookup failed:', legacyError);
          }
        }

        if (!portalData && auth.currentUser) {
          try {
            const internalPortalSnap = await getDoc(doc(db, 'customer_portals', customerId));
            if (internalPortalSnap.exists()) {
              const internalPortalData = { customerId, ...internalPortalSnap.data() } as CustomerPortalRecord;
              if (
                internalPortalData.portal_enabled &&
                internalPortalData.portal_token === portalToken &&
                internalPortalData.customerId === customerId
              ) {
                portalData = internalPortalData;
                setPortalSource('internal_preview');
              }
            }
          } catch (internalError) {
            console.warn('Internal portal preview lookup failed:', internalError);
          }
        }

        if (!portalData) {
          setError('Customer portal not found.');
          setLoading(false);
          return;
        }

        setCustomerPortal(portalData);
      } catch (err) {
        console.error('Error loading customer portal:', err);
        setError('Failed to load customer portal.');
      } finally {
        setLoading(false);
      }
    };

    loadPortal();
  }, [customerId, portalToken]);

  useEffect(() => {
    if (!portalToken) return;
    try {
      if (window.sessionStorage.getItem(`portal-phone-ok-${portalToken}`) === '1') {
        setIsPhoneVerified(true);
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }, [portalToken]);

  useEffect(() => {
    const loadPortalContent = async () => {
      if (!portalToken || !customerPortal) return;
      if (requiresPhoneGate && !isPhoneVerified) return;

      setLoading(true);
      try {
        let jobsSnap;
        let quotesSnap;

        if (portalSource === 'internal_preview' && auth.currentUser) {
          [jobsSnap, quotesSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, 'customer_portal_job_history'),
                where('customerId', '==', customerPortal.customerId),
                where('portal_visible', '==', true)
              )
            ),
            getDocs(
              query(
                collection(db, 'customer_portal_quotes'),
                where('customerId', '==', customerPortal.customerId),
                where('portal_visible', '==', true)
              )
            ),
          ]);
        } else {
          [jobsSnap, quotesSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, 'public_customer_portal_job_history'),
                where('portal_token', '==', portalToken),
                where('portal_visible', '==', true)
              )
            ),
            getDocs(
              query(
                collection(db, 'public_customer_portal_quotes'),
                where('portal_token', '==', portalToken),
                where('portal_visible', '==', true)
              )
            ),
          ]);
        }

        setJobs(
          jobsSnap.docs
            .map((entry) => ({ id: entry.id, ...entry.data() } as CustomerPortalHistoryItem))
            .sort((left, right) => {
              const leftDate = toDate(left.completed_date || left.scheduled_date)?.getTime() || 0;
              const rightDate = toDate(right.completed_date || right.scheduled_date)?.getTime() || 0;
              return rightDate - leftDate;
            })
        );

        setQuotes(
          quotesSnap.docs
            .map((entry) => ({ id: entry.id, ...entry.data() } as CustomerPortalQuoteItem))
            .sort((left, right) => {
              const leftDate = toDate(left.created_at)?.getTime() || 0;
              const rightDate = toDate(right.created_at)?.getTime() || 0;
              return rightDate - leftDate;
            })
        );
      } catch (err) {
        console.warn('Customer portal content lookup failed, showing the portal shell without history data:', err);
        setJobs([]);
        setQuotes([]);
      } finally {
        setLoading(false);
      }
    };

    loadPortalContent();
  }, [customerPortal, isPhoneVerified, portalToken, requiresPhoneGate]);

  const visibleJobs = useMemo(() => {
    if (!customerPortal?.portal_show_history) return [];
    return jobs;
  }, [customerPortal?.portal_show_history, jobs]);

  const visibleQuotes = useMemo(() => {
    if (!customerPortal?.portal_show_quotes) return [];
    return quotes;
  }, [customerPortal?.portal_show_quotes, quotes]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !customerPortal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 text-center max-w-md w-full">
          <div className="text-red-500 mb-6 bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Portal Unavailable</h2>
          <p className="text-sm font-bold text-gray-500">{error || 'Portal not available.'}</p>
        </div>
      </div>
    );
  }

  if (requiresPhoneGate && !isPhoneVerified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 max-w-md w-full space-y-6">
          <div className="text-amber-600 bg-amber-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <LockKeyhole className="h-8 w-8" />
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Open Customer Portal</h2>
            <p className="text-sm font-bold text-gray-500 mt-2">
              Temporary access placeholder: enter the customer phone number to open this portal.
            </p>
            {customerPortal.portal_phone_last4 && (
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mt-3">
                Phone ending in {customerPortal.portal_phone_last4}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold text-amber-700">
              This reduced-security phone gate is temporary and has been logged for later hardening.
            </p>
          </div>

          {phoneError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-700">{phoneError}</p>
            </div>
          )}

          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setPhoneError('');
              setAccessLoading(true);
              try {
                const normalizedPhone = customerPortalService.normalizePhoneForPortal(phoneInput);
                const hashedPhone = await customerPortalService.hashPhoneForPortal(normalizedPhone);

                if (!normalizedPhone) {
                  setPhoneError('Enter the customer phone number to continue.');
                  return;
                }

                if (!customerPortal.portal_phone_hash) {
                  setPhoneError('This customer portal needs a phone number saved before it can open.');
                  return;
                }

                if (hashedPhone !== customerPortal.portal_phone_hash) {
                  setPhoneError('That phone number does not match this customer portal.');
                  return;
                }

                try {
                  window.sessionStorage.setItem(`portal-phone-ok-${portalToken}`, '1');
                } catch {
                  // Ignore sessionStorage errors
                }

                setIsPhoneVerified(true);
              } finally {
                setAccessLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Customer Phone Number
              </label>
              <input
                type="tel"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="Enter phone number"
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={accessLoading}
              className={`w-full px-5 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                accessLoading ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {accessLoading ? 'Checking...' : 'Open Portal'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {portalSource === 'internal_preview' && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-amber-900 mb-1">Portal Preview Mode</h3>
              <p className="text-xs font-bold text-amber-700 leading-relaxed">
                Public portal data is unavailable right now, so this is loading from the internal portal record while you are signed in.
              </p>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-black text-blue-900 mb-1">Customer Portal</h3>
            <p className="text-xs font-bold text-blue-700 leading-relaxed">
              This portal is a customer-facing history view. Temporary proof links are still separate and stay on a per-job basis.
            </p>
          </div>
        </div>

        {customerPortal.portal_security_note && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-amber-900 mb-1">Temporary Portal Access Mode</h3>
              <p className="text-xs font-bold text-amber-700 leading-relaxed">
                {customerPortal.portal_security_note}
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
          <div className="bg-blue-600 p-8 text-white">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-6 w-6 text-green-400" />
              <span className="text-sm font-black uppercase tracking-widest text-blue-100">Customer Portal</span>
            </div>
            <h1 className="text-3xl font-black mb-2 tracking-tight">{customerPortal.customer_name_snapshot}</h1>
            {customerPortal.address_snapshot && (
              <p className="text-sm font-bold text-blue-100">{customerPortal.address_snapshot}</p>
            )}
          </div>

          <div className="p-8 space-y-8">
            {customerPortal.portal_show_history && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Job History</h3>
                </div>

                {visibleJobs.length === 0 ? (
                  <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                    <p className="text-sm font-bold text-gray-500">No customer-visible proof history is available right now.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleJobs.map((job) => {
                      const completedAt = toDate(job.completed_date || job.scheduled_date);
                      return (
                        <div key={job.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-lg font-black text-gray-900">{job.service_snapshot}</p>
                              <div className="flex items-center gap-2 mt-3 text-sm font-bold text-gray-500">
                                <MapPin className="h-4 w-4 text-blue-600" />
                                <span>{job.address_snapshot}</span>
                              </div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-3">
                                {completedAt ? completedAt.toLocaleDateString() : 'Recently'}
                              </p>
                            </div>

                            <div className="text-right space-y-2">
                              <span className="inline-block px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest">
                                {job.status}
                              </span>
                              {customerPortal.portal_show_payment_status && (
                                <div className={`text-[10px] font-black uppercase tracking-widest ${
                                  job.payment_status === 'paid' ? 'text-green-700' : 'text-amber-700'
                                }`}>
                                  Payment {job.payment_status}
                                </div>
                              )}
                            </div>
                          </div>

                          {job.proof_job_id && job.share_token && (
                            <div className="mt-4">
                              <Link
                                to={`/proof/${job.proof_job_id}/${job.share_token}`}
                                className="inline-flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-blue-300 hover:bg-blue-50 transition-all"
                              >
                                View Proof
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {customerPortal.portal_show_quotes && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Quotes</h3>
                </div>

                {visibleQuotes.length === 0 ? (
                  <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                    <p className="text-sm font-bold text-gray-500">No customer-visible quotes are available right now.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleQuotes.map((quote) => (
                      <div key={quote.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-lg font-black text-gray-900">{quote.service_snapshot}</p>
                            <p className="text-sm font-bold text-gray-500 mt-2">{quote.address_snapshot}</p>
                            {quote.billing_frequency && (
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-3">
                                {quote.billing_frequency}
                              </p>
                            )}
                          </div>
                          <div className="text-right space-y-2">
                            <div className="text-sm font-black text-gray-900">
                              ${Number(quote.price_snapshot || 0).toFixed(2)}
                            </div>
                            <span className="inline-block px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-widest">
                              {quote.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {!customerPortal.portal_show_history && !customerPortal.portal_show_quotes && (
              <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                <p className="text-sm font-bold text-gray-500">This portal is active, but there is no customer-facing content enabled yet.</p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center pt-8 pb-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Powered by ServTrax Velocity</p>
        </div>
      </div>
    </div>
  );
}
