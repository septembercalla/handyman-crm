import { PRIORITY_COLOR, PRIORITY_LABEL } from "@/lib/constants";
import type { TaskPriority } from "@/lib/types";

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const muted = priority === "low" || priority === "normal";
  return (
    <span
      className="inline-flex h-[18px] items-center whitespace-nowrap rounded-[3px] border px-1.5 text-[11px] font-semibold uppercase leading-none tracking-[0.02em]"
      style={{
        color: PRIORITY_COLOR[priority],
        borderColor: muted ? "var(--line)" : PRIORITY_COLOR[priority],
        backgroundColor: muted ? "transparent" : `${PRIORITY_COLOR[priority]}14`,
      }}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
