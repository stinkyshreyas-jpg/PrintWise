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
  onModelAnalyzed: (data: { x: number; y: number; z: number; triangles: number; volume: number; weight: number }) => void;
}

function fixTextureColorSpace(object: THREE.Object3D) {
  if (!object) return;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
          const stdMat = mat as THREE.MeshStandardMaterial;
          if (stdMat.map) stdMat.map.colorSpace = THREE.SRGBColorSpace;
          if (stdMat.emissiveMap) stdMat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        }
      }
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

function GltfModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);

  useEffect(() => {
    fixTextureColorSpace(scene);
    applyDisplayOptions(scene, wireframe);
  }, [scene, wireframe]);

  return <primitive object={scene} />;
}

function ObjModelWithMaterials({ url, mtlUrl, wireframe }: { url: string; mtlUrl: string; wireframe: boolean }) {
  const materials = useLoader(MTLLoader, mtlUrl);
  const object = useLoader(OBJLoader, url, (loader) => {
    materials.preload();
    (loader as OBJLoader).setMaterials(materials);
  });
  const cloned = useMemo(() => object.clone(true), [object]);

  useEffect(() => {
    fixTextureColorSpace(cloned);
    applyDisplayOptions(cloned, wireframe);
  }, [cloned, wireframe]);

  return <primitive object={cloned} />;
}

function ObjModelPlain({ url, wireframe, fallbackColor }: { url: string; wireframe: boolean; fallbackColor: string }) {
  const object = useLoader(OBJLoader, url);
  const cloned = useMemo(() => object.clone(true), [object]);

  useEffect(() => {
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          color: fallbackColor,
          roughness: 0.5,
          metalness: 0.1,
        });
      }
    });
    applyDisplayOptions(cloned, wireframe);
  }, [cloned, wireframe, fallbackColor]);

  return <primitive object={cloned} />;
}

function ObjModel({ url, mtlUrl, wireframe, fallbackColor }: { url: string; mtlUrl?: string; wireframe: boolean; fallbackColor: string }) {
  if (mtlUrl) {
    return <ObjModelWithMaterials url={url} mtlUrl={mtlUrl} wireframe={wireframe} />;
  }
  return <ObjModelPlain url={url} wireframe={wireframe} fallbackColor={fallbackColor} />;
}

function StlModel({ url, wireframe, fallbackColor }: { url: string; wireframe: boolean; fallbackColor: string }) {
  const geometry = useLoader(STLLoader, url);

  useEffect(() => {
    geometry.computeVertexNormals();
    geometry.center();
  }, [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={fallbackColor} roughness={0.4} metalness={0.15} wireframe={wireframe} />
    </mesh>
  );
}

function FbxModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const fbx = useLoader(FBXLoader, url);
  const cloned = useMemo(() => fbx.clone(true), [fbx]);

  useEffect(() => {
    fixTextureColorSpace(cloned);
    applyDisplayOptions(cloned, wireframe);
  }, [cloned, wireframe]);

  return <primitive object={cloned} />;
}

function PlyModel({ url, wireframe, fallbackColor }: { url: string; wireframe: boolean; fallbackColor: string }) {
  const geometry = useLoader(PLYLoader, url);
  const hasVertexColors = useMemo(() => !!geometry.getAttribute("color"), [geometry]);

  useEffect(() => {
    geometry.computeVertexNormals();
  }, [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={hasVertexColors ? "#ffffff" : fallbackColor}
        vertexColors={hasVertexColors}
        roughness={0.4}
        metalness={0.1}
        wireframe={wireframe}
      />
    </mesh>
  );
}

export default function Model({ model, wireframe, fallbackColor, onModelAnalyzed }: ModelProps) {
  if (!model || !model.objectUrl) return null;

  let content: ReactNode;

  const isStlOrObj = ["stl", "obj"].includes(model.format?.toLowerCase() || "");
  const modelScale = isStlOrObj ? 0.05 : 1; 
  const gridGapOffset = model.format?.toLowerCase() === "stl" ? 0.75 : 0;

  switch (model.format?.toLowerCase()) {
    case "glb":
    case "gltf":
      content = <GltfModel url={model.objectUrl} wireframe={wireframe} />;
      break;
    case "obj":
      content = (
        <ObjModel
          url={model.objectUrl}
          mtlUrl={model.mtlObjectUrl}
          wireframe={wireframe}
          fallbackColor={fallbackColor}
        />
      );
      break;
    case "stl":
      content = <StlModel url={model.objectUrl} wireframe={wireframe} fallbackColor={fallbackColor} />;
      break;
    case "fbx":
      content = <FbxModel url={model.objectUrl} wireframe={wireframe} />;
      break;
    case "ply":
      content = <PlyModel url={model.objectUrl} wireframe={wireframe} fallbackColor={fallbackColor} />;
      break;
    default:
      throw new Error(`Unsupported 3D model format: ${model.format}`);
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

          let totalTriangles = 0;
          let totalVolume = 0;

          const pA = new THREE.Vector3();
          const pB = new THREE.Vector3();
          const pC = new THREE.Vector3();

          targetGroup.traverse((child: any) => {
            if (child.isMesh && child.geometry) {
              const geom = child.geometry;
              const position = geom.attributes.position;
              const index = geom.index;

              if (index) {
                totalTriangles += index.count / 3;
                for (let i = 0; i < index.count; i += 3) {
                  pA.fromBufferAttribute(position, index.getX(i));
                  pB.fromBufferAttribute(position, index.getX(i + 1));
                  pC.fromBufferAttribute(position, index.getX(i + 2));
                  totalVolume += pA.dot(pB.cross(pC)) / 6;
                }
              } else if (position) {
                totalTriangles += position.count / 3;
                for (let i = 0; i < position.count; i += 3) {
                  pA.fromBufferAttribute(position, i);
                  pB.fromBufferAttribute(position, i + 1);
                  pC.fromBufferAttribute(position, i + 2);
                  totalVolume += pA.dot(pB.cross(pC)) / 6;
                }
              }
            }
          });

          const originalScaleFactor = isStlOrObj ? 20 : 1;
          const finalVolumeMm3 = Math.abs(totalVolume);
          const finalVolumeCm3 = finalVolumeMm3 / 1000;
          const plaWeightGrams = finalVolumeCm3 * 1.24;

          onModelAnalyzed({
            x: size.x * originalScaleFactor,
            y: size.y * originalScaleFactor,
            z: size.z * originalScaleFactor,
            triangles: Math.round(totalTriangles),
            volume: finalVolumeMm3,
            weight: plaWeightGrams
          });
        }
      }}
    >
      <group scale={[modelScale, modelScale, modelScale]}>
        {content}
      </group>
    </Center>
  );
}
