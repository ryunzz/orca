"use client";

import { useRef, useEffect, useState } from "react";
import { AnimationPhase } from "@/lib/animation-phases";
import { DATA_POINTS, type DataPoint } from "@/lib/constants";
import {
  AnnotationCallout,
  type AnnotationStatus,
} from "./annotation-callout";

// ─── Helpers ────────────────────────────────────────────────────────────────
function getStatus(phase: AnimationPhase): AnnotationStatus {
  switch (phase) {
    case AnimationPhase.FULL_BURN:
      return "critical";
    case AnimationPhase.SUPPRESSION:
      return "warning";
    case AnimationPhase.RECOVERY:
      return "contained";
    default:
      return "clear";
  }
}

function getDataValue(
  point: DataPoint,
  phase: AnimationPhase,
  progress: number
): number {
  switch (phase) {
    case AnimationPhase.IGNITION:
      return Math.round(point.baseValue * progress);
    case AnimationPhase.FULL_BURN:
      return Math.round(
        point.baseValue + (point.criticalValue - point.baseValue) * progress
      );
    case AnimationPhase.SUPPRESSION:
      return Math.round(
        point.criticalValue +
          (point.containedValue - point.criticalValue) * progress
      );
    case AnimationPhase.RECOVERY:
      return point.containedValue;
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface DataOverlayProps {
  phase: AnimationPhase;
  progress: number;
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function DataOverlay({ phase, progress, className }: DataOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showAnnotations =
    phase === AnimationPhase.FULL_BURN ||
    phase === AnimationPhase.SUPPRESSION ||
    phase === AnimationPhase.RECOVERY;

  const showGrid =
    phase !== AnimationPhase.RECOVERY || progress < 0.5;

  const status = getStatus(phase);

  return (
    <div ref={containerRef} className={className}>
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="pointer-events-none"
      >
        {/* Scanning grid */}
        {showGrid && dimensions.width > 0 && (
          <g opacity={phase === AnimationPhase.IGNITION ? 0.3 : 0.5}>
            {/* Horizontal lines */}
            {Array.from({ length: 8 }, (_, i) => {
              const y = (dimensions.height / 8) * (i + 1);
              return (
                <line
                  key={`h-${i}`}
                  x1={0}
                  y1={y}
                  x2={dimensions.width}
                  y2={y}
                  stroke="var(--grid-line)"
                  strokeWidth={0.5}
                />
              );
            })}
            {/* Vertical lines */}
            {Array.from({ length: 8 }, (_, i) => {
              const x = (dimensions.width / 8) * (i + 1);
              return (
                <line
                  key={`v-${i}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={dimensions.height}
                  stroke="var(--grid-line)"
                  strokeWidth={0.5}
                />
              );
            })}

            {/* Corner brackets (HUD viewfinder) */}
            <g stroke="var(--annotation-line)" strokeWidth={1.5} fill="none">
              {/* Top-left */}
              <path d="M 8 24 L 8 8 L 24 8" />
              {/* Top-right */}
              <path
                d={`M ${dimensions.width - 24} 8 L ${dimensions.width - 8} 8 L ${dimensions.width - 8} 24`}
              />
              {/* Bottom-left */}
              <path
                d={`M 8 ${dimensions.height - 24} L 8 ${dimensions.height - 8} L 24 ${dimensions.height - 8}`}
              />
              {/* Bottom-right */}
              <path
                d={`M ${dimensions.width - 24} ${dimensions.height - 8} L ${dimensions.width - 8} ${dimensions.height - 8} L ${dimensions.width - 8} ${dimensions.height - 24}`}
              />
            </g>
          </g>
        )}

        {/* Scanning reticle */}
        {showGrid && dimensions.width > 0 && (
          <g
            className="origin-center animate-[spin_20s_linear_infinite]"
            style={{
              transformOrigin: `${dimensions.width / 2}px ${dimensions.height / 2}px`,
            }}
            opacity={0.3}
          >
            <circle
              cx={dimensions.width / 2}
              cy={dimensions.height / 2}
              r={Math.min(dimensions.width, dimensions.height) * 0.2}
              stroke="var(--annotation-line)"
              strokeWidth={0.5}
              fill="none"
              strokeDasharray="6 4"
            />
            <line
              x1={dimensions.width / 2}
              y1={dimensions.height / 2 - Math.min(dimensions.width, dimensions.height) * 0.23}
              x2={dimensions.width / 2}
              y2={dimensions.height / 2 - Math.min(dimensions.width, dimensions.height) * 0.17}
              stroke="var(--annotation-line)"
              strokeWidth={1}
            />
            <line
              x1={dimensions.width / 2}
              y1={dimensions.height / 2 + Math.min(dimensions.width, dimensions.height) * 0.17}
              x2={dimensions.width / 2}
              y2={dimensions.height / 2 + Math.min(dimensions.width, dimensions.height) * 0.23}
              stroke="var(--annotation-line)"
              strokeWidth={1}
            />
          </g>
        )}

        {/* Bounding box around fire zone */}
        {(phase === AnimationPhase.FULL_BURN ||
          phase === AnimationPhase.SUPPRESSION) &&
          dimensions.width > 0 && (
            <g>
              <rect
                x={dimensions.width * 0.18}
                y={dimensions.height * 0.15}
                width={dimensions.width * 0.64}
                height={dimensions.height * 0.65}
                stroke={
                  phase === AnimationPhase.FULL_BURN
                    ? "var(--fire-red)"
                    : "var(--status-contained)"
                }
                strokeWidth={1.5}
                fill="none"
                strokeDasharray="8 4"
                opacity={0.6}
                rx={2}
              />
              {/* Corner L-brackets on bounding box */}
              <g
                stroke={
                  phase === AnimationPhase.FULL_BURN
                    ? "var(--fire-orange)"
                    : "var(--status-contained)"
                }
                strokeWidth={2}
                fill="none"
                opacity={0.8}
              >
                {/* Top-left */}
                <path
                  d={`M ${dimensions.width * 0.18} ${dimensions.height * 0.15 + 16} L ${dimensions.width * 0.18} ${dimensions.height * 0.15} L ${dimensions.width * 0.18 + 16} ${dimensions.height * 0.15}`}
                />
                {/* Top-right */}
                <path
                  d={`M ${dimensions.width * 0.82 - 16} ${dimensions.height * 0.15} L ${dimensions.width * 0.82} ${dimensions.height * 0.15} L ${dimensions.width * 0.82} ${dimensions.height * 0.15 + 16}`}
                />
                {/* Bottom-left */}
                <path
                  d={`M ${dimensions.width * 0.18} ${dimensions.height * 0.8 - 16} L ${dimensions.width * 0.18} ${dimensions.height * 0.8} L ${dimensions.width * 0.18 + 16} ${dimensions.height * 0.8}`}
                />
                {/* Bottom-right */}
                <path
                  d={`M ${dimensions.width * 0.82 - 16} ${dimensions.height * 0.8} L ${dimensions.width * 0.82} ${dimensions.height * 0.8} L ${dimensions.width * 0.82} ${dimensions.height * 0.8 - 16}`}
                />
              </g>
            </g>
          )}

        {/* Prediction arcs (spread direction) */}
        {phase === AnimationPhase.FULL_BURN && dimensions.width > 0 && (
          <g opacity={0.4}>
            <path
              d={`M ${dimensions.width * 0.55} ${dimensions.height * 0.25} Q ${dimensions.width * 0.7} ${dimensions.height * 0.15} ${dimensions.width * 0.8} ${dimensions.height * 0.1}`}
              stroke="var(--fire-amber)"
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="3 5"
            />
            <path
              d={`M ${dimensions.width * 0.55} ${dimensions.height * 0.25} Q ${dimensions.width * 0.65} ${dimensions.height * 0.35} ${dimensions.width * 0.78} ${dimensions.height * 0.35}`}
              stroke="var(--fire-orange)"
              strokeWidth={1}
              fill="none"
              strokeDasharray="3 5"
            />
          </g>
        )}

        {/* Annotation callouts */}
        {showAnnotations &&
          dimensions.width > 0 &&
          DATA_POINTS.map((point, i) => (
            <AnnotationCallout
              key={point.id}
              label={point.label}
              value={getDataValue(point, phase, progress)}
              unit={point.unit}
              status={status}
              x={point.x}
              y={point.y}
              connectorX={point.connectorX}
              connectorY={point.connectorY}
              delay={i * 0.12}
              visible={showAnnotations}
              containerWidth={dimensions.width}
              containerHeight={dimensions.height}
            />
          ))}
      </svg>
    </div>
  );
}
