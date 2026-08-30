"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { GripVertical } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { PriorityBadge } from "@/components/common/priority-badge";
import { EmptyState } from "@/components/common/empty-state";
import { CATEGORY_LABEL } from "@/lib/constants";
import { clockTime, fullAddress, timeWindow } from "@/lib/format";
import type { ScheduleRow, TaskWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY_START = 7; // 07:00
const DAY_END = 20; // 20:00
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

function toHours(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h + (m || 0) / 60;
}

export function ScheduleBoard({
  rows,
  unassigned,
  onAssign,
}: {
  rows: ScheduleRow[];
  unassigned: TaskWithRelations[];
  onAssign: (taskId: string, handymanId: string | null) => Promise<unknown>;
}) {
  const [dragging, setDragging] = useState<TaskWithRelations | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current?.task as TaskWithRelations) ?? null);
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const task = e.active.data.current?.task as TaskWithRelations | undefined;
    const target = e.over?.id as string | undefined;
    if (!task || !target) return;

    const handymanId = target === "unassigned" ? null : target.replace("row:", "");
    if (task.handyman_id === handymanId) return;

    try {
      await onAssign(task.id, handymanId);
      toast.success(
        handymanId
          ? `${task.task_number} → ${rows.find((r) => r.handyman.id === handymanId)?.handyman.full_name}`
          : `${task.task_number} unassigned`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign the task");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="overflow-hidden rounded-[6px] border border-line bg-surface">
          {/* hour ruler */}
          <div className="flex border-b border-line bg-surface">
            <div className="w-[168px] shrink-0 border-r border-line px-4 py-2 text-[12px] font-medium text-ink-muted">
              Handyman
            </div>
            <div className="relative flex-1">
              <div className="flex h-9 items-end">
                {HOURS.slice(0, -1).map((h) => (
                  <div
                    key={h}
                    className="tnum flex-1 border-l border-line pl-1 pb-1 text-[11px] text-ink-muted"
                  >
                    {clockTime(`${String(h).padStart(2, "0")}:00`).replace(":00", "")}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No active handymen" />
          ) : (
            rows.map((row) => (
              <HandymanRow key={row.handyman.id} row={row} />
            ))
          )}
        </div>

        <UnassignedPanel tasks={unassigned} />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="pointer-events-none w-[240px] rounded-[4px] border border-brand bg-surface px-2 py-1.5 text-[12px] shadow-[0_8px_24px_rgba(27,39,51,0.2)]">
            <p className="tnum font-medium text-brand">{dragging.task_number}</p>
            <p className="line-clamp-1 text-ink">{dragging.title}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function HandymanRow({ row }: { row: ScheduleRow }) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${row.handyman.id}` });
  const untimed = row.tasks.filter((t) => !t.time_window_start);
  const timed = row.tasks.filter((t) => t.time_window_start);

  return (
    <div className="flex border-b border-line last:border-b-0">
      <div className="flex w-[168px] shrink-0 items-center gap-2 border-r border-line px-4 py-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: row.handyman.color }}
        />
        <Link
          href={`/handymen/${row.handyman.id}`}
          className="truncate text-[13px] font-medium text-ink hover:text-brand hover:underline"
        >
          {row.handyman.full_name}
        </Link>
        <span className="tnum ml-auto text-[11px] text-ink-muted">
          {row.tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "relative min-h-[64px] flex-1 transition-colors",
          isOver && "bg-[#eaf2fd]",
        )}
      >
        {/* hour grid lines */}
        <div className="pointer-events-none absolute inset-0 flex">
          {HOURS.slice(0, -1).map((h) => (
            <div key={h} className="flex-1 border-l border-line/70" />
          ))}
        </div>

        {timed.map((t) => {
          const start = toHours(t.time_window_start) ?? DAY_START;
          const end =
            toHours(t.time_window_end) ??
            start + (t.estimated_duration_min ?? 60) / 60;
          const span = DAY_END - DAY_START;
          const left = ((start - DAY_START) / span) * 100;
          const width = (Math.max(end - start, 0.5) / span) * 100;
          return (
            <TaskBlock
              key={t.id}
              task={t}
              color={row.handyman.color}
              style={{
                left: `${Math.max(0, Math.min(left, 98))}%`,
                width: `${Math.min(width, 100 - left)}%`,
              }}
            />
          );
        })}

        {untimed.length > 0 && (
          <div className="relative flex flex-wrap gap-1 p-1.5">
            {untimed.map((t) => (
              <TaskChip key={t.id} task={t} color={row.handyman.color} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskBlock({
  task,
  color,
  style,
}: {
  task: TaskWithRelations;
  color: string;
  style: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: color }}
      className={cn(
        "absolute top-1.5 h-[52px] cursor-grab overflow-hidden rounded-[3px] border border-line border-l-[3px] bg-[#fbfcfd] px-1.5 py-1 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      title={`${task.task_number} · ${task.title} · ${fullAddress(task)}`}
      {...listeners}
      {...attributes}
    >
      <p className="tnum truncate text-[11px] font-medium text-ink">
        {timeWindow(task.time_window_start, task.time_window_end)}
      </p>
      <p className="truncate text-[11px] text-ink">{task.title}</p>
      <p className="truncate text-[10px] text-ink-muted">
        {task.customer?.full_name}
      </p>
    </div>
  );
}

function TaskChip({ task, color }: { task: TaskWithRelations; color: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ borderLeftColor: color }}
      className={cn(
        "cursor-grab rounded-[3px] border border-line border-l-[3px] bg-[#fbfcfd] px-1.5 py-1 text-[11px] active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      title="No time window"
      {...listeners}
      {...attributes}
    >
      <span className="tnum font-medium text-ink-muted">—</span>{" "}
      <span className="text-ink">{task.title}</span>
    </div>
  );
}

function UnassignedPanel({ tasks }: { tasks: TaskWithRelations[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned" });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex max-h-[calc(100vh-140px)] flex-col overflow-hidden rounded-[6px] border border-line bg-surface transition-colors",
        isOver && "border-brand bg-[#eaf2fd]",
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-[15px] font-semibold text-ink">Unassigned</h2>
        <span className="tnum text-[12px] text-ink-muted">{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="Everything is assigned"
          description="Drop a task here to take it off a handyman."
        />
      ) : (
        <div className="scroll-thin flex-1 space-y-1.5 overflow-y-auto p-2">
          {tasks.map((t) => (
            <UnassignedCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function UnassignedCard({ task }: { task: TaskWithRelations }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "cursor-grab rounded-[4px] border border-line bg-surface p-2 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="size-3.5 shrink-0 text-ink-muted" />
        <span className="tnum text-[12px] font-medium text-brand">
          {task.task_number}
        </span>
        <span className="ml-auto">
          <PriorityBadge priority={task.priority} />
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] font-medium text-ink">
        {task.title}
      </p>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-muted">
        {CATEGORY_LABEL[task.category]} · {fullAddress(task)}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <StatusBadge status={task.status} />
        <span className="tnum text-[11px] text-ink-muted">
          {timeWindow(task.time_window_start, task.time_window_end)}
        </span>
      </div>
    </div>
  );
}
