import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, ClipboardList, Users, Upload } from 'lucide-react';
import { compressImage } from '../utils/imageCompression';
import { verificationService } from '../services/verificationService';
import { jobService, Job } from '../services/jobService';
import { customerService, Customer } from '../services/customerService';
import { savePipelineService } from '../services/savePipelineService';

interface PhotoCaptureFlowProps {
  onClose: () => void;
}

export default function PhotoCaptureFlow({ onClose }: PhotoCaptureFlowProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFileSizeBytes, setPhotoFileSizeBytes] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [assignmentType, setAssignmentType] = useState<'job' | 'customer' | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Open camera immediately on mount
    if (!photoUrl && !isCompressing) {
      fileInputRef.current?.click();
    }

    // Load jobs and customers for assignment
    const unsubscribeJobs = jobService.subscribeToJobs((loadedJobs) => {
      setJobs(loadedJobs.filter(j => j.status !== 'completed')); // Show active jobs
    });
    const unsubscribeCustomers = customerService.subscribeToCustomers((loadedCustomers) => {
      setCustomers(loadedCustomers);
    });

    return () => {
      unsubscribeJobs();
      unsubscribeCustomers();
    };
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      onClose(); // User cancelled camera
      return;
    }

    setErrorMessage(null);
    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      setPhotoUrl(compressed.dataUrl);
      setPhotoFileSizeBytes(compressed.size);
    } catch (error) {
      console.error('Error compressing image:', error);
      setErrorMessage('Failed to process image. Please try another photo.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSave = async () => {
    const debugContext = {
      flow: 'quick_action_photo_save',
      traceId: savePipelineService.createTraceId('quick_action_photo_save'),
    };

    savePipelineService.log(debugContext, 'save_started');
    if (!photoUrl || !assignmentType || !selectedId) {
      savePipelineService.log(debugContext, 'validation_failed', 'Photo, assignment type, and target selection are required.');
      setErrorMessage('Choose where this photo should be assigned before saving.');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);
    try {
      savePipelineService.log(debugContext, 'validation_passed');
      const response = await savePipelineService.withTimeout(
        verificationService.addVerification({
          jobId: assignmentType === 'job' ? selectedId : undefined,
          customerId: assignmentType === 'customer' ? selectedId : undefined,
          photo_url: photoUrl,
          file_size_bytes: photoFileSizeBytes,
          notes: notes
        }, debugContext),
        {
          timeoutMs: 25000,
          timeoutMessage: 'Photo save took too long and was stopped. Please try again.',
          debugContext,
        }
      );
      savePipelineService.log(debugContext, 'response_received', response?.id || 'verification_saved');
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
      onClose();
    } catch (error) {
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      console.error('Error saving photo:', error);
      const nextMessage = error instanceof Error && error.message
        ? error.message
        : 'Failed to save photo.';
      setErrorMessage(nextMessage);
    } finally {
      setIsSaving(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  if (!photoUrl) {
    return (
      <>
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*"
          capture="environment"
          className="sr-only" 
          onChange={handlePhotoUpload}
        />
        {errorMessage && !isCompressing && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[200] flex justify-center items-center p-4">
            <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl space-y-5">
              <p className="text-lg font-black text-gray-900">Photo Error</p>
              <p className="text-sm font-bold text-red-700">{errorMessage}</p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-gray-100 text-gray-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    fileInputRef.current?.click();
                  }}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}
        {isCompressing && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[200] flex justify-center items-center">
            <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-sm font-bold text-gray-900">Processing Photo...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[110] flex justify-center items-end sm:items-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] shadow-2xl relative animate-in fade-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[calc(100dvh-0.5rem)] sm:max-h-[90vh]">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-gray-100 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-6 pt-6">
          <h3 className="text-xl font-black text-gray-900 mb-6">Assign Photo</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pr-4 space-y-6 pb-6">
          {errorMessage && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-700">{errorMessage}</p>
            </div>
          )}

          {/* Photo Preview */}
          <div className="aspect-video bg-gray-100 rounded-2xl overflow-hidden relative">
            <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
          </div>

          {/* Assignment Type Selection */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setAssignmentType('job'); setSelectedId(''); }}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                assignmentType === 'job' 
                  ? 'border-blue-600 bg-blue-50 text-blue-600' 
                  : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
              }`}
            >
              <ClipboardList className="h-6 w-6" />
              <span className="text-sm font-bold">Assign to Job</span>
            </button>
            <button
              onClick={() => { setAssignmentType('customer'); setSelectedId(''); }}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                assignmentType === 'customer' 
                  ? 'border-green-600 bg-green-50 text-green-600' 
                  : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
              }`}
            >
              <Users className="h-6 w-6" />
              <span className="text-sm font-bold">Assign to Client</span>
            </button>
          </div>

          {/* Selection Dropdown */}
          {assignmentType === 'job' && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Select Job</label>
              <select 
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none"
              >
                <option value="">-- Choose a Job --</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>{job.customer_name_snapshot} - {job.address_snapshot}</option>
                ))}
              </select>
            </div>
          )}

          {assignmentType === 'customer' && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Select Client</label>
              <select 
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none"
              >
                <option value="">-- Choose a Client --</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Optional Notes */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Notes (Optional)</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details about this photo..."
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-4 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none h-24"
            />
          </div>
        </div>

        <div className="mt-auto pt-6 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-gray-100 bg-white">
          <button 
            onClick={handleSave}
            disabled={!assignmentType || !selectedId || isSaving}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Save Photo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
