"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SelectedBuilding {
  name: string;
  coordinates: [number, number];
  screenX: number;
  screenY: number;
}

interface BuildingPromptDialogProps {
  building: SelectedBuilding;
  onClose: () => void;
  onSubmit: (prompt: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PANEL_WIDTH = 360;
const PANEL_ESTIMATED_HEIGHT = 280;
const VIEWPORT_PADDING = 16;

// ---------------------------------------------------------------------------
// Framer Motion spring config
// ---------------------------------------------------------------------------
const dialogVariants = {
  initial: { opacity: 0, scale: 0.92, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 26 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 6,
    transition: { duration: 0.15 },
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BuildingPromptDialog({
  building,
  onClose,
  onSubmit,
}: BuildingPromptDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea on open
  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isLoading]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    try {
      await onSubmit(prompt.trim());
    } finally {
      setIsLoading(false);
    }
  }, [prompt, isLoading, onSubmit]);

  // Cmd+Enter / Ctrl+Enter to submit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Position: centered on X above click Y, clamped to viewport
  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(
      building.screenX - PANEL_WIDTH / 2,
      window.innerWidth - PANEL_WIDTH - VIEWPORT_PADDING
    )
  );

  const fitsAbove = building.screenY - PANEL_ESTIMATED_HEIGHT - VIEWPORT_PADDING > 0;
  const top = fitsAbove
    ? building.screenY - PANEL_ESTIMATED_HEIGHT - 12
    : building.screenY + 24;

  return (
    <motion.div
      variants={dialogVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="pointer-events-auto fixed z-[1000]"
      style={{ left, top, width: PANEL_WIDTH }}
    >
      <div
        className="relative flex flex-col overflow-hidden border font-mono"
        style={{
          background: "oklch(0.16 0.01 45 / 85%)",
          borderColor: "oklch(1 0 0 / 10%)",
          boxShadow: "0 0 30px oklch(0.752 0.217 52.149 / 10%), 0 4px 20px oklch(0 0 0 / 30%)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: "linear-gradient(90deg, transparent, var(--fire-orange), var(--fire-amber), transparent)",
            opacity: 0.7,
          }}
        />

        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--grid-line)" }}
        >
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-xs font-semibold uppercase tracking-[0.15em]"
              style={{ color: "var(--fire-orange)" }}
            >
              {building.name}
            </h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {building.coordinates[1].toFixed(4)}N,{" "}
              {Math.abs(building.coordinates[0]).toFixed(4)}W
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            disabled={isLoading}
            className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <label className="mb-1.5 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Simulation Prompt
          </label>
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Describe the scenario..."
            className="min-h-[72px] resize-none border-[var(--grid-line)] bg-[hsl(20_8%_5%/0.6)] text-xs placeholder:text-muted-foreground/50"
            rows={3}
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-4 py-3"
          style={{ borderColor: "var(--grid-line)" }}
        >
          <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            {isLoading ? "" : "\u2318+Enter to submit"}
          </span>

          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isLoading}
            size="sm"
            className="h-7 rounded-none border border-[var(--fire-orange)] bg-[var(--fire-orange)]/10 px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--fire-orange)] hover:bg-[var(--fire-orange)]/20 disabled:opacity-40"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span className="ml-1.5">Generating</span>
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
