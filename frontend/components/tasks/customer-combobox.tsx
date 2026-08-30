"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCreateCustomer, useCustomers } from "@/lib/api/hooks";
import { cityLine } from "@/lib/format";
import type { Customer } from "@/lib/types";

/**
 * Find an existing customer or create a new one right from the form (SPEC §6.4).
 */
export function CustomerCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (customer: Customer | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data: customers = [] } = useCustomers();
  const selected = customers.find((c) => c.id === value) ?? null;

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="listbox"
            className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-[4px] border border-line bg-surface px-2.5 text-left text-[13px] hover:bg-hover"
          >
            <span className="truncate">
              {selected ? (
                selected.full_name
              ) : (
                <span className="text-ink-muted/80">Select customer…</span>
              )}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-ink-muted" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0">
          <Command>
            <CommandInput placeholder="Name, phone, address…" />
            <CommandList>
              <CommandEmpty>Nothing found</CommandEmpty>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.full_name} ${c.phone} ${c.street_address} ${c.city}`}
                  onSelect={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-medium">{c.full_name}</span>
                    {value === c.id && (
                      <Check className="size-3.5 text-brand" strokeWidth={3} />
                    )}
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {c.street_address}, {cityLine(c)}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="icon"
        title="New customer"
        onClick={() => setCreating(true)}
      >
        <Plus />
      </Button>

      <NewCustomerDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(c) => onChange(c)}
      />
    </div>
  );
}

function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (c: Customer) => void;
}) {
  const create = useCreateCustomer();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    street_address: "",
    city: "",
    state: "",
    zip: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.full_name.trim()) return;
    const c = await create.mutateAsync(form);
    onCreated(c);
    onOpenChange(false);
    setForm({
      full_name: "",
      phone: "",
      email: "",
      street_address: "",
      city: "",
      state: "",
      zip: "",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New customer"
        description="Created right away and filled into the task"
      >
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Full name" required className="col-span-2">
            <Input value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Street address" className="col-span-2">
            <Input value={form.street_address} onChange={set("street_address")} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set("city")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State">
              <Input value={form.state} onChange={set("state")} maxLength={2} />
            </Field>
            <Field label="ZIP">
              <Input value={form.zip} onChange={set("zip")} />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!form.full_name.trim() || create.isPending}
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
