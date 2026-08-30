"use client";

import type {
  Customer,
  DashboardStats,
  Handyman,
  Paginated,
  ScheduleRow,
  ScheduleTravel,
  Task,
  TaskListParams,
  TaskStatus,
  TaskStatusHistoryEntry,
  TaskWithRelations,
  User,
} from "@/lib/types";

/**
 * API client. Talks to the FastAPI backend described in SPEC §5 — same paths,
 * same query params, same response shapes.
 *
 * Auth lives in httpOnly cookies, so every request goes out with
 * `credentials: "include"`; nothing token-related is kept in JS.
 */

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    public detail: string,
    public status: number,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, QueryValue>;
  /** login and /auth/me handle 401 themselves instead of bouncing to /login */
  skipAuthRedirect?: boolean;
  /** internal guard against retry loops after an unsuccessful refresh */
  retryAuth?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // empty filters are simply absent from the URL
    if (value === undefined || value === null || value === "" || value === false) {
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  window.location.replace("/login");
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params, skipAuthRedirect, retryAuth = true } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}${buildQuery(params)}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the API. Is the backend running?", 0);
  }

  if (
    response.status === 401 &&
    retryAuth &&
    path !== "/auth/login" &&
    path !== "/auth/refresh"
  ) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, { ...options, retryAuth: false });
  }

  if (response.status === 401 && !skipAuthRedirect) {
    redirectToLogin();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : Array.isArray(payload?.detail)
          ? // FastAPI validation errors come back as a list
            payload.detail
              .map((e: { loc?: unknown[]; msg?: string }) =>
                [e.loc?.slice(1).join("."), e.msg].filter(Boolean).join(": "),
              )
              .join("; ")
          : `Request failed with ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  return payload as T;
}

/* ------------------------------------------------------------------ auth */

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export const auth = {
  /** POST /auth/login — the response also sets the httpOnly cookies */
  async login(email: string, password: string, remember = true): Promise<User> {
    const data = await request<TokenPair>("/auth/login", {
      method: "POST",
      body: { email: email.trim(), password, remember },
      skipAuthRedirect: true,
    });
    return data.user;
  },

  async logout(): Promise<void> {
    await request<void>("/auth/logout", { method: "POST", skipAuthRedirect: true });
  },

  /** GET /auth/me — null when there is no valid session; the caller decides what to do */
  async me(): Promise<User | null> {
    try {
      return await request<User>("/auth/me", { skipAuthRedirect: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async refresh(): Promise<User | null> {
    try {
      const data = await request<TokenPair>("/auth/refresh", {
        method: "POST",
        skipAuthRedirect: true,
      });
      return data.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await request<void>("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    });
  },

  async completeFirstLogin(newPassword: string): Promise<User> {
    return request<User>("/auth/complete-first-login", {
      method: "POST",
      body: { new_password: newPassword },
    });
  },
};

/* ----------------------------------------------------------------- users */

export const usersApi = {
  list(): Promise<User[]> {
    return request<User[]>("/users");
  },

  create(payload: { email: string; full_name: string; password: string }): Promise<User> {
    return request<User>("/users", { method: "POST", body: payload });
  },

  update(
    id: string,
    payload: Partial<Pick<User, "email" | "full_name" | "is_active">>,
  ): Promise<User> {
    return request<User>(`/users/${id}`, { method: "PATCH", body: payload });
  },

  resetPassword(id: string, password: string): Promise<User> {
    return request<User>(`/users/${id}/reset-password`, {
      method: "POST",
      body: { password },
    });
  },

  remove(id: string): Promise<void> {
    return request<void>(`/users/${id}`, { method: "DELETE" });
  },
};

/* ---------------------------------------------------------------- tasks */

export const tasksApi = {
  /** GET /tasks */
  list(params: TaskListParams = {}): Promise<Paginated<TaskWithRelations>> {
    return request<Paginated<TaskWithRelations>>("/tasks", {
      params: {
        status: params.status,
        category: params.category,
        priority: params.priority,
        handyman_id: params.handyman_id,
        date_from: params.date_from,
        date_to: params.date_to,
        search: params.search,
        unassigned: params.unassigned,
        ordering: params.ordering ?? "-created_at",
        page: params.page ?? 1,
        page_size: params.page_size ?? 25,
      },
    });
  },

  get(id: string): Promise<TaskWithRelations> {
    return request<TaskWithRelations>(`/tasks/${id}`);
  },

  create(payload: Partial<Task>): Promise<TaskWithRelations> {
    return request<TaskWithRelations>("/tasks", { method: "POST", body: payload });
  },

  update(id: string, payload: Partial<Task>): Promise<TaskWithRelations> {
    return request<TaskWithRelations>(`/tasks/${id}`, { method: "PATCH", body: payload });
  },

  remove(id: string): Promise<void> {
    return request<void>(`/tasks/${id}`, { method: "DELETE" });
  },

  /** POST /tasks/{id}/assign */
  assign(id: string, handyman_id: string | null): Promise<TaskWithRelations> {
    return request<TaskWithRelations>(`/tasks/${id}/assign`, {
      method: "POST",
      body: { handyman_id },
    });
  },

  /** POST /tasks/{id}/status */
  setStatus(id: string, status: TaskStatus): Promise<TaskWithRelations> {
    return request<TaskWithRelations>(`/tasks/${id}/status`, {
      method: "POST",
      body: { status },
    });
  },

  history(id: string): Promise<TaskStatusHistoryEntry[]> {
    return request<TaskStatusHistoryEntry[]>(`/tasks/${id}/history`);
  },
};

/* -------------------------------------------------------------- handymen */

export const handymenApi = {
  list(params: { status?: string; search?: string } = {}): Promise<Handyman[]> {
    return request<Handyman[]>("/handymen", {
      params: { status: params.status, search: params.search },
    });
  },

  get(id: string): Promise<Handyman> {
    return request<Handyman>(`/handymen/${id}`);
  },

  create(payload: Partial<Handyman>): Promise<Handyman> {
    return request<Handyman>("/handymen", { method: "POST", body: payload });
  },

  update(id: string, payload: Partial<Handyman>): Promise<Handyman> {
    return request<Handyman>(`/handymen/${id}`, { method: "PATCH", body: payload });
  },

  /** GET /handymen/{id}/tasks?date= — the day's stops, ordered by time */
  tasksForDay(id: string, date: string): Promise<TaskWithRelations[]> {
    return request<TaskWithRelations[]>(`/handymen/${id}/tasks`, { params: { date } });
  },

  /** every task of a handyman, regardless of day */
  tasks(id: string): Promise<TaskWithRelations[]> {
    return request<TaskWithRelations[]>(`/handymen/${id}/tasks`);
  },
};

/* ------------------------------------------------------------- customers */

export const customersApi = {
  list(params: { search?: string } = {}): Promise<Customer[]> {
    return request<Customer[]>("/customers", { params: { search: params.search } });
  },

  get(id: string): Promise<Customer> {
    return request<Customer>(`/customers/${id}`);
  },

  create(payload: Partial<Customer>): Promise<Customer> {
    return request<Customer>("/customers", { method: "POST", body: payload });
  },

  update(id: string, payload: Partial<Customer>): Promise<Customer> {
    return request<Customer>(`/customers/${id}`, { method: "PATCH", body: payload });
  },

  /** GET /customers/{id}/tasks — work history for the site */
  tasks(id: string): Promise<TaskWithRelations[]> {
    return request<TaskWithRelations[]>(`/customers/${id}/tasks`);
  },
};

/* -------------------------------------------------- schedule / dashboard */

export const scheduleApi = {
  /** GET /schedule?date= */
  day(date: string): Promise<ScheduleRow[]> {
    return request<ScheduleRow[]>("/schedule", { params: { date } });
  },

  /** GET /schedule/unassigned — the pool the dispatcher drags from */
  unassigned(date?: string): Promise<TaskWithRelations[]> {
    return request<TaskWithRelations[]>("/schedule/unassigned", { params: { date } });
  },

  travel(date: string): Promise<ScheduleTravel> {
    return request<ScheduleTravel>("/schedule/travel", { params: { date } });
  },
};

export const dashboardApi = {
  stats(): Promise<DashboardStats> {
    return request<DashboardStats>("/dashboard/stats");
  },
};
