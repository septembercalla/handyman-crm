"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { longDate, toISODate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function fromISO(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  minDate,
  compact = false,
  ariaLabel,
  className,
  todayDate,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Server business date; null means it is still loading. Omit for existing behavior. */
  todayDate?: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);
  const minimum = minDate ? fromISO(minDate) : null;
  const today = todayDate === undefined ? todayISO() : todayDate;
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStart(selected ?? fromISO(today ?? "") ?? new Date(2000, 0, 1)),
  );

  useEffect(() => {
    if (selected) setVisibleMonth(monthStart(selected));
    else if (todayDate) setVisibleMonth(monthStart(fromISO(todayDate)!));
  }, [value, todayDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const first = monthStart(visibleMonth);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "w-full justify-start px-2.5 font-normal",
            !value && "text-ink-muted",
            className,
          )}
        >
          <CalendarDays className="text-ink-muted" />
          {value
            ? compact && selected
              ? selected.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : longDate(value)
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[292px] p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            aria-label="Previous month"
            onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <p className="text-[13px] font-semibold text-ink">
            {visibleMonth.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            aria-label="Next month"
            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((day) => (
            <span key={day} className="pb-1.5 text-[10px] font-medium text-ink-muted">
              {day}
            </span>
          ))}
          {days.map((day) => {
            const iso = toISODate(day);
            const outsideMonth = day.getMonth() !== visibleMonth.getMonth();
            const disabled = minimum ? day < minimum : false;
            const isSelected = iso === value;
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                aria-label={longDate(iso)}
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(iso);
                  setOpen(false);
                }}
                className={cn(
                  "mx-auto flex size-8 items-center justify-center rounded-[4px] text-[12px] text-ink hover:bg-hover",
                  outsideMonth && "text-ink-muted/55",
                  isToday && !isSelected && "font-semibold text-brand",
                  isSelected && "bg-brand font-semibold text-white hover:bg-brand",
                  disabled && "cursor-not-allowed opacity-25 hover:bg-transparent",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!today}
            onClick={() => {
              if (!today) return;
              onChange(today);
              setOpen(false);
            }}
          >
            Today
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
