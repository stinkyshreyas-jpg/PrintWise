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
  perimeters?: number;
  topSolidLayers?: number;
  bottomSolidLayers?: number;
  layerHeight?: number;
  nozzleDiameter?: number;
  spoolPrice?: number;
  spoolWeightGrams?: number;
  filamentDensity?: number;
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
  }) => void;
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
}

export default function Model({
  model,
  wireframe,
  fallbackColor,
  infillPercent = 20,
  perimeters = 3,
  topSolidLayers = 4,
  bottomSolidLayers = 4,
  layerHeight = 0.2,
  nozzleDiameter = 0.4,
  spoolPrice = 25,
  spoolWeightGrams = 1000,
  filamentDensity = 1.24,
  onModelAnalyzed,
}: ModelProps) {
  if (!model || !model.objectUrl) return null;

  const rawLoadedGeometry = useLoader(STLLoader, model.objectUrl);
  const [rawData, setRawData] = useState<GeometryRawData | null>(null);
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

    const colorArray = new Float32Array(vertexCount * 3);
    const defaultColor = new THREE.Color(fallbackColor);
    const riskyColor = new THREE.Color("#ff3333");

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
      if (Math.abs(faceNormal.z) < 0.5) {
        wallSurfaceAreaMm2 += area;
      } else {
        capSurfaceAreaMm2 += area;
      }

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
    });
  }, [displayGeometry, fallbackColor]);
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
    } = rawData;
    const rawMaxWeight = (totalVolumeMm3 / 1000) * filamentDensity;
    const correctionFactor = 564 / 572;
    const maxPossibleWeight = rawMaxWeight * correctionFactor;

    let estimatedWeightGrams = 0;

    if (infillPercent >= 100) {
      estimatedWeightGrams = maxPossibleWeight;
    } else {
      const volumeLog = Math.log10(Math.max(totalVolumeMm3, 1000));
      let hollowBaseRatio = 0.715 - (volumeLog * 0.07);
      
      hollowBaseRatio = Math.max(0.32, Math.min(hollowBaseRatio, 0.52));

      const hollowWeightGrams = maxPossibleWeight * hollowBaseRatio;
      const solidCoreWeightGrams = maxPossibleWeight - hollowWeightGrams;
      const infillRatio = infillPercent / 100;
      const curvedInfillRatio = Math.pow(infillRatio, 0.85); 

      estimatedWeightGrams = hollowWeightGrams + (solidCoreWeightGrams * curvedInfillRatio);
    }
    if (estimatedWeightGrams > maxPossibleWeight) {
      estimatedWeightGrams = maxPossibleWeight;
    }

    const costPerGram = spoolPrice / spoolWeightGrams;
    const estimatedMaterialCost = estimatedWeightGrams * costPerGram;

    const supportPercent =
      totalSurfaceAreaMm2 > 0 ? (supportSurfaceAreaMm2 / totalSurfaceAreaMm2) * 100 : 0;

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
    });
  }, [
    rawData,
    infillPercent,
    perimeters,
    topSolidLayers,
    bottomSolidLayers,
    layerHeight,
    nozzleDiameter,
    spoolPrice,
    spoolWeightGrams,
    filamentDensity,
  ]);
  if (!displayGeometry) return null;

  return (
    <mesh
      geometry={displayGeometry}
      scale={0.05}
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
  );
}
