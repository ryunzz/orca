import type { SimulationSummary } from "@/types";

export function SimulationCard({ simulation }: { simulation: SimulationSummary }) {
  return (
    <article className="rounded-xl border border-slate-700 bg-surface p-4 shadow-md">
      <h3 className="text-lg font-semibold">{simulation.name}</h3>
      <p className="text-sm text-slate-300">Type: {simulation.environment_type}</p>
      <p className="text-xs uppercase tracking-wide text-slate-400">Status: {simulation.status}</p>
    </article>
  );
}
