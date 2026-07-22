import { Suspense, useState, useRef, useMemo, type ChangeEvent } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Model from "./Model";
import type { LoadedModel } from "./types";

interface AnalysisData {
  x: number;
  y: number;
  z: number;
  triangles: number;
  volume: number; // <-- Add this
  weight: number; // <-- Add this
}


function CameraResetController({ resetTrigger }: { resetTrigger: number }) {
  const lastTrigger = useRef(resetTrigger);
  const isAnimating = useRef(false);

  const targetCamPos = useMemo(() => new THREE.Vector3(12, -12, 12), []);
  const targetLookAt = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  if (resetTrigger !== lastTrigger.current) {
    lastTrigger.current = resetTrigger;
    isAnimating.current = true;
  }

  useFrame((state) => {
    if (!isAnimating.current) return;

    const cam = state.camera;
    const controls = state.controls as any;

    cam.position.lerp(targetCamPos, 0.1);

    if (controls) {
      controls.target.lerp(targetLookAt, 0.1);
      controls.update();
    } else {
      cam.lookAt(targetLookAt);
    }

    if (cam.position.distanceTo(targetCamPos) < 0.01) {
      cam.position.copy(targetCamPos);
      if (controls) controls.target.copy(targetLookAt);
      isAnimating.current = false;
    }
  });

  return null;
}

export default function App() {
  const [currentModel, setCurrentModel] = useState<LoadedModel | null>(null);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [fallbackColor] = useState<string>("#cccccc");
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [useInches, setUseInches] = useState<boolean>(false);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalysis(null);

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const blobUrl = URL.createObjectURL(file);

    setCurrentModel({
      format: extension,
      objectUrl: blobUrl,
    });
  };

  const triggerHomeView = () => {
    setResetCounter((prev) => prev + 1);
  };

  const formatDim = (value: number) => {
    if (useInches) {
      return `${(value * 0.0393701).toFixed(3)} in`;
    }
    return `${value.toFixed(1)} mm`;
  };
  const formatVolume = (value: number) => {
  if (useInches) {
    return `${(value * 0.000061023843).toFixed(4)} in³`;
  }
  return `${value.toFixed(1)} mm³`;
};

const formatWeight = (value: number) => {
  return `${value.toFixed(2)} g`;
};



  const customAxesHelper = useMemo(() => {
    const group = new THREE.Group();

    const xPoints = [new THREE.Vector3(-15, 0, 0), new THREE.Vector3(15, 0, 0)];
    const xGeom = new THREE.BufferGeometry().setFromPoints(xPoints);
    const redMat = new THREE.LineBasicMaterial({ color: 0xFF4554, linewidth: 2 });
    const xAxis = new THREE.Line(xGeom, redMat);

    const yPoints = [new THREE.Vector3(0, -15, 0), new THREE.Vector3(0, 15, 0)];
    const yGeom = new THREE.BufferGeometry().setFromPoints(yPoints);
    const greenMat = new THREE.LineBasicMaterial({ color: 0x80C627, linewidth: 2 });
    const yAxis = new THREE.Line(yGeom, greenMat);

    const zPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 15)];
    const zGeom = new THREE.BufferGeometry().setFromPoints(zPoints);
    const blueMat = new THREE.LineBasicMaterial({ color: 0x3B80E6FF, linewidth: 2 });
    const zAxis = new THREE.Line(zGeom, blueMat);

    group.add(xAxis, yAxis, zAxis);
    return group;
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#111111", position: "relative" }}>
      
      <Canvas 
        shadows 
        camera={{ position: [12, -12, 12], fov: 45 }}
        onCreated={({ camera }) => {
          camera.up.set(0, 0, 1);
          camera.lookAt(0, 0, 0);
        }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, -10, 15]} intensity={1.5} castShadow />
        <pointLight position={[-5, 5, 5]} intensity={0.5} />
        
        <gridHelper 
          args={[30, 30, "#333333", "#333333"]} 
          position={[0, 0, -0.01]} 
          rotation={[Math.PI / 2, 0, 0]}
        />
        
        <primitive object={customAxesHelper} position={[0, 0, 0.005]} />

        <Suspense fallback={null}>
          {currentModel && (
            <Model 
              model={currentModel} 
              wireframe={wireframe} 
              fallbackColor={fallbackColor} 
              onModelAnalyzed={setAnalysis}
            />
          )}
        </Suspense>

        <OrbitControls makeDefault minDistance={1} maxDistance={100} />
        <CameraResetController resetTrigger={resetCounter} />
      </Canvas>

      <div style={{ 
        position: "absolute", top: 20, left: 20, 
        display: "flex", flexDirection: "column", gap: 14,
        zIndex: 10, width: "240px"
      }}>
        
        <div style={{
          background: "linear-gradient(135deg, #2196f3, #00e5ff)",
          padding: "12px 20px", borderRadius: 8, color: "#ffffff",
          fontFamily: "sans-serif", fontWeight: "bold", fontSize: "18px",
          letterSpacing: "1px", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          textTransform: "uppercase", textAlign: "center"
        }}>
          PrintWise
        </div>

        <div style={{ 
          background: "rgba(0, 0, 0, 0.85)", padding: 18, 
          borderRadius: 8, color: "#fff", fontFamily: "sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 12
        }}>
          <h3 style={{ margin: 0, fontSize: "13px", letterSpacing: "0.5px", color: "#aaa" }}>
            Workspace Options
          </h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "11px", color: "#888" }}>Upload Model File:</label>
            <input 
              type="file" 
              accept=".gltf,.glb,.obj,.stl,.fbx,.ply" 
              onChange={handleFileUpload}
              style={{ color: "#fff", cursor: "pointer", fontSize: "12px", width: "100%" }}
            />
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #333", margin: "2px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button 
              onClick={triggerHomeView}
              style={{
                background: "#2196f3", color: "#fff", border: "none",
                padding: "8px 12px", borderRadius: 4, cursor: "pointer",
                fontWeight: "bold", fontSize: "12px", textAlign: "center"
              }}
            >
              Isometric Home View
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "12px" }}>
              <input 
                type="checkbox" 
                checked={wireframe} 
                onChange={(e) => setWireframe(e.target.checked)} 
              />
              Wireframe Overlay
            </label>
          </div>
        </div>

        <div style={{ 
          background: "rgba(0, 0, 0, 0.85)", padding: 18, 
          borderRadius: 8, color: "#fff", fontFamily: "sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 12
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontSize: "13px", letterSpacing: "0.5px", color: "#aaa" }}>
              Analysis Panel
            </h3>
            {analysis && (
              <button
                onClick={() => setUseInches(!useInches)}
                style={{
                  background: "#4caf50", color: "#fff", border: "none",
                  padding: "4px 8px", borderRadius: 4, cursor: "pointer",
                  fontSize: "11px", fontWeight: "bold"
                }}
              >
                Unit: {useInches ? "IN" : "MM"}
              </button>
            )}
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #333", margin: "2px 0" }} />

          {analysis ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa" }}>X (Width):</span>
                <span style={{ fontWeight: "bold", color: "#e91e63" }}>{formatDim(analysis.x)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa" }}>Y (Depth):</span>
                <span style={{ fontWeight: "bold", color: "#4caf50" }}>{formatDim(analysis.y)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa" }}>Z (Height):</span>
                <span style={{ fontWeight: "bold", color: "#2196f3" }}>{formatDim(analysis.z)}</span>
              </div>
              
              <hr style={{ border: "none", borderTop: "1px solid #222", margin: "4px 0" }} />
              
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa" }}>Triangles:</span>
                <span style={{ fontWeight: "bold", color: "#ff9800" }}>
                  {analysis.triangles.toLocaleString()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
  <span style={{ color: "#aaa" }}>Volume:</span>
  <span style={{ fontWeight: "bold", color: "#00e5ff" }}>{formatVolume(analysis.volume)}</span>
</div>

<div style={{ display: "flex", justifyContent: "space-between" }}>
  <span style={{ color: "#aaa" }}>PLA Weight:</span>
  <span style={{ fontWeight: "bold", color: "#e91e63" }}>{formatWeight(analysis.weight)}</span>
</div>

            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "#666", textAlign: "center", padding: "6px 0" }}>
              Upload a 3D asset file to populate printing analytics.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
