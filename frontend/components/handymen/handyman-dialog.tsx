"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { HandymanStatus, TaskCategory } from "@/lib/types";
import { CATEGORY_LABEL, TASK_CATEGORIES } from "@/lib/constants";
import { useCreateHandyman } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_COLOR = "#1A6FE0";
const HANDYMAN_COLORS = [
  "#1A6FE0",
  "#1F8A4C",
  "#D97706",
  "#7C3AED",
  "#DC2626",
  "#0891B2",
];

export function HandymanDialog({ children }: { children: React.ReactNode }) {
  const createHandyman = useCreateHandyman();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [skills, setSkills] = useState<TaskCategory[]>([]);
  const [hourlyRate, setHourlyRate] = useState("");
  const [status, setStatus] = useState<HandymanStatus>("active");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [notes, setNotes] = useState("");

  function reset() {
    setFullName("");
    setPhone("");
    setEmail("");
    setSkills([]);
    setHourlyRate("");
    setStatus("active");
    setColor(DEFAULT_COLOR);
    setNotes("");
  }

  function toggleSkill(skill: TaskCategory, checked: boolean) {
    setSkills((current) =>
      checked ? [...current, skill] : current.filter((item) => item !== skill),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const parsedRate = hourlyRate === "" ? null : Number(hourlyRate);
    if (parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate < 0)) {
      toast.error("Hourly rate must be zero or greater");
      return;
    }

    try {
      await createHandyman.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        skills,
        hourly_rate: parsedRate,
        status,
        color,
        notes: notes.trim(),
      });
      toast.success("Handyman added");
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add handyman");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="Add handyman"
        description="Create a worker profile for scheduling and task assignment."
        className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto"
      >
        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="handyman-full-name">Full name</Label>
              <Input
                id="handyman-full-name"
                autoFocus
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                minLength={2}
                maxLength={255}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="handyman-phone">Phone</Label>
              <Input
                id="handyman-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={64}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="handyman-email">Email</Label>
              <Input
                id="handyman-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={255}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="handyman-rate">Hourly rate</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">
                  $
                </span>
                <Input
                  id="handyman-rate"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(event.target.value)}
                  className="pl-6"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium text-ink">Skills</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-[4px] border border-line p-3 sm:grid-cols-4">
              {TASK_CATEGORIES.map((skill) => (
                <label
                  key={skill}
                  className="flex cursor-pointer items-center gap-2 text-[13px] text-ink"
                >
                  <Checkbox
                    checked={skills.includes(skill)}
                    onCheckedChange={(checked) => toggleSkill(skill, checked === true)}
                  />
                  {CATEGORY_LABEL[skill]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="handyman-status">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as HandymanStatus)}>
                <SelectTrigger id="handyman-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Schedule color</Label>
              <div className="flex h-9 items-center gap-2 rounded-[4px] border border-line px-2.5">
                {HANDYMAN_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Use color ${option}`}
                    aria-pressed={color === option}
                    onClick={() => setColor(option)}
                    className="size-5 rounded-full border-2 border-surface outline outline-1 outline-transparent aria-pressed:outline-ink"
                    style={{ backgroundColor: option }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="handyman-notes">Internal notes</Label>
            <Textarea
              id="handyman-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Vehicle, tools, service area, specialties, availability, or client communication notes"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createHandyman.isPending}>
              {createHandyman.isPending ? "Adding…" : "Add handyman"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
