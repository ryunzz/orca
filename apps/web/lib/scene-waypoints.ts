import * as THREE from "three";

// ---------------------------------------------------------------------------
// Room-to-3D coordinate mapping for the Siebel Center splat scene.
//
// The splat is centered near origin, camera starts at [0, 0, -2].
// The splat is rotated π on X, so +Z points "into" the building.
// Waypoints are manually tuned to stay within the visible splat volume.
// Used for proximity-based room detection when the agent follows the camera.
// ---------------------------------------------------------------------------

type Vec3Tuple = [number, number, number];

export const DEMO_WAYPOINTS: Record<string, Vec3Tuple> = {
  Lobby: [0, -0.3, -1.5],
  C1300: [0.4, -0.3, 0.0],
  "1302": [0.8, -0.3, 0.8],
  "1304": [1.1, -0.25, 1.3],
  Stairwell: [-0.3, -0.1, -0.8],
  Hallway: [0.2, -0.3, -0.6],
};

// Reusable Vector3 instances for distance checks (avoids per-frame allocation)
const _waypointVecs: Map<string, THREE.Vector3> = new Map();
for (const [name, pos] of Object.entries(DEMO_WAYPOINTS)) {
  _waypointVecs.set(name, new THREE.Vector3(...pos));
}

// ---------------------------------------------------------------------------
// Find the nearest room to a given 3D position.
// Returns null if nothing is within `threshold` distance.
// ---------------------------------------------------------------------------

const ROOM_PROXIMITY_THRESHOLD = 0.6;

export function findNearestRoom(
  position: THREE.Vector3,
  threshold = ROOM_PROXIMITY_THRESHOLD,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;

  for (const [name, vec] of _waypointVecs) {
    const d = position.distanceTo(vec);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }

  return bestDist <= threshold ? best : null;
}
