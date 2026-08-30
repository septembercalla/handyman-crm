import type { Customer, Task } from "./types";

export function fullAddress(
  o: Pick<Task, "street_address" | "city" | "state" | "zip">,
) {
  const tail = [o.city, o.state].filter(Boolean).join(", ");
  return [o.street_address, [tail, o.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export function cityLine(
  o: Pick<Customer, "city" | "state" | "zip">,
): string {
  const tail = [o.city, o.state].filter(Boolean).join(", ");
  return [tail, o.zip].filter(Boolean).join(" ");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** "2026-08-30" → "Aug 30" */
export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "2026-08-30" → "Sun, Aug 30, 2026" */
export function longDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function dateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "09:00" → "9:00 AM" */
export function clockTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return "—";
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

export function timeWindow(
  start: string | null,
  end: string | null,
): string {
  if (!start && !end) return "—";
  if (start && end) return `${clockTime(start)} – ${clockTime(end)}`;
  return clockTime(start ?? end);
}

export function duration(min: number | null | undefined): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
