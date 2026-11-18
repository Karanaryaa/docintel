"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DocumentMeta, InvoiceRecord } from "@/lib/types";
import { Sidebar } from "./sidebar";
import { ChatPanel } from "./chat";
import { InvoicesPanel } from "./invoices";
import { ComparePanel } from "./compare";
import { Viewer } from "./viewer";

type Tab = "ask" | "invoices" | "compare";

export type InvoiceWithName = InvoiceRecord & { documentName: string };

export function App() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithName[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ask");
  const [viewerPage, setViewerPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [d, i] = await Promise.all([
      fetch("/api/documents").then((r) => r.json()),
      fetch("/api/invoices").then((r) => r.json()),
    ]);
    setDocuments(d.documents ?? []);
    setInvoices(i.invoices ?? []);
  }, []);

  useEffect(() => {
    refresh();
    const wanted = new URLSearchParams(window.location.search).get("doc");
    if (wanted) setSelectedId(wanted);
  }, [refresh]);

  const selected = useMemo(
    () => documents.find((d) => d.id === selectedId) ?? null,
    [documents, selectedId]
  );

  async function upload(files: FileList | File[]) {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/documents", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          alert(json.error ?? "Upload failed");
          continue;
        }
        setSelectedId(json.document.id);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await refresh();
  }

  function openCitation(documentId: string, page: number) {
    setSelectedId(documentId);
    setViewerPage(page);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card px-4 py-3 md:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Papertrail</h1>
          <span className="text-xs uppercase tracking-[0.2em] text-ink-faint">
            AI Document Intelligence
          </span>
        </div>
        <nav className="flex gap-1 rounded-full border border-line bg-paper p-1 text-sm">
          {(
            [
              ["ask", "Ask"],
              ["invoices", `Invoices${invoices.length ? ` (${invoices.length})` : ""}`],
              ["compare", "Compare"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-1.5 transition ${
                tab === key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Sidebar
          documents={documents}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setViewerPage(1);
          }}
          onUpload={upload}
          onDelete={remove}
          busy={busy}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === "ask" && (
            <ChatPanel documents={documents} onOpenCitation={openCitation} />
          )}
          {tab === "invoices" && (
            <InvoicesPanel invoices={invoices} onOpenDocument={(id) => setSelectedId(id)} />
          )}
          {tab === "compare" && <ComparePanel documents={documents} onOpenCitation={openCitation} />}
        </main>

        {selected && (
          <Viewer document={selected} page={viewerPage} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}
