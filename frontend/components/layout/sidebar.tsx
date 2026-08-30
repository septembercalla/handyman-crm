"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  ClipboardList,
  Home,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { useCurrentUser } from "@/lib/api/hooks";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AccountMenu } from "@/components/users/account-menu";
import appIcon from "@/app/icon.png";

const NAV = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/schedule", label: "Schedule", icon: CalendarRange },
  { href: "/handymen", label: "Handymen", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
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
        <span className="flex size-8 items-center justify-center rounded-[5px] bg-white p-0.5">
          <Image src={appIcon} alt="" className="size-7 object-contain" priority />
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
        {user && (
          <AccountMenu user={user}>
            <button
              type="button"
              className="flex w-full flex-col items-center gap-1 rounded-[4px] px-1 py-2 text-sidebar-ink transition-colors hover:bg-white/5 hover:text-white"
            >
              <span
                className="flex size-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white"
                title={user.full_name}
              >
                {initials(user.full_name)}
              </span>
              <span className="max-w-full truncate text-[10px] leading-none">
                {user.full_name.split(" ")[0]}
              </span>
            </button>
          </AccountMenu>
        )}
      </div>
    </nav>
  );
}
