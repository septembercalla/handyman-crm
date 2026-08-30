import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  href,
  accent,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: string;
  hint?: string;
}) {
  const body = (
    <div
      className={cn(
        "relative h-full rounded-[6px] border border-line bg-surface px-4 py-3 transition-colors",
        href && "hover:border-[#c3cad3] hover:bg-hover",
      )}
    >
      {accent && (
        <span
          className="absolute inset-y-2 left-0 w-[3px] rounded-r-[2px]"
          style={{ backgroundColor: accent }}
        />
      )}
      <p className="text-[12px] font-medium uppercase tracking-[0.03em] text-ink-muted">
        {label}
      </p>
      <p className="tnum mt-1 text-[26px] font-semibold leading-8 text-ink">
        {value}
      </p>
      {hint && <p className="text-[12px] text-ink-muted">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
