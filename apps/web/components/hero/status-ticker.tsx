"use client";

import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Component ──────────────────────────────────────────────────────────────
export function StatusTicker({ className }: { className?: string }) {
  // Duplicate content for seamless infinite scroll
  const items = [...STATUS_LABELS, ...STATUS_LABELS];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden border-t border-[var(--grid-line)]",
        "bg-[oklch(0.12_0.003_285/60%)]",
        className
      )}
    >
      {/* Gradient fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />

      {/* Scrolling content */}
      <div className="flex animate-[ticker-scroll_30s_linear_infinite] whitespace-nowrap py-2.5">
        {items.map((item, i) => (
          <span key={`${item.key}-${i}`} className="flex items-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {item.label}
            </span>
            <span className="mx-4 text-[8px] text-[var(--fire-orange)] opacity-50">
              &#9670;
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
