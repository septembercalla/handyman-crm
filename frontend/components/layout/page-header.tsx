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
        "flex min-h-[100px] shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line bg-app px-8 py-6 max-sm:px-4",
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

      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <h1 className="text-[27px] font-semibold leading-8 tracking-[-0.8px] text-ink">
          {title}
        </h1>
        {meta && (
          <div className="flex flex-wrap items-center gap-2 text-[12px] leading-5 text-ink-muted">
            {meta}
          </div>
        )}
      </div>

      {actions && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
