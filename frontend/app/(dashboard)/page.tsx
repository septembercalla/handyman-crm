"use client";

import Link from "next/link";
import { ArrowUpRight, Plus, CheckCircle2, Phone, Star } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { MiniTaskTable } from "@/components/tasks/mini-task-table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser, useStats } from "@/lib/api/hooks";
import { useOperations } from "@/lib/api/operations";

export default function HomePage() {
  const stats = useStats();
  const operations = useOperations();
  const { data: user } = useCurrentUser();
  const data = stats.data;
  const follow = operations.data?.needs_follow_up;
  const reviews = operations.data?.reviews_pending;
  const businessDate = data
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(data.business_date + "T12:00:00"))
    : "Your office and field, in one place.";
  return (
    <>
      <PageHeader
        title="Overview"
        meta={businessDate}
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus /> Create job
            </Link>
          </Button>
        }
      />
      <div className="workspace-content space-y-6">
        {stats.isError && (
          <Card role="alert" className="p-5 text-sm">
            <p className="font-semibold">Could not refresh your workspace</p>
            <p className="mt-1 text-ink-muted">{stats.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void stats.refetch()}
            >
              Try again
            </Button>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {!data ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[110px]" />)
          ) : (
            <>
              <StatTile
                label="Jobs today"
                value={data.today.length}
                href={`/tasks?date_from=${data.business_date}&date_to=${data.business_date}`}
                hint="On the calendar"
              />
              <StatTile
                label="In progress"
                value={data.counts.in_progress}
                href="/tasks?status=in_progress"
                hint="Work underway"
              />
              <StatTile
                label="Needs assignment"
                value={data.unassigned}
                href="/tasks?unassigned=1"
                hint="Ready for dispatch"
              />
              <StatTile
                label="Completed this week"
                value={operations.data?.completed_this_week ?? "—"}
                href="/tasks?completed_this_week=1"
                hint="Monday – Sunday"
              />
            </>
          )}
        </div>
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <CheckCircle2 className="size-4 text-brand" />
            Office follow-up
          </div>
          {operations.isError ? (
            <button
              type="button"
              onClick={() => void operations.refetch()}
              className="text-xs text-danger"
            >
              Could not load · Retry
            </button>
          ) : (
            <>
              <Link
                href="/leads?attention=needs_follow_up"
                className="inline-flex items-center gap-2 text-xs text-ink-muted hover:text-brand"
              >
                <Phone className="size-3.5" />
                <span>
                  <strong className="font-semibold text-ink">
                    {follow ?? "—"}
                  </strong>{" "}
                  leads to follow up
                </span>
                <ArrowUpRight className="size-3" />
              </Link>
              <Link
                href="/tasks?review_pending=1"
                className="inline-flex items-center gap-2 text-xs text-ink-muted hover:text-brand"
              >
                <Star className="size-3.5" />
                <span>
                  <strong className="font-semibold text-ink">
                    {reviews ?? "—"}
                  </strong>{" "}
                  reviews pending
                </span>
                <ArrowUpRight className="size-3" />
              </Link>
            </>
          )}
          {user?.role === "admin" && (
            <Link
              href="/trips"
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand"
            >
              Weekly trips <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </Card>
        <div className="grid items-start gap-5 xl:grid-cols-[1.35fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Today’s schedule</CardTitle>
              <Link
                href="/schedule"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand"
              >
                Open schedule <ArrowUpRight className="size-3.5" />
              </Link>
            </CardHeader>
            {!data ? (
              <TableSkeleton />
            ) : (
              <MiniTaskTable
                tasks={data.today}
                columns={["window", "title_address", "handyman", "status"]}
                emptyTitle="A little breathing room"
                emptyDescription="No jobs scheduled for today. Your upcoming work is in Schedule."
              />
            )}
          </Card>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Ready to assign</CardTitle>
              <Link
                href="/tasks?unassigned=1"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand"
              >
                View jobs <ArrowUpRight className="size-3.5" />
              </Link>
            </CardHeader>
            {!data ? (
              <TableSkeleton />
            ) : (
              <MiniTaskTable
                tasks={data.needs_assignment}
                columns={["number", "title_address", "date"]}
                emptyTitle="Everyone knows where to go"
                emptyDescription="All jobs have a team member assigned."
              />
            )}
          </Card>
        </div>
        <p className="px-1 text-[11px] text-ink-muted">
          Appointments and weekly totals follow{" "}
          {data?.timezone ?? "the business timezone"}. Job changes from the
          mobile app appear on refresh.
        </p>
      </div>
    </>
  );
}
function TableSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
