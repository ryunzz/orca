"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, Activity, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HERO_TITLE_LINE1,
  HERO_TITLE_LINE2,
  HERO_SUBTITLE,
  CAPABILITIES,
} from "@/lib/constants";
import { useGlobeStateMachine } from "@/lib/globe-state-machine";
import { GlobeCanvas } from "./globe-canvas";
import { GlobeOverlay } from "./globe-overlay";
import { StatusTicker } from "./status-ticker";
import { HeroNav } from "./hero-nav";

// ─── Icon Map ───────────────────────────────────────────────────────────────
const ICON_MAP = {
  Shield,
  Activity,
  Route,
} as const;

// ─── Stagger Animation Variants ────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.3,
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

  const handleNavigate = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  const { phaseInfo, trigger } = useGlobeStateMachine(handleNavigate);

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Background radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 65% 50%, var(--fire-glow), transparent)",
        }}
      />

      {/* Navigation */}
      <HeroNav onLaunch={trigger} />

      {/* Globe — absolutely positioned, bottom-right (desktop) */}
      <div
        className="pointer-events-none absolute inset-0 z-[5] hidden lg:block"
      >
        <div
          className="absolute"
          style={{
            width: "min(120vh, 70vw)",
            aspectRatio: "1 / 1",
            right: "-12%",
            bottom: "-35%",
          }}
        >
          <GlobeCanvas
            className="absolute inset-0 pointer-events-auto"
            phaseInfo={phaseInfo}
          />
          <GlobeOverlay
            className="absolute inset-0 pointer-events-auto"
            phaseInfo={phaseInfo}
            onGlobeClick={trigger}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-6 pt-24 lg:w-[55%] lg:px-16 lg:pt-0">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Capability badges */}
          <motion.div
            className="mb-6 flex flex-wrap gap-2"
            variants={itemVariants}
          >
            {CAPABILITIES.map((cap) => {
              const Icon = ICON_MAP[cap.icon as keyof typeof ICON_MAP];
              return (
                <Badge
                  key={cap.label}
                  variant="outline"
                  className="gap-1.5 border-[var(--annotation-line)] px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] text-muted-foreground"
                >
                  <Icon className="size-3" />
                  {cap.label}
                </Badge>
              );
            })}
          </motion.div>

          {/* Hero title */}
          <motion.h1
            className="mb-4 font-display text-5xl font-bold leading-[1.05] tracking-tight lg:text-7xl"
            variants={itemVariants}
          >
            <span className="bg-gradient-to-r from-[var(--fire-amber)] via-[var(--fire-orange)] to-[var(--fire-red)] bg-clip-text text-transparent">
              {HERO_TITLE_LINE1}
            </span>
            <br />
            <span className="text-foreground">{HERO_TITLE_LINE2}</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="mb-8 max-w-lg text-sm leading-relaxed text-muted-foreground lg:text-base"
            variants={itemVariants}
          >
            {HERO_SUBTITLE}
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            className="flex flex-wrap items-center gap-3"
            variants={itemVariants}
          >
            <Button
              size="lg"
              className={cn(
                "font-mono text-xs tracking-wider",
                "bg-gradient-to-r from-[var(--fire-orange)] to-[var(--fire-red)]",
                "text-white hover:opacity-90"
              )}
              onClick={trigger}
            >
              Launch Dashboard
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="font-mono text-xs tracking-wider"
            >
              Watch Demo
            </Button>
          </motion.div>
        </motion.div>
      </div>

      {/* Mobile: Globe as background */}
      <div className="pointer-events-none absolute inset-0 lg:hidden">
        <GlobeCanvas
          className="h-full w-full opacity-30"
          phaseInfo={phaseInfo}
        />
      </div>

      {/* Status ticker — above globe */}
      <div className="relative z-20">
        <StatusTicker />
      </div>
    </section>
  );
}
