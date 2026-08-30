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
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const busy = createUser.isPending || updateUser.isPending;

  function reset() {
    setFullName(user?.full_name ?? "");
    setEmail(user?.email ?? "");
    setPassword("");
    setIsActive(user?.is_active ?? true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (user) {
        await updateUser.mutateAsync({
          id: user.id,
          payload: {
            full_name: fullName,
            email,
            ...(user.role === "dispatcher" ? { is_active: isActive } : {}),
            ...(password ? { password } : {}),
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
          {user?.role !== "admin" && (
            <div className="space-y-1">
              <Label htmlFor={`password-${user?.id ?? "new"}`}>
                {user ? "New password (optional)" : "Temporary password"}
              </Label>
              <Input
                id={`password-${user?.id ?? "new"}`}
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required={!user}
              />
            </div>
          )}
          {user?.role === "dispatcher" && (
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="size-4 accent-brand"
              />
              Account enabled
            </label>
          )}
          {user?.role === "admin" && (
            <p className="text-[12px] leading-4 text-ink-muted">
              Use the Password action in the sidebar to change your own password.
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
