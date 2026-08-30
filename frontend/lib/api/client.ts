"use client";

import {
  STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
} from "@/lib/constants";
import { getDb, nextTaskNumber, persist, resetDb, uid } from "@/lib/mock/db";
import { todayISO } from "@/lib/format";
import type {
  Customer,
  DashboardStats,
  Handyman,
  Paginated,
  ScheduleRow,
  Task,
  TaskListParams,
  TaskStatus,
  TaskStatusHistoryEntry,
  TaskWithRelations,
  User,
} from "@/lib/types";

/**
 * API client. For now it runs on demo data in the browser, but it mirrors the
 * SPEC §5 contract exactly: same paths, same params, same response shapes.
 * Switching to FastAPI means replacing the function bodies with
 * fetch(`${API_URL}/tasks`, ...) — the signatures stay as they are.
 */

const LATENCY = 120;

function delay<T>(value: T): Promise<T> {
  return new Promise((res) => setTimeout(() => res(value), LATENCY));
}

export class ApiError extends Error {
  constructor(public detail: string) {
    super(detail);
  }
}

/* ------------------------------------------------------------------ auth */

const AUTH_KEY = "handyman-crm:auth";

export const auth = {
  async login(email: string, password: string): Promise<User> {
    if (!email || !password) throw new ApiError("Enter email and password");
    const user = getDb().users[0];
    window.localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({ email: email.trim(), user }),
    );
    return delay(user);
  },
  logout() {
    window.localStorage.removeItem(AUTH_KEY);
  },
  me(): User | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      return (JSON.parse(raw) as { user: User }).user;
    } catch {
      return null;
    }
  },
};

/* --------------------------------------------------------------- helpers */

function withRelations(t: Task): TaskWithRelations {
  const d = getDb();
  return {
    ...t,
    customer: d.customers.find((c) => c.id === t.customer_id) ?? null,
    handyman: t.handyman_id
      ? (d.handymen.find((h) => h.id === t.handyman_id) ?? null)
      : null,
  };
}

function pushHistory(taskId: string, from: TaskStatus | null, to: TaskStatus) {
  const d = getDb();
  const user = auth.me() ?? d.users[0];
  d.history.push({
    id: uid("hist"),
    task_id: taskId,
    from_status: from,
    to_status: to,
    changed_by: user.id,
    changed_by_name: user.full_name,
    changed_at: new Date().toISOString(),
  });
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/* ---------------------------------------------------------------- tasks */

export const tasksApi = {
  /** GET /tasks */
  async list(params: TaskListParams = {}): Promise<Paginated<TaskWithRelations>> {
    const d = getDb();
    const {
      status,
      handyman_id,
      category,
      priority,
      date_from,
      date_to,
      search,
      ordering = "-created_at",
      page = 1,
      page_size = 25,
      unassigned,
    } = params;

    let rows = d.tasks.map(withRelations);

    if (status) rows = rows.filter((t) => t.status === status);
    if (category) rows = rows.filter((t) => t.category === category);
    if (priority) rows = rows.filter((t) => t.priority === priority);
    if (handyman_id) rows = rows.filter((t) => t.handyman_id === handyman_id);
    if (unassigned) rows = rows.filter((t) => !t.handyman_id);
    if (date_from)
      rows = rows.filter((t) => t.scheduled_date && t.scheduled_date >= date_from);
    if (date_to)
      rows = rows.filter((t) => t.scheduled_date && t.scheduled_date <= date_to);

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((t) =>
        [
          t.task_number,
          t.title,
          t.street_address,
          t.city,
          t.zip,
          t.customer?.full_name,
          t.handyman?.full_name,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }

    const desc = ordering.startsWith("-");
    const field = (desc ? ordering.slice(1) : ordering) as keyof TaskWithRelations;
    rows.sort((a, b) => {
      const av =
        field === "customer"
          ? a.customer?.full_name
          : field === "handyman"
            ? a.handyman?.full_name
            : a[field];
      const bv =
        field === "customer"
          ? b.customer?.full_name
          : field === "handyman"
            ? b.handyman?.full_name
            : b[field];
      const r = compare(av as unknown, bv as unknown);
      return desc ? -r : r;
    });

    const total = rows.length;
    const start = (page - 1) * page_size;

    return delay({
      items: rows.slice(start, start + page_size),
      total,
      page,
      page_size,
    });
  },

  /** GET /tasks/{id} */
  async get(id: string): Promise<TaskWithRelations> {
    const t = getDb().tasks.find((x) => x.id === id);
    if (!t) throw new ApiError("Task not found");
    return delay(withRelations(t));
  },

  /** POST /tasks */
  async create(payload: Partial<Task>): Promise<TaskWithRelations> {
    const d = getDb();
    const now = new Date().toISOString();
    const task: Task = {
      id: uid("t"),
      task_number: payload.task_number?.trim() || nextTaskNumber(),
      customer_id: payload.customer_id!,
      handyman_id: payload.handyman_id ?? null,
      title: payload.title ?? "",
      category: payload.category ?? "general",
      description: payload.description ?? "",
      priority: payload.priority ?? "normal",
      status: payload.handyman_id ? "assigned" : "new",
      street_address: payload.street_address ?? "",
      city: payload.city ?? "",
      state: payload.state ?? "",
      zip: payload.zip ?? "",
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      scheduled_date: payload.scheduled_date ?? null,
      time_window_start: payload.time_window_start ?? null,
      time_window_end: payload.time_window_end ?? null,
      estimated_duration_min: payload.estimated_duration_min ?? null,
      price: null,
      internal_notes: payload.internal_notes ?? "",
      created_by: (auth.me() ?? d.users[0]).id,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
    };

    // the backend does the geocoding (SPEC §5); in the demo we reuse the customer's coordinates
    if (task.latitude === null) {
      const sibling = d.tasks.find(
        (t) => t.customer_id === task.customer_id && t.latitude !== null,
      );
      task.latitude = sibling?.latitude ?? null;
      task.longitude = sibling?.longitude ?? null;
    }

    d.tasks.push(task);
    pushHistory(task.id, null, "new");
    if (task.status === "assigned") pushHistory(task.id, "new", "assigned");
    persist();
    return delay(withRelations(task));
  },

  /** PATCH /tasks/{id} */
  async update(id: string, payload: Partial<Task>): Promise<TaskWithRelations> {
    const d = getDb();
    const t = d.tasks.find((x) => x.id === id);
    if (!t) throw new ApiError("Task not found");
    if (TERMINAL_STATUSES.includes(t.status)) {
      // terminal tasks accept notes only (SPEC §4)
      const allowed: Partial<Task> = {
        internal_notes: payload.internal_notes ?? t.internal_notes,
      };
      Object.assign(t, allowed, { updated_at: new Date().toISOString() });
      persist();
      return delay(withRelations(t));
    }

    const hadHandyman = t.handyman_id;
    Object.assign(t, payload, { updated_at: new Date().toISOString() });

    // assigning / unassigning moves the status — SPEC §4
    if (!hadHandyman && t.handyman_id && t.status === "new") {
      t.status = "assigned";
      pushHistory(t.id, "new", "assigned");
    }
    if (hadHandyman && !t.handyman_id && t.status === "assigned") {
      t.status = "new";
      pushHistory(t.id, "assigned", "new");
    }

    persist();
    return delay(withRelations(t));
  },

  /** DELETE /tasks/{id} */
  async remove(id: string): Promise<void> {
    const d = getDb();
    d.tasks = d.tasks.filter((t) => t.id !== id);
    d.history = d.history.filter((h) => h.task_id !== id);
    persist();
    return delay(undefined);
  },

  /** POST /tasks/{id}/assign */
  async assign(id: string, handyman_id: string | null): Promise<TaskWithRelations> {
    const d = getDb();
    const t = d.tasks.find((x) => x.id === id);
    if (!t) throw new ApiError("Task not found");
    if (TERMINAL_STATUSES.includes(t.status))
      throw new ApiError("Task is closed and cannot be reassigned");

    const from = t.status;
    t.handyman_id = handyman_id;
    if (handyman_id && t.status === "new") t.status = "assigned";
    if (!handyman_id && t.status === "assigned") t.status = "new";
    t.updated_at = new Date().toISOString();
    if (from !== t.status) pushHistory(t.id, from, t.status);
    persist();
    return delay(withRelations(t));
  },

  /** POST /tasks/{id}/status */
  async setStatus(id: string, status: TaskStatus): Promise<TaskWithRelations> {
    const d = getDb();
    const t = d.tasks.find((x) => x.id === id);
    if (!t) throw new ApiError("Task not found");

    if (!STATUS_TRANSITIONS[t.status].includes(status))
      throw new ApiError(`Cannot move ${t.status} → ${status}`);
    if (status === "assigned" && !t.handyman_id)
      throw new ApiError("Assign a handyman first");

    const from = t.status;
    t.status = status;
    if (status === "in_progress") t.started_at = new Date().toISOString();
    if (status === "done") t.completed_at = new Date().toISOString();
    t.updated_at = new Date().toISOString();
    pushHistory(t.id, from, status);
    persist();
    return delay(withRelations(t));
  },

  /** GET /tasks/{id}/history */
  async history(id: string): Promise<TaskStatusHistoryEntry[]> {
    const rows = getDb()
      .history.filter((h) => h.task_id === id)
      .sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    return delay(rows);
  },
};

/* -------------------------------------------------------------- handymen */

export const handymenApi = {
  async list(params: { status?: string; search?: string } = {}) {
    let rows = getDb().handymen.slice();
    if (params.status) rows = rows.filter((h) => h.status === params.status);
    if (params.search) {
      const q = params.search.toLowerCase();
      rows = rows.filter((h) =>
        [h.full_name, h.email, h.phone, h.skills.join(" ")].some((v) =>
          v.toLowerCase().includes(q),
        ),
      );
    }
    rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return delay(rows);
  },

  async get(id: string): Promise<Handyman> {
    const h = getDb().handymen.find((x) => x.id === id);
    if (!h) throw new ApiError("Handyman not found");
    return delay(h);
  },

  async update(id: string, payload: Partial<Handyman>): Promise<Handyman> {
    const h = getDb().handymen.find((x) => x.id === id);
    if (!h) throw new ApiError("Handyman not found");
    Object.assign(h, payload, { updated_at: new Date().toISOString() });
    persist();
    return delay(h);
  },

  /** GET /handymen/{id}/tasks?date= */
  async tasksForDay(id: string, date: string): Promise<TaskWithRelations[]> {
    const rows = getDb()
      .tasks.filter((t) => t.handyman_id === id && t.scheduled_date === date)
      .map(withRelations)
      .sort((a, b) =>
        (a.time_window_start ?? "99:99").localeCompare(
          b.time_window_start ?? "99:99",
        ),
      );
    return delay(rows);
  },

  /** every task of a handyman, regardless of day */
  async tasks(id: string): Promise<TaskWithRelations[]> {
    const rows = getDb()
      .tasks.filter((t) => t.handyman_id === id)
      .map(withRelations)
      .sort((a, b) =>
        (b.scheduled_date ?? "").localeCompare(a.scheduled_date ?? ""),
      );
    return delay(rows);
  },
};

/* ------------------------------------------------------------- customers */

export const customersApi = {
  async list(params: { search?: string } = {}): Promise<Customer[]> {
    let rows = getDb().customers.slice();
    if (params.search) {
      const q = params.search.toLowerCase();
      rows = rows.filter((c) =>
        [c.full_name, c.phone, c.email, c.street_address, c.city, c.zip].some(
          (v) => v.toLowerCase().includes(q),
        ),
      );
    }
    rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return delay(rows);
  },

  async get(id: string): Promise<Customer> {
    const c = getDb().customers.find((x) => x.id === id);
    if (!c) throw new ApiError("Customer not found");
    return delay(c);
  },

  async create(payload: Partial<Customer>): Promise<Customer> {
    const d = getDb();
    const customer: Customer = {
      id: uid("c"),
      full_name: payload.full_name ?? "",
      phone: payload.phone ?? "",
      email: payload.email ?? "",
      street_address: payload.street_address ?? "",
      city: payload.city ?? "",
      state: payload.state ?? "",
      zip: payload.zip ?? "",
      notes: payload.notes ?? "",
      created_at: new Date().toISOString(),
    };
    d.customers.push(customer);
    persist();
    return delay(customer);
  },

  async update(id: string, payload: Partial<Customer>): Promise<Customer> {
    const c = getDb().customers.find((x) => x.id === id);
    if (!c) throw new ApiError("Customer not found");
    Object.assign(c, payload);
    persist();
    return delay(c);
  },

  /** GET /customers/{id}/tasks — work history for the site */
  async tasks(id: string): Promise<TaskWithRelations[]> {
    const rows = getDb()
      .tasks.filter((t) => t.customer_id === id)
      .map(withRelations)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return delay(rows);
  },
};

/* -------------------------------------------------- schedule / dashboard */

export const scheduleApi = {
  /** GET /schedule?date= */
  async day(date: string): Promise<ScheduleRow[]> {
    const d = getDb();
    const rows = d.handymen
      .filter((h) => h.status === "active")
      .map((handyman) => ({
        handyman,
        tasks: d.tasks
          .filter((t) => t.handyman_id === handyman.id && t.scheduled_date === date)
          .map(withRelations)
          .sort((a, b) =>
            (a.time_window_start ?? "99:99").localeCompare(
              b.time_window_start ?? "99:99",
            ),
          ),
      }));
    return delay(rows);
  },

  async unassigned(date?: string): Promise<TaskWithRelations[]> {
    const rows = getDb()
      .tasks.filter(
        (t) =>
          !t.handyman_id &&
          t.status === "new" &&
          (!date || !t.scheduled_date || t.scheduled_date === date),
      )
      .map(withRelations);
    return delay(rows);
  },
};

export const dashboardApi = {
  /** GET /dashboard/stats */
  async stats(): Promise<DashboardStats> {
    const d = getDb();
    const today = todayISO();
    const counts = {
      new: 0,
      assigned: 0,
      in_progress: 0,
      done: 0,
      cancelled: 0,
    } as Record<TaskStatus, number>;
    d.tasks.forEach((t) => (counts[t.status] += 1));

    return delay({
      counts,
      done_today: d.tasks.filter(
        (t) => t.status === "done" && t.completed_at?.slice(0, 10) === today,
      ).length,
      unassigned: d.tasks.filter((t) => !t.handyman_id && t.status === "new")
        .length,
      today: d.tasks
        .filter((t) => t.scheduled_date === today)
        .map(withRelations)
        .sort((a, b) =>
          (a.time_window_start ?? "99:99").localeCompare(
            b.time_window_start ?? "99:99",
          ),
        ),
      needs_assignment: d.tasks
        .filter((t) => !t.handyman_id && t.status === "new")
        .map(withRelations)
        .sort((a, b) =>
          (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999"),
        ),
    });
  },
};

export const demoApi = { reset: resetDb };
