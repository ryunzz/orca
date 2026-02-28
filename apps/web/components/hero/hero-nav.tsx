"use client";

import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

// ─── Props ──────────────────────────────────────────────────────────────────

interface HeroNavProps {
  className?: string;
  onLaunch?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function HeroNav({ className, onLaunch }: HeroNavProps) {
  return (
    <nav
      className={cn(
        "absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-4",
        "backdrop-blur-sm",
        className
      )}
    >
      {/* Left: Logo + LIVE */}
      <div className="flex items-center gap-3">
        <Flame className="size-5 text-[var(--fire-orange)]" />
        <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground">
          {APP_NAME}
        </span>
        <Badge variant="outline" className="gap-1.5 border-[var(--fire-orange)]/30 px-2 py-0.5 text-[10px]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--fire-orange)] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--fire-orange)]" />
          </span>
          LIVE
        </Badge>
      </div>

      {/* Right: CTA */}
      <Button
        variant="outline"
        size="sm"
        className="font-mono text-xs tracking-wider"
        onClick={onLaunch}
      >
        Launch Dashboard
      </Button>
    </nav>
  );
}
