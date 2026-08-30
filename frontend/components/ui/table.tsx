import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dense table: 44px row height, 13px type (SPEC §7).
 * A dispatcher must see 20+ rows without scrolling.
 */
export function Table({
  className,
  fixed,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { fixed?: boolean }) {
  return (
    <table
      className={cn(
        "w-full border-collapse text-[13px]",
        fixed && "table-fixed",
        className,
      )}
      {...props}
    />
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-line bg-surface", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 whitespace-nowrap px-3 text-left text-[12px] font-medium text-ink-muted first:pl-4 last:pr-4",
        className,
      )}
      {...props}
    />
  );
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-line last:border-b-0 hover:bg-hover",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "h-11 px-3 align-middle text-ink first:pl-4 last:pr-4",
        className,
      )}
      {...props}
    />
  );
}
