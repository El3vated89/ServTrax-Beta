import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { AlertCircle, Calendar, CheckCircle, FileText, Info, MapPin } from 'lucide-react';
import { db } from '../firebase';
import {
  CustomerPortalHistoryItem,
  CustomerPortalQuoteItem,
  CustomerPortalRecord,
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

  useEffect(() => {
    const loadPortal = async () => {
      if (!customerId || !portalToken) {
        setError('Invalid portal link.');
        setLoading(false);
        return;
      }

      try {
        const portalSnap = await getDoc(doc(db, 'public_customer_portals', portalToken));
        if (!portalSnap.exists()) {
          setError('Customer portal not found.');
          setLoading(false);
          return;
        }

        const portalData = { customerId: portalSnap.id, ...portalSnap.data() } as CustomerPortalRecord;
        if (!portalData.portal_enabled || portalData.portal_token !== portalToken || portalData.customerId !== customerId) {
          setError('This customer portal link is invalid.');
          setLoading(false);
          return;
        }

        setCustomerPortal(portalData);

        const [jobsSnap, quotesSnap] = await Promise.all([
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
        console.error('Error loading customer portal:', err);
        setError('Failed to load customer portal.');
      } finally {
        setLoading(false);
      }
    };

    loadPortal();
  }, [customerId, portalToken]);

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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-black text-blue-900 mb-1">Customer Portal</h3>
            <p className="text-xs font-bold text-blue-700 leading-relaxed">
              This portal is a customer-facing history view. Temporary proof links are still separate and stay on a per-job basis.
            </p>
          </div>
        </div>

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
