import { Timestamp } from 'firebase/firestore';

export type RouteStatus = 'draft' | 'active' | 'in_progress' | 'completed' | 'archived';
export type StopDueState = 'upcoming' | 'due' | 'overdue' | 'delayed' | 'completed';
export type OptimizationMode = 'none' | 'close_to_far' | 'far_to_close' | 'optimized';

export interface BaseCamp {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Route {
  id?: string;
  ownerId: string;
  name: string;
  route_date: Timestamp | string;
  status: RouteStatus;
  base_camp_label: string;
  base_camp_address: string;
  base_camp_lat: number;
  base_camp_lng: number;
  return_to_base: boolean;
  optimization_mode: OptimizationMode;
  manual_override: boolean;
  created_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RouteStop {
  id?: string;
  route_id: string;
  customer_id?: string;
  job_id?: string;
  stop_order: number;
  manual_order: number;
  optimized_order: number;
  status: 'pending' | 'completed' | 'canceled';
  due_state: StopDueState;
  city_snapshot: string;
  address_snapshot: string;
  lat_snapshot: number;
  lng_snapshot: number;
  service_type_snapshot: string;
  customer_name_snapshot: string;
  price_snapshot?: number;
  last_service_date_snapshot?: Timestamp | string;
  scheduled_date: Timestamp | string;
  due_date: Timestamp | string;
  delayed_reason?: string;
  completed_at?: Timestamp;
  notes_internal?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RouteFeatureFlags {
  routes_basic: boolean;
  routes_optimization: boolean;
  routes_city_grouping: boolean;
  routes_advanced_sorting: boolean;
  routes_live_tracking_future: boolean;
}
