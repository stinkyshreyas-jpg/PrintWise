import React, { Suspense, useState, useRef, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Model from "./Model";

const FILAMENT_PROFILES: Record<string, { name: string; density: number; defaultTemp: number }> = {
  PLA: { name: "PLA", density: 1.24, defaultTemp: 210 },
  PETG: { name: "PETG", density: 1.27, defaultTemp: 240 },
  ABS: { name: "ABS", density: 1.04, defaultTemp: 250 },
  TPU: { name: "TPU (Flexible)", density: 1.21, defaultTemp: 220 },
};

export function CameraResetController({ resetTrigger }: { resetTrigger: number }) {
  const { camera, controls } = useThree();
  const lastTrigger = useRef(resetTrigger);
  const isAnimating = useRef(false);

  const targetCamPos = useMemo(() => new THREE.Vector3(200, -200, 200), []);
  const targetLookAt = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  if (resetTrigger !== lastTrigger.current) {
    lastTrigger.current = resetTrigger;
    isAnimating.current = true;
  }

  useFrame((_, delta) => {
    if (!isAnimating.current) return;

    const step = 8 * delta;
    camera.position.lerp(targetCamPos, step);

    if (controls && "target" in controls) {
      const orbControls = controls as any;
      orbControls.target.lerp(targetLookAt, step);
      orbControls.update();
    } else {
      camera.lookAt(targetLookAt);
    }

    if (camera.position.distanceTo(targetCamPos) < 0.05) {
      camera.position.copy(targetCamPos);
      if (controls && "target" in controls) {
        (controls as any).target.copy(targetLookAt);
        (controls as any).update();
      }
      isAnimating.current = false;
    }
  });

  return null;
}

interface ElasticUploadPillProps {
  onFileUpload: (e: any) => void;
  fileName?: string;
}

const ElasticUploadPill: React.FC<ElasticUploadPillProps> = ({ onFileUpload, fileName }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileUpload({ target: { files: e.dataTransfer.files } });
    }
  };

  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: "relative", width: "100%", padding: isDragging ? "22px 16px" : "12px 14px",
        borderRadius: isDragging ? 22 : 16, background: isDragging ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.45)",
        backdropFilter: "blur(20px) saturate(180%)", border: isDragging ? "2px dashed #38bdf8" : "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: isDragging ? "0 20px 35px rgba(56, 189, 248, 0.25)" : "0 8px 20px rgba(0, 0, 0, 0.03)",
        cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        transition: "all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)", transform: isDragging ? "scale(1.03)" : "scale(1)", boxSizing: "border-box"
      }}
    >
      <input ref={fileInputRef} type="file" accept=".stl" onChange={onFileUpload} style={{ display: "none" }} />
      {fileName ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <span style={{ fontSize: "10px", fontWeight: 800, color: "#0284c7", background: "rgba(56, 189, 248, 0.15)", padding: "4px 8px", borderRadius: 8 }}>STL</span>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{fileName}</span>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8" }}>Replace</span>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: isDragging ? "#0284c7" : "#334155", fontWeight: 700, fontSize: "12px" }}>
            <span>{isDragging ? "Drop STL File Here" : "Upload STL Model"}</span>
          </div>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8" }}>Drag & drop or click to browse</span>
        </>
      )}
    </div>
  );
};

export default function App() {
  const [currentModel, setCurrentModel] = useState<any>(null);
  const [fileName, setFileName] = useState<string>(""); 
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [useInches, setUseInches] = useState<boolean>(false);
  const [infill, setInfill] = useState<number>(15);
  const [spoolPrice, setSpoolPrice] = useState<number>(25);
  const [filamentKey, setFilamentKey] = useState<string>("PLA");

  // Slicer/print parameters -- now real sliders feeding Model's weight
  // calculation, instead of being hardcoded inside Model.
  const [nozzleDiameterMm, setNozzleDiameterMm] = useState<number>(0.2);
  const [layerHeightMm, setLayerHeightMm] = useState<number>(0.12);
  const [wallLoopCount, setWallLoopCount] = useState<number>(4);
  const [topLayerCount, setTopLayerCount] = useState<number>(7);
  const [bottomLayerCount, setBottomLayerCount] = useState<number>(5);

  const [analysis, setAnalysis] = useState<any>(null);
  const [activeHeatmap, setActiveHeatmap] = useState<"none" | "overhang" | "stress" | "thinWall">("none");
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [showHoles, setShowHoles] = useState<boolean>(false);
  const [showBedBounds, setShowBedBounds] = useState<boolean>(true);
  const [bedSize] = useState<number>(220); 
  const [holeAnalysis, setHoleAnalysis] = useState<{ hasHoles: boolean; openEdgeCount: number } | null>(null);

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      if (currentModel?.objectUrl) URL.revokeObjectURL(currentModel.objectUrl);
      const objectUrl = URL.createObjectURL(file);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'stl';
      setCurrentModel({ objectUrl, format: ext, fileName: file.name });
    }
  };

  React.useEffect(() => {
    return () => { if (currentModel?.objectUrl) URL.revokeObjectURL(currentModel.objectUrl); };
  }, [currentModel]);

  const customAxesHelper = useMemo(() => {
    const group = new THREE.Group();
    const xGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-150, 0, 0), new THREE.Vector3(150, 0, 0)]);
    const yGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -150, 0), new THREE.Vector3(0, 150, 0)]);
    const zGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 150)]);
    group.add(
      new THREE.Line(xGeom, new THREE.LineBasicMaterial({ color: 0xEF4444, linewidth: 2 })),
      new THREE.Line(yGeom, new THREE.LineBasicMaterial({ color: 0x22C55E, linewidth: 2 })),
      new THREE.Line(zGeom, new THREE.LineBasicMaterial({ color: 0x3B82F6, linewidth: 2 }))
    );
    return group;
  }, []);

  const bedBoundsMesh = useMemo(() => {
    const geometry = new THREE.BoxGeometry(bedSize, bedSize, 250);
    geometry.translate(0, 0, 125);
    return new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.3 })
    );
  }, [bedSize]);

  const formatDim = (val: number) => useInches ? (val / 25.4).toFixed(2) + " in" : val.toFixed(1) + " mm";
  const formatVolume = (val: number) => useInches ? (val / 16387).toFixed(2) + " in³" : (val / 1000).toFixed(1) + " cm³";
  const formatWeight = (est: any) => est ? `${est.weightGrams.toFixed(1)} g` : "0 g";
  const formatCost = (est: any) => est ? `$${est.cost.toFixed(2)}` : "$0.00";

  const calculatePrintTime = () => {
    if (!analysis || !analysis.volume) return "0h 0m";
    const volumeCm3 = analysis.volume / 1000;
    const effectiveDensityFactor = (infill / 100) * 0.7 + 0.3; 
    const totalExtrudedCm3 = volumeCm3 * effectiveDensityFactor;
    const totalSeconds = (totalExtrudedCm3 * 1000) / 8;
    return `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`;
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#f8fafc", position: "relative", fontFamily: "-apple-system, sans-serif" }}>
      <Canvas shadows camera={{ position: [200, -200, 200], fov: 45 }} onCreated={({ camera }) => { camera.up.set(0, 0, 1); camera.lookAt(0, 0, 0); }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[100, -100, 150]} intensity={1.5} castShadow />
        <pointLight position={[-50, 50, 50]} intensity={0.4} />

        <gridHelper args={[300, 30]} position={[0, 0, -0.01]} rotation={[Math.PI / 2, 0, 0]} />
        <primitive object={customAxesHelper} />
        {showBedBounds && <primitive object={bedBoundsMesh} />}

        <Suspense fallback={null}>
          {currentModel && (
            <Model
              model={currentModel} wireframe={wireframe} fallbackColor="#cbd5e1"
              infillPercent={infill} spoolPrice={spoolPrice} spoolWeightGrams={1000}
              filamentKey={filamentKey}
              nozzleDiameterMm={nozzleDiameterMm}
              layerHeightMm={layerHeightMm}
              wallLoopCount={wallLoopCount}
              topLayerCount={topLayerCount}
              bottomLayerCount={bottomLayerCount}
              activeHeatmap={activeHeatmap} showHoles={showHoles}
              onHolesDetected={setHoleAnalysis} onModelAnalyzed={setAnalysis}
            />
          )}
        </Suspense>

        <OrbitControls makeDefault minDistance={1} maxDistance={1000} />
        <CameraResetController resetTrigger={resetCounter} />
      </Canvas>

      {/* Floating Action Controls */}
      {currentModel && (
        <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowBedBounds(!showBedBounds)} style={{ background: showBedBounds ? "#0ea5e9" : "#0f172a", color: "#fff", border: "none", padding: "10px 14px", borderRadius: 14, cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>
              {showBedBounds ? "Hide Build Volume" : "Show Build Volume"}
            </button>
            <button onClick={() => setShowHoles(!showHoles)} style={{ background: showHoles ? "#ef4444" : "#0f172a", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 14, cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>
              {showHoles ? "Hide Hole Check" : "Check for Holes"}
            </button>
          </div>
          {holeAnalysis && (
            <div style={{ background: holeAnalysis.hasHoles ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)", color: holeAnalysis.hasHoles ? "#dc2626" : "#059669", padding: "6px 12px", borderRadius: 10, fontSize: "11px", fontWeight: 700 }}>
              {holeAnalysis.hasHoles ? `⚠ ${holeAnalysis.openEdgeCount} open edge(s) found` : "✓ Watertight, no holes"}
            </div>
          )}
        </div>
      )}

      {/* Main Sidebar */}
      <div style={{ position: "absolute", top: 20, left: 20, display: "flex", flexDirection: "column", gap: 14, zIndex: 10, width: "330px", maxHeight: "calc(100vh - 40px)", overflowY: "auto", paddingRight: 4 }}>
        <div style={{ background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(20px)", padding: "14px 20px", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 800, fontSize: "16px", color: "#ffffff" }}>PRINTWISE</span>
        </div>

        <div style={{ background: "rgba(255, 255, 255, 0.8)", padding: "18px", borderRadius: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: "13px", fontWeight: 700 }}>Workspace Setup</span>
          <ElasticUploadPill onFileUpload={handleFileUpload} fileName={fileName} />
          <button onClick={() => setResetCounter(c => c + 1)} style={{ background: "#0f172a", color: "#fff", border: "none", padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 600, fontSize: "12px" }}>
            Isometric Home View
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", fontWeight: 600 }}>
            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
            Wireframe Overlay
          </label>
        </div>

        {/* Slicer Parameters -- new */}
        <div style={{ background: "rgba(255, 255, 255, 0.8)", padding: "18px", borderRadius: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: "13px", fontWeight: 700 }}>Slicer Parameters</span>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Nozzle Diameter</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[0.2, 0.4, 0.6, 0.8].map((size) => (
                <button
                  key={size}
                  onClick={() => setNozzleDiameterMm(size)}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 8,
                    border: nozzleDiameterMm === size ? "1px solid #0f172a" : "1px solid #e2e8f0",
                    background: nozzleDiameterMm === size ? "#0f172a" : "#fff",
                    color: nozzleDiameterMm === size ? "#fff" : "#0f172a",
                    fontSize: "11px", fontWeight: 700, cursor: "pointer"
                  }}
                >
                  {size}mm
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b" }}>Layer Height:</span>
              <span style={{ fontWeight: 700 }}>{layerHeightMm.toFixed(2)} mm</span>
            </div>
            <input
              type="range" min="0.08" max={Math.max(0.08, nozzleDiameterMm * 0.8)} step="0.01"
              value={layerHeightMm}
              onChange={(e) => setLayerHeightMm(Number(e.target.value))}
              style={{ width: "100%", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b" }}>Wall Loops:</span>
              <span style={{ fontWeight: 700 }}>{wallLoopCount}</span>
            </div>
            <input
              type="range" min="1" max="8" step="1" value={wallLoopCount}
              onChange={(e) => setWallLoopCount(Number(e.target.value))}
              style={{ width: "100%", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "#64748b" }}>Top Layers:</span>
                <span style={{ fontWeight: 700 }}>{topLayerCount}</span>
              </div>
              <input
                type="range" min="0" max="12" step="1" value={topLayerCount}
                onChange={(e) => setTopLayerCount(Number(e.target.value))}
                style={{ width: "100%", cursor: "pointer" }}
              />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "#64748b" }}>Bottom Layers:</span>
                <span style={{ fontWeight: 700 }}>{bottomLayerCount}</span>
              </div>
              <input
                type="range" min="0" max="12" step="1" value={bottomLayerCount}
                onChange={(e) => setBottomLayerCount(Number(e.target.value))}
                style={{ width: "100%", cursor: "pointer" }}
              />
            </div>
          </div>
        </div>

        <div style={{ background: "rgba(255, 255, 255, 0.8)", padding: "20px", borderRadius: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", fontWeight: 700 }}>Analysis & Slicing</span>
            <button onClick={() => setUseInches(!useInches)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "4px 10px", borderRadius: 10, cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>
              Unit: {useInches ? "IN" : "MM"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "11px", fontWeight: 700 }}>Heatmap Diagnostic</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {(["none", "overhang", "stress", "thinWall"] as const).map((mode) => (
                <button key={mode} onClick={() => setActiveHeatmap(mode)} style={{ padding: "6px 8px", borderRadius: 8, border: activeHeatmap === mode ? "1px solid #0f172a" : "1px solid #e2e8f0", background: activeHeatmap === mode ? "#0f172a" : "#fff", color: activeHeatmap === mode ? "#fff" : "#0f172a", fontSize: "11px", fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
                  {mode === "thinWall" ? "Thin Walls" : mode}
                </button>
              ))}
            </div>
          </div>

          {analysis ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: "13px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: "#fff", padding: "10px 6px", borderRadius: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>X</span><span style={{ fontWeight: 700 }}>{formatDim(analysis.x)}</span></div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "1px solid #f1f5f9", borderRight: "1px solid #f1f5f9" }}><span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>Y</span><span style={{ fontWeight: 700 }}>{formatDim(analysis.y)}</span></div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>Z</span><span style={{ fontWeight: 700 }}>{formatDim(analysis.z)}</span></div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b" }}>Volume:</span><span style={{ fontWeight: 700 }}>{formatVolume(analysis.volume)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b" }}>Est. Weight:</span><span style={{ fontWeight: 700 }}>{formatWeight(analysis.materialEstimate)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b" }}>Est. Cost:</span><span style={{ fontWeight: 700, color: "#10b981" }}>{formatCost(analysis.materialEstimate)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b" }}>Est. Print Time:</span><span style={{ fontWeight: 700, color: "#0284c7" }}>{calculatePrintTime()}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b" }}>Triangles:</span><span style={{ fontWeight: 700 }}>{analysis.triangles.toLocaleString()}</span></div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Filament Material</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                  {Object.keys(FILAMENT_PROFILES).map((key) => (
                    <button key={key} onClick={() => setFilamentKey(key)} style={{ padding: "6px 4px", borderRadius: 8, fontSize: "11px", fontWeight: 700, cursor: "pointer", border: filamentKey === key ? "1px solid #0f172a" : "1px solid #e2e8f0", background: filamentKey === key ? "#0f172a" : "#fff", color: filamentKey === key ? "#fff" : "#0f172a" }}>
                      {key}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#64748b" }}>Infill Density:</span><span style={{ fontWeight: 700 }}>{infill}%</span>
                  </div>
                  <input type="range" min="5" max="100" step="5" value={infill} onChange={(e) => setInfill(Number(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#64748b" }}>Spool Price (1kg):</span><span style={{ fontWeight: 700 }}>${spoolPrice}</span>
                  </div>
                  <input type="range" min="10" max="60" step="1" value={spoolPrice} onChange={(e) => setSpoolPrice(Number(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "#64748b", textAlign: "center", padding: "16px 0", fontWeight: 500 }}>
              Upload an STL model to analyze mesh metrics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}