"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { MetricsSnapshot } from "@/lib/api-types";

// ---------------------------------------------------------------------------
// Risk-level badge palette (matches dashboard/metrics-panel.tsx)
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

const mono = "var(--font-geist-mono, monospace)";

// ---------------------------------------------------------------------------
// Badge
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
        fontFamily: mono,
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metric card (inline — avoids extra component import)
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
        flexDirection: "column" as const,
        gap: "6px",
        position: "relative" as const,
        overflow: "hidden",
      }}
    >
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
          fontFamily: mono,
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
// SceneMetricsOverlay
// ---------------------------------------------------------------------------

interface SceneMetricsOverlayProps {
  metrics: MetricsSnapshot | null;
  currentRoom: string | null;
  progress: number; // 0–100
  complete: boolean;
}

export function SceneMetricsOverlay({
  metrics,
  currentRoom,
  progress,
  complete,
}: SceneMetricsOverlayProps) {
  if (!metrics) return null;

  const { optimized_path, survivability, heat_exposure } = metrics;
  const riskColor = RISK_COLORS[optimized_path.risk_level] ?? RISK_COLORS.caution;
  const exposureColor =
    EXPOSURE_COLORS[heat_exposure.classification] ?? EXPOSURE_COLORS.moderate;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "220px",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {/* Agent progress indicator */}
        <motion.div
          key="progress"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{
            background: "oklch(0.16 0.01 45 / 85%)",
            border: "1px solid oklch(1 0 0 / 8%)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Pulsing dot */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: complete ? "oklch(0.792 0.209 151.711)" : "#66d9ff",
              boxShadow: complete
                ? "0 0 6px oklch(0.792 0.209 151.711)"
                : "0 0 6px #66d9ff",
              flexShrink: 0,
              animation: complete ? "none" : "pulse 1.5s ease-in-out infinite",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: mono,
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "oklch(0.85 0 0)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {complete ? "Traversal Complete" : currentRoom ?? "Starting..."}
            </div>
            {/* Progress bar */}
            <div
              style={{
                marginTop: 4,
                height: 2,
                background: "oklch(1 0 0 / 8%)",
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{
                  height: "100%",
                  background: complete
                    ? "oklch(0.792 0.209 151.711)"
                    : "#66d9ff",
                  borderRadius: 1,
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Optimized Path */}
        <MetricCard title="Optimized Path" delay={0.05}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: mono,
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
              fontFamily: mono,
              fontSize: "8px",
              color: "oklch(0.5 0 0)",
              letterSpacing: "0.05em",
            }}
          >
            cost: {optimized_path.total_cost.toFixed(1)}
          </div>
        </MetricCard>

        {/* Survivability Window */}
        <MetricCard title="Survivability Window" delay={0.12}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: mono,
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
                fontFamily: mono,
                fontSize: "8px",
                color: "oklch(0.5 0 0)",
                letterSpacing: "0.05em",
              }}
            >
              hotspot: {survivability.worst_room}
            </div>
          )}
        </MetricCard>

        {/* Heat Exposure */}
        <MetricCard title="Heat Exposure" delay={0.19}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: mono,
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
          {/* Per-room breakdown with current room highlight */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              marginTop: "2px",
            }}
          >
            {Object.entries(heat_exposure.per_room).map(([room, score]) => {
              const isCurrent = room === currentRoom;
              return (
                <div
                  key={room}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: mono,
                    fontSize: "8px",
                    letterSpacing: "0.05em",
                    color: isCurrent ? "#66d9ff" : "oklch(0.5 0 0)",
                    transition: "color 0.3s ease",
                  }}
                >
                  <span>{room}</span>
                  <span>{score.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </MetricCard>
      </AnimatePresence>

      {/* Keyframe animation for the pulsing dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
