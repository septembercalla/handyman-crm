"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { User } from "@/lib/types";
import { useCreateUser, useUpdateUser } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UserDialog({
  user,
  children,
}: {
  user?: User;
  children: React.ReactNode;
}) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const busy = createUser.isPending || updateUser.isPending;

  function reset() {
    setFullName(user?.full_name ?? "");
    setEmail(user?.email ?? "");
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      if (user) {
        await updateUser.mutateAsync({
          id: user.id,
          payload: {
            full_name: fullName,
            email,
          },
        });
        toast.success("User updated");
      } else {
        await createUser.mutateAsync({ full_name: fullName, email, password });
        toast.success("Dispatcher created");
      }
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save user");
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
        title={user ? "Edit user" : "Add dispatcher"}
        description={
          user?.role === "admin"
            ? "Update the primary administrator profile."
            : "Dispatcher access includes all operational CRM areas."
        }
      >
        <form onSubmit={submit} className="space-y-3 p-4">
          <div className="space-y-1">
            <Label htmlFor={`name-${user?.id ?? "new"}`}>Full name</Label>
            <Input
              id={`name-${user?.id ?? "new"}`}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              maxLength={255}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`email-${user?.id ?? "new"}`}>Email</Label>
            <Input
              id={`email-${user?.id ?? "new"}`}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {!user && (
            <>
              <div className="space-y-1">
                <Label htmlFor="temporary-password">Temporary password</Label>
                <Input
                  id="temporary-password"
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
                <Label htmlFor="confirm-temporary-password">Confirm password</Label>
                <Input
                  id="confirm-temporary-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-user-role">Role</Label>
                <Input id="new-user-role" value="Dispatcher" disabled />
              </div>
            </>
          )}
          {user?.role === "admin" && (
            <p className="text-[12px] leading-4 text-ink-muted">
              Use Change password in the Account menu to update your own password.
            </p>
          )}
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : user ? "Save changes" : "Create dispatcher"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
