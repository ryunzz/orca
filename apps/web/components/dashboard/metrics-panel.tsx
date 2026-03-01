"use client";

import { motion } from "framer-motion";
import type { MetricsSnapshot } from "@/lib/api-types";

// ---------------------------------------------------------------------------
// Risk-level badge colors (oklch palette matching dashboard theme)
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  safe: {
    bg: "oklch(0.792 0.209 151.711 / 12%)",
    text: "oklch(0.792 0.209 151.711)",
    border: "oklch(0.792 0.209 151.711 / 25%)",
  },
  caution: {
    bg: "oklch(0.82 0.19 84.429 / 12%)",
    text: "oklch(0.82 0.19 84.429)",
    border: "oklch(0.82 0.19 84.429 / 25%)",
  },
  dangerous: {
    bg: "oklch(0.752 0.217 52.149 / 12%)",
    text: "oklch(0.752 0.217 52.149)",
    border: "oklch(0.752 0.217 52.149 / 25%)",
  },
  blocked: {
    bg: "oklch(0.637 0.237 25.331 / 12%)",
    text: "oklch(0.637 0.237 25.331)",
    border: "oklch(0.637 0.237 25.331 / 25%)",
  },
};

const EXPOSURE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  minimal: RISK_COLORS.safe,
  moderate: RISK_COLORS.caution,
  severe: RISK_COLORS.dangerous,
  lethal: RISK_COLORS.blocked,
};

// ---------------------------------------------------------------------------
// Badge component
// ---------------------------------------------------------------------------

function Badge({
  label,
  colorSet,
}: {
  label: string;
  colorSet: { bg: string; text: string; border: string };
}) {
  return (
    <span
      style={{
        background: colorSet.bg,
        color: colorSet.text,
        border: `1px solid ${colorSet.border}`,
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontFamily: "var(--font-geist-mono, monospace)",
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      style={{
        background: "oklch(0.16 0.01 45 / 85%)",
        border: "1px solid oklch(1 0 0 / 8%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow:
          "0 0 20px oklch(0.752 0.217 52.149 / 6%), 0 4px 12px oklch(0 0 0 / 30%)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, oklch(0.752 0.217 52.149 / 50%), transparent)",
        }}
      />
      <div
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: "8px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "oklch(0.65 0 0)",
        }}
      >
        {title}
      </div>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MetricsPanel
// ---------------------------------------------------------------------------

interface MetricsPanelProps {
  metrics: MetricsSnapshot | null;
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  if (!metrics) return null;

  const { optimized_path, survivability, heat_exposure } = metrics;
  const riskColor = RISK_COLORS[optimized_path.risk_level] ?? RISK_COLORS.caution;
  const exposureColor =
    EXPOSURE_COLORS[heat_exposure.classification] ?? EXPOSURE_COLORS.moderate;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "220px",
        pointerEvents: "auto",
      }}
    >
      {/* Optimized Path */}
      <MetricCard title="Optimized Path" delay={0}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "18px",
              fontWeight: 700,
              color: "oklch(0.95 0 0)",
              lineHeight: 1,
            }}
          >
            {optimized_path.room_count}
            <span
              style={{
                fontSize: "9px",
                fontWeight: 500,
                color: "oklch(0.55 0 0)",
                marginLeft: "4px",
              }}
            >
              rooms
            </span>
          </span>
          <Badge label={optimized_path.risk_level} colorSet={riskColor} />
        </div>
        <div
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: "8px",
            color: "oklch(0.5 0 0)",
            letterSpacing: "0.05em",
          }}
        >
          cost: {optimized_path.total_cost.toFixed(1)}
        </div>
      </MetricCard>

      {/* Survivability Window */}
      <MetricCard title="Survivability Window" delay={0.08}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "18px",
              fontWeight: 700,
              color: "oklch(0.95 0 0)",
              lineHeight: 1,
            }}
          >
            {survivability.minutes_remaining != null
              ? `${survivability.minutes_remaining}`
              : ">30"}
            <span
              style={{
                fontSize: "9px",
                fontWeight: 500,
                color: "oklch(0.55 0 0)",
                marginLeft: "4px",
              }}
            >
              min
            </span>
          </span>
          <Badge
            label={survivability.viable ? "viable" : "compromised"}
            colorSet={
              survivability.viable ? RISK_COLORS.safe : RISK_COLORS.dangerous
            }
          />
        </div>
        {survivability.worst_room && (
          <div
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "8px",
              color: "oklch(0.5 0 0)",
              letterSpacing: "0.05em",
            }}
          >
            hotspot: {survivability.worst_room}
          </div>
        )}
      </MetricCard>

      {/* Cumulative Heat Exposure */}
      <MetricCard title="Heat Exposure" delay={0.16}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "18px",
              fontWeight: 700,
              color: "oklch(0.95 0 0)",
              lineHeight: 1,
            }}
          >
            {heat_exposure.total_score.toFixed(2)}
          </span>
          <Badge
            label={heat_exposure.classification}
            colorSet={exposureColor}
          />
        </div>
        <div
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: "8px",
            color: "oklch(0.5 0 0)",
            letterSpacing: "0.05em",
          }}
        >
          {Object.keys(heat_exposure.per_room).length} rooms traversed
        </div>
      </MetricCard>
    </motion.div>
  );
}
