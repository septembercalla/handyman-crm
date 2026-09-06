"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/hooks/use-url-params";
import { PageHeader } from "@/components/layout/page-header";
import { LeadEditor, LeadActions, BookLead, selectClass, FormField } from "@/components/leads/lead-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { useStats } from "@/lib/api/hooks";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { businessTime, label, LEAD_SOURCES, LEAD_STAGES, CONTACT_OUTCOMES, NEXT_ACTIONS, leadLocation, leadStageClass, followUpClass, useLeads, useOperations } from "@/lib/api/operations";

function LeadsInner() {
  const sp = useSearchParams();
  const { setMany, clear } = useUrlParams();
  const params = Object.fromEntries(sp.entries());
  const { data, isLoading, error, refetch } = useLeads(params);
  const { data: ops } = useOperations();
  const { data: dashboard } = useStats();
  const filter = (key: string, value: string) => setMany({ [key]: value || null, page: null });
  const page = data?.page ?? Number(sp.get("page") || 1);
  return <>
    <PageHeader title="Leads" meta={<span>{data?.total ?? "…"} inquiries · {ops?.timezone ?? "Business time"}</span>} actions={<LeadEditor />} />
    <div className="flex-1 space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        {[["", "All leads"], ["needs_follow_up", "Needs attention"], ["new", "Not contacted"], ["due_today", "Due today"], ["overdue", "Overdue"], ["no_answer", "No answer"], ["stale", "No recent activity"]].map(([value, text]) =>
          <Button key={value} size="sm" variant={(sp.get("attention") ?? "") === value ? "default" : "outline"} onClick={() => filter("attention", value)}>{text}</Button>)}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
          <FormField title="Search"><Input aria-label="Search leads" placeholder="Name, job, service, city, source ID" value={sp.get("search") ?? ""} onChange={(e) => filter("search", e.target.value)} /></FormField>
          {[["source", LEAD_SOURCES], ["stage", LEAD_STAGES], ["outcome", CONTACT_OUTCOMES], ["next_action", NEXT_ACTIONS]].map(([key, choices]) =>
            <FormField key={key as string} title={key === "outcome" ? "Contact result" : label(key as string)}><select className={selectClass} value={sp.get(key as string) ?? ""} onChange={(e) => filter(key as string, e.target.value)}>
              <option value="">All</option>{(choices as readonly string[]).map((v) => <option key={v} value={v}>{label(v)}</option>)}
            </select></FormField>)}
          <FormField title="Received from"><DatePicker compact ariaLabel="Received from" className="w-[170px]"
            value={sp.get("date_from") ?? ""} onChange={(value) => filter("date_from", value)} todayDate={dashboard?.business_date ?? null} disabled={!dashboard?.business_date} /></FormField>
          <FormField title="Received through"><DatePicker compact ariaLabel="Received through" className="w-[170px]"
            value={sp.get("date_to") ?? ""} onChange={(value) => filter("date_to", value)} todayDate={dashboard?.business_date ?? null} disabled={!dashboard?.business_date} /></FormField>
          {sp.get("attention") === "stale" && <FormField title="Inactive hours"><Input type="number" min={1} max={8760} className="w-24" value={sp.get("stale_hours") ?? "48"} onChange={(e) => filter("stale_hours", e.target.value)} /></FormField>}
          <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>
        </div>
        {sp.get("booked_this_week") && <p className="bg-subtle px-3 py-2 text-xs">Showing leads booked this business week</p>}
        {error ? <div role="alert" className="p-4 text-sm">{error.message} <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div> : isLoading ? <p className="p-4 text-sm">Loading leads…</p> : !data?.items.length ? <p className="p-8 text-center text-sm text-ink-muted">No leads match these filters.</p> :
          <Table><THead><TR>{["Customer", "Job", "Location", "Received", "Dispatcher", "Stage", "Last Contact", "Contact Result", "Next Action", "Follow-up"].map((h) => <TH key={h}>{h}</TH>)}</TR></THead>
            <TBody>{data.items.map((lead) => <TR key={lead.id}>
              <TD><Link href={`/leads/${lead.id}`} className="font-semibold text-brand hover:underline">{lead.name}</Link>
                <p className="text-xs text-ink-muted">{lead.phone || lead.source_lead_id || "Source inquiry"} · {label(lead.source)}</p>
                <div className="mt-2 flex gap-1"><LeadActions lead={lead} /><BookLead lead={lead} /></div>
              </TD>
              <TD><p className="max-w-44 whitespace-normal">{lead.job_summary || lead.service_requested || "—"}</p><p className="text-xs text-ink-muted">{lead.service_requested}</p></TD><TD>{leadLocation(lead)}</TD>
              <TD className="text-xs">{businessTime(lead.received_at, ops?.timezone)}</TD>
              <TD><p className="max-w-28 whitespace-normal text-xs">{lead.assigned_dispatcher_name || "Unassigned"}</p></TD>
              <TD><span className={`rounded border px-2 py-1 text-xs ${leadStageClass(lead.stage)}`}>{label(lead.stage)}</span>
                {lead.converted_task_id && <Link href={`/tasks/${lead.converted_task_id}`} className="mt-2 block text-xs text-brand">Open job →</Link>}
              </TD>
              <TD className="text-xs">{businessTime(lead.last_contacted_at, ops?.timezone)}<p className="text-ink-muted">{lead.contact_attempts} attempts{lead.last_contact_method ? ` · ${label(lead.last_contact_method)}` : ""}</p></TD>
              <TD>{lead.latest_contact_outcome ? label(lead.latest_contact_outcome) : "—"}</TD><TD>{lead.next_action ? label(lead.next_action) : "—"}</TD>
              <TD className={`text-xs ${followUpClass(lead.follow_up_state)}`}>{businessTime(lead.next_follow_up_at, ops?.timezone)}
                {(lead.follow_up_state === "overdue" || lead.follow_up_state === "due_today") && <p>{label(lead.follow_up_state)}</p>}
              </TD>
            </TR>)}</TBody></Table>}
        <div className="flex items-center justify-end gap-3 border-t border-line p-3 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1 || isLoading} onClick={() => setMany({ page: String(page - 1) })}>Previous</Button>
          Page {page} · {data?.total ?? 0} leads
          <Button size="sm" variant="outline" disabled={!data || page * data.page_size >= data.total || isLoading} onClick={() => setMany({ page: String(page + 1) })}>Next</Button>
        </div>
      </Card>
    </div>
  </>;
}
export default function LeadsPage() {
  return <Suspense fallback={<p className="p-4">Loading…</p>}><LeadsInner /></Suspense>;
}
