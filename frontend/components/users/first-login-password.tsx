"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@/lib/types";
import { auth } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FirstLoginPassword({ user }: { user: User }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const updatedUser = await auth.completeFirstLogin(password);
      queryClient.setQueryData(qk.currentUser(), updatedUser);
      toast.success("Your password is ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set password");
    } finally {
      setBusy(false);
    }
  }

  async function logOut() {
    await auth.logout().catch(() => undefined);
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-[380px] rounded-[6px] border border-line bg-surface p-4">
        <h1 className="text-[17px] font-semibold text-ink">Create your new password</h1>
        <p className="mt-1 text-[12px] leading-4 text-ink-muted">
          Welcome, {user.full_name}. Replace the temporary password before using the CRM.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="first-login-password">New password</Label>
            <div className="relative">
              <Input
                id="first-login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1 flex size-7 items-center justify-center text-ink-muted hover:text-ink"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="first-login-confirm-password">Confirm new password</Label>
            <Input
              id="first-login-confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Create password"}
          </Button>
          <button
            type="button"
            onClick={logOut}
            className="w-full text-center text-[12px] text-ink-muted hover:text-ink"
          >
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
