// These types mirror the data model from SPEC §3.
// Once the backend exists they describe the /api/v1 responses as-is.

export type UserRole = "admin" | "dispatcher";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export type HandymanStatus = "active" | "inactive";
export type HandymanDocumentType =
  | "contract"
  | "driver_license"
  | "w9"
  | "insurance"
  | "certification"
  | "other";

export interface Handyman {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  skills: TaskCategory[];
  hourly_rate: number | null;
  default_payout_percent: string;
  /** colour of this handyman's map markers */
  color: string;
  status: HandymanStatus;
  notes: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface HandymanDocument {
  id: string;
  handyman_id: string;
  file_name: string;
  document_type: HandymanDocumentType;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  created_at: string;
  /** number of tasks at this site; only the /customers endpoints fill it in */
  task_count?: number | null;
}

export type TaskCategory =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "carpentry"
  | "painting"
  | "appliance"
  | "general"
  | "other";

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type MaterialsPaidBy = "company" | "handyman" | "customer";

export type TaskStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "done"
  | "cancelled";

export interface Task {
  id: string;
  task_number: string;
  customer_id: string;
  handyman_id: string | null;

  title: string;
  category: TaskCategory;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;

  street_address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;

  scheduled_date: string | null;
  time_window_start: string | null;
  time_window_end: string | null;
  estimated_duration_min: number | null;

  labor_price: string;
  materials_cost: string;
  materials_paid_by: MaterialsPaidBy;
  handyman_payout_percent: string | null;
  customer_total: string;
  handyman_labor_earnings: string | null;
  materials_reimbursement: string;
  total_handyman_payout: string | null;
  internal_notes: string;

  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  review_status: "not_requested" | "requested" | "received" | "no_review" | "skipped";
  review_requested_at: string | null;
  review_received_at: string | null;
  review_rating: number | null;
  review_platform: "google" | "thumbtack" | "facebook" | "other" | null;
}

/** Task with its relations expanded — what GET /tasks and /tasks/{id} return */
export interface TaskWithRelations extends Task {
  customer: Customer | null;
  handyman: Handyman | null;
}

export interface TaskStatusHistoryEntry {
  id: string;
  task_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  changed_by: string;
  changed_by_name: string;
  changed_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface TaskListParams {
  review_pending?: boolean;
  completed_this_week?: boolean;
  five_star_this_week?: boolean;
  status?: TaskStatus | "";
  handyman_id?: string;
  category?: TaskCategory | "";
  priority?: TaskPriority | "";
  date_from?: string;
  date_to?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
  unassigned?: boolean;
}

export interface DashboardStats {
  business_date: string;
  timezone: string;
  counts: Record<TaskStatus, number>;
  done_today: number;
  unassigned: number;
  today: TaskWithRelations[];
  needs_assignment: TaskWithRelations[];
}

export interface ScheduleRow {
  handyman: Handyman;
  tasks: TaskWithRelations[];
}

export interface TravelLeg {
  handyman_id: string;
  from_task_id: string;
  to_task_id: string;
  drive_minutes: number | null;
  distance_meters: number | null;
  available_minutes: number | null;
  conflict_minutes: number | null;
  encoded_polyline: string | null;
  status: "ok" | "conflict" | "missing_coordinates" | "unavailable";
}

export interface ScheduleTravel {
  routes_configured: boolean;
  legs: TravelLeg[];
}

export interface PayrollTask {
  task_id: string;
  task_number: string;
  completed_at: string;
  completed_date: string;
  customer_name: string;
  labor_price: string;
  materials_cost: string;
  materials_paid_by: MaterialsPaidBy;
  payout_percent: string | null;
  labor_earnings: string | null;
  materials_reimbursement: string | null;
  total_payout: string | null;
}

export interface HandymanPayroll {
  handyman_id: string;
  handyman_name: string;
  completed_jobs: number;
  calculated_jobs: number;
  payout_not_set: number;
  labor_revenue: string;
  labor_earnings: string;
  materials_reimbursement: string;
  total_payout: string;
  tasks: PayrollTask[];
}

export interface WeeklyPayroll {
  timezone: string;
  week_start: string;
  week_end: string;
  handymen: HandymanPayroll[];
}
