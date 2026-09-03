"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Handyman } from "@/lib/types";
import { ApiError } from "@/lib/api/client";
import { useDeleteHandyman, useUpdateHandyman } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export function HandymanDeleteDialog({
  handyman,
  children,
}: {
  handyman: Handyman;
  children: ReactNode;
}) {
  const router = useRouter();
  const remove = useDeleteHandyman();
  const update = useUpdateHandyman();
  const [open, setOpen] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const busy = remove.isPending || update.isPending;

  async function removePermanently() {
    try {
      await remove.mutateAsync(handyman.id);
      toast.success("Handyman deleted");
      setOpen(false);
      router.push("/handymen");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setHasHistory(true);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not delete handyman");
    }
  }

  async function makeInactive() {
    try {
      await update.mutateAsync({
        id: handyman.id,
        payload: { status: "inactive" },
      });
      toast.success("Handyman set to inactive");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update handyman");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setHasHistory(false);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={hasHistory ? "Task history must be preserved" : "Delete handyman?"}
        description={
          hasHistory
            ? `${handyman.full_name} cannot be permanently deleted because tasks reference this profile.`
            : `Permanently delete ${handyman.full_name} if the profile has no task history.`
        }
      >
        <div className="space-y-4 p-4">
          <p className="text-[13px] leading-5 text-ink-muted">
            {hasHistory
              ? "Set the profile to inactive instead. Historical tasks will keep the handyman name, while new assignments will no longer offer this worker."
              : "This action cannot be undone. If task history exists, the server will block deletion and offer the safe inactive option."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            {hasHistory ? (
              <Button onClick={makeInactive} disabled={busy}>
                {busy ? "Updating…" : "Make inactive"}
              </Button>
            ) : (
              <Button variant="danger" onClick={removePermanently} disabled={busy}>
                {busy ? "Deleting…" : "Delete permanently"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
