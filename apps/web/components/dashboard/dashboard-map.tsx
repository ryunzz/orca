"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, ZoomControl, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  INCIDENT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MIN_ZOOM,
  MAP_MAX_ZOOM,
  TILE_URL,
  TILE_ATTRIBUTION,
  FIRE_TRUCKS,
  HEAT_MAP_POINTS,
  HEAT_GRADIENT,
  HEAT_LAYER_OPTIONS,
} from "@/lib/dashboard-constants";

import { FireHeatLayer } from "./fire-heat-layer";
import { FireTruckMarker } from "./fire-truck-marker";
import { IncidentPanel } from "./incident-panel";
import { DashboardHeader } from "./dashboard-header";
import { MapLegend } from "./map-legend";

// ---------------------------------------------------------------------------
// Framer Motion stagger variants
// ---------------------------------------------------------------------------
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

// ---------------------------------------------------------------------------
// Incident center marker icon
// ---------------------------------------------------------------------------
const incidentCenterIcon = L.divIcon({
  className: "",
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  html: `
    <div class="incident-center-marker" style="position: relative; width: 48px; height: 48px;">
      <div style="
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 10px; height: 10px;
        background: var(--fire-red);
        box-shadow: 0 0 12px var(--fire-red), 0 0 24px var(--fire-orange);
      "></div>
    </div>
  `,
});

// ---------------------------------------------------------------------------
// Heat layer options with gradient merged
// ---------------------------------------------------------------------------
const heatOptions = {
  ...HEAT_LAYER_OPTIONS,
  gradient: HEAT_GRADIENT,
};

// ---------------------------------------------------------------------------
// DashboardMap — main orchestrator
// ---------------------------------------------------------------------------
export function DashboardMap() {
  const center = useMemo<[number, number]>(
    () => [INCIDENT_CENTER.LAT, INCIDENT_CENTER.LNG],
    []
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="relative h-screen w-screen overflow-hidden bg-background"
    >
      {/* Leaflet map */}
      <MapContainer
        center={center}
        zoom={MAP_DEFAULT_ZOOM}
        minZoom={MAP_MIN_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        zoomControl={false}
        className="h-full w-full"
        attributionControl={true}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FireHeatLayer points={HEAT_MAP_POINTS} options={heatOptions} />
        <Marker position={center} icon={incidentCenterIcon} />
        {FIRE_TRUCKS.map((truck) => (
          <FireTruckMarker key={truck.id} truck={truck} />
        ))}
        <ZoomControl position="bottomright" />
      </MapContainer>

      {/* Floating overlays */}
      <div className="pointer-events-none absolute inset-0 z-[500] flex flex-col">
        {/* Header */}
        <motion.div variants={itemVariants}>
          <DashboardHeader />
        </motion.div>

        {/* Body area */}
        <div className="flex flex-1 items-start justify-between p-4">
          {/* Left column — incident panel */}
          <motion.div variants={itemVariants}>
            <IncidentPanel />
          </motion.div>
        </div>

        {/* Bottom row */}
        <div className="flex items-end justify-between p-4 pt-0">
          {/* Legend — bottom left */}
          <motion.div variants={itemVariants}>
            <MapLegend />
          </motion.div>
        </div>
      </div>

      {/* Scan-line overlay */}
      <div className="dashboard-scan-line" />
    </motion.div>
  );
}
