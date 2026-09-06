"use client";

import Link from "next/link";
import { useOperations } from "@/lib/api/operations";

export function OperationalMetrics() {
  const { data, error, refetch } = useOperations();
  if (error) return <p role="alert" className="text-sm">Operational metrics unavailable. <button onClick={() => refetch()} className="text-brand underline">Retry</button></p>;
  if (!data) return <p className="text-xs text-ink-muted">Loading operational metrics…</p>;
  const metrics = [
    ["New leads", data.new_leads, "/leads?attention=new"],
    ["Needs follow-up", data.needs_follow_up, "/leads?attention=needs_follow_up"],
    ["No answer", data.no_answer, "/leads?attention=no_answer"],
    ["Booked this week", data.booked_this_week, "/leads?booked_this_week=1"],
    ["Completed this week", data.completed_this_week, "/tasks?completed_this_week=1"],
    ["Reviews pending", data.reviews_pending, "/tasks?review_pending=1"],
    ["5-star this week", data.five_star_this_week, "/tasks?five_star_this_week=1"],
  ] as const;
  return <section aria-label="Operational overview" className="space-y-2">
    <p className="text-xs text-ink-muted">Operations · Monday–Sunday · {data.timezone}</p>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">{metrics.map(([text, count, href]) =>
      <Link key={text} href={href} className="rounded-[5px] border border-line bg-surface px-3 py-2 hover:border-brand"><p className="text-[11px] text-ink-muted">{text}</p><p className="text-xl font-semibold tnum">{count}</p></Link>)}</div>
  </section>;
}

