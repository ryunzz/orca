import * as THREE from "three";

export const makeGroundMaterial = () => new THREE.MeshStandardMaterial({ color: 0x24344d });

export function createGridMaterial() {
  return new THREE.LineBasicMaterial({ color: 0x2e4b75 });
}
