"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Columns2, Map, Rows3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DispatchMap } from "@/components/tasks/dispatch-map";
import { ScheduleBoard } from "@/components/tasks/schedule-board";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { tasksApi } from "@/lib/api/client";
import { useSchedule, useScheduleTravel, useUnassigned } from "@/lib/api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, longDate, todayISO } from "@/lib/format";

export default function SchedulePage() {
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<"timeline" | "map" | "split">("split");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data: rows, isLoading } = useSchedule(date);
  const { data: unassigned = [] } = useUnassigned(date);
  const {
    data: travel,
    isLoading: travelLoading,
    isError: travelError,
  } = useScheduleTravel(date);
  const mapUnassigned = unassigned.filter((task) => task.scheduled_date === date);

  async function assign(taskId: string, handymanId: string | null) {
    await tasksApi.assign(taskId, handymanId);
    // a task with no date dropped onto a day gets scheduled for that day
    if (handymanId) {
      const task = unassigned.find((t) => t.id === taskId);
      if (task && !task.scheduled_date) {
        await tasksApi.update(taskId, { scheduled_date: date });
      }
    }
    ["schedule", "unassigned", "tasks", "task", "handyman", "dashboard"].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] }),
    );
  }

  return (
    <>
      <PageHeader
        title="Schedule"
        meta={<span className="tnum">{longDate(date)}</span>}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <div
              className="mr-1 flex items-center rounded-[5px] border border-line bg-surface p-0.5"
              aria-label="Schedule view"
            >
              <ViewButton
                active={mode === "timeline"}
                label="Timeline"
                icon={<Rows3 />}
                onClick={() => setMode("timeline")}
              />
              <ViewButton
                active={mode === "map"}
                label="Map"
                icon={<Map />}
                onClick={() => setMode("map")}
              />
              <ViewButton
                active={mode === "split"}
                label="Split"
                icon={<Columns2 />}
                onClick={() => setMode("split")}
              />
            </div>
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
            <DatePicker
              value={date}
              onChange={(next) => setDate(next || todayISO())}
              className="h-8 w-[170px]"
            />
          </div>
        }
      />

      <div className="flex-1 p-4">
        {isLoading || !rows ? (
          <Skeleton className="h-96" />
        ) : mode === "timeline" ? (
          <ScheduleBoard
            rows={rows}
            unassigned={unassigned}
            onAssign={assign}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        ) : mode === "map" ? (
          <DispatchMap
            rows={rows}
            unassigned={mapUnassigned}
            travel={travel}
            travelLoading={travelLoading}
            travelError={travelError}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        ) : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
            <ScheduleBoard
              rows={rows}
              unassigned={unassigned}
              onAssign={assign}
              layout="bottom"
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
            <DispatchMap
              rows={rows}
              unassigned={mapUnassigned}
              travel={travel}
              travelLoading={travelLoading}
              travelError={travelError}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          </div>
        )}
      </div>
    </>
  );
}

function ViewButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="sm"
      className="h-7 gap-1.5 px-2.5"
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
