"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useUrlParams } from "@/hooks/use-url-params";
import {
  LeadEditor,
  LeadActions,
  BookLead,
} from "@/components/leads/lead-controls";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  businessTime,
  label,
  LEAD_SOURCES,
  LEAD_STAGES,
  CONTACT_OUTCOMES,
  NEXT_ACTIONS,
  leadLocation,
  useLeads,
  useOperations,
  type Lead,
} from "@/lib/api/operations";

const attentionOptions = [
  ["", "All leads"],
  ["needs_follow_up", "Needs attention"],
  ["new", "Not contacted"],
  ["due_today", "Due today"],
  ["overdue", "Overdue"],
  ["no_answer", "No answer"],
  ["stale", "No recent activity"],
];
const stageColors: Record<Lead["stage"], string> = {
  new: "text-[#626b76]",
  contacting: "text-[#52657a]",
  qualified: "text-[#685591]",
  booked: "text-[#277354]",
  lost: "text-[#a14742]",
};
type Action = "activity" | "book";
const advancedKeys = [
  "outcome",
  "next_action",
  "date_from",
  "date_to",
  "stale_hours",
  "booked_this_week",
];

function compactDate(
  value: string | null,
  zone: string | undefined,
  withTime = false,
) {
  if (!value || !zone) return "—";
  const stamp = new Date(
    /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`,
  );
  if (Number.isNaN(stamp.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" as const } : {}),
  }).format(stamp);
}

function RowActions({
  lead,
  onAction,
}: {
  lead: Lead;
  onAction: (lead: Lead, action: Action) => void;
}) {
  const [open, setOpen] = useState(false);
  const closed = lead.stage === "booked" || lead.stage === "lost";
  const primary: Action = lead.stage === "qualified" ? "book" : "activity";
  return (
    <div className="flex items-center justify-end gap-1">
      {closed ? (
        <Link
          href={
            lead.converted_task_id
              ? `/tasks/${lead.converted_task_id}`
              : `/leads/${lead.id}`
          }
          className="leads-row-action"
        >
          {lead.converted_task_id ? "Open job" : "View lead"}
          <ArrowUpRight className="size-3" />
        </Link>
      ) : (
        <button
          type="button"
          className="leads-row-action"
          onClick={() => onAction(lead, primary)}
        >
          {primary === "book" ? "Book job" : "Contact"}
        </button>
      )}
      {!closed || lead.converted_task_id ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${lead.name}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#737b86] hover:bg-[#f0f2f4] hover:text-[#24292f]"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            aria-label={`Actions for ${lead.name}`}
            className="w-48 rounded-md p-1 shadow-md"
          >
            {!closed && (
              <>
                {primary !== "activity" && (
                  <button
                    type="button"
                    className="leads-menu-action"
                    onClick={() => {
                      setOpen(false);
                      onAction(lead, "activity");
                    }}
                  >
                    Log contact / follow-up
                  </button>
                )}
                {primary !== "book" && (
                  <button
                    type="button"
                    className="leads-menu-action"
                    onClick={() => {
                      setOpen(false);
                      onAction(lead, "book");
                    }}
                  >
                    Book job
                  </button>
                )}
              </>
            )}
            <Link href={`/leads/${lead.id}`} className="leads-menu-action">
              Open lead details
            </Link>
          </PopoverContent>
        </Popover>
      ) : (
        <span className="size-7" aria-hidden="true" />
      )}
    </div>
  );
}

function LeadsInner() {
  const sp = useSearchParams();
  const { setMany, clear } = useUrlParams();
  const query = useLeads(Object.fromEntries(sp.entries()));
  const { data: ops } = useOperations();
  const [search, setSearch] = useState(sp.get("search") ?? "");
  const [dialog, setDialog] = useState<{ lead: Lead; action: Action } | null>(
    null,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const urlSearch = sp.get("search") ?? "";
  useEffect(() => setSearch(urlSearch), [urlSearch]);
  useEffect(() => {
    if (search === urlSearch) return;
    const timer = setTimeout(
      () => setMany({ search: search || null, page: null }),
      300,
    );
    return () => clearTimeout(timer);
  }, [search, urlSearch, setMany]);
  const filter = (key: string, value: string) =>
    setMany({ [key]: value || null, page: null });
  const advancedCount = advancedKeys.filter((key) => sp.get(key)).length;
  const hasFilters = [
    ...advancedKeys,
    "search",
    "source",
    "stage",
    "attention",
  ].some((key) => sp.get(key));
  const data = query.data;
  const page = data?.page ?? (Number(sp.get("page")) || 1);
  const from = data?.total ? (page - 1) * data.page_size + 1 : 0;
  const to = data ? Math.min(page * data.page_size, data.total) : 0;
  const reset = () => {
    setSearch("");
    clear();
  };
  return (
    <section className="leads-workspace flex min-h-screen flex-1 flex-col">
      <header className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-[-0.35px]">
            Leads
          </h1>
          <span className="tnum text-xs text-ink-muted">
            {data?.total ?? "…"} inquiries
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[10px] text-ink-muted sm:block">
            {ops?.timezone ?? "Business time"}
          </span>
          <LeadEditor />
        </div>
      </header>
      <div className="px-6 pb-6">
        <div
          role="search"
          aria-label="Lead filters"
          className="flex flex-wrap items-center gap-2 border-b border-line py-3"
        >
          <label className="relative min-w-[170px] flex-1 sm:max-w-[240px]">
            <span className="sr-only">Search leads</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              className="leads-control leads-search w-full"
              value={search}
              placeholder="Search name, job, city…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Attention filter"
            className="leads-control max-w-[160px]"
            value={sp.get("attention") ?? ""}
            onChange={(e) => filter("attention", e.target.value)}
          >
            {attentionOptions.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <select
            aria-label="Stage filter"
            className="leads-control w-[125px]"
            value={sp.get("stage") ?? ""}
            onChange={(e) => filter("stage", e.target.value)}
          >
            <option value="">All stages</option>
            {LEAD_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {label(stage)}
              </option>
            ))}
          </select>
          <select
            aria-label="Source filter"
            className="leads-control w-[135px]"
            value={sp.get("source") ?? ""}
            onChange={(e) => filter("source", e.target.value)}
          >
            <option value="">All sources</option>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {label(source)}
              </option>
            ))}
          </select>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="leads-control inline-flex items-center gap-1.5"
              >
                <SlidersHorizontal className="size-3.5" />
                Filters
                {advancedCount > 0 && (
                  <span className="tnum ml-0.5 text-ink-muted">
                    ({advancedCount})
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="leads-filter-panel w-[320px] rounded-lg p-4"
            >
              <h2 className="mb-4 text-sm font-semibold">More filters</h2>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-[11px] text-ink-muted">
                  Contact result
                  <select
                    aria-label="Contact result filter"
                    className="leads-control w-full"
                    value={sp.get("outcome") ?? ""}
                    onChange={(e) => filter("outcome", e.target.value)}
                  >
                    <option value="">Any result</option>
                    {CONTACT_OUTCOMES.map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-[11px] text-ink-muted">
                  Next action
                  <select
                    aria-label="Next action filter"
                    className="leads-control w-full"
                    value={sp.get("next_action") ?? ""}
                    onChange={(e) => filter("next_action", e.target.value)}
                  >
                    <option value="">Any action</option>
                    {NEXT_ACTIONS.map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-[11px] text-ink-muted">
                  Received from
                  <input
                    className="leads-control w-full"
                    type="date"
                    value={sp.get("date_from") ?? ""}
                    onChange={(e) => filter("date_from", e.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-[11px] text-ink-muted">
                  Received through
                  <input
                    className="leads-control w-full"
                    type="date"
                    value={sp.get("date_to") ?? ""}
                    onChange={(e) => filter("date_to", e.target.value)}
                  />
                </label>
                {sp.get("attention") === "stale" && (
                  <label className="space-y-1.5 text-[11px] text-ink-muted">
                    Inactive hours
                    <input
                      type="number"
                      min={1}
                      max={8760}
                      className="leads-control w-full"
                      value={sp.get("stale_hours") ?? "48"}
                      onChange={(e) => filter("stale_hours", e.target.value)}
                    />
                  </label>
                )}
                <label className="col-span-2 flex items-center gap-2 pt-1 text-xs">
                  <input
                    type="checkbox"
                    checked={sp.get("booked_this_week") === "1"}
                    onChange={(e) =>
                      filter("booked_this_week", e.target.checked ? "1" : "")
                    }
                  />
                  Booked this business week
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <button
                  type="button"
                  className="text-xs text-ink-muted hover:text-ink"
                  onClick={reset}
                >
                  Reset filters
                </button>
                <button
                  type="button"
                  className="leads-control"
                  onClick={() => setFiltersOpen(false)}
                >
                  Done
                </button>
              </div>
            </PopoverContent>
          </Popover>
          {hasFilters && (
            <button
              type="button"
              className="leads-control inline-flex items-center gap-1 text-ink-muted"
              onClick={reset}
            >
              <X className="size-3" />
              Clear
            </button>
          )}
          <button
            type="button"
            className="ml-auto flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-hover disabled:opacity-40"
            aria-label="Refresh leads"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`}
            />
          </button>
        </div>
        {query.error ? (
          <div role="alert" className="flex items-center gap-3 py-8 text-sm">
            <span>{query.error.message}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : query.isLoading ? (
          <p className="py-10 text-center text-sm text-ink-muted">
            Loading leads…
          </p>
        ) : !data?.items.length ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">No leads match these filters</p>
            {hasFilters && (
              <button
                type="button"
                className="mt-2 text-xs text-ink-muted underline"
                onClick={reset}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="leads-table tnum w-full min-w-[960px] table-fixed text-left text-xs">
              <colgroup>
                {[
                  "145px",
                  "180px",
                  "110px",
                  "78px",
                  "110px",
                  "78px",
                  "145px",
                  "110px",
                  "118px",
                ].map((width, index) => (
                  <col
                    key={index}
                    className={index === 4 ? "leads-owner-column" : undefined}
                    style={{ width }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {[
                    "Customer",
                    "Job",
                    "Location",
                    "Received",
                    "Dispatcher",
                    "Stage",
                    "Status",
                    "Follow-up",
                    "",
                  ].map((name, index) => (
                    <th
                      key={index}
                      scope="col"
                      className={
                        index === 4
                          ? "leads-owner-column"
                          : index === 8
                            ? "sticky right-0 bg-white text-right"
                            : ""
                      }
                    >
                      {name || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((lead) => {
                  const next = lead.next_action ? label(lead.next_action) : "";
                  const result = lead.latest_contact_outcome
                    ? label(lead.latest_contact_outcome)
                    : "";
                  const status =
                    [result, next].filter(Boolean).join(" → ") ||
                    (lead.last_contacted_at
                      ? "Contact logged"
                      : "Not contacted");
                  const detail = `${status}. Last contact: ${businessTime(lead.last_contacted_at, ops?.timezone)}. ${lead.contact_attempts} attempts${lead.last_contact_method ? ` · ${label(lead.last_contact_method)}` : ""}`;
                  return (
                    <tr key={lead.id}>
                      <td>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="block truncate font-medium text-ink hover:underline"
                          title={`${lead.name} · ${lead.phone || "Phone not set"} · ${label(lead.source)} · ${lead.assigned_dispatcher_name || "Unassigned"}`}
                        >
                          {lead.name}
                        </Link>
                      </td>
                      <td
                        title={
                          lead.job_summary ||
                          lead.service_requested ||
                          undefined
                        }
                      >
                        <span className="block truncate">
                          {lead.job_summary || lead.service_requested || "—"}
                        </span>
                      </td>
                      <td title={leadLocation(lead)}>
                        <span className="block truncate text-ink-muted">
                          {leadLocation(lead)}
                        </span>
                      </td>
                      <td
                        title={businessTime(lead.received_at, ops?.timezone)}
                        className="whitespace-nowrap text-ink-muted"
                      >
                        {compactDate(lead.received_at, ops?.timezone)}
                      </td>
                      <td className="leads-owner-column">
                        <span
                          className="block truncate text-ink-muted"
                          title={lead.assigned_dispatcher_name || "Unassigned"}
                        >
                          {lead.assigned_dispatcher_name || "—"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium ${stageColors[lead.stage]}`}
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-current"
                            aria-hidden="true"
                          />
                          {label(lead.stage)}
                        </span>
                      </td>
                      <td title={detail}>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {status}
                        </span>
                      </td>
                      <td
                        title={businessTime(
                          lead.next_follow_up_at,
                          ops?.timezone,
                        )}
                      >
                        <span
                          className={`block truncate text-[11px] ${lead.follow_up_state === "overdue" ? "font-medium text-[#a14742]" : lead.follow_up_state === "due_today" ? "font-medium text-[#94651e]" : "text-ink-muted"}`}
                        >
                          {compactDate(
                            lead.next_follow_up_at,
                            ops?.timezone,
                            true,
                          )}
                        </span>
                      </td>
                      <td className="sticky right-0 bg-white">
                        <RowActions
                          lead={lead}
                          onAction={(selected, action) =>
                            setDialog({ lead: selected, action })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer className="flex items-center justify-between gap-3 border-t border-line py-3 text-[11px] text-ink-muted">
          <span className="tnum">
            {from}–{to} of {data?.total ?? 0} leads
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              className="leads-control flex size-7 items-center justify-center !p-0"
              disabled={page <= 1 || query.isLoading}
              onClick={() => setMany({ page: String(page - 1) })}
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="tnum min-w-16 text-center">Page {page}</span>
            <button
              type="button"
              aria-label="Next page"
              className="leads-control flex size-7 items-center justify-center !p-0"
              disabled={
                !data || page * data.page_size >= data.total || query.isLoading
              }
              onClick={() => setMany({ page: String(page + 1) })}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </footer>
      </div>
      {dialog?.action === "activity" && (
        <LeadActions
          lead={dialog.lead}
          controlledOpen
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          hideTrigger
        />
      )}
      {dialog?.action === "book" && (
        <BookLead
          lead={dialog.lead}
          controlledOpen
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          hideTrigger
        />
      )}
    </section>
  );
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-ink-muted">Loading leads…</div>
      }
    >
      <LeadsInner />
    </Suspense>
  );
}
