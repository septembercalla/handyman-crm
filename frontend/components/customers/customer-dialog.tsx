"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import type { Customer } from "@/lib/types";
import { useUpdateCustomer } from "@/lib/api/hooks";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function valuesFrom(customer: Customer) {
  return {
    full_name: customer.full_name,
    phone: customer.phone,
    email: customer.email,
    street_address: customer.street_address,
    city: customer.city,
    state: customer.state,
    zip: customer.zip,
    notes: customer.notes,
  };
}

export function CustomerDialog({
  customer,
  children,
}: {
  customer: Customer;
  children: ReactNode;
}) {
  const update = useUpdateCustomer();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => valuesFrom(customer));

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = form.full_name.trim();
    if (!fullName) {
      toast.error("Cannot save: Full name is required");
      return;
    }

    try {
      await update.mutateAsync({
        id: customer.id,
        payload: {
          full_name: fullName,
          phone: form.phone.trim(),
          email: form.email.trim(),
          street_address: form.street_address.trim(),
          city: form.city.trim(),
          state: form.state.trim().toUpperCase(),
          zip: form.zip.trim(),
          notes: form.notes.trim(),
        },
      });
      toast.success("Customer updated");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update customer");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setForm(valuesFrom(customer));
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="Edit customer"
        description="Update contact details and the default address for future tasks."
        className="max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Field label="Full name" htmlFor="customer-full-name" required className="col-span-2">
              <Input
                id="customer-full-name"
                autoFocus
                value={form.full_name}
                onChange={(event) => setField("full_name", event.target.value)}
                maxLength={255}
                required
              />
            </Field>
            <Field label="Phone" htmlFor="customer-phone">
              <Input
                id="customer-phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                maxLength={64}
              />
            </Field>
            <Field label="Email" htmlFor="customer-email">
              <Input
                id="customer-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                maxLength={255}
              />
            </Field>
            <Field label="Street address" htmlFor="customer-street" className="col-span-2">
              <Input
                id="customer-street"
                value={form.street_address}
                onChange={(event) => setField("street_address", event.target.value)}
                maxLength={255}
              />
            </Field>
            <Field label="City" htmlFor="customer-city">
              <Input
                id="customer-city"
                value={form.city}
                onChange={(event) => setField("city", event.target.value)}
                maxLength={128}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State" htmlFor="customer-state">
                <Input
                  id="customer-state"
                  value={form.state}
                  onChange={(event) => setField("state", event.target.value)}
                  maxLength={2}
                />
              </Field>
              <Field label="ZIP" htmlFor="customer-zip">
                <Input
                  id="customer-zip"
                  value={form.zip}
                  onChange={(event) => setField("zip", event.target.value)}
                  maxLength={16}
                />
              </Field>
            </div>
            <Field label="Site notes" htmlFor="customer-notes" className="col-span-2">
              <Textarea
                id="customer-notes"
                value={form.notes}
                onChange={(event) => setField("notes", event.target.value)}
                placeholder="Access details, preferences, pets, or other notes"
              />
            </Field>
            <p className="col-span-2 text-[11px] leading-4 text-ink-muted">
              Existing tasks keep their saved job addresses. The updated address becomes the default
              for new tasks.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
