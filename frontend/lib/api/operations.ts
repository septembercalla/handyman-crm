"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./client";
import type { Paginated, TaskWithRelations } from "@/lib/types";

export const LEAD_SOURCES = ["thumbtack", "google", "facebook", "tiktok", "website", "phone", "referral", "other"] as const;
export const LEAD_STAGES = ["new", "contacting", "qualified", "booked", "lost"] as const;
export const CONTACT_OUTCOMES = ["answered", "no_answer", "voicemail", "texted", "call_back_later", "wrong_number"] as const;
export const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (v) => v.toUpperCase());

export const CONTACT_METHODS = ["call", "text", "thumbtack_message", "email", "other"] as const;
export const NEXT_ACTIONS = ["call_customer", "send_text", "ask_for_photos", "send_estimate", "follow_up", "waiting_for_photos", "waiting_for_decision", "schedule_job", "no_action"] as const;
export const LOST_REASONS = ["no_response", "price_too_high", "price_inquiry_only", "hired_someone_else", "not_interested", "project_postponed", "outside_service_area", "not_our_service", "licensed_trade_required", "job_below_minimum", "schedule_conflict", "duplicate_lead", "fake_bad_lead", "wrong_contact_info", "stopped_responding_after_estimate", "other"] as const;
export const REFUND_STATUSES = ["not_requested", "requested", "approved", "denied"] as const;
export const PROPERTY_TYPES = { home: "Home", apartment_condo: "Apartment / Condo", commercial: "Commercial", other: "Other" } as const;
export interface LeadInput {
  source: typeof LEAD_SOURCES[number]; name: string; service_requested: string;
  city: string; state: string; zip_code: string; job_summary: string;
  phone?: string | null; property_type?: keyof typeof PROPERTY_TYPES | null;
  original_request?: string | null; source_lead_id?: string | null;
  source_url?: string | null; lead_cost?: string | null;
}
export interface Lead extends Omit<LeadInput, "service_requested" | "city" | "state" | "zip_code" | "job_summary"> {
  service_requested: string | null;
  city: string | null; state: string | null; zip_code: string | null; job_summary: string | null;
  assigned_dispatcher_id: string | null; assigned_at: string | null; assigned_dispatcher_name: string | null;
  economics: { job_value: string | null; revenue_after_lead_cost: string | null; roas: string | null; lost_result: string | null };
  id: string; stage: typeof LEAD_STAGES[number];
  email: string | null; address: string | null; notes: string;
  external_reference: string | null;
  latest_contact_outcome: typeof CONTACT_OUTCOMES[number] | null;
  last_contact_method: typeof CONTACT_METHODS[number] | null;
  next_action: typeof NEXT_ACTIONS[number] | null;
  received_at: string; first_contacted_at: string | null; last_contacted_at: string | null;
  next_follow_up_at: string | null; booked_at: string | null; last_activity_at: string;
  qualified_at: string | null; lost_at: string | null;
  contact_attempts: number; converted_customer_id: string | null;
  converted_task_id: string | null; lost_reason: typeof LOST_REASONS[number] | null;
  lost_note: string | null; refund_status: typeof REFUND_STATUSES[number] | null;
  quote_type: "not_quoted" | "fixed" | "range";
  quoted_fixed_price: string | null; quoted_min: string | null; quoted_max: string | null;
  materials_included: boolean | null; quote_sent_at: string | null;
  follow_up_state: "none" | "scheduled" | "due_today" | "overdue";
  created_at: string; updated_at: string;
}
export const leadLocation = (lead: Pick<Lead, "city" | "state" | "zip_code">) => {
  const region = [lead.state, lead.zip_code].filter(Boolean).join(" ");
  return [lead.city, region].filter(Boolean).join(lead.state ? ", " : " ") || "—";
};
export function useLeadDispatchers() {
  return useQuery({ queryKey: ["lead-dispatchers"], queryFn: () => request<{id: string; full_name: string}[]>("/leads/dispatchers") });
}
export const leadStageClass = (stage: Lead["stage"]) => ({
  new: "border-brand/30 bg-brand/10 text-brand", contacting: "border-line bg-subtle text-ink",
  qualified: "border-brand/30 bg-brand/10 text-brand", booked: "border-green-600/30 bg-green-50 text-green-700",
  lost: "border-line bg-subtle text-ink-muted",
})[stage];
export const followUpClass = (state: Lead["follow_up_state"]) => state === "overdue" ? "text-danger font-semibold" : state === "due_today" ? "text-amber-700 font-semibold" : "text-ink-muted";
export interface LeadActivity {
  id: string; event_type: string; timestamp: string; user_id: string | null;
  user_name: string; note: string;
}
export interface Operations {
  timezone: string; new_leads: number; needs_follow_up: number; no_answer: number;
  booked_this_week: number; completed_this_week: number; reviews_pending: number;
  five_star_this_week: number;
}
export function businessTime(iso: string | null, timezone?: string) {
  if (!iso || !timezone) return "—";
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : `${iso}Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "short",
    day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date);
}
export function useOperations() {
  return useQuery({ queryKey: ["operations"], queryFn: () => request<Operations>("/operations"), refetchInterval: 60_000 });
}
export function useLeads(params: Record<string, string | number | undefined>) {
  return useQuery({ queryKey: ["leads", params], queryFn: () => request<Paginated<Lead>>("/leads", { params }), refetchInterval: 60_000 });
}
export function useLead(id: string) {
  return useQuery({ queryKey: ["lead", id], queryFn: () => request<Lead>(`/leads/${id}`) });
}
export function useLeadActivities(id: string) {
  return useQuery({ queryKey: ["lead", id, "activities"], queryFn: () => request<LeadActivity[]>(`/leads/${id}/activities`) });
}
export function useLeadAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, payload }: { id?: string; action?: string; payload: object }) =>
      request<Lead>(id ? `/leads/${id}${action ? `/${action}` : ""}` : "/leads", {
        method: id && !action ? "PATCH" : "POST", body: payload,
      }),
    onSuccess: () => ["leads", "lead", "operations", "customers", "customer", "tasks", "task", "schedule", "unassigned", "dashboard"]
      .forEach((key) => qc.invalidateQueries({ queryKey: [key] })),
  });
}
export function useReviewAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: string; rating?: number; platform?: string }) =>
      request<TaskWithRelations>(`/tasks/${id}/review`, { method: "POST", body }),
    onSuccess: () => ["task", "tasks", "operations", "dashboard", "customer", "handyman", "schedule"]
      .forEach((key) => qc.invalidateQueries({ queryKey: [key] })),
  });
}
