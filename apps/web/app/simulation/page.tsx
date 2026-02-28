import Link from "next/link";
import { SimulationCard } from "@/components/simulation/SimulationCard";

const items = [
  { id: "demo-burning", name: "Burning Office Complex", status: "active", environment_type: "burning_building" },
  { id: "demo-collapse", name: "Collapsed Warehouse", status: "active", environment_type: "collapse" },
  { id: "demo-hazmat", name: "Hazmat Tunnel", status: "completed", environment_type: "hazmat" },
];

export default function SimulationListPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Simulations</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((simulation) => (
          <Link href={`/simulation/${simulation.id}`} key={simulation.id}>
            <SimulationCard simulation={simulation} />
          </Link>
        ))}
      </div>
    </section>
  );
}
