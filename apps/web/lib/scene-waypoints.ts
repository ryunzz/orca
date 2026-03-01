import * as THREE from "three";

// ---------------------------------------------------------------------------
// Room-to-3D coordinate mapping for the Siebel Center splat scene.
//
// The splat is centered near origin, camera starts at [0, 0, -2].
// The splat is rotated π on X, so +Z points "into" the building.
// Waypoints are manually tuned to stay within the visible splat volume.
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

// ---------------------------------------------------------------------------
// Catmull-Rom style interpolation between two points, producing intermediate
// control points for smooth curves.
// ---------------------------------------------------------------------------

function interpolateSegment(
  a: Vec3Tuple,
  b: Vec3Tuple,
  steps: number,
): Vec3Tuple[] {
  const points: Vec3Tuple[] = [a];
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    // Add slight lateral offset for a curved feel
    const offset = Math.sin(t * Math.PI) * 0.08;
    points.push([
      a[0] + (b[0] - a[0]) * t + offset,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t + offset * 0.5,
    ]);
  }
  points.push(b);
  return points;
}

// ---------------------------------------------------------------------------
// Convert an ordered list of room names into a smooth 3D path.
// Rooms not found in DEMO_WAYPOINTS are skipped.
// Returns a CatmullRomCurve3 sampled into evenly spaced Vector3 points.
// ---------------------------------------------------------------------------

const INTERPOLATION_STEPS = 2; // intermediate points per segment
const SAMPLES_PER_SEGMENT = 20; // final smoothed samples per segment

export function getPathWaypoints(roomNames: string[]): THREE.Vector3[] {
  const knownPositions: Vec3Tuple[] = [];
  const knownRoomNames: string[] = [];

  for (const name of roomNames) {
    const pos = DEMO_WAYPOINTS[name];
    if (pos) {
      knownPositions.push(pos);
      knownRoomNames.push(name);
    }
  }

  if (knownPositions.length < 2) {
    return knownPositions.map((p) => new THREE.Vector3(...p));
  }

  // Build interpolated control points
  const controlPoints: Vec3Tuple[] = [];
  for (let i = 0; i < knownPositions.length - 1; i++) {
    const segment = interpolateSegment(
      knownPositions[i],
      knownPositions[i + 1],
      INTERPOLATION_STEPS,
    );
    // Avoid duplicating the junction point
    if (i > 0) segment.shift();
    controlPoints.push(...segment);
  }

  // Build a CatmullRom curve for smooth sampling
  const curvePoints = controlPoints.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(curvePoints, false, "centripetal", 0.5);

  const totalSamples = (knownPositions.length - 1) * SAMPLES_PER_SEGMENT;
  return curve.getSpacedPoints(totalSamples);
}

// ---------------------------------------------------------------------------
// Get the index of the closest waypoint (room boundary) in the sampled path
// for a given room name. Useful for triggering onRoomReached callbacks.
// ---------------------------------------------------------------------------

export function getRoomIndices(
  roomNames: string[],
  totalPoints: number,
): Map<number, string> {
  const known = roomNames.filter((n) => DEMO_WAYPOINTS[n]);
  if (known.length < 2) return new Map();

  const segmentCount = known.length - 1;
  const pointsPerSegment = Math.floor(totalPoints / segmentCount);

  const map = new Map<number, string>();
  for (let i = 0; i < known.length; i++) {
    const idx = Math.min(i * pointsPerSegment, totalPoints - 1);
    map.set(idx, known[i]);
  }
  return map;
}
