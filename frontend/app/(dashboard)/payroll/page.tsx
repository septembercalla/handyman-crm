"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Landmark,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useCurrentUser, usePayroll } from "@/lib/api/hooks";
import {
  addDays,
  formatMoney,
  formatPercent,
  shortDate,
} from "@/lib/format";

export default function PayrollPage() {
  const router = useRouter();
  const { data: currentUser, isPending: userPending } = useCurrentUser();
  // Let the server choose the current week in the business timezone.
  const [weekStart, setWeekStart] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isAdmin = currentUser?.role === "admin";
  const { data: payroll, isLoading } = usePayroll(weekStart, isAdmin);

  useEffect(() => {
    if (!userPending && currentUser?.role !== "admin") router.replace("/");
  }, [currentUser, router, userPending]);

  if (userPending || !isAdmin) return <div className="min-h-screen bg-app" />;

  const rangeStart = payroll?.week_start ?? weekStart;
  const rangeEnd = payroll?.week_end ?? (weekStart ? addDays(weekStart, 6) : undefined);

  function changeWeek(days: number) {
    if (!rangeStart) return;
    setWeekStart(addDays(rangeStart, days));
    setExpanded(new Set());
  }

  function toggle(handymanId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(handymanId)) next.delete(handymanId);
      else next.add(handymanId);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        meta={<span>Completed tasks · Monday–Sunday{payroll ? ` · ${payroll.timezone}` : ""}</span>}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="iconSm"
              aria-label="Previous week"
              disabled={!rangeStart || isLoading}
              onClick={() => changeWeek(-7)}
            >
              <ChevronLeft />
            </Button>
            <div className="min-w-[180px] text-center text-[13px] font-medium tnum">
              {shortDate(rangeStart ?? null)} – {shortDate(rangeEnd ?? null)}
            </div>
            <Button
              variant="outline"
              size="iconSm"
              aria-label="Next week"
              disabled={!rangeStart || isLoading}
              onClick={() => changeWeek(7)}
            >
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-3 p-4">
        {isLoading || !payroll ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))
        ) : (
          payroll.handymen.map((handyman) => {
            const isExpanded = expanded.has(handyman.handyman_id);
            return (
              <Card key={handyman.handyman_id} className="overflow-hidden">
                <CardHeader>
                  <CardTitle icon={<Landmark />}>{handyman.handyman_name}</CardTitle>
                  <div className="ml-auto text-right">
                    <p className="text-[11px] uppercase tracking-[0.03em] text-ink-muted">
                      Total payout
                    </p>
                    <p className="text-[16px] font-semibold tnum">
                      {formatMoney(handyman.total_payout)}
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
                  <Metric label="Completed jobs" value={String(handyman.completed_jobs)} />
                  <Metric label="Calculated jobs" value={String(handyman.calculated_jobs)} />
                  <Metric label="Payout not set" value={String(handyman.payout_not_set)} />
                  <Metric label="Labor revenue" value={formatMoney(handyman.labor_revenue)} />
                  <Metric label="Labor earnings" value={formatMoney(handyman.labor_earnings)} />
                  <Metric
                    label="Materials reimb."
                    value={formatMoney(handyman.materials_reimbursement)}
                  />
                  <div className="flex items-end lg:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(handyman.handyman_id)}
                      disabled={handyman.tasks.length === 0}
                    >
                      {isExpanded ? <ChevronUp /> : <ChevronDown />}
                      {isExpanded ? "Hide breakdown" : "View breakdown"}
                    </Button>
                  </div>
                </CardBody>

                {handyman.payout_not_set > 0 && (
                  <div className="flex items-center gap-2 border-t border-[#f0c36d] bg-[#fff8e8] px-4 py-2.5 text-[12px] text-[#7a4b00]">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>
                      {handyman.payout_not_set} completed
                      {handyman.payout_not_set === 1 ? " job requires" : " jobs require"}
                      {" payout setup. Unresolved jobs are excluded from all payroll totals."}
                    </span>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-line">
                    <Table>
                      <THead>
                        <TR className="hover:bg-transparent">
                          <TH>Task #</TH>
                          <TH>Date</TH>
                          <TH>Customer</TH>
                          <TH>Labor</TH>
                          <TH>Materials</TH>
                          <TH>Payout %</TH>
                          <TH>Labor earnings</TH>
                          <TH>Reimbursement</TH>
                          <TH>Total payout</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {handyman.tasks.map((task) => (
                          <TR key={task.task_id}>
                            <TD>
                              <Link
                                href={`/tasks/${task.task_id}`}
                                className="font-medium text-brand hover:underline"
                              >
                                {task.task_number}
                              </Link>
                            </TD>
                            <TD className="whitespace-nowrap tnum">
                              {shortDate(task.completed_date)}
                            </TD>
                            <TD>{task.customer_name}</TD>
                            <TD className="tnum">{formatMoney(task.labor_price)}</TD>
                            <TD className="tnum">
                              {formatMoney(task.materials_cost)}
                              <span className="block text-[10px] capitalize text-ink-muted">
                                {task.materials_paid_by}
                              </span>
                            </TD>
                            <TD className="tnum">
                              {task.payout_percent === null ? (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-[#a15c00]">
                                  <AlertTriangle className="size-3.5" />
                                  Payout not set
                                </span>
                              ) : (
                                formatPercent(task.payout_percent)
                              )}
                            </TD>
                            <TD className="tnum">
                              {task.labor_earnings === null
                                ? "—"
                                : formatMoney(task.labor_earnings)}
                            </TD>
                            <TD className="tnum">
                              {task.materials_reimbursement === null
                                ? "—"
                                : formatMoney(task.materials_reimbursement)}
                            </TD>
                            <TD className="font-semibold tnum">
                              {task.total_payout === null
                                ? "—"
                                : formatMoney(task.total_payout)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                    <div className="flex flex-wrap justify-end gap-x-8 gap-y-2 border-t border-line bg-subtle px-4 py-3 text-[12px]">
                      <Total label="Labor earnings" value={handyman.labor_earnings} />
                      <Total
                        label="Materials reimbursement"
                        value={handyman.materials_reimbursement}
                      />
                      <Total label="TOTAL PAYOUT" value={handyman.total_payout} strong />
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-ink-muted">
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold tnum">{value}</p>
    </div>
  );
}

function Total({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className={strong ? "font-semibold text-ink" : "text-ink-muted"}>
      {label}: <span className="ml-1 tnum">{formatMoney(value)}</span>
    </span>
  );
}
