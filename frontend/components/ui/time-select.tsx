"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clockTime } from "@/lib/format";

const EMPTY_TIME = "__none__";
const TIME_SLOTS = Array.from({ length: 61 }, (_, index) => {
  const minutes = 7 * 60 + index * 15;
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

export function TimeSelect({
  value,
  onChange,
  placeholder = "Select time",
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const normalized = value?.slice(0, 5) ?? "";
  const options =
    normalized && !TIME_SLOTS.includes(normalized)
      ? [...TIME_SLOTS, normalized].sort()
      : TIME_SLOTS;

  return (
    <Select
      value={normalized || EMPTY_TIME}
      onValueChange={(next) => onChange(next === EMPTY_TIME ? "" : next)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_TIME}>{placeholder}</SelectItem>
        {options.map((time) => (
          <SelectItem key={time} value={time}>
            {clockTime(time)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
