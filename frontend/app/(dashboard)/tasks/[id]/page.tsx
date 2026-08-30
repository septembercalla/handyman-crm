"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  History,
  MapPin,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Detail } from "@/components/common/field";
import { PriorityBadge } from "@/components/common/priority-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusActions } from "@/components/tasks/status-actions";
import { StatusHistory } from "@/components/tasks/status-history";
import { MapView } from "@/components/map/map-view";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteTask, useTask } from "@/lib/api/hooks";
import { CATEGORY_LABEL } from "@/lib/constants";
import {
  dateTime,
  duration,
  fullAddress,
  longDate,
  timeWindow,
} from "@/lib/format";

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: task, isLoading } = useTask(id);
  const remove = useDeleteTask();

  if (isLoading || !task) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-[52px]" />
        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const hasGeo = task.latitude !== null && task.longitude !== null;

  return (
    <>
      <PageHeader
        back="/tasks"
        title={task.task_number}
        meta={
          <>
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </>
        }
        actions={
          <>
            <StatusActions task={task} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/tasks/${task.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button
              variant="dangerOutline"
              size="iconSm"
              title="Delete task"
              onClick={async () => {
                // leave the record first: an open detail query would otherwise
                // refetch the row we are about to delete and land on a 404
                router.push("/tasks");
                try {
                  await remove.mutateAsync(task.id);
                  toast.success("Task deleted");
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Could not delete the task",
                  );
                }
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{task.title}</CardTitle>
              <span className="text-[13px] text-ink-muted">
                {CATEGORY_LABEL[task.category]}
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              {task.description && (
                <p className="text-[13px] leading-5 text-ink">{task.description}</p>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <Detail label="Scheduled">
                  {longDate(task.scheduled_date)}
                </Detail>
                <Detail label="Time window">
                  <span className="tnum">
                    {timeWindow(task.time_window_start, task.time_window_end)}
                  </span>
                </Detail>
                <Detail label="Estimated">
                  {duration(task.estimated_duration_min)}
                </Detail>
                <Detail label="Address" className="sm:col-span-2">
                  {fullAddress(task)}
                </Detail>
                <Detail label="Created">{dateTime(task.created_at)}</Detail>
                {task.started_at && (
                  <Detail label="Started">{dateTime(task.started_at)}</Detail>
                )}
                {task.completed_at && (
                  <Detail label="Completed">{dateTime(task.completed_at)}</Detail>
                )}
              </div>
              {task.internal_notes && (
                <div className="rounded-[4px] border border-line bg-[#fbfbfc] px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-ink-muted">
                    Internal notes
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink">
                    {task.internal_notes}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle icon={<History />}>Status history</CardTitle>
            </CardHeader>
            <StatusHistory taskId={task.id} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle icon={<MapPin />}>Location</CardTitle>
            </CardHeader>
            {hasGeo ? (
              <MapView
                className="h-[260px] rounded-none border-x-0 border-t-0"
                points={[
                  {
                    id: task.id,
                    lat: task.latitude!,
                    lng: task.longitude!,
                    title: task.title,
                    subtitle: fullAddress(task),
                    color: task.handyman?.color ?? "#1a6fe0",
                  },
                ]}
              />
            ) : (
              <div className="flex items-start gap-2 bg-[#fef7db] px-4 py-3 text-[13px] text-ink">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#c77700]" />
                <span>
                  No coordinates yet — the backend will geocode this address.
                </span>
              </div>
            )}
            <CardBody className="text-[13px]">{fullAddress(task)}</CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle icon={<UserRound />}>Customer</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {task.customer ? (
                <>
                  <Link
                    href={`/customers/${task.customer.id}`}
                    className="text-[14px] font-medium text-brand hover:underline"
                  >
                    {task.customer.full_name}
                  </Link>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Detail label="Phone">{task.customer.phone || "—"}</Detail>
                    <Detail label="Email">{task.customer.email || "—"}</Detail>
                  </div>
                  {task.customer.notes && (
                    <p className="text-[12px] text-ink-muted">
                      {task.customer.notes}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-ink-muted">No customer linked</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Handyman</CardTitle>
            </CardHeader>
            <CardBody>
              {task.handyman ? (
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: task.handyman.color }}
                  />
                  <Link
                    href={`/handymen/${task.handyman.id}`}
                    className="text-[14px] font-medium text-brand hover:underline"
                  >
                    {task.handyman.full_name}
                  </Link>
                  <span className="ml-auto text-[12px] text-ink-muted">
                    {task.handyman.phone}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-ink-muted">Unassigned</span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/tasks/${task.id}/edit`}>Assign</Link>
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
