"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ScheduleBoard } from "@/components/tasks/schedule-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { tasksApi } from "@/lib/api/client";
import { useSchedule, useUnassigned } from "@/lib/api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, longDate, todayISO } from "@/lib/format";

export default function SchedulePage() {
  const [date, setDate] = useState(todayISO());
  const qc = useQueryClient();
  const { data: rows, isLoading } = useSchedule(date);
  const { data: unassigned = [] } = useUnassigned();

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
          <div className="flex items-center gap-1.5">
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

      <div className="flex-1 p-4">
        {isLoading || !rows ? (
          <Skeleton className="h-96" />
        ) : (
          <ScheduleBoard rows={rows} unassigned={unassigned} onAssign={assign} />
        )}
      </div>
    </>
  );
}
