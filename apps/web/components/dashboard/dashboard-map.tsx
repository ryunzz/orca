"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { toast } from "sonner";

import {
  MAPBOX_STYLE,
  MAPBOX_CENTER,
  MAPBOX_DEFAULT_ZOOM,
  MAPBOX_DEFAULT_PITCH,
  MAPBOX_DEFAULT_BEARING,
  MAPBOX_MIN_ZOOM,
  MAPBOX_MAX_ZOOM,
  BUILDING_LAYER_ID,
  BUILDING_SOURCE,
  BUILDING_SOURCE_LAYER,
  BUILDING_COLOR_EXPRESSION,
  BUILDING_HIGHLIGHT_COLOR,
  BUILDING_EXTRUSION_OPACITY,
  BUILDING_VERTICAL_GRADIENT,
  BUILDING_AO_INTENSITY,
  BUILDING_AO_GROUND_RADIUS,
  BUILDING_AO_WALL_RADIUS,
  BUILDING_FLOOD_LIGHT_COLOR,
  BUILDING_FLOOD_LIGHT_INTENSITY,
  BUILDING_FLOOD_LIGHT_GROUND_RADIUS,
  AMBIENT_LIGHT,
  DIRECTIONAL_LIGHT,
  MAP_FOG_CONFIG,
  BASE_MAP_OVERRIDES,
} from "@/lib/dashboard-constants";

import { fetchBuildingStreetView } from "@/lib/street-view";
import { STREETVIEW_HEADINGS } from "@/lib/dashboard-constants";
import {
  generateWorld,
  listWorlds,
  getOperation,
  parseWorldCoordinates,
  coordKey,
  loadPendingScenarios,
  addPendingScenario,
  removePendingScenario,
  type ParsedWorldLocation,
  type PendingScenario,
} from "@/lib/worldlabs";
import { useAnalysisContext } from "@/contexts/analysis-context";
import {
  BuildingPromptDialog,
  type SelectedBuilding,
} from "./building-prompt-dialog";
import { MapSearch } from "./map-search";

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// ---------------------------------------------------------------------------
// Polling interval
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// Apply warm color overrides to dark-v11 base layers
// ---------------------------------------------------------------------------
function applyBaseMapOverrides(map: mapboxgl.Map) {
  const layers = map.getStyle().layers;
  if (!layers) return;

  for (const layer of layers) {
    const id = layer.id;

    if (layer.type === "background") {
      map.setPaintProperty(id, "background-color", BASE_MAP_OVERRIDES.background);
      continue;
    }

    if (id.includes("water") && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", BASE_MAP_OVERRIDES.water);
      continue;
    }

    if (id.startsWith("road") && layer.type === "line") {
      if (id.includes("motorway") || id.includes("trunk")) {
        map.setPaintProperty(id, "line-color", BASE_MAP_OVERRIDES.roadHighway);
      } else if (id.includes("primary") || id.includes("secondary")) {
        map.setPaintProperty(id, "line-color", BASE_MAP_OVERRIDES.roadMajor);
      } else {
        map.setPaintProperty(id, "line-color", BASE_MAP_OVERRIDES.roadMinor);
      }
      continue;
    }

    if (id.startsWith("landuse") && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", BASE_MAP_OVERRIDES.landuse);
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Compute the centroid of a building polygon for a stable coordinate key
// ---------------------------------------------------------------------------
function computeBuildingCentroid(
  feature: mapboxgl.GeoJSONFeature
): [number, number] | null {
  const geom = feature.geometry;
  let ring: number[][] | undefined;

  if (geom.type === "Polygon") {
    ring = geom.coordinates[0] as number[][];
  } else if (geom.type === "MultiPolygon") {
    ring = geom.coordinates[0][0] as number[][];
  }

  if (!ring || ring.length === 0) return null;

  let sumLng = 0;
  let sumLat = 0;
  for (const coord of ring) {
    sumLng += coord[0];
    sumLat += coord[1];
  }

  return [sumLng / ring.length, sumLat / ring.length];
}

// ---------------------------------------------------------------------------
// Create a DOM element for a completed world marker
// ---------------------------------------------------------------------------
function createWorldMarkerElement(loc: ParsedWorldLocation): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "world-marker";
  el.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    pointer-events: auto;
    transform: translate(-50%, -100%);
  `;

  // --- Card container ---
  const card = document.createElement("div");
  card.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: oklch(0.16 0.01 45 / 88%);
    border: 1px solid oklch(1 0 0 / 10%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow:
      0 0 24px oklch(0.752 0.217 52.149 / 8%),
      0 4px 16px oklch(0 0 0 / 35%);
  `;

  // Top accent gradient
  const accent = document.createElement("div");
  accent.style.cssText = `
    position: absolute;
    inset: 0;
    top: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, oklch(0.752 0.217 52.149), oklch(0.82 0.19 84.429), transparent);
    opacity: 0.8;
  `;
  card.appendChild(accent);

  // Label row
  const labelRow = document.createElement("div");
  labelRow.style.cssText = `
    padding: 8px 12px 4px 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  `;

  // Status dot (solid = completed)
  const statusDot = document.createElement("div");
  statusDot.style.cssText = `
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: oklch(0.792 0.209 151.711);
    box-shadow: 0 0 6px oklch(0.792 0.209 151.711 / 60%);
    flex-shrink: 0;
  `;
  labelRow.appendChild(statusDot);

  const label = document.createElement("div");
  label.style.cssText = `
    font-family: var(--font-geist-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: oklch(0.92 0 0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  `;
  label.textContent = loc.label;
  labelRow.appendChild(label);
  card.appendChild(labelRow);

  // Status text
  const statusText = document.createElement("div");
  statusText.style.cssText = `
    font-family: var(--font-geist-mono, monospace);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: oklch(0.792 0.209 151.711 / 80%);
    padding: 0 12px 6px 23px;
  `;
  statusText.textContent = "Scenario Ready";
  card.appendChild(statusText);

  // View button
  const btn = document.createElement("a");
  btn.href = `/worlds/${loc.world.world_id}`;
  btn.style.cssText = `
    display: block;
    font-family: var(--font-geist-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    text-decoration: none;
    text-align: center;
    color: oklch(0.752 0.217 52.149);
    background: oklch(0.752 0.217 52.149 / 8%);
    border-top: 1px solid oklch(1 0 0 / 6%);
    padding: 6px 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  `;
  btn.textContent = "View Scenario";
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "oklch(0.752 0.217 52.149 / 20%)";
    btn.style.color = "oklch(0.82 0.19 84.429)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "oklch(0.752 0.217 52.149 / 8%)";
    btn.style.color = "oklch(0.752 0.217 52.149)";
  });
  card.appendChild(btn);

  el.appendChild(card);

  // --- Tether: gradient stem + glowing base ---
  const stem = document.createElement("div");
  stem.style.cssText = `
    width: 1px;
    height: 32px;
    background: linear-gradient(to bottom, oklch(0.752 0.217 52.149 / 60%), oklch(0.752 0.217 52.149 / 10%));
  `;
  el.appendChild(stem);

  // Base anchor container (holds dot + ping ring)
  const baseAnchor = document.createElement("div");
  baseAnchor.style.cssText = `
    position: relative;
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Ping ring
  const pingRing = document.createElement("div");
  pingRing.style.cssText = `
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid oklch(0.752 0.217 52.149 / 50%);
    animation: scenario-ping 2.5s ease-out infinite;
  `;
  baseAnchor.appendChild(pingRing);

  // Center dot
  const dot = document.createElement("div");
  dot.style.cssText = `
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: oklch(0.752 0.217 52.149);
    box-shadow: 0 0 10px oklch(0.752 0.217 52.149 / 70%);
  `;
  baseAnchor.appendChild(dot);

  el.appendChild(baseAnchor);

  return el;
}

// ---------------------------------------------------------------------------
// Create a DOM element for a pending (generating) scenario marker
// ---------------------------------------------------------------------------
function createPendingMarkerElement(scenario: PendingScenario): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "world-marker world-marker--pending";
  el.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: auto;
    transform: translate(-50%, -100%);
  `;

  // --- Card container ---
  const card = document.createElement("div");
  card.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: oklch(0.16 0.01 45 / 85%);
    border: 1px solid oklch(1 0 0 / 8%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow:
      0 0 20px oklch(0.82 0.19 84.429 / 6%),
      0 4px 16px oklch(0 0 0 / 30%);
  `;

  // Top accent gradient (amber tones for pending)
  const accent = document.createElement("div");
  accent.style.cssText = `
    position: absolute;
    inset: 0;
    top: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, oklch(0.82 0.19 84.429 / 60%), oklch(0.905 0.182 98.111 / 50%), transparent);
    opacity: 0.7;
  `;
  card.appendChild(accent);

  // Label row
  const labelRow = document.createElement("div");
  labelRow.style.cssText = `
    padding: 8px 12px 4px 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  `;

  // Spinner (rotating ring)
  const spinner = document.createElement("div");
  spinner.style.cssText = `
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid oklch(0.82 0.19 84.429 / 20%);
    border-top-color: oklch(0.82 0.19 84.429);
    flex-shrink: 0;
    animation: scenario-spin 0.8s linear infinite;
  `;
  labelRow.appendChild(spinner);

  const label = document.createElement("div");
  label.style.cssText = `
    font-family: var(--font-geist-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: oklch(0.78 0 0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  `;
  label.textContent = scenario.buildingName;
  labelRow.appendChild(label);
  card.appendChild(labelRow);

  // Status text with breathing animation
  const statusText = document.createElement("div");
  statusText.style.cssText = `
    font-family: var(--font-geist-mono, monospace);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: oklch(0.82 0.19 84.429 / 70%);
    padding: 0 12px 8px 28px;
    animation: scenario-breathe 2s ease-in-out infinite;
  `;
  statusText.textContent = "Generating Scenario...";
  card.appendChild(statusText);

  el.appendChild(card);

  // --- Tether: dashed stem + pulsing base ---
  const stem = document.createElement("div");
  stem.style.cssText = `
    width: 0;
    height: 32px;
    border-left: 1px dashed oklch(0.82 0.19 84.429 / 35%);
  `;
  el.appendChild(stem);

  // Base anchor container
  const baseAnchor = document.createElement("div");
  baseAnchor.style.cssText = `
    position: relative;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Ping ring (pulsing outward)
  const pingRing = document.createElement("div");
  pingRing.style.cssText = `
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid oklch(0.82 0.19 84.429 / 40%);
    animation: scenario-ping 2s ease-out infinite;
  `;
  baseAnchor.appendChild(pingRing);

  // Center dot with breathing glow
  const dot = document.createElement("div");
  dot.style.cssText = `
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: oklch(0.82 0.19 84.429);
    box-shadow: 0 0 8px oklch(0.82 0.19 84.429 / 50%);
    animation: scenario-breathe 2s ease-in-out infinite;
  `;
  baseAnchor.appendChild(dot);

  el.appendChild(baseAnchor);

  return el;
}

// ---------------------------------------------------------------------------
// DashboardMap
// ---------------------------------------------------------------------------
export function DashboardMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [selectedBuilding, setSelectedBuilding] =
    useState<SelectedBuilding | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [statusText, setStatusText] = useState("");
  const highlightedIdRef = useRef<string | number | null>(null);

  // Analysis data from backend (auto-starts demo on connect).
  // incidentData + analysisState drive dashboard panels when they're added.
  const _analysis = useAnalysisContext();
  void _analysis;

  // Markers for completed worlds
  const worldMarkersRef = useRef<mapboxgl.Marker[]>([]);
  // Markers for pending scenarios (keyed by operationId)
  const pendingMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // Set of coordinate keys "lat,lng" that are claimed (completed + pending)
  const claimedCoordsRef = useRef<Set<string>>(new Set());
  // Polling interval handle
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Reset building highlight
  // -----------------------------------------------------------------------
  const resetHighlight = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(BUILDING_LAYER_ID)) return;

    map.setPaintProperty(BUILDING_LAYER_ID, "fill-extrusion-color", BUILDING_COLOR_EXPRESSION);
    highlightedIdRef.current = null;
  }, []);

  // -----------------------------------------------------------------------
  // Close dialog + reset highlight
  // -----------------------------------------------------------------------
  const handleClose = useCallback(() => {
    setSelectedBuilding(null);
    resetHighlight();
  }, [resetHighlight]);

  // -----------------------------------------------------------------------
  // Render completed world markers on the map
  // -----------------------------------------------------------------------
  const renderCompletedMarkers = useCallback(
    (map: mapboxgl.Map, locations: ParsedWorldLocation[]) => {
      // Remove old completed markers
      for (const marker of worldMarkersRef.current) {
        marker.remove();
      }
      worldMarkersRef.current = [];

      for (const loc of locations) {
        const el = createWorldMarkerElement(loc);
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: "bottom",
          offset: [0, -40],
        })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);

        worldMarkersRef.current.push(marker);
      }
    },
    []
  );

  // -----------------------------------------------------------------------
  // Render a single pending marker on the map
  // -----------------------------------------------------------------------
  const addPendingMarker = useCallback(
    (map: mapboxgl.Map, scenario: PendingScenario) => {
      // Don't double-add
      if (pendingMarkersRef.current.has(scenario.operationId)) return;

      const el = createPendingMarkerElement(scenario);
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
        offset: [0, -40],
      })
        .setLngLat([scenario.lng, scenario.lat])
        .addTo(map);

      pendingMarkersRef.current.set(scenario.operationId, marker);
    },
    []
  );

  // -----------------------------------------------------------------------
  // Remove a pending marker
  // -----------------------------------------------------------------------
  const removePendingMarker = useCallback((operationId: string) => {
    const marker = pendingMarkersRef.current.get(operationId);
    if (marker) {
      marker.remove();
      pendingMarkersRef.current.delete(operationId);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Rebuild the claimed coordinates set from completed + pending
  // -----------------------------------------------------------------------
  const rebuildClaimedCoords = useCallback(
    (completedLocations: ParsedWorldLocation[]) => {
      const claimed = new Set<string>();

      // Completed worlds
      for (const loc of completedLocations) {
        claimed.add(coordKey(loc.lat, loc.lng));
      }

      // Pending scenarios from localStorage
      for (const scenario of loadPendingScenarios()) {
        claimed.add(coordKey(scenario.lat, scenario.lng));
      }

      claimedCoordsRef.current = claimed;
    },
    []
  );

  // -----------------------------------------------------------------------
  // Load completed worlds, render markers, rebuild claims
  // -----------------------------------------------------------------------
  const loadWorldMarkers = useCallback(
    async (map: mapboxgl.Map) => {
      try {
        const response = await listWorlds();
        const locations: ParsedWorldLocation[] = [];

        for (const world of response.worlds) {
          const parsed = parseWorldCoordinates(world);
          if (parsed) locations.push(parsed);
        }

        renderCompletedMarkers(map, locations);
        rebuildClaimedCoords(locations);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.warn(`[WorldLabs] Failed to load worlds: ${msg}`);
      }
    },
    [renderCompletedMarkers, rebuildClaimedCoords]
  );

  // -----------------------------------------------------------------------
  // Poll all pending scenarios — runs on an interval
  // -----------------------------------------------------------------------
  const pollPendingScenarios = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const pending = loadPendingScenarios();
    if (pending.length === 0) return;

    for (const scenario of pending) {
      try {
        const op = await getOperation(scenario.operationId);

        if (!op.done) continue;

        // Operation finished — remove from localStorage + pending marker
        removePendingScenario(scenario.operationId);
        removePendingMarker(scenario.operationId);

        if (op.error) {
          const errMsg = op.error.message ?? "Unknown error";
          toast.error(`Scenario failed for ${scenario.buildingName}: ${errMsg}`);
        } else {
          toast.success(`Scenario ready for ${scenario.buildingName}`);
          // Refresh completed markers to pick up the new world
          await loadWorldMarkers(map);
        }
      } catch {
        // Network error polling — leave it in localStorage for next tick
      }
    }
  }, [removePendingMarker, loadWorldMarkers]);

  // -----------------------------------------------------------------------
  // Start/stop polling lifecycle
  // -----------------------------------------------------------------------
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(pollPendingScenarios, POLL_INTERVAL_MS);
  }, [pollPendingScenarios]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Submit handler
  // -----------------------------------------------------------------------
  const handlePromptSubmit = useCallback(
    async (prompt: string) => {
      if (!selectedBuilding) return;

      console.log(`[dashboard] Pipeline started — "${selectedBuilding.name}"`);

      // Phase 1: Fetch street view images and log URLs
      setStatusText("Fetching views...");
      let result;
      try {
        result = await fetchBuildingStreetView(
          selectedBuilding.coordinates,
          selectedBuilding.name
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[dashboard] Street view fetch failed: ${msg}`);
        toast.error(`Failed to fetch street view images: ${msg}`);
        setStatusText("");
        handleClose();
        return;
      }

      // Log all 8 center Street View URLs for reference
      const ALL_HEADINGS = new Set(STREETVIEW_HEADINGS as readonly number[]);
      const centerImages = result.images.filter(
        (i: { available: boolean; type: string; heading: number }) =>
          i.type === "center" && ALL_HEADINGS.has(i.heading)
      );
      console.log("[dashboard] Street View URLs (8 headings):");
      for (const img of centerImages) {
        console.log(`  heading=${img.heading}° available=${img.available} → ${img.url}`);
      }

      const [lng, lat] = selectedBuilding.coordinates;
      const displayName = `${result.buildingName} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      try {
        // Phase 2: Load static images from /public/images/ and convert to data URIs
        setStatusText("Loading images...");
        const headingOrder = [0, 45, 90, 135, 180, 225, 270, 315];

        const staticImages = await Promise.all(
          headingOrder.map(async (heading, i) => {
            const imgPath = `/images/UIUC_${i + 1}.png`;
            const res = await fetch(imgPath);
            if (!res.ok) {
              throw new Error(`Static image not found: ${imgPath} (${res.status})`);
            }
            const blob = await res.blob();
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""),
            );
            const mimeType = blob.type || "image/png";
            return { url: `data:${mimeType};base64,${base64}`, heading };
          }),
        );

        console.log(`[dashboard] Loaded ${staticImages.length} static images as data URIs`);

        // Phase 3: Send images to World Labs
        setStatusText("Creating 3D world...");
        const response = await generateWorld({
          displayName,
          textPrompt: prompt,
          images: staticImages,
        });
        console.log(`[dashboard] World created — op=${response.operation_id}`);

        // Save to localStorage
        const scenario: PendingScenario = {
          operationId: response.operation_id,
          displayName,
          buildingName: result.buildingName,
          prompt,
          lat,
          lng,
          createdAt: new Date().toISOString(),
        };
        addPendingScenario(scenario);

        // Claim this coordinate immediately
        claimedCoordsRef.current.add(coordKey(lat, lng));

        // Add pending marker to the map
        if (mapRef.current) {
          addPendingMarker(mapRef.current, scenario);
        }

        // Start polling if not already running
        startPolling();

        setStatusText("");
        handleClose();
        toast.success(`Scenario is being created for ${result.buildingName}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[dashboard] Pipeline failed: ${message}`);
        setStatusText("");
        handleClose();
        toast.error(`Scenario creation failed: ${message}`);
      }
    },
    [handleClose, selectedBuilding, addPendingMarker, startPolling]
  );

  // -----------------------------------------------------------------------
  // Map initialization
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: MAPBOX_CENTER,
      zoom: MAPBOX_DEFAULT_ZOOM,
      pitch: MAPBOX_DEFAULT_PITCH,
      bearing: MAPBOX_DEFAULT_BEARING,
      minZoom: MAPBOX_MIN_ZOOM,
      maxZoom: MAPBOX_MAX_ZOOM,
      antialias: true,
    });

    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "bottom-right"
    );

    map.on("style.load", () => {
      const layers = map.getStyle().layers;
      let firstSymbolId: string | undefined;
      if (layers) {
        for (const layer of layers) {
          if (layer.type === "symbol") {
            firstSymbolId = layer.id;
            break;
          }
        }
      }

      map.addLayer(
        {
          id: BUILDING_LAYER_ID,
          source: BUILDING_SOURCE,
          "source-layer": BUILDING_SOURCE_LAYER,
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": BUILDING_COLOR_EXPRESSION,
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14,
              0,
              14.5,
              ["get", "height"],
            ],
            "fill-extrusion-base": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14,
              0,
              14.5,
              ["get", "min_height"],
            ],
            "fill-extrusion-opacity": BUILDING_EXTRUSION_OPACITY,
            "fill-extrusion-vertical-gradient": BUILDING_VERTICAL_GRADIENT,
            "fill-extrusion-ambient-occlusion-intensity": BUILDING_AO_INTENSITY,
            "fill-extrusion-ambient-occlusion-ground-radius": BUILDING_AO_GROUND_RADIUS,
            "fill-extrusion-ambient-occlusion-wall-radius": BUILDING_AO_WALL_RADIUS,
            "fill-extrusion-flood-light-color": BUILDING_FLOOD_LIGHT_COLOR,
            "fill-extrusion-flood-light-intensity": BUILDING_FLOOD_LIGHT_INTENSITY,
            "fill-extrusion-flood-light-ground-radius": BUILDING_FLOOD_LIGHT_GROUND_RADIUS,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        },
        firstSymbolId
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setLights([AMBIENT_LIGHT, DIRECTIONAL_LIGHT]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setFog(MAP_FOG_CONFIG);
      applyBaseMapOverrides(map);

      setMapReady(true);

      // Load completed worlds
      loadWorldMarkers(map);

      // Restore pending scenario markers from localStorage and start polling
      const pending = loadPendingScenarios();
      if (pending.length > 0) {
        for (const scenario of pending) {
          addPendingMarker(map, scenario);
        }
        startPolling();
      }

      // ----- Building click -----
      map.on("click", BUILDING_LAYER_ID, (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];

        // Use polygon centroid for a stable key per building
        const centroid = computeBuildingCentroid(feature);
        const [cLng, cLat] = centroid ?? [e.lngLat.lng, e.lngLat.lat];
        const key = coordKey(cLat, cLng);

        // If this location already has a scenario, fly to it and highlight
        if (claimedCoordsRef.current.has(key)) {
          let markerEl: HTMLElement | null = null;
          let markerLngLat: [number, number] | null = null;

          // Check completed markers
          for (const marker of worldMarkersRef.current) {
            const ll = marker.getLngLat();
            if (coordKey(ll.lat, ll.lng) === key) {
              markerEl = marker.getElement();
              markerLngLat = [ll.lng, ll.lat];
              break;
            }
          }

          // Check pending markers
          if (!markerEl) {
            for (const marker of pendingMarkersRef.current.values()) {
              const ll = marker.getLngLat();
              if (coordKey(ll.lat, ll.lng) === key) {
                markerEl = marker.getElement();
                markerLngLat = [ll.lng, ll.lat];
                break;
              }
            }
          }

          // Fly to the marker and play highlight animation
          if (markerLngLat) {
            map.flyTo({
              center: markerLngLat,
              zoom: Math.max(map.getZoom(), 16.5),
              duration: 800,
              essential: true,
            });
          }

          if (markerEl) {
            const el = markerEl;
            el.style.animation = "none";
            void el.offsetHeight;
            el.style.animation = "scenario-highlight 1s ease-out forwards";
            el.addEventListener(
              "animationend",
              () => { el.style.animation = ""; },
              { once: true }
            );
          }

          return;
        }

        const featureId = feature.id ?? feature.properties?.osm_id ?? null;
        const buildingName =
          feature.properties?.name || feature.properties?.type || "Building";

        if (featureId != null) {
          map.setPaintProperty(BUILDING_LAYER_ID, "fill-extrusion-color", [
            "case",
            ["==", ["id"], featureId],
            BUILDING_HIGHLIGHT_COLOR,
            BUILDING_COLOR_EXPRESSION,
          ]);
          highlightedIdRef.current = featureId;
        }

        setSelectedBuilding({
          name: buildingName,
          coordinates: [cLng, cLat],
          screenX: e.point.x,
          screenY: e.point.y,
        });
      });

      // ----- Click on empty space → close dialog -----
      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [BUILDING_LAYER_ID],
        });
        if (!features || features.length === 0) {
          setSelectedBuilding(null);
          if (highlightedIdRef.current != null) {
            map.setPaintProperty(
              BUILDING_LAYER_ID,
              "fill-extrusion-color",
              BUILDING_COLOR_EXPRESSION
            );
            highlightedIdRef.current = null;
          }
        }
      });

      map.on("mouseenter", BUILDING_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", BUILDING_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      for (const marker of worldMarkersRef.current) {
        marker.remove();
      }
      worldMarkersRef.current = [];
      for (const marker of pendingMarkersRef.current.values()) {
        marker.remove();
      }
      pendingMarkersRef.current.clear();
      mapRef.current = null;
      map.remove();
    };
  }, [loadWorldMarkers, addPendingMarker, startPolling]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <div ref={containerRef} className="map-canvas-boost h-full w-full" />
      <div className="map-warm-vignette" />

      {mapReady && mapRef.current && <MapSearch map={mapRef.current} />}

      <AnimatePresence>
        {selectedBuilding && (
          <BuildingPromptDialog
            key="building-dialog"
            building={selectedBuilding}
            onClose={handleClose}
            onSubmit={handlePromptSubmit}
            statusText={statusText}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
