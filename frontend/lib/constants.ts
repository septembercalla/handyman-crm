import type { TaskCategory, TaskPriority, TaskStatus } from "./types";

export const TASK_STATUSES: TaskStatus[] = [
  "new",
  "assigned",
  "in_progress",
  "done",
  "cancelled",
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

/** badge fill colour, see SPEC §7 */
export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: "var(--status-new)",
  assigned: "var(--status-assigned)",
  in_progress: "var(--status-in_progress)",
  done: "var(--status-done)",
  cancelled: "var(--status-cancelled)",
};

export const TASK_CATEGORIES: TaskCategory[] = [
  "plumbing",
  "electrical",
  "hvac",
  "carpentry",
  "painting",
  "appliance",
  "general",
  "other",
];

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  carpentry: "Carpentry",
  painting: "Painting",
  appliance: "Appliance",
  general: "General",
  other: "Other",
};

export const TASK_PRIORITIES: TaskPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "var(--priority-low)",
  normal: "var(--priority-normal)",
  high: "var(--priority-high)",
  urgent: "var(--priority-urgent)",
};

/**
 * Allowed status transitions — SPEC §4.
 * new → assigned requires an assigned handyman (checked in the api layer).
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  new: ["assigned", "cancelled"],
  assigned: ["in_progress", "new", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: TaskStatus[] = ["done", "cancelled"];

export const PAGE_SIZE_OPTIONS = [25, 50, 100];
