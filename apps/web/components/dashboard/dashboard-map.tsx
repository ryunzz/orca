"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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
// Simulation submit handler
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Apply warm color overrides to dark-v11 base layers
// ---------------------------------------------------------------------------
function applyBaseMapOverrides(map: mapboxgl.Map) {
  const layers = map.getStyle().layers;
  if (!layers) return;

  for (const layer of layers) {
    const id = layer.id;

    // Background
    if (layer.type === "background") {
      map.setPaintProperty(id, "background-color", BASE_MAP_OVERRIDES.background);
      continue;
    }

    // Water fills
    if (id.includes("water") && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", BASE_MAP_OVERRIDES.water);
      continue;
    }

    // Road lines — warm up with contrast tiers
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

    // Land use fills (parks, commercial, etc.)
    if (id.startsWith("landuse") && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", BASE_MAP_OVERRIDES.landuse);
      continue;
    }
  }
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
  const highlightedIdRef = useRef<string | number | null>(null);

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
  // Submit handler
  // -----------------------------------------------------------------------
  const handlePromptSubmit = useCallback(
    async (_prompt: string) => {
      if (!selectedBuilding) return;

      const result = await fetchBuildingStreetView(
        selectedBuilding.coordinates,
        selectedBuilding.name
      );

      const available = result.images.filter((i) => i.available);

      console.log(`[Street View] Building: ${result.buildingName}`);
      console.log(`[Street View] Coordinates: ${result.coordinates}`);
      console.log(
        `[Street View] Available images: ${available.length}/${result.images.length}`
      );
      available.forEach((img, idx) => {
        console.log(
          `[Street View] Image ${idx + 1} (${img.type}, heading ${img.heading}°): ${img.url}`
        );
      });

      handleClose();
    },
    [handleClose, selectedBuilding]
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

    // Navigation control — bottom-right with pitch visualization
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "bottom-right"
    );

    // ----- On style.load: add 3D buildings -----
    map.on("style.load", () => {
      // Find the first symbol layer to insert buildings below labels
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

      // 3D lighting — ambient + directional with shadows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setLights([AMBIENT_LIGHT, DIRECTIONAL_LIGHT]);

      // Warm atmospheric fog — tints dark-v11 with warm undertones
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setFog(MAP_FOG_CONFIG);

      // Override dark-v11 base layer colors for warmer, more saturated look
      applyBaseMapOverrides(map);

      setMapReady(true);

      // ----- Building click -----
      map.on("click", BUILDING_LAYER_ID, (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const featureId = feature.id ?? feature.properties?.osm_id ?? null;
        const buildingName =
          feature.properties?.name || feature.properties?.type || "Building";

        // Highlight clicked building using data-driven paint
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
          coordinates: [e.lngLat.lng, e.lngLat.lat],
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

      // ----- Cursor changes on hover -----
      map.on("mouseenter", BUILDING_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", BUILDING_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* MapBox GL container — saturate + contrast boost to match fire theme */}
      <div ref={containerRef} className="map-canvas-boost h-full w-full" />

      {/* Warm edge vignette */}
      <div className="map-warm-vignette" />

      {/* Location search */}
      {mapReady && mapRef.current && <MapSearch map={mapRef.current} />}

      {/* Floating prompt dialog */}
      <AnimatePresence>
        {selectedBuilding && (
          <BuildingPromptDialog
            key="building-dialog"
            building={selectedBuilding}
            onClose={handleClose}
            onSubmit={handlePromptSubmit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
