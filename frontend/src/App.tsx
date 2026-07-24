import { Suspense, useState, useRef, useMemo, type ChangeEvent } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Model from "./Model";
import GridMotion from "./GridMotion";
import type { LoadedModel } from "./types";

interface AnalysisData {
  x: number;
  y: number;
  z: number;
  triangles: number;
  volume: number;
  maxOverhang: number;
  facesOverThreshold: number;
  supportSurfacePercent: number;
  surfaceArea: number;
  wallArea: number;
  capArea: number;
}

const PLA_DENSITY_G_CM3 = 1.24;

function computeWeightGrams(a: AnalysisData, infillPercent: number): number {
  const solidWeight = (a.volume / 1000) * PLA_DENSITY_G_CM3;
  const SHELL_FRACTION = 0.412;
  const shellWeight = solidWeight * SHELL_FRACTION;
  return shellWeight + (solidWeight - shellWeight) * (infillPercent / 100);
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
  const [fallbackColor] = useState<string>("#ffffff");
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [useInches, setUseInches] = useState<boolean>(false);
  const [infill, setInfill] = useState<number>(15);
  const [spoolPrice, setSpoolPrice] = useState<number>(20);

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

  const formatWeight = (a: AnalysisData) => {
    const grams = computeWeightGrams(a, infill);
    return `${grams.toFixed(2)} g`;
  };

  const formatCost = (a: AnalysisData) => {
    const grams = computeWeightGrams(a, infill);
    const costPerGram = spoolPrice / 1000;
    return `$${(grams * costPerGram).toFixed(2)}`;
  };

  const customAxesHelper = useMemo(() => {
    const group = new THREE.Group();

    const xPoints = [new THREE.Vector3(-15, 0, 0), new THREE.Vector3(15, 0, 0)];
    const xGeom = new THREE.BufferGeometry().setFromPoints(xPoints);
    const redMat = new THREE.LineBasicMaterial({ color: 0xEF4444, linewidth: 2 });
    const xAxis = new THREE.Line(xGeom, redMat);

    const yPoints = [new THREE.Vector3(0, -15, 0), new THREE.Vector3(0, 15, 0)];
    const yGeom = new THREE.BufferGeometry().setFromPoints(yPoints);
    const greenMat = new THREE.LineBasicMaterial({ color: 0x22C55E, linewidth: 2 });
    const yAxis = new THREE.Line(yGeom, greenMat);

    const zPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 15)];
    const zGeom = new THREE.BufferGeometry().setFromPoints(zPoints);
    const blueMat = new THREE.LineBasicMaterial({ color: 0x3B82F6, linewidth: 2 });
    const zAxis = new THREE.Line(zGeom, blueMat);

    group.add(xAxis, yAxis, zAxis);
    return group;
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#ffffff", position: "relative" }}>
      <Canvas
        shadows
        camera={{ position: [12, -12, 12], fov: 45 }}
        onCreated={({ camera }) => {
          camera.up.set(0, 0, 1);
          camera.lookAt(0, 0, 0);
        }}
        style={{ background: "#ffffff" }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, -10, 15]} intensity={1.5} castShadow />
        <pointLight position={[-5, 5, 5]} intensity={0.5} />

        <gridHelper
          args={[30, 30, "#d4d4d4", "#d4d4d4"]}
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
        zIndex: 10, width: "240px", maxHeight: "calc(100vh - 40px)",
        overflowY: "auto", paddingRight: "4px"
      }}>
        <div style={{
          background: "#000000",
          padding: "12px 20px", borderRadius: 8, color: "#ffffff",
          fontWeight: "bold", fontSize: "18px",
          letterSpacing: "1px", boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          textTransform: "uppercase", textAlign: "center"
        }}>
          PrintWise
        </div>

        <div style={{
          background: "#ffffff", padding: 18,
          borderRadius: 8, color: "#000000",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 12,
          border: "1px solid #d4d4d4"
        }}>
          <h3 style={{ margin: 0, fontSize: "13px", letterSpacing: "0.5px", color: "#000000" }}>
            Workspace Options
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "11px", color: "#000000" }}>Upload Model File:</label>
            <input
              type="file"
              accept=".gltf,.glb,.obj,.stl,.fbx,.ply"
              onChange={handleFileUpload}
              style={{ color: "#000000", cursor: "pointer", fontSize: "12px", width: "100%" }}
            />
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #d4d4d4", margin: "2px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={triggerHomeView}
              style={{
                background: "#000000", color: "#ffffff", border: "none",
                padding: "8px 12px", borderRadius: 4, cursor: "pointer",
                fontWeight: "bold", fontSize: "12px", textAlign: "center"
              }}
            >
              Isometric Home View
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "12px", color: "#000000" }}>
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
          borderRadius: 8, display: "flex", flexDirection: "column",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          maxHeight: "520px", overflow: "hidden", position: "relative",
          border: "1px solid #d4d4d4"
        }}>
          <div style={{
            position: "absolute", inset: 0, overflow: "hidden", borderRadius: 8, zIndex: 0
          }}>
            <GridMotion gradientColor="#000000" />
          </div>
          <div style={{
            position: "relative", zIndex: 1,
            background: "rgba(255,255,255,0.92)", padding: 18,
            display: "flex", flexDirection: "column", gap: 12,
            height: "100%", overflowY: "auto"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: "13px", letterSpacing: "0.5px", color: "#000000" }}>
                Analysis Panel
              </h3>
              {analysis && (
                <button
                  onClick={() => setUseInches(!useInches)}
                  style={{
                    background: "#000000", color: "#ffffff", border: "none",
                    padding: "4px 8px", borderRadius: 4, cursor: "pointer",
                    fontSize: "11px", fontWeight: "bold"
                  }}
                >
                  Unit: {useInches ? "IN" : "MM"}
                </button>
              )}
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #d4d4d4", margin: "2px 0" }} />

            {analysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#000000" }}>X (Width):</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{formatDim(analysis.x)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#000000" }}>Y (Depth):</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{formatDim(analysis.y)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#000000" }}>Z (Height):</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{formatDim(analysis.z)}</span>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #d4d4d4", margin: "4px 0" }} />

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#000000" }}>Volume:</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{formatVolume(analysis.volume)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#000000" }}>PLA Weight:</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{formatWeight(analysis)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#000000" }}>Est. Cost:</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{formatCost(analysis)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#000000" }}>Triangles:</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>
                    {analysis.triangles.toLocaleString()}
                  </span>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #d4d4d4", margin: "4px 0" }} />

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#000000", fontWeight: "bold" }}>
                  <span>Overhang Specs:</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "4px" }}>
                  <span style={{ color: "#000000" }}>Max Overhang:</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{analysis.maxOverhang}°</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "4px" }}>
                  <span style={{ color: "#000000" }}>Risky Faces:</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{analysis.facesOverThreshold.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "4px" }}>
                  <span style={{ color: "#000000" }}>Support Area:</span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>{analysis.supportSurfacePercent}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "4px" }}>
                  <span style={{ color: "#000000" }}>Support Risk: </span>
                  <span style={{ fontWeight: "bold", color: "#000000" }}>
                    {analysis.supportSurfacePercent === 0
                      ? " NONE (Safe)"
                      : analysis.supportSurfacePercent <= 5
                      ? " LOW (Minor)"
                      : analysis.supportSurfacePercent <= 15
                      ? " MEDIUM (Recommended)"
                      : " HIGH (Critical)"
                    }
                  </span>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #d4d4d4", margin: "4px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#000000" }}>
                    <span>Infill Density:</span>
                    <span style={{ fontWeight: "bold", color: "#000000" }}>{infill}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={infill}
                    onChange={(e) => setInfill(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#000000", cursor: "pointer" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#000000", fontSize: "11px" }}>Spool Price (1kg):</span>
                    <span style={{ fontWeight: "bold", color: "#000000" }}>${spoolPrice}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="1"
                    value={spoolPrice}
                    onChange={(e) => setSpoolPrice(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#000000", cursor: "pointer" }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "#000000", textAlign: "center", padding: "6px 0" }}>
                Upload a 3D asset file to populate printing analytics.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
