"use client";

import type { DocumentMeta } from "@/lib/types";

interface Props {
  document: DocumentMeta;
  page: number;
  onClose: () => void;
}

export function Viewer({ document: doc, page, onClose }: Props) {
  return (
    <aside className="fixed inset-0 z-30 flex flex-col bg-paper md:static md:z-auto md:w-[42%] md:min-w-[380px] md:border-l md:border-line md:bg-paper-deep/30">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-card px-4 py-2.5">
        <p className="min-w-0 truncate text-sm font-medium" title={doc.name}>
          {doc.name}
          <span className="ml-2 text-xs font-normal text-ink-faint">page {page}</span>
        </p>
        <button
          onClick={onClose}
          aria-label="Close viewer"
          className="rounded px-2 py-0.5 text-ink-faint transition hover:text-ink"
        >
          ×
        </button>
      </div>
      <iframe
        key={`${doc.id}:${page}`}
        src={`/api/documents/${doc.id}/file#page=${page}&toolbar=0&navpanes=0`}
        title={`Preview of ${doc.name}`}
        className="min-h-0 flex-1"
      />
    </aside>
  );
}
