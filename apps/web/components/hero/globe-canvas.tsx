"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";
import { cn } from "@/lib/utils";
import {
  GLOBE_CONFIG,
  TARGET_LOCATION,
  TARGET_PHI,
  TARGET_THETA,
  IDLE_SPIN_SPEED,
  easeInCubic,
  easeOutCubic,
  normalizeAngleDelta,
} from "@/lib/globe-constants";
import type { GlobePhaseInfo } from "@/lib/globe-state-machine";

// ─── Props ──────────────────────────────────────────────────────────────────

interface GlobeCanvasProps {
  className?: string;
  phaseInfo: GlobePhaseInfo;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GlobeCanvas({ className, phaseInfo }: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phaseInfo);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  const lockStartPhiRef = useRef(0);
  const lockStartThetaRef = useRef(0);
  const lockInitializedRef = useRef(false);

  // Keep phase ref in sync
  useEffect(() => {
    phaseRef.current = phaseInfo;

    // Capture starting angles when LOCK begins
    if (phaseInfo.state === "LOCK" && !lockInitializedRef.current) {
      lockStartPhiRef.current = phiRef.current;
      lockStartThetaRef.current = thetaRef.current;
      lockInitializedRef.current = true;
    }

    // Reset lock flag if we go back to IDLE
    if (phaseInfo.state === "IDLE") {
      lockInitializedRef.current = false;
    }
  }, [phaseInfo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Compute actual DPR (capped)
    const dpr = Math.min(window.devicePixelRatio || 1, GLOBE_CONFIG.MAX_DPR);

    // Use actual display size so cobe renders centered
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
      markers: [
        {
          location: [TARGET_LOCATION.LAT, TARGET_LOCATION.LNG],
          size: 0.08,
        },
      ],
      scale: 1,
      offset: [0, 0],
      onRender: (state) => {
        // Keep render resolution synced with display size
        state.width = canvas.offsetWidth * dpr;
        state.height = canvas.offsetHeight * dpr;

        const { state: phase, progress } = phaseRef.current;

        switch (phase) {
          case "IDLE": {
            // Continuous rotation
            phiRef.current += IDLE_SPIN_SPEED;
            state.phi = phiRef.current;
            state.theta = thetaRef.current;
            state.scale = 1;
            break;
          }

          case "LOCK": {
            // EaseOutCubic interpolation from current → target (shortest arc)
            const t = easeOutCubic(progress);
            const startPhi = lockStartPhiRef.current;
            const startTheta = lockStartThetaRef.current;

            const deltaPhi = normalizeAngleDelta(TARGET_PHI - startPhi);
            const deltaTheta = TARGET_THETA - startTheta;

            phiRef.current = startPhi + deltaPhi * t;
            thetaRef.current = startTheta + deltaTheta * t;

            state.phi = phiRef.current;
            state.theta = thetaRef.current;
            state.scale = 1;
            break;
          }

          case "SCOPE": {
            // Hold at target, scale = 1
            state.phi = TARGET_PHI;
            state.theta = TARGET_THETA;
            state.scale = 1;
            break;
          }

          case "ZOOM": {
            // Hold at target, scale ramps 1→6
            state.phi = TARGET_PHI;
            state.theta = TARGET_THETA;
            state.scale = 1 + 5 * easeInCubic(progress);
            break;
          }

          case "NAVIGATE": {
            state.phi = TARGET_PHI;
            state.theta = TARGET_THETA;
            state.scale = 6;
            break;
          }
        }
      },
    });

    return () => {
      globe.destroy();
    };
    // Intentionally run only on mount — phaseRef handles dynamic reads
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
