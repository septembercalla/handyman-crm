"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Handyman, HandymanStatus, TaskCategory } from "@/lib/types";
import { CATEGORY_LABEL, TASK_CATEGORIES } from "@/lib/constants";
import {
  useCreateHandyman,
  useCurrentUser,
  useUpdateHandyman,
} from "@/lib/api/hooks";
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

export function HandymanDialog({
  handyman,
  children,
}: {
  handyman?: Handyman;
  children: ReactNode;
}) {
  const createHandyman = useCreateHandyman();
  const updateHandyman = useUpdateHandyman();
  const { data: currentUser } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(handyman?.full_name ?? "");
  const [phone, setPhone] = useState(handyman?.phone ?? "");
  const [email, setEmail] = useState(handyman?.email ?? "");
  const [skills, setSkills] = useState<TaskCategory[]>(handyman?.skills ?? []);
  const [status, setStatus] = useState<HandymanStatus>(handyman?.status ?? "active");
  const [color, setColor] = useState(handyman?.color ?? DEFAULT_COLOR);
  const [notes, setNotes] = useState(handyman?.notes ?? "");
  const [streetAddress, setStreetAddress] = useState(handyman?.street_address ?? "");
  const [city, setCity] = useState(handyman?.city ?? "");
  const [state, setState] = useState(handyman?.state ?? "");
  const [zip, setZip] = useState(handyman?.zip ?? "");
  const [defaultPayoutPercent, setDefaultPayoutPercent] = useState(
    handyman?.default_payout_percent ?? "60.00",
  );
  const busy = createHandyman.isPending || updateHandyman.isPending;

  function reset() {
    setFullName(handyman?.full_name ?? "");
    setPhone(handyman?.phone ?? "");
    setEmail(handyman?.email ?? "");
    setSkills(handyman?.skills ?? []);
    setStatus(handyman?.status ?? "active");
    setColor(handyman?.color ?? DEFAULT_COLOR);
    setNotes(handyman?.notes ?? "");
    setStreetAddress(handyman?.street_address ?? "");
    setCity(handyman?.city ?? "");
    setState(handyman?.state ?? "");
    setZip(handyman?.zip ?? "");
    setDefaultPayoutPercent(handyman?.default_payout_percent ?? "60.00");
  }

  function toggleSkill(skill: TaskCategory, checked: boolean) {
    setSkills((current) =>
      checked ? [...current, skill] : current.filter((item) => item !== skill),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      currentUser?.role === "admin" &&
      (!/^\d+(\.\d{1,2})?$/.test(defaultPayoutPercent.trim()) ||
        Number(defaultPayoutPercent) < 0 ||
        Number(defaultPayoutPercent) > 100)
    ) {
      toast.error("Default payout must be between 0% and 100%");
      return;
    }
    const payload = {
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      skills,
      status,
      color,
      notes: notes.trim(),
      street_address: streetAddress.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      zip: zip.trim(),
      ...(currentUser?.role === "admin"
        ? { default_payout_percent: defaultPayoutPercent.trim() }
        : {}),
    };

    try {
      if (handyman) {
        await updateHandyman.mutateAsync({ id: handyman.id, payload });
        toast.success("Handyman updated");
      } else {
        await createHandyman.mutateAsync(payload);
        toast.success("Handyman added");
      }
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save handyman");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={handyman ? "Edit handyman" : "Add handyman"}
        description={
          handyman
            ? "Update the worker profile, availability and home location."
            : "Create a worker profile for scheduling and task assignment."
        }
        className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto"
      >
        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`handyman-full-name-${handyman?.id ?? "new"}`}>
                Full name
              </Label>
              <Input
                id={`handyman-full-name-${handyman?.id ?? "new"}`}
                autoFocus
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                minLength={2}
                maxLength={255}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`handyman-phone-${handyman?.id ?? "new"}`}>Phone</Label>
              <Input
                id={`handyman-phone-${handyman?.id ?? "new"}`}
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={64}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`handyman-email-${handyman?.id ?? "new"}`}>Email</Label>
              <Input
                id={`handyman-email-${handyman?.id ?? "new"}`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={255}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`handyman-status-${handyman?.id ?? "new"}`}>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as HandymanStatus)}
              >
                <SelectTrigger id={`handyman-status-${handyman?.id ?? "new"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="space-y-2 rounded-[4px] border border-line p-3">
            <legend className="px-1 text-[12px] font-medium text-ink">Home address</legend>
            <p className="text-[11px] text-ink-muted">
              Private worker location for future route start/end planning.
            </p>
            <div className="space-y-1">
              <Label htmlFor={`handyman-street-${handyman?.id ?? "new"}`}>
                Street address
              </Label>
              <Input
                id={`handyman-street-${handyman?.id ?? "new"}`}
                value={streetAddress}
                onChange={(event) => setStreetAddress(event.target.value)}
                maxLength={255}
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-[1fr_70px_96px] gap-3">
              <div className="space-y-1">
                <Label htmlFor={`handyman-city-${handyman?.id ?? "new"}`}>City</Label>
                <Input
                  id={`handyman-city-${handyman?.id ?? "new"}`}
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  maxLength={128}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`handyman-state-${handyman?.id ?? "new"}`}>State</Label>
                <Input
                  id={`handyman-state-${handyman?.id ?? "new"}`}
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  maxLength={2}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`handyman-zip-${handyman?.id ?? "new"}`}>ZIP</Label>
                <Input
                  id={`handyman-zip-${handyman?.id ?? "new"}`}
                  value={zip}
                  onChange={(event) => setZip(event.target.value)}
                  maxLength={16}
                />
              </div>
            </div>
          </fieldset>

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

          {currentUser?.role === "admin" && (
            <div className="max-w-[220px] space-y-1">
              <Label htmlFor={`handyman-payout-${handyman?.id ?? "new"}`}>
                Default payout %
              </Label>
              <div className="relative">
                <Input
                  id={`handyman-payout-${handyman?.id ?? "new"}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  value={defaultPayoutPercent}
                  onChange={(event) => setDefaultPayoutPercent(event.target.value)}
                  className="pr-7"
                  required
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">
                  %
                </span>
              </div>
              <p className="text-[11px] leading-4 text-ink-muted">
                Copied into each task when this handyman is assigned.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor={`handyman-notes-${handyman?.id ?? "new"}`}>
              Internal notes
            </Label>
            <Textarea
              id={`handyman-notes-${handyman?.id ?? "new"}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Vehicle, tools, service area, specialties, availability, or client communication notes"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : handyman ? "Save changes" : "Add handyman"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
