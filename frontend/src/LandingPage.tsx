'use client'; // Keep this if using Next.js, remove if using Vite

import React, { useRef, useLayoutEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChevronRight, Cpu, Layers, Maximize, Zap, ShieldCheck, Activity } from 'lucide-react';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

// 1. Define the props interface
interface LandingPageProps {
  onLaunchApp: () => void;
}

// --------------------------------------------------------
// 3D Model Component (Replace with your actual GLTF/GLB path)
// --------------------------------------------------------
const PrinterModel = () => {
  // const { scene } = useGLTF('/models/printer.glb'); // Uncomment when you have the model
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group ref={groupRef} position={[0, -1.5, 0]}>
      {/* Fallback Box if no model is present */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3, 3, 3]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* <primitive object={scene} /> */}
    </group>
  );
};

// --------------------------------------------------------
// Main Landing Page Component
// --------------------------------------------------------
interface LandingPageProps {
  onLaunchApp: () => void; 
}
export default function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraTargetRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Pin the canvas and animate UI elements as you scroll
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          end: '+=400%', // Scroll distance dictates animation length
          scrub: 1,
          pin: true,
        },
      });

      // UI Fade In/Out animations tied to scroll progress
      tl.to('.hero-content', { opacity: 0, y: -50, duration: 1 })
        .fromTo('.feature-glass-1', { opacity: 0, x: 50 }, { opacity: 1, x: 0, duration: 1 })
        .to('.feature-glass-1', { opacity: 0, x: -50, duration: 1 })
        .fromTo('.stats-container', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 1 })
        .to('.stats-container', { opacity: 0, duration: 1 })
        .fromTo('.final-cta', { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1 });
      
      // Note: Three.js camera animations would be mapped here using GSAP to animate a Three.js camera reference.
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-white text-zinc-900 overflow-hidden font-sans">
      
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0">
        <Canvas shadows camera={{ position: [0, 2, 8], fov: 45 }}>
          <Environment preset="studio" />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1.5} castShadow />
          <PrinterModel />
          <ContactShadows position={[0, -1.5, 0]} opacity={0.5} scale={10} blur={2} far={4} />
        </Canvas>
      </div>

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        
        {/* Section 1: Hero */}
        <div className="hero-content absolute inset-0 flex flex-col items-center justify-start pt-32 text-center">
          <h1 className="text-7xl font-extralight tracking-tight text-zinc-900 mb-4">
            Print Smarter.
          </h1>
          <p className="text-xl text-zinc-500 font-light max-w-2xl">
            AI-powered slicing, print analysis, structural simulation, and intelligent recommendations.
          </p>
          <button className="mt-8 pointer-events-auto group flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-full font-medium shadow-[0_8px_30px_rgb(37,99,235,0.3)] hover:bg-blue-700 transition-all">
            Launch App
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Section 2: Feature Reveal (Glassmorphism) */}
        <div className="feature-glass-1 absolute right-24 top-1/2 -translate-y-1/2 w-96 p-8 rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-2xl opacity-0">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-blue-600 mb-6">Core Intelligence</h3>
          <ul className="space-y-4">
            {[
              { icon: Cpu, text: 'AI Print Advisor' },
              { icon: Layers, text: 'Adaptive Layer Heights' },
              { icon: Maximize, text: 'Structural Stress Analysis' },
              { icon: Zap, text: 'Smart Print Presets' },
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-zinc-800 font-medium">
                <item.icon className="w-5 h-5 text-zinc-500" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Section 3: Floating Stat Cards (Geometry & Pre-Flight) */}
        <div className="stats-container absolute inset-0 flex items-center justify-around px-24 opacity-0">
          <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
            {[
              { label: 'Printability Score', value: '98%', icon: ShieldCheck },
              { label: 'Estimated Weight', value: '124g', icon: Activity },
              { label: 'Print Time', value: '2h 15m', icon: Zap },
              { label: 'Material', value: 'PETG', icon: Layers },
            ].map((stat, i) => (
              <div key={i} className="bg-white/50 backdrop-blur-md border border-white/50 p-6 rounded-2xl shadow-xl flex flex-col items-start">
                <stat.icon className="w-6 h-6 text-blue-600 mb-3" />
                <span className="text-3xl font-light text-zinc-900">{stat.value}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mt-1">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Final CTA */}
        <div className="final-cta absolute inset-0 flex flex-col items-center justify-end pb-32 text-center opacity-0">
          <h2 className="text-5xl font-extralight tracking-tight text-zinc-900 mb-8">
            Everything your slicer should have been.
          </h2>
          <button className="pointer-events-auto bg-blue-600 text-white px-10 py-4 rounded-full font-medium text-lg shadow-[0_8px_30px_rgb(37,99,235,0.3)] hover:bg-blue-700 transition-all hover:scale-105">
            Start Printing
          </button>
        </div>

      </div>

      {/* Ultra Minimalist Footer */}
      <footer className="absolute bottom-4 w-full flex justify-center gap-8 text-[10px] text-zinc-400 font-medium uppercase tracking-widest z-20">
        <a href="#" className="hover:text-zinc-600 transition-colors pointer-events-auto">Privacy</a>
        <a href="#" className="hover:text-zinc-600 transition-colors pointer-events-auto">Terms</a>
        <a href="#" className="hover:text-zinc-600 transition-colors pointer-events-auto">Contact</a>
      </footer>
    </div>
  );
}