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
        "inline-flex h-[18px] items-center whitespace-nowrap rounded-[3px] px-1.5 text-[11px] font-semibold uppercase leading-none tracking-[0.02em] text-white",
        className,
      )}
      style={{ backgroundColor: STATUS_COLOR[status] }}
    >
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
