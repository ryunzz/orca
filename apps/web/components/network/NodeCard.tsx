export function NodeCard({ node }: { node: { id: string; status: string; node_type: string; wallet_address?: string | null } }) {
  return (
    <article className="rounded-lg border border-slate-700 bg-surface p-3">
      <p className="font-semibold">{node.id}</p>
      <p className="text-sm text-slate-300">Type: {node.node_type}</p>
      <p className="text-xs text-slate-400">Status: {node.status}</p>
      <p className="text-xs text-slate-500">Wallet: {node.wallet_address ?? "N/A"}</p>
    </article>
  );
}
