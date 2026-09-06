"use client";

import { StatusBadge } from "@/components/common/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTaskHistory } from "@/lib/api/hooks";
import { businessTime, useOperations } from "@/lib/api/operations";

export function StatusHistory({ taskId }: { taskId: string }) {
  const { data, isLoading } = useTaskHistory(taskId);
  const { data: ops } = useOperations();

  if (isLoading)
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    );

  if (!data || data.length === 0)
    return <p className="p-4 text-[13px] text-ink-muted">No history yet</p>;

  return (
    <ol className="divide-y divide-[var(--line)]">
      {data
        .slice()
        .reverse()
        .map((h) => (
          <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
            <StatusBadge status={h.to_status} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
              {h.from_status ? `from ${h.from_status} · ` : "created · "}
              {h.changed_by_name}
            </span>
            <span className="tnum shrink-0 text-[12px] text-ink-muted">
              {businessTime(h.changed_at, ops?.timezone)}
            </span>
          </li>
        ))}
    </ol>
  );
}
