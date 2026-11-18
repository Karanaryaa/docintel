"use client";

import { useEffect, useRef } from "react";
import type { DocumentMeta } from "@/lib/types";

interface Props {
  document: DocumentMeta;
  page: number;
  onClose: () => void;
}

/**
 * Scrollable multi-page preview. Every page is a lazy <img> served by the
 * page-image route, so the whole document is scrollable while only visible
 * pages actually render. Citation clicks change `page`, which scrolls that
 * page into view.
 */
export function Viewer({ document: doc, page, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageCount = Math.max(1, doc.pageCount || 1);

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [page]);

  return (
    <aside className="fixed inset-0 z-30 flex flex-col bg-paper md:static md:z-auto md:w-[42%] md:min-w-[380px] md:border-l md:border-line md:bg-paper-deep/30">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-card px-4 py-2.5">
        <p className="min-w-0 truncate text-sm font-medium" title={doc.name}>
          {doc.name}
          <span className="ml-2 text-xs font-normal text-ink-faint">
            page {page} of {pageCount}
          </span>
        </p>
        <button
          onClick={onClose}
          aria-label="Close viewer"
          className="rounded px-2 py-0.5 text-ink-faint transition hover:text-ink"
        >
          ×
        </button>
      </div>
      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
          <figure key={p} data-page={p} className="mb-4 last:mb-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              src={`/api/documents/${doc.id}/page-image?page=${p}`}
              alt={`${doc.name}, page ${p}`}
              className="mx-auto w-full max-w-[720px] rounded border border-line bg-white shadow-sm"
            />
            <figcaption className="mt-1 text-center text-xs text-ink-faint">page {p}</figcaption>
          </figure>
        ))}
      </div>
    </aside>
  );
}
