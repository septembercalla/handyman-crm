"use client";

import { use } from "react";
import { TaskForm } from "@/components/tasks/task-form";
import { useTask } from "@/lib/api/hooks";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading } = useTask(id);

  if (isLoading || !data)
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-[52px]" />
        <Skeleton className="h-64" />
      </div>
    );

  return <TaskForm task={data} />;
}
