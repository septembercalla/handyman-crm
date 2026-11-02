"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  ContactRound,
  House,
  Landmark,
  Users,
  UserCog,
  Wrench,
  NotebookTabs,
} from "lucide-react";
import { useCurrentUser } from "@/lib/api/hooks";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AccountMenu } from "@/components/users/account-menu";

const work = [
  { href: "/", label: "Overview", icon: House },
  { href: "/leads", label: "Leads", icon: ContactRound },
  { href: "/tasks", label: "Jobs", icon: ClipboardList },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
];
const people = [
  { href: "/handymen", label: "Team", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const groups = [
    { label: "WORKSPACE", items: work },
    { label: "PEOPLE", items: people },
    ...(user?.role === "admin"
      ? [
          {
            label: "MANAGE",
            items: [
              { href: "/trips", label: "Weekly trips", icon: NotebookTabs },
              { href: "/payroll", label: "Payroll", icon: Landmark },
              { href: "/users", label: "Office access", icon: UserCog },
            ],
          },
        ]
      : []),
  ];
  return (
    <nav
      aria-label="Main navigation"
      className="workspace-nav fixed inset-y-0 left-0 z-30 flex flex-col border-r border-line bg-surface"
    >
      <Link
        href="/"
        aria-label="NOVAfix home"
        className="flex h-[80px] shrink-0 items-center gap-2.5 px-6 max-lg:justify-center max-lg:px-0"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
          <Wrench className="size-[18px]" strokeWidth={1.8} />
        </span>
        <span className="nav-label text-[23px] font-semibold tracking-[-1px] text-ink">
          NOVA<span className="font-normal text-brand">fix</span>
          <sup className="ml-1 text-[9px]">®</sup>
        </span>
      </Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="nav-label mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-ink-muted">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors max-lg:justify-center max-lg:px-0",
                      active
                        ? "bg-[#edf3e8] text-brand"
                        : "text-ink-muted hover:bg-hover hover:text-ink",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" strokeWidth={1.7} />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {user && (
        <div className="border-t border-line p-3">
          <AccountMenu user={user}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-hover max-lg:justify-center"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#edf3e8] text-xs font-semibold text-brand">
                {initials(user.full_name)}
              </span>
              <span className="nav-label min-w-0">
                <span className="block truncate text-[12px] font-semibold">
                  {user.full_name}
                </span>
                <span className="block text-[11px] capitalize text-ink-muted">
                  {user.role}
                </span>
              </span>
            </button>
          </AccountMenu>
        </div>
      )}
    </nav>
  );
}
