"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PaymentRecord } from "@/lib/api-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAMPORTS_PER_SOL = 1_000_000_000;

const TEAM_LABELS: Record<string, string> = {
  fire_severity: "Fire",
  structural:    "Structural",
  evacuation:    "Evacuation",
  personnel:     "Personnel",
};

const TEAM_COLORS: Record<string, string> = {
  fire_severity: "oklch(0.752 0.217 52.149)",
  structural:    "oklch(0.82 0.19 84.429)",
  evacuation:    "oklch(0.792 0.209 151.711)",
  personnel:     "oklch(0.65 0.18 260)",
};

function lamportsToSol(l: number): string {
  return (l / LAMPORTS_PER_SOL).toFixed(4);
}

function truncateSig(sig: string): string {
  if (sig.length <= 16) return sig;
  return `${sig.slice(0, 8)}…${sig.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// PaymentsPanel
// ---------------------------------------------------------------------------

interface PaymentsPanelProps {
  payments: PaymentRecord[];
}

export function PaymentsPanel({ payments }: PaymentsPanelProps) {
  const totalSol = payments.reduce((acc, p) => acc + p.amount_lamports, 0) / LAMPORTS_PER_SOL;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        position: "absolute",
        bottom: 48,
        left: 16,
        zIndex: 20,
        width: "248px",
        background: "oklch(0.16 0.01 45 / 85%)",
        border: "1px solid oklch(1 0 0 / 8%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow:
          "0 0 20px oklch(0.792 0.209 151.711 / 6%), 0 4px 12px oklch(0 0 0 / 30%)",
        overflow: "hidden",
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, oklch(0.792 0.209 151.711 / 50%), transparent)",
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: "10px 14px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid oklch(1 0 0 / 5%)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: "8px",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "oklch(0.65 0 0)",
          }}
        >
          Agent Micropayments
        </span>
        {payments.length > 0 && (
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "9px",
              fontWeight: 700,
              color: "oklch(0.792 0.209 151.711)",
            }}
          >
            {totalSol.toFixed(4)} SOL
          </span>
        )}
      </div>

      {/* Rows */}
      <div style={{ padding: "4px 0", minHeight: "40px" }}>
        {payments.length === 0 ? (
          <div
            style={{
              padding: "10px 14px",
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "9px",
              color: "oklch(0.4 0 0)",
              letterSpacing: "0.05em",
            }}
          >
            Awaiting analysis…
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {payments.map((p, i) => {
              const color = TEAM_COLORS[p.team] ?? "oklch(0.6 0 0)";
              const explorerUrl = `https://explorer.solana.com/tx/${p.tx_signature}?cluster=devnet`;
              const isMock = p.tx_signature.length === 64 && /^[0-9a-f]+$/.test(p.tx_signature);

              return (
                <motion.div
                  key={`${p.team}-${i}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 14px",
                    borderBottom: "1px solid oklch(1 0 0 / 4%)",
                  }}
                >
                  {/* Team color dot */}
                  <span
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />

                  {/* Team label */}
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontSize: "9px",
                      fontWeight: 600,
                      color,
                      flexShrink: 0,
                      width: "70px",
                    }}
                  >
                    {TEAM_LABELS[p.team] ?? p.team}
                  </span>

                  {/* Amount */}
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontSize: "9px",
                      color: "oklch(0.75 0 0)",
                      flexShrink: 0,
                      width: "54px",
                    }}
                  >
                    {lamportsToSol(p.amount_lamports)} SOL
                  </span>

                  {/* Tx link */}
                  {isMock ? (
                    <span
                      style={{
                        fontFamily: "var(--font-geist-mono, monospace)",
                        fontSize: "8px",
                        color: "oklch(0.4 0 0)",
                        letterSpacing: "0.04em",
                      }}
                      title={p.tx_signature}
                    >
                      {truncateSig(p.tx_signature)}
                    </span>
                  ) : (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "var(--font-geist-mono, monospace)",
                        fontSize: "8px",
                        color: "oklch(0.792 0.209 151.711 / 80%)",
                        textDecoration: "none",
                        letterSpacing: "0.04em",
                        transition: "color 0.15s",
                      }}
                      title={`View on Solana Explorer: ${p.tx_signature}`}
                    >
                      {truncateSig(p.tx_signature)} ↗
                    </a>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Footer: devnet badge */}
      <div
        style={{
          padding: "5px 14px",
          borderTop: "1px solid oklch(1 0 0 / 5%)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: "7px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "oklch(0.82 0.19 84.429)",
            background: "oklch(0.82 0.19 84.429 / 8%)",
            border: "1px solid oklch(0.82 0.19 84.429 / 20%)",
            padding: "1px 5px",
          }}
        >
          Devnet
        </span>
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: "7px",
            color: "oklch(0.35 0 0)",
            letterSpacing: "0.05em",
          }}
        >
          Solana · {payments.length}/4 teams paid
        </span>
      </div>
    </motion.div>
  );
}
