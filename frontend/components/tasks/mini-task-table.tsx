"use client";

import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PriorityBadge } from "@/components/common/priority-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CATEGORY_LABEL } from "@/lib/constants";
import { fullAddress, shortDate, timeWindow } from "@/lib/format";
import type { TaskWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

type Column =
  | "number"
  | "title"
  | "title_address"
  | "customer"
  | "handyman"
  | "address"
  | "category"
  | "date"
  | "window"
  | "priority"
  | "status";

const WIDTH: Partial<Record<Column, string>> = {
  number: "w-[84px]",
  window: "w-[152px]",
  date: "w-[80px]",
  category: "w-[100px]",
  status: "w-[118px]",
  priority: "w-[88px]",
  handyman: "w-[144px]",
  customer: "w-[144px]",
  address: "w-[30%]",
  title: "w-[26%]",
};

const HEAD: Record<Column, string> = {
  number: "Task #",
  title: "Title",
  title_address: "Task",
  customer: "Customer",
  handyman: "Handyman",
  address: "Address",
  category: "Category",
  date: "Scheduled",
  window: "Time",
  priority: "Priority",
  status: "Status",
};

export function MiniTaskTable({
  tasks,
  columns,
  emptyTitle = "No tasks",
  emptyDescription,
}: {
  tasks: TaskWithRelations[];
  columns: Column[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (tasks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-x-auto">
      <Table fixed>
        <THead>
          <TR className="hover:bg-transparent">
            {columns.map((c) => (
              <TH key={c} className={WIDTH[c]}>
                {HEAD[c]}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {tasks.map((t) => (
            <TR key={t.id} className="cursor-pointer">
              {columns.map((c) => (
                <TD
                  key={c}
                  className={cn("max-w-0 overflow-hidden", c === "number" && "tnum")}
                >
                  <Link href={`/tasks/${t.id}`} className="block min-w-0">
                    <Cell task={t} column={c} />
                  </Link>
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function Cell({ task, column }: { task: TaskWithRelations; column: Column }) {
  switch (column) {
    case "number":
      return <span className="font-medium text-brand">{task.task_number}</span>;
    case "title":
      return (
        <span className="line-clamp-1 font-medium text-ink">{task.title}</span>
      );
    case "title_address":
      return (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{task.title}</div>
          <div className="truncate text-[11px] leading-4 text-ink-muted">
            {fullAddress(task)}
          </div>
        </div>
      );
    case "customer":
      return (
        <span className="line-clamp-1">{task.customer?.full_name ?? "—"}</span>
      );
    case "handyman":
      return task.handyman ? (
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: task.handyman.color }}
          />
          <span className="truncate">{task.handyman.full_name}</span>
        </span>
      ) : (
        <span className="text-ink-muted">Unassigned</span>
      );
    case "address":
      return (
        <span className="line-clamp-1 text-ink-muted">{fullAddress(task)}</span>
      );
    case "category":
      return <span className="text-ink-muted">{CATEGORY_LABEL[task.category]}</span>;
    case "date":
      return <span className="tnum">{shortDate(task.scheduled_date)}</span>;
    case "window":
      return (
        <span className="tnum whitespace-nowrap text-ink-muted">
          {timeWindow(task.time_window_start, task.time_window_end)}
        </span>
      );
    case "priority":
      return <PriorityBadge priority={task.priority} />;
    case "status":
      return <StatusBadge status={task.status} />;
  }
}
