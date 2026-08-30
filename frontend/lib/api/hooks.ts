"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  auth,
  customersApi,
  dashboardApi,
  handymenApi,
  scheduleApi,
  tasksApi,
  usersApi,
} from "./client";
import type { Customer, Task, TaskListParams, TaskStatus, User } from "@/lib/types";

export const qk = {
  currentUser: () => ["auth", "me"] as const,
  users: () => ["users"] as const,
  tasks: (p: TaskListParams) => ["tasks", p] as const,
  task: (id: string) => ["task", id] as const,
  taskHistory: (id: string) => ["task", id, "history"] as const,
  handymen: (p?: object) => ["handymen", p ?? {}] as const,
  handyman: (id: string) => ["handyman", id] as const,
  handymanDay: (id: string, date: string) => ["handyman", id, "day", date] as const,
  handymanTasks: (id: string) => ["handyman", id, "tasks"] as const,
  customers: (p?: object) => ["customers", p ?? {}] as const,
  customer: (id: string) => ["customer", id] as const,
  customerTasks: (id: string) => ["customer", id, "tasks"] as const,
  schedule: (date: string) => ["schedule", date] as const,
  unassigned: (date?: string) => ["unassigned", date ?? "all"] as const,
  stats: () => ["dashboard", "stats"] as const,
};

/** everything that could have changed after a task mutation */
function invalidateTaskScopes(qc: ReturnType<typeof useQueryClient>) {
  ["tasks", "task", "handyman", "customer", "schedule", "unassigned", "dashboard"].forEach(
    (key) => qc.invalidateQueries({ queryKey: [key] }),
  );
}

/**
 * The signed-in dispatcher. `null` means no session — the dashboard layout
 * turns that into a redirect to /login.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: qk.currentUser(),
    queryFn: () => auth.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: qk.users(),
    queryFn: () => usersApi.list(),
    enabled,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; full_name: string; password: string }) =>
      usersApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users() }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Pick<User, "email" | "full_name" | "is_active">>;
    }) => usersApi.update(id, payload),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: qk.users() });
      qc.setQueryData<User | null>(qk.currentUser(), (current) =>
        current?.id === user.id ? user : current,
      );
    },
  });
}

export function useResetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      usersApi.resetPassword(id, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users() }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users() }),
  });
}

export function useTasks(params: TaskListParams) {
  return useQuery({
    queryKey: qk.tasks(params),
    queryFn: () => tasksApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useTask(id: string) {
  return useQuery({ queryKey: qk.task(id), queryFn: () => tasksApi.get(id) });
}

export function useTaskHistory(id: string) {
  return useQuery({
    queryKey: qk.taskHistory(id),
    queryFn: () => tasksApi.history(id),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Task>) => tasksApi.create(payload),
    onSuccess: () => invalidateTaskScopes(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Task> }) =>
      tasksApi.update(id, payload),
    onSuccess: () => invalidateTaskScopes(qc),
  });
}

export function useAssignTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      handyman_id,
    }: {
      id: string;
      handyman_id: string | null;
    }) => tasksApi.assign(id, handyman_id),
    onSuccess: () => invalidateTaskScopes(qc),
  });
}

export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      tasksApi.setStatus(id, status),
    onSuccess: () => invalidateTaskScopes(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => {
      // deliberately not touching the ["task", id] query: invalidating or
      // removing it makes the still-mounted detail page refetch a row that no
      // longer exists. Its cache entry is stale and gets collected on its own.
      ["tasks", "handyman", "customer", "schedule", "unassigned", "dashboard"].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      );
    },
  });
}

export function useHandymen(params: { status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: qk.handymen(params),
    queryFn: () => handymenApi.list(params),
  });
}

export function useHandyman(id: string) {
  return useQuery({
    queryKey: qk.handyman(id),
    queryFn: () => handymenApi.get(id),
  });
}

export function useHandymanDay(id: string, date: string) {
  return useQuery({
    queryKey: qk.handymanDay(id, date),
    queryFn: () => handymenApi.tasksForDay(id, date),
  });
}

export function useHandymanTasks(id: string) {
  return useQuery({
    queryKey: qk.handymanTasks(id),
    queryFn: () => handymenApi.tasks(id),
  });
}

export function useCustomers(params: { search?: string } = {}) {
  return useQuery({
    queryKey: qk.customers(params),
    queryFn: () => customersApi.list(params),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: qk.customer(id),
    queryFn: () => customersApi.get(id),
  });
}

export function useCustomerTasks(id: string) {
  return useQuery({
    queryKey: qk.customerTasks(id),
    queryFn: () => customersApi.tasks(id),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Customer>) => customersApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useSchedule(date: string) {
  return useQuery({
    queryKey: qk.schedule(date),
    queryFn: () => scheduleApi.day(date),
  });
}

export function useUnassigned(date?: string) {
  return useQuery({
    queryKey: qk.unassigned(date),
    queryFn: () => scheduleApi.unassigned(date),
  });
}

export function useStats() {
  return useQuery({ queryKey: qk.stats(), queryFn: () => dashboardApi.stats() });
}
