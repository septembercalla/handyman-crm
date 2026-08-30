"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/common/stat-tile";
import { MiniTaskTable } from "@/components/tasks/mini-task-table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStats } from "@/lib/api/hooks";
import { STATUS_COLOR } from "@/lib/constants";
import { longDate, todayISO } from "@/lib/format";

export default function HomePage() {
  const { data, isLoading } = useStats();

  return (
    <>
      <PageHeader
        title="Home"
        meta={<span className="tnum">{longDate(todayISO())}</span>}
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus /> Create Task
            </Link>
          </Button>
        }
      />

      <div className="flex-1 space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {isLoading || !data ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px]" />
            ))
          ) : (
            <>
              <StatTile
                label="New"
                value={data.counts.new}
                accent={STATUS_COLOR.new}
                href="/tasks?status=new"
              />
              <StatTile
                label="Assigned"
                value={data.counts.assigned}
                accent={STATUS_COLOR.assigned}
                href="/tasks?status=assigned"
              />
              <StatTile
                label="In progress"
                value={data.counts.in_progress}
                accent={STATUS_COLOR.in_progress}
                href="/tasks?status=in_progress"
              />
              <StatTile
                label="Done today"
                value={data.done_today}
                accent={STATUS_COLOR.done}
                href="/tasks?status=done"
              />
              <StatTile
                label="Unassigned"
                value={data.unassigned}
                accent={STATUS_COLOR.cancelled}
                href="/tasks?unassigned=1"
                hint="need a handyman"
              />
            </>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
              <Link
                href={`/tasks?date_from=${todayISO()}&date_to=${todayISO()}`}
                className="text-[13px] font-medium text-brand hover:underline"
              >
                View the whole day
              </Link>
            </CardHeader>
            {isLoading || !data ? (
              <TableSkeleton />
            ) : (
              <MiniTaskTable
                tasks={data.today}
                columns={["window", "title_address", "handyman", "status"]}
                emptyTitle="Nothing scheduled for today"
              />
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs assignment</CardTitle>
              <Link
                href="/schedule"
                className="text-[13px] font-medium text-brand hover:underline"
              >
                Assign
              </Link>
            </CardHeader>
            {isLoading || !data ? (
              <TableSkeleton />
            ) : (
              <MiniTaskTable
                tasks={data.needs_assignment}
                columns={["number", "title_address", "category", "date", "priority"]}
                emptyTitle="Everything is assigned"
                emptyDescription="No task is left without a handyman."
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-8" />
      ))}
    </div>
  );
}
