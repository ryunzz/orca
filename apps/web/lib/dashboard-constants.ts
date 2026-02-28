// ---------------------------------------------------------------------------
// Coordinates — Siebel Center for Computer Science
// ---------------------------------------------------------------------------
export const INCIDENT_CENTER = {
  LAT: 40.1138,
  LNG: -88.2249,
} as const;

// ---------------------------------------------------------------------------
// MapBox GL configuration
// ---------------------------------------------------------------------------
export const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11" as const;

/** MapBox uses [lng, lat] order */
export const MAPBOX_CENTER: [number, number] = [
  INCIDENT_CENTER.LNG,
  INCIDENT_CENTER.LAT,
];

export const MAPBOX_DEFAULT_ZOOM = 16;
export const MAPBOX_DEFAULT_PITCH = 60;
export const MAPBOX_DEFAULT_BEARING = -17.6;
export const MAPBOX_MIN_ZOOM = 14;
export const MAPBOX_MAX_ZOOM = 19;

// ---------------------------------------------------------------------------
// 3D building layer
// ---------------------------------------------------------------------------
export const BUILDING_LAYER_ID = "3d-buildings" as const;
export const BUILDING_SOURCE = "composite" as const;
export const BUILDING_SOURCE_LAYER = "building" as const;

export const BUILDING_HIGHLIGHT_COLOR = "#F27623" as const;
export const BUILDING_EXTRUSION_OPACITY = 0.85;

// Height-interpolated building colors — warm browns for fire-orange theme
export const BUILDING_COLOR_LOW = "#332a22" as const;
export const BUILDING_COLOR_MID = "#483a30" as const;
export const BUILDING_COLOR_HIGH = "#584838" as const;

/** Data-driven color expression: taller buildings get lighter shades */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BUILDING_COLOR_EXPRESSION: any = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "height"], 0],
  0,
  BUILDING_COLOR_LOW,
  20,
  BUILDING_COLOR_MID,
  60,
  BUILDING_COLOR_HIGH,
];

// Vertical gradient + ambient occlusion
export const BUILDING_VERTICAL_GRADIENT = true;
export const BUILDING_AO_INTENSITY = 0.4;
export const BUILDING_AO_GROUND_RADIUS = 3;
export const BUILDING_AO_WALL_RADIUS = 3;

// Flood lighting — warm amber uplighting
export const BUILDING_FLOOD_LIGHT_COLOR = "#5a4025" as const;
export const BUILDING_FLOOD_LIGHT_INTENSITY = 0.25;
export const BUILDING_FLOOD_LIGHT_GROUND_RADIUS = 3;

// ---------------------------------------------------------------------------
// 3D lighting (setLights API)
// ---------------------------------------------------------------------------
export const AMBIENT_LIGHT = {
  id: "ambient",
  type: "ambient" as const,
  properties: {
    color: "#c09068",
    intensity: 0.5,
  },
};

export const DIRECTIONAL_LIGHT = {
  id: "directional",
  type: "directional" as const,
  properties: {
    color: "#ffe0c0",
    intensity: 0.6,
    direction: [210, 60] as [number, number],
    "cast-shadows": true,
    "shadow-intensity": 0.3,
  },
};

// ---------------------------------------------------------------------------
// Atmospheric fog — warm brown haze to mute dark-v11 cool tones
// ---------------------------------------------------------------------------
export const MAP_FOG_CONFIG = {
  range: [1, 12] as [number, number],
  color: "#1e1610",
  "high-color": "#2e2015",
  "space-color": "#0f0b06",
  "horizon-blend": 0.06,
  "star-intensity": 0.0,
} as const;

// ---------------------------------------------------------------------------
// Base map layer overrides — warm up dark-v11 cool tones
// Applied programmatically after style.load
// ---------------------------------------------------------------------------
export const BASE_MAP_OVERRIDES = {
  /** Background fill — warm near-black instead of cool gray */
  background: "#14110e",
  /** Water — deep warm dark instead of cool blue-gray */
  water: "#0e1520",
  /** Road colors — warmer tones with better contrast */
  roadMinor: "#2a2320",
  roadMajor: "#3d332a",
  roadHighway: "#4d3d30",
  /** Land use (parks, etc.) — subtle warm tints */
  landuse: "#1a1812",
} as const;

// ---------------------------------------------------------------------------
// Location search — Nominatim (OSM)
// ---------------------------------------------------------------------------
export const NOMINATIM_BASE_URL =
  "https://nominatim.openstreetmap.org/search" as const;
export const NOMINATIM_USER_AGENT = "PyroSight/1.0" as const;
export const SEARCH_DEBOUNCE_MS = 450;
export const SEARCH_MAX_RESULTS = 5;
export const SEARCH_FLY_TO_ZOOM = 16;
export const SEARCH_FLY_TO_SPEED = 1.2;

// ---------------------------------------------------------------------------
// Google Street View — 360° building imagery
// ---------------------------------------------------------------------------
export const STREETVIEW_IMAGE_SIZE = "640x640" as const;
export const STREETVIEW_FOV = 90;
export const STREETVIEW_PITCH = 10;
export const STREETVIEW_OFFSET_RADIUS_M = 50;
export const STREETVIEW_HEADING_COUNT = 4;
export const STREETVIEW_HEADINGS = [0, 90, 180, 270] as const;
