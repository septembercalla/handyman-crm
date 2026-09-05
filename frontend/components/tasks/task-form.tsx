"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  DollarSign,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Field } from "@/components/common/field";
import { CustomerCombobox } from "./customer-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeSelect } from "@/components/ui/time-select";
import {
  useCreateTask,
  useCurrentUser,
  useHandymen,
  useTasks,
  useUpdateTask,
} from "@/lib/api/hooks";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
} from "@/lib/constants";
import { addMoney, formatMoney, timeWindow, todayISO } from "@/lib/format";
import { dayWorkloadLabel, findTimeConflicts, getTimeRange } from "@/lib/scheduling";
import type {
  MaterialsPaidBy,
  TaskCategory,
  TaskWithRelations,
} from "@/lib/types";

const UNASSIGNED = "__none__";

const FIELD_LABELS: Partial<Record<keyof TaskFormValues, string>> = {
  title: "Title",
  category: "Category",
  priority: "Priority",
  customer_id: "Customer",
  street_address: "Street address",
  city: "City",
  state: "State",
  time_window_end: "End time",
};

const DEFAULT_DURATION: Record<TaskCategory, number> = {
  plumbing: 120,
  electrical: 120,
  hvac: 120,
  carpentry: 120,
  painting: 180,
  appliance: 90,
  general: 90,
  other: 90,
};

const moneyField = z
  .string()
  .trim()
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value || "0"), {
    message: "Use a non-negative amount with up to 2 decimals",
  });

const payoutField = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (/^\d+(\.\d{1,2})?$/.test(value) &&
        Number(value) >= 0 &&
        Number(value) <= 100),
    { message: "Use a percentage from 0 to 100" },
  );

const schema = z
  .object({
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
    labor_price: moneyField,
    materials_cost: moneyField,
    materials_paid_by: z.enum(["company", "handyman", "customer"]),
    handyman_payout_percent: payoutField,
    internal_notes: z.string().optional(),
  })
  .superRefine((values, context) => {
    if (
      values.time_window_start &&
      values.time_window_end &&
      values.time_window_end <= values.time_window_start
    ) {
      context.addIssue({
        code: "custom",
        path: ["time_window_end"],
        message: "End time must be later than start time",
      });
    }
  });

export type TaskFormValues = z.infer<typeof schema>;

export function TaskForm({ task }: { task?: TaskWithRelations }) {
  const router = useRouter();
  const create = useCreateTask();
  const update = useUpdateTask();
  const { data: currentUser } = useCurrentUser();
  const { data: handymen = [] } = useHandymen({ status: "active" });
  const isAdmin = currentUser?.role === "admin";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getFieldState,
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
      estimated_duration_min: String(DEFAULT_DURATION.general),
      handyman_id: UNASSIGNED,
      labor_price: "0.00",
      materials_cost: "0.00",
      materials_paid_by: "company",
      handyman_payout_percent: "",
      internal_notes: "",
    },
  });

  useEffect(() => {
    if (!task) return;
    reset({
      task_number: task.task_number,
      title: task.title,
      category: task.category,
      priority: TASK_PRIORITIES.includes(task.priority) ? task.priority : "normal",
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
      labor_price: task.labor_price ?? "0.00",
      materials_cost: task.materials_cost ?? "0.00",
      materials_paid_by: task.materials_paid_by ?? "company",
      handyman_payout_percent: task.handyman_payout_percent ?? "",
      internal_notes: task.internal_notes,
    });
  }, [task, reset]);

  const values = watch();
  const assignmentHandymen =
    task?.handyman && !handymen.some((handyman) => handyman.id === task.handyman?.id)
      ? [...handymen, task.handyman]
      : handymen;
  const { data: dayTasksData } = useTasks(
    {
      date_from: values.scheduled_date || undefined,
      date_to: values.scheduled_date || undefined,
      page_size: 200,
    },
    Boolean(values.scheduled_date),
  );
  const dayTasks = (dayTasksData?.items ?? []).filter(
    (dayTask) => dayTask.status !== "cancelled" && dayTask.id !== task?.id,
  );
  const selectedHandymanTasks = dayTasks.filter(
    (dayTask) => dayTask.handyman_id === values.handyman_id,
  );
  const candidateRange = getTimeRange(
    values.time_window_start,
    values.time_window_end,
    values.estimated_duration_min ? Number(values.estimated_duration_min) : null,
  );
  const conflicts = findTimeConflicts(selectedHandymanTasks, candidateRange, task?.id);

  async function submit(values: TaskFormValues, keepEditing: boolean) {
    const formPayout = values.handyman_payout_percent
      ? addMoney(values.handyman_payout_percent, "0")
      : null;
    const savedPayout = task?.handyman_payout_percent
      ? addMoney(task.handyman_payout_percent, "0")
      : null;
    const historicalFinancialsChanged =
      task?.status === "done" &&
      (addMoney(values.labor_price, "0") !== addMoney(task.labor_price, "0") ||
        addMoney(values.materials_cost, "0") !== addMoney(task.materials_cost, "0") ||
        values.materials_paid_by !== task.materials_paid_by ||
        (isAdmin && formPayout !== savedPayout));
    if (
      historicalFinancialsChanged &&
      !window.confirm(
        "This task is completed. Changing financials will update historical payroll. Continue?",
      )
    ) {
      return;
    }

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
      labor_price: values.labor_price || "0.00",
      materials_cost: values.materials_cost || "0.00",
      materials_paid_by: values.materials_paid_by,
      ...(isAdmin
        ? {
            handyman_payout_percent:
              !values.handyman_id || values.handyman_id === UNASSIGNED
                ? null
                : values.handyman_payout_percent || null,
          }
        : {}),
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

  function showValidationError(formErrors: FieldErrors<TaskFormValues>) {
    const fieldName = Object.keys(formErrors)[0] as keyof TaskFormValues | undefined;
    if (!fieldName) {
      toast.error("Cannot save: check the required fields");
      return;
    }

    const error = formErrors[fieldName];
    const label = FIELD_LABELS[fieldName] ?? "Required field";
    const message =
      fieldName === "priority"
        ? "select a priority"
        : typeof error?.message === "string"
          ? error.message
          : "check this field";
    const element = document.getElementById(fieldName);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus();
    toast.error(`Cannot save: ${label} — ${message}`);
  }

  const submitForm = (keepEditing: boolean) =>
    handleSubmit((values) => submit(values, keepEditing), showValidationError);

  return (
    <form onSubmit={submitForm(false)}>
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
              variant="ghost"
              disabled={isSubmitting}
              onClick={submitForm(true)}
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
            <Field label="Category">
              <Select
                value={values.category}
                onValueChange={(v) => {
                  const category = v as TaskFormValues["category"];
                  setValue("category", category);
                  if (!getFieldState("estimated_duration_min").isDirty) {
                    setValue(
                      "estimated_duration_min",
                      String(DEFAULT_DURATION[category]),
                    );
                  }
                }}
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
            <Field
              label="Priority"
              htmlFor="priority"
              required
              error={errors.priority ? "Select a priority" : undefined}
            >
              <Select
                value={values.priority}
                onValueChange={(v) =>
                  setValue("priority", v as TaskFormValues["priority"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="priority" aria-invalid={!!errors.priority}>
                  <SelectValue placeholder="Select priority" />
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
            <Field label="Description" htmlFor="description" className="md:col-span-4">
              <Textarea
                id="description"
                placeholder="Details as described by the customer"
                {...register("description")}
              />
            </Field>
            <details className="md:col-span-4">
              <summary className="cursor-pointer text-[12px] font-medium text-ink-muted hover:text-ink">
                Advanced
              </summary>
              <div className="mt-3 max-w-xs">
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
              </div>
            </details>
          </CardBody>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card>
            <CardHeader>
              <CardTitle icon={<UserRound />}>Customer &amp; Location</CardTitle>
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

              <div className="space-y-3 rounded-[4px] border border-line bg-subtle/30 p-3">
                <p className="text-[11px] leading-4 text-ink-muted">
                  Job address is copied from the customer record. Edit it here when
                  this job is at a different location.
                </p>
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
                <div className="grid grid-cols-[1fr_70px_96px] gap-3">
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
              </div>

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
              <CardTitle icon={<CalendarClock />}>Schedule &amp; Assignment</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field label="Date">
                <DatePicker
                  value={values.scheduled_date ?? ""}
                  onChange={(date) =>
                    setValue("scheduled_date", date, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  minDate={task ? undefined : todayISO()}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                <Field label="From">
                  <TimeSelect
                    value={values.time_window_start}
                    onChange={(time) =>
                      setValue("time_window_start", time, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    placeholder="Start time"
                  />
                </Field>
                <Field label="To" error={errors.time_window_end?.message}>
                  <TimeSelect
                    value={values.time_window_end}
                    onChange={(time) =>
                      setValue("time_window_end", time, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    placeholder="End time"
                  />
                </Field>
                <Field label="Est., min">
                  <Input
                    type="number"
                    min={0}
                    step={15}
                    {...register("estimated_duration_min")}
                  />
                </Field>
              </div>

              <Field
                label="Handyman"
                hint="You can still save when a time conflict is shown."
              >
                <Select
                  value={values.handyman_id || UNASSIGNED}
                  onValueChange={(value) => {
                    setValue("handyman_id", value, { shouldDirty: true });
                    if (isAdmin) {
                      const selectedHandyman = assignmentHandymen.find(
                        (handyman) => handyman.id === value,
                      );
                      setValue(
                        "handyman_payout_percent",
                        selectedHandyman?.default_payout_percent ?? "",
                        { shouldDirty: true, shouldValidate: true },
                      );
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {assignmentHandymen.map((handyman) => {
                      const jobs = dayTasks.filter(
                        (dayTask) => dayTask.handyman_id === handyman.id,
                      );
                      return (
                        <SelectItem key={handyman.id} value={handyman.id}>
                          {handyman.full_name}
                          {handyman.status === "inactive" ? " · inactive" : ""}
                          {values.scheduled_date
                            ? ` · ${dayWorkloadLabel(jobs)}`
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>

              {values.handyman_id && values.handyman_id !== UNASSIGNED && (
                conflicts.length > 0 ? (
                  <div className="flex gap-2 rounded-[4px] border border-[#f0c36d] bg-[#fff8e8] p-3 text-[12px] text-[#7a4b00]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Time conflict</p>
                      <p className="mt-0.5">
                        This handyman already has {conflicts.map((conflict) => (
                          <span key={conflict.id} className="font-medium">
                            {conflict.task_number} ({timeWindow(
                              conflict.time_window_start,
                              conflict.time_window_end,
                            )}){" "}
                          </span>
                        ))}
                        during this slot. You can still save the assignment.
                      </p>
                    </div>
                  </div>
                ) : values.scheduled_date ? (
                  <p className="flex items-center gap-1.5 rounded-[4px] bg-subtle px-3 py-2 text-[12px] text-ink-muted">
                    <CalendarClock className="size-3.5 shrink-0" />
                    {dayWorkloadLabel(selectedHandymanTasks)}
                  </p>
                ) : (
                  <p className="text-[12px] text-ink-muted">
                    Choose a date to see this handyman&apos;s workload.
                  </p>
                )
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle icon={<DollarSign />}>Financials</CardTitle>
            <span className="text-[12px] text-ink-muted">
              Customer pricing and handyman payout basis
            </span>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-4">
            <Field
              label="Labor price"
              htmlFor="labor_price"
              error={errors.labor_price?.message}
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">
                  $
                </span>
                <Input
                  id="labor_price"
                  inputMode="decimal"
                  className="pl-6 tnum"
                  aria-invalid={!!errors.labor_price}
                  {...register("labor_price")}
                />
              </div>
            </Field>
            <Field
              label="Materials cost"
              htmlFor="materials_cost"
              error={errors.materials_cost?.message}
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">
                  $
                </span>
                <Input
                  id="materials_cost"
                  inputMode="decimal"
                  className="pl-6 tnum"
                  aria-invalid={!!errors.materials_cost}
                  {...register("materials_cost")}
                />
              </div>
            </Field>
            <Field label="Materials paid by">
              <Select
                value={values.materials_paid_by}
                onValueChange={(value) =>
                  setValue("materials_paid_by", value as MaterialsPaidBy, {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="handyman">Handyman</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-[4px] border border-line bg-subtle px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-ink-muted">
                Customer total
              </p>
              <p className="mt-1 text-[18px] font-semibold tnum text-ink">
                {formatMoney(addMoney(values.labor_price, values.materials_cost))}
              </p>
            </div>

            {isAdmin && (
              <Field
                label="Handyman payout %"
                htmlFor="handyman_payout_percent"
                error={errors.handyman_payout_percent?.message}
                hint="Snapshot for this task; percentage applies to labor only."
                className="md:col-span-2"
              >
                <div className="relative max-w-[220px]">
                  <Input
                    id="handyman_payout_percent"
                    inputMode="decimal"
                    className="pr-7 tnum"
                    readOnly={!values.handyman_id || values.handyman_id === UNASSIGNED}
                    aria-disabled={
                      !values.handyman_id || values.handyman_id === UNASSIGNED
                    }
                    aria-invalid={!!errors.handyman_payout_percent}
                    {...register("handyman_payout_percent")}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">
                    %
                  </span>
                </div>
              </Field>
            )}

            {task?.status === "done" && (
              <div className="flex gap-2 rounded-[4px] border border-[#f0c36d] bg-[#fff8e8] p-3 text-[12px] text-[#7a4b00] md:col-span-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  This task is completed. Saving changed financials will update
                  historical payroll and requires confirmation.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </form>
  );
}
