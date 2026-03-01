"use client";

import { motion } from "framer-motion";
import { useWallet } from "@/hooks/use-wallet";

function truncate(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

interface WalletButtonProps {
  className?: string;
}

export function WalletButton({ className }: WalletButtonProps) {
  const { state, connect, disconnect, hasPhantom } = useWallet();

  if (!hasPhantom) {
    return (
      <a
        href="https://phantom.app"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "oklch(0.55 0 0)",
          textDecoration: "none",
          padding: "5px 10px",
          border: "1px solid oklch(1 0 0 / 8%)",
        }}
        className={className}
      >
        Install Phantom
      </a>
    );
  }

  if (state.connected && state.publicKey) {
    return (
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={disconnect}
        title="Click to disconnect"
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "oklch(0.792 0.209 151.711)",
          background: "oklch(0.792 0.209 151.711 / 8%)",
          border: "1px solid oklch(0.792 0.209 151.711 / 25%)",
          padding: "5px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
        className={className}
      >
        {/* Green dot */}
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: "oklch(0.792 0.209 151.711)",
            flexShrink: 0,
          }}
        />
        {truncate(state.publicKey)}
      </motion.button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={state.connecting}
      style={{
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: state.connecting ? "oklch(0.5 0 0)" : "oklch(0.82 0.19 84.429)",
        background: "oklch(0.82 0.19 84.429 / 6%)",
        border: "1px solid oklch(0.82 0.19 84.429 / 20%)",
        padding: "5px 10px",
        cursor: state.connecting ? "default" : "pointer",
        transition: "all 0.15s",
      }}
      className={className}
    >
      {state.connecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
