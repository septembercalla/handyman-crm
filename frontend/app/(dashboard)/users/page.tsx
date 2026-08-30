"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { UserDialog } from "@/components/users/user-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useCurrentUser, useDeleteUser, useUsers } from "@/lib/api/hooks";

export default function UsersPage() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const { data: users, isLoading } = useUsers(isAdmin);
  const deleteUser = useDeleteUser();

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
        <Card className="overflow-hidden">
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
                  <TH>Created</TH>
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
                      </TD>
                      <TD className="tnum text-ink-muted">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <UserDialog user={user}>
                              <Button variant="ghost" size="iconSm" aria-label={`Edit ${user.full_name}`}>
                                <Pencil />
                              </Button>
                            </UserDialog>
                          )}
                          {user.role === "dispatcher" && (
                            <Button
                              variant="ghost"
                              size="iconSm"
                              aria-label={`Delete ${user.full_name}`}
                              disabled={deleteUser.isPending}
                              onClick={() => remove(user.id, user.full_name)}
                              className="text-danger hover:text-danger"
                            >
                              <Trash2 />
                            </Button>
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
