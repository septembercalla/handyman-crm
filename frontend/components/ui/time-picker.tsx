"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const EMPTY_TIME = "__none__";
const TIME_SLOTS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    label: `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
  };
});

export function TimePicker({ value, onChange, ariaLabel, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value || EMPTY_TIME} disabled={disabled}
      onValueChange={(next) => onChange(next === EMPTY_TIME ? "" : next)}>
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder="Select time" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_TIME}>Select time / Clear</SelectItem>
        {TIME_SLOTS.map((slot) => (
          <SelectItem key={slot.value} value={slot.value}
            className="data-[state=checked]:bg-brand/10 data-[state=checked]:font-semibold data-[state=checked]:text-brand">
            {slot.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
