"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HERO_TITLE_LINE1,
  HERO_TITLE_LINE2,
  HERO_SUBTITLE,
} from "@/lib/constants";
import {
  HERO_TEXT_FADE_DURATION_MS,
  HERO_GLOBE_FADE_DURATION_MS,
  HERO_EXIT_STAGGER_MS,
  HERO_GLOBE_ZOOM_DELAY_MS,
  HERO_GLOBE_ZOOM_MS,
  HERO_GLOBE_ZOOM_SCALE,
  HERO_EXIT_TOTAL_MS_V2,
  type GlobeTransitionState,
} from "@/lib/transition-constants";
import { INITIAL_THETA, easeInCubic } from "@/lib/globe-constants";
import { GlobeCanvas } from "./globe-canvas";
import { GlobeAlerts } from "./globe-alerts";
import { HeroNav } from "./hero-nav";
import { CommandCenterFrame } from "./command-center-frame";

// ─── Stagger Animation Variants ────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.5,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function HeroSection() {
  const router = useRouter();
  const phiRef = useRef(0);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const [globeDims, setGlobeDims] = useState({ w: 0, h: 0 });
  const [isExiting, setIsExiting] = useState(false);
  const [zoomActive, setZoomActive] = useState(false);

  // Shared transition state for globe components (mutated at 60fps, no re-renders)
  const transitionRef = useRef<GlobeTransitionState>({
    phase: "idle",
    exitStartedAt: 0,
    theta: INITIAL_THETA,
  });

  // Prefetch dashboard JS chunk
  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  // Track globe container dimensions for alert overlay projection
  useEffect(() => {
    const el = globeContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setGlobeDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Exit Transition: Zoom rAF ──────────────────────────────────────────
  useEffect(() => {
    if (!zoomActive) return;

    const el = globeContainerRef.current;
    if (!el) return;

    const zoomStart = Date.now();
    let raf: number;

    const tick = () => {
      const elapsed = Date.now() - zoomStart;
      const t = Math.min(elapsed / HERO_GLOBE_ZOOM_MS, 1);
      const eased = easeInCubic(t);

      const scale = 1 + (HERO_GLOBE_ZOOM_SCALE - 1) * eased;
      el.style.transform = `scale(${scale})`;
      el.style.opacity = String(1 - eased);

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [zoomActive]);

  const handleNavigate = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);

    // Start rotation phase
    transitionRef.current.phase = "exiting";
    transitionRef.current.exitStartedAt = Date.now();

    // Start zoom phase at 800ms
    setTimeout(() => {
      transitionRef.current.phase = "zooming";
      setZoomActive(true);
    }, HERO_GLOBE_ZOOM_DELAY_MS);

    // Navigate at 1600ms
    setTimeout(() => {
      transitionRef.current.phase = "done";
      router.push("/dashboard");
    }, HERO_EXIT_TOTAL_MS_V2);
  }, [isExiting, router]);

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Atmospheric background */}
      <CommandCenterFrame />

      {/* Navigation */}
      <HeroNav isExiting={isExiting} onNavigate={handleNavigate} />

      {/* Globe — absolutely positioned, bottom-right (desktop) */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-[5] hidden lg:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        <div
          ref={globeContainerRef}
          className="absolute"
          style={{
            width: "min(120vh, 70vw)",
            aspectRatio: "1 / 1",
            right: "-12%",
            bottom: "-35%",
            transformOrigin: "center center",
          }}
        >
          <GlobeCanvas
            className="absolute inset-0 pointer-events-auto"
            phiRef={phiRef}
            transitionRef={transitionRef}
          />
          <GlobeAlerts
            phiRef={phiRef}
            containerWidth={globeDims.w}
            containerHeight={globeDims.h}
            transitionRef={transitionRef}
          />
        </div>
      </motion.div>

      {/* Main content */}
      <motion.div
        className="relative z-10 flex flex-1 flex-col justify-center px-6 pt-24 lg:w-[55%] lg:px-16 lg:pt-0"
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={
          isExiting
            ? { duration: HERO_TEXT_FADE_DURATION_MS / 1000, ease: "easeIn" }
            : { duration: 0 }
        }
      >
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Small mono label */}
          <motion.p
            className="mb-4 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground"
            variants={itemVariants}
          >
            Emergency Intelligence Platform
          </motion.p>

          {/* Hero title */}
          <motion.div className="relative mb-4" variants={itemVariants}>
            {/* Glow layer (behind) */}
            <h1
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 font-display text-5xl font-bold leading-[1.05] tracking-tight opacity-40 blur-[20px] lg:text-8xl"
            >
              <span className="bg-gradient-to-r from-[var(--fire-amber)] to-[var(--fire-orange)] bg-clip-text text-transparent">
                {HERO_TITLE_LINE1}
              </span>
            </h1>
            {/* Sharp text (front) */}
            <h1 className="relative font-display text-5xl font-bold leading-[1.05] tracking-tight lg:text-8xl">
              <span className="bg-gradient-to-r from-[var(--fire-amber)] to-[var(--fire-orange)] bg-clip-text text-transparent">
                {HERO_TITLE_LINE1}
              </span>
              <br />
              <span className="tracking-tight text-foreground/90 lg:text-7xl">
                {HERO_TITLE_LINE2}
              </span>
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="mb-8 max-w-lg text-sm leading-relaxed text-muted-foreground lg:text-base"
            variants={itemVariants}
          >
            {HERO_SUBTITLE}
          </motion.p>

          {/* CTA button */}
          <motion.div variants={itemVariants}>
            <button
              className={cn(
                "group flex items-center gap-2 rounded-none px-6 py-3",
                "bg-[var(--fire-orange)] text-[oklch(0.1_0_0)]",
                "font-mono text-[11px] font-semibold uppercase tracking-[0.2em]",
                "animate-[button-glow_3s_ease-in-out_infinite]",
                "transition-all hover:brightness-110"
              )}
              onClick={handleNavigate}
            >
              Open Dashboard
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Mobile: Globe as background */}
      <motion.div
        className="pointer-events-none absolute inset-0 lg:hidden"
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={
          isExiting
            ? { duration: HERO_GLOBE_FADE_DURATION_MS / 1000, delay: HERO_EXIT_STAGGER_MS / 1000, ease: "easeIn" }
            : { duration: 0 }
        }
      >
        <GlobeCanvas
          className="h-full w-full opacity-30"
          phiRef={phiRef}
        />
      </motion.div>
    </section>
  );
}
