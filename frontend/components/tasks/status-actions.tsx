"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, STATUS_TRANSITIONS } from "@/lib/constants";
import { useSetTaskStatus } from "@/lib/api/hooks";
import type { TaskWithRelations } from "@/lib/types";

/** Buttons for the allowed transitions — SPEC §4 */
export function StatusActions({ task }: { task: TaskWithRelations }) {
  const setStatus = useSetTaskStatus();
  const next = STATUS_TRANSITIONS[task.status];

  if (next.length === 0) return null;

  return (
    <>
      {next.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={
            s === "cancelled" ? "dangerOutline" : s === "done" ? "default" : "outline"
          }
          disabled={setStatus.isPending}
          onClick={async () => {
            try {
              await setStatus.mutateAsync({ id: task.id, status: s });
              toast.success(`Status: ${STATUS_LABEL[s]}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Something went wrong");
            }
          }}
        >
          {s === "in_progress"
            ? "Start"
            : s === "done"
              ? "Complete"
              : s === "cancelled"
                ? "Cancel"
                : s === "new"
                  ? "Unassign"
                  : STATUS_LABEL[s]}
        </Button>
      ))}
    </>
  );
}
