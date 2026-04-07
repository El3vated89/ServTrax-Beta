import React, { useEffect } from 'react';
import { MapPin, Navigation, Info, X, Map as MapIcon, Layers, Compass, Home, FileText, AlertTriangle, MoreVertical, Share2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Timestamp } from 'firebase/firestore';
import { RouteStop, StopDueState, BaseCamp } from '../types';
import RouteStopMenuModal from './RouteStopMenuModal';

// Fix Leaflet's default icon path issues with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface RouteMapProps {
  stops: RouteStop[];
  baseCamp?: BaseCamp;
  onMarkerSelect?: (stop: RouteStop) => void;
  selectedStop?: RouteStop | null;
}

const statusColors: Record<StopDueState, string> = {
  due: '#EAB308', // yellow-500
  overdue: '#EF4444', // red-500
  delayed: '#F97316', // orange-500
  completed: '#22C55E', // green-500
  upcoming: '#3B82F6', // blue-500
};

// Custom DivIcon for Base Camp
const createBaseCampIcon = (label: string) => L.divIcon({
  className: 'custom-leaflet-icon',
  html: `
    <div class="relative flex flex-col items-center transform -translate-y-1/2">
      <div class="p-2 bg-gray-900 rounded-xl shadow-2xl border-2 border-white">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <div class="mt-1 px-2 py-0.5 bg-gray-900 text-white text-[8px] font-black rounded-full shadow-lg border border-white/20 whitespace-nowrap">
        ${label}
      </div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

// Custom DivIcon for Stops
const createStopIcon = (index: number, isSelected: boolean, color: string, name: string) => L.divIcon({
  className: 'custom-leaflet-icon',
  html: `
    <div class="relative flex flex-col items-center transition-all transform ${isSelected ? 'scale-110' : 'hover:scale-105'}">
      <div class="p-2 rounded-xl shadow-xl border-2 transition-all ${
        isSelected ? 'bg-blue-600 border-white text-white' : 'bg-white border-gray-100 text-gray-900'
      }">
        <div class="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isSelected ? 'white' : color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span class="text-[10px] font-black">${index + 1}</span>
        </div>
      </div>
      ${isSelected ? `
        <div class="mt-2 px-2 py-1 bg-gray-900 text-white text-[8px] font-black rounded-full shadow-lg border border-white/20 whitespace-nowrap">
          ${name}
        </div>
      ` : ''}
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

// Component to handle map bounds
function MapBounds({ stops, baseCamp }: { stops: RouteStop[], baseCamp?: BaseCamp }) {
  const map = useMap();
  
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    let hasValidStops = false;
    
    stops.forEach(stop => {
      const lat = Number(stop.lat_snapshot);
      const lng = Number(stop.lng_snapshot);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        bounds.extend([lat, lng]);
        hasValidStops = true;
      }
    });
    
    // Only include base camp in bounds if there are no valid stops
    if (!hasValidStops && baseCamp) {
      const bcLat = Number(baseCamp.lat);
      const bcLng = Number(baseCamp.lng);
      if (!isNaN(bcLat) && !isNaN(bcLng) && bcLat !== 0 && bcLng !== 0) {
        bounds.extend([bcLat, bcLng]);
      }
    }
    
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, stops, baseCamp]);

  return null;
}

export default function RouteMap({ stops, baseCamp, onMarkerSelect, selectedStop }: RouteMapProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const defaultCenter: [number, number] = baseCamp ? [baseCamp.lat, baseCamp.lng] : [37.7749, -122.4194];

  const handleNavigate = (stop: RouteStop) => {
    const address = stop.address_snapshot;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="relative w-full h-[calc(100vh-250px)] min-h-[500px] bg-gray-100 rounded-3xl overflow-hidden border border-gray-200 shadow-inner group">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        className="w-full h-full z-0"
        zoomControl={false}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        <MapBounds stops={stops} baseCamp={baseCamp} />

        {/* Base Camp Marker */}
        {baseCamp && !isNaN(Number(baseCamp.lat)) && !isNaN(Number(baseCamp.lng)) && (Number(baseCamp.lat) !== 0 || Number(baseCamp.lng) !== 0) && (
          <Marker
            position={[Number(baseCamp.lat), Number(baseCamp.lng)]}
            icon={createBaseCampIcon(baseCamp.label)}
          />
        )}

        {/* Route Stop Markers */}
        {stops.map((stop, index) => {
          const lat = Number(stop.lat_snapshot);
          const lng = Number(stop.lng_snapshot);
          if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
          
          const isSelected = selectedStop?.id === stop.id;

          return (
            <Marker
              key={stop.id}
              position={[lat, lng]}
              icon={createStopIcon(index, isSelected, statusColors[stop.due_state], stop.customer_name_snapshot)}
              eventHandlers={{
                click: () => onMarkerSelect?.(stop),
              }}
              zIndexOffset={isSelected ? 1000 : 0}
            />
          );
        })}
      </MapContainer>

      {/* Map Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <button className="p-3 bg-white rounded-2xl shadow-lg border border-gray-100 text-gray-600 hover:text-blue-600 transition-all">
          <Layers className="h-5 w-5" />
        </button>
        <button className="p-3 bg-white rounded-2xl shadow-lg border border-gray-100 text-gray-600 hover:text-blue-600 transition-all">
          <Compass className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute bottom-4 right-4 z-10">
        <button 
          onClick={() => selectedStop && handleNavigate(selectedStop)}
          disabled={!selectedStop}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black shadow-xl transition-all ${
            selectedStop 
              ? 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700' 
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Navigation className="h-5 w-5" />
          Navigate
        </button>
      </div>

      {/* Selected Stop Details Overlay */}
      {selectedStop && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 z-30 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h4 className="text-lg font-black text-gray-900 leading-tight">{selectedStop.customer_name_snapshot}</h4>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{selectedStop.city_snapshot}</p>
            </div>
            <div className="flex items-center gap-1">
              {selectedStop.due_state === 'completed' && (
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('share-route-stop', { detail: selectedStop }))}
                  className="p-2 text-blue-600 hover:text-blue-700 rounded-xl hover:bg-blue-50 transition-all"
                  title="Share Proof"
                >
                  <Share2 className="h-5 w-5" />
                </button>
              )}
              <button 
                onClick={() => setShowMenu(true)}
                className="p-2 text-gray-400 hover:text-gray-900 rounded-xl hover:bg-gray-50 transition-all"
                title="More Options"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              <button 
                onClick={() => onMarkerSelect?.(null as any)}
                className="p-2 text-gray-300 hover:text-gray-600 rounded-xl hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {showMenu && (
            <RouteStopMenuModal 
              stop={selectedStop} 
              onClose={() => setShowMenu(false)} 
            />
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <MapPin className="h-4 w-4 text-blue-600" />
              <span className="font-bold">{selectedStop.address_snapshot}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="font-bold">{selectedStop.service_type_snapshot}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${
                selectedStop.due_state === 'overdue' ? 'bg-red-50 text-red-600' :
                selectedStop.due_state === 'due' ? 'bg-yellow-50 text-yellow-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {selectedStop.due_state}
              </span>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Scheduled: {selectedStop.scheduled_date instanceof Timestamp 
                  ? selectedStop.scheduled_date.toDate().toLocaleDateString() 
                  : new Date(selectedStop.scheduled_date as string).toLocaleDateString()}
              </span>
            </div>
            {selectedStop.notes_internal && (
              <div className="flex items-start gap-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">
                <FileText className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span className="font-medium text-xs">{selectedStop.notes_internal}</span>
              </div>
            )}
            {selectedStop.delayed_reason && (
              <div className="flex items-start gap-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-medium text-xs">{selectedStop.delayed_reason}</span>
              </div>
            )}
          </div>

          <button 
            onClick={() => handleNavigate(selectedStop)}
            className="w-full mt-6 py-3 bg-gray-900 text-white rounded-2xl font-black text-sm hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
          >
            <Navigation className="h-4 w-4" />
            Start Navigation
          </button>
        </div>
      )}

      {/* Map Branding Overlay */}
      <div className="absolute top-4 left-4 z-10">
        <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100">
          <MapIcon className="h-4 w-4 text-blue-600" />
          <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">ServTrax Maps</span>
        </div>
      </div>
    </div>
  );
}

