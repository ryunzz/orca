"use client";

import { motion } from "framer-motion";
import { Flame, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { HERO_NAV_EXIT_DURATION_MS } from "@/lib/transition-constants";

// ─── Props ──────────────────────────────────────────────────────────────────
interface HeroNavProps {
  className?: string;
  isExiting?: boolean;
  onNavigate?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function HeroNav({ className, isExiting, onNavigate }: HeroNavProps) {
  return (
    <motion.nav
      className={cn(
        "absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-3",
        "bg-[oklch(0.12_0.003_285/50%)] backdrop-blur-md",
        "border-b border-[oklch(1_0_0/6%)]",
        className
      )}
      animate={
        isExiting
          ? { y: "-100%", opacity: 0 }
          : { y: 0, opacity: 1 }
      }
      transition={
        isExiting
          ? { duration: HERO_NAV_EXIT_DURATION_MS / 1000, ease: "easeIn" }
          : { duration: 0 }
      }
    >
      {/* Left: Brand */}
      <div className="flex items-center gap-3">
        <Flame className="size-5 text-[var(--fire-orange)]" />
        <span className="font-mono text-sm font-bold tracking-[0.25em] text-foreground">
          {APP_NAME}
        </span>
      </div>

      {/* Right: CTA */}
      <button
        onClick={onNavigate}
        className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] uppercase text-foreground/80 transition-colors hover:text-foreground"
      >
        Open Dashboard
        <ChevronRight className="size-3.5" />
      </button>
    </motion.nav>
  );
}
