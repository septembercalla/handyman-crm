"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { FirstLoginPassword } from "@/components/users/first-login-password";
import { useCurrentUser } from "@/lib/api/hooks";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: user, isPending } = useCurrentUser();

  useEffect(() => {
    if (!isPending && !user) router.replace("/login");
  }, [isPending, user, router]);

  // blank canvas while the session check is in flight — no layout shift
  if (isPending || !user) return <div className="min-h-screen bg-app" />;
  if (user.must_change_password) return <FirstLoginPassword user={user} />;

  return (
    <div className="min-h-screen bg-app">
      <Sidebar />
      <div className="workspace-main flex min-h-screen min-w-0 flex-col">
        {children}
      </div>
    </div>
  );
}
