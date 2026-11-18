"use client";

import { useEffect, useState } from "react";
import type { DocumentMeta } from "@/lib/types";

interface Props {
  document: DocumentMeta;
  page: number;
  onClose: () => void;
}

export function Viewer({ document: doc, page, onClose }: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const src = `/api/documents/${doc.id}/page-image?page=${page}`;

  useEffect(() => {
    setState("loading");
  }, [src]);

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
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        {state === "loading" && <p className="p-6 text-sm text-ink-faint">Rendering page {page}…</p>}
        {state === "error" && (
          <p className="p-6 text-sm text-flag">Could not render this page. The file itself is still available for download.</p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt={`${doc.name}, page ${page}`}
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
          className={`mx-auto w-full max-w-[720px] rounded border border-line bg-white shadow-sm ${state === "ready" ? "" : "hidden"}`}
        />
      </div>
    </aside>
  );
}
