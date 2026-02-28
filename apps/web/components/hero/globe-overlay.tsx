"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TARGET_LOCATION } from "@/lib/globe-constants";
import type { GlobePhaseInfo } from "@/lib/globe-state-machine";

// ─── Constants ──────────────────────────────────────────────────────────────

const RETICLE_SIZE = 24;
const SCOPE_SIZE = 160;
const BRACKET_LEN = 16;

// ─── Props ──────────────────────────────────────────────────────────────────

interface GlobeOverlayProps {
  className?: string;
  phaseInfo: GlobePhaseInfo;
  onGlobeClick: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GlobeOverlay({
  className,
  phaseInfo,
  onGlobeClick,
}: GlobeOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [mouse, setMouse] = useState({ x: -100, y: -100 });
  const isIdle = phaseInfo.state === "IDLE";
  const showScope =
    phaseInfo.state === "SCOPE" || phaseInfo.state === "ZOOM";

  // Track container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track mouse position relative to container
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isIdle) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [isIdle]
  );

  const handleMouseLeave = useCallback(() => {
    setMouse({ x: -100, y: -100 });
  }, []);

  // Container is always square (aspect-ratio: 1/1), so w ≈ h
  const cx = dims.w / 2;
  const cy = dims.h / 2;

  // Scope opacity based on phase
  const scopeOpacity =
    phaseInfo.state === "SCOPE"
      ? Math.min(phaseInfo.progress * 3, 1) // Fade in during first third
      : phaseInfo.state === "ZOOM"
        ? Math.max(1 - phaseInfo.progress * 2, 0) // Fade out during zoom
        : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 cursor-crosshair",
        !isIdle && "pointer-events-none",
        className
      )}
      onClick={onGlobeClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* ─── Hover Glow (brightens land under cursor) ─────────── */}
      {isIdle && mouse.x > 0 && mouse.y > 0 && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            left: mouse.x - 80,
            top: mouse.y - 80,
            width: 160,
            height: 160,
            background:
              "radial-gradient(circle, rgba(255, 180, 80, 0.18) 0%, rgba(242, 118, 35, 0.06) 40%, transparent 70%)",
            mixBlendMode: "screen",
          }}
        />
      )}

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${dims.w || 1} ${dims.h || 1}`}
        xmlns="http://www.w3.org/2000/svg"
      >


        {/* ─── Hover Reticle (IDLE only) ──────────────────────────── */}
        {isIdle && mouse.x > 0 && mouse.y > 0 && (
          <g
            transform={`translate(${mouse.x}, ${mouse.y})`}
            opacity={0.8}
            style={{ pointerEvents: "none" }}
          >
            {/* Crosshair lines */}
            <line
              x1={-RETICLE_SIZE}
              y1={0}
              x2={-6}
              y2={0}
              stroke="var(--fire-red)"
              strokeWidth={1}
            />
            <line
              x1={6}
              y1={0}
              x2={RETICLE_SIZE}
              y2={0}
              stroke="var(--fire-red)"
              strokeWidth={1}
            />
            <line
              x1={0}
              y1={-RETICLE_SIZE}
              x2={0}
              y2={-6}
              stroke="var(--fire-red)"
              strokeWidth={1}
            />
            <line
              x1={0}
              y1={6}
              x2={0}
              y2={RETICLE_SIZE}
              stroke="var(--fire-red)"
              strokeWidth={1}
            />

            {/* Corner brackets */}
            {[
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(([dx, dy]) => (
              <polyline
                key={`${dx}-${dy}`}
                points={`${dx * RETICLE_SIZE},${dy * (RETICLE_SIZE - 6)} ${dx * RETICLE_SIZE},${dy * RETICLE_SIZE} ${dx * (RETICLE_SIZE - 6)},${dy * RETICLE_SIZE}`}
                fill="none"
                stroke="var(--fire-red)"
                strokeWidth={1}
              />
            ))}

            {/* Center pulse dot */}
            <circle r={2} fill="var(--fire-red)">
              <animate
                attributeName="r"
                values="2;4;2"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="1;0.4;1"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        )}

        {/* ─── Scope HUD (SCOPE + ZOOM) ──────────────────────────── */}
        {showScope && (
          <g opacity={scopeOpacity}>
            {/* Scope square (dashed) */}
            <rect
              x={cx - SCOPE_SIZE / 2}
              y={cy - SCOPE_SIZE / 2}
              width={SCOPE_SIZE}
              height={SCOPE_SIZE}
              fill="none"
              stroke="var(--fire-red)"
              strokeWidth={1}
              strokeDasharray="6 4"
            />

            {/* L-bracket corners */}
            {[
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(([dx, dy]) => {
              const bx = cx + (dx * SCOPE_SIZE) / 2;
              const by = cy + (dy * SCOPE_SIZE) / 2;
              return (
                <polyline
                  key={`scope-${dx}-${dy}`}
                  points={`${bx},${by - dy * BRACKET_LEN} ${bx},${by} ${bx + dx * BRACKET_LEN},${by}`}
                  fill="none"
                  stroke="var(--fire-red)"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Center crosshair (small) */}
            <line
              x1={cx - 8}
              y1={cy}
              x2={cx + 8}
              y2={cy}
              stroke="var(--fire-red)"
              strokeWidth={0.5}
              opacity={0.6}
            />
            <line
              x1={cx}
              y1={cy - 8}
              x2={cx}
              y2={cy + 8}
              stroke="var(--fire-red)"
              strokeWidth={0.5}
              opacity={0.6}
            />

            {/* Data readouts via foreignObject */}
            <foreignObject
              x={cx - SCOPE_SIZE / 2 - 140}
              y={cy - 30}
              width={120}
              height={60}
            >
              <div className="font-mono text-[10px] leading-tight text-[var(--fire-orange)]">
                <div className="mb-1 text-[8px] uppercase tracking-[0.2em] text-[var(--fire-red)]">
                  target
                </div>
                <div>
                  {TARGET_LOCATION.LAT.toFixed(2)}°N
                </div>
                <div>
                  {Math.abs(TARGET_LOCATION.LNG).toFixed(2)}°W
                </div>
              </div>
            </foreignObject>

            <foreignObject
              x={cx + SCOPE_SIZE / 2 + 20}
              y={cy - 30}
              width={120}
              height={60}
            >
              <div className="font-mono text-[10px] leading-tight text-[var(--fire-orange)]">
                <div className="mb-1 text-[8px] uppercase tracking-[0.2em] text-[var(--fire-red)]">
                  sector
                </div>
                <div>{TARGET_LOCATION.SECTOR}</div>
                <div>{TARGET_LOCATION.LABEL}</div>
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
    </div>
  );
}

