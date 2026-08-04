import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
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

function deriveAverageThicknessMm(
  nozzleDiameterMm: number,
  layerHeightMm: number,
  wallLoopCount: number,
  topLayerCount: number,
  bottomLayerCount: number
): number {
  const defaultLineWidthMm = nozzleDiameterMm * 1.1;
  const sideThicknessMm = wallLoopCount * defaultLineWidthMm;
  const topThicknessMm = topLayerCount * layerHeightMm;
  const bottomThicknessMm = bottomLayerCount * layerHeightMm;
  return (sideThicknessMm + topThicknessMm + bottomThicknessMm) / 3;
}

const computeZStressTexture = (geometry: THREE.BufferGeometry, slices = 64) => {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  if (!bbox) return { texture: new THREE.DataTexture(new Float32Array(4), 1, 1), maxStressRatio: 0 };

  const minZ = bbox.min.z;
  const maxZ = bbox.max.z;
  const rangeZ = Math.max(maxZ - minZ, 0.001);

  const pos = geometry.attributes.position;
  if (!pos) return { texture: new THREE.DataTexture(new Float32Array(4), 1, 1), maxStressRatio: 0 };

  const sliceAreas = new Float32Array(slices);
  const massAbove = new Float32Array(slices);

  const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    p1.fromBufferAttribute(pos, i);
    p2.fromBufferAttribute(pos, i + 1);
    p3.fromBufferAttribute(pos, i + 2);

    const centerZ = (p1.z + p2.z + p3.z) / 3.0;

    ab.subVectors(p2, p1);
    ac.subVectors(p3, p1);
    const triArea = cross.crossVectors(ab, ac).length() * 0.5;

    const bucket = Math.min(Math.floor(((centerZ - minZ) / rangeZ) * slices), slices - 1);
    if (bucket >= 0 && bucket < slices) {
      sliceAreas[bucket] += triArea;
    }
  }

  let currentMass = 0;
  for (let s = slices - 1; s >= 0; s--) {
    currentMass += sliceAreas[s];
    massAbove[s] = currentMass;
  }

  const rawStress = new Float32Array(slices);
  let maxStress = 0.0001;

  for (let s = 0; s < slices; s++) {
    const area = Math.max(sliceAreas[s], 0.1);
    rawStress[s] = Math.log1p(massAbove[s] / area);
    if (rawStress[s] > maxStress) maxStress = rawStress[s];
  }

  const data = new Float32Array(slices * 4);
  for (let s = 0; s < slices; s++) {
    const normalized = Math.pow(rawStress[s] / maxStress, 0.7);

    data[s * 4] = normalized;
    data[s * 4 + 1] = 0;
    data[s * 4 + 2] = 0;
    data[s * 4 + 3] = 1.0;
  }

  const texture = new THREE.DataTexture(data, slices, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return { texture, maxStressRatio: maxStress };
};

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
  const dimensions = useMemo(() => new THREE.Vector3().subVectors(bounds.max, bounds.min), [bounds]);

  const { texture: stressTexture, maxStressRatio } = useMemo(
    () => computeZStressTexture(geometry, 64),
    [geometry]
  );

  const { thinWallAttribute, thinWallCount } = useMemo(() => {
    if (!geometry.boundsTree) return { thinWallAttribute: null, thinWallCount: 0 };

    const pos = geometry.attributes.position;
    const norms = geometry.attributes.normal;
    const isThin = new Float32Array(pos.count);
    let thinCount = 0;

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;

    const rayMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    rayMesh.updateMatrixWorld(true);

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(rayMesh.matrixWorld);

    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const hitNormal = new THREE.Vector3();

    const maxSearchDistance = nozzleDiameterMm * 3.0;

    for (let i = 0; i < pos.count; i++) {
      origin.fromBufferAttribute(pos, i);
      normal.fromBufferAttribute(norms, i).normalize();

      direction.copy(normal).negate();

      const epsilon = Math.min(nozzleDiameterMm * 0.05, 0.01);
      origin.addScaledVector(direction, epsilon);

      raycaster.set(origin, direction);
      raycaster.near = 0.0001;
      raycaster.far = maxSearchDistance;

      const intersects = raycaster.intersectObject(rayMesh, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const measuredThickness = hit.distance + epsilon;

        let validOpposingFace = true;
        if (hit.face) {
          hitNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
          if (hitNormal.dot(normal) > 0.2) {
            validOpposingFace = false;
          }
        }

        if (validOpposingFace && measuredThickness < nozzleDiameterMm) {
          isThin[i] = 1.0;
          thinCount++;
        } else {
          isThin[i] = 0.0;
        }
      } else {
        isThin[i] = 0.0;
      }
    }

    return {
      thinWallAttribute: new THREE.BufferAttribute(isThin, 1),
      thinWallCount: thinCount,
    };
  }, [geometry, nozzleDiameterMm]);

  useEffect(() => {
    if (activeHeatmap === "thinWall" && thinWallAttribute) {
      geometry.setAttribute("aIsThin", thinWallAttribute);
      geometry.attributes.aIsThin.needsUpdate = true;
    } else if (geometry.hasAttribute("aIsThin")) {
      geometry.deleteAttribute("aIsThin");
    }
  }, [activeHeatmap, thinWallAttribute, geometry]);

  useEffect(() => {
    if (!geometry) return;

    let volumeMm3 = 0;
    let surfaceAreaMm2 = 0;
    let overhangAreaMm2 = 0;
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal?.array;

    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const p3 = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const cross = new THREE.Vector3();
    const gravity = new THREE.Vector3(0, 0, -1);

    for (let i = 0; i < positions.length; i += 9) {
      p1.fromArray(positions, i);
      p2.fromArray(positions, i + 3);
      p3.fromArray(positions, i + 6);

      volumeMm3 += p1.dot(cross.crossVectors(p2, p3)) / 6.0;

      ab.subVectors(p2, p1);
      ac.subVectors(p3, p1);
      const triArea = cross.crossVectors(ab, ac).length() / 2.0;
      surfaceAreaMm2 += triArea;

      if (normals) {
        const nX = (normals[i] + normals[i + 3] + normals[i + 6]) / 3;
        const nY = (normals[i + 1] + normals[i + 4] + normals[i + 7]) / 3;
        const nZ = (normals[i + 2] + normals[i + 5] + normals[i + 8]) / 3;
        const normVec = new THREE.Vector3(nX, nY, nZ).normalize();

        const dotDown = normVec.dot(gravity);
        const overhangAngle = Math.asin(Math.min(Math.max(-dotDown, -1.0), 1.0)) * (180 / Math.PI);
        if (overhangAngle > 45) {
          overhangAreaMm2 += triArea;
        }
      }
    }
    volumeMm3 = Math.abs(volumeMm3);

    const baseDensity = FILAMENT_PROFILES[filamentKey]?.density || 1.24;
    const infillRatio = infillPercent / 100;

    const avgShellThicknessMm = deriveAverageThicknessMm(
      nozzleDiameterMm,
      layerHeightMm,
      wallLoopCount,
      topLayerCount,
      bottomLayerCount
    );

    const surfaceAreaCm2 = surfaceAreaMm2 / 100;
    const totalVolumeCm3 = volumeMm3 / 1000;
    const avgShellThicknessCm = avgShellThicknessMm / 10;

    const rawShellVolumeCm3 = surfaceAreaCm2 * avgShellThicknessCm;
    const complexityRatio = totalVolumeCm3 > 0 ? rawShellVolumeCm3 / totalVolumeCm3 : 0;

    const cavityVolumeCm3 = totalVolumeCm3 * Math.pow(Math.max(0, 1 - complexityRatio / 3.5), 3);
    const shellVolumeCm3 = Math.max(0, totalVolumeCm3 - cavityVolumeCm3);

    const shellWeightGrams = shellVolumeCm3 * baseDensity;
    const infillWeightGrams = cavityVolumeCm3 * infillRatio * baseDensity;

    const weightGrams = shellWeightGrams + infillWeightGrams;
    const cost = (weightGrams / spoolWeightGrams) * spoolPrice;

    const needsSupports = overhangAreaMm2 > surfaceAreaMm2 * 0.05;

    let layerMultiplier = 0.5;
    if (nozzleDiameterMm <= 0.25) layerMultiplier = 0.35;
    else if (nozzleDiameterMm >= 0.8) layerMultiplier = 0.6;

    if (complexityRatio > 0.4) layerMultiplier -= 0.05;

    const recLayerHeightMm = Number(Math.max(0.04, nozzleDiameterMm * layerMultiplier).toFixed(2));
    const baseWallCount = Math.max(1, Math.round(1.2 / (nozzleDiameterMm * 1.1)));

    const recWallLoopCount = complexityRatio > 0.35 || maxStressRatio > 3.0
      ? baseWallCount + 1
      : baseWallCount;

    let recInfillPercent = 15;
    if (maxStressRatio > 3.5) {
      recInfillPercent = 25;
    } else if (complexityRatio > 0.5) {
      recInfillPercent = 10;
    }

    const totalVertices = geometry.attributes.position.count;

    onModelAnalyzed({
      x: dimensions.x,
      y: dimensions.y,
      z: dimensions.z,
      volume: volumeMm3,
      surfaceArea: surfaceAreaMm2,
      triangles: positions.length / 9,
      shellThicknessMm: avgShellThicknessMm,
      materialEstimate: { weightGrams, cost, shellWeightGrams, infillWeightGrams },
      heatmapMetrics: {
        overhangRatio: surfaceAreaMm2 > 0 ? overhangAreaMm2 / surfaceAreaMm2 : 0,
        stressScore: maxStressRatio,
        thinWallRatio: totalVertices > 0 ? thinWallCount / totalVertices : 0,
        complexityRatio,
      },
      recommendations: {
        supportsRequired: needsSupports,
        wallLoopCount: recWallLoopCount,
        infillPercent: recInfillPercent,
        layerHeightMm: recLayerHeightMm,
        nozzleDiameterMm: nozzleDiameterMm,
        reasoning: {
          overhangRatio: surfaceAreaMm2 > 0 ? (overhangAreaMm2 / surfaceAreaMm2).toFixed(3) : 0,
          complexityRatio: complexityRatio.toFixed(3),
          structuralStressScore: maxStressRatio.toFixed(2),
        },
      },
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
    maxStressRatio,
    thinWallCount,
  ]);

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

  const materials = useMemo(() => {
    const standard = new THREE.MeshStandardMaterial({
      color: fallbackColor,
      roughness: 0.4,
      metalness: 0.1,
      wireframe: wireframe,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
      transparent: false,
    });

    const overhang = new THREE.ShaderMaterial({
      uniforms: {
        minZ: { value: bounds.min.z },
        maxZ: { value: bounds.max.z },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>

        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>

        uniform float minZ;
        uniform float maxZ;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          #include <logdepthbuf_fragment>

          vec3 n = normalize(vWorldNormal);
          vec3 gravity = vec3(0.0, 0.0, -1.0);
          float dotDown = dot(n, gravity);
          vec3 color;

          float heightRange = maxZ - minZ;
          float relativeHeight = heightRange > 0.0 ? (vWorldPosition.z - minZ) / heightRange : 0.0;

          if (relativeHeight <= 0.05 && n.z > -0.6) {
            color = vec3(0.0, 0.4, 1.0); 
          } else {
            float overhangAngle = degrees(asin(clamp(-dotDown, -1.0, 1.0)));
            
            if (overhangAngle <= 45.0) {
              color = vec3(0.0, 0.4, 1.0); 
            } else if (overhangAngle <= 68.1) {
              color = vec3(1.0, 0.8, 0.0); 
            } else {
              color = vec3(1.0, 0.1, 0.1); 
            }
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      wireframe: wireframe,
      depthWrite: true,
      depthTest: true,
      transparent: false,
      side: THREE.FrontSide,
    });

    const stress = new THREE.ShaderMaterial({
      uniforms: {
        minZ: { value: bounds.min.z },
        maxZ: { value: bounds.max.z },
        uStressTex: { value: stressTexture },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        
        varying vec3 vWorldPosition;
        
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        
        uniform float minZ;
        uniform float maxZ;
        uniform sampler2D uStressTex;
        varying vec3 vWorldPosition;
        
        void main() {
          #include <logdepthbuf_fragment>
          
          float heightRatio = (maxZ - minZ) > 0.0 ? (vWorldPosition.z - minZ) / (maxZ - minZ) : 0.0;
          float t = clamp(heightRatio, 0.001, 0.999);
          
          float stress = texture2D(uStressTex, vec2(t, 0.5)).r;
          
          vec3 color;
          if (stress < 0.5) {
            color = mix(vec3(0.0, 0.4, 1.0), vec3(1.0, 0.9, 0.0), stress * 2.0);
          } else {
            color = mix(vec3(1.0, 0.9, 0.0), vec3(1.0, 0.1, 0.1), (stress - 0.5) * 2.0);
          }
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      wireframe: wireframe,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true,
      transparent: false,
    });

    const thinWall = new THREE.ShaderMaterial({
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>

        attribute float aIsThin;
        varying float vIsThin;

        void main() {
          vIsThin = aIsThin;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>

        varying float vIsThin;

        void main() {
          #include <logdepthbuf_fragment>

          vec3 color;
          if (vIsThin > 0.5) {
            color = vec3(1.0, 0.0, 0.0);
          } else {
            color = vec3(0.0, 0.8, 0.3);
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      wireframe: wireframe,
      depthWrite: true,
      depthTest: true,
      transparent: false,
      side: THREE.FrontSide,
    });

    return { standard, overhang, stress, thinWall };
  }, [fallbackColor, wireframe, bounds, stressTexture]);

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
      renderOrder={1}
    />
  );
}