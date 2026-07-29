import { useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import type { LoadedModel } from "./types";

interface ModelProps {
  model: LoadedModel;
  wireframe: boolean;
  fallbackColor: string;
  infillPercent?: number;
  nozzleDiameter?: number; // hardware fact -- can't be auto-recommended, still an input
  spoolPrice?: number;
  spoolWeightGrams?: number;
  filamentDensity?: number;
  showHoles?: boolean;
  onHolesDetected?: (data: { hasHoles: boolean; openEdgeCount: number }) => void;
  onModelAnalyzed: (data: {
    x: number;
    y: number;
    z: number;
    triangles: number;
    volume: number;
    maxOverhang: number;
    facesOverThreshold: number;
    supportSurfacePercent: number;
    bridgeSurfaceArea: number;
    bridgePercent: number;
    surfaceArea: number;
    wallArea: number;
    capArea: number;
    estimatedWeightGrams: number;
    estimatedMaterialCost: number;
    recommendedPerimeters: number;
    recommendedTopSolidLayers: number;
    recommendedBottomSolidLayers: number;
    recommendedLayerHeightMm: number;
  }) => void;
}

// area: triangle area (mm²)
// localThickness: raycast distance to the opposite surface, in mm (null if
// the ray found nothing -- open mesh / edge case, don't clamp in that case)
interface ThicknessSample {
  area: number;
  localThickness: number | null;
}

interface GeometryRawData {
  totalTriangles: number;
  totalVolumeMm3: number;
  totalSurfaceAreaMm2: number;
  wallSurfaceAreaMm2: number;
  capSurfaceAreaMm2: number;
  supportSurfaceAreaMm2: number;
  maxOverhangRad: number;
  facesOverThreshold: number;
  sizeMm: THREE.Vector3;
  wallSamples: ThicknessSample[];
  topCapSamples: ThicknessSample[];
  bottomCapSamples: ThicknessSample[];
}

// Simple, transparent heuristics -- a reasonable starting point, not a
// physics-validated optimum. Bigger/simpler parts get coarser layers (faster
// prints where fine detail doesn't matter); top/bottom layer counts are
// picked to hit a real-world target solid thickness regardless of layer
// height, since that's what actually determines whether infill gaps get
// bridged over cleanly.
function computeRecommendedSettings(maxDimMm: number, supportSurfacePercent: number, nozzleDiameterMm: number) {
  let layerHeightMm: number;
  if (maxDimMm < 40) layerHeightMm = 0.12;
  else if (maxDimMm < 120) layerHeightMm = 0.16;
  else if (maxDimMm < 250) layerHeightMm = 0.2;
  else layerHeightMm = 0.24;

  // More overhang/support-heavy parts benefit from finer resolution on
  // bridged/angled surfaces.
  if (supportSurfacePercent > 15 && layerHeightMm > 0.12) {
    layerHeightMm -= 0.04;
  }

  // Layer height is physically constrained by nozzle diameter: too fine and
  // the nozzle can't extrude a consistent bead, too coarse and layers won't
  // bond properly. ~25%-80% of nozzle diameter is the commonly usable range
  // (e.g. a 0.2mm nozzle tops out well before a 0.24mm layer is viable).
  const minLayerHeightMm = Math.max(0.08, nozzleDiameterMm * 0.25);
  const maxLayerHeightMm = nozzleDiameterMm * 0.8;
  layerHeightMm = Math.min(maxLayerHeightMm, Math.max(minLayerHeightMm, layerHeightMm));
  layerHeightMm = Math.round(layerHeightMm * 100) / 100;

  // Wall loops: default 3; bump to 4 for larger parts, more likely to be
  // functional/load-bearing rather than purely decorative.
  const perimeters = maxDimMm > 100 ? 4 : 3;

  const TARGET_TOP_THICKNESS_MM = 0.8;
  const TARGET_BOTTOM_THICKNESS_MM = 0.6; // slightly less; first-layer squish adds effective thickness
  const topSolidLayers = Math.max(2, Math.ceil(TARGET_TOP_THICKNESS_MM / layerHeightMm));
  const bottomSolidLayers = Math.max(2, Math.ceil(TARGET_BOTTOM_THICKNESS_MM / layerHeightMm));

  return { perimeters, topSolidLayers, bottomSolidLayers, layerHeightMm };
}

export default function Model({
  model,
  wireframe,
  fallbackColor,
  infillPercent = 15,
  nozzleDiameter = 0.4,
  spoolPrice = 25,
  spoolWeightGrams = 1000,
  filamentDensity = 1.24,
  showHoles = false,
  onHolesDetected,
  onModelAnalyzed,
}: ModelProps) {
  if (!model || !model.objectUrl) return null;

  const rawLoadedGeometry = useLoader(STLLoader, model.objectUrl);
  const [rawData, setRawData] = useState<GeometryRawData | null>(null);
  const [holeEdgeGeometry, setHoleEdgeGeometry] = useState<THREE.BufferGeometry | null>(null);

  // 1. Process Geometry: Center XY, and ground lowest vertex to Z = 0
  const displayGeometry = useMemo(() => {
    if (!rawLoadedGeometry) return null;
    const geom = rawLoadedGeometry.clone();

    geom.center();

    geom.computeBoundingBox();
    if (geom.boundingBox) {
      const minZ = geom.boundingBox.min.z;
      geom.translate(0, 0, -minZ);
    }

    geom.computeVertexNormals();
    return geom;
  }, [rawLoadedGeometry]);

  // 2. Surface & Volume Extraction + local-thickness sampling
  useEffect(() => {
    if (!displayGeometry) return;

    const pos = displayGeometry.attributes.position;
    if (!pos) return;

    const normalAttr = displayGeometry.attributes.normal;
    const vertexCount = pos.count;
    const totalTriangles = vertexCount / 3;

    let totalVolumeMm3 = 0;
    let totalSurfaceAreaMm2 = 0;
    let wallSurfaceAreaMm2 = 0;
    let capSurfaceAreaMm2 = 0;
    let supportSurfaceAreaMm2 = 0;
    let maxOverhangRad = 0;
    let facesOverThreshold = 0;

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    const nA = new THREE.Vector3();
    const nB = new THREE.Vector3();
    const nC = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();

    const colorArray = new Float32Array(vertexCount * 3);
    const defaultColor = new THREE.Color(fallbackColor);
    const riskyColor = new THREE.Color("#ff3333");

    // Raycast from each sampled triangle's centroid, inward (opposite its
    // normal), to measure the real local material thickness at that point.
    // This is what lets thin/curved features (Benchy's hull) and chunky
    // features (a thick bracket) each get physically appropriate shell
    // thickness, instead of one global constant applied everywhere.
    const raycaster = new THREE.Raycaster();
    const rayMesh = new THREE.Mesh(displayGeometry, new THREE.MeshBasicMaterial());
    const EPS = 0.01; // mm, nudge past the origin triangle to avoid self-hits

    // Sample a stride of triangles rather than all of them -- brute-force
    // raycasting (no acceleration structure) is O(triangles) per ray.
    const desiredSamples = 2000;
    const stride = Math.max(1, Math.floor(totalTriangles / desiredSamples));

    const wallSamples: ThicknessSample[] = [];
    const topCapSamples: ThicknessSample[] = [];
    const bottomCapSamples: ThicknessSample[] = [];

    let triIndex = 0;

    for (let i = 0; i < vertexCount; i += 3) {
      pA.fromBufferAttribute(pos, i);
      pB.fromBufferAttribute(pos, i + 1);
      pC.fromBufferAttribute(pos, i + 2);

      const v321 = pC.x * pB.y * pA.z;
      const v231 = pB.x * pC.y * pA.z;
      const v312 = pC.x * pA.y * pB.z;
      const v132 = pA.x * pC.y * pB.z;
      const v213 = pB.x * pA.y * pC.z;
      const v123 = pA.x * pB.y * pC.z;
      totalVolumeMm3 += (-v321 + v231 + v312 - v132 - v213 + v123) / 6.0;

      const edge1 = new THREE.Vector3().subVectors(pB, pA);
      const edge2 = new THREE.Vector3().subVectors(pC, pA);
      const cross = new THREE.Vector3().crossVectors(edge1, edge2);
      const area = cross.length() / 2.0;
      totalSurfaceAreaMm2 += area;

      if (normalAttr) {
        nA.fromBufferAttribute(normalAttr, i);
        nB.fromBufferAttribute(normalAttr, i + 1);
        nC.fromBufferAttribute(normalAttr, i + 2);
        faceNormal.addVectors(nA, nB).add(nC).divideScalar(3).normalize();
      } else {
        faceNormal.copy(cross).normalize();
      }

      const isWallFace = Math.abs(faceNormal.z) < 0.5;
      const isTopFace = !isWallFace && faceNormal.z > 0;

      if (isWallFace) {
        wallSurfaceAreaMm2 += area;
      } else {
        capSurfaceAreaMm2 += area;
      }

      if (triIndex % stride === 0) {
        centroid.set(
          (pA.x + pB.x + pC.x) / 3,
          (pA.y + pB.y + pC.y) / 3,
          (pA.z + pB.z + pC.z) / 3
        );

        rayDir.copy(faceNormal).negate();
        rayOrigin.copy(centroid).addScaledVector(rayDir, EPS);
        raycaster.set(rayOrigin, rayDir);
        raycaster.far = 100000;

        const hits = raycaster.intersectObject(rayMesh, false);
        const localThickness = hits.length > 0 ? hits[0].distance + EPS : null;

        const sample: ThicknessSample = { area, localThickness };
        if (isWallFace) {
          wallSamples.push(sample);
        } else if (isTopFace) {
          topCapSamples.push(sample);
        } else {
          bottomCapSamples.push(sample);
        }
      }
      triIndex++;

      let isOverhang = false;

      if (faceNormal.z < -0.01) {
        const isFlatBase = faceNormal.z <= -0.99;

        if (!isFlatBase) {
          const angleOffVertical =
            Math.asin(Math.abs(faceNormal.z)) * (180 / Math.PI);

          if (angleOffVertical > maxOverhangRad) {
            maxOverhangRad = angleOffVertical;
          }

          if (angleOffVertical >= 60) {
            facesOverThreshold++;
            supportSurfaceAreaMm2 += area;
            isOverhang = true;
          }
        }
      }

      const activeColor = isOverhang ? riskyColor : defaultColor;

      for (let v = 0; v < 3; v++) {
        colorArray[(i + v) * 3] = activeColor.r;
        colorArray[(i + v) * 3 + 1] = activeColor.g;
        colorArray[(i + v) * 3 + 2] = activeColor.b;
      }
    }

    displayGeometry.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    displayGeometry.attributes.color.needsUpdate = true;

    displayGeometry.computeBoundingBox();
    const bbox = displayGeometry.boundingBox!;
    const sizeMm = new THREE.Vector3();
    bbox.getSize(sizeMm);

    setRawData({
      totalTriangles,
      totalVolumeMm3: Math.abs(totalVolumeMm3),
      totalSurfaceAreaMm2,
      wallSurfaceAreaMm2,
      capSurfaceAreaMm2,
      supportSurfaceAreaMm2,
      maxOverhangRad,
      facesOverThreshold,
      sizeMm,
      wallSamples,
      topCapSamples,
      bottomCapSamples,
    });
  }, [displayGeometry, fallbackColor]);

  // 2b. Hole Detection: in a watertight mesh, every edge is shared by
  // exactly two triangles. An edge belonging to only one triangle is a
  // "boundary edge" -- a gap in the surface. The slicer has to guess how to
  // patch these, which can silently drop walls or fail to slice.
  useEffect(() => {
    if (!displayGeometry) return;

    const pos = displayGeometry.attributes.position;
    if (!pos) {
      setHoleEdgeGeometry(null);
      onHolesDetected?.({ hasHoles: false, openEdgeCount: 0 });
      return;
    }

    const vertexCount = pos.count;
    const PRECISION = 1000; // round to 0.001mm to merge coincident vertices
    const round = (v: number) => Math.round(v * PRECISION) / PRECISION;
    const keyFor = (x: number, y: number, z: number) => `${round(x)}_${round(y)}_${round(z)}`;

    // edgeKey -> { count, endpoints }
    const edgeMap = new Map<string, { count: number; a: [number, number, number]; b: [number, number, number] }>();

    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

    for (let i = 0; i < vertexCount; i += 3) {
      v[0].fromBufferAttribute(pos, i);
      v[1].fromBufferAttribute(pos, i + 1);
      v[2].fromBufferAttribute(pos, i + 2);

      for (let e = 0; e < 3; e++) {
        const p1 = v[e];
        const p2 = v[(e + 1) % 3];
        const k1 = keyFor(p1.x, p1.y, p1.z);
        const k2 = keyFor(p2.x, p2.y, p2.z);
        const edgeKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;

        const existing = edgeMap.get(edgeKey);
        if (existing) {
          existing.count++;
        } else {
          edgeMap.set(edgeKey, { count: 1, a: [p1.x, p1.y, p1.z], b: [p2.x, p2.y, p2.z] });
        }
      }
    }

    const openEdges: { a: [number, number, number]; b: [number, number, number] }[] = [];
    for (const entry of edgeMap.values()) {
      if (entry.count === 1) {
        openEdges.push(entry);
      }
    }

    if (openEdges.length > 0) {
      const linePositions = new Float32Array(openEdges.length * 6);
      openEdges.forEach((edge, idx) => {
        linePositions[idx * 6 + 0] = edge.a[0];
        linePositions[idx * 6 + 1] = edge.a[1];
        linePositions[idx * 6 + 2] = edge.a[2];
        linePositions[idx * 6 + 3] = edge.b[0];
        linePositions[idx * 6 + 4] = edge.b[1];
        linePositions[idx * 6 + 5] = edge.b[2];
      });
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
      setHoleEdgeGeometry(lineGeom);
    } else {
      setHoleEdgeGeometry(null);
    }

    onHolesDetected?.({ hasHoles: openEdges.length > 0, openEdgeCount: openEdges.length });
  }, [displayGeometry]);


  useEffect(() => {
    if (!rawData) return;

    const {
      totalTriangles,
      totalVolumeMm3,
      totalSurfaceAreaMm2,
      wallSurfaceAreaMm2,
      capSurfaceAreaMm2,
      supportSurfaceAreaMm2,
      maxOverhangRad,
      facesOverThreshold,
      sizeMm,
      wallSamples,
      topCapSamples,
      bottomCapSamples,
    } = rawData;

    const { perimeters, topSolidLayers, bottomSolidLayers, layerHeightMm } =
      computeRecommendedSettings(Math.max(sizeMm.x, sizeMm.y, sizeMm.z), (supportSurfaceAreaMm2 / Math.max(1, totalSurfaceAreaMm2)) * 100, nozzleDiameter);

    const extrusionWidthMm = nozzleDiameter * 1.125;
    const wallThicknessMm = perimeters * extrusionWidthMm;
    const topCapThicknessMm = topSolidLayers * layerHeightMm;
    const bottomCapThicknessMm = bottomSolidLayers * layerHeightMm;

    // For each sample, effective thickness can't exceed half the distance to
    // the opposite surface -- this is what prevents thin features (a
    // Benchy hull, a fin) from having their material counted from both
    // sides. Then scale the sampled shell volume up to the full measured
    // area for that category.
    const accumulateShell = (
      samples: ThicknessSample[],
      configuredThicknessMm: number,
      measuredAreaMm2: number
    ) => {
      if (samples.length === 0 || measuredAreaMm2 === 0) return 0;
      let sampledShell = 0;
      let sampledArea = 0;
      for (const s of samples) {
        const effectiveThickness =
          s.localThickness === null
            ? configuredThicknessMm
            : Math.min(configuredThicknessMm, s.localThickness / 2);
        sampledShell += s.area * effectiveThickness;
        sampledArea += s.area;
      }
      if (sampledArea === 0) return measuredAreaMm2 * configuredThicknessMm;
      return sampledShell * (measuredAreaMm2 / sampledArea);
    };

    // Cap area split proportionally between top/bottom samples for scaling
    const topCapMeasuredArea =
      topCapSamples.length + bottomCapSamples.length > 0
        ? capSurfaceAreaMm2 * (topCapSamples.length / (topCapSamples.length + bottomCapSamples.length))
        : 0;
    const bottomCapMeasuredArea = capSurfaceAreaMm2 - topCapMeasuredArea;

    const wallShellVolumeMm3 = accumulateShell(wallSamples, wallThicknessMm, wallSurfaceAreaMm2);
    const topCapShellVolumeMm3 = accumulateShell(topCapSamples, topCapThicknessMm, topCapMeasuredArea);
    const bottomCapShellVolumeMm3 = accumulateShell(bottomCapSamples, bottomCapThicknessMm, bottomCapMeasuredArea);

    let shellVolumeMm3 = wallShellVolumeMm3 + topCapShellVolumeMm3 + bottomCapShellVolumeMm3;

    // Safety fallback only: shell physically cannot exceed the model's own volume
    if (shellVolumeMm3 > totalVolumeMm3) {
      shellVolumeMm3 = totalVolumeMm3;
    }

    const coreVolumeMm3 = Math.max(0, totalVolumeMm3 - shellVolumeMm3);

    // Plain linear infill scaling -- no fitted exponent/floor/correction constant.
    const infillRatio = infillPercent / 100;
    const printedPlasticVolumeMm3 = shellVolumeMm3 + coreVolumeMm3 * infillRatio;

    const estimatedWeightGrams = (printedPlasticVolumeMm3 / 1000) * filamentDensity;
    const costPerGram = spoolPrice / spoolWeightGrams;
    const estimatedMaterialCost = estimatedWeightGrams * costPerGram;

    const supportPercent =
      totalSurfaceAreaMm2 > 0 ? (supportSurfaceAreaMm2 / totalSurfaceAreaMm2) * 100 : 0;

    console.log("[SliceDebug] ---- Shell/Core Breakdown ----");
    console.log("[SliceDebug] totalVolumeMm3:", totalVolumeMm3.toFixed(1));
    console.log("[SliceDebug] wallThicknessMm:", wallThicknessMm.toFixed(3), "| topCapThicknessMm:", topCapThicknessMm.toFixed(3), "| bottomCapThicknessMm:", bottomCapThicknessMm.toFixed(3));
    console.log("[SliceDebug] wallShellVolumeMm3:", wallShellVolumeMm3.toFixed(1), "| topCapShellVolumeMm3:", topCapShellVolumeMm3.toFixed(1), "| bottomCapShellVolumeMm3:", bottomCapShellVolumeMm3.toFixed(1));
    console.log("[SliceDebug] TOTAL shellVolumeMm3:", shellVolumeMm3.toFixed(1), "| coreVolumeMm3:", coreVolumeMm3.toFixed(1));
    console.log("[SliceDebug] shell % of total volume:", ((shellVolumeMm3 / totalVolumeMm3) * 100).toFixed(1) + "%");
    console.log("[SliceDebug] estimatedWeightGrams:", estimatedWeightGrams.toFixed(1));

    onModelAnalyzed({
      x: Math.round(sizeMm.x * 10) / 10,
      y: Math.round(sizeMm.y * 10) / 10,
      z: Math.round(sizeMm.z * 10) / 10,
      triangles: Math.round(totalTriangles),
      volume: Math.round(totalVolumeMm3),
      maxOverhang: Math.round(maxOverhangRad),
      facesOverThreshold,
      supportSurfacePercent: Math.round(supportPercent * 10) / 10,
      bridgeSurfaceArea: 0,
      bridgePercent: 0,
      surfaceArea: Math.round(totalSurfaceAreaMm2),
      wallArea: Math.round(wallSurfaceAreaMm2),
      capArea: Math.round(capSurfaceAreaMm2),
      estimatedWeightGrams: Number(estimatedWeightGrams.toFixed(1)),
      estimatedMaterialCost: Number(estimatedMaterialCost.toFixed(2)),
      recommendedPerimeters: perimeters,
      recommendedTopSolidLayers: topSolidLayers,
      recommendedBottomSolidLayers: bottomSolidLayers,
      recommendedLayerHeightMm: layerHeightMm,
    });
  }, [
    rawData,
    infillPercent,
    nozzleDiameter,
    spoolPrice,
    spoolWeightGrams,
    filamentDensity,
  ]);

  if (!displayGeometry) return null;

  return (
    <group scale={0.05}>
      <mesh
        geometry={displayGeometry}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          vertexColors={true}
          wireframe={wireframe}
          roughness={0.4}
          metalness={0.15}
        />
      </mesh>
      {showHoles && holeEdgeGeometry && (
        <lineSegments geometry={holeEdgeGeometry}>
          <lineBasicMaterial color="#ff2222" linewidth={3} depthTest={false} />
        </lineSegments>
      )}
    </group>
  );
}
