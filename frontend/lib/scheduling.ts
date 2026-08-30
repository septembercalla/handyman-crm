import type { Task } from "./types";
import { timeWindow } from "./format";

type ScheduledTask = Pick<
  Task,
  "id" | "task_number" | "time_window_start" | "time_window_end" | "estimated_duration_min"
>;

export interface TimeRange {
  start: number;
  end: number;
}

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function getTimeRange(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
  estimatedDurationMin?: number | null,
): TimeRange | null {
  const start = timeToMinutes(startValue);
  if (start === null) return null;
  const explicitEnd = timeToMinutes(endValue);
  const end = explicitEnd ?? start + (estimatedDurationMin || 60);
  return end > start ? { start, end } : null;
}

export function taskTimeRange(task: ScheduledTask): TimeRange | null {
  return getTimeRange(
    task.time_window_start,
    task.time_window_end,
    task.estimated_duration_min,
  );
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function findTimeConflicts(
  tasks: ScheduledTask[],
  candidate: TimeRange | null,
  excludedTaskId?: string,
): ScheduledTask[] {
  if (!candidate) return [];
  return tasks.filter((task) => {
    if (task.id === excludedTaskId) return false;
    const occupied = taskTimeRange(task);
    return occupied ? rangesOverlap(candidate, occupied) : false;
  });
}

export function dayWorkloadLabel(tasks: ScheduledTask[]): string {
  if (tasks.length === 0) return "No jobs that day";
  const windows = tasks
    .filter((task) => task.time_window_start)
    .slice(0, 3)
    .map((task) => timeWindow(task.time_window_start, task.time_window_end));
  const count = `${tasks.length} ${tasks.length === 1 ? "job" : "jobs"}`;
  return windows.length ? `${count}: ${windows.join(", ")}` : `${count}, times not set`;
}
