"use client";

import type {
  Customer,
  Handyman,
  Task,
  TaskStatusHistoryEntry,
  User,
} from "@/lib/types";
import { CUSTOMERS, DEMO_USER, HANDYMEN, buildTasks } from "./seed";

/**
 * Client-side store for the demo data.
 * Lives in memory and mirrors to localStorage so edits survive a reload.
 * Once the backend exists this module goes away with the mock transport.
 */

const STORAGE_KEY = "handyman-crm:db:v1";

export interface Db {
  users: User[];
  handymen: Handyman[];
  customers: Customer[];
  tasks: Task[];
  history: TaskStatusHistoryEntry[];
  /** the date the tasks were generated for — the seed is rebuilt when the day changes */
  seededFor: string;
}

let db: Db | null = null;

function freshDb(): Db {
  const { tasks, history } = buildTasks();
  return {
    users: [DEMO_USER],
    handymen: structuredClone(HANDYMEN),
    customers: structuredClone(CUSTOMERS),
    tasks,
    history,
    seededFor: new Date().toISOString().slice(0, 10),
  };
}

export function getDb(): Db {
  if (db) return db;

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Db;
        if (parsed?.seededFor === new Date().toISOString().slice(0, 10)) {
          db = parsed;
          return db;
        }
      }
    } catch {
      // corrupted cache — just rebuild the seed
    }
  }

  db = freshDb();
  persist();
  return db;
}

export function persist() {
  if (typeof window === "undefined" || !db) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // quota exceeded — not critical for the demo
  }
}

export function resetDb() {
  db = freshDb();
  persist();
}

export function nextTaskNumber(): string {
  const d = getDb();
  const max = d.tasks.reduce((acc, t) => {
    const n = Number(t.task_number.replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 1000);
  return `T-${max + 1}`;
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
