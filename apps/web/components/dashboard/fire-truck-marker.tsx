"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { type FireTruck, TRUCK_STATUS_COLORS } from "@/lib/dashboard-constants";

interface FireTruckMarkerProps {
  truck: FireTruck;
}

function createTruckIcon(truck: FireTruck): L.DivIcon {
  const color = TRUCK_STATUS_COLORS[truck.status];

  return L.divIcon({
    className: "",
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, -30],
    html: `
      <div class="fire-truck-marker" style="color: ${color}; position: relative; width: 60px; height: 60px;">
        <!-- Dot -->
        <div style="
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 10px; height: 10px;
          background: ${color};
          box-shadow: 0 0 8px ${color}, 0 0 16px ${color}80;
        "></div>
        <!-- Heading arrow -->
        <div style="
          position: absolute;
          top: 50%; left: 50%;
          width: 1px; height: 20px;
          background: linear-gradient(to top, ${color}, transparent);
          transform-origin: bottom center;
          transform: translate(-50%, -100%) rotate(${truck.heading}deg);
        "></div>
        <!-- Callsign label -->
        <div style="
          position: absolute;
          top: calc(50% + 16px); left: 50%;
          transform: translateX(-50%);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 8px;
          letter-spacing: 0.1em;
          color: ${color};
          background: hsl(0 0% 5% / 0.85);
          padding: 1px 5px;
          white-space: nowrap;
          border: 1px solid ${color}40;
        ">${truck.callsign}</div>
        <!-- Distance label -->
        <div style="
          position: absolute;
          top: calc(50% + 32px); left: 50%;
          transform: translateX(-50%);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 7px;
          color: hsl(0 0% 50%);
          white-space: nowrap;
        ">${truck.distanceM}m</div>
      </div>
    `,
  });
}

export function FireTruckMarker({ truck }: FireTruckMarkerProps) {
  const icon = createTruckIcon(truck);
  const color = TRUCK_STATUS_COLORS[truck.status];

  return (
    <Marker position={[truck.lat, truck.lng]} icon={icon}>
      <Popup>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2"
              style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            />
            <span className="font-semibold tracking-wider">
              {truck.callsign}
            </span>
          </div>
          <div className="space-y-0.5 text-[10px] text-[hsl(0_0%_60%)]">
            <div>
              TYPE: <span className="text-foreground">{truck.type}</span>
            </div>
            <div>
              STATUS:{" "}
              <span style={{ color }}>{truck.status.replace("_", " ")}</span>
            </div>
            <div>
              SPEED: <span className="text-foreground">{truck.speedKmh} km/h</span>
            </div>
            <div>
              DIST: <span className="text-foreground">{truck.distanceM}m</span>
            </div>
            {truck.etaSeconds > 0 && (
              <div>
                ETA: <span className="text-foreground">{truck.etaSeconds}s</span>
              </div>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
