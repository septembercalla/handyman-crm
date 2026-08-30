"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarRange,
  ClipboardList,
  Home,
  KeyRound,
  LogOut,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/api/hooks";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChangePasswordDialog } from "@/components/users/change-password-dialog";
import { toast } from "sonner";

const NAV = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/schedule", label: "Schedule", icon: CalendarRange },
  { href: "/handymen", label: "Handymen", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-y-0 left-0 z-30 flex w-[72px] flex-col border-r border-[#0e1620] bg-sidebar"
    >
      <Link
        href="/"
        className="flex h-[52px] items-center justify-center border-b border-white/5"
        aria-label="Handyman CRM"
      >
        <span className="flex size-8 items-center justify-center rounded-[5px] bg-brand text-[13px] font-bold text-white">
          H
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-0.5 px-1.5 py-2">
        {[
          ...NAV,
          ...(user?.role === "admin"
            ? [{ href: "/users", label: "Users", icon: UserCog }]
            : []),
        ].map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[52px] flex-col items-center justify-center gap-1 rounded-[4px] transition-colors",
                active
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-ink hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.9} />
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="border-t border-white/5 px-1.5 py-2">
        <div className="flex flex-col items-center gap-1 rounded-[4px] px-1 py-2 text-sidebar-ink">
          <span
            className="flex size-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white"
            title={user?.full_name ?? "—"}
          >
            {initials(user?.full_name ?? "?")}
          </span>
          <span className="max-w-full truncate text-[10px] leading-none">
            {user?.full_name?.split(" ")[0] ?? "Guest"}
          </span>
        </div>
        <ChangePasswordDialog>
          <button
            type="button"
            className="mt-1 flex w-full flex-col items-center justify-center gap-1 rounded-[4px] py-2 text-sidebar-ink transition-colors hover:bg-white/5 hover:text-white"
          >
            <KeyRound className="size-[16px]" strokeWidth={1.9} />
            <span className="text-[10px] font-medium leading-none">Password</span>
          </button>
        </ChangePasswordDialog>
        <button
          type="button"
          onClick={async () => {
            try {
              await auth.logout();
              queryClient.clear();
              router.replace("/login");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not log out");
            }
          }}
          className="mt-1 flex w-full flex-col items-center justify-center gap-1 rounded-[4px] py-2 text-sidebar-ink transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-[16px]" strokeWidth={1.9} />
          <span className="text-[10px] font-medium leading-none">Log out</span>
        </button>
      </div>
    </nav>
  );
}
