"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { UserDialog } from "@/components/users/user-dialog";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  useCurrentUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from "@/lib/api/hooks";

export default function UsersPage() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const { data: users, isLoading } = useUsers(isAdmin);
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateUser();

  useEffect(() => {
    if (currentUser && !isAdmin) router.replace("/");
  }, [currentUser, isAdmin, router]);

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete dispatcher ${name}? This cannot be undone.`)) return;
    try {
      await deleteUser.mutateAsync(id);
      toast.success("Dispatcher deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete dispatcher");
    }
  }

  async function setActive(id: string, name: string, isActive: boolean) {
    if (!isActive && !window.confirm(`Disable ${name}? Their sessions will stop working.`)) {
      return;
    }
    try {
      await updateUser.mutateAsync({ id, payload: { is_active: isActive } });
      toast.success(isActive ? "Dispatcher enabled" : "Dispatcher disabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update dispatcher");
    }
  }

  if (!isAdmin) return <div className="min-h-screen bg-app" />;

  const dispatchers = users?.filter((user) => user.role === "dispatcher") ?? [];

  return (
    <>
      <PageHeader
        title="Users"
        meta={users ? <span>{dispatchers.length} dispatchers</span> : undefined}
        actions={
          <UserDialog>
            <Button size="sm">
              <Plus /> Add dispatcher
            </Button>
          </UserDialog>
        }
      />

      <div className="flex-1 p-4">
        <Card className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-9" />
              ))}
            </div>
          ) : !users || users.length === 0 ? (
            <EmptyState title="No users yet" />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Last login</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((user) => {
                  const canEdit = user.role === "dispatcher" || user.id === currentUser.id;
                  return (
                    <TR key={user.id}>
                      <TD className="font-medium">{user.full_name}</TD>
                      <TD className="text-ink-muted">{user.email}</TD>
                      <TD className="capitalize">{user.role}</TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={
                              "inline-flex h-[20px] items-center rounded-[3px] px-1.5 text-[11px] font-semibold uppercase " +
                              (user.is_active
                                ? "bg-[#e8f5ed] text-[#176b3a]"
                                : "bg-subtle text-ink-muted")
                            }
                          >
                            {user.is_active ? "Active" : "Disabled"}
                          </span>
                          {user.must_change_password && (
                            <span className="text-[11px] text-[#9a6100]">Password setup</span>
                          )}
                        </div>
                      </TD>
                      <TD className="tnum text-ink-muted">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleString()
                          : "Never"}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <UserDialog user={user}>
                              <Button variant="outline" size="sm">
                                <Pencil /> Edit
                              </Button>
                            </UserDialog>
                          )}
                          {user.role === "dispatcher" && (
                            <>
                              <ResetPasswordDialog user={user}>
                                <Button variant="outline" size="sm">
                                  <KeyRound /> Reset
                                </Button>
                              </ResetPasswordDialog>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={updateUser.isPending}
                                onClick={() =>
                                  setActive(user.id, user.full_name, !user.is_active)
                                }
                              >
                                {user.is_active ? <PowerOff /> : <Power />}
                                {user.is_active ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                variant="dangerOutline"
                                size="sm"
                                disabled={deleteUser.isPending}
                                onClick={() => remove(user.id, user.full_name)}
                              >
                                <Trash2 /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
