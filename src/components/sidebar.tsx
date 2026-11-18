"use client";

import { useRef, useState } from "react";
import type { DocumentMeta } from "@/lib/types";
import { WorkingIndicator } from "./working-indicator";

interface Props {
  documents: DocumentMeta[];
  selectedId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onUpload: (files: FileList | File[]) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ documents, selectedId, busy, onSelect, onUpload, onDelete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <aside className="flex max-h-[46vh] w-full shrink-0 flex-col border-b border-line bg-paper-deep/40 md:max-h-none md:w-72 md:border-b-0 md:border-r">
      <div
        className={`m-3 rounded-xl border-2 border-dashed p-4 text-center text-sm transition ${
          dragging ? "border-accent bg-accent/5" : "border-line bg-card"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <WorkingIndicator label="Processing your document" />
        ) : (
          <p className="font-medium">Drop PDFs here</p>
        )}
        <p className="mt-1 text-xs text-ink-faint">text or scanned, up to 25 MB</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-3 rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition hover:bg-ink-soft disabled:opacity-50"
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && onUpload(e.target.files)}
        />
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {documents.length === 0 && (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-faint">
            No documents yet. Upload contracts, reports or invoices, then ask questions with
            page-level citations.
          </p>
        )}
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(doc.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(doc.id)}
                className={`w-full cursor-pointer rounded-xl border p-3 text-left transition ${
                  selectedId === doc.id
                    ? "border-accent bg-card shadow-sm"
                    : "border-line bg-card hover:border-ink-faint"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium" title={doc.name}>
                    {doc.name}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(doc.id);
                    }}
                    aria-label={`Delete ${doc.name}`}
                    className="shrink-0 rounded px-1 text-ink-faint transition hover:text-flag"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                  <StatusBadge doc={doc} />
                  {doc.kind === "invoice" && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent-deep">
                      invoice
                    </span>
                  )}
                  {doc.pageCount > 0 && <span className="text-ink-faint">{doc.pageCount}p</span>}
                  {doc.ocrPages.length > 0 && (
                    <span className="text-ink-faint">OCR {doc.ocrPages.length}p</span>
                  )}
                </div>
                {doc.status === "error" && (
                  <p className="mt-1 text-[11px] text-flag">{doc.error}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function StatusBadge({ doc }: { doc: DocumentMeta }) {
  if (doc.status === "processing" || doc.status === "uploaded") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 font-medium text-warn">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
        processing
      </span>
    );
  }
  if (doc.status === "error") {
    return <span className="rounded-full bg-flag/10 px-2 py-0.5 font-medium text-flag">failed</span>;
  }
  return <span className="rounded-full bg-ok/10 px-2 py-0.5 font-medium text-ok">ready</span>;
}
