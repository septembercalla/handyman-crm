"use client";

import Link from "next/link";
import { use } from "react";
import { History, MapPin, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Detail } from "@/components/common/field";
import { MiniTaskTable } from "@/components/tasks/mini-task-table";
import { MapView } from "@/components/map/map-view";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomer, useCustomerTasks } from "@/lib/api/hooks";
import { cityLine, duration } from "@/lib/format";

/**
 * Site record: the full work history for an address — the "memory" that saves
 * the dispatcher from digging through old messages.
 */
export default function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: customer, isLoading } = useCustomer(id);
  const { data: tasks = [] } = useCustomerTasks(id);

  if (isLoading || !customer) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-[52px]" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const geo = tasks.find((t) => t.latitude !== null);
  const done = tasks.filter((t) => t.status === "done");
  const totalMin = done.reduce(
    (acc, t) => acc + (t.estimated_duration_min ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        back="/customers"
        title={customer.full_name}
        meta={<span className="tnum">{customer.phone}</span>}
        actions={
          <Button asChild size="sm">
            <Link href="/tasks/new">
              <Plus /> Create Task
            </Link>
          </Button>
        }
      />

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle icon={<History />}>Work history</CardTitle>
            <span className="tnum text-[13px] text-ink-muted">
              {tasks.length} tasks · {done.length} done
            </span>
          </CardHeader>
          <MiniTaskTable
            tasks={tasks}
            columns={["number", "date", "title_address", "category", "handyman", "status"]}
            emptyTitle="No work has been done at this site yet"
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact &amp; site</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Detail label="Phone">{customer.phone || "—"}</Detail>
              <Detail label="Email">{customer.email || "—"}</Detail>
              <Detail label="Address" className="sm:col-span-2">
                <div>{customer.street_address}</div>
                <div className="text-ink-muted">{cityLine(customer)}</div>
              </Detail>
              <Detail label="Total time" className="sm:col-span-2">
                <span className="tnum">{duration(totalMin)}</span>
              </Detail>
              {customer.notes && (
                <div className="sm:col-span-2 rounded-[4px] border border-line bg-[#fbfbfc] px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-ink-muted">
                    Site notes
                  </p>
                  <p className="mt-0.5 text-[13px]">{customer.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {geo && (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle icon={<MapPin />}>On the map</CardTitle>
              </CardHeader>
              <MapView
                className="h-[240px] rounded-none border-x-0 border-b-0"
                points={[
                  {
                    id: customer.id,
                    lat: geo.latitude!,
                    lng: geo.longitude!,
                    title: customer.full_name,
                    subtitle: customer.street_address,
                  },
                ]}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
