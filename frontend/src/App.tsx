import React, { Suspense, useState, useRef, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Model from "./Model";
import RadialWheel from "./RadialWheel";

const FILAMENT_PROFILES: Record<string, { name: string; density: number; defaultTemp: number }> = {
  PLA: { name: "PLA", density: 1.24, defaultTemp: 210 },
  PETG: { name: "PETG", density: 1.27, defaultTemp: 240 },
  ABS: { name: "ABS", density: 1.04, defaultTemp: 250 },
  TPU: { name: "TPU (Flexible)", density: 1.21, defaultTemp: 220 },
};

export const PRINTER_OPTIONS = [
  {
    label: "Bambu X1-Carbon",
    value: "x1c",
    iconUrl: "/printers/x1c.png",
    defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 },
  },
  {
    label: "Bambu P1S",
    value: "p1s",
    iconUrl: "/printers/p1s.png",
    defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 },
  },
  {
    label: "Bambu P2S",
    value: "p2s",
    iconUrl: "/printers/p2s.png",
    defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 },
  },
  {
    label: "Bambu A1",
    value: "a1",
    iconUrl: "/printers/a1.png",
    defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 },
  },
  {
    label: "Bambu A1 Mini",
    value: "a1_mini",
    iconUrl: "/printers/a1_mini.png",
    defaults: { nozzle: 1, layerHeight: 2, wallLoops: 1, infill: 2 },
  },
  {
    label: "Bambu H2C",
    value: "h2c",
    iconUrl: "/printers/h2c.png",
    defaults: { nozzle: 1, layerHeight: 2, wallLoops: 1, infill: 2 },
  },
  {
    label: "Bambu H2D",
    value: "h2d",
    iconUrl: "/printers/h2d.png",
    defaults: { nozzle: 1, layerHeight: 2, wallLoops: 1, infill: 2 },
  },
];

export const MATERIAL_OPTIONS = [
  {
    label: "PLA",
    value: "PLA",
    iconUrl: "/materials/pla.png",
  },
  {
    label: "PETG",
    value: "PETG",
    iconUrl: "/materials/petg.png",
  },
  {
    label: "ABS",
    value: "ABS",
    iconUrl: "/materials/abs.png",
  },
  {
    label: "TPU",
    value: "TPU",
    iconUrl: "/materials/tpu.png",
  },
];

const NOZZLE_OPTIONS = [
  { label: "0.2 mm", value: 0.2 },
  { label: "0.4 mm", value: 0.4 },
  { label: "0.6 mm", value: 0.6 },
  { label: "0.8 mm", value: 0.8 },
];

const LAYER_OPTIONS_BY_NOZZLE: Record<number, { label: string; value: number }[]> = {
  0.2: [
    { label: "0.08 mm", value: 0.08 },
    { label: "0.10 mm", value: 0.10 },
    { label: "0.12 mm", value: 0.12 },
  ],
  0.4: [
    { label: "0.08 mm", value: 0.08 },
    { label: "0.12 mm", value: 0.12 },
    { label: "0.16 mm", value: 0.16 },
    { label: "0.20 mm", value: 0.20 },
    { label: "0.24 mm", value: 0.24 },
  ],
  0.6: [
    { label: "0.18 mm", value: 0.18 },
    { label: "0.24 mm", value: 0.24 },
    { label: "0.30 mm", value: 0.30 },
  ],
  0.8: [
    { label: "0.24 mm", value: 0.24 },
    { label: "0.32 mm", value: 0.32 },
    { label: "0.40 mm", value: 0.40 },
  ],
};

const WALL_OPTIONS = [
  { label: "1 Loop", value: 1 },
  { label: "2 Loops", value: 2 },
  { label: "3 Loops", value: 3 },
  { label: "4 Loops", value: 4 },
  { label: "6 Loops", value: 6 },
];

const INFILL_OPTIONS = [
  { label: "5%", value: 5 },
  { label: "10%", value: 10 },
  { label: "15%", value: 15 },
  { label: "20%", value: 20 },
  { label: "50%", value: 50 },
  { label: "100%", value: 100 },
];

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

    const step = Math.min(1, 10 * delta);
    camera.position.lerp(targetCamPos, step);

    if (controls && "target" in controls) {
      const orbControls = controls as any;
      orbControls.target.lerp(targetLookAt, step);
      orbControls.update();
    } else {
      camera.lookAt(targetLookAt);
    }

    if (camera.position.distanceTo(targetCamPos) < 0.5) {
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

interface RightWheelPanelProps {
  printerIdx: number;
  materialIdx: number;
  nozzleIdx: number;
  layerIdx: number;
  layerOptions: { label: string; value: number }[];
  wallIdx: number;
  infillIdx: number;
  onPrinterChange: (idx: number) => void;
  onMaterialChange: (idx: number) => void;
  onNozzleChange: (idx: number) => void;
  onLayerChange: (idx: number) => void;
  onWallChange: (idx: number) => void;
  onInfillChange: (idx: number) => void;
}

export function RightWheelPanel({
  printerIdx,
  materialIdx,
  nozzleIdx,
  layerIdx,
  layerOptions,
  wallIdx,
  infillIdx,
  onPrinterChange,
  onMaterialChange,
  onNozzleChange,
  onLayerChange,
  onWallChange,
  onInfillChange,
}: RightWheelPanelProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end",
        gap: "16px",
        zIndex: 50,
        padding: 0,
        margin: 0,
      }}
    >
      <RadialWheel title="Printer" options={PRINTER_OPTIONS} selectedIndex={printerIdx} onChange={onPrinterChange} iconSize={64} />
      <RadialWheel title="Material" options={MATERIAL_OPTIONS} selectedIndex={materialIdx} onChange={onMaterialChange} iconSize={64} />
      <RadialWheel title="Nozzle" options={NOZZLE_OPTIONS} selectedIndex={nozzleIdx} onChange={onNozzleChange} />
      <RadialWheel title="Layer Height" options={layerOptions} selectedIndex={layerIdx < layerOptions.length ? layerIdx : 0} onChange={onLayerChange} />
      <RadialWheel title="Wall Loops" options={WALL_OPTIONS} selectedIndex={wallIdx} onChange={onWallChange} />
      <RadialWheel title="Infill Density" options={INFILL_OPTIONS} selectedIndex={infillIdx} onChange={onInfillChange} />
    </div>
  );
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
      className="apple-file-input"
      style={{
        border: isDragging ? "2px dashed var(--accent-blue)" : "1px solid var(--card-border)",
        background: isDragging ? "rgba(255, 255, 255, 0.95)" : "rgba(0, 0, 0, 0.02)",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isDragging ? "18px 12px" : "12px",
      }}
    >
      <input ref={fileInputRef} type="file" accept=".stl" onChange={onFileUpload} style={{ display: "none" }} />
      {fileName ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <span className="apple-badge" style={{ background: "rgba(0, 102, 204, 0.1)", color: "var(--accent-blue)" }}>STL</span>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{fileName}</span>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Replace</span>
        </div>
      ) : (
        <>
          <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "12px" }}>
            {isDragging ? "Drop STL File Here" : "Upload STL Model"}
          </div>
          <span style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: 2 }}>Drag & drop or click to browse</span>
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
  const [spoolPrice, setSpoolPrice] = useState<number>(25);
  const [filamentKey, setFilamentKey] = useState<string>("PLA");

  const [printerIdx, setPrinterIdx] = useState(0);
  const [materialIdx, setMaterialIdx] = useState(0);
  const [nozzleIdx, setNozzleIdx] = useState(1);
  const [layerIdx, setLayerIdx] = useState(3);
  const [wallIdx, setWallIdx] = useState(1);
  const [infillIdx, setInfillIdx] = useState(2);

  const nozzleDiameterMm = NOZZLE_OPTIONS[nozzleIdx].value;
  const currentLayerOptions = LAYER_OPTIONS_BY_NOZZLE[nozzleDiameterMm] || LAYER_OPTIONS_BY_NOZZLE[0.4];

  const activeLayerObj = currentLayerOptions[layerIdx] || currentLayerOptions[0];
  const layerHeightMm = activeLayerObj.value;

  const wallLoopCount = WALL_OPTIONS[wallIdx].value;
  const infill = INFILL_OPTIONS[infillIdx].value;

  const [topLayerCount] = useState<number>(7);
  const [bottomLayerCount] = useState<number>(5);

  const [analysis, setAnalysis] = useState<any>(null);
  const [activeHeatmap, setActiveHeatmap] = useState<"none" | "overhang" | "stress" | "thinWall">("none");
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [showHoles, setShowHoles] = useState<boolean>(false);
  const [showBedBounds, setShowBedBounds] = useState<boolean>(true);
  const [bedSize] = useState<number>(220);
  const [holeAnalysis, setHoleAnalysis] = useState<{ hasHoles: boolean; openEdgeCount: number } | null>(null);

  const handlePrinterChange = (idx: number) => {
    setPrinterIdx(idx);
    const selectedPrinter = PRINTER_OPTIONS[idx];
    if (selectedPrinter?.defaults) {
      handleNozzleChange(selectedPrinter.defaults.nozzle);
      setLayerIdx(selectedPrinter.defaults.layerHeight);
      setWallIdx(selectedPrinter.defaults.wallLoops);
      setInfillIdx(selectedPrinter.defaults.infill);
    }
  };

  const handleMaterialChange = (idx: number) => {
    setMaterialIdx(idx);
    const selectedMat = MATERIAL_OPTIONS[idx];
    if (selectedMat) {
      setFilamentKey(selectedMat.value);
    }
  };

  const handleNozzleChange = (newNozzleIdx: number) => {
    setNozzleIdx(newNozzleIdx);
    const newNozzleVal = NOZZLE_OPTIONS[newNozzleIdx].value;
    const availableHeights = LAYER_OPTIONS_BY_NOZZLE[newNozzleVal] || LAYER_OPTIONS_BY_NOZZLE[0.4];

    if (layerIdx >= availableHeights.length) {
      setLayerIdx(Math.floor(availableHeights.length / 2));
    }
  };

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

  const lineMat = (color: number) =>
    new THREE.LineBasicMaterial({
      color,
      linewidth: 2,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1, 
      polygonOffsetUnits: -1,
    });

  const lineX = new THREE.Line(xGeom, lineMat(0xEF4444));
  const lineY = new THREE.Line(yGeom, lineMat(0x22C55E));
  const lineZ = new THREE.Line(zGeom, lineMat(0x3B82F6));

  group.add(lineX, lineY, lineZ);
  return group;
}, []);

  const bedBoundsMesh = useMemo(() => {
    const geometry = new THREE.BoxGeometry(bedSize, bedSize, 250);
    geometry.translate(0, 0, 125);
    const material = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.3,
      depthWrite: true,
      depthTest: true,
    });
    const lines = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), material);
    lines.renderOrder = -1;
    return lines;
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
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Canvas 
        shadows 
        gl={{ logarithmicDepthBuffer: true }} 
        style={{ background: "var(--bg-canvas)" }} 
        camera={{ position: [200, -200, 200], fov: 45, near: 0.1, far: 2000 }} 
        onCreated={({ camera, gl }) => { 
          gl.setClearColor("#fbfbfa"); 
          camera.up.set(0, 0, 1); 
          camera.lookAt(0, 0, 0); 
        }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[100, -100, 150]} intensity={1.5} castShadow />
        <pointLight position={[-50, 50, 50]} intensity={0.4} />

        <gridHelper 
          args={[300, 30, "#e2e2e0", "#e2e2e0"]} 
          position={[0, 0, -0.1]} 
          rotation={[Math.PI / 2, 0, 0]} 
          renderOrder={-1}
        />
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

      <RightWheelPanel
        printerIdx={printerIdx}
        materialIdx={materialIdx}
        nozzleIdx={nozzleIdx}
        layerIdx={layerIdx}
        layerOptions={currentLayerOptions}
        wallIdx={wallIdx}
        infillIdx={infillIdx}
        onPrinterChange={handlePrinterChange}
        onMaterialChange={handleMaterialChange}
        onNozzleChange={handleNozzleChange}
        onLayerChange={setLayerIdx}
        onWallChange={setWallIdx}
        onInfillChange={setInfillIdx}
      />

      {currentModel && (
        <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button 
              className="apple-badge" 
              onClick={() => setShowBedBounds(!showBedBounds)} 
              style={{ cursor: "pointer", border: "1px solid var(--card-border)", background: showBedBounds ? "var(--text-primary)" : "var(--card-bg)", color: showBedBounds ? "#fff" : "var(--text-primary)" }}
            >
              {showBedBounds ? "Hide Build Volume" : "Show Build Volume"}
            </button>
            <button 
              className="apple-badge" 
              onClick={() => setShowHoles(!showHoles)} 
              style={{ cursor: "pointer", border: "1px solid var(--card-border)", background: showHoles ? "#e11d48" : "var(--card-bg)", color: showHoles ? "#fff" : "var(--text-primary)" }}
            >
              {showHoles ? "Hide Hole Check" : "Check for Holes"}
            </button>
          </div>
          {holeAnalysis && (
            <div style={{ background: holeAnalysis.hasHoles ? "rgba(225, 29, 72, 0.1)" : "rgba(16, 185, 129, 0.1)", color: holeAnalysis.hasHoles ? "#e11d48" : "#059669", padding: "6px 12px", borderRadius: 980, fontSize: "11px", fontWeight: 600 }}>
              {holeAnalysis.hasHoles ? `⚠ ${holeAnalysis.openEdgeCount} open edge(s) found` : "✓ Watertight, no holes"}
            </div>
          )}
        </div>
      )}

      <div className="sidebar-container" style={{ position: "absolute", top: 20, left: 20, zIndex: 10 }}>
        <div className="printwise-header">
          PRINTWISE
        </div>

        <div className="apple-card">
          <div className="card-title">Workspace Setup</div>
          <ElasticUploadPill onFileUpload={handleFileUpload} fileName={fileName} />
          
          <button className="apple-btn-primary" onClick={() => setResetCounter(c => c + 1)}>
            Reset View
          </button>
          
          <label className="apple-checkbox-container">
            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
            Wireframe Overlay
          </label>
        </div>

        <div className="apple-card">
          <div className="card-title">
            <span>Analysis & Slicing</span>
            <button 
              onClick={() => setUseInches(!useInches)} 
              className="apple-badge" 
              style={{ cursor: "pointer", border: "1px solid var(--card-border)" }}
            >
              Unit: {useInches ? "IN" : "MM"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="field-label">Heatmap Diagnostic</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["none", "overhang", "stress", "thinWall"] as const).map((mode) => (
                <button 
                  key={mode} 
                  onClick={() => setActiveHeatmap(mode)} 
                  className="apple-badge"
                  style={{ 
                    cursor: "pointer", 
                    textAlign: "center",
                    border: "1px solid var(--card-border)", 
                    background: activeHeatmap === mode ? "var(--accent-primary)" : "var(--badge-bg)", 
                    color: activeHeatmap === mode ? "#fff" : "var(--text-primary)" 
                  }}
                >
                  {mode === "thinWall" ? "Thin Walls" : mode}
                </button>
              ))}
            </div>
          </div>

          <hr className="apple-divider" />

          {analysis ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: "rgba(0,0,0,0.02)", padding: "10px 6px", borderRadius: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontWeight: 700 }}>X</span><span style={{ fontWeight: 600, fontSize: "13px" }}>{formatDim(analysis.x)}</span></div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "1px solid var(--divider)", borderRight: "1px solid var(--divider)" }}><span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontWeight: 700 }}>Y</span><span style={{ fontWeight: 600, fontSize: "13px" }}>{formatDim(analysis.y)}</span></div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontWeight: 700 }}>Z</span><span style={{ fontWeight: 600, fontSize: "13px" }}>{formatDim(analysis.z)}</span></div>
              </div>

              <div>
                <div className="metric-row"><span className="metric-label">Volume</span><span className="metric-value">{formatVolume(analysis.volume)}</span></div>
                <div className="metric-row"><span className="metric-label">Est. Weight</span><span className="metric-value">{formatWeight(analysis.materialEstimate)}</span></div>
                <div className="metric-row"><span className="metric-label">Est. Cost</span><span className="metric-value" style={{ color: "var(--accent-blue)" }}>{formatCost(analysis.materialEstimate)}</span></div>
                <div className="metric-row"><span className="metric-label">Est. Print Time</span><span className="metric-value">{calculatePrintTime()}</span></div>
                <div className="metric-row"><span className="metric-label">Triangles</span><span className="metric-value">{analysis.triangles.toLocaleString()}</span></div>
              </div>

              <div className="slider-group">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span className="metric-label">Spool Price (1kg)</span>
                  <span className="metric-value">${spoolPrice}</span>
                </div>
                <input type="range" min="10" max="60" step="1" value={spoolPrice} onChange={(e) => setSpoolPrice(Number(e.target.value))} className="apple-slider" />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", textAlign: "center", padding: "12px 0", fontWeight: 500 }}>
              Upload an STL model to analyze mesh metrics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}