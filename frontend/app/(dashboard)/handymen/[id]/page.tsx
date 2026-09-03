"use client";

import Link from "next/link";
import { use, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PriorityBadge } from "@/components/common/priority-badge";
import { HandymanDeleteDialog } from "@/components/handymen/handyman-delete-dialog";
import { HandymanDialog } from "@/components/handymen/handyman-dialog";
import { HandymanDocuments } from "@/components/handymen/handyman-documents";
import { MapView } from "@/components/map/map-view";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser, useHandyman, useHandymanDay } from "@/lib/api/hooks";
import { CATEGORY_LABEL } from "@/lib/constants";
import {
  addDays,
  duration,
  fullAddress,
  longDate,
  timeWindow,
  todayISO,
} from "@/lib/format";

/**
 * The key screen — a direct analogue of Trip in the reference:
 * Stops / Tasks tabs with counters on the left, the day route map on the right.
 */
export default function HandymanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [date, setDate] = useState(todayISO());
  const [selected, setSelected] = useState<string | null>(null);

  const { data: currentUser } = useCurrentUser();
  const { data: handyman, isLoading } = useHandyman(id);
  const { data: tasks = [], isLoading: tasksLoading } = useHandymanDay(id, date);

  if (isLoading || !handyman) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-[52px]" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const points = tasks
    .filter((t) => t.latitude !== null && t.longitude !== null)
    .map((t, i) => ({
      id: t.id,
      lat: t.latitude!,
      lng: t.longitude!,
      index: i + 1,
      color: handyman.color,
      title: t.title,
      subtitle: fullAddress(t),
    }));

  const totalMin = tasks.reduce(
    (acc, t) => acc + (t.estimated_duration_min ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        back="/handymen"
        title={handyman.full_name}
        meta={
          <>
            <span
              className="inline-flex h-[18px] items-center rounded-[3px] px-1.5 text-[11px] font-semibold uppercase leading-none text-white"
              style={{
                backgroundColor:
                  handyman.status === "active" ? "#1f8a4c" : "#6b7785",
              }}
            >
              {handyman.status}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" /> {handyman.phone}
            </span>
            <span className="hidden items-center gap-1 lg:flex">
              <Mail className="size-3.5" /> {handyman.email}
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <HandymanDialog handyman={handyman}>
              <Button variant="outline" size="sm">
                <Pencil /> Edit
              </Button>
            </HandymanDialog>
            <HandymanDeleteDialog handyman={handyman}>
              <Button variant="outline" size="iconSm" aria-label="Delete handyman">
                <Trash2 />
              </Button>
            </HandymanDeleteDialog>
            <Button
              variant="outline"
              size="iconSm"
              aria-label="Previous day"
              onClick={() => setDate((d) => addDays(d, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant={date === todayISO() ? "default" : "outline"}
              size="sm"
              onClick={() => setDate(todayISO())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="iconSm"
              aria-label="Next day"
              onClick={() => setDate((d) => addDays(d, 1))}
            >
              <ChevronRight />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="h-8 w-[140px]"
            />
          </div>
        }
      />

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-col items-start gap-0.5 py-3">
            <CardTitle>Route</CardTitle>
            <p className="text-[12px] text-ink-muted">{longDate(date)}</p>
          </CardHeader>

          <Tabs defaultValue="stops">
            <TabsList>
              <TabsTrigger value="stops" count={points.length}>
                Stops
              </TabsTrigger>
              <TabsTrigger value="tasks" count={tasks.length}>
                Tasks
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stops">
              {tasksLoading ? (
                <RowsSkeleton />
              ) : points.length === 0 ? (
                <EmptyState
                  title="No stops on this day"
                  description="Assign tasks to this handyman on the Schedule screen."
                />
              ) : (
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH className="w-10">#</TH>
                      <TH>Time</TH>
                      <TH>Address</TH>
                      <TH>Customer</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {tasks.map((t, i) => (
                      <TR
                        key={t.id}
                        onMouseEnter={() => setSelected(t.id)}
                        onMouseLeave={() => setSelected(null)}
                        className="cursor-pointer"
                      >
                        <TD>
                          <span
                            className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: handyman.color }}
                          >
                            {i + 1}
                          </span>
                        </TD>
                        <TD className="tnum whitespace-nowrap">
                          {timeWindow(t.time_window_start, t.time_window_end)}
                        </TD>
                        <TD>
                          <Link href={`/tasks/${t.id}`} className="hover:underline">
                            {fullAddress(t)}
                          </Link>
                        </TD>
                        <TD className="text-ink-muted">
                          {t.customer?.full_name ?? "—"}
                        </TD>
                        <TD>
                          <StatusBadge status={t.status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="tasks">
              {tasksLoading ? (
                <RowsSkeleton />
              ) : tasks.length === 0 ? (
                <EmptyState title="No tasks on this day" />
              ) : (
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Task #</TH>
                      <TH>Title</TH>
                      <TH>Category</TH>
                      <TH>Address</TH>
                      <TH>Time</TH>
                      <TH>Priority</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {tasks.map((t) => (
                      <TR key={t.id} className="cursor-pointer">
                        <TD className="tnum">
                          <Link
                            href={`/tasks/${t.id}`}
                            className="font-medium text-brand hover:underline"
                          >
                            {t.task_number}
                          </Link>
                        </TD>
                        <TD className="font-medium">{t.title}</TD>
                        <TD className="text-ink-muted">
                          {CATEGORY_LABEL[t.category]}
                        </TD>
                        <TD className="text-ink-muted">{fullAddress(t)}</TD>
                        <TD className="tnum whitespace-nowrap">
                          {timeWindow(t.time_window_start, t.time_window_end)}
                        </TD>
                        <TD>
                          <PriorityBadge priority={t.priority} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle icon={<MapPin />}>Day route</CardTitle>
            </CardHeader>
            <MapView
              className="h-[320px] rounded-none border-x-0 border-t-0"
              points={points}
              route
              selectedId={selected}
              onSelect={setSelected}
            />
            <CardBody className="flex items-center justify-between gap-3 text-[13px]">
              <span className="tnum">
                Tasks: {tasks.length} · Stops: {points.length}
              </span>
              <span className="tnum flex items-center gap-1 text-ink-muted">
                <Clock className="size-3.5" /> {duration(totalMin)}
              </span>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-[13px]">
              <div className="flex flex-wrap gap-1">
                {handyman.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-[3px] border border-line px-1.5 py-0.5 text-[11px] text-ink-muted"
                  >
                    {CATEGORY_LABEL[s]}
                  </span>
                ))}
              </div>
              {(handyman.street_address ||
                handyman.city ||
                handyman.state ||
                handyman.zip) && (
                <div className="flex items-start gap-2 text-ink-muted">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide">
                      Home address
                    </p>
                    <p className="mt-0.5 text-ink">
                      {[
                        handyman.street_address,
                        handyman.city,
                        [handyman.state, handyman.zip].filter(Boolean).join(" "),
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                </div>
              )}
              {handyman.notes && <p className="text-ink">{handyman.notes}</p>}
            </CardBody>
          </Card>

          {currentUser?.role === "admin" && <HandymanDocuments handymanId={id} />}
        </div>
      </div>
    </>
  );
}

function RowsSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}
