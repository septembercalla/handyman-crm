"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TasksTable } from "@/components/tasks/tasks-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTasks } from "@/lib/api/hooks";
import type { TaskListParams } from "@/lib/types";

function TasksPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const params: TaskListParams = {
    review_pending: sp.get("review_pending") === "1",
    completed_this_week: sp.get("completed_this_week") === "1",
    five_star_this_week: sp.get("five_star_this_week") === "1",
    status: (sp.get("status") as TaskListParams["status"]) ?? "",
    category: (sp.get("category") as TaskListParams["category"]) ?? "",
    priority: (sp.get("priority") as TaskListParams["priority"]) ?? "",
    handyman_id: sp.get("handyman_id") ?? undefined,
    date_from: sp.get("date_from") ?? undefined,
    date_to: sp.get("date_to") ?? undefined,
    search: sp.get("search") ?? undefined,
    ordering: sp.get("ordering") ?? "-created_at",
    page: Number(sp.get("page") ?? 1) || 1,
    page_size: Number(sp.get("page_size") ?? 25) || 25,
    unassigned: sp.get("unassigned") === "1",
  };

  const { data, isLoading } = useTasks(params);

  return (
    <>
      <PageHeader
        title="Tasks"
        meta={
          data ? <span className="tnum">{data.total} total</span> : undefined
        }
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus /> Create Task
            </Link>
          </Button>
        }
      />

      <div className="flex-1 p-4">
        <Card className="overflow-hidden">
          <TaskFilters />
          {(params.review_pending || params.completed_this_week || params.five_star_this_week) && <div className="border-b border-line px-4 py-2 text-xs text-ink-muted">
            {params.review_pending && "Reviews pending · "}{params.completed_this_week && "Completed this business week · "}{params.five_star_this_week && "5-star reviews received this business week · "}
            <Link href="/tasks" className="text-brand underline">Clear operational filter</Link>
          </div>}
          <TasksTable
            data={data}
            isLoading={isLoading}
            onCreate={() => router.push("/tasks/new")}
          />
        </Card>
      </div>
    </>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app" />}>
      <TasksPageInner />
    </Suspense>
  );
}
