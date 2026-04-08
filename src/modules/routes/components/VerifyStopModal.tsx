import React, { useState, useRef } from 'react';
import { X, CheckCircle, MapPin, Camera, Upload } from 'lucide-react';
import { RouteStop } from '../types';
import { Timestamp } from 'firebase/firestore';
import { compressImage } from '../../../utils/imageCompression';

interface VerifyStopModalProps {
  stop: RouteStop;
  onClose: () => void;
  onVerify: (stop: RouteStop, notes: string, photoUrls: string[], fileSizeBytes: number) => void;
}

export default function VerifyStopModal({ stop, onClose, onVerify }: VerifyStopModalProps) {
  const [notes, setNotes] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoFileSizeBytes, setPhotoFileSizeBytes] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || photoUrls.length >= 1) return;

    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      setPhotoUrls(prev => [...prev, compressed.dataUrl]);
      setPhotoFileSizeBytes(compressed.size);
    } catch (error) {
      console.error('Error compressing image:', error);
    } finally {
      setIsCompressing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 text-green-600 rounded-xl">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">Verify Completion</h2>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Confirm Service</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Stop Details */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900">{stop.customer_name_snapshot}</h3>
              <span className="text-[10px] font-black px-2 py-1 bg-blue-100 text-blue-700 rounded-lg uppercase tracking-widest">
                {stop.service_type_snapshot}
              </span>
            </div>
            <div className="flex items-start gap-2 text-gray-600">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-400" />
              <p className="text-sm font-medium">{stop.address_snapshot}</p>
            </div>
          </div>

          {/* Photo Upload */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest">
              Attach Photo
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={photoUrls.length >= 1}
                onClick={() => {
                  const input = document.getElementById('file-upload-camera-modal') as HTMLInputElement;
                  input?.click();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-2xl text-sm font-bold hover:bg-blue-100 transition-all border border-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera className="h-4 w-4" />
                Take Photo
              </button>
              <button
                type="button"
                disabled={photoUrls.length >= 1}
                onClick={() => {
                  const input = document.getElementById('file-upload-gallery-modal') as HTMLInputElement;
                  input?.click();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-50 text-gray-600 rounded-2xl text-sm font-bold hover:bg-gray-100 transition-all border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="h-4 w-4" />
                Upload File
              </button>
              <input
                id="file-upload-camera-modal"
                type="file"
                onChange={handlePhotoUpload}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              <input
                id="file-upload-gallery-modal"
                type="file"
                onChange={handlePhotoUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
            {photoUrls.length > 0 && (
              <div className="relative w-24 h-24 mt-2 group">
                <img 
                  src={photoUrls[0]} 
                  alt="Verification" 
                  className="w-full h-full object-cover rounded-2xl border-2 border-blue-100 shadow-sm" 
                />
                <button
                  onClick={() => {
                    setPhotoUrls([]);
                    setPhotoFileSizeBytes(0);
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:bg-red-600 transition-all scale-90 group-hover:scale-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-gray-700 uppercase tracking-widest">
              Service Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about the service..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none h-24 text-sm"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onVerify(stop, notes, photoUrls, photoFileSizeBytes)}
            className="flex-1 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-200"
          >
            <CheckCircle className="h-4 w-4" />
            Verify & Complete
          </button>
        </div>
      </div>
    </div>
  );
}
