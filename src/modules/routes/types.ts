import { Timestamp } from 'firebase/firestore';

export type RouteStatus = 'draft' | 'active' | 'in_progress' | 'completed' | 'archived';
export type StopDueState = 'upcoming' | 'due' | 'overdue' | 'delayed' | 'completed';
export type OptimizationMode = 'none' | 'close_to_far' | 'far_to_close' | 'optimized';
export type RouteTemplateCadence = 'weekly' | 'bi_weekly' | 'monthly' | 'manual';
export type RouteTemplateMode = 'day' | 'area' | 'hybrid' | 'custom';

export interface BaseCamp {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface RouteTemplate {
  id?: string;
  ownerId: string;
  name: string;
  mode: RouteTemplateMode;
  cadence: RouteTemplateCadence;
  preferred_day?: number | null;
  service_area?: string;
  include_overdue: boolean;
  include_skipped: boolean;
  include_delayed: boolean;
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface Route {
  id?: string;
  ownerId: string;
  name: string;
  template_id?: string;
  template_name?: string;
  template_mode?: RouteTemplateMode;
  template_day?: number | null;
  template_area?: string;
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
  created_by_name?: string;
  assigned_team_id?: string;
  assigned_team_name_snapshot?: string;
  assigned_user_ids?: string[];
  assigned_user_names_snapshot?: string[];
  started_at?: Timestamp | string;
  started_by_user_id?: string;
  started_by_name?: string;
  completed_at?: Timestamp | string;
  completed_by_user_id?: string;
  completed_by_name?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RouteStop {
  id?: string;
  ownerId?: string;
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
  completed_by_user_id?: string;
  completed_by_name?: string;
  assigned_user_id?: string;
  assigned_user_name_snapshot?: string;
  verification_id?: string;
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
