"use client";

import { useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SplatMesh, SparkRenderer } from "@sparkjsdev/spark";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getWorld, selectSpzUrl } from "@/lib/worldlabs";
import "./spark-extend";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOVE_SPEED = 2;

// ---------------------------------------------------------------------------
// Reusable vectors for keyboard nav
// ---------------------------------------------------------------------------

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

// ---------------------------------------------------------------------------
// KeyboardNav — WASD + arrow key movement (Tab excluded)
// ---------------------------------------------------------------------------

function KeyboardNav({
  controls,
}: {
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") return;
      keysRef.current.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Tab") return;
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const keys = keysRef.current;
    if (keys.size === 0 || !controls.current) return;

    const shift = keys.has("shift");

    camera.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();

    _right.crossVectors(_forward, camera.up).normalize();

    _move.set(0, 0, 0);

    if ((keys.has("arrowup") || keys.has("w")) && !shift) {
      _move.add(_forward);
    }
    if ((keys.has("arrowdown") || keys.has("s")) && !shift) {
      _move.sub(_forward);
    }
    if (keys.has("arrowleft") || keys.has("a")) {
      _move.sub(_right);
    }
    if (keys.has("arrowright") || keys.has("d")) {
      _move.add(_right);
    }
    if ((shift && keys.has("arrowup")) || keys.has(" ")) {
      _move.y += 1;
    }
    if ((shift && keys.has("arrowdown")) || keys.has("q")) {
      _move.y -= 1;
    }

    if (_move.lengthSq() === 0) return;

    _move.normalize().multiplyScalar(MOVE_SPEED * delta);

    camera.position.add(_move);
    controls.current.target.add(_move);
  });

  return null;
}

// ---------------------------------------------------------------------------
// SplatScene
// ---------------------------------------------------------------------------

interface SplatSceneProps {
  spzUrl: string;
  alternateWorldId?: string;
  onLoaded?: () => void;
  onError?: (error: Error) => void;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
}

type AlternateFetchState = "idle" | "fetching" | "ready" | "error";

export function SplatScene({
  spzUrl,
  alternateWorldId,
  onLoaded,
  onError,
  onTransitionStart,
  onTransitionEnd,
}: SplatSceneProps) {
  const gl = useThree((state) => state.gl);
  const primarySplatRef = useRef<SplatMesh>(null);
  const alternateSplatRef = useRef<SplatMesh>(null);
  const sparkRef = useRef<SparkRenderer>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // Which splat is mounted right now — only one at a time
  const [activeSlot, setActiveSlot] = useState<"primary" | "alternate">("primary");
  const [alternateSpzUrl, setAlternateSpzUrl] = useState<string | null>(null);
  const alternateFetchStateRef = useRef<AlternateFetchState>("idle");

  // Handle primary splat initialization
  useEffect(() => {
    if (activeSlot !== "primary") return;
    const splat = primarySplatRef.current;
    if (!splat) return;

    splat.initialized
      .then(() => onLoaded?.())
      .catch((err: unknown) => {
        const error =
          err instanceof Error ? err : new Error("Failed to load splat");
        onError?.(error);
      });
  }, [activeSlot, onLoaded, onError]);

  // Handle alternate splat initialization
  useEffect(() => {
    if (activeSlot !== "alternate") return;
    const splat = alternateSplatRef.current;
    if (!splat) return;

    splat.initialized
      .then(() => onTransitionEnd?.())
      .catch((err: unknown) => {
        console.error("Failed to load alternate splat:", err);
        onTransitionEnd?.();
      });
  }, [activeSlot, alternateSpzUrl, onTransitionEnd]);

  // Tab key handler — toggle which splat is mounted
  useEffect(() => {
    if (!alternateWorldId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      e.preventDefault();

      // First Tab press: fetch the alternate world URL, then swap
      if (alternateFetchStateRef.current === "idle") {
        alternateFetchStateRef.current = "fetching";
        onTransitionStart?.();

        getWorld(alternateWorldId)
          .then((world) => {
            const url = selectSpzUrl(world);
            if (!url) {
              alternateFetchStateRef.current = "error";
              console.error("No SPZ URL found for alternate world");
              onTransitionEnd?.();
              return;
            }

            alternateFetchStateRef.current = "ready";
            setAlternateSpzUrl(url);
            setActiveSlot("alternate");
          })
          .catch((err) => {
            alternateFetchStateRef.current = "error";
            console.error("Failed to fetch alternate world:", err);
            onTransitionEnd?.();
          });

        return;
      }

      // Subsequent Tab presses: toggle
      if (alternateFetchStateRef.current !== "ready") return;

      onTransitionStart?.();
      setActiveSlot((prev) => (prev === "primary" ? "alternate" : "primary"));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [alternateWorldId, onTransitionStart, onTransitionEnd]);

  return (
    <>
      <sparkSparkRenderer ref={sparkRef} args={[{ renderer: gl }]} />

      {/* Only one splat mounted at a time — unmounted = removed from Spark renderer */}
      {activeSlot === "primary" && (
        <sparkSplatMesh
          ref={primarySplatRef}
          args={[{ url: spzUrl }]}
          rotation={[Math.PI, 0, 0]}
        />
      )}

      {activeSlot === "alternate" && alternateSpzUrl && (
        <sparkSplatMesh
          ref={alternateSplatRef}
          args={[{ url: alternateSpzUrl }]}
          rotation={[Math.PI, 0, 0]}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.12}
        minDistance={0.5}
        maxDistance={20}
      />
      <KeyboardNav controls={controlsRef} />
    </>
  );
}
