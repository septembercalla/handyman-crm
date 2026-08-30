import * as React from "react";
import { cn } from "@/lib/utils";

/** White card on the grey canvas — the base surface of the UI */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[6px] border border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  icon,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { icon?: React.ReactNode }) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 text-[15px] font-semibold leading-5 text-ink",
        className,
      )}
      {...props}
    >
      {icon && <span className="text-ink-muted [&_svg]:size-4">{icon}</span>}
      {children}
    </h2>
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
