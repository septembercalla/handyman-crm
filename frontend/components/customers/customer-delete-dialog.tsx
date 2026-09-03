"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Customer } from "@/lib/types";
import { ApiError } from "@/lib/api/client";
import { useDeleteCustomer } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export function CustomerDeleteDialog({
  customer,
  children,
}: {
  customer: Customer;
  children: ReactNode;
}) {
  const router = useRouter();
  const remove = useDeleteCustomer();
  const [open, setOpen] = useState(false);
  const [hasHistory, setHasHistory] = useState((customer.task_count ?? 0) > 0);

  async function removePermanently() {
    try {
      await remove.mutateAsync(customer.id);
      toast.success("Customer deleted");
      setOpen(false);
      router.push("/customers");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setHasHistory(true);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not delete customer");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setHasHistory((customer.task_count ?? 0) > 0);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={hasHistory ? "Task history must be preserved" : "Delete customer?"}
        description={
          hasHistory
            ? `${customer.full_name} cannot be deleted because tasks reference this customer.`
            : `Permanently delete ${customer.full_name}.`
        }
      >
        <div className="space-y-4 p-4">
          <p className="text-[13px] leading-5 text-ink-muted">
            {hasHistory
              ? "The customer and task history remain available in the CRM. You can still edit the customer details."
              : "This action cannot be undone. The server will block deletion if task history exists."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={remove.isPending}>
              {hasHistory ? "Close" : "Cancel"}
            </Button>
            {!hasHistory && (
              <Button variant="danger" onClick={removePermanently} disabled={remove.isPending}>
                {remove.isPending ? "Deleting…" : "Delete permanently"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
