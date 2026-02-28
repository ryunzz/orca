"use client";

import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Status Types ───────────────────────────────────────────────────────────
export type AnnotationStatus = "critical" | "warning" | "contained" | "clear";

const STATUS_COLOR_MAP: Record<AnnotationStatus, string> = {
  critical: "text-[var(--fire-red)]",
  warning: "text-[var(--fire-orange)]",
  contained: "text-[var(--status-contained)]",
  clear: "text-[var(--status-clear)]",
};

const STATUS_DOT_MAP: Record<AnnotationStatus, string> = {
  critical: "bg-[var(--fire-red)]",
  warning: "bg-[var(--fire-orange)]",
  contained: "bg-[var(--status-contained)]",
  clear: "bg-[var(--status-clear)]",
};

// ─── Props ──────────────────────────────────────────────────────────────────
interface AnnotationCalloutProps {
  label: string;
  value: number;
  unit: string;
  status: AnnotationStatus;
  x: number;
  y: number;
  connectorX: number;
  connectorY: number;
  delay?: number;
  visible: boolean;
  containerWidth: number;
  containerHeight: number;
}

// ─── Number Ticker ──────────────────────────────────────────────────────────
function useAnimatedNumber(target: number, duration: number = 600): number {
  const [current, setCurrent] = useState(target);
  const rafRef = useRef<number>(0);
  const startRef = useRef({ value: target, time: 0 });

  useEffect(() => {
    const start = performance.now();
    startRef.current = { value: current, time: start };
    const from = current;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setCurrent(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return current;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function AnnotationCallout({
  label,
  value,
  unit,
  status,
  x,
  y,
  connectorX,
  connectorY,
  delay = 0,
  visible,
  containerWidth,
  containerHeight,
}: AnnotationCalloutProps) {
  const displayValue = useAnimatedNumber(visible ? value : 0);

  const px = x * containerWidth;
  const py = y * containerHeight;
  const cx = connectorX * containerWidth;
  const cy = connectorY * containerHeight;

  if (!visible) return null;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      {/* Connector line */}
      <line
        x1={cx}
        y1={cy}
        x2={px + 60}
        y2={py + 12}
        stroke="var(--annotation-line)"
        strokeWidth={1}
        strokeDasharray="4 3"
        className="animate-[dash_2s_linear_infinite]"
      />

      {/* Pulse dot at connector point */}
      <circle
        cx={cx}
        cy={cy}
        r={4}
        className={cn("animate-[pulse-ring_2s_ease-in-out_infinite]")}
        fill="var(--fire-orange)"
        opacity={0.8}
      />
      <circle cx={cx} cy={cy} r={2} fill="var(--fire-orange)" />

      {/* Callout card as foreignObject */}
      <foreignObject x={px} y={py} width={140} height={52}>
        <div
          className={cn(
            "flex flex-col gap-0.5 rounded border px-2 py-1",
            "border-[var(--annotation-line)] bg-[var(--annotation-bg)]",
            "backdrop-blur-sm"
          )}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                STATUS_DOT_MAP[status]
              )}
            />
            <span
              className={cn(
                "font-mono text-xs font-semibold tabular-nums",
                STATUS_COLOR_MAP[status]
              )}
            >
              {displayValue}
              {unit}
            </span>
          </div>
        </div>
      </foreignObject>
    </motion.g>
  );
}
