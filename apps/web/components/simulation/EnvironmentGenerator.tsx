"use client";

import { useState } from "react";
import { createSimulation } from "@/lib/api";

export function EnvironmentGenerator() {
  const [name, setName] = useState("New Emergency Scene");
  const [environmentType, setEnvironmentType] = useState("burning_building");

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await createSimulation({
          name,
          environment_type: environmentType,
          world_model_config: { seed: 42 },
        });
      }}
      className="rounded-lg border border-slate-700 bg-surface p-4"
    >
      <p className="font-semibold">Generate Simulation</p>
      <div className="mt-2 space-y-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded border border-slate-500 bg-black/40 px-2 py-1"
          placeholder="Simulation name"
        />
        <select
          className="w-full rounded border border-slate-500 bg-black/40 px-2 py-1"
          value={environmentType}
          onChange={(event) => setEnvironmentType(event.target.value)}
        >
          <option value="burning_building">Burning Building</option>
          <option value="collapse">Collapse</option>
          <option value="hazmat">Hazmat</option>
        </select>
      </div>
      <button className="mt-3 rounded bg-emerald-400 px-3 py-1 text-black" type="submit">
        Generate
      </button>
    </form>
  );
}
