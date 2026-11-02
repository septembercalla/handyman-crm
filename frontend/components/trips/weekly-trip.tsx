"use client";

import Link from "next/link";
import { useState, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  AlertCircle,
  Search,
  Users,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser, useHandymen } from "@/lib/api/hooks";
import { request } from "@/lib/api/client";
import {
  addDays,
  formatMoney,
  formatPercent,
  initials,
  timeWindow,
} from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

type Totals = {
  completed_jobs: number;
  scheduled_jobs: number;
  payout_not_set: number;
  job_value: string;
  labor_earnings: string;
  materials_reimbursement: string;
  total_payout: string;
};
type Job = {
  id: string;
  number: string;
  title: string;
  status: TaskStatus;
  customer_name: string;
  customer_phone: string;
  service_address: string;
  scheduled_date: string | null;
  completed_date: string | null;
  time_window_start: string | null;
  time_window_end: string | null;
  labor_price: string;
  materials_cost: string;
  job_value: string;
  payout_percent: string | null;
  labor_earnings: string | null;
  materials_reimbursement: string | null;
  total_payout: string | null;
};
type Day = Totals & { date: string; jobs: Job[] };
export type Trip = Totals & {
  handyman_id: string;
  handyman_name: string;
  handyman_status: string;
  timezone: string;
  week_start: string;
  week_end: string;
  days: Day[];
};
const date = (
  value: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Intl.DateTimeFormat("en-US", options).format(
    new Date(value + "T12:00:00"),
  );

function exportCsv(trip: Trip) {
  const safe = (value: string) =>
    `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  const rows = [
    [
      "Date",
      "Job",
      "Work",
      "Customer",
      "Service address",
      "Status",
      "Job value",
      "Labor earnings",
      "Materials reimbursement",
      "Calculated payout",
    ],
    ...trip.days.flatMap((day) =>
      day.jobs.map((job) => [
        day.date,
        job.number,
        job.title,
        job.customer_name,
        job.service_address,
        job.status,
        job.job_value,
        job.labor_earnings ?? "",
        job.materials_reimbursement ?? "",
        job.total_payout ?? "",
      ]),
    ),
    [
      "WEEK TOTAL",
      "",
      "",
      "",
      "",
      "Completed work only",
      trip.job_value,
      trip.labor_earnings,
      trip.materials_reimbursement,
      trip.total_payout,
    ],
  ];
  const blob = new Blob(
    ["\ufeff" + rows.map((row) => row.map(safe).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weekly-trip-${trip.week_start}-${trip.handyman_name.replace(/[^a-z0-9]/gi, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function WeeklyTrip() {
  const router = useRouter();
  const sp = useSearchParams();
  const selected = sp.get("handyman_id") ?? "";
  const week = sp.get("week_start") ?? undefined;
  const { data: user, isPending: userPending } = useCurrentUser();
  const admin = user?.role === "admin";
  const workers = useHandymen();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "done">("all");
  const workerId =
    selected ||
    workers.data?.find((w) => w.status === "active")?.id ||
    workers.data?.[0]?.id;
  const report = useQuery({
    queryKey: ["trips", workerId, week ?? "current"],
    queryFn: () =>
      request<Trip>(`/trips/${workerId}`, { params: { week_start: week } }),
    enabled: admin && !!workerId,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
  const trip = report.data;
  const worker = workers.data?.find((w) => w.id === workerId);
  function navigate(values: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/trips?${params.toString()}`, { scroll: false });
    setSearch("");
  }
  if (!userPending && !admin)
    return (
      <>
        <PageHeader title="Weekly trips" />
        <div className="workspace-content">
          <Card className="p-8">
            <h2 className="font-semibold">Administrator access required</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Weekly earnings are available to company administrators.
            </p>
            <Button asChild className="mt-5" variant="outline">
              <Link href="/handymen">Back to team</Link>
            </Button>
          </Card>
        </div>
      </>
    );
  const matches = (job: Job) =>
    (view === "all" || job.status === "done") &&
    `${job.number} ${job.title} ${job.customer_name} ${job.service_address}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const pending = workers.isPending || report.isPending || userPending;
  return (
    <>
      <PageHeader
        title="Weekly trips"
        meta="A clear view of each worker’s week."
        actions={
          <Button
            variant="outline"
            disabled={!trip || report.isFetching}
            onClick={() => trip && exportCsv(trip)}
          >
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="workspace-content space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label
                htmlFor="trip-worker"
                className="mb-2 block text-[11px] font-medium text-ink-muted"
              >
                Team member
              </label>
              <select
                id="trip-worker"
                value={workerId ?? ""}
                onChange={(e) => navigate({ handyman_id: e.target.value })}
                className="h-11 min-w-[240px] rounded-xl border border-line bg-surface px-3 text-sm font-medium disabled:opacity-50"
                disabled={workers.isPending || !workers.data?.length}
              >
                {!workers.data?.length && (
                  <option value="">
                    {workers.isPending
                      ? "Loading team…"
                      : "No team members yet"}
                  </option>
                )}
                {workers.data?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name}
                    {w.status === "inactive" ? " · Inactive" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="trip-week"
                className="mb-2 block text-[11px] font-medium text-ink-muted"
              >
                Week of
              </label>
              <div className="flex h-11 items-center rounded-xl border border-line bg-surface px-1">
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Previous week"
                  disabled={!trip}
                  onClick={() =>
                    trip &&
                    navigate({ week_start: addDays(trip.week_start, -7) })
                  }
                >
                  <ChevronLeft />
                </Button>
                <input
                  id="trip-week"
                  aria-label="Choose week"
                  type="date"
                  className="h-9 w-[145px] border-0 bg-transparent px-2 text-[13px] font-medium focus:outline-none"
                  value={trip?.week_start ?? week ?? ""}
                  onChange={(e) =>
                    navigate({ week_start: e.target.value || undefined })
                  }
                />
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Next week"
                  disabled={!trip}
                  onClick={() =>
                    trip &&
                    navigate({ week_start: addDays(trip.week_start, 7) })
                  }
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-6"
              onClick={() => navigate({ week_start: undefined })}
            >
              This week
            </Button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-muted">
            <span className="size-1.5 rounded-full bg-brand" />{" "}
            {trip?.timezone ?? "Business timezone"}
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Refresh weekly trip"
              disabled={report.isFetching || !workerId}
              onClick={() => void report.refetch()}
            >
              <RefreshCw className={report.isFetching ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {(workers.isError || report.isError) && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-[#ecd4b3] bg-[#fff8ec] p-4 text-sm text-[#805b24]"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">
                {report.data
                  ? "Could not refresh this week"
                  : "Could not load weekly trips"}
              </p>
              <p className="mt-1">
                {report.error?.message ??
                  workers.error?.message ??
                  "Try again."}
              </p>
              {trip && (
                <p className="mt-1">
                  The last successfully loaded report is shown below.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  void workers.refetch();
                  void report.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}
        {!workers.isPending &&
        !workers.isError &&
        workers.data?.length === 0 ? (
          <Card className="px-6 py-16 text-center">
            <Users className="mx-auto size-8 text-ink-muted" />
            <h2 className="mt-4 text-lg font-semibold">
              Your first week starts with your team
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Add a team member, assign a job, then return here to see their
              week.
            </p>
            <Button asChild className="mt-5">
              <Link href="/handymen">Open team</Link>
            </Button>
          </Card>
        ) : pending ? (
          <div aria-label="Loading weekly trip" className="space-y-5">
            <div className="h-32 animate-pulse rounded-2xl bg-subtle" />
            <div className="h-[440px] animate-pulse rounded-2xl bg-subtle" />
          </div>
        ) : (
          trip && (
            <>
              <div className="grid gap-4 lg:grid-cols-[1.25fr_3fr]">
                <div className="flex items-center gap-4 rounded-2xl bg-ink p-6 text-white">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl font-medium text-[#d7edad]">
                    {initials(trip.handyman_name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.14em] text-[#c4d1c8]">
                      WEEKLY TRIP
                    </p>
                    <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
                      {trip.handyman_name}
                    </h2>
                    <p className="mt-1 text-xs text-[#c4d1c8]">
                      {date(trip.week_start)} –{" "}
                      {date(trip.week_end, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <Link
                      href={`/handymen/${trip.handyman_id}`}
                      className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[#d7edad]"
                    >
                      Worker profile <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                </div>
                <Card className="grid grid-cols-2 gap-y-6 p-6 md:grid-cols-4">
                  <Metric
                    label="Completed jobs"
                    value={String(trip.completed_jobs)}
                    note={`${trip.scheduled_jobs} still scheduled`}
                  />
                  <Metric
                    label="Job value"
                    value={formatMoney(trip.job_value)}
                    note="Completed work · incl. materials"
                  />
                  <Metric
                    label="Labor earnings"
                    value={formatMoney(trip.labor_earnings)}
                    note="Worker’s share of labor"
                    accent
                  />
                  <Metric
                    label="Calculated payout"
                    value={formatMoney(trip.total_payout)}
                    note={`Includes ${formatMoney(trip.materials_reimbursement)} materials`}
                  />
                </Card>
              </div>
              {trip.payout_not_set > 0 && (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-xl border border-[#ecd4b3] bg-[#fff8ec] px-4 py-3 text-[12px] text-[#805b24]"
                >
                  <AlertCircle className="size-4 shrink-0" />
                  {trip.payout_not_set} completed{" "}
                  {trip.payout_not_set === 1 ? "job needs" : "jobs need"} a
                  payout percentage. Earnings totals include only jobs with a
                  configured percentage.
                </div>
              )}
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
                  <div className="flex items-center gap-1 rounded-lg bg-app p-1">
                    {(
                      [
                        { id: "all", label: "All jobs" },
                        { id: "done", label: "Completed" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        aria-pressed={view === tab.id}
                        onClick={() => setView(tab.id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === tab.id ? "bg-white text-ink shadow-[0_1px_3px_#172c2710]" : "text-ink-muted hover:text-ink"}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <label className="relative block w-full sm:w-[260px]">
                    <span className="sr-only">Search within this week</span>
                    <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
                    <input
                      placeholder="Search this week…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-xs"
                    />
                  </label>
                </div>
                <div className="scroll-thin overflow-x-auto">
                  <table className="trip-table w-full min-w-[940px] text-left text-[12px]">
                    <thead>
                      <tr>
                        <th className="w-[125px]">Day / date</th>
                        <th className="w-[25%]">Job / work</th>
                        <th className="w-[23%]">Customer / location</th>
                        <th className="w-[140px]">Time / status</th>
                        <th className="text-right">Job value</th>
                        <th className="text-right">Labor share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trip.days.map((day) => {
                        const jobs = day.jobs.filter(matches);
                        return (
                          <Fragment key={day.date}>
                            {jobs.length ? (
                              jobs.map((job, index) => (
                                <tr
                                  key={job.id}
                                  className={
                                    job.status === "cancelled"
                                      ? "opacity-60"
                                      : ""
                                  }
                                >
                                  {index === 0 && (
                                    <th
                                      scope="rowgroup"
                                      rowSpan={jobs.length}
                                      className="day-cell align-top"
                                    >
                                      <span className="block font-semibold text-ink">
                                        {date(day.date, { weekday: "long" })}
                                      </span>
                                      <span className="mt-1 block text-xs font-normal text-ink-muted">
                                        {date(day.date)}
                                      </span>
                                      {day.completed_jobs > 0 && (
                                        <span className="mt-3 block text-[10px] font-normal text-brand">
                                          {day.completed_jobs} completed
                                        </span>
                                      )}
                                    </th>
                                  )}
                                  <td>
                                    <Link
                                      href={`/tasks/${job.id}`}
                                      className="group block"
                                    >
                                      <span className="text-[10px] font-medium tracking-wide text-ink-muted">
                                        {job.number}
                                      </span>
                                      <span className="mt-1 block text-[13px] font-medium leading-5 text-ink group-hover:text-brand group-hover:underline">
                                        {job.title}
                                      </span>
                                    </Link>
                                    {job.completed_date &&
                                      job.scheduled_date &&
                                      job.completed_date !==
                                        job.scheduled_date && (
                                        <span className="mt-1 block text-[10px] text-ink-muted">
                                          Scheduled {date(job.scheduled_date)}
                                        </span>
                                      )}
                                  </td>
                                  <td>
                                    <span className="block font-medium text-ink">
                                      {job.customer_name}
                                    </span>
                                    <span className="mt-1 block max-w-[290px] leading-5 text-ink-muted">
                                      {job.service_address || "Address not set"}
                                    </span>
                                    {job.customer_phone && (
                                      <a
                                        href={`tel:${job.customer_phone}`}
                                        className="mt-0.5 block text-[11px] text-ink-muted hover:text-brand"
                                      >
                                        {job.customer_phone}
                                      </a>
                                    )}
                                  </td>
                                  <td>
                                    <span className="mb-2 block whitespace-nowrap text-[11px] text-ink-muted">
                                      {timeWindow(
                                        job.time_window_start,
                                        job.time_window_end,
                                      )}
                                    </span>
                                    <StatusBadge status={job.status} />
                                  </td>
                                  <td className="whitespace-nowrap text-right tabular-nums">
                                    <span className="font-medium">
                                      {formatMoney(job.job_value)}
                                    </span>
                                    <span className="mt-1 block text-[10px] text-ink-muted">
                                      {formatMoney(job.materials_cost)}{" "}
                                      materials
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap text-right tabular-nums">
                                    {job.status === "done" ? (
                                      job.labor_earnings === null ? (
                                        <span className="text-[#966521]">
                                          Not configured
                                        </span>
                                      ) : (
                                        <>
                                          <span className="font-semibold text-brand">
                                            {formatMoney(job.labor_earnings)}
                                          </span>
                                          <span className="mt-1 block text-[10px] text-ink-muted">
                                            {formatPercent(job.payout_percent)}{" "}
                                            of labor
                                          </span>
                                        </>
                                      )
                                    ) : (
                                      <span className="text-ink-muted">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <th scope="row" className="day-cell">
                                  <span className="block font-semibold">
                                    {date(day.date, { weekday: "long" })}
                                  </span>
                                  <span className="mt-1 block text-xs font-normal text-ink-muted">
                                    {date(day.date)}
                                  </span>
                                </th>
                                <td colSpan={5} className="text-ink-muted">
                                  <span className="inline-flex items-center gap-2">
                                    <span className="h-px w-5 bg-line" />
                                    {search
                                      ? "No matching jobs"
                                      : view === "done"
                                        ? "No completed jobs"
                                        : "No jobs scheduled"}
                                  </span>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2}>
                          Week total{" "}
                          <span className="ml-2 font-normal text-ink-muted">
                            {trip.completed_jobs} completed jobs
                          </span>
                        </th>
                        <td
                          colSpan={2}
                          className="text-[11px] font-normal text-ink-muted"
                        >
                          Full week · completed work only
                        </td>
                        <td className="text-right tabular-nums">
                          {formatMoney(trip.job_value)}
                        </td>
                        <td className="text-right tabular-nums text-brand">
                          {formatMoney(trip.labor_earnings)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[11px] text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    Completed jobs appear on their completion date. Planned jobs
                    use the appointment date.
                  </span>
                  <span>
                    {worker?.status === "inactive"
                      ? "Inactive worker · history available"
                      : "Monday – Sunday"}
                  </span>
                </div>
              </Card>
              <div className="flex items-start gap-2.5 px-1 text-[11px] leading-5 text-ink-muted">
                <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <p>
                  Calculated payout is an estimate owed to the worker, including
                  eligible materials reimbursement. It does not mean a customer
                  payment was collected or the worker was paid.
                </p>
              </div>
            </>
          )
        )}
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 px-1 md:px-3">
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <p
        className={`mt-2 text-[25px] font-semibold leading-8 tracking-[-0.8px] tabular-nums ${accent ? "text-brand" : "text-ink"}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] leading-4 text-ink-muted">{note}</p>
    </div>
  );
}
