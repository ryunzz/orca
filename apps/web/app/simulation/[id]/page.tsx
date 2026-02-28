import { SimulationViewer } from "@/components/simulation/SimulationViewer";
import { NavigationControls } from "@/components/simulation/NavigationControls";
import { TelemetryOverlay } from "@/components/telemetry/TelemetryOverlay";
import { TelemetryDashboard } from "@/components/telemetry/TelemetryDashboard";

export default function SimulationPage({ params }: { params: { id: string } }) {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold">Simulation {params.id}</h2>
      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="relative h-[70vh] rounded-lg border border-slate-700 bg-surface/70">
          <SimulationViewer simulationId={params.id} />
          <TelemetryOverlay simulationId={params.id} />
          <NavigationControls simulationId={params.id} />
        </div>
        <TelemetryDashboard simulationId={params.id} />
      </div>
    </section>
  );
}
