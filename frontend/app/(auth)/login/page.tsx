"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import appIcon from "@/app/icon.png";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await auth.login(email, password, remember);
      // seed the session cache so the dashboard renders without a second round trip
      queryClient.setQueryData(qk.currentUser(), user);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[5px] bg-white p-0.5">
            <Image src={appIcon} alt="" className="size-8 object-contain" priority />
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
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
            <label className="flex items-center gap-2 text-[12px] text-ink-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="size-4 accent-brand"
              />
              Remember session
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-[4px] border border-[#f0c5c5] bg-[#fdf2f2] px-2.5 py-2 text-[12px] text-danger"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="mt-4 w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
