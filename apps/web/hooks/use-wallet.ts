"use client";

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Phantom provider shape (subset of the full API we need)
// ---------------------------------------------------------------------------
interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toString(): string } | null;
  isConnected: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAndSendTransaction(tx: any): Promise<{ signature: string }>;
}

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? (p as PhantomProvider) : null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export interface WalletState {
  connected: boolean;
  connecting: boolean;
  publicKey: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useWallet() {
  const [state, setState] = useState<WalletState>({
    connected: false,
    connecting: false,
    publicKey: null,
    error: null,
  });

  // Reconnect silently if already trusted (no popup)
  useEffect(() => {
    const provider = getPhantom();
    if (!provider) return;
    provider
      .connect({ onlyIfTrusted: true })
      .then(({ publicKey }) => {
        setState({
          connected: true,
          connecting: false,
          publicKey: publicKey.toString(),
          error: null,
        });
      })
      .catch(() => {
        // Not previously trusted — user must click connect
      });
  }, []);

  const connect = useCallback(async () => {
    const provider = getPhantom();
    if (!provider) {
      setState((prev) => ({
        ...prev,
        error: "Phantom wallet not detected — install from phantom.app",
      }));
      return;
    }
    setState((prev) => ({ ...prev, connecting: true, error: null }));
    try {
      const { publicKey } = await provider.connect();
      setState({ connected: true, connecting: false, publicKey: publicKey.toString(), error: null });
    } catch {
      setState((prev) => ({ ...prev, connecting: false, error: "Connection rejected" }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    const provider = getPhantom();
    if (provider) await provider.disconnect().catch(() => undefined);
    setState({ connected: false, connecting: false, publicKey: null, error: null });
  }, []);

  /**
   * Send SOL (in lamports) to a recipient address on devnet.
   * Returns the transaction signature.
   */
  const sendSOL = useCallback(
    async (recipientAddress: string, lamports: number): Promise<string> => {
      const provider = getPhantom();
      if (!provider || !state.publicKey) throw new Error("Wallet not connected");

      const { Connection, PublicKey, SystemProgram, Transaction } = await import(
        "@solana/web3.js"
      );

      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const from = new PublicKey(state.publicKey);
      const to = new PublicKey(recipientAddress);

      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = from;

      const { signature } = await provider.signAndSendTransaction(tx);
      return signature;
    },
    [state.publicKey]
  );

  const hasPhantom = getPhantom() !== null;

  return { state, connect, disconnect, sendSOL, hasPhantom };
}
