import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { Center } from "@react-three/drei";
import type { LoadedModel } from "./types";

interface ModelProps {
  model: LoadedModel;
  wireframe: boolean;
  fallbackColor: string;
  onModelAnalyzed: (data: { 
    x: number; 
    y: number; 
    z: number; 
    triangles: number; 
    volume: number; 
    weight: number;
    maxOverhang: number;
    facesOverThreshold: number;
    supportSurfacePercent: number;
  }) => void;
}

function fixTextureColorSpace(object: THREE.Object3D) {
  if (!object) return;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

function applyDisplayOptions(object: THREE.Object3D, wireframe: boolean) {
  if (!object) return;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
          (mat as THREE.Material & { wireframe?: boolean }).wireframe = wireframe;
        }
      }
    }
  });
}

function StlModel({ url, wireframe, fallbackColor, onMeshReady }: { url: string; wireframe: boolean; fallbackColor: string; onMeshReady: (mesh: THREE.Mesh) => void }) {
  const geometry = useLoader(STLLoader, url);

  const clonedGeometry = useMemo(() => {
    return geometry.clone();
  }, [geometry]);

  useEffect(() => {
    clonedGeometry.computeVertexNormals();
    clonedGeometry.center();
  }, [clonedGeometry]);

  return (
    <mesh 
      geometry={clonedGeometry} 
      castShadow 
      receiveShadow
      ref={(mesh) => {
        if (mesh) onMeshReady(mesh);
      }}
    >
      <meshStandardMaterial 
        color="#ffffff" 
        vertexColors={true} 
        roughness={0.4} 
        metalness={0.15} 
        wireframe={wireframe} 
      />
    </mesh>
  );
}

export default function Model({ model, wireframe, fallbackColor, onModelAnalyzed }: ModelProps) {
  if (!model || !model.objectUrl) return null;

  const isStlOrObj = ["stl", "obj"].includes(model.format?.toLowerCase() || "");
  const modelScale = isStlOrObj ? 0.05 : 1; 
  const gridGapOffset = model.format?.toLowerCase() === "stl" ? 0.75: 0;

  const handleMeshReady = (mesh: THREE.Mesh) => {
    const geom = mesh.geometry;
    if (!geom || !geom.attributes.position) return;

    geom.computeVertexNormals();
    
    const position = geom.attributes.position;
    const normal = geom.attributes.normal;
    const index = geom.index;

    let totalTriangles = 0;
    let totalVolume = 0;
    let maxOverhangRad = 0;
    let facesOverThreshold = 0;
    let totalSurfaceArea = 0;
    let supportSurfaceArea = 0;

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    const nA = new THREE.Vector3();
    const nB = new THREE.Vector3();
    const nC = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    const gravity = new THREE.Vector3(0, 0, -1); 

    const colorArray = new Float32Array(position.count * 3);
    const defaultColor = new THREE.Color(fallbackColor);
    const riskyColor = new THREE.Color("#ff3333");

    const processTriangle = (idx0: number, idx1: number, idx2: number) => {
      totalTriangles++;

      pA.fromBufferAttribute(position, idx0);
      pB.fromBufferAttribute(position, idx1);
      pC.fromBufferAttribute(position, idx2);

      totalVolume += pA.dot(pB.cross(pC)) / 6;

      const edge1 = new THREE.Vector3().subVectors(pB, pA);
      const edge2 = new THREE.Vector3().subVectors(pC, pA);
      const cross = new THREE.Vector3().crossVectors(edge1, edge2);
      const area = cross.length() / 2;
      totalSurfaceArea += area;

      if (normal) {
        nA.fromBufferAttribute(normal, idx0);
        nB.fromBufferAttribute(normal, idx1);
        nC.fromBufferAttribute(normal, idx2);
        faceNormal.addVectors(nA, nB).add(nC).divideScalar(3).normalize();
      } else {
        faceNormal.copy(cross).normalize();
      }

      let angleRad = Math.acos(Math.max(-1, Math.min(1, faceNormal.dot(gravity))));
      let angleDeg = angleRad * (180 / Math.PI);

      let isOverhang = false;
      if (faceNormal.z < 0) {
        if (angleDeg > maxOverhangRad) {
          maxOverhangRad = angleDeg;
        }
        if (angleDeg >= 45) {
          facesOverThreshold++;
          supportSurfaceArea += area;
          isOverhang = true;
        }
      }

      const activeColor = isOverhang ? riskyColor : defaultColor;
      
      colorArray[idx0 * 3] = activeColor.r;
      colorArray[idx0 * 3 + 1] = activeColor.g;
      colorArray[idx0 * 3 + 2] = activeColor.b;

      colorArray[idx1 * 3] = activeColor.r;
      colorArray[idx1 * 3 + 1] = activeColor.g;
      colorArray[idx1 * 3 + 2] = activeColor.b;

      colorArray[idx2 * 3] = activeColor.r;
      colorArray[idx2 * 3 + 1] = activeColor.g;
      colorArray[idx2 * 3 + 2] = activeColor.b;
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        processTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (let i = 0; i < position.count; i += 3) {
        processTriangle(i, i + 1, i + 2);
      }
    }

    geom.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    geom.attributes.color.needsUpdate = true;

    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);

    const originalScaleFactor = isStlOrObj ? 20 : 1;
    const finalVolumeMm3 = Math.abs(totalVolume);
    const finalVolumeCm3 = finalVolumeMm3 / 1000;
    const plaWeightGrams = finalVolumeCm3 * 1.24;
    const supportPercent = totalSurfaceArea > 0 ? (supportSurfaceArea / totalSurfaceArea) * 100 : 0;

    onModelAnalyzed({
      x: size.x * originalScaleFactor,
      y: size.y * originalScaleFactor,
      z: size.z * originalScaleFactor,
      triangles: Math.round(totalTriangles),
      volume: finalVolumeMm3,
      weight: plaWeightGrams,
      maxOverhang: Math.round(maxOverhangRad),
      facesOverThreshold,
      supportSurfacePercent: Math.round(supportPercent * 10) / 10
    });
  };

  if (model.format?.toLowerCase() !== "stl") {
    return null; 
  }

  return (
    <Center
      onCentered={(props: any) => {
        const targetGroup = props.container || props.current;
        const box = props.boundingBox || props.box;
        if (targetGroup && box) {
          const size = new THREE.Vector3();
          box.getSize(size);
          targetGroup.position.z = ((size.z * modelScale) / 2) + gridGapOffset;
        }
      }}
    >
      <group scale={[modelScale, modelScale, modelScale]}>
        <StlModel url={model.objectUrl} wireframe={wireframe} fallbackColor={fallbackColor} onMeshReady={handleMeshReady} />
      </group>
    </Center>
  );
}
