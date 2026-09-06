"use client";
import Link from "next/link";
import { label, useLeads } from "@/lib/api/operations";

export function LeadLinks({ taskId, customerId }: { taskId?: string; customerId?: string }) {
  const { data, error } = useLeads({ task_id: taskId, customer_id: customerId });
  if (error) return <p className="text-xs text-ink-muted">Lead links unavailable</p>;
  if (!data?.items.length) return null;
  return <div className="flex flex-wrap gap-2 text-xs">{data.items.map((lead) => <Link key={lead.id} href={`/leads/${lead.id}`} className="text-brand hover:underline">Lead: {lead.name} · {label(lead.source)} →</Link>)}</div>;
}
