"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { auth } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("dispatcher@handyman.crm");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await auth.login(email, password);
      // seed the session cache so the dashboard renders without a second round trip
      queryClient.setQueryData(qk.currentUser(), user);
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[5px] bg-brand text-[15px] font-bold text-white">
            H
          </span>
          <div>
            <p className="text-[15px] font-semibold leading-5 text-ink">
              Handyman CRM
            </p>
            <p className="text-[12px] leading-4 text-ink-muted">
              Dispatcher console
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[6px] border border-line bg-surface p-4"
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" className="mt-4 w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          <p className="mt-3 text-[12px] leading-4 text-ink-muted">
            Seeded demo account: dispatcher@handyman.crm / demo. The backend
            must be running on NEXT_PUBLIC_API_URL.
          </p>
        </form>
      </div>
    </main>
  );
}
