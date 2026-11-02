import { STATUS_COLOR, STATUS_LABEL } from "@/lib/constants";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Solid fill, white text, 11px, uppercase, radius 3px (SPEC §7) */
export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[23px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-medium leading-none",
        {
          new: "border-line bg-subtle text-ink-muted",
          assigned: "border-[#dce7dd] bg-[#edf3e8] text-brand",
          in_progress: "border-[#eadbbf] bg-[#fbf1dd] text-[#966521]",
          done: "border-[#dce7dd] bg-[#edf3e8] text-brand",
          cancelled: "border-[#eadbd7] bg-[#fbefec] text-[#a8473d]",
        }[status],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Same status as plain text, no fill — for dense lists */
export function StatusText({ status }: { status: TaskStatus }) {
  return (
    <span
      className="text-[13px] font-medium"
      style={{ color: STATUS_COLOR[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: STATUS_COLOR[status] }}
    />
  );
}
