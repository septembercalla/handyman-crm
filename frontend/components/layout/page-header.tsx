"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Light header strip above the content (SPEC §6.1):
 * back arrow, page title, action buttons on the right.
 */
export function PageHeader({
  title,
  meta,
  back,
  actions,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  back?: boolean | string;
  actions?: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4",
        className,
      )}
    >
      {back && (
        <button
          type="button"
          aria-label="Back"
          onClick={() =>
            typeof back === "string" ? router.push(back) : router.back()
          }
          className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-[4px] text-ink-muted hover:bg-subtle hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </button>
      )}

      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-[17px] font-semibold leading-6 text-ink">
          {title}
        </h1>
        {meta && (
          <div className="flex shrink-0 items-center gap-2 text-[13px] text-ink-muted">
            {meta}
          </div>
        )}
      </div>

      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
