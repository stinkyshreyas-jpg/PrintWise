import React from "react";

export interface MaterialEstimate {
  minGrams: number;
  maxGrams: number;
  targetGrams: number;
  formattedRange: string;
  estimatedCostUSD: string;
}

interface AnalysisData {
  x: number;
  y: number;
  z: number;
  triangles: number;
  volume: number;
  maxOverhang: number;
  supportSurfacePercent: number;
  surfaceArea: number;
  hasHoles: boolean;
  openEdgeCount: number;
}

interface StatsPanelProps {
  data: AnalysisData | null;
  materialEstimate: MaterialEstimate | null;
  activeHeatmap: "none" | "overhang" | "stress" | "thinWall";
  onHeatmapChange: (mode: "none" | "overhang" | "stress" | "thinWall") => void;
  wireframe: boolean;
  onToggleWireframe: () => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  data,
  materialEstimate,
  activeHeatmap,
  onHeatmapChange,
  wireframe,
  onToggleWireframe,
}) => {
  if (!data) {
    return (
      <div className="p-4 bg-slate-900 text-slate-400 rounded-xl border border-slate-800">
        Analyzing mesh geometry...
      </div>
    );
  }

  return (
    <div className="w-80 bg-slate-900/90 backdrop-blur-md text-slate-100 p-5 rounded-2xl border border-slate-800 shadow-2xl space-y-5">
      {/* Header & Dimensions */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-lg font-bold tracking-tight text-white">Model Pre-Flight</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            {data.triangles.toLocaleString()} tris
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Bounds: {data.x} × {data.y} × {data.z} mm
        </p>
      </div>

      {/* Material & Cost Range HUD */}
      <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50 space-y-1">
        <div className="text-xs text-slate-400 font-medium">Estimated Material (PLA)</div>
        <div className="flex justify-between items-baseline">
          <span className="text-xl font-extrabold text-emerald-400">
            {materialEstimate ? materialEstimate.formattedRange : "Calculating..."}
          </span>
          <span className="text-sm font-semibold text-slate-300">
            {materialEstimate ? materialEstimate.estimatedCostUSD : "$0.00"}
          </span>
        </div>
        <p className="text-[10px] text-slate-500">
          Range includes Arachne wall variations and density tolerances.
        </p>
      </div>

      {/* Mesh Integrity & Risk Flags */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Geometric Health
        </div>
        
        {/* Hole Warning */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-medium ${
            data.hasHoles
              ? "bg-rose-950/40 border-rose-800/60 text-rose-300"
              : "bg-slate-800/30 border-slate-700/30 text-slate-300"
          }`}
        >
          <span>Mesh Manifold:</span>
          <span className="font-bold">
            {data.hasHoles ? `Open Edges (${data.openEdgeCount})` : "Water-tight"}
          </span>
        </div>

        {/* Overhang / Support Warning */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-medium ${
            data.supportSurfacePercent > 12
              ? "bg-amber-950/40 border-amber-800/60 text-amber-300"
              : "bg-slate-800/30 border-slate-700/30 text-slate-300"
          }`}
        >
          <span>Overhang Area (&gt;60°):</span>
          <span className="font-bold">{data.supportSurfacePercent}%</span>
        </div>
      </div>

      {/* Visual Heatmap Controls */}
      <div className="space-y-2 pt-1 border-t border-slate-800">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Visual Diagnostics
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onHeatmapChange("overhang")}
            className={`p-2 text-xs font-medium rounded-lg border transition-all ${
              activeHeatmap === "overhang"
                ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
            }`}
          >
            Overhangs
          </button>
          <button
            onClick={() => onHeatmapChange("stress")}
            className={`p-2 text-xs font-medium rounded-lg border transition-all ${
              activeHeatmap === "stress"
                ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
            }`}
          >
            Stress Risk
          </button>
          <button
            onClick={() => onHeatmapChange("thinWall")}
            className={`p-2 text-xs font-medium rounded-lg border transition-all ${
              activeHeatmap === "thinWall"
                ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
            }`}
          >
            Thin Walls
          </button>
          <button
            onClick={onToggleWireframe}
            className={`p-2 text-xs font-medium rounded-lg border transition-all ${
              wireframe
                ? "bg-slate-700 border-slate-500 text-white"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
            }`}
          >
            {wireframe ? "Solid View" : "Wireframe"}
          </button>
        </div>
      </div>
    </div>
  );
};