"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, selectClass } from "@/components/leads/lead-controls";
import { businessTime, label, useOperations, useReviewAction } from "@/lib/api/operations";
import type { TaskWithRelations } from "@/lib/types";

export function ReviewTracking({ task }: { task: TaskWithRelations }) {
  const [rating, setRating] = useState("");
  const [platform, setPlatform] = useState("");
  const mutation = useReviewAction();
  const { data: ops } = useOperations();
  if (task.status !== "done") return null;
  async function save(status: string) {
    if (status === "received" && (!rating || !platform)) { toast.error("Select rating and platform"); return; }
    try {
      await mutation.mutateAsync({ id: task.id, status, ...(status === "received" ? { rating: Number(rating), platform } : {}) });
      toast.success("Review tracking updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save review"); }
  }
  return <Card><CardHeader><CardTitle>Review follow-up</CardTitle></CardHeader><CardBody className="space-y-3 text-sm">
    <p>Status: <strong>{label(task.review_status)}</strong></p>
    <p className="text-xs text-ink-muted">Send the request manually, then record it here. No message is sent by these buttons.</p>
    <p className="text-xs">Requested: {businessTime(task.review_requested_at, ops?.timezone)}</p>
    <p className="text-xs">Received: {businessTime(task.review_received_at, ops?.timezone)}</p>
    {task.review_status === "received" ? <p>{task.review_rating} stars · {label(task.review_platform ?? "other")}</p> : <>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={mutation.isPending || task.review_status === "requested"} onClick={() => save("requested")}>Review requested</Button>
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => save("no_review")}>No review</Button>
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => save("skipped")}>Skip</Button></div>
      <div className="grid grid-cols-2 gap-2"><FormField title="Actual rating"><select className={selectClass} value={rating} onChange={(e) => setRating(e.target.value)}><option value="">Select stars</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></FormField>
        <FormField title="Platform"><select className={selectClass} value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">Select platform</option>{["google", "thumbtack", "facebook", "other"].map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></FormField></div>
      <Button size="sm" variant="outline" disabled={mutation.isPending || !rating || !platform} onClick={() => save("received")}>Review received</Button>
    </>}
    <p className="text-xs text-ink-muted">Times: {ops?.timezone ?? "Loading…"}</p>
  </CardBody></Card>;
}
