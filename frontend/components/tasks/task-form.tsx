"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarClock, ClipboardList, MapPin, UserRound, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Field } from "@/components/common/field";
import { CustomerCombobox } from "./customer-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTask, useHandymen, useUpdateTask } from "@/lib/api/hooks";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
} from "@/lib/constants";
import type { TaskWithRelations } from "@/lib/types";

const UNASSIGNED = "__none__";

const schema = z.object({
  task_number: z.string().trim().optional(),
  title: z.string().trim().min(3, "At least 3 characters"),
  category: z.enum([
    "plumbing",
    "electrical",
    "hvac",
    "carpentry",
    "painting",
    "appliance",
    "general",
    "other",
  ]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  description: z.string().optional(),

  customer_id: z.string().min(1, "Select a customer"),

  street_address: z.string().trim().min(3, "Street address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().max(2, "2 letters").optional(),
  zip: z.string().trim().optional(),

  scheduled_date: z.string().optional(),
  time_window_start: z.string().optional(),
  time_window_end: z.string().optional(),
  estimated_duration_min: z.string().optional(),

  handyman_id: z.string().optional(),
  internal_notes: z.string().optional(),
});

export type TaskFormValues = z.infer<typeof schema>;

export function TaskForm({ task }: { task?: TaskWithRelations }) {
  const router = useRouter();
  const create = useCreateTask();
  const update = useUpdateTask();
  const { data: handymen = [] } = useHandymen({ status: "active" });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      task_number: "",
      title: "",
      category: "general",
      priority: "normal",
      description: "",
      customer_id: "",
      street_address: "",
      city: "",
      state: "",
      zip: "",
      scheduled_date: "",
      time_window_start: "",
      time_window_end: "",
      estimated_duration_min: "",
      handyman_id: UNASSIGNED,
      internal_notes: "",
    },
  });

  useEffect(() => {
    if (!task) return;
    reset({
      task_number: task.task_number,
      title: task.title,
      category: task.category,
      priority: task.priority,
      description: task.description,
      customer_id: task.customer_id,
      street_address: task.street_address,
      city: task.city,
      state: task.state,
      zip: task.zip,
      scheduled_date: task.scheduled_date ?? "",
      time_window_start: task.time_window_start ?? "",
      time_window_end: task.time_window_end ?? "",
      estimated_duration_min: task.estimated_duration_min
        ? String(task.estimated_duration_min)
        : "",
      handyman_id: task.handyman_id ?? UNASSIGNED,
      internal_notes: task.internal_notes,
    });
  }, [task, reset]);

  const values = watch();

  async function submit(values: TaskFormValues, keepEditing: boolean) {
    const payload = {
      task_number: values.task_number || undefined,
      title: values.title,
      category: values.category,
      priority: values.priority,
      description: values.description ?? "",
      customer_id: values.customer_id,
      street_address: values.street_address,
      city: values.city,
      state: values.state ?? "",
      zip: values.zip ?? "",
      scheduled_date: values.scheduled_date || null,
      time_window_start: values.time_window_start || null,
      time_window_end: values.time_window_end || null,
      estimated_duration_min: values.estimated_duration_min
        ? Number(values.estimated_duration_min)
        : null,
      handyman_id:
        !values.handyman_id || values.handyman_id === UNASSIGNED
          ? null
          : values.handyman_id,
      internal_notes: values.internal_notes ?? "",
    };

    try {
      if (task) {
        await update.mutateAsync({ id: task.id, payload });
        toast.success("Task saved");
        if (!keepEditing) router.push(`/tasks/${task.id}`);
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(`Task ${created.task_number} created`);
        router.push(keepEditing ? `/tasks/${created.id}/edit` : `/tasks/${created.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the task");
    }
  }

  return (
    <form onSubmit={handleSubmit((v) => submit(v, false))}>
      <PageHeader
        back
        title={task ? `Edit ${task.task_number}` : "Create Task"}
        actions={
          <>
            <Button type="submit" disabled={isSubmitting}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={handleSubmit((v) => submit(v, true))}
            >
              Save &amp; Continue Editing
            </Button>
          </>
        }
      />

      <div className="flex-1 space-y-4 p-4">
        {/* 1. Task Details */}
        <Card>
          <CardHeader>
            <CardTitle icon={<ClipboardList />}>Task Details</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-4">
            <Field
              label="Task #"
              htmlFor="task_number"
              hint="Leave empty to assign a number automatically"
            >
              <Input
                id="task_number"
                placeholder="T-1042"
                {...register("task_number")}
              />
            </Field>
            <Field
              label="Title"
              htmlFor="title"
              required
              error={errors.title?.message}
              className="md:col-span-2"
            >
              <Input
                id="title"
                placeholder="What needs to be done"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <Select
                  value={values.category}
                  onValueChange={(v) =>
                    setValue("category", v as TaskFormValues["category"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select
                  value={values.priority}
                  onValueChange={(v) =>
                    setValue("priority", v as TaskFormValues["priority"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="description" className="md:col-span-4">
              <Textarea
                id="description"
                placeholder="Details as described by the customer"
                {...register("description")}
              />
            </Field>
          </CardBody>
        </Card>

        {/* 2 + 3 — two columns, like Pickup / Delivery in the reference */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle icon={<UserRound />}>Customer</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field
                label="Customer"
                required
                error={errors.customer_id?.message}
                hint="Site address is filled in from the customer record"
              >
                <CustomerCombobox
                  value={values.customer_id || null}
                  onChange={(c) => {
                    setValue("customer_id", c?.id ?? "", {
                      shouldValidate: true,
                    });
                    if (c) {
                      setValue("street_address", c.street_address);
                      setValue("city", c.city);
                      setValue("state", c.state);
                      setValue("zip", c.zip);
                    }
                  }}
                />
              </Field>
              <Field label="Internal notes" htmlFor="internal_notes">
                <Textarea
                  id="internal_notes"
                  placeholder="Gate code, dog in the yard, call ahead…"
                  {...register("internal_notes")}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle icon={<MapPin />}>Schedule &amp; Location</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field
                label="Street address"
                htmlFor="street_address"
                required
                error={errors.street_address?.message}
              >
                <Input
                  id="street_address"
                  aria-invalid={!!errors.street_address}
                  {...register("street_address")}
                />
              </Field>
              <div className="grid grid-cols-[1fr_80px_110px] gap-3">
                <Field label="City" required error={errors.city?.message}>
                  <Input aria-invalid={!!errors.city} {...register("city")} />
                </Field>
                <Field label="State">
                  <Input maxLength={2} {...register("state")} />
                </Field>
                <Field label="ZIP">
                  <Input {...register("zip")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Date" htmlFor="scheduled_date">
                  <Input
                    id="scheduled_date"
                    type="date"
                    {...register("scheduled_date")}
                  />
                </Field>
                <Field label="From">
                  <Input type="time" {...register("time_window_start")} />
                </Field>
                <Field label="To">
                  <Input type="time" {...register("time_window_end")} />
                </Field>
                <Field label="Est., min">
                  <Input
                    type="number"
                    min={0}
                    step={15}
                    placeholder="90"
                    {...register("estimated_duration_min")}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* 4. Assignment */}
        <Card>
          <CardHeader>
            <CardTitle icon={<Wrench />}>Assignment</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field
              label="Handyman"
              hint="Assigning a handyman moves the task to Assigned"
            >
              <Select
                value={values.handyman_id || UNASSIGNED}
                onValueChange={(v) => setValue("handyman_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {handymen.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end">
              <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <CalendarClock className="size-3.5" />
                Skill- and workload-based matching arrives with the backend.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </form>
  );
}
