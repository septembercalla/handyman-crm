"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { User } from "@/lib/types";
import { useResetUserPassword } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordDialog({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const resetPassword = useResetUserPassword();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function reset() {
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await resetPassword.mutateAsync({ id: user.id, password });
      toast.success("Temporary password set. Existing sessions were revoked.");
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset password");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="Reset password"
        description={`${user.full_name} will be required to create a new password at next login.`}
      >
        <form onSubmit={submit} className="space-y-3 p-4">
          <div className="space-y-1">
            <Label htmlFor={`reset-password-${user.id}`}>Temporary password</Label>
            <Input
              id={`reset-password-${user.id}`}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`confirm-reset-password-${user.id}`}>Confirm password</Label>
            <Input
              id={`confirm-reset-password-${user.id}`}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={resetPassword.isPending}>
              {resetPassword.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
