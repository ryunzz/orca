"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { HeatLayerOptions } from "leaflet";
import "leaflet.heat";

interface FireHeatLayerProps {
  points: [number, number, number][];
  options?: HeatLayerOptions;
}

export function FireHeatLayer({ points, options }: FireHeatLayerProps) {
  const map = useMap();

  useEffect(() => {
    const layer = L.heatLayer(points, options);
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, options]);

  return null;
}
