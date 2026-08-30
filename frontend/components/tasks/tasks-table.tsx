"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PriorityBadge } from "@/components/common/priority-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CATEGORY_LABEL } from "@/lib/constants";
import { fullAddress, shortDate, timeWindow } from "@/lib/format";
import type { Paginated, TaskWithRelations } from "@/lib/types";
import { useUrlParams } from "@/hooks/use-url-params";
import { cn } from "@/lib/utils";

const col = createColumnHelper<TaskWithRelations>();

/** column id → API ordering field (ordering=field / -field) */
const WIDTH: Record<string, string> = {
  task_number: "w-[86px]",
  customer: "w-[150px]",
  title: "w-[24%]",
  category: "w-[104px]",
  address: "w-[22%]",
  scheduled_date: "w-[132px]",
  handyman: "w-[152px]",
  status: "w-[118px]",
  priority: "w-[92px]",
};

const SORT_FIELD: Record<string, string> = {
  task_number: "task_number",
  customer: "customer",
  title: "title",
  category: "category",
  scheduled_date: "scheduled_date",
  handyman: "handyman",
  status: "status",
  priority: "priority",
};

export function TasksTable({
  data,
  isLoading,
  onCreate,
}: {
  data?: Paginated<TaskWithRelations>;
  isLoading: boolean;
  onCreate: () => void;
}) {
  const router = useRouter();
  const { get, set, setMany } = useUrlParams();

  const ordering = get("ordering", "-created_at");
  const page = Number(get("page", "1")) || 1;
  const pageSize = Number(get("page_size", "25")) || 25;

  const columns = useMemo(
    () => [
      col.accessor("task_number", {
        id: "task_number",
        header: "Task #",
        cell: (c) => (
          <span className="tnum font-medium text-brand">{c.getValue()}</span>
        ),
      }),
      col.accessor((r) => r.customer?.full_name ?? "—", {
        id: "customer",
        header: "Customer",
        cell: (c) => <span className="line-clamp-1">{c.getValue()}</span>,
      }),
      col.accessor("title", {
        id: "title",
        header: "Title",
        cell: (c) => (
          <span className="line-clamp-1 font-medium">{c.getValue()}</span>
        ),
      }),
      col.accessor("category", {
        id: "category",
        header: "Category",
        cell: (c) => (
          <span className="text-ink-muted">{CATEGORY_LABEL[c.getValue()]}</span>
        ),
      }),
      col.accessor((r) => fullAddress(r), {
        id: "address",
        header: "Address",
        enableSorting: false,
        cell: (c) => (
          <span className="line-clamp-1 text-ink-muted">{c.getValue()}</span>
        ),
      }),
      col.accessor("scheduled_date", {
        id: "scheduled_date",
        header: "Scheduled",
        cell: (c) => (
          <div className="tnum whitespace-nowrap">
            <div>{shortDate(c.getValue())}</div>
            <div className="text-[11px] text-ink-muted">
              {timeWindow(
                c.row.original.time_window_start,
                c.row.original.time_window_end,
              )}
            </div>
          </div>
        ),
      }),
      col.accessor((r) => r.handyman?.full_name ?? "", {
        id: "handyman",
        header: "Handyman",
        cell: (c) => {
          const h = c.row.original.handyman;
          return h ? (
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: h.color }}
              />
              <span className="truncate">{h.full_name}</span>
            </span>
          ) : (
            <span className="text-ink-muted">Unassigned</span>
          );
        },
      }),
      col.accessor("status", {
        id: "status",
        header: "Status",
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
      col.accessor("priority", {
        id: "priority",
        header: "Priority",
        cell: (c) => <PriorityBadge priority={c.getValue()} />,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function toggleSort(columnId: string) {
    const field = SORT_FIELD[columnId];
    if (!field) return;
    const next =
      ordering === field ? `-${field}` : ordering === `-${field}` ? "" : field;
    set("ordering", next || null);
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="No tasks yet"
        description="No task matches the current filters."
        action={<Button onClick={onCreate}>Create Task</Button>}
      />
    );
  }

  return (
    <>
      <div className="scroll-thin overflow-x-auto">
        <Table fixed className="min-w-[1180px]">
          <THead>
            {table.getHeaderGroups().map((hg) => (
              <TR key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const field = SORT_FIELD[h.column.id];
                  const sortable = Boolean(field) && h.column.columnDef.enableSorting !== false;
                  const dir =
                    ordering === field ? "asc" : ordering === `-${field}` ? "desc" : null;
                  return (
                    <TH key={h.id} className={WIDTH[h.column.id]}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(h.column.id)}
                          className={cn(
                            "group inline-flex items-center gap-1 hover:text-ink",
                            dir && "text-ink",
                          )}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : dir === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-0 group-hover:opacity-60" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TH>
                  );
                })}
              </TR>
            ))}
          </THead>
          <TBody>
            {table.getRowModel().rows.map((row) => (
              <TR
                key={row.id}
                onClick={() => router.push(`/tasks/${row.original.id}`)}
                className="cursor-pointer"
              >
                {row.getVisibleCells().map((cell) => (
                  <TD key={cell.id} className="max-w-0 overflow-hidden">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <p className="tnum text-[12px] text-ink-muted">
          {from}–{to} of {total}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setMany({ page_size: e.target.value, page: null })}
            className="h-8 rounded-[4px] border border-line bg-surface px-2 text-[12px] text-ink"
            aria-label="Rows per page"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => set("page", page - 1)}
          >
            Prev
          </Button>
          <span className="tnum text-[12px] text-ink-muted">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => set("page", page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
