"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { auth } from "@/lib/api/client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth.me()) router.replace("/login");
    else setReady(true);
  }, [router]);

  if (!ready) return <div className="min-h-screen bg-app" />;

  return (
    <div className="min-h-screen bg-app">
      <Sidebar />
      <div className="ml-[72px] flex min-h-screen flex-col">{children}</div>
    </div>
  );
}
