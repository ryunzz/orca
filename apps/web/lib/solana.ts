import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";

export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const connection = new Connection(SOLANA_RPC_URL);

export function lamportsFromSol(value: number) {
  return Math.floor(value * LAMPORTS_PER_SOL);
}

export async function checkBalance(address: string) {
  const pubkey = new PublicKey(address);
  return connection.getBalance(pubkey);
}

export function serializeInstructions(transaction: Transaction) {
  return transaction.serialize().toString("base64");
}
