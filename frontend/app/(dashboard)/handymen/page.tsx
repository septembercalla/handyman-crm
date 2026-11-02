"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Plus, Search, NotebookTabs } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { HandymanDialog } from "@/components/handymen/handyman-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser, useHandymen } from "@/lib/api/hooks";
import { CATEGORY_LABEL } from "@/lib/constants";
import { formatPercent, initials } from "@/lib/format";

export default function HandymenPage() {
  const query = useHandymen();
  const { data: user } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const workers = useMemo(
    () =>
      (query.data ?? []).filter(
        (w) =>
          (status === "all" || w.status === status) &&
          `${w.full_name} ${w.phone} ${w.email}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [query.data, status, search],
  );
  const admin = user?.role === "admin";
  return (
    <>
      <PageHeader
        title="Your team"
        meta="The people behind every job."
        actions={
          <HandymanDialog>
            <Button>
              <Plus /> Add team member
            </Button>
          </HandymanDialog>
        }
      />
      <div className="workspace-content space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[27px] font-semibold tracking-tight">
                {query.data?.length ?? "—"}
              </span>
              <span className="ml-2 text-xs text-ink-muted">team members</span>
            </div>
            <span className="h-6 w-px bg-line" />
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="size-1.5 rounded-full bg-brand" />
              {query.data?.filter((w) => w.status === "active").length ??
                "—"}{" "}
              active
            </div>
          </div>
          {admin && (
            <Button asChild variant="outline">
              <Link href="/trips">
                <NotebookTabs /> Weekly trips
              </Link>
            </Button>
          )}
        </div>
        {query.isError ? (
          <Card role="alert" className="p-6">
            <h2 className="font-semibold">Could not load the team</h2>
            <p className="mt-2 text-sm text-ink-muted">{query.error.message}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
              <div className="flex gap-1 rounded-lg bg-app p-1">
                {["all", "active", "inactive"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${status === value ? "bg-white text-ink shadow-[0_1px_3px_#172c2710]" : "text-ink-muted"}`}
                  >
                    {value === "all" ? "All members" : value}
                  </button>
                ))}
              </div>
              <label className="relative w-full sm:w-[280px]">
                <span className="sr-only">Search team members</span>
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, phone…"
                  className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-xs"
                />
              </label>
            </div>
            {query.isPending ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : workers.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <h2 className="text-base font-semibold">
                  {query.data?.length
                    ? "No matching team members"
                    : "Build your team"}
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {query.data?.length
                    ? "Try another name or change the filter."
                    : "Add your first worker to assign jobs and see their weekly trip."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="team-table w-full min-w-[760px] text-left text-[13px]">
                  <thead>
                    <tr>
                      <th>Team member</th>
                      <th>Expertise</th>
                      <th>Contact</th>
                      {admin && <th>Labor share</th>}
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map((worker) => (
                      <tr key={worker.id}>
                        <td>
                          <Link
                            href={`/handymen/${worker.id}`}
                            className="group flex items-center gap-3"
                          >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pale text-xs font-semibold text-brand">
                              {initials(worker.full_name)}
                            </span>
                            <span>
                              <span className="block font-semibold group-hover:text-brand">
                                {worker.full_name}
                              </span>
                              <span className="mt-1 block text-[11px] font-normal text-ink-muted">
                                Field technician
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span className="block max-w-[200px] text-[12px] leading-5 text-ink-muted">
                            {worker.skills.length
                              ? worker.skills
                                  .map((skill) => CATEGORY_LABEL[skill])
                                  .join(" · ")
                              : "General services"}
                          </span>
                        </td>
                        <td>
                          <a
                            className="block text-xs hover:text-brand"
                            href={
                              worker.phone ? `tel:${worker.phone}` : undefined
                            }
                          >
                            {worker.phone || "Phone not set"}
                          </a>
                          <span className="mt-1 block text-[11px] text-ink-muted">
                            {worker.email || "Email not set"}
                          </span>
                        </td>
                        {admin && (
                          <td className="tabular-nums">
                            {formatPercent(worker.default_payout_percent)}
                            <span className="mt-1 block text-[10px] text-ink-muted">
                              Default for new assignments
                            </span>
                          </td>
                        )}
                        <td>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${worker.status === "active" ? "bg-[#edf3e8] text-brand" : "bg-subtle text-ink-muted"}`}
                          >
                            <span className="size-1.5 rounded-full bg-current" />
                            {worker.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="text-right">
                          {admin ? (
                            <Link
                              href={`/trips?handyman_id=${worker.id}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-brand hover:bg-pale"
                            >
                              View trip <ArrowUpRight className="size-3.5" />
                            </Link>
                          ) : (
                            <Link
                              href={`/handymen/${worker.id}`}
                              className="text-xs font-medium text-brand"
                            >
                              View profile
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-line px-5 py-3 text-[11px] text-ink-muted">
              {workers.length} {workers.length === 1 ? "member" : "members"}
              {search || status !== "all" ? " matching your filters" : ""}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
