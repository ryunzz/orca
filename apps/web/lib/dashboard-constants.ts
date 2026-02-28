import { FIRE_COLORS } from "./constants";

// ---------------------------------------------------------------------------
// Coordinates — Siebel Center for Computer Science
// ---------------------------------------------------------------------------
export const INCIDENT_CENTER = {
  LAT: 40.1138,
  LNG: -88.2249,
} as const;

// ---------------------------------------------------------------------------
// Map configuration
// ---------------------------------------------------------------------------
export const MAP_DEFAULT_ZOOM = 16;
export const MAP_MIN_ZOOM = 3;
export const MAP_MAX_ZOOM = 19;

export const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

// ---------------------------------------------------------------------------
// Truck types & statuses
// ---------------------------------------------------------------------------
export type TruckStatus = "RESPONDING" | "ON_SCENE" | "STAGED";
export type TruckType = "ENGINE" | "LADDER" | "RESCUE" | "HAZMAT";

export interface FireTruck {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  heading: number;
  distanceM: number;
  speedKmh: number;
  etaSeconds: number;
  status: TruckStatus;
  type: TruckType;
}

export const FIRE_TRUCKS: FireTruck[] = [
  {
    id: "truck-1",
    callsign: "ENGINE-7",
    lat: 40.1152,
    lng: -88.2231,
    heading: 210,
    distanceM: 180,
    speedKmh: 0,
    etaSeconds: 0,
    status: "ON_SCENE",
    type: "ENGINE",
  },
  {
    id: "truck-2",
    callsign: "LADDER-3",
    lat: 40.1121,
    lng: -88.2275,
    heading: 45,
    distanceM: 320,
    speedKmh: 35,
    etaSeconds: 33,
    status: "RESPONDING",
    type: "LADDER",
  },
  {
    id: "truck-3",
    callsign: "RESCUE-1",
    lat: 40.1160,
    lng: -88.2210,
    heading: 260,
    distanceM: 410,
    speedKmh: 0,
    etaSeconds: 0,
    status: "STAGED",
    type: "RESCUE",
  },
  {
    id: "truck-4",
    callsign: "HAZ-12",
    lat: 40.1115,
    lng: -88.2265,
    heading: 15,
    distanceM: 250,
    speedKmh: 42,
    etaSeconds: 21,
    status: "RESPONDING",
    type: "HAZMAT",
  },
] as const;

// ---------------------------------------------------------------------------
// Heat map data — concentrated fire zone around incident center
// ---------------------------------------------------------------------------
export const HEAT_MAP_POINTS: [number, number, number][] = [
  // Core (high intensity)
  [40.1138, -88.2249, 1.0],
  [40.1139, -88.2247, 0.95],
  [40.1137, -88.2251, 0.92],
  [40.1140, -88.2249, 0.88],
  [40.1138, -88.2246, 0.85],
  // Inner ring
  [40.1141, -88.2244, 0.7],
  [40.1135, -88.2253, 0.68],
  [40.1142, -88.2251, 0.62],
  [40.1134, -88.2245, 0.6],
  [40.1139, -88.2255, 0.55],
  // Outer ring (diminishing)
  [40.1145, -88.2240, 0.35],
  [40.1131, -88.2258, 0.32],
  [40.1146, -88.2255, 0.28],
  [40.1130, -88.2242, 0.25],
  [40.1135, -88.2260, 0.2],
  [40.1143, -88.2236, 0.18],
];

export const HEAT_GRADIENT: Record<number, string> = {
  0.0: "transparent",
  0.2: FIRE_COLORS.AMBER,
  0.45: FIRE_COLORS.ORANGE,
  0.7: FIRE_COLORS.RED,
  1.0: "#FF1A1A",
};

export const HEAT_LAYER_OPTIONS = {
  radius: 35,
  blur: 25,
  maxZoom: 17,
  minOpacity: 0.3,
} as const;

// ---------------------------------------------------------------------------
// Incident data
// ---------------------------------------------------------------------------
export type SeverityLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export interface IncidentData {
  id: string;
  buildingName: string;
  address: string;
  fireStatus: string;
  severity: SeverityLevel;
  alarmLevel: number;
  structuralIntegrity: number;
  temperatures: {
    roof: number;
    interior: number;
    exterior: number;
  };
  occupancyEstimate: number;
  activeFloors: string;
  spreadDirection: string;
  windSpeed: number;
  windDirection: string;
  dispatchTime: string;
  elapsedTime: string;
  sector: string;
}

export const INCIDENT_DATA: IncidentData = {
  id: "INC-2026-0228-ALPHA",
  buildingName: "Siebel Center for CS",
  address: "201 N Goodwin Ave, Urbana, IL",
  fireStatus: "ACTIVE — 2ND FLOOR ENGULFED",
  severity: "CRITICAL",
  alarmLevel: 3,
  structuralIntegrity: 64,
  temperatures: {
    roof: 1040,
    interior: 870,
    exterior: 340,
  },
  occupancyEstimate: 12,
  activeFloors: "2F, 3F (partial)",
  spreadDirection: "NE @ 2.1 m/min",
  windSpeed: 18,
  windDirection: "SW",
  dispatchTime: "14:32:07 CST",
  elapsedTime: "00:17:43",
  sector: "SECTOR 7-ALPHA",
};

// ---------------------------------------------------------------------------
// Status color maps
// ---------------------------------------------------------------------------
export const TRUCK_STATUS_COLORS: Record<TruckStatus, string> = {
  RESPONDING: FIRE_COLORS.ORANGE,
  ON_SCENE: FIRE_COLORS.RED,
  STAGED: FIRE_COLORS.AMBER,
};

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  CRITICAL: "var(--fire-red)",
  HIGH: "var(--fire-orange)",
  MODERATE: "var(--fire-amber)",
  LOW: "var(--fire-yellow)",
};

export const SEVERITY_TEXT_CLASSES: Record<SeverityLevel, string> = {
  CRITICAL: "text-[var(--fire-red)]",
  HIGH: "text-[var(--fire-orange)]",
  MODERATE: "text-[var(--fire-amber)]",
  LOW: "text-[var(--fire-yellow)]",
};
