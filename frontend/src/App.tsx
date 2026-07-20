import { Suspense, useState, useRef, type ChangeEvent } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Model from "./Model";
import type { LoadedModel } from "./types";

/**
 * Camera controller helper component.
 * Exposes a function to animate the camera smoothly back to a top-down corner perspective.
 */
function CameraResetController({ resetTrigger }: { resetTrigger: number }) {
  const { camera, controls } = useThree();
  const lastTrigger = useRef(resetTrigger);

  // When the parent counter changes, smoothly transition camera positions
  if (resetTrigger !== lastTrigger.current) {
    lastTrigger.current = resetTrigger;
    
    // Animate camera position to a clean isometric corner angle [X, Y, Z]
    camera.position.set(8, 8, 8);
    camera.lookAt(0, 0, 0);

    // Snap target rotation vectors back to dead center coordinate origin
    if (controls) {
      (controls as any).target.set(0, 0, 0);
    }
  }

  return null;
}

export default function App() {
  const [currentModel, setCurrentModel] = useState<LoadedModel | null>(null);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [fallbackColor] = useState<string>("#cccccc");
  const [resetCounter, setResetCounter] = useState<number>(0);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#111111", position: "relative" }}>
      
      {/* 3D Scene Viewport */}
      <Canvas shadows camera={{ fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
        <pointLight position={[-5, 5, -5]} intensity={0.5} />

        {/* 3D Floor Measurement Grid (Size: 30 units, Divisions: 30 squares) */}
        <gridHelper args={[30, 30, "#4caf50", "#333333"]} position={[0, -0.01, 0]} />

        <Suspense fallback={null}>
          {currentModel && (
            <Model 
              model={currentModel} 
              wireframe={wireframe} 
              fallbackColor={fallbackColor} 
            />
          )}
        </Suspense>

        <OrbitControls makeDefault minDistance={1} maxDistance={100} />
        <CameraResetController resetTrigger={resetCounter} />
      </Canvas>

      {/* Floating Left-Side Sidebar (Branding + Controls) */}
      <div style={{ 
        position: "absolute", top: 20, left: 20, 
        display: "flex", flexDirection: "column", gap: 16,
        zIndex: 10
      }}>
        
        {/* Your Custom Studio Branding Title Block */}
        <div style={{
          background: "linear-gradient(135deg, #2196f3, #00e5ff)",
          padding: "12px 20px",
          borderRadius: 8,
          color: "#ffffff",
          fontFamily: "sans-serif",
          fontWeight: "bold",
          fontSize: "18px",
          letterSpacing: "1px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          textTransform: "uppercase",
          textAlign: "center"
        }}>
          PrintWise
        </div>

        {/* Floating 3D Control Panel Container */}
        <div style={{ 
          background: "rgba(0, 0, 0, 0.85)", padding: 20, 
          borderRadius: 8, color: "#fff", fontFamily: "sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 14,
          width: "240px"
        }}>
          <h3 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.5px", color: "#aaa" }}>
            Workspace Options
          </h3>
          
          {/* File Input Button */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "11px", color: "#888" }}>Upload Model File:</label>
            <input 
              type="file" 
              accept=".gltf,.glb,.obj,.stl,.fbx,.ply" 
              onChange={handleFileUpload}
              style={{ color: "#fff", cursor: "pointer", fontSize: "13px", width: "100%" }}
            />
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #333", margin: "2px 0" }} />

          {/* Action Controls Group */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            
            {/* Home Isometric Button */}
            <button 
              onClick={triggerHomeView}
              style={{
                background: "#2196f3", color: "#fff", border: "none",
                padding: "8px 12px", borderRadius: 4, cursor: "pointer",
                fontWeight: "bold", fontSize: "13px", textAlign: "center",
                transition: "background 0.2s"
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#1976d2")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#2196f3")}
            >
              Isometric Home View
            </button>

            {/* Wireframe View option */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "13px" }}>
              <input 
                type="checkbox" 
                checked={wireframe} 
                onChange={(e) => setWireframe(e.target.checked)} 
              />
              Wireframe Overlay
            </label>
          </div>

          {currentModel?.format && (
            <div style={{ fontSize: "11px", color: "#4caf50", fontWeight: "bold", marginTop: 4 }}>
              Active Asset: {currentModel.format.toUpperCase()} Engine Resolved
            </div>
          )}
        </div>

      </div> {/* Closed sidebar container */}
    </div> /* Closed main viewport parent container */
  );
}
