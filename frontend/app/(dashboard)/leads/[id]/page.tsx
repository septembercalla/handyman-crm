"use client";

import { use } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadPhotos } from "@/components/leads/lead-photos";
import { LeadActions, LeadEditor, BookLead, MarkLost, LeadQuote, LeadNotes, RefundControl, LeadOwner, LeadEconomics } from "@/components/leads/lead-controls";
import { businessTime, label, PROPERTY_TYPES, leadLocation, leadStageClass, followUpClass, useLead, useLeadActivities, useOperations } from "@/lib/api/operations";

export default function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: lead, error } = useLead(id);
  const { data: history, error: historyError } = useLeadActivities(id);
  const { data: ops } = useOperations();
  if (error) return <p role="alert" className="p-4">{error.message}</p>;
  if (!lead) return <p className="p-4">Loading lead…</p>;
  const sourceUrl = lead.source_url && /^https?:\/\//i.test(lead.source_url) ? lead.source_url : null;
  return <>
    <PageHeader back="/leads"
      className="h-auto min-h-[52px] flex-wrap gap-y-2 py-2 [&>div:first-of-type]:flex-1 [&>div:last-child]:flex-wrap [&_h1]:whitespace-normal"
      title={<span className="block">
        <span className="block break-words">{lead.name}</span>
        {lead.job_summary && <span className="line-clamp-1 break-words text-xs font-normal leading-4" title={lead.job_summary}>{lead.job_summary}</span>}
        <span className="block text-xs font-normal leading-4 text-ink-muted">{lead.service_requested || "Service not recorded"} · {leadLocation(lead)}</span>
        <span className="block text-xs font-normal leading-4 text-ink-muted">{label(lead.source)} · Received {businessTime(lead.received_at, ops?.timezone)}</span>
      </span>}
      actions={<><LeadActions lead={lead} /><BookLead lead={lead} /><MarkLost lead={lead} /></>} />

    <div className="grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader className="flex-wrap"><CardTitle>Job & request</CardTitle>
            <div className="flex flex-wrap items-center gap-1">
              {lead.phone && <><Button asChild size="sm" variant="ghost"><a href={`tel:${lead.phone}`}>Call</a></Button><Button asChild size="sm" variant="ghost"><a href={`sms:${lead.phone}`}>Text</a></Button></>}
              {sourceUrl && <Button asChild size="sm" variant="outline"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">{lead.source === "thumbtack" ? "Open Thumbtack" : "Open Source"}</a></Button>}
            </div>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <p className="break-words text-[15px] font-medium">{lead.job_summary || "Summary not recorded"}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span>Property: {lead.property_type ? PROPERTY_TYPES[lead.property_type] : "Not specified"}</span>
              {lead.phone && <a className="text-brand hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>}
            </div>
            {lead.original_request ? <section className="border-t border-line pt-3" aria-label="Original request">
              <h3 className="mb-2 text-xs font-medium text-ink-muted">Original request</h3>
              <div className="has-[details[open]]:[&>p]:hidden">
                <p className="line-clamp-4 whitespace-pre-wrap break-words leading-relaxed">{lead.original_request}</p>
                <details className="group mt-2">
                  <summary className="cursor-pointer rounded-[4px] text-xs text-brand hover:underline focus-visible:outline-brand">
                    <span className="group-open:hidden">Read full request</span><span className="hidden group-open:inline">Collapse request</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{lead.original_request}</p>
                </details>
              </div>
            </section> : <p className="text-xs text-ink-muted">No original request recorded.</p>}
          </CardBody>
        </Card>
        <LeadPhotos leadId={lead.id} />
        <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardBody><LeadNotes lead={lead} /></CardBody></Card>
        <Card>
          <CardHeader><CardTitle>Source & economics</CardTitle><span className="text-xs text-ink-muted">{label(lead.source)}</span></CardHeader>
          <CardBody className="grid gap-4 xl:grid-cols-2">
            <div className="min-w-0 space-y-3 text-xs">
              <dl className="space-y-2">
                <div className="flex gap-3"><dt className="shrink-0 text-ink-muted">Source ID</dt><dd className="min-w-0 break-all">{lead.source_lead_id || "—"}</dd></div>
                {sourceUrl && <div><dt className="text-ink-muted">Source URL</dt><dd className="mt-1 break-all"><a className="text-brand hover:underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">{sourceUrl}</a></dd></div>}
              </dl>
              <RefundControl lead={lead} />
            </div>
            <div className="min-w-0 border-t border-line pt-3 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"><LeadEconomics lead={lead} /></div>
          </CardBody>
        </Card>
      </div>

      <aside className="min-w-0 space-y-4" aria-label="Lead operations">
        <Card>
          <CardHeader><CardTitle>Lead status</CardTitle><LeadEditor lead={lead} /></CardHeader>
          <CardBody className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2"><span className="text-ink-muted">Stage</span><span className={`rounded border px-2 py-0.5 ${leadStageClass(lead.stage)}`}>{label(lead.stage)}</span></div>
            <LeadOwner lead={lead} />
            <dl className="space-y-2 border-t border-line pt-3 [&>div]:grid [&>div]:grid-cols-[100px_minmax(0,1fr)] [&>div]:gap-3 [&_dd]:break-words">
              <div><dt className="text-ink-muted">Last contact</dt><dd>{businessTime(lead.last_contacted_at, ops?.timezone)}<span className="block text-ink-muted">{lead.contact_attempts} attempts</span></dd></div>
              <div><dt className="text-ink-muted">Method / result</dt><dd>{lead.last_contact_method ? label(lead.last_contact_method) : "—"} · {lead.latest_contact_outcome ? label(lead.latest_contact_outcome) : "—"}</dd></div>
              <div><dt className="text-ink-muted">Next action</dt><dd>{lead.next_action ? label(lead.next_action) : "—"}</dd></div>
              <div className={followUpClass(lead.follow_up_state)}><dt>Follow-up</dt><dd>{businessTime(lead.next_follow_up_at, ops?.timezone)}{["overdue", "due_today"].includes(lead.follow_up_state) ? ` · ${label(lead.follow_up_state)}` : ""}</dd></div>
            </dl>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
              {[["First contact", lead.first_contacted_at], ["Qualified", lead.qualified_at], ["Booked", lead.booked_at], ["Lost", lead.lost_at]].map(([text, value]) => <div key={text}><dt className="text-ink-muted">{text}</dt><dd>{businessTime(value, ops?.timezone)}</dd></div>)}
            </dl>
            {lead.lost_reason && <p className="break-words rounded bg-subtle p-2">Lost: {label(lead.lost_reason)}{lead.lost_note ? ` · ${lead.lost_note}` : ""}</p>}
            <p className="text-ink-muted">All times: {ops?.timezone ?? "Loading…"}</p>
            {(lead.converted_customer_id || lead.converted_task_id) && <div className="flex flex-wrap gap-3 text-brand">{lead.converted_customer_id && <Link className="hover:underline" href={`/customers/${lead.converted_customer_id}`}>Open customer →</Link>}{lead.converted_task_id && <Link className="hover:underline" href={`/tasks/${lead.converted_task_id}`}>Open job →</Link>}</div>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quote</CardTitle></CardHeader>
          <CardBody>
            {lead.quote_type === "not_quoted" ? <details className="group">
              <summary className="cursor-pointer rounded-[4px] text-sm focus-visible:outline-brand">Not quoted <span className="ml-2 text-xs text-brand group-open:hidden">View / record quote</span></summary>
              <div className="mt-3"><LeadQuote key={lead.quote_sent_at ?? "unquoted"} lead={lead} /></div>
            </details> : <LeadQuote key={lead.quote_sent_at ?? "unquoted"} lead={lead} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Activity history</CardTitle><span className="text-xs text-ink-muted">{history ? `${history.length} events · Newest first` : ""}</span></CardHeader>
          <CardBody className="max-h-[440px] overflow-y-auto overscroll-contain focus-visible:outline-brand" tabIndex={0} role="region" aria-label="Activity history, newest first">
            {historyError ? <p role="alert" className="text-sm">{historyError.message}</p> : !history ? <p className="text-xs text-ink-muted">Loading activity…</p> : history.length === 0 ? <p className="text-xs text-ink-muted">No activity recorded.</p> : <ol className="space-y-3 border-l border-line pl-3">
              {[...history].reverse().map((event) => <li key={event.id} className="relative text-xs before:absolute before:-left-[16.5px] before:top-1 before:size-1.5 before:rounded-full before:bg-line">
                <p className="font-medium">{label(event.event_type)}</p>
                <p className="mt-0.5 text-ink-muted">{businessTime(event.timestamp, ops?.timezone)}</p>
                <p className="break-words text-ink-muted">{event.user_name}</p>
                {event.note && <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{event.note}</p>}
              </li>)}
            </ol>}
          </CardBody>
        </Card>
      </aside>
    </div>
  </>;
}
