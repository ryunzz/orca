import {
  STREETVIEW_IMAGE_SIZE,
  STREETVIEW_FOV,
  STREETVIEW_PITCH,
  STREETVIEW_OFFSET_RADIUS_M,
  STREETVIEW_HEADINGS,
} from "@/lib/dashboard-constants";

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
const STREETVIEW_BASE = "https://maps.googleapis.com/maps/api/streetview";
const STREETVIEW_META = `${STREETVIEW_BASE}/metadata`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface StreetViewImage {
  url: string;
  heading: number;
  type: "center" | "offset";
  lat: number;
  lng: number;
  available: boolean;
}

export interface StreetViewResult {
  buildingName: string;
  coordinates: [number, number]; // [lng, lat] MapBox format
  images: StreetViewImage[];
}

interface MetadataResponse {
  status: string;
  pano_id?: string;
  location?: { lat: number; lng: number };
}

// ---------------------------------------------------------------------------
// Geo math helpers
// ---------------------------------------------------------------------------
const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Compute a point offset from (lat, lng) by `distanceMeters` along `bearingDeg`. */
function offsetPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const latRad = lat * DEG_TO_RAD;
  const lngRad = lng * DEG_TO_RAD;
  const bearingRad = bearingDeg * DEG_TO_RAD;
  const angularDist = distanceMeters / EARTH_RADIUS_M;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
      Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearingRad)
  );

  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(latRad),
      Math.cos(angularDist) - Math.sin(latRad) * Math.sin(newLatRad)
    );

  return [newLatRad * RAD_TO_DEG, newLngRad * RAD_TO_DEG];
}

/** Bearing (degrees) from point A to point B. */
function headingToTarget(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const dLng = (toLng - fromLng) * DEG_TO_RAD;
  const fromLatRad = fromLat * DEG_TO_RAD;
  const toLatRad = toLat * DEG_TO_RAD;

  const x = Math.sin(dLng) * Math.cos(toLatRad);
  const y =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLng);

  return ((Math.atan2(x, y) * RAD_TO_DEG) + 360) % 360;
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------
function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_STREETVIEW_API_KEY ?? "";
  if (!key) {
    console.warn("[Street View] NEXT_PUBLIC_GOOGLE_STREETVIEW_API_KEY is not set");
  }
  return key;
}

function buildImageUrl(lat: number, lng: number, heading: number): string {
  const params = new URLSearchParams({
    size: STREETVIEW_IMAGE_SIZE,
    location: `${lat},${lng}`,
    heading: String(Math.round(heading)),
    pitch: String(STREETVIEW_PITCH),
    fov: String(STREETVIEW_FOV),
    key: getApiKey(),
  });
  return `${STREETVIEW_BASE}?${params.toString()}`;
}

function buildMetaUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    key: getApiKey(),
  });
  return `${STREETVIEW_META}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Metadata check
// ---------------------------------------------------------------------------
async function checkAvailability(lat: number, lng: number): Promise<boolean> {
  try {
    const res = await fetch(buildMetaUrl(lat, lng));
    if (!res.ok) return false;
    const data: MetadataResponse = await res.json();
    return data.status === "OK";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fetch Street View imagery from all angles around a building.
 *
 * Generates two sets of viewpoints:
 * 1. **Center** — 8 headings from the building's coordinates (snaps to nearest panorama)
 * 2. **Offset** — 8 points on a ring ~50m out, each looking back at the building
 *
 * Returns structured result with availability status per image.
 *
 * @param coordinates  [lng, lat] — MapBox coordinate order
 * @param buildingName Human-readable building label
 */
export async function fetchBuildingStreetView(
  coordinates: [number, number],
  buildingName: string
): Promise<StreetViewResult> {
  const [lng, lat] = coordinates;

  // Build candidate list ------------------------------------------------
  const candidates: Omit<StreetViewImage, "available">[] = [];

  // Center panoramic — 8 headings from building location
  for (const heading of STREETVIEW_HEADINGS) {
    candidates.push({
      url: buildImageUrl(lat, lng, heading),
      heading,
      type: "center",
      lat,
      lng,
    });
  }

  // Offset ring — 8 points on circle, heading toward center
  for (const bearing of STREETVIEW_HEADINGS) {
    const [offLat, offLng] = offsetPoint(lat, lng, bearing, STREETVIEW_OFFSET_RADIUS_M);
    const heading = headingToTarget(offLat, offLng, lat, lng);
    candidates.push({
      url: buildImageUrl(offLat, offLng, heading),
      heading,
      type: "offset",
      lat: offLat,
      lng: offLng,
    });
  }

  // Check availability in parallel --------------------------------------
  const uniqueLocations = new Map<string, boolean>();
  const locationKeys = candidates.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`);

  // Deduplicate metadata checks (center images share the same location)
  const checksNeeded = [...new Set(locationKeys)];
  const results = await Promise.all(
    checksNeeded.map(async (key) => {
      const [latStr, lngStr] = key.split(",");
      const available = await checkAvailability(Number(latStr), Number(lngStr));
      return [key, available] as const;
    })
  );
  for (const [key, available] of results) {
    uniqueLocations.set(key, available);
  }

  // Merge availability into candidates ----------------------------------
  const images: StreetViewImage[] = candidates.map((c, idx) => ({
    ...c,
    available: uniqueLocations.get(locationKeys[idx]) ?? false,
  }));

  return {
    buildingName,
    coordinates,
    images,
  };
}
