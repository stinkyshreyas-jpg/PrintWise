import React, { Suspense, useState, useRef, useMemo, type ChangeEvent } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Model from "./Model";
import GridMotion from "./GridMotion";
import type { LoadedModel } from "./types";
import { STLLoader } from "three-stdlib";


export function CameraResetController({ resetTrigger }: { resetTrigger: number }) {
  const { camera, controls } = useThree();

  const lastTrigger = useRef(resetTrigger);
  const isAnimating = useRef(false);

  const targetCamPos = useMemo(() => new THREE.Vector3(12, -12, 12), []);
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

    
    const distanceToTargetPos = camera.position.distanceTo(targetCamPos);
    
    if (distanceToTargetPos < 0.05) {
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

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
        position: "relative",
        width: "100%",
        padding: isDragging ? "22px 16px" : "12px 14px",
        borderRadius: isDragging ? 22 : 16,
        background: isDragging
          ? "rgba(255, 255, 255, 0.85)"
          : "rgba(255, 255, 255, 0.45)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: isDragging
          ? "2px dashed #38bdf8"
          : "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: isDragging
          ? "0 20px 35px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.9)"
          : "0 8px 20px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        
        transition: "all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: isDragging ? "scale(1.03)" : "scale(1)",
        boxSizing: "border-box"
      }}
    >
      {}
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl"
        onChange={onFileUpload}
        style={{ display: "none" }}
      />

      {}
      {fileName ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <span style={{
            fontSize: "10px", fontWeight: 800, color: "#0284c7", background: "rgba(56, 189, 248, 0.15)",
            padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(56, 189, 248, 0.3)"
          }}>
            STL
          </span>
          <span style={{
            fontSize: "12px", fontWeight: 700, color: "#0f172a",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1
          }}>
            {fileName}
          </span>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8" }}>
            Replace
          </span>
        </div>
      ) : (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            color: isDragging ? "#0284c7" : "#334155",
            fontWeight: 700, fontSize: "12px"
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>{isDragging ? "Drop STL File Here" : "Upload STL Model"}</span>
          </div>

          <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8" }}>
            Drag & drop or click to browse
          </span>
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
  const [infill, setInfill] = useState<number>(20);
  const [spoolPrice, setSpoolPrice] = useState<number>(25);
  const [perimeters, setPerimeters] = useState<number>(3);
  const [nozzleDiameter, setNozzleDiameter] = useState<number>(0.4);
  const [layerHeight, setLayerHeight] = useState<number>(0.2);
  const [topSolidLayers, setTopSolidLayers] = useState<number>(4);
  const [bottomSolidLayers, setBottomSolidLayers] = useState<number>(4);
  const [analysis, setAnalysis] = useState<any>(null);
  const [resetCounter, setResetCounter] = useState<number>(0);
  const fallbackColor = "#cbd5e1";

  
  
  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);

      
      if (currentModel?.objectUrl) {
        URL.revokeObjectURL(currentModel.objectUrl);
      }

      
      const objectUrl = URL.createObjectURL(file);
      
      
      const ext = file.name.split('.').pop()?.toLowerCase() || 'stl';

      
      setCurrentModel({
        objectUrl,
        format: ext,
        fileName: file.name
      });
    }
  };
  React.useEffect(() => {
    return () => {
      if (currentModel?.objectUrl) {
        URL.revokeObjectURL(currentModel.objectUrl);
      }
    };
  }, [currentModel]);

  const triggerHomeView = () => setResetCounter((prev) => prev + 1);

  
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

  
  const formatDim = (val: number) => useInches ? (val / 25.4).toFixed(2) + " in" : val.toFixed(1) + " mm";
  const formatVolume = (val: number) => useInches ? (val / 16387).toFixed(2) + " in³" : (val / 1000).toFixed(1) + " cm³";

  // FIX: previously these recomputed weight/cost from scratch using a naive
  // (volume * density * infillRatio) formula, which ignores shell/wall/cap
  // thickness entirely and scales the ENTIRE model — including the solid
  // shell, which doesn't change with infill — down by the infill ratio.
  // That's what caused the oversized swings vs Bambu Studio when changing
  // infill, and why editing Model.tsx's calc appeared to do nothing: this
  // formula never used Model.tsx's output in the first place.
  //
  // Model.tsx already computes the correct shell+infill-aware weight and
  // cost in `analysis.estimatedWeightGrams` / `analysis.estimatedMaterialCost`
  // — just read those directly instead of recalculating.
  const formatWeight = (a: any) => a ? a.estimatedWeightGrams.toFixed(1) + " g" : "0 g";
  const formatCost = (a: any) => a ? "$" + a.estimatedMaterialCost.toFixed(2) : "$0.00";

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#f8fafc", position: "relative", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif" }}>
      
      {}
      <div style={{ position: "absolute", top: "5%", left: "10%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, rgba(255, 255, 255, 0) 70%)", pointerEvents: "none", filter: "blur(70px)" }} />
      <div style={{ position: "absolute", bottom: "5%", right: "10%", width: "45vw", height: "45vw", background: "radial-gradient(circle, rgba(168, 85, 247, 0.08) 0%, rgba(255, 255, 255, 0) 70%)", pointerEvents: "none", filter: "blur(90px)" }} />

      {}
      <Canvas
        shadows
        camera={{ position: [12, -12, 12], fov: 45 }}
        onCreated={({ camera }) => {
          camera.up.set(0, 0, 1);
          camera.lookAt(0, 0, 0);
        }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[10, -10, 15]} intensity={1.5} castShadow />
        <pointLight position={[-5, 5, 5]} intensity={0.4} />

        {}
        <gridHelper
          args={[30, 30]}
          position={[0, 0, -0.01]}
          rotation={[Math.PI / 2, 0, 0]}
        />

        {}
        <primitive object={customAxesHelper} />

        <Suspense fallback={null}>
          {currentModel && (
            <Model
              model={currentModel}
              wireframe={wireframe}
              fallbackColor={fallbackColor}
              infillPercent={infill}
              spoolPrice={spoolPrice}
              perimeters={perimeters}
              nozzleDiameter={nozzleDiameter}
              layerHeight={layerHeight}
              topSolidLayers={topSolidLayers}
              bottomSolidLayers={bottomSolidLayers}
              onModelAnalyzed={setAnalysis}
            />
          )}
        </Suspense>

        <OrbitControls makeDefault minDistance={1} maxDistance={100} />
        <CameraResetController resetTrigger={resetCounter} />
      </Canvas>

      {}
      <div style={{ 
        position: "absolute", top: 20, left: 20, display: "flex", flexDirection: "column", gap: 14, zIndex: 10, width: "320px", 
        maxHeight: "calc(100vh - 40px)", overflowY: "auto", paddingRight: 4 
      }}>
        
        {}
        <div style={{
          background: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "14px 20px",
          borderRadius: 16,
          boxShadow: "0 10px 25px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <span style={{ fontWeight: 800, fontSize: "16px", letterSpacing: "1px", color: "#ffffff" }}>
            PRINTWISE
          </span>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#38bdf8", background: "rgba(56, 189, 248, 0.15)", padding: "3px 8px", borderRadius: 10, border: "1px solid rgba(56, 189, 248, 0.3)" }}>
            3D ENGINE
          </span>
        </div>

        {}
        <div style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(25px) saturate(180%)",
          WebkitBackdropFilter: "blur(25px) saturate(180%)",
          padding: "18px",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.9)",
          display: "flex", flexDirection: "column", gap: 12
        }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.2px" }}>
            Workspace Options
          </span>
          
          {}
          <ElasticUploadPill
            onFileUpload={handleFileUpload}
            fileName={fileName}
          />

          <button
            onClick={triggerHomeView}
            style={{
              background: "rgba(15, 23, 42, 0.9)", color: "#ffffff", border: "none", padding: "10px 14px", borderRadius: 12,
              cursor: "pointer", fontWeight: 600, fontSize: "12px", boxShadow: "0 4px 12px rgba(15,23,42,0.15)", transition: "all 0.2s ease"
            }}
          >
            Isometric Home View
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", fontWeight: 600, color: "#475569", cursor: "pointer", marginTop: 2 }}>
            <input
              type="checkbox"
              checked={wireframe}
              onChange={(e) => setWireframe(e.target.checked)}
              style={{ accentColor: "#0f172a", borderRadius: 4 }}
            />
            Wireframe Overlay
          </label>
        </div>

        {}
        <div style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(25px) saturate(180%)",
          WebkitBackdropFilter: "blur(25px) saturate(180%)",
          padding: "18px",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.9)",
          display: "flex", flexDirection: "column", gap: 12
        }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.2px" }}>
            Print Profile
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Nozzle Diameter</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[0.2, 0.4, 0.6, 0.8].map((size) => (
                <button
                  key={size}
                  onClick={() => setNozzleDiameter(size)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    borderRadius: 10,
                    border: nozzleDiameter === size ? "1px solid rgba(15, 23, 42, 0.9)" : "1px solid rgba(15, 23, 42, 0.12)",
                    background: nozzleDiameter === size ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.5)",
                    color: nozzleDiameter === size ? "#ffffff" : "#0f172a",
                    fontSize: "11px", fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease"
                  }}
                >
                  {size}mm
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>Layer Height:</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{layerHeight.toFixed(2)} mm</span>
            </div>
            <input
              type="range" min="0.08" max="0.28" step="0.04" value={layerHeight}
              onChange={(e) => setLayerHeight(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>Wall Loops (Perimeters):</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{perimeters}</span>
            </div>
            <input
              type="range" min="1" max="8" step="1" value={perimeters}
              onChange={(e) => setPerimeters(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Top Layers:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{topSolidLayers}</span>
              </div>
              <input
                type="range" min="0" max="10" step="1" value={topSolidLayers}
                onChange={(e) => setTopSolidLayers(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }}
              />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Bottom Layers:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{bottomSolidLayers}</span>
              </div>
              <input
                type="range" min="0" max="10" step="1" value={bottomSolidLayers}
                onChange={(e) => setBottomSolidLayers(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }}
              />
            </div>
          </div>
        </div>

        {}
        <div style={{
          background: "rgba(255, 255, 255, 0.65)",
          backdropFilter: "blur(30px) saturate(200%)",
          WebkitBackdropFilter: "blur(30px) saturate(200%)",
          padding: "20px",
          borderRadius: 22,
          border: "1px solid rgba(255, 255, 255, 0.85)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
          display: "flex", flexDirection: "column", gap: 14
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>
              Analysis Panel
            </span>
            <button
              onClick={() => setUseInches(!useInches)}
              style={{
                background: "rgba(15, 23, 42, 0.06)", color: "#0f172a", border: "1px solid rgba(15, 23, 42, 0.1)",
                padding: "4px 10px", borderRadius: 10, cursor: "pointer", fontSize: "11px", fontWeight: 700
              }}
            >
              Unit: {useInches ? "IN" : "MM"}
            </button>
          </div>

          {analysis ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: "13px" }}>
              
              {}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: "rgba(255, 255, 255, 0.5)", padding: "10px 6px", borderRadius: 14, border: "1px solid rgba(255, 255, 255, 0.7)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>X (WIDTH)</span>
                  <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "12px", marginTop: 2 }}>{formatDim(analysis.x)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "1px solid rgba(226, 232, 240, 0.8)", borderRight: "1px solid rgba(226, 232, 240, 0.8)" }}>
                  <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>Y (DEPTH)</span>
                  <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "12px", marginTop: 2 }}>{formatDim(analysis.y)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>Z (HEIGHT)</span>
                  <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "12px", marginTop: 2 }}>{formatDim(analysis.z)}</span>
                </div>
              </div>

              {}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Volume:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{formatVolume(analysis.volume)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>PLA Weight:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{formatWeight(analysis)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Est. Cost:</span>
                  <span style={{ fontWeight: 700, color: "#10b981" }}>{formatCost(analysis)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Triangles:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{analysis.triangles.toLocaleString()}</span>
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid rgba(226, 232, 240, 0.8)", margin: "2px 0" }} />

              {}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Overhang Specs
                </span>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Max Overhang:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{analysis.maxOverhang}°</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Risky Faces:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{analysis.facesOverThreshold.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Bridgeable Area:</span>
                  <span style={{ fontWeight: 700, color: "#06b6d4" }}>{analysis.bridgePercent}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Support Area:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{analysis.supportSurfacePercent}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Support Risk:</span>
                  {(() => {
                    const percent = analysis.supportSurfacePercent;
                    let label = "SAFE";
                    let color = "#10b981";
                    let bg = "rgba(16, 185, 129, 0.12)";

                    if (percent >= 1.5 && percent <= 5) {
                      label = "LOW (Minor)";
                      color = "#f59e0b";
                      bg = "rgba(245, 158, 11, 0.12)";
                    } else if (percent > 5 && percent <= 15) {
                      label = "MEDIUM";
                      color = "#f97316";
                      bg = "rgba(249, 115, 22, 0.12)";
                    } else if (percent > 15) {
                      label = "HIGH (Critical)";
                      color = "#ef4444";
                      bg = "rgba(239, 68, 68, 0.12)";
                    }

                    return (
                      <span style={{
                        fontSize: "11px", fontWeight: 700, color, background: bg,
                        padding: "3px 10px", borderRadius: 10, letterSpacing: "0.2px"
                      }}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid rgba(226, 232, 240, 0.8)", margin: "2px 0" }} />

              {}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#64748b", fontWeight: 500 }}>Infill Density:</span>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>{infill}%</span>
                  </div>
                  <input
                    type="range" min="5" max="100" step="5" value={infill}
                    onChange={(e) => setInfill(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#64748b", fontWeight: 500 }}>Spool Price (1kg):</span>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>${spoolPrice}</span>
                  </div>
                  <input
                    type="range" min="10" max="60" step="1" value={spoolPrice}
                    onChange={(e) => setSpoolPrice(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }}
                  />
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