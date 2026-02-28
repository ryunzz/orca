"use client";

import React, { useEffect, useRef } from "react";
import {
  INCIDENT_NODES,
  GLOBE_SCREEN_RADIUS_FACTOR,
  projectToScreen,
  TARGET_LOCATION,
  INITIAL_THETA,
} from "@/lib/globe-constants";
import {
  HERO_ALERTS_FADEOUT_MS,
  HERO_UC_MARKER_DELAY_MS,
  HERO_UC_MARKER_FADEIN_MS,
  type GlobeTransitionState,
} from "@/lib/transition-constants";

// ─── Constants ──────────────────────────────────────────────────────────────

const NODE_COUNT = INCIDENT_NODES.length;

/** Card dimensions for positioning */
const CARD_WIDTH = 220;
const CARD_HEIGHT = 140;

/** Smooth visibility lerp rate per frame (~300ms fade at 60fps) */
const VISIBILITY_LERP_RATE = 0.05;

/** Depth-based visibility thresholds */
const VZ_FRONT_THRESHOLD = 0.15;
const VZ_FADE_RANGE = 0.15;

/** Screen-space margin factors (fraction of globe radius from center) */
const SCREEN_LEFT_MARGIN_FACTOR = 0.85;
const SCREEN_RIGHT_MARGIN_FACTOR = 0.55;
const SCREEN_TOP_MARGIN_FACTOR = 0.80;
const SCREEN_BOTTOM_MARGIN_FACTOR = 0.70;

/** Pixel distance over which edge fading occurs */
const EDGE_FADE_PX = 40;

/** Disaster imagery for each location (GIPHY direct media URLs) */
const DISASTER_IMAGES: Record<string, { gif: string; event: string }> = {
  "NEW YORK": {
    gif: "https://media3.giphy.com/media/cTniZImA9Tx2E/giphy.gif",
    event: "HURRICANE SANDY · 2012",
  },
  "LONDON": {
    gif: "https://media0.giphy.com/media/145kmtMGH93B2bsSby/giphy.gif",
    event: "GRENFELL TOWER · 2017",
  },
  "TOKYO": {
    gif: "https://media0.giphy.com/media/Awu0pJrgpYRmTwPjhj/giphy.gif",
    event: "TŌHOKU EARTHQUAKE · 2011",
  },
  "SYDNEY": {
    gif: "https://media4.giphy.com/media/eIV3qJt69ZsH9xSbWe/giphy.gif",
    event: "BLACK SUMMER · 2020",
  },
  "LOS ANGELES": {
    gif: "https://media4.giphy.com/media/jRqtr0ykAu9sM0eEph/giphy.gif",
    event: "PALISADES FIRE · 2025",
  },
  "MUMBAI": {
    gif: "https://media0.giphy.com/media/7uWf15xyHwU3S/giphy.gif",
    event: "MAHARASHTRA FLOODS · 2005",
  },
  "SAHARA": {
    gif: "https://media0.giphy.com/media/BfKu8KLcbVmiA/giphy.gif",
    event: "DUST STORM · 2024",
  },
  "BOGOTÁ": {
    gif: "https://media0.giphy.com/media/AVrBSLEaz5ziKK0y67/giphy.gif",
    event: "NEVADO DEL RUIZ · 1985",
  },
  "HAWAII": {
    gif: "https://media0.giphy.com/media/cNkpY1SI4Ra8FbA1tl/giphy.gif",
    event: "LAHAINA WILDFIRE · 2023",
  },
  "JAKARTA": {
    gif: "https://media0.giphy.com/media/eaGYPsglb5X0I/giphy.gif",
    event: "INDIAN OCEAN TSUNAMI · 2004",
  },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface Projected {
  x: number;
  y: number;
  visible: boolean;
  vz: number;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface GlobeAlertsProps {
  phiRef: React.RefObject<number>;
  containerWidth: number;
  containerHeight: number;
  transitionRef: React.RefObject<GlobeTransitionState>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** GLSL-style smoothstep interpolation */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Compute continuous [0, 1] visibility for a projected node based on:
 * 1. Depth (vz) — front-facing fade
 * 2. Screen X — asymmetric left/right bounds
 * 3. Screen Y — top/bottom bounds
 */
function computeNodeVisibility(
  proj: Projected,
  centerX: number,
  centerY: number,
  globeRadius: number
): number {
  // Depth-based fade: fully visible when vz > threshold + range
  const vzFactor = smoothstep(
    VZ_FRONT_THRESHOLD,
    VZ_FRONT_THRESHOLD + VZ_FADE_RANGE,
    proj.vz
  );

  // Screen X bounds (asymmetric — right side cuts earlier)
  const leftBound = centerX - globeRadius * SCREEN_LEFT_MARGIN_FACTOR;
  const rightBound = centerX + globeRadius * SCREEN_RIGHT_MARGIN_FACTOR;
  const xFadeLeft = smoothstep(leftBound, leftBound + EDGE_FADE_PX, proj.x);
  const xFadeRight = smoothstep(rightBound, rightBound - EDGE_FADE_PX, proj.x);
  const xFactor = xFadeLeft * xFadeRight;

  // Screen Y bounds
  const topBound = centerY - globeRadius * SCREEN_TOP_MARGIN_FACTOR;
  const bottomBound = centerY + globeRadius * SCREEN_BOTTOM_MARGIN_FACTOR;
  const yFadeTop = smoothstep(topBound, topBound + EDGE_FADE_PX, proj.y);
  const yFadeBottom = smoothstep(bottomBound, bottomBound - EDGE_FADE_PX, proj.y);
  const yFactor = yFadeTop * yFadeBottom;

  return vzFactor * xFactor * yFactor;
}

/** Position a card centered above the marker, clamped to container bounds */
function getCardPosition(
  proj: Projected,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  let cardX = proj.x - CARD_WIDTH / 2;
  let cardY = proj.y - CARD_HEIGHT - 20;

  cardX = Math.max(8, Math.min(containerWidth - CARD_WIDTH - 8, cardX));
  cardY = Math.max(8, Math.min(containerHeight - CARD_HEIGHT - 8, cardY));

  return { x: cardX, y: cardY };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GlobeAlerts({
  phiRef,
  containerWidth,
  containerHeight,
  transitionRef,
}: GlobeAlertsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Per-node smooth visibility values
  const visibilityRef = useRef<number[]>(new Array(NODE_COUNT).fill(0));

  // Cached DOM element arrays (queried once on mount)
  const markerElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const cardElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const ucMarkerElRef = useRef<HTMLDivElement | null>(null);

  const globeRadius = Math.min(containerWidth, containerHeight) * GLOBE_SCREEN_RADIUS_FACTOR;
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;

  // Preload all GIF images on mount
  useEffect(() => {
    Object.values(DISASTER_IMAGES).forEach(({ gif }) => {
      const img = new Image();
      img.src = gif;
    });
  }, []);

  // Cache DOM elements after mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    markerElsRef.current = Array.from({ length: NODE_COUNT }, (_, i) =>
      container.querySelector<HTMLDivElement>(`[data-marker="${i}"]`)
    );
    cardElsRef.current = Array.from({ length: NODE_COUNT }, (_, i) =>
      container.querySelector<HTMLDivElement>(`[data-card="${i}"]`)
    );
    ucMarkerElRef.current = container.querySelector<HTMLDivElement>("[data-uc-marker]");
  }, []);

  useEffect(() => {
    if (containerWidth === 0 || containerHeight === 0) return;

    const container = containerRef.current;
    if (!container) return;

    // Re-query elements in case the effect re-runs after layout change
    markerElsRef.current = Array.from({ length: NODE_COUNT }, (_, i) =>
      container.querySelector<HTMLDivElement>(`[data-marker="${i}"]`)
    );
    cardElsRef.current = Array.from({ length: NODE_COUNT }, (_, i) =>
      container.querySelector<HTMLDivElement>(`[data-card="${i}"]`)
    );
    ucMarkerElRef.current = container.querySelector<HTMLDivElement>("[data-uc-marker]");

    const tick = () => {
      const phi = phiRef.current ?? 0;
      const transition = transitionRef.current;
      const currentTheta = transition?.theta ?? INITIAL_THETA;

      // Compute alerts multiplier (fades alerts out during exit)
      let alertsMultiplier = 1;
      if (transition && transition.phase !== "idle") {
        const elapsed = Date.now() - transition.exitStartedAt;
        alertsMultiplier = Math.max(0, 1 - elapsed / HERO_ALERTS_FADEOUT_MS);
      }

      for (let i = 0; i < NODE_COUNT; i++) {
        const node = INCIDENT_NODES[i];
        const proj = projectToScreen(
          node.lat, node.lng,
          phi, currentTheta,
          centerX, centerY, globeRadius
        );

        // Compute target visibility and lerp toward it
        const targetVis = computeNodeVisibility(proj, centerX, centerY, globeRadius);
        let vis = visibilityRef.current[i];
        vis += (targetVis - vis) * VISIBILITY_LERP_RATE;
        if (vis < 0.01) vis = 0;
        if (vis > 0.99) vis = 1;
        visibilityRef.current[i] = vis;

        // Apply alerts fadeout multiplier
        const finalVis = vis * alertsMultiplier;

        // Update marker DOM
        const marker = markerElsRef.current[i];
        if (marker) {
          marker.style.transform = `translate(${proj.x}px, ${proj.y}px) translate(-50%, -50%)`;
          marker.style.opacity = String(finalVis);
        }

        // Update card DOM
        const card = cardElsRef.current[i];
        if (card) {
          const cardPos = getCardPosition(
            proj, containerWidth, containerHeight
          );
          card.style.transform = `translate(${cardPos.x}px, ${cardPos.y}px)`;
          card.style.opacity = String(finalVis);
        }
      }

      // UC target marker — position and fade in during exit
      const ucEl = ucMarkerElRef.current;
      if (ucEl) {
        if (transition && transition.phase !== "idle") {
          const elapsed = Date.now() - transition.exitStartedAt;
          const ucProj = projectToScreen(
            TARGET_LOCATION.LAT, TARGET_LOCATION.LNG,
            phi, currentTheta,
            centerX, centerY, globeRadius
          );
          ucEl.style.transform = `translate(${ucProj.x}px, ${ucProj.y}px) translate(-50%, -50%)`;

          const fadeStart = HERO_UC_MARKER_DELAY_MS;
          const fadeEnd = fadeStart + HERO_UC_MARKER_FADEIN_MS;
          let ucOpacity = 0;
          if (elapsed >= fadeEnd) {
            ucOpacity = 1;
          } else if (elapsed >= fadeStart) {
            ucOpacity = (elapsed - fadeStart) / HERO_UC_MARKER_FADEIN_MS;
          }
          ucEl.style.opacity = String(ucOpacity);
        } else {
          ucEl.style.opacity = "0";
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    containerWidth,
    containerHeight,
    centerX,
    centerY,
    globeRadius,
    phiRef,
    transitionRef,
  ]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 hidden lg:block"
    >
      {INCIDENT_NODES.map((node, i) => {
        const disaster = DISASTER_IMAGES[node.label];
        return (
          <React.Fragment key={node.label}>
            {/* Pulsing marker */}
            <div
              data-marker={i}
              className="absolute left-0 top-0"
              style={{ opacity: 0, willChange: "transform, opacity" }}
            >
              <PulsingMarker />
            </div>

            {/* Alert card */}
            <div
              data-card={i}
              className="absolute left-0 top-0"
              style={{ opacity: 0, willChange: "transform, opacity" }}
            >
              <AlertCard node={node} disaster={disaster} />
            </div>
          </React.Fragment>
        );
      })}

      {/* UC target marker — visible only during exit transition */}
      <div
        data-uc-marker
        className="absolute left-0 top-0"
        style={{ opacity: 0, willChange: "transform, opacity" }}
      >
        <PulsingMarker />
      </div>
    </div>
  );
}

// ─── Pulsing Marker ─────────────────────────────────────────────────────────

function PulsingMarker() {
  return (
    <div className="relative h-6 w-6">
      {/* Outer pulse ring 1 */}
      <span
        className="absolute inset-0 rounded-full border-2 border-[var(--fire-orange)]"
        style={{
          animation: "marker-pulse 2s ease-out infinite",
        }}
      />
      {/* Outer pulse ring 2 (offset) */}
      <span
        className="absolute inset-0 rounded-full border border-[var(--fire-orange)]"
        style={{
          animation: "marker-pulse 2s ease-out infinite 0.7s",
        }}
      />
      {/* Core dot */}
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--fire-orange)] shadow-[0_0_12px_var(--fire-orange),0_0_24px_var(--fire-orange)]" />
    </div>
  );
}

// ─── Alert Card ─────────────────────────────────────────────────────────────

function AlertCard({
  node,
  disaster,
}: {
  node: (typeof INCIDENT_NODES)[number];
  disaster: { gif: string; event: string } | undefined;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 4,
        border: "1px solid oklch(1 0 0 / 10%)",
        background: "oklch(0.08 0.005 285 / 70%)",
        backdropFilter: "blur(16px)",
        boxShadow:
          "0 0 30px oklch(0.752 0.217 52.149 / 12%), 0 4px 20px oklch(0 0 0 / 40%), inset 0 1px 0 oklch(1 0 0 / 6%)",
      }}
    >
      {/* GIF background */}
      {disaster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={disaster.gif}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.45, mixBlendMode: "lighten" }}
        />
      )}

      {/* Darkening gradient overlay for text readability */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, oklch(0.06 0.005 285 / 60%) 0%, oklch(0.06 0.005 285 / 30%) 40%, transparent 100%)",
        }}
      />

      {/* Glow accent at top edge */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--fire-orange), var(--fire-amber), transparent)",
          opacity: 0.8,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-between p-3">
        {/* Top section: alert type + location */}
        <div>
          {/* Alert type badge */}
          <div className="mb-1.5 flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-[alert-pulse_1.5s_ease-in-out_infinite] rounded-full bg-[var(--fire-orange)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--fire-orange)]" />
            </span>
            <span className="font-mono text-[12px] font-bold tracking-[0.12em] text-[var(--fire-orange)]">
              {node.alertType}
            </span>
          </div>

          {/* Location name */}
          <span className="font-mono text-[14px] font-semibold tracking-[0.06em] text-[oklch(1_0_0/85%)]">
            {node.label}
          </span>
        </div>

        {/* Bottom section: event name */}
        <div className="flex items-center gap-1.5">
          <div className="h-[1px] flex-1 bg-[oklch(1_0_0/10%)]" />
          {disaster && (
            <span className="font-mono text-[9px] tracking-[0.15em] text-[oklch(1_0_0/40%)]">
              {disaster.event}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
