"use client";

import type { InvoiceWithName } from "./app";
import type { InvoiceFlag } from "@/lib/types";

interface Props {
  invoices: InvoiceWithName[];
  pending: Array<{ id: string; name: string }>;
  retrying: boolean;
  onRetry: () => void;
  onOpenDocument: (id: string) => void;
}

function money(n: number | null, currency: string | null): string {
  if (n === null) return "—";
  const prefix = currency === "INR" || currency === "₹" ? "₹" : currency === "USD" || currency === "$" ? "$" : (currency ?? "") + " ";
  return `${prefix}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function InvoicesPanel({ invoices, pending, retrying, onRetry, onOpenDocument }: Props) {
  if (invoices.length === 0) {
    if (pending.length > 0) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h2 className="font-display text-3xl font-semibold">Extraction pending</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {pending.length === 1 ? "1 invoice is" : `${pending.length} invoices are`} uploaded and processed,
              but field extraction has not run yet - it needs the AI key to be configured.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm">
              {pending.map((d) => (
                <li key={d.id} className="rounded-lg border border-line bg-card px-3 py-2 text-left">
                  {d.name}
                  <span className="ml-2 text-xs text-ink-faint">waiting for extraction</span>
                </li>
              ))}
            </ul>
            <button
              onClick={onRetry}
              disabled={retrying}
              className="mt-5 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
            >
              {retrying ? "Extracting…" : "Retry extraction"}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="font-display text-3xl font-semibold">Invoice checks</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Upload an invoice and Papertrail extracts vendor, numbers, dates, taxes and totals,
            then flags anything that does not add up - checked with real arithmetic, not vibes.
          </p>
        </div>
      </div>
    );
  }

  const flagged = invoices.filter((r) => r.flags.some((f) => f.severity === "error"));

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold">Extracted invoices</h2>
          <p className="text-sm text-ink-soft">
            {invoices.length} processed
            {flagged.length > 0 && <span className="ml-2 font-medium text-flag">{flagged.length} with errors</span>}
          </p>
        </div>

        <div className="space-y-4">
          {invoices.map((inv) => (
            <article key={inv.documentId} className="rounded-xl border border-line bg-card p-5">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <button
                  onClick={() => onOpenDocument(inv.documentId)}
                  className="font-medium text-accent-deep underline-offset-2 hover:underline"
                >
                  {inv.documentName}
                </button>
                <span className="text-xs text-ink-faint">
                  {new Date(inv.extractedAt).toLocaleString()}
                </span>
              </header>

              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                <Field label="Vendor" value={inv.fields.vendorName} />
                <Field label="Invoice #" value={inv.fields.invoiceNumber} />
                <Field label="Date" value={inv.fields.invoiceDate} />
                <Field label="Due" value={inv.fields.dueDate} />
                <Field label="Subtotal" value={money(inv.fields.subtotal, inv.fields.currency)} />
                <Field label="Tax" value={money(inv.fields.taxAmount, inv.fields.currency)} />
                <Field label="Total" value={money(inv.fields.total, inv.fields.currency)} strong />
                <Field label="Items" value={String(inv.fields.lineItems.length)} />
              </dl>

              {inv.flags.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                  {inv.flags.map((f, i) => (
                    <FlagRow key={i} flag={f} />
                  ))}
                </ul>
              )}
              {inv.flags.length === 0 && (
                <p className="mt-4 border-t border-line pt-3 text-sm font-medium text-ok">
                  All consistency checks pass.
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className={strong ? "font-semibold" : ""}>{value ?? "—"}</dd>
    </div>
  );
}

function FlagRow({ flag }: { flag: InvoiceFlag }) {
  const color =
    flag.severity === "error" ? "text-flag" : flag.severity === "warning" ? "text-warn" : "text-ink-soft";
  const icon = flag.severity === "error" ? "✕" : flag.severity === "warning" ? "!" : "i";
  return (
    <li className={`flex items-start gap-2 text-sm ${color}`}>
      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold">
        {icon}
      </span>
      {flag.message}
    </li>
  );
}
