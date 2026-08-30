"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHandymen } from "@/lib/api/hooks";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/lib/constants";
import { useUrlParams } from "@/hooks/use-url-params";

const ANY = "__any__";

export function TaskFilters() {
  const { get, set, setMany, clear, searchParams } = useUrlParams();
  const { data: handymen = [] } = useHandymen();
  const [search, setSearch] = useState(get("search"));

  // debounce search so the URL is not rewritten on every keystroke
  useEffect(() => {
    const id = setTimeout(() => {
      if (search !== get("search")) set("search", search || null);
    }, 300);
    return () => clearTimeout(id);
  }, [search, get, set]);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  const hasFilters = ["status", "category", "priority", "handyman_id", "search", "date_from", "date_to", "unassigned"].some(
    (k) => searchParams.get(k),
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
      <div className="relative min-w-[200px] flex-1 md:max-w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Task #, address, customer…"
          className="pl-8"
        />
      </div>

      <FilterSelect
        value={get("status")}
        placeholder="Status"
        options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        onChange={(v) => setMany({ status: v, unassigned: null })}
      />
      <FilterSelect
        value={get("category")}
        placeholder="Category"
        options={TASK_CATEGORIES.map((c) => ({
          value: c,
          label: CATEGORY_LABEL[c],
        }))}
        onChange={(v) => set("category", v)}
      />
      <FilterSelect
        value={get("priority")}
        placeholder="Priority"
        options={TASK_PRIORITIES.map((p) => ({
          value: p,
          label: PRIORITY_LABEL[p],
        }))}
        onChange={(v) => set("priority", v)}
      />
      <FilterSelect
        value={get("handyman_id")}
        placeholder="Handyman"
        width="w-[164px]"
        options={handymen.map((h) => ({ value: h.id, label: h.full_name }))}
        onChange={(v) => setMany({ handyman_id: v, unassigned: null })}
      />

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={get("date_from")}
          onChange={(e) => set("date_from", e.target.value || null)}
          className="w-[136px]"
          aria-label="Date from"
        />
        <span className="text-[12px] text-ink-muted">—</span>
        <Input
          type="date"
          value={get("date_to")}
          onChange={(e) => set("date_to", e.target.value || null)}
          className="w-[136px]"
          aria-label="Date to"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X /> Reset
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
  width = "w-[140px]",
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
  width?: string;
}) {
  return (
    <Select
      value={value || ANY}
      onValueChange={(v) => onChange(v === ANY ? null : v)}
    >
      <SelectTrigger className={width}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{placeholder}: any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
