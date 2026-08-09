import React, { Suspense, useState, useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Model from "./Model";
import RadialWheel from "./RadialWheel";

export const PRESETS = [
  { value: "balanced", label: "Balanced", targetRatio: 0.50, walls: 3, infill: 15, patternIdx: 0 },
  { value: "appearance", label: "Best Appearance", targetRatio: 0.30, walls: 2, infill: 10, patternIdx: 1 },
  { value: "strength", label: "Max Strength", targetRatio: 0.50, walls: 5, infill: 50, patternIdx: 2 },
  { value: "fastest", label: "Fastest Print", targetRatio: 0.70, walls: 2, infill: 10, patternIdx: 0 },
  { value: "lowest_cost", label: "Lowest Cost", targetRatio: 0.65, walls: 2, infill: 5, patternIdx: 0 },
  { value: "lightest", label: "Lightest Part", targetRatio: 0.50, walls: 2, infill: 5, patternIdx: 3 },
];

function getClosestIndex(arr: number[], target: number): number {
  return arr.reduce((bestIdx, curr, idx) =>
    Math.abs(curr - target) < Math.abs(arr[bestIdx] - target) ? idx : bestIdx
  , 0);
}

export const PRINTER_OPTIONS = [
  { label: "Bambu X1-Carbon", value: "x1c", iconUrl: "/printers/x1c.png", bedSize: { x: 256, y: 256, z: 256 }, defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 } },
  { label: "Bambu P1S", value: "p1s", iconUrl: "/printers/p1s.png", bedSize: { x: 256, y: 256, z: 256 }, defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 } },
  { label: "Bambu P2S", value: "p2s", iconUrl: "/printers/p2s.png", bedSize: { x: 256, y: 256, z: 256 }, defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 } },
  { label: "Bambu A1", value: "a1", iconUrl: "/printers/a1.png", bedSize: { x: 256, y: 256, z: 256 }, defaults: { nozzle: 1, layerHeight: 3, wallLoops: 1, infill: 2 } },
  { label: "Bambu A1 Mini", value: "a1_mini", iconUrl: "/printers/a1_mini.png", bedSize: { x: 180, y: 180, z: 180 }, defaults: { nozzle: 1, layerHeight: 2, wallLoops: 1, infill: 2 } },
  { label: "Bambu H2C", value: "h2c", iconUrl: "/printers/h2c.png", bedSize: { x: 330, y: 320, z: 325 }, defaults: { nozzle: 1, layerHeight: 2, wallLoops: 1, infill: 2 } },
  { label: "Bambu H2D", value: "h2d", iconUrl: "/printers/h2d.png", bedSize: { x: 350, y: 320, z: 325 }, defaults: { nozzle: 1, layerHeight: 2, wallLoops: 1, infill: 2 } },
];

export const MATERIAL_OPTIONS = [
  { label: "PLA", value: "PLA", iconUrl: "/materials/pla.png" },
  { label: "PETG", value: "PETG", iconUrl: "/materials/petg.png" },
  { label: "ABS", value: "ABS", iconUrl: "/materials/abs.png" },
  { label: "TPU", value: "TPU", iconUrl: "/materials/tpu.png" },
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

const INFILL_PATTERN_OPTIONS = [
  { label: "Grid", value: "grid", iconUrl: "/infill/grid.png" },
  { label: "Gyroid", value: "gyroid", iconUrl: "/infill/gyroid.png" },
  { label: "Honeycomb", value: "honeycomb", iconUrl: "/infill/honeycomb.png" },
  { label: "3D Honeycomb", value: "3d_honeycomb", iconUrl: "/infill/3d_honeycomb.png" },
  { label: "Cubic", value: "cubic", iconUrl: "/infill/cubic.png" },
  { label: "Concentric", value: "concentric", iconUrl: "/infill/concentric.png" },
];

const FILAMENT_LISTINGS = [
  { id: 1, name: "Bambu Lab PLA Basic (1kg)", material: "PLA", price: 19.99, store: "Bambu Store Online", distance: "Online" },
  { id: 2, name: "Micro Center Inland PLA+ (1kg)", material: "PLA", price: 18.99, store: "Micro Center (Santa Clara)", distance: "4.2 miles" },
  { id: 3, name: "Polymaker PolyTerra PLA (1kg)", material: "PLA", price: 21.99, store: "Amazon / Local Delivery", distance: "Same Day" },
  { id: 4, name: "eSUN PETG Tough (1kg)", material: "PETG", price: 22.50, store: "Local Hobby Shop", distance: "2.1 miles" },
  { id: 5, name: "Overture PETG (1kg)", material: "PETG", price: 19.49, store: "Amazon Prime", distance: "1 Day" },
  { id: 6, name: "Polymaker PolyMax ABS (1kg)", material: "ABS", price: 29.99, store: "3D Printing USA", distance: "Online" },
  { id: 7, name: "NinjaTek NinjaFlex TPU (0.5kg)", material: "TPU", price: 32.00, store: "MatterHackers", distance: "Online" },
];

const HEATMAP_MODES = [
  { key: "none", label: "None" },
  { key: "overhang", label: "Overhang" },
  { key: "stress", label: "Stress" },
  { key: "thinWall", label: "Thin Walls" },
] as const;

interface HeatmapMetrics {
  overhangRatio?: number;   
  stressScore?: number;     
  thinWallRatio?: number;   
}

interface PrinterBed {
  x: number;
  y: number;
  z: number;
}

function scoreFromRatio(ratio: number, toleranceRatio: number, penaltyMultiplier: number = 2.0): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= toleranceRatio) return 100;
  const excess = clamped - toleranceRatio;
  const penalty = Math.min(100, excess * 100 * penaltyMultiplier);
  return Math.max(0, Math.round(100 - penalty));
}

function calculatePrintabilityScore(
  analysis: any,
  holeAnalysis: { hasHoles: boolean; openEdgeCount: number } | null,
  printerBed: PrinterBed
) {
  if (!analysis) return null;
  const {
    overhangRatio = 0,
    stressScore: rawStressMetric = 0,
    thinWallRatio = 0,
  }: HeatmapMetrics = analysis.heatmapMetrics || {};

  const normalizedStress = rawStressMetric / 100;
  const overhangScore = scoreFromRatio(overhangRatio, 0.01, 3.0);
  const wallScore = scoreFromRatio(thinWallRatio, 0.02, 0.6);
  const stressScore = scoreFromRatio(Math.max(0, Math.min(1, normalizedStress)), 0.25, 1.2);

  let score = Math.round(
    overhangScore * 0.45 +
    wallScore * 0.40 +
    stressScore * 0.15
  );

  const fitsX = analysis.x <= printerBed.x;
  const fitsY = analysis.y <= printerBed.y;
  const fitsZ = analysis.z <= printerBed.z;
  const fitsAll = fitsX && fitsY && fitsZ;
  const hasOpenHoles = holeAnalysis?.hasHoles && holeAnalysis.openEdgeCount > 0;

  if (!fitsAll || hasOpenHoles) {
    score = 0; 
  }

  let color = "#10b981"; 
  let statusText = "Ready to Print";

  if (!fitsAll) {
    color = "#f43f5e"; 
    statusText = "Exceeds Build Volume";
  } else if (hasOpenHoles) {
    color = "#f43f5e"; 
    statusText = "Needs Repair (Open Holes)";
  } else if (score < 60) {
    color = "#f43f5e";
    statusText = "High Risk of Failure";
  } else if (overhangScore < 70 || wallScore < 70) {
    color = "#f59e0b"; 
    statusText = "Supports / Tweaks Needed";
  } else if (score < 85) {
    color = "#f59e0b";
    statusText = "Minor Tweaks Recommended";
  }

  return {
    score,
    color,
    statusText,
    details: { 
      meshScore: hasOpenHoles ? 0 : 100, 
      overhangScore, 
      wallScore, 
      stressScore, 
      fitScore: fitsAll ? 100 : 0 
    },
  };
}

export function ScorePill({ printability }: { printability: ReturnType<typeof calculatePrintabilityScore> }) {
  const [isHovered, setIsHovered] = useState(false);
  if (!printability) return null;
  const { score, color, statusText, details } = printability;

  const getIssues = () => {
    const issues = [];
    if (details.meshScore < 100) {
      issues.push({ label: 'Mesh Integrity', text: 'Open edges or non-manifold geometry detected.', color: '#ef4444' });
    }
    if (details.overhangScore < 85) {
      issues.push({ label: 'Overhangs', text: 'Steep unsupported angles detected. Supports recommended.', color: '#f59e0b' });
    }
    if (details.wallScore < 90) {
      issues.push({ label: 'Thin Walls', text: 'Fragile areas detected. Model features may be thinner than the nozzle.', color: '#f59e0b' });
    }
    if (details.fitScore < 100) {
      issues.push({ label: 'Fit & Stress', text: 'Model bounds approach bed limits or contain high-stress corners.', color: '#ca8a04' });
    }
    return issues;
  };

  const issues = getIssues();

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "sans-serif",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 16px",
          borderRadius: "980px",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(16px)",
          boxShadow: isHovered
            ? "0 15px 30px -5px rgba(0, 0, 0, 0.15), 0 10px 15px -6px rgba(0, 0, 0, 0.1)"
            : "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
          border: "1px solid var(--card-border, #e2e8f0)",
          cursor: "help",
          transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease",
          transform: isHovered ? "scale(1.03)" : "scale(1)",
          zIndex: 20,
          position: "relative",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: color,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "13px",
            boxShadow: `0 0 12px ${color}66`,
          }}
        >
          {score}
        </div>
        <div style={{ display: "flex", flexDirection: "column", textAlign: "left", paddingRight: "8px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary, #94a3b8)", textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.2 }}>
            Print Score
          </span>
          <span style={{ fontSize: "13px", fontWeight: 700, color: color, lineHeight: 1.2 }}>
            {statusText}
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "100%",
          marginTop: "12px",
          width: "280px",
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid var(--card-border, #e2e8f0)",
          opacity: isHovered ? 1 : 0,
          visibility: isHovered ? "visible" : "hidden",
          transform: isHovered ? "translateY(0)" : "translateY(-10px)",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          zIndex: 10,
          padding: "20px",
          pointerEvents: "none",
        }}
      >
        <h4 style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px", margin: "0 0 16px 0" }}>
          Heatmap Breakdown
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ fontWeight: 600, color: "#475569" }}>Overhang Analysis</span>
            <span style={{ fontWeight: 700, color: details.overhangScore < 85 ? '#f59e0b' : '#10b981' }}>{details.overhangScore} / 100</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ fontWeight: 600, color: "#475569" }}>Wall Thickness</span>
            <span style={{ fontWeight: 700, color: details.wallScore < 85 ? '#f59e0b' : '#10b981' }}>{details.wallScore} / 100</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ fontWeight: 600, color: "#475569" }}>Fit & Stress</span>
            <span style={{ fontWeight: 700, color: details.fitScore < 100 ? '#ca8a04' : '#10b981' }}>{details.fitScore} / 100</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ fontWeight: 600, color: "#475569" }}>Mesh Integrity</span>
            <span style={{ fontWeight: 700, color: details.meshScore < 100 ? '#ef4444' : '#10b981' }}>{details.meshScore} / 100</span>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc", margin: "0 -20px -20px -20px", padding: "20px", borderRadius: "0 0 16px 16px" }}>
          <h4 style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", margin: "0 0 12px 0" }}>
            Detected Issues
          </h4>
          {issues.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {issues.map((issue, idx) => (
                <p key={idx} style={{ fontSize: "12px", lineHeight: "1.4", margin: 0, color: issue.color }}>
                  <strong style={{ display: "block", marginBottom: "2px", fontWeight: 700 }}>{issue.label}</strong>
                  <span style={{ color: "#475569" }}>{issue.text}</span>
                </p>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "12px", color: "#059669", lineHeight: "1.4", margin: 0, fontWeight: 500 }}>
              Model geometry is solid. Ready for slicing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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
    if (controls && "target" in controls && controls.target) {
      const orbControls = controls as any;
      orbControls.target.lerp(targetLookAt, step);
      orbControls.update();
    } else {
      camera.lookAt(targetLookAt);
    }
    if (camera.position.distanceTo(targetCamPos) < 0.5) {
      camera.position.copy(targetCamPos);
      if (controls && "target" in controls && controls.target) {
        (controls as any).target.copy(targetLookAt);
        (controls as any).update();
      }
      isAnimating.current = false;
    }
  });
  return null;
}

interface BottomWheelPanelProps {
  printerIdx: number;
  materialIdx: number;
  nozzleIdx: number;
  layerIdx: number;
  layerOptions: { label: string; value: number }[];
  wallIdx: number;
  infillIdx: number;
  infillPatternIdx: number;
  onPrinterChange: (idx: number) => void;
  onMaterialChange: (idx: number) => void;
  onNozzleChange: (idx: number) => void;
  onLayerChange: (idx: number) => void;
  onWallChange: (idx: number) => void;
  onInfillChange: (idx: number) => void;
  onInfillPatternChange: (idx: number) => void;
}

export function BottomWheelPanel({
  printerIdx,
  materialIdx,
  nozzleIdx,
  layerIdx,
  layerOptions,
  wallIdx,
  infillIdx,
  infillPatternIdx,
  onPrinterChange,
  onMaterialChange,
  onNozzleChange,
  onLayerChange,
  onWallChange,
  onInfillChange,
  onInfillPatternChange,
}: BottomWheelPanelProps) {
  return (
    <>
      <style>{`
        .bottom-wheel-container {
          position: fixed;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: row;
          align-items: flex-end;
          justify-content: center;
          gap: clamp(4px, 1vw, 12px);
          max-width: 98vw;
          z-index: 50;
          padding: 0 8px;
          margin: 0;
          transition: transform 0.2s ease, gap 0.2s ease;
        }

        /* Responsive scaling for standard 1366px & 1440px laptops */
        @media (max-width: 1440px) {
          .bottom-wheel-container {
            transform: translateX(-50%) scale(0.88);
            transform-origin: bottom center;
          }
        }

        /* Responsive scaling for 1280px and smaller laptops */
        @media (max-width: 1280px) {
          .bottom-wheel-container {
            transform: translateX(-50%) scale(0.78);
            transform-origin: bottom center;
          }
        }

        /* Compact fallback for smaller screens */
        @media (max-width: 1024px) {
          .bottom-wheel-container {
            transform: translateX(-50%) scale(0.68);
            transform-origin: bottom center;
          }
        }
      `}</style>

      <div className="bottom-wheel-container">
        <RadialWheel title="Printer" options={PRINTER_OPTIONS} selectedIndex={printerIdx} onChange={onPrinterChange} iconSize={64} autoHide={true} />
        <RadialWheel title="Material" options={MATERIAL_OPTIONS} selectedIndex={materialIdx} onChange={onMaterialChange} iconSize={64} autoHide={true} />
        <RadialWheel title="Nozzle" options={NOZZLE_OPTIONS} selectedIndex={nozzleIdx} onChange={onNozzleChange} autoHide={true} />
        <RadialWheel title="Layer Height" options={layerOptions} selectedIndex={layerIdx < layerOptions.length ? layerIdx : 0} onChange={onLayerChange} autoHide={true} />
        <RadialWheel title="Wall Loops" options={WALL_OPTIONS} selectedIndex={wallIdx} onChange={onWallChange} autoHide={true} />
        <RadialWheel title="Infill Density" options={INFILL_OPTIONS} selectedIndex={infillIdx} onChange={onInfillChange} autoHide={true} />
        <RadialWheel title="Infill Pattern" options={INFILL_PATTERN_OPTIONS} selectedIndex={infillPatternIdx} onChange={onInfillPatternChange} iconSize={20} autoHide={true} />
      </div>
    </>
  );
}

interface RightPresetWheelProps {
  presetIdx: number;
  onPresetChange: (idx: number) => void;
}

export function RightPresetWheel({ presetIdx, onPresetChange }: RightPresetWheelProps) {
  const presetOptions = useMemo(() => PRESETS.map((p, idx) => ({ ...p, value: idx })), []);
  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 50,
      }}
    >
      <RadialWheel
        title="Slice Presets"
        options={presetOptions}
        selectedIndex={presetIdx}
        onChange={onPresetChange}
        orientation="right"
        showCenterText={false}
        fontSizeSelected="12px"
        fontSizeUnselected="10px"
        autoHide={true}
      />
    </div>
  );
}

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
  const [infillPatternIdx, setInfillPatternIdx] = useState<number>(0);
  const [presetIdx, setPresetIdx] = useState<number>(0);
  const [showPriceFinder, setShowPriceFinder] = useState<boolean>(false);
  const [selectedFilterMaterial, setSelectedFilterMaterial] = useState<string>("ALL");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nozzleDiameterMm = NOZZLE_OPTIONS[nozzleIdx].value;
  const currentLayerOptions = LAYER_OPTIONS_BY_NOZZLE[nozzleDiameterMm] || LAYER_OPTIONS_BY_NOZZLE[0.4];
  const safeLayerIdx = Math.min(layerIdx, currentLayerOptions.length - 1);
  const activeLayerObj = currentLayerOptions[safeLayerIdx] || currentLayerOptions[0];
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
  const [holeAnalysis, setHoleAnalysis] = useState<{ hasHoles: boolean; openEdgeCount: number } | null>(null);

  const currentPrinterBed = PRINTER_OPTIONS[printerIdx].bedSize;
  const printability = useMemo(() => {
    return calculatePrintabilityScore(analysis, holeAnalysis, currentPrinterBed);
  }, [analysis, holeAnalysis, currentPrinterBed, nozzleDiameterMm]);

  const applyPreset = (idx: number) => {
    setPresetIdx(idx);
    const selectedPreset = PRESETS[idx];
    if (!selectedPreset) return;
    const availableLayerVals = currentLayerOptions.map((opt) => opt.value);
    const targetLayerHeight = selectedPreset.targetRatio * nozzleDiameterMm;
    const closestLayerIdx = getClosestIndex(availableLayerVals, targetLayerHeight);
    setLayerIdx(closestLayerIdx);
    const targetWallIdx = WALL_OPTIONS.findIndex((w) => w.value === selectedPreset.walls);
    if (targetWallIdx !== -1) setWallIdx(targetWallIdx);
    const targetInfillIdx = INFILL_OPTIONS.findIndex((i) => i.value === selectedPreset.infill);
    if (targetInfillIdx !== -1) setInfillIdx(targetInfillIdx);
    if (selectedPreset.patternIdx !== undefined) {
      setInfillPatternIdx(selectedPreset.patternIdx);
    }
  };

  const handlePrinterChange = (idx: number) => {
    setPrinterIdx(idx);
    const selectedPrinter = PRINTER_OPTIONS[idx];
    if (selectedPrinter?.defaults) {
      handleNozzleChange(selectedPrinter.defaults.nozzle);
      const newNozzleVal = NOZZLE_OPTIONS[selectedPrinter.defaults.nozzle].value;
      const availableHeights = LAYER_OPTIONS_BY_NOZZLE[newNozzleVal] || LAYER_OPTIONS_BY_NOZZLE[0.4];
      setLayerIdx(Math.min(selectedPrinter.defaults.layerHeight, availableHeights.length - 1));
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
    const targetHeight = newNozzleVal * 0.5;
    const availableLayerVals = availableHeights.map((opt) => opt.value);
    setLayerIdx(getClosestIndex(availableLayerVals, targetHeight));
    const recommendedWalls = Math.max(1, Math.round(1.2 / (newNozzleVal * 1.1)));
    const matchingWallIdx = WALL_OPTIONS.findIndex((w) => w.value === recommendedWalls);
    if (matchingWallIdx !== -1) {
      setWallIdx(matchingWallIdx);
    }
  };

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      if (currentModel?.objectUrl) URL.revokeObjectURL(currentModel.objectUrl);
      const objectUrl = URL.createObjectURL(file);
      const ext = file.name.split(".").pop()?.toLowerCase() || "stl";
      setCurrentModel({ objectUrl, format: ext, fileName: file.name });
    }
  };

  const handleExportSettings = () => {
    const dims = analysis
      ? `${analysis.x.toFixed(2)} x ${analysis.y.toFixed(2)} x ${analysis.z.toFixed(2)} mm`
      : "N/A";
    const vol = analysis ? `${(analysis.volume / 1000).toFixed(2)} cm³` : "N/A";
    const weight = analysis?.materialEstimate
      ? `${analysis.materialEstimate.weightGrams.toFixed(2)} g`
      : "N/A";
    const cost = analysis?.materialEstimate
      ? `$${analysis.materialEstimate.cost.toFixed(2)}`
      : "N/A";
    const score = printability?.score != null ? `${printability.score}/100` : "N/A";
    const status = printability?.statusText ?? "N/A";

    const textContent = `
==================================================
              PRINTWISE CONFIG REPORT
==================================================
Generated At: ${new Date().toLocaleString()}

--------------------------------------------------
1. HARDWARE & MATERIAL SETUP
--------------------------------------------------
• Printer:         ${PRINTER_OPTIONS[printerIdx]?.label ?? "Default Printer"}
• Material:        ${filamentKey}
• Spool Cost:      $${spoolPrice} USD

--------------------------------------------------
2. PRINT PARAMETERS
--------------------------------------------------
• Nozzle Diameter: ${nozzleDiameterMm} mm
• Layer Height:    ${layerHeightMm} mm
• Wall Loops:      ${wallLoopCount}
• Infill Density:  ${infill}%
• Infill Pattern:  ${INFILL_PATTERN_OPTIONS[infillPatternIdx]?.label ?? "Grid"}
• Top Layers:      ${topLayerCount}
• Bottom Layers:   ${bottomLayerCount}

--------------------------------------------------
3. MODEL & COST ANALYSIS
--------------------------------------------------
• Dimensions (XYZ): ${dims}
• Model Volume:     ${vol}
• Estimated Weight: ${weight}
• Estimated Cost:   ${cost}
• Print Score:      ${score}
• Printability:     ${status}

==================================================
`.trim();

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName ? fileName.replace(/\.[^/.]+$/, "") : "print"}_summary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    return () => {
      if (currentModel?.objectUrl) URL.revokeObjectURL(currentModel.objectUrl);
    };
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
    const lineX = new THREE.Line(xGeom, lineMat(0xef4444));
    const lineY = new THREE.Line(yGeom, lineMat(0x22c55e));
    const lineZ = new THREE.Line(zGeom, lineMat(0x3b82f6));
    group.add(lineX, lineY, lineZ);
    return group;
  }, []);

  const bedBoundsMesh = useMemo(() => {
    const { x, y, z } = currentPrinterBed;
    const geometry = new THREE.BoxGeometry(x, y, z);
    geometry.translate(0, 0, z / 2);
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
  }, [currentPrinterBed.x, currentPrinterBed.y, currentPrinterBed.z]);

  const maxGridSize = Math.max(currentPrinterBed.x, currentPrinterBed.y);
  const gridDivisions = Math.round(maxGridSize / 10);

  const formatDim = (val: number) => (useInches ? (val / 25.4).toFixed(2) + " in" : val.toFixed(1) + " mm");
  const formatVolume = (val: number) => (useInches ? (val / 16387).toFixed(2) + " in³" : (val / 1000).toFixed(1) + " cm³");
  const formatWeight = (est: any) => (est ? `${est.weightGrams.toFixed(1)} g` : "0 g");
  const formatCost = (est: any) => (est ? `$${est.cost.toFixed(2)}` : "$0.00");

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
          key={`grid-${maxGridSize}`}
          args={[maxGridSize, gridDivisions, "#e2e2e0", "#e2e2e0"]}
          position={[0, 0, -0.1]}
          rotation={[Math.PI / 2, 0, 0]}
          renderOrder={-1}
        />
        <primitive object={customAxesHelper} />
        {showBedBounds && <primitive object={bedBoundsMesh} />}
        <Suspense fallback={null}>
          {currentModel && (
            <Model
              model={currentModel}
              wireframe={wireframe}
              fallbackColor="#cbd5e1"
              infillPercent={infill}
              spoolPrice={spoolPrice}
              spoolWeightGrams={1000}
              filamentKey={filamentKey}
              nozzleDiameterMm={nozzleDiameterMm}
              layerHeightMm={layerHeightMm}
              wallLoopCount={wallLoopCount}
              topLayerCount={topLayerCount}
              bottomLayerCount={bottomLayerCount}
              activeHeatmap={activeHeatmap}
              showHoles={showHoles}
              onHolesDetected={setHoleAnalysis}
              onModelAnalyzed={setAnalysis}
            />
          )}
        </Suspense>
        <OrbitControls makeDefault minDistance={1} maxDistance={1000} />
        <CameraResetController resetTrigger={resetCounter} />
      </Canvas>

      <ScorePill printability={printability} />

      <BottomWheelPanel
        printerIdx={printerIdx}
        materialIdx={materialIdx}
        nozzleIdx={nozzleIdx}
        layerIdx={safeLayerIdx}
        layerOptions={currentLayerOptions}
        wallIdx={wallIdx}
        infillIdx={infillIdx}
        infillPatternIdx={infillPatternIdx}
        onPrinterChange={handlePrinterChange}
        onMaterialChange={handleMaterialChange}
        onNozzleChange={handleNozzleChange}
        onLayerChange={setLayerIdx}
        onWallChange={setWallIdx}
        onInfillChange={setInfillIdx}
        onInfillPatternChange={setInfillPatternIdx}
      />

      <RightPresetWheel presetIdx={presetIdx} onPresetChange={applyPreset} />
      <div style={{ position: "absolute", top: 20, left: 20, zIndex: 10 }}>
        <input type="file" ref={fileInputRef} accept=".stl" onChange={handleFileUpload} style={{ display: "none" }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            border: "1px solid var(--card-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease",
          }}
          title="Upload STL Model"
        >
          <svg style={{ width: 20, height: 20, color: "var(--text-primary)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
        {fileName && (
          <div style={{ position: "absolute", top: 0, left: 60, fontSize: "10px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(8px)", padding: "6px 10px", borderRadius: 8, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", border: "1px solid var(--card-border)" }}>
            {fileName}
          </div>
        )}
      </div>
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {holeAnalysis && (
            <div style={{ background: holeAnalysis.hasHoles ? "rgba(225, 29, 72, 0.1)" : "rgba(16, 185, 129, 0.1)", color: holeAnalysis.hasHoles ? "#e11d48" : "#059669", padding: "6px 12px", borderRadius: 980, fontSize: "11px", fontWeight: 600, border: "1px solid var(--card-border)" }}>
              {holeAnalysis.hasHoles ? `⚠ ${holeAnalysis.openEdgeCount} open edge(s)` : "✓ Watertight"}
            </div>
          )}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowPriceFinder(!showPriceFinder)}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: showPriceFinder ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" : "rgba(255, 255, 255, 0.95)",
                color: showPriceFinder ? "#ffffff" : "var(--text-primary)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                border: "1px solid var(--card-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: 700,
                transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease",
              }}
              title="Find Online & Nearby Spool Prices"
            >
              💲
            </button>
            {showPriceFinder && (
              <div
                style={{
                  position: "absolute",
                  top: "58px",
                  right: "0px",
                  width: "340px",
                  backgroundColor: "rgba(255, 255, 255, 0.98)",
                  backdropFilter: "blur(16px)",
                  borderRadius: "18px",
                  border: "1px solid var(--card-border, rgba(0,0,0,0.12))",
                  boxShadow: "0 20px 35px -10px rgba(0,0,0,0.2)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  zIndex: 101,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                      Online & Nearby Spool Deals
                    </h4>
                    <span style={{ fontSize: "10px", color: "#64748b" }}>Select a listing to update spool price</span>
                  </div>
                  <button
                    onClick={() => setShowPriceFinder(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#94a3b8" }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: "flex", gap: "4px", overflowX: "auto", paddingBottom: "2px" }}>
                  {["ALL", "PLA", "PETG", "ABS", "TPU"].map((mat) => (
                    <button
                      key={mat}
                      onClick={() => setSelectedFilterMaterial(mat)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: selectedFilterMaterial === mat ? "#2563eb" : "#f1f5f9",
                        color: selectedFilterMaterial === mat ? "#ffffff" : "#475569",
                      }}
                    >
                      {mat}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
                  {FILAMENT_LISTINGS
                    .filter(item => selectedFilterMaterial === "ALL" || item.material === selectedFilterMaterial)
                    .map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 10px",
                          borderRadius: "10px",
                          background: "#f8fafc",
                          border: "1px solid rgba(0,0,0,0.05)",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "#1e293b" }}>{item.name}</span>
                          <span style={{ fontSize: "9px", color: "#64748b" }}>{item.store} ({item.distance})</span>
                        </div>
                        <button
                          onClick={() => {
                            setSpoolPrice(item.price);
                            setFilamentKey(item.material);
                            const foundMatIdx = MATERIAL_OPTIONS.findIndex(m => m.value === item.material);
                            if (foundMatIdx !== -1) setMaterialIdx(foundMatIdx);
                            setShowPriceFinder(false);
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: "6px",
                            backgroundColor: "#2563eb",
                            color: "#ffffff",
                            border: "none",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ${item.price.toFixed(2)}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {HEATMAP_MODES.map(({ key, label }) => {
            const isActive = activeHeatmap === key;
            const shortLabel = key === "none" ? "OFF" : key === "overhang" ? "OVH" : key === "stress" ? "STR" : "THN";
            let bgGradient = "rgba(255, 255, 255, 0.95)";
            let textColor = "var(--text-primary)";
            let shadowStyle = "0 4px 12px rgba(0, 0, 0, 0.05)";
            if (isActive) {
              textColor = "#fff";
              shadowStyle = "0 6px 16px rgba(0, 0, 0, 0.15)";
              if (key === "none") bgGradient = "linear-gradient(135deg, #334155 0%, #0f172a 100%)";
              else if (key === "overhang") bgGradient = "linear-gradient(180deg, #38bdf8 0%, #2563eb 100%)";
              else if (key === "stress") bgGradient = "linear-gradient(180deg, #facc15 0%, #ea580c 100%)";
              else if (key === "thinWall") bgGradient = "linear-gradient(180deg, #f43f5e 0%, #be123c 100%)";
            }
            return (
              <button
                key={key}
                onClick={() => setActiveHeatmap(key as any)}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: bgGradient,
                  color: textColor,
                  backdropFilter: "blur(12px)",
                  boxShadow: shadowStyle,
                  border: "1px solid var(--card-border)",
                  fontSize: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease",
                }}
                title={`Heatmap: ${label}`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowBedBounds(!showBedBounds)}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 980,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              cursor: "pointer",
              backdropFilter: "blur(12px)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
              border: "1px solid var(--card-border)",
              background: showBedBounds ? "var(--accent-blue)" : "rgba(255, 255, 255, 0.95)",
              color: showBedBounds ? "#fff" : "var(--text-primary)",
              transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease",
            }}
          >
            {showBedBounds ? "Hide Build Volume" : "Show Build Volume"}
          </button>
          <button
            onClick={() => setShowHoles(!showHoles)}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 980,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              cursor: "pointer",
              backdropFilter: "blur(12px)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
              border: "1px solid var(--card-border)",
              background: showHoles ? "#e11d48" : "rgba(255, 255, 255, 0.95)",
              color: showHoles ? "#fff" : "var(--text-primary)",
              transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease",
            }}
          >
            {showHoles ? "Hide Hole Check" : "Check for Holes"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <button
            onClick={() => setResetCounter((c) => c + 1)}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              border: "1px solid var(--card-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-primary)",
              transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
            title="Reset View"
          >
            <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          </button>
          <button
            onClick={() => setWireframe(!wireframe)}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: wireframe ? "var(--accent-blue)" : "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              border: "1px solid var(--card-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: wireframe ? "#fff" : "var(--text-primary)",
              transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease",
            }}
            title="Toggle Wireframe Overlay"
          >
            <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </button>
          <button
            onClick={() => setUseInches(!useInches)}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: useInches ? "var(--accent-blue)" : "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              border: "1px solid var(--card-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 700,
              color: useInches ? "#fff" : "var(--text-primary)",
              transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease",
            }}
            title="Toggle Units (MM/IN)"
          >
            {useInches ? "IN" : "MM"}
          </button>
        </div>
      </div>
  
      <div className="sidebar-container" style={{ position: "absolute", top: 88, left: 20, zIndex: 10, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="apple-card">
          <div className="card-title">
            <span>Analysis & Slicing</span>
          </div>
          {analysis ? (
            <>
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
                <button
                  onClick={handleExportSettings}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "none",
                    background: "var(--accent-blue)",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 4,
                    boxShadow: "0 4px 12px rgba(0, 102, 204, 0.25)",
                    transition: "transform 0.2s ease, background 0.2s ease",
                  }}
                >
                  <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Print Profile (.txt)
                </button>
              </div>
            </>
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