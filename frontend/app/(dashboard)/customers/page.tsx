"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useCustomers } from "@/lib/api/hooks";
import { cityLine } from "@/lib/format";

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useCustomers({ search });

  return (
    <>
      <PageHeader
        title="Customers"
        meta={customers ? <span className="tnum">{customers.length}</span> : undefined}
      />

      <div className="flex-1 p-4">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-2.5">
            <div className="relative max-w-[280px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, phone, address…"
                className="pl-8"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : !customers || customers.length === 0 ? (
            <EmptyState title="No customers found" />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Customer</TH>
                  <TH>Phone</TH>
                  <TH>Email</TH>
                  <TH>Address</TH>
                  <TH>Tasks</TH>
                </TR>
              </THead>
              <TBody>
                {customers.map((c) => (
                  <TR
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/customers/${c.id}`)}
                  >
                    <TD>
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.full_name}
                      </Link>
                    </TD>
                    <TD className="tnum whitespace-nowrap">{c.phone}</TD>
                    <TD className="text-ink-muted">{c.email}</TD>
                    <TD>
                      <div>{c.street_address}</div>
                      <div className="text-[11px] text-ink-muted">
                        {cityLine(c)}
                      </div>
                    </TD>
                    <TD className="tnum">{c.task_count ?? 0}</TD>
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
