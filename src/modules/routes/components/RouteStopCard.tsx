import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, CheckCircle, AlertCircle, GripVertical, MoreVertical, ChevronUp, ChevronDown, User, Briefcase, Share2 } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { RouteStop, StopDueState } from '../types';
import RouteStopMenuModal from './RouteStopMenuModal';

interface RouteStopCardProps {
  stop: RouteStop;
  index: number;
  totalStops: number;
  onSelect?: (stop: RouteStop) => void;
  onStatusChange?: (stop: RouteStop, status: 'pending' | 'completed' | 'canceled') => void;
  onDelay?: (stop: RouteStop) => void;
  onReorder?: (index: number, direction: 'up' | 'down') => void;
  hideReorder?: boolean;
}

const statusColors: Record<StopDueState, string> = {
  due: 'bg-yellow-500',
  overdue: 'bg-red-500',
  delayed: 'bg-orange-500',
  completed: 'bg-green-500',
  upcoming: 'bg-blue-500',
};

const statusTextColors: Record<StopDueState, string> = {
  due: 'text-yellow-700 bg-yellow-50',
  overdue: 'text-red-700 bg-red-50',
  delayed: 'text-orange-700 bg-orange-50',
  completed: 'text-green-700 bg-green-50',
  upcoming: 'text-blue-700 bg-blue-50',
};

export default function RouteStopCard({ stop, index, totalStops, onSelect, onDelay, onStatusChange, onReorder, hideReorder }: RouteStopCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();

  return (
    <div 
      className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all p-4 sm:p-6 flex items-center gap-3 sm:gap-6 group cursor-pointer relative"
      onClick={() => onSelect?.(stop)}
    >
      {/* Reorder Arrows */}
      {!hideReorder && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button 
            disabled={index === 0}
            onClick={(e) => { e.stopPropagation(); onReorder?.(index, 'up'); }}
            className={`p-1 rounded-lg transition-colors ${index === 0 ? 'text-gray-100' : 'text-gray-300 hover:text-blue-600 hover:bg-blue-50'}`}
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button 
            disabled={index === totalStops - 1}
            onClick={(e) => { e.stopPropagation(); onReorder?.(index, 'down'); }}
            className={`p-1 rounded-lg transition-colors ${index === totalStops - 1 ? 'text-gray-100' : 'text-gray-300 hover:text-blue-600 hover:bg-blue-50'}`}
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Stop Number */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg ${statusColors[stop.due_state]}`}>
        {index + 1}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
          {stop.city_snapshot && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-[8px] font-black uppercase tracking-widest rounded-lg shadow-sm">
              <MapPin className="h-2.5 w-2.5" />
              {stop.city_snapshot}
            </div>
          )}
          <div className="flex items-center gap-2">
            <h4 className="text-base sm:text-lg font-black text-gray-900 leading-tight break-words">
              {stop.customer_name_snapshot}
            </h4>
            <span className={`inline-block w-fit text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap ${statusTextColors[stop.due_state]}`}>
              {stop.due_state}
            </span>
          </div>
        </div>
        
        <div className="flex items-start gap-1.5 text-gray-500 mb-3">
          <MapPin className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm font-bold break-words">{stop.address_snapshot}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Service Type</p>
            <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-600 uppercase tracking-widest">
              <Clock className="h-3 w-3 text-gray-400" />
              {stop.service_type_snapshot}
            </div>
          </div>

          {stop.last_service_date_snapshot && (
            <div className="flex flex-col gap-1">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Last Service Date</p>
              <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                {stop.last_service_date_snapshot instanceof Timestamp 
                  ? stop.last_service_date_snapshot.toDate().toLocaleDateString() 
                  : new Date(stop.last_service_date_snapshot as string).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-auto relative z-10">
        {stop.due_state === 'completed' && (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              window.dispatchEvent(new CustomEvent('share-route-stop', { detail: stop }));
            }}
            className="p-2 sm:p-3 text-blue-600 hover:text-blue-700 rounded-2xl hover:bg-blue-50 transition-all"
            title="Share Proof"
          >
            <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}
        {stop.due_state !== 'completed' && (
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onStatusChange?.(stop, 'completed'); }}
              className="p-2 sm:p-3 text-gray-400 hover:text-green-500 rounded-2xl hover:bg-green-50 transition-all"
              title="Complete Stop"
            >
              <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            {stop.due_state !== 'delayed' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onDelay?.(stop); }}
                className="p-2 sm:p-3 text-gray-400 hover:text-orange-500 rounded-2xl hover:bg-orange-50 transition-all"
                title="Delay Stop"
              >
                <Clock className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            )}
          </div>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMenu(true); }}
          className="p-2 sm:p-3 text-gray-500 hover:text-gray-900 rounded-2xl hover:bg-gray-100 transition-all flex items-center justify-center"
          aria-label="More options"
        >
          <MoreVertical className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      {showMenu && (
        <RouteStopMenuModal 
          stop={stop} 
          onClose={() => setShowMenu(false)} 
        />
      )}
    </div>
  );
}
