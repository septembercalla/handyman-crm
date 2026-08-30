"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useHandymen, useTasks } from "@/lib/api/hooks";
import { CATEGORY_LABEL } from "@/lib/constants";
import { todayISO } from "@/lib/format";

export default function HandymenPage() {
  const router = useRouter();
  const { data: handymen, isLoading } = useHandymen();
  const today = todayISO();
  const { data: todayTasks } = useTasks({
    date_from: today,
    date_to: today,
    page_size: 200,
  });

  const loadByHandyman = new Map<string, number>();
  todayTasks?.items.forEach((t) => {
    if (!t.handyman_id) return;
    loadByHandyman.set(t.handyman_id, (loadByHandyman.get(t.handyman_id) ?? 0) + 1);
  });

  return (
    <>
      <PageHeader
        title="Handymen"
        meta={handymen ? <span className="tnum">{handymen.length}</span> : undefined}
      />

      <div className="flex-1 p-4">
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : !handymen || handymen.length === 0 ? (
            <EmptyState title="No handymen yet" />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Skills</TH>
                  <TH>Phone</TH>
                  <TH>Email</TH>
                  <TH>Rate</TH>
                  <TH>Today</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {handymen.map((h) => (
                  <TR
                    key={h.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/handymen/${h.id}`)}
                  >
                    <TD>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: h.color }}
                        />
                        <Link
                          href={`/handymen/${h.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {h.full_name}
                        </Link>
                      </span>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        {h.skills.map((s) => (
                          <span
                            key={s}
                            className="rounded-[3px] border border-line px-1.5 py-0.5 text-[11px] text-ink-muted"
                          >
                            {CATEGORY_LABEL[s]}
                          </span>
                        ))}
                      </span>
                    </TD>
                    <TD className="tnum whitespace-nowrap">{h.phone}</TD>
                    <TD className="text-ink-muted">{h.email}</TD>
                    <TD className="tnum">
                      {h.hourly_rate ? `$${h.hourly_rate}/h` : "—"}
                    </TD>
                    <TD className="tnum">{loadByHandyman.get(h.id) ?? 0}</TD>
                    <TD>
                      <span
                        className="inline-flex h-[18px] items-center rounded-[3px] px-1.5 text-[11px] font-semibold uppercase leading-none text-white"
                        style={{
                          backgroundColor:
                            h.status === "active" ? "#1f8a4c" : "#6b7785",
                        }}
                      >
                        {h.status}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
