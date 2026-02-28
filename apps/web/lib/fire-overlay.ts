/**
 * Mapbox GL custom layer that renders a Three.js fire particle system
 * at a given [lng, lat]. Uses InstancedMesh with additive blending so
 * particles glow naturally where they overlap.
 *
 * Usage:
 *   const layer = createFireOverlay("fire-siebel", [-88.2249, 40.1138]);
 *   map.addLayer(layer);
 *   // later: map.removeLayer(layer.id);
 */

import * as THREE from "three";
import mapboxgl from "mapbox-gl";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 220;
const FIRE_RADIUS = 10; // meters — horizontal spread at spawn
const MIN_RISE = 4; // m/s — slowest upward speed
const MAX_RISE = 16; // m/s — fastest upward speed
const MIN_LIFE = 1.0; // seconds
const MAX_LIFE = 2.8; // seconds
const TURBULENCE_AMP = 2.5; // metres of horizontal sway

// ---------------------------------------------------------------------------
// Pre-allocated temporaries (shared across all overlays — single-threaded)
// ---------------------------------------------------------------------------
const _obj = new THREE.Object3D();
const _col = new THREE.Color();
const _mat4a = new THREE.Matrix4();
const _mat4b = new THREE.Matrix4();
const _scaleVec = new THREE.Vector3();
const _rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);

// ---------------------------------------------------------------------------
// Fire colour ramp — bright core fading through orange to dark
// With additive blending, darker = more transparent.
// ---------------------------------------------------------------------------
const C_CORE = new THREE.Color(0xfff4d6);
const C_YELLOW = new THREE.Color(0xffb800);
const C_ORANGE = new THREE.Color(0xff5500);
const C_RED = new THREE.Color(0xaa1800);
const C_DARK = new THREE.Color(0x0e0200);

function fireColor(t: number): THREE.Color {
  const fade = (1 - t) * (1 - t); // quadratic brightness falloff
  if (t < 0.1) _col.lerpColors(C_CORE, C_YELLOW, t / 0.1);
  else if (t < 0.3) _col.lerpColors(C_YELLOW, C_ORANGE, (t - 0.1) / 0.2);
  else if (t < 0.6) _col.lerpColors(C_ORANGE, C_RED, (t - 0.3) / 0.3);
  else _col.lerpColors(C_RED, C_DARK, Math.min((t - 0.6) / 0.4, 1));
  _col.multiplyScalar(fade);
  return _col;
}

// ---------------------------------------------------------------------------
// Particle state
// ---------------------------------------------------------------------------
interface Particle {
  age: number;
  maxAge: number;
  x0: number;
  z0: number;
  vy: number;
  dx: number;
  dz: number;
  phase: number;
  size: number;
}

function spawn(stagger: boolean): Particle {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * FIRE_RADIUS; // uniform disk
  const isEmber = Math.random() < 0.2;
  return {
    age: stagger ? Math.random() * MAX_LIFE : 0,
    maxAge: MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE),
    x0: Math.cos(a) * r,
    z0: Math.sin(a) * r,
    vy: MIN_RISE + Math.random() * (MAX_RISE - MIN_RISE),
    dx: (Math.random() - 0.5) * 3,
    dz: (Math.random() - 0.5) * 3,
    phase: Math.random() * Math.PI * 2,
    size: isEmber ? 0.25 + Math.random() * 0.35 : 0.6 + Math.random() * 1.0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function createFireOverlay(
  layerId: string,
  lngLat: [number, number],
): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let mesh: THREE.InstancedMesh;
  let glowMat: THREE.MeshBasicMaterial;
  let particles: Particle[];
  let prevTime = 0;
  let mapInst: mapboxgl.Map;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  let sc = 1;

  return {
    id: layerId,
    type: "custom" as const,
    renderingMode: "3d" as const,

    // ----- setup -----
    onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
      mapInst = map;

      // Mercator projection of the target point
      const mc = mapboxgl.MercatorCoordinate.fromLngLat(lngLat, 0);
      tx = mc.x;
      ty = mc.y;
      tz = mc.z ?? 0;
      sc = mc.meterInMercatorCoordinateUnits();

      camera = new THREE.Camera();
      scene = new THREE.Scene();

      // --- fire particles: low-poly icosahedrons with additive glow ---
      const geo = new THREE.IcosahedronGeometry(1, 0);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      });

      mesh = new THREE.InstancedMesh(geo, mat, PARTICLE_COUNT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(PARTICLE_COUNT * 3),
        3,
      );
      (mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(
        THREE.DynamicDrawUsage,
      );

      // Stagger initial ages so the fire looks full from frame 1
      particles = Array.from({ length: PARTICLE_COUNT }, () => spawn(true));
      scene.add(mesh);

      // --- ground glow disc ---
      glowMat = new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(FIRE_RADIUS * 2.0, 32),
        glowMat,
      );
      glow.rotation.x = -Math.PI / 2; // lay flat
      glow.position.y = 0.5;
      scene.add(glow);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      prevTime = performance.now();
    },

    // ----- per-frame -----
    render(_gl: WebGLRenderingContext, matrix: number[]) {
      if (!renderer) return;

      // delta time (capped to avoid jumps after tab switches)
      const now = performance.now();
      const dt = Math.min((now - prevTime) / 1000, 0.1);
      prevTime = now;

      // --- advance particles ---
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        let p = particles[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          p = spawn(false);
          particles[i] = p;
        }

        const t = p.age / p.maxAge; // normalised age 0→1

        // position: rise with turbulent drift
        const x =
          p.x0 +
          p.dx * t +
          Math.sin(p.age * 2.3 + p.phase) * TURBULENCE_AMP * t;
        const y = p.vy * t * (1 + t * 0.4); // slight acceleration
        const z =
          p.z0 +
          p.dz * t +
          Math.cos(p.age * 1.8 + p.phase) * TURBULENCE_AMP * t;

        // scale: grow then fade
        const curve = Math.sin(t * Math.PI);
        const s = p.size * Math.max(curve * (1 - t * 0.3), 0.02);

        _obj.position.set(x, y, z);
        _obj.scale.setScalar(s);
        _obj.updateMatrix();
        mesh.setMatrixAt(i, _obj.matrix);
        mesh.setColorAt(i, fireColor(t));
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate =
          true;
      }

      // pulse ground glow
      glowMat.opacity = 0.07 + Math.sin(now * 0.003) * 0.03;

      // --- camera: Mapbox projection × model transform ---
      _mat4a.fromArray(matrix);
      _mat4b.makeTranslation(tx, ty, tz);
      _scaleVec.set(sc, -sc, sc);
      _mat4b.scale(_scaleVec);
      _mat4b.multiply(_rotX);
      camera.projectionMatrix = _mat4a.multiply(_mat4b);

      renderer.resetState();
      renderer.render(scene, camera);

      // keep the animation loop alive
      mapInst.triggerRepaint();
    },

    // ----- teardown -----
    onRemove() {
      if (mesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      if (glowMat) {
        glowMat.dispose();
      }
      renderer = null;
    },
  };
}
