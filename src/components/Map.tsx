import React from 'react';
import { Map as MapIcon, Navigation } from 'lucide-react';

export default function Map() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Routes & Maps</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Visual job tracking and routing</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
          <MapIcon className="h-10 w-10 text-blue-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Map View Coming Soon</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            We're building a powerful map view to help you visualize your jobs and optimize your daily routes.
          </p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">
          <Navigation className="h-5 w-5" />
          Enable GPS Tracking
        </button>
      </div>
    </div>
  );
}
