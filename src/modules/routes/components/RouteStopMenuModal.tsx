import React from 'react';
import { X, User, Briefcase, ChevronRight, Share2 } from 'lucide-react';
import { RouteStop } from '../types';
import { useNavigate } from 'react-router-dom';

interface RouteStopMenuModalProps {
  stop: RouteStop;
  onClose: () => void;
}

export default function RouteStopMenuModal({ stop, onClose }: RouteStopMenuModalProps) {
  const navigate = useNavigate();

  const handleAction = (path: string, state: any) => {
    navigate(path, { state });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Stop Options</h2>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-1">Manage this route stop</p>
          </div>
          <button 
            onClick={onClose}
            className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-8 space-y-4">
          {!stop.customer_id && !stop.job_id && (
            <div className="text-center py-8">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No options available</p>
              <p className="text-[10px] font-black text-gray-300 mt-2">This stop is not linked to a client or job</p>
            </div>
          )}
          {stop.customer_id && (
            <button 
              onClick={() => handleAction('/customers', { editingCustomerId: stop.customer_id })}
              className="w-full p-6 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-3xl transition-all flex items-center gap-4 group"
            >
              <div className="p-3 bg-white rounded-2xl shadow-sm text-blue-600 group-hover:scale-110 transition-transform">
                <User className="h-6 w-6" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-black text-gray-900">Edit Customer</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Update profile & details</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-600 transition-colors" />
            </button>
          )}

          {stop.job_id && (
            <>
              <button 
                onClick={() => handleAction('/jobs', { viewingJobId: stop.job_id })}
                className="w-full p-6 bg-gray-50 hover:bg-green-50 border border-gray-100 hover:border-green-200 rounded-3xl transition-all flex items-center gap-4 group"
              >
                <div className="p-3 bg-white rounded-2xl shadow-sm text-green-600 group-hover:scale-110 transition-transform">
                  <Briefcase className="h-6 w-6" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-black text-gray-900">View Job</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Check service history</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-green-600 transition-colors" />
              </button>

              <button 
                onClick={() => handleAction('/jobs', { editingJobId: stop.job_id })}
                className="w-full p-6 bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-orange-200 rounded-3xl transition-all flex items-center gap-4 group"
              >
                <div className="p-3 bg-white rounded-2xl shadow-sm text-orange-600 group-hover:scale-110 transition-transform">
                  <Briefcase className="h-6 w-6" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-black text-gray-900">Edit Job</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Modify schedule or type</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-orange-600 transition-colors" />
              </button>

              <button 
                onClick={() => {
                  onClose();
                  // Dispatch a custom event to trigger share job in ActiveRoutePage
                  window.dispatchEvent(new CustomEvent('share-route-stop', { detail: stop }));
                }}
                className="w-full p-6 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-3xl transition-all flex items-center gap-4 group"
              >
                <div className="p-3 bg-white rounded-2xl shadow-sm text-blue-600 group-hover:scale-110 transition-transform">
                  <Share2 className="h-6 w-6" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-black text-gray-900">Share Proof</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Send link to client</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </button>
            </>
          )}
        </div>

        <div className="p-8 bg-gray-50/50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-4 text-sm font-black text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-widest"
          >
            Close Menu
          </button>
        </div>
      </div>
    </div>
  );
}
