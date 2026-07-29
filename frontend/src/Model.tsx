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
  infillPercent = 15,
  perimeters = 4,
  topSolidLayers = 7,
  bottomSolidLayers = 5,
  layerHeight = 0.2,
  nozzleDiameter = 0.2,
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

  
  const lineThicknessMm = nozzleDiameter * 1.05; 
  const wallThicknessMm = perimeters * lineThicknessMm; 

  const topThicknessMm = topSolidLayers * layerHeight;
  const bottomThicknessMm = bottomSolidLayers * layerHeight;
  const avgCapThicknessMm = (topThicknessMm + bottomThicknessMm) / 2;

  
  const totalArea = Math.max(1, totalSurfaceAreaMm2);
  const wallWeight = wallSurfaceAreaMm2 / totalArea;
  const capWeight = capSurfaceAreaMm2 / totalArea;
  
  const rawBlendedThicknessMm = (wallThicknessMm * wallWeight) + (avgCapThicknessMm * capWeight);

  let effectiveThicknessMm = rawBlendedThicknessMm;
  if (rawBlendedThicknessMm > 1.6) {
    effectiveThicknessMm = 1.6 * Math.pow(rawBlendedThicknessMm / 1.6, 0.4);
  }

  const SHELL_CORRECTION = 0.735;
  const calculatedShellVolumeMm3 = totalSurfaceAreaMm2 * effectiveThicknessMm * SHELL_CORRECTION;
  const totalShellVolumeMm3 = Math.min(totalVolumeMm3, calculatedShellVolumeMm3);
  
  
  const cavityVolumeMm3 = Math.max(0, totalVolumeMm3 - totalShellVolumeMm3);
  const maxPossibleWeightGrams = (totalVolumeMm3 / 1000) * filamentDensity;
  const bambuMaxWeightCap = maxPossibleWeightGrams * 0.985;

  
  const debugWeights: string[] = [];
  for (let inf = 5; inf <= 100; inf += 5) {
    const ratio = inf / 100;
    
    
    let eff = 0.86 + (0.13 * Math.pow(ratio, 0.4));
    
    
    
    if (ratio > 0.70 && ratio < 1.0) {
      eff -= 0.065 * (ratio - 0.70); 
    }
    
    
    
    if (ratio >= 1.0) {
      eff = 1.0; 
    }
    
    const infVol = cavityVolumeMm3 * ratio * eff;
    const printVol = totalShellVolumeMm3 + infVol;
    let w = (printVol / 1000) * filamentDensity;
    if (w > bambuMaxWeightCap) w = bambuMaxWeightCap;
    
    debugWeights.push(w.toFixed(1));
  }
  console.log(debugWeights.join('\n'));
  

  
  const activeRatio = infillPercent / 100;
  let activeEfficiency = 0.86 + (0.13 * Math.pow(activeRatio, 0.4));
  
  if (activeRatio > 0.70 && activeRatio < 1.0) {
    activeEfficiency -= 0.065 * (activeRatio - 0.70);
  }
  if (activeRatio >= 1.0) {
    activeEfficiency = 1.0;
  }

  const infillVolumeMm3 = cavityVolumeMm3 * activeRatio * activeEfficiency;
  const printedVolumeMm3 = totalShellVolumeMm3 + infillVolumeMm3;
  const printedVolumeCm3 = printedVolumeMm3 / 1000;

  let estimatedWeightGrams = printedVolumeCm3 * filamentDensity;
  if (estimatedWeightGrams > bambuMaxWeightCap) {
    estimatedWeightGrams = bambuMaxWeightCap;
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