"use client";

import React, { useEffect, useRef } from "react";
import createGlobe from "cobe";
import { cn } from "@/lib/utils";
import {
  GLOBE_CONFIG,
  IDLE_SPIN_SPEED,
  INITIAL_THETA,
  TARGET_PHI,
  TARGET_THETA,
  normalizeAngleDelta,
  easeInOutCubic,
} from "@/lib/globe-constants";
import {
  HERO_GLOBE_ROTATE_MS,
  type GlobeTransitionState,
} from "@/lib/transition-constants";

// ─── Props ──────────────────────────────────────────────────────────────────

interface GlobeCanvasProps {
  className?: string;
  /** Shared ref so the overlay can read current globe phi */
  phiRef: React.RefObject<number>;
  /** Shared transition state for exit animation (desktop only) */
  transitionRef?: React.RefObject<GlobeTransitionState>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GlobeCanvas({ className, phiRef, transitionRef }: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thetaRef = useRef(INITIAL_THETA);
  const rotationStartRef = useRef<{
    phi: number;
    theta: number;
    startedAt: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, GLOBE_CONFIG.MAX_DPR);
    const displayWidth = canvas.offsetWidth || GLOBE_CONFIG.WIDTH;
    const displayHeight = canvas.offsetHeight || GLOBE_CONFIG.HEIGHT;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: displayWidth * dpr,
      height: displayHeight * dpr,
      phi: phiRef.current,
      theta: thetaRef.current,
      dark: GLOBE_CONFIG.DARK,
      diffuse: GLOBE_CONFIG.DIFFUSE,
      mapSamples: GLOBE_CONFIG.MAP_SAMPLES,
      mapBrightness: GLOBE_CONFIG.MAP_BRIGHTNESS,
      baseColor: [...GLOBE_CONFIG.BASE_COLOR],
      markerColor: [...GLOBE_CONFIG.MARKER_COLOR],
      glowColor: [...GLOBE_CONFIG.GLOW_COLOR],
      markers: [],
      scale: 1,
      offset: [0, 0],
      onRender: (state) => {
        state.width = canvas.offsetWidth * dpr;
        state.height = canvas.offsetHeight * dpr;

        const phase = transitionRef?.current?.phase ?? "idle";

        if (phase === "idle") {
          // Continuous idle spin
          phiRef.current += IDLE_SPIN_SPEED;
          state.phi = phiRef.current;
          state.theta = thetaRef.current;
        } else if (phase === "exiting" || phase === "zooming") {
          // Snapshot rotation start values once
          if (!rotationStartRef.current) {
            rotationStartRef.current = {
              phi: phiRef.current,
              theta: thetaRef.current,
              startedAt: transitionRef!.current.exitStartedAt,
            };
          }

          const elapsed = Date.now() - rotationStartRef.current.startedAt;
          const t = Math.min(elapsed / HERO_GLOBE_ROTATE_MS, 1);
          const eased = easeInOutCubic(t);

          // Interpolate phi via shortest-arc
          const startPhi = rotationStartRef.current.phi;
          const deltaPhi = normalizeAngleDelta(TARGET_PHI - startPhi);
          state.phi = startPhi + deltaPhi * eased;
          phiRef.current = state.phi;

          // Interpolate theta toward target
          const startTheta = rotationStartRef.current.theta;
          const newTheta = startTheta + (TARGET_THETA - startTheta) * eased;
          state.theta = newTheta;

          if (transitionRef?.current) {
            transitionRef.current.theta = newTheta;
          }
        } else {
          // done — hold final position
          state.phi = phiRef.current;
          state.theta = TARGET_THETA;
          if (transitionRef?.current) {
            transitionRef.current.theta = TARGET_THETA;
          }
        }

        state.scale = 1;
      },
    });

    return () => {
      globe.destroy();
    };
    // Intentionally run only on mount — phiRef handles dynamic reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ contain: "layout paint" }}
      />
    </div>
  );
}
