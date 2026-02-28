// ---------------------------------------------------------------------------
// World Labs Marble API client
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.worldlabs.ai/marble/v1";
const MODEL = "Marble 0.1-plus" as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorldAssets {
  thumbnail_url?: string | null;
  caption?: string | null;
  imagery?: { pano_url?: string | null } | null;
  mesh?: { collider_mesh_url?: string | null } | null;
  splats?: { spz_urls?: Record<string, string> | null } | null;
}

export interface World {
  world_id: string;
  display_name: string;
  world_marble_url: string;
  model?: string | null;
  tags?: string[] | null;
  assets?: WorldAssets | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ListWorldsResponse {
  worlds: World[];
  next_page_token?: string | null;
}

export interface GenerateWorldResponse {
  operation_id: string;
  done: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
}

export interface OperationError {
  code?: number | null;
  message?: string | null;
}

export interface GetOperationResponse {
  operation_id: string;
  done: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  error?: OperationError | null;
  metadata?: Record<string, unknown> | null;
  response?: World | null;
}

/** Coordinates parsed from a world's display_name. */
export interface ParsedWorldLocation {
  world: World;
  lat: number;
  lng: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Pending operation stored in localStorage
// ---------------------------------------------------------------------------

export interface PendingScenario {
  operationId: string;
  displayName: string;
  buildingName: string;
  prompt: string;
  lat: number;
  lng: number;
  createdAt: string; // ISO timestamp
}

const PENDING_STORAGE_KEY = "worldlabs_pending_scenarios";

export function loadPendingScenarios(): PendingScenario[] {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingScenario[];
  } catch {
    return [];
  }
}

export function savePendingScenarios(scenarios: PendingScenario[]): void {
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(scenarios));
}

export function addPendingScenario(scenario: PendingScenario): void {
  const existing = loadPendingScenarios();
  existing.push(scenario);
  savePendingScenarios(existing);
}

export function removePendingScenario(operationId: string): void {
  const existing = loadPendingScenarios();
  savePendingScenarios(existing.filter((s) => s.operationId !== operationId));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_WORLDLABS_API_KEY ?? "";
  if (!key) throw new Error("NEXT_PUBLIC_WORLDLABS_API_KEY is not set");
  return key;
}

function apiHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "WLT-Api-Key": getApiKey(),
  };
}

// ---------------------------------------------------------------------------
// Coordinate regex — matches "Name (lat, lng)" at end of display_name
// ---------------------------------------------------------------------------
const COORD_REGEX = /^(.+?)\s*\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)$/;

export function parseWorldCoordinates(world: World): ParsedWorldLocation | null {
  const match = world.display_name.match(COORD_REGEX);
  if (!match) return null;

  const label = match[1].trim();
  const lat = parseFloat(match[2]);
  const lng = parseFloat(match[3]);

  if (isNaN(lat) || isNaN(lng)) return null;

  return { world, lat, lng, label };
}

export function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export async function listWorlds(
  status: "SUCCEEDED" | "PENDING" | "FAILED" | "RUNNING" = "SUCCEEDED",
  pageSize = 100
): Promise<ListWorldsResponse> {
  const res = await fetch(`${BASE_URL}/worlds:list`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      status,
      page_size: pageSize,
      sort_by: "created_at",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`listWorlds failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function getWorld(worldId: string): Promise<World> {
  const res = await fetch(`${BASE_URL}/worlds/${worldId}`, {
    method: "GET",
    headers: apiHeaders(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`getWorld failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function getOperation(operationId: string): Promise<GetOperationResponse> {
  const res = await fetch(`${BASE_URL}/operations/${operationId}`, {
    method: "GET",
    headers: apiHeaders(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`getOperation failed (${res.status}): ${body}`);
  }

  return res.json();
}

export interface GenerateWorldParams {
  displayName: string;
  textPrompt: string;
  images: { url: string; heading: number }[];
}

export async function generateWorld(
  params: GenerateWorldParams
): Promise<GenerateWorldResponse> {
  const multiImagePrompt = params.images.map((img) => ({
    azimuth: img.heading,
    content: {
      source: "uri" as const,
      uri: img.url,
    },
  }));

  const res = await fetch(`${BASE_URL}/worlds:generate`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      display_name: params.displayName,
      model: MODEL,
      world_prompt: {
        type: "multi-image",
        multi_image_prompt: multiImagePrompt,
        reconstruct_images: false,
        text_prompt: params.textPrompt,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`generateWorld failed (${res.status}): ${body}`);
  }

  return res.json();
}
