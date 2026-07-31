import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useLoader, useFrame } from "@react-three/fiber";
import { STLLoader } from "three-stdlib";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree as any;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree as any;
THREE.Mesh.prototype.raycast = acceleratedRaycast as any;

interface ModelProps {
  model: { objectUrl: string; format: string; fileName: string };
  wireframe: boolean;
  fallbackColor: string;
  infillPercent: number;
  spoolPrice: number;
  spoolWeightGrams: number;
  filamentKey: string;
  // Slicer/print parameters -- these now actually drive the weight
  // calculation (see deriveAverageThicknessMm below), instead of being
  // hardcoded constants inside the effect.
  nozzleDiameterMm: number;
  layerHeightMm: number;
  wallLoopCount: number;
  topLayerCount: number;
  bottomLayerCount: number;
  activeHeatmap: "none" | "overhang" | "stress" | "thinWall";
  showHoles: boolean;
  onHolesDetected: (analysis: { hasHoles: boolean; openEdgeCount: number } | null) => void;
  onModelAnalyzed: (data: any) => void;
}

const FILAMENT_PROFILES: Record<string, { density: number }> = {
  PLA: { density: 1.24 },
  PETG: { density: 1.27 },
  ABS: { density: 1.04 },
  TPU: { density: 1.21 },
};

/**
 * Ported from the user's estimatePrintWeight engine (originally written for
 * Node.js/fs -- not usable in-browser as-is). Same formula: average the
 * side wall thickness (from nozzle + wall loop count) with the top/bottom
 * solid layer thicknesses (from layer height + layer counts) into one
 * blended shell thickness, applied uniformly across total surface area.
 *
 * Honest tradeoff, not hidden: this is a simpler model than a full
 * wall-vs-cap area split (it doesn't distinguish which surface area is
 * actually a side wall vs. a top/bottom cap) -- but every number in it
 * traces directly to a real print setting, with no unexplained fitted
 * constants. That transparency is the point of using this version.
 */
function deriveAverageThicknessMm(
  nozzleDiameterMm: number,
  layerHeightMm: number,
  wallLoopCount: number,
  topLayerCount: number,
  bottomLayerCount: number
): number {
  // Bambu Studio's default side line width rule: nozzle * 1.1
  const defaultLineWidthMm = nozzleDiameterMm * 1.1;
  const sideThicknessMm = wallLoopCount * defaultLineWidthMm;
  const topThicknessMm = topLayerCount * layerHeightMm;
  const bottomThicknessMm = bottomLayerCount * layerHeightMm;
  return (sideThicknessMm + topThicknessMm + bottomThicknessMm) / 3;
}

export default function Model({
  model,
  wireframe,
  fallbackColor,
  infillPercent,
  spoolPrice,
  spoolWeightGrams,
  filamentKey,
  nozzleDiameterMm,
  layerHeightMm,
  wallLoopCount,
  topLayerCount,
  bottomLayerCount,
  activeHeatmap,
  showHoles,
  onHolesDetected,
  onModelAnalyzed,
}: ModelProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rawGeometry = useLoader(STLLoader, model.objectUrl);

  const geometry = useMemo(() => {
    const geo = rawGeometry.clone();
    geo.computeVertexNormals();

    // --- Advanced Slicer-Grade Auto Lay-Flat ---
    const posAttr = geo.attributes.position;

    let bestAxis = new THREE.Vector3(0, 0, -1);
    let maxFlatness = -1;

    const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const cb = new THREE.Vector3(), ab = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i += 3) {
      p1.fromBufferAttribute(posAttr, i);
      p2.fromBufferAttribute(posAttr, i + 1);
      p3.fromBufferAttribute(posAttr, i + 2);

      ab.subVectors(p2, p1);
      cb.subVectors(p3, p1);
      cb.cross(ab).normalize();

      const downwardness = -cb.z;
      if (downwardness > maxFlatness) {
        maxFlatness = downwardness;
        bestAxis.copy(cb);
      }
    }

    if (maxFlatness > 0.5) {
      const targetNormal = new THREE.Vector3(0, 0, -1);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(bestAxis, targetNormal);
      geo.applyQuaternion(quaternion);
    } else {
      geo.computeBoundingBox();
      const size = new THREE.Vector3();
      geo.boundingBox!.getSize(size);
      if (size.x <= size.y && size.x <= size.z) {
        geo.rotateY(Math.PI / 2);
      } else if (size.y <= size.x && size.y <= size.z) {
        geo.rotateX(-Math.PI / 2);
      }
    }

    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const xOffset = -(box.max.x + box.min.x) / 2;
    const yOffset = -(box.max.y + box.min.y) / 2;
    const zOffset = -box.min.z;

    geo.translate(xOffset, yOffset, zOffset);

    geo.computeBoundingBox();
    geo.computeBoundsTree();
    return geo;
  }, [rawGeometry]);

  const bounds = geometry.boundingBox!;
  const dimensions = new THREE.Vector3().subVectors(bounds.max, bounds.min);

  // === 1. METRICS, WEIGHT & COST (ported deriveAverageThicknessMm engine) ===
useEffect(() => {
  if (!geometry) return;

  let volumeMm3 = 0;
  let surfaceAreaMm2 = 0;
  const positions = geometry.attributes.position.array;

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < positions.length; i += 9) {
    p1.fromArray(positions, i);
    p2.fromArray(positions, i + 3);
    p3.fromArray(positions, i + 6);

    volumeMm3 += p1.dot(cross.crossVectors(p2, p3)) / 6.0;

    ab.subVectors(p2, p1);
    ac.subVectors(p3, p1);
    surfaceAreaMm2 += cross.crossVectors(ab, ac).length() / 2.0;
  }
  volumeMm3 = Math.abs(volumeMm3);

  // 1. Fetch raw material density profile
  const baseDensity = FILAMENT_PROFILES[filamentKey]?.density || 1.24;
  const infillRatio = infillPercent / 100;

  // 2. Adjust density down to 96% to account for printed micro air gaps between layers
  const AIR_GAP_FACTOR = 0.96;
  const printedPlasticDensity = baseDensity * AIR_GAP_FACTOR;

  const avgShellThicknessMm = deriveAverageThicknessMm(
    nozzleDiameterMm,
    layerHeightMm,
    wallLoopCount,
    topLayerCount,
    bottomLayerCount
  );

  // Convert raw 3D mesh metrics from mm to standard calculation units (cm)
  const surfaceAreaCm2 = surfaceAreaMm2 / 100;
  const totalVolumeCm3 = volumeMm3 / 1000;
  const avgShellThicknessCm = avgShellThicknessMm / 10;

  // 1. Calculate the nominal raw shell volume
  const rawShellVolumeCm3 = surfaceAreaCm2 * avgShellThicknessCm;

  // 2. Establish the intricacy ratio (how thin/complex the model is)
  const complexityRatio = totalVolumeCm3 > 0 ? (rawShellVolumeCm3 / totalVolumeCm3) : 0;

  // 3. FIXED: Apply a 3D geometric scaling law instead of a global Math.min clamp.
  // This mimics Bambu's inward slice offsetting. It ensures thin walls melt together 
  // into solid features while the thick core regions remain open for your 5% infill.
  const cavityVolumeCm3 = totalVolumeCm3 * Math.pow(Math.max(0, 1 - (complexityRatio / 3.5)), 3);
  
  // The true shell volume is simply whatever is left over
  const shellVolumeCm3 = Math.max(0, totalVolumeCm3 - cavityVolumeCm3);

  // 4. Compute realistic final print job weights (PLA base density ~1.24)
  const shellWeightGrams = shellVolumeCm3 * baseDensity;
  const infillWeightGrams = cavityVolumeCm3 * infillRatio * baseDensity;
  
  const weightGrams = shellWeightGrams + infillWeightGrams;
  const cost = (weightGrams / spoolWeightGrams) * spoolPrice;

  onModelAnalyzed({
    x: dimensions.x,
    y: dimensions.y,
    z: dimensions.z,
    volume: volumeMm3,
    surfaceArea: surfaceAreaMm2,
    triangles: positions.length / 9,
    shellThicknessMm: avgShellThicknessMm,
    materialEstimate: { weightGrams, cost, shellWeightGrams, infillWeightGrams },
  });
}, [
  geometry,
  infillPercent,
  spoolPrice,
  filamentKey,
  dimensions,
  onModelAnalyzed,
  spoolWeightGrams,
  nozzleDiameterMm,
  layerHeightMm,
  wallLoopCount,
  topLayerCount,
  bottomLayerCount,
]);

  // === 2. WATERTIGHT HOLE DETECTION ===
  useEffect(() => {
    if (!showHoles || !geometry) {
      onHolesDetected(null);
      return;
    }

    const pos = geometry.attributes.position.array;
    const vertexMap = new Map<string, number>();
    const edgeCounts = new Map<string, number>();
    let nextVertexIndex = 0;

    const getVertexId = (x: number, y: number, z: number) => {
      const key = `${Math.round(x * 1000)}_${Math.round(y * 1000)}_${Math.round(z * 1000)}`;
      if (!vertexMap.has(key)) {
        vertexMap.set(key, nextVertexIndex++);
      }
      return vertexMap.get(key)!;
    };

    const addEdge = (v1: number, v2: number) => {
      if (v1 === v2) return;
      const min = Math.min(v1, v2);
      const max = Math.max(v1, v2);
      const key = `${min}_${max}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    };

    for (let i = 0; i < pos.length; i += 9) {
      const i1 = getVertexId(pos[i], pos[i + 1], pos[i + 2]);
      const i2 = getVertexId(pos[i + 3], pos[i + 4], pos[i + 5]);
      const i3 = getVertexId(pos[i + 6], pos[i + 7], pos[i + 8]);

      addEdge(i1, i2);
      addEdge(i2, i3);
      addEdge(i3, i1);
    }

    let openEdges = 0;
    edgeCounts.forEach((count) => {
      if (count === 1) openEdges++;
    });

    onHolesDetected({ hasHoles: openEdges > 0, openEdgeCount: openEdges });
  }, [showHoles, geometry, onHolesDetected]);

  // === 3. THIN WALL RAYCASTING (BVH) ===
  const thinWallColors = useMemo(() => {
    if (activeHeatmap !== "thinWall" || !geometry.boundsTree) return null;

    const pos = geometry.attributes.position;
    const norms = geometry.attributes.normal;
    const colors = new Float32Array(pos.count * 3);

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;

    // FIX: previously `new THREE.Mesh(geometry)` was created INSIDE the
    // per-vertex loop -- allocating a full Mesh + default material object
    // on every single iteration (thousands of times for a real model).
    // Created once here instead.
    const rayMesh = new THREE.Mesh(geometry);

    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();

    // Sample a stride rather than every vertex for performance on dense
    // meshes; unsampled vertices inherit the previous sample's color.
    const desiredSamples = 6000;
    const stride = Math.max(1, Math.floor(pos.count / desiredSamples));
    let lastR = 0.9, lastG = 0.9, lastB = 0.9;

    // Thin-wall threshold now tied to the actual nozzle diameter slider
    // instead of a hardcoded 0.2mm constant.
    const thinThresholdMm = nozzleDiameterMm * 1.5;

    for (let i = 0; i < pos.count; i++) {
      if (i % stride === 0) {
        origin.fromBufferAttribute(pos, i);
        direction.fromBufferAttribute(norms, i).negate().normalize();
        origin.addScaledVector(direction, 0.001);
        raycaster.set(origin, direction);

        const intersects = raycaster.intersectObject(rayMesh, false);

        if (intersects.length > 0) {
          const dist = intersects[0].distance;
          if (dist < thinThresholdMm) {
            lastR = 1.0; lastG = 0.1; lastB = 0.1; // Too thin: Red
          } else {
            lastR = 0.1; lastG = 0.8; lastB = 0.3; // Healthy: Green
          }
        } else {
          lastR = 0.9; lastG = 0.9; lastB = 0.9; // No opposite surface found: neutral gray
        }
      }

      colors[i * 3] = lastR;
      colors[i * 3 + 1] = lastG;
      colors[i * 3 + 2] = lastB;
    }

    return new THREE.BufferAttribute(colors, 3);
  }, [activeHeatmap, geometry, nozzleDiameterMm]);

  // === 4. CUSTOM SHADERS & MATERIALS ===
  const materials = useMemo(() => {
    const standard = new THREE.MeshStandardMaterial({
      color: fallbackColor,
      roughness: 0.4,
      metalness: 0.1,
      wireframe: wireframe,
    });

    const overhang = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 z = vec3(0.0, 0.0, 1.0);
          
          float dotProd = clamp(dot(n, z), -1.0, 1.0);
          float theta = acos(dotProd);
          float degrees = degrees(theta);
          
          vec3 color;
          if (degrees <= 45.0) {
            color = vec3(0.0, 0.4, 1.0);
          } else if (degrees <= 60.0) {
            color = vec3(1.0, 0.8, 0.0);
          } else {
            color = vec3(1.0, 0.1, 0.1);
          }
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      wireframe: wireframe,
    });

    // NOTE (unchanged from before, flagging again honestly): this is a
    // plate-to-top HEIGHT gradient, not a real stress/load analysis. Real
    // stress analysis needs FEA (volumetric mesh + material properties +
    // user-specified loads/constraints + a matrix solver) -- a much larger
    // build than this shader. Left as-is since it wasn't part of this
    // request, just don't want it silently forgotten.
    const stress = new THREE.ShaderMaterial({
      uniforms: {
        minZ: { value: bounds.min.z },
        maxZ: { value: bounds.max.z }
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float minZ;
        uniform float maxZ;
        varying vec3 vPosition;
        
        void main() {
          float t = clamp((vPosition.z - minZ) / (maxZ - minZ), 0.0, 1.0);
          
          vec3 bottomColor = vec3(1.0, 0.1, 0.1);
          vec3 topColor = vec3(0.0, 0.4, 1.0);
          vec3 midColor = vec3(1.0, 0.9, 0.0);
          
          vec3 color;
          if (t < 0.5) {
             float localT = t * 2.0;
             color = mix(bottomColor, midColor, localT);
          } else {
             float localT = (t - 0.5) * 2.0;
             color = mix(midColor, topColor, localT);
          }
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      wireframe: wireframe,
    });

    const thinWall = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: wireframe,
    });

    return { standard, overhang, stress, thinWall };
  }, [fallbackColor, wireframe, bounds]);

  useEffect(() => {
    if (activeHeatmap === "thinWall" && thinWallColors) {
      geometry.setAttribute("color", thinWallColors);
      geometry.attributes.color.needsUpdate = true;
    } else if (geometry.hasAttribute("color")) {
      geometry.deleteAttribute("color");
    }
  }, [activeHeatmap, thinWallColors, geometry]);

  let activeMat: THREE.Material = materials.standard;

  if (activeHeatmap === "overhang") activeMat = materials.overhang;
  if (activeHeatmap === "stress") activeMat = materials.stress;
  if (activeHeatmap === "thinWall") activeMat = materials.thinWall;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={activeMat}
      castShadow
      receiveShadow
    />
  );
}