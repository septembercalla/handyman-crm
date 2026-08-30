import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] leading-4 text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11px] leading-4 text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Label / value pair for read-only cards */
export function Detail({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-ink-muted">
        {label}
      </p>
      <div className="mt-0.5 text-[13px] text-ink">{children}</div>
    </div>
  );
}
