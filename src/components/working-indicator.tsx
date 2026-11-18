"use client";

import { useEffect, useState } from "react";

const TIPS = [
  "Answers come with page-level citations you can click to inspect.",
  "Scanned pages are read with a vision model, so uploads can take a minute.",
  "Invoice totals, taxes and duplicates are checked automatically.",
  "The Compare tab reads two or more documents side by side.",
  "You can scope a question to one document from the dropdown below.",
];

/**
 * Honest "working" state: a spinner, elapsed time and rotating usage tips.
 * No fabricated progress or fake percentages - only what we know: time passed.
 */
export function WorkingIndicator({ label, compact = false }: { label: string; compact?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const [tip, setTip] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (reduced || compact) return;
    const rot = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4000);
    return () => clearInterval(rot);
  }, [reduced, compact]);

  return (
    <div role="status" aria-live="polite" className={compact ? "text-sm" : "text-sm"}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full bg-accent ${reduced ? "" : "animate-pulse"}`}
          aria-hidden="true"
        />
        <span className="font-medium">{label}</span>
        <span className="text-xs text-ink-faint">{elapsed}s</span>
      </div>
      {!compact && (
        <>
          <p className="mt-2 text-xs text-ink-faint">{TIPS[tip]}</p>
          {elapsed >= 45 && (
            <p className="mt-2 text-xs text-ink-faint">
              Still working. Large scanned files take longer - if this runs past two minutes,
              delete the document and try the upload again.
            </p>
          )}
        </>
      )}
    </div>
  );
}
