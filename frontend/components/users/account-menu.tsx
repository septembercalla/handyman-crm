"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@/lib/types";
import { auth } from "@/lib/api/client";
import { ChangePasswordDialog } from "@/components/users/change-password-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AccountMenu({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function logOut() {
    try {
      await auth.logout();
      queryClient.clear();
      router.replace("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log out");
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={8} className="w-72">
        <div className="border-b border-line p-3">
          <p className="truncate text-[14px] font-semibold text-ink">{user.full_name}</p>
          <p className="mt-0.5 truncate text-[12px] text-ink-muted">{user.email}</p>
          <span className="mt-2 inline-flex rounded-[3px] bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-muted">
            {user.role}
          </span>
        </div>
        <div className="p-1.5">
          <ChangePasswordDialog>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-[13px] text-ink hover:bg-subtle"
            >
              <KeyRound className="size-4 text-ink-muted" /> Change password
            </button>
          </ChangePasswordDialog>
          <button
            type="button"
            onClick={logOut}
            className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-[13px] text-ink hover:bg-subtle"
          >
            <LogOut className="size-4 text-ink-muted" /> Log out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
