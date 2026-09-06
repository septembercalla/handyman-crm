"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { useCustomers, useHandymen, useStats } from "@/lib/api/hooks";
import { businessTime, label, PROPERTY_TYPES, useLeadDispatchers, LEAD_SOURCES, CONTACT_METHODS, NEXT_ACTIONS, LOST_REASONS, REFUND_STATUSES, useLeadAction, useOperations, type Lead, type LeadInput } from "@/lib/api/operations";
import { CATEGORY_LABEL, TASK_CATEGORIES } from "@/lib/constants";

export const selectClass = "h-9 rounded-[4px] border border-line bg-surface px-2 text-[13px] text-ink";
export function FormField({ title, children }: { title: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-ink-muted">{title}{children}</label>;
}
function errorMessage(error: unknown) { toast.error(error instanceof Error ? error.message : "Could not save"); }

export function LeadEditor({ lead }: { lead?: Lead }) {
  const [open, setOpen] = useState(false);
  const mutation = useLeadAction();
  const router = useRouter();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const payload: LeadInput = {
      source: value("source") as LeadInput["source"], name: value("name"), service_requested: value("service_requested"),
      phone: value("phone") || null, city: value("city"), state: value("state").toUpperCase(), zip_code: value("zip_code"),
      job_summary: value("job_summary"), property_type: (value("property_type") || null) as LeadInput["property_type"],
      source_lead_id: value("source_lead_id") || null, source_url: value("source_url") || null,
      lead_cost: value("lead_cost") || null,
      original_request: value("original_request") || null,
    };
    if ([payload.name, payload.service_requested, payload.city, payload.state, payload.zip_code, payload.job_summary].some((value) => !value)) {
      toast.error("Complete the required name, service, location and job summary."); return;
    }
    try {
      const saved = await mutation.mutateAsync({ id: lead?.id, payload });
      setOpen(false); toast.success(lead ? "Lead updated" : "Lead received");
      if (!lead) router.push(`/leads/${saved.id}`);
    } catch (error) { errorMessage(error); }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant={lead ? "outline" : "default"}>{lead ? "Edit lead" : "+ New lead"}</Button></DialogTrigger>
    <DialogContent title={lead ? "Edit lead" : "New lead"} description="Capture the job and approximate location. Phone and source references are optional.">
      <form onSubmit={save} className="grid max-h-[75vh] gap-3 overflow-y-auto p-4 sm:grid-cols-2">
        <FormField title="Full name *"><Input name="name" required maxLength={255} defaultValue={lead?.name} /></FormField>
        <FormField title="Source *"><select name="source" className={selectClass} defaultValue={lead?.source ?? "thumbtack"}>
          {LEAD_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select></FormField>
        <FormField title="Service *"><Input name="service_requested" required maxLength={255} defaultValue={lead?.service_requested ?? ""} placeholder="Drywall repair" /></FormField>
        <div className="sm:col-span-2"><FormField title="Short job summary *"><Input name="job_summary" required maxLength={500} defaultValue={lead?.job_summary ?? ""} placeholder="Paint 2 rooms, walls and ceilings" /></FormField></div>
        <FormField title="Property type"><select name="property_type" className={selectClass} defaultValue={lead?.property_type ?? ""}><option value="">Not specified</option>{Object.entries(PROPERTY_TYPES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></FormField>
        <FormField title="Phone"><Input name="phone" type="tel" maxLength={64} defaultValue={lead?.phone ?? ""} /></FormField>
        <FormField title="City *"><Input required name="city" maxLength={128} defaultValue={lead?.city ?? ""} /></FormField>
        <FormField title="State *"><Input name="state" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" placeholder="IL" defaultValue={lead?.state ?? ""} /></FormField>
        <FormField title="ZIP *"><Input required name="zip_code" maxLength={16} defaultValue={lead?.zip_code ?? ""} /></FormField>
        <FormField title="Source Lead ID"><Input name="source_lead_id" maxLength={255} defaultValue={lead?.source_lead_id ?? ""} /></FormField>
        <FormField title="Source URL"><Input name="source_url" type="url" maxLength={2048} defaultValue={lead?.source_url ?? ""} /></FormField>
        <FormField title="Lead cost ($)"><Input name="lead_cost" type="number" min="0" step="0.01" max="9999999999.99" defaultValue={lead?.lead_cost ?? ""} /></FormField>
        <div className="sm:col-span-2"><FormField title="Original request"><Textarea name="original_request" maxLength={10000} defaultValue={lead?.original_request ?? ""} /></FormField></div>
        <Button size="sm" className="sm:col-span-2" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save lead"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}

export function MarkLost({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const mutation = useLeadAction();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await mutation.mutateAsync({id: lead.id, action: "lost", payload: {reason: data.get("reason"), note: data.get("note")}});
      setOpen(false); toast.success("Lead marked lost");
    } catch (error) { errorMessage(error); }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="dangerOutline" disabled={lead.stage === "lost" || lead.stage === "booked"}>Mark Lost</Button></DialogTrigger>
    <DialogContent title="Mark lost" description="Record why this potential job did not proceed.">
      <form onSubmit={save} className="space-y-3 p-4">
        <FormField title="Lost reason *"><select name="reason" className={selectClass} required defaultValue="">
          <option value="" disabled>Select reason</option>{LOST_REASONS.map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}
        </select></FormField>
        <FormField title="Lost note"><Textarea name="note" maxLength={2000} /></FormField>
        <Button size="sm" variant="dangerOutline" disabled={mutation.isPending}>Mark Lost</Button>
      </form>
    </DialogContent>
  </Dialog>;
}

export function LeadActions({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<string>("call");
  const [nextAction, setNextAction] = useState<string>(lead.next_action ?? "");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const followUp = followUpDate && followUpTime ? `${followUpDate}T${followUpTime}` : "";
  const { data: dashboard } = useStats();
  const mutation = useLeadAction();
  const { data: ops } = useOperations();
  const closed = lead.stage === "booked" || lead.stage === "lost";
  async function act(action: string, outcome?: string) {
    if ((action === "contact" || action === "follow-up") && Boolean(followUpDate) !== Boolean(followUpTime)) {
      toast.error("Select both follow-up date and time, or clear both"); return;
    }
    const payload = action === "contact" ? {outcome, method, note, ...(followUp ? {next_follow_up_at: followUp} : {})}
      : action === "follow-up" ? {next_follow_up_at: followUp || null, note}
      : action === "next-action" ? {next_action: nextAction || null, note} : {note};
    try {
      await mutation.mutateAsync({ id: lead.id, action, payload });
      setOpen(false); setNote(""); setFollowUpDate(""); setFollowUpTime(""); toast.success("Activity recorded");
    } catch (error) { errorMessage(error); }
  }
  return <Dialog open={open} onOpenChange={(value) => {setOpen(value); if (value) setNextAction(lead.next_action ?? "");}}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={closed}>Actions</Button></DialogTrigger>
    <DialogContent title={lead.name} description={`Contact, next step and qualification · ${ops?.timezone ?? "Business time"}`}>
      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
        <FormField title="Activity note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></FormField>
        <section className="space-y-2"><p className="text-sm font-semibold">Contact result</p>
          <FormField title="Contact method"><select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>{CONTACT_METHODS.map((m) => <option value={m} key={m}>{m === "thumbtack_message" ? "Thumbtack" : label(m)}</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-2">{[["answered", "Answered"], ["no_answer", "No answer"], ["voicemail", "Voicemail"], ["texted", "Text sent"], ["call_back_later", "Call back later"], ["wrong_number", "Wrong number"]].map(([outcome, text]) =>
            <Button size="sm" key={outcome} variant="outline" disabled={mutation.isPending || closed} onClick={() => act("contact", outcome)}>{text}</Button>)}</div>
        </section>
        <section className="space-y-2 border-t border-line pt-3"><FormField title="Next action"><select className={selectClass} value={nextAction} onChange={(e) => setNextAction(e.target.value)}><option value="">Not set</option>{NEXT_ACTIONS.map((n) => <option value={n} key={n}>{label(n)}</option>)}</select></FormField>
          <Button size="sm" variant="outline" disabled={mutation.isPending || closed} onClick={() => act("next-action")}>Save next action</Button>
        </section>
        <section className="space-y-2 border-t border-line pt-3"><div className="grid grid-cols-2 gap-3">
          <FormField title={`Follow-up date (${ops?.timezone ?? "business time"})`}><DatePicker compact ariaLabel="Follow-up date" value={followUpDate} onChange={setFollowUpDate} todayDate={dashboard?.business_date ?? null} disabled={!dashboard?.business_date} /></FormField>
          <FormField title="Time"><TimePicker ariaLabel="Follow-up time" value={followUpTime} onChange={setFollowUpTime} /></FormField>
        </div>
          <p className="text-[11px] text-ink-muted">Current: {businessTime(lead.next_follow_up_at, ops?.timezone)}. Contact actions keep this unless a new time is entered.</p>
          <Button size="sm" variant="outline" disabled={mutation.isPending || closed || !ops} onClick={() => act("follow-up")}>{followUpDate || followUpTime ? "Schedule follow-up" : "Clear follow-up"}</Button>
        </section>
        <section className="space-y-2 border-t border-line pt-3"><p className="text-xs text-ink-muted">Qualify after confirming scope, service fit, location and enough information for a quote.</p>
          <div className="flex gap-2"><Button size="sm" disabled={mutation.isPending || closed || lead.stage === "qualified"} onClick={() => act("qualify")}>Mark Qualified</Button><MarkLost lead={lead} /></div>
        </section>
      </div>
    </DialogContent>
  </Dialog>;
}

export function LeadNotes({ lead }: { lead: Lead }) {
  const mutation = useLeadAction();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try { await mutation.mutateAsync({id: lead.id, payload: {notes: String(data.get("notes") ?? "")}}); toast.success("Notes saved"); }
    catch (error) { errorMessage(error); }
  }
  return <form onSubmit={save} className="space-y-2"><Textarea key={lead.notes} name="notes" aria-label="Lead notes" defaultValue={lead.notes} maxLength={10000} /><Button size="sm" variant="outline" disabled={mutation.isPending}>Save notes</Button></form>;
}

export function RefundControl({ lead }: { lead: Lead }) {
  const mutation = useLeadAction();
  return <FormField title="Refund status"><select className={selectClass} value={lead.refund_status ?? ""} disabled={mutation.isPending}
    onChange={async (e) => {try {await mutation.mutateAsync({id: lead.id, payload: {refund_status: e.target.value || null}}); toast.success("Refund status saved");} catch (error) {errorMessage(error);}}}>
    <option value="">Not tracked</option>{REFUND_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
  </select></FormField>;
}

export function LeadQuote({ lead }: { lead: Lead }) {
  const [kind, setKind] = useState<string>(lead.quote_type);
  const mutation = useLeadAction();
  const {data: ops} = useOperations();
  const closed = lead.stage === "booked" || lead.stage === "lost";
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const materials = data.get("materials");
    const payload = {quote_type: kind, materials_included: materials === "" ? null : materials === "included",
      ...(kind === "fixed" ? {quoted_fixed_price: String(data.get("fixed"))} : {quoted_min: String(data.get("min")), quoted_max: String(data.get("max"))})};
    try {await mutation.mutateAsync({id: lead.id, action: "quote", payload}); toast.success("Quote recorded");} catch (error) {errorMessage(error);}
  }
  return <form onSubmit={save} className="space-y-3">
    <p className="text-sm">Current: {label(lead.quote_type)}{lead.quote_type === "fixed" ? ` · $${lead.quoted_fixed_price}` : lead.quote_type === "range" ? ` · $${lead.quoted_min}–$${lead.quoted_max}` : ""}</p>
    <p className="text-xs text-ink-muted">Recorded: {businessTime(lead.quote_sent_at, ops?.timezone)} · Materials: {lead.materials_included === null ? "Unspecified" : lead.materials_included ? "Included" : "Extra"}</p>
    {!closed && <><FormField title="Quote"><select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}><option value="not_quoted" disabled={lead.quote_type !== "not_quoted"}>Not quoted</option><option value="fixed">Fixed</option><option value="range">Range</option></select></FormField>
      {kind === "fixed" && <FormField title="Price ($)"><Input name="fixed" type="number" min="0" step="0.01" max="9999999999.99" required defaultValue={lead.quoted_fixed_price ?? ""} /></FormField>}
      {kind === "range" && <div className="grid grid-cols-2 gap-2"><FormField title="From ($)"><Input name="min" type="number" min="0" step="0.01" max="9999999999.99" required defaultValue={lead.quoted_min ?? ""} /></FormField><FormField title="To ($)"><Input name="max" type="number" min="0" step="0.01" max="9999999999.99" required defaultValue={lead.quoted_max ?? ""} /></FormField></div>}
      <FormField title="Materials"><select name="materials" className={selectClass} defaultValue={lead.materials_included === null ? "" : lead.materials_included ? "included" : "extra"}><option value="">Unspecified</option><option value="included">Included</option><option value="extra">Extra</option></select></FormField>
      <Button size="sm" disabled={mutation.isPending || kind === "not_quoted"}>Record quote</Button>
      <p className="text-xs text-ink-muted">Record a proposal sent manually. Final Task pricing is set separately at booking.</p></>}
  </form>;
}

export function BookLead({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fieldError = (key: string) => errors[key] ? <span id={`book-${key}-error`} role="alert" className="text-xs text-danger">{errors[key]}</span> : null;
  const [scheduledDate, setScheduledDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const { data: dashboard } = useStats();
  const [customerSearch, setCustomerSearch] = useState("");
  const { data: customers = [] } = useCustomers({ search: customerSearch });
  const [selectedCustomer, setSelectedCustomer] = useState<(typeof customers)[number] | null>(null);
  const customerOptions = selectedCustomer && !customers.some((c) => c.id === selectedCustomer.id)
    ? [selectedCustomer, ...customers] : customers;
  const { data: handymen = [] } = useHandymen({ status: "active" });
  const mutation = useLeadAction();
  const router = useRouter();
  async function book(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const nextErrors: Record<string, string> = {};
    for (const [key, label] of [["title", "Job title"], ["street_address", "Street address"], ["city", "City"], ["state", "State"], ["zip", "ZIP"]]) {
      if (!value(key)) nextErrors[key] = `${label} is required.`;
    }
    if (value("state") && value("state").length !== 2) nextErrors.state = "Use a two-letter state code.";
    if (!scheduledDate) nextErrors.date = "Select a scheduled date.";
    if (!timeFrom) nextErrors.from = "Select a start time.";
    if (!timeTo) nextErrors.to = "Select an end time.";
    else if (timeFrom && timeTo <= timeFrom) nextErrors.to = "End time must be after start time.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    try {
      const result = await mutation.mutateAsync({ id: lead.id, action: "book", payload: {
        customer_id: value("customer_id") || null, title: value("title"), category: value("category"),
        handyman_id: value("handyman_id") || null, scheduled_date: scheduledDate,
        time_window_start: timeFrom, time_window_end: timeTo,
        street_address: value("street_address"), city: value("city"), state: value("state"), zip: value("zip"),
      } });
      setOpen(false); toast.success("Job booked"); router.push(`/tasks/${result.converted_task_id}/edit`);
    } catch (error) { errorMessage(error); }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" disabled={lead.stage === "booked" || lead.stage === "lost"}>Book job</Button></DialogTrigger>
    <DialogContent title="Book job" description="Select an existing customer to avoid duplicates. Continue in the standard task editor after booking.">
      <form noValidate onSubmit={book} className="grid max-h-[75vh] gap-3 overflow-y-auto p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormField title="Find an existing customer"><Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Name, phone, email…" /></FormField></div>
        <div className="sm:col-span-2"><FormField title="Customer"><select name="customer_id" className={selectClass} value={selectedCustomer?.id ?? ""}
          onChange={(e) => setSelectedCustomer(customerOptions.find((c) => c.id === e.target.value) ?? null)}>
          <option value="">Create customer from {lead.name}</option>
          {customerOptions.map((c) => <option key={c.id} value={c.id}>{c.full_name} · {c.phone} · {c.email}</option>)}
        </select></FormField></div>
        <FormField title="Job title *"><Input aria-invalid={!!errors.title} aria-describedby={errors.title ? "book-title-error" : undefined} name="title" required maxLength={255} defaultValue={lead.job_summary?.slice(0, 255) || lead.service_requested || `Job for ${lead.name}`} />{fieldError("title")}</FormField>
        <FormField title="Category"><select className={selectClass} name="category" defaultValue="general">{TASK_CATEGORIES.map((c) => <option value={c} key={c}>{CATEGORY_LABEL[c]}</option>)}</select></FormField>
        <FormField title="Date *"><DatePicker compact ariaLabel="Book job date" value={scheduledDate} onChange={setScheduledDate}
          todayDate={dashboard?.business_date ?? null} disabled={!dashboard?.business_date} />{fieldError("date")}</FormField>
        <FormField title="Handyman"><select name="handyman_id" className={selectClass}><option value="">Unassigned</option>{handymen.map((h) => <option value={h.id} key={h.id}>{h.full_name}</option>)}</select></FormField>
        <FormField title="From (business time) *"><TimePicker ariaLabel="Book job from" value={timeFrom} onChange={setTimeFrom} />{fieldError("from")}</FormField>
        <FormField title="To (business time) *"><TimePicker ariaLabel="Book job to" value={timeTo} onChange={setTimeTo} />{fieldError("to")}</FormField>
        <div className="sm:col-span-2"><FormField title="Street address *"><Input aria-invalid={!!errors.street_address} aria-describedby={errors.street_address ? "book-street_address-error" : undefined} name="street_address" required maxLength={255} defaultValue={lead.address ?? ""} />{fieldError("street_address")}</FormField></div>
        <FormField title="City *"><Input aria-invalid={!!errors.city} aria-describedby={errors.city ? "book-city-error" : undefined} name="city" required maxLength={128} defaultValue={lead.city ?? ""} />{fieldError("city")}</FormField>
        <div className="grid grid-cols-2 gap-2"><FormField title="State *"><Input aria-invalid={!!errors.state} aria-describedby={errors.state ? "book-state-error" : undefined} name="state" required maxLength={2} defaultValue={lead.state ?? ""} />{fieldError("state")}</FormField><FormField title="ZIP *"><Input aria-invalid={!!errors.zip} aria-describedby={errors.zip ? "book-zip-error" : undefined} name="zip" required maxLength={16} defaultValue={lead.zip_code ?? ""} />{fieldError("zip")}</FormField></div>
        <p className="sm:col-span-2 text-xs text-ink-muted">* Required. Enter the full job address and schedule in business time. Handyman is optional.</p>
        <Button size="sm" className="sm:col-span-2" disabled={mutation.isPending}>{mutation.isPending ? "Booking…" : "Book & open task"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}


export function LeadOwner({ lead }: { lead: Lead }) {
  const { data: users, error } = useLeadDispatchers();
  const mutation = useLeadAction();
  const { data: ops } = useOperations();
  return <div className="space-y-2">
    <FormField title="Dispatcher"><select aria-label="Assigned dispatcher" className={selectClass} value={lead.assigned_dispatcher_id ?? ""} disabled={!users || mutation.isPending}
      onChange={async (e) => {try {await mutation.mutateAsync({id: lead.id, action: "assign", payload: {assigned_dispatcher_id: e.target.value}}); toast.success("Dispatcher assigned");} catch (error) {errorMessage(error);}}}>
      <option value="" disabled>Unassigned</option>
      {lead.assigned_dispatcher_id && !users?.some((user) => user.id === lead.assigned_dispatcher_id) && <option value={lead.assigned_dispatcher_id} disabled>{lead.assigned_dispatcher_name ?? "Previous dispatcher"} (unavailable)</option>}
      {users?.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
    </select></FormField>
    {error && <p role="alert" className="text-xs text-danger">Could not load dispatchers.</p>}
    <p className="text-xs text-ink-muted">Assigned: {businessTime(lead.assigned_at, ops?.timezone)}</p>
  </div>;
}

export function LeadEconomics({ lead }: { lead: Lead }) {
  const money = (value: string | null | undefined) => value == null ? "—" : value.startsWith("-") ? `-$${value.slice(1)}` : `$${value}`;
  const economics = lead.economics;
  return <div className="space-y-3 text-sm">
    <dl className="grid grid-cols-2 gap-3">
      <div><dt className="text-ink-muted">Lead cost</dt><dd>{money(lead.lead_cost)}</dd></div>
      <div><dt className="text-ink-muted">Job value</dt><dd>{money(economics.job_value)}</dd></div>
      <div><dt className="text-ink-muted">Revenue after lead cost</dt><dd>{money(economics.revenue_after_lead_cost)}</dd></div>
      <div><dt className="text-ink-muted">ROAS</dt><dd>{economics.roas == null ? "—" : `${economics.roas}×`}</dd></div>
      {economics.lost_result != null && <div><dt className="text-ink-muted">Lead result</dt><dd>{money(economics.lost_result)}</dd></div>}
    </dl>
    <p className="text-xs text-ink-muted">Job value uses the linked Task total. Revenue after lead cost excludes payout and other expenses; it is not profit. Unknown acquisition cost stays unspecified.</p>
  </div>;
}
