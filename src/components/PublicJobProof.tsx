import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Job } from '../services/jobService';
import { VerificationRecord } from '../services/verificationService';
import { 
  CheckCircle, 
  Calendar, 
  MapPin, 
  Camera, 
  AlertCircle,
  Info
} from 'lucide-react';

export default function PublicJobProof() {
  const { jobId, shareToken } = useParams<{ jobId: string, shareToken: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProof = async () => {
      if (!jobId || !shareToken) {
        setError('Invalid link');
        setLoading(false);
        return;
      }

      try {
        // Fetch job
        const jobRef = doc(db, 'jobs', jobId);
        let jobSnap;
        try {
          jobSnap = await getDoc(jobRef);
        } catch (err) {
          console.error("Error fetching job:", err);
          setError('Failed to load job details. Please check your connection.');
          setLoading(false);
          return;
        }

        if (!jobSnap.exists()) {
          setError('Job not found');
          setLoading(false);
          return;
        }

        const jobData = { id: jobSnap.id, ...jobSnap.data() } as Job;
        const now = new Date();
        const expiresAt = jobData.share_expires_at?.toDate ? jobData.share_expires_at.toDate() : new Date(jobData.share_expires_at);

        // Verify share token, visibility and expiration
        if (jobData.visibility_mode !== 'shareable' || jobData.share_token !== shareToken) {
          setError('This link is invalid.');
          setLoading(false);
          return;
        }

        if (jobData.share_expires_at && expiresAt < now) {
          setError('This link has expired.');
          setLoading(false);
          return;
        }

        setJob(jobData);

        // Fetch verification record
        try {
          const vQuery = query(
            collection(db, 'verification_records'),
            where('jobId', '==', jobId),
            where('visibility', '==', 'shareable')
          );
          const vSnap = await getDocs(vQuery);
          if (!vSnap.empty) {
            const data = vSnap.docs[0].data();
            setVerification({ 
              id: vSnap.docs[0].id, 
              ...data,
              photo_urls: data.photo_urls || (data.photo_url ? [data.photo_url] : [])
            } as VerificationRecord);
          }
        } catch (vErr) {
          console.warn("Error fetching verification records:", vErr);
        }

      } catch (err) {
        console.error("Unexpected error fetching proof:", err);
        setError('An unexpected error occurred. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchProof();
  }, [jobId, shareToken]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 text-center max-w-md w-full">
          <div className="text-red-500 mb-6 bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Link Unavailable</h2>
          <p className="text-sm font-bold text-gray-500">{error || 'Job not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Security Disclaimer */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-black text-blue-900 mb-1">Public Service Proof</h3>
            <p className="text-xs font-bold text-blue-700 leading-relaxed">
              This is a temporary, public link requiring no login. Anyone with this link can view this service proof. This is not a customer portal.
            </p>
          </div>
        </div>

        {/* Main Proof Card */}
        <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="h-6 w-6 text-green-400" />
                <span className="text-sm font-black uppercase tracking-widest text-blue-100">Service Completed</span>
              </div>
              <h1 className="text-3xl font-black mb-2 tracking-tight">{job.service_snapshot}</h1>
              <p className="text-lg font-bold text-blue-100">For {job.customer_name_snapshot}</p>
            </div>
            {/* Abstract background shape */}
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          </div>

          {/* Details */}
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-gray-50 rounded-2xl text-gray-400">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Completed On</p>
                  <p className="text-sm font-bold text-gray-900">
                    {job.completed_date 
                      ? new Date(job.completed_date.toDate ? job.completed_date.toDate() : job.completed_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                      : 'Recently'}
                  </p>
                </div>
              </div>
              
              {job.address_snapshot && (
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-gray-50 rounded-2xl text-gray-400">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Service Location</p>
                    <p className="text-sm font-bold text-gray-900">{job.address_snapshot}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Verification Photos */}
            {verification && verification.photo_urls && verification.photo_urls.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Camera className="h-5 w-5 text-gray-400" />
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Service Photos</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {verification.photo_urls.map((url, i) => (
                    <div key={i} className="rounded-3xl overflow-hidden bg-gray-100 shadow-sm border border-gray-100 aspect-video">
                      <img src={url} alt={`Service proof ${i + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verification Notes */}
            {verification && verification.notes && (
              <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Technician Notes</h3>
                <p className="text-sm font-medium text-gray-700 leading-relaxed italic">
                  "{verification.notes}"
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Branding */}
        <div className="text-center pt-8 pb-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Powered by ServTrax Velocity</p>
        </div>
      </div>
    </div>
  );
}
