import Link from "next/link";
import { SimulationCard } from "@/components/simulation/SimulationCard";

const placeholders = [
  {
    id: "demo-burning",
    name: "Burning Office Complex",
    status: "active",
    environment_type: "burning_building",
  },
  {
    id: "demo-collapse",
    name: "Collapsed Warehouse",
    status: "active",
    environment_type: "collapse",
  },
];

export default function Home() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Emergency Training Dashboard</h2>
        <p className="text-sm text-slate-300">
          Generate and validate simulated emergency environments with high-frequency telemetry.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {placeholders.map((simulation) => (
          <SimulationCard key={simulation.id} simulation={simulation} />
        ))}
      </div>
      <Link href="/simulation" className="inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-black">
        Open Simulation Center
      </Link>
    </section>
  );
}
