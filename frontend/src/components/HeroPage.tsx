import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import { useAspect, useTexture } from '@react-three/drei';
import { useMemo, useRef, useState, useEffect, Suspense } from 'react';
// @ts-ignore — three/webgpu is a separate build entry
import * as THREE from 'three/webgpu';
// @ts-ignore
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
// @ts-ignore
import {
  abs, blendScreen, float, mod, mx_cell_noise_float, oneMinus,
  smoothstep, texture, uniform, uv, vec2, vec3, pass, mix, add,
} from 'three/tsl';
import type { Mesh } from 'three';

const TEXTUREMAP = { src: 'https://i.postimg.cc/XYwvXN8D/img-4.png' };
const DEPTHMAP   = { src: 'https://i.postimg.cc/2SHKQh2q/raw-4.webp' };

extend(THREE as never);

// ── Post-processing: indigo scan + bloom ────────────────────────────────
function PostProcessing({
  strength = 1, threshold = 1, fullScreenEffect = true,
}: { strength?: number; threshold?: number; fullScreenEffect?: boolean }) {
  const { gl, scene, camera } = useThree();
  const progressRef = useRef<{ value: number }>({ value: 0 });

  const render = useMemo(() => {
    const pp = new (THREE as never as Record<string, new (...a: unknown[]) => never>).PostProcessing(gl as never);
    const scenePass       = pass(scene, camera);
    const scenePassColor  = scenePass.getTextureNode('output');
    const bloomPass       = bloom(scenePassColor, strength, 0.5, threshold);

    const uScanProgress = uniform(0);
    progressRef.current = uScanProgress;

    const uvY      = uv().y;
    const scanLine = smoothstep(0, float(0.05), abs(uvY.sub(float(uScanProgress.value))));

    // indigo scan overlay instead of red
    const indigoOverlay = vec3(0.5, 0.55, 1.0).mul(oneMinus(scanLine)).mul(0.35);

    const withScan = mix(
      scenePassColor,
      add(scenePassColor, indigoOverlay),
      fullScreenEffect ? smoothstep(0.9, 1.0, oneMinus(scanLine)) : 1.0,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pp as any).outputNode = withScan.add(bloomPass);
    return pp;
  }, [camera, gl, scene, strength, threshold, fullScreenEffect]);

  useFrame(({ clock }) => {
    progressRef.current.value = Math.sin(clock.getElapsedTime() * 0.5) * 0.5 + 0.5;
    (render as never as { renderAsync: () => void }).renderAsync();
  }, 1);

  return null;
}

// ── 3-D scene mesh ──────────────────────────────────────────────────────
const W = 300, H = 300;

function SceneMesh() {
  const [rawMap, depthMap] = useTexture([TEXTUREMAP.src, DEPTHMAP.src]);
  const meshRef = useRef<Mesh>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => { if (rawMap && depthMap) setVisible(true); }, [rawMap, depthMap]);

  const { material, uniforms } = useMemo(() => {
    const uPointer  = uniform(new THREE.Vector2(0));
    const uProgress = uniform(0);

    const tDepthMap = texture(depthMap);
    const tMap      = texture(rawMap, uv().add(tDepthMap.r.mul(uPointer).mul(0.01)));

    const tUv    = vec2(uv().x.mul(float(W).div(H)), uv().y);
    const tiling = vec2(120.0);
    const tiledUv = mod(tUv.mul(tiling), 2.0).sub(1.0);

    const brightness = mx_cell_noise_float(tUv.mul(tiling).div(2));
    const dist       = float(tiledUv.length());
    const dot        = float(smoothstep(0.5, 0.49, dist)).mul(brightness);
    const flow       = oneMinus(smoothstep(0, 0.02, abs(tDepthMap.r.sub(uProgress))));

    // indigo/blue glow instead of red
    const mask  = dot.mul(flow).mul(vec3(2, 3, 10));
    const final = blendScreen(tMap, mask);

    const mat = new (THREE as never as Record<string, new (p: object) => never>).MeshBasicNodeMaterial({
      colorNode: final,
      transparent: true,
      opacity: 0,
    });

    return { material: mat, uniforms: { uPointer, uProgress } };
  }, [rawMap, depthMap]);

  const [w, h] = useAspect(W, H);

  useFrame(({ clock }) => {
    uniforms.uProgress.value = Math.sin(clock.getElapsedTime() * 0.5) * 0.5 + 0.5;
    const mat = meshRef.current?.material as never as { opacity: number } | null;
    if (mat) mat.opacity = THREE.MathUtils.lerp(mat.opacity, visible ? 1 : 0, 0.07);
  });

  useFrame(({ pointer }) => { uniforms.uPointer.value = pointer; });

  return (
    <mesh ref={meshRef} scale={[w * 0.42, h * 0.42, 1]} material={material as never}>
      <planeGeometry />
    </mesh>
  );
}

// ── Fallback for non-WebGPU browsers ───────────────────────────────────
function StaticFallback() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900" />
  );
}

// ── Hero page ───────────────────────────────────────────────────────────
interface HeroPageProps {
  onEnter: () => void;
}

const TITLE_WORDS = ['Smart', 'Procurement'];
const SUBTITLE    = 'AI-powered sourcing. Zero guesswork.';

export default function HeroPage({ onEnter }: HeroPageProps) {
  const [visibleWords,    setVisibleWords]    = useState(0);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [btnVisible,      setBtnVisible]      = useState(false);
  const [delays,          setDelays]          = useState<number[]>([]);
  const [webgpuOk,        setWebgpuOk]        = useState<boolean | null>(null);

  // randomise glitch delays client-side
  useEffect(() => {
    setDelays(TITLE_WORDS.map(() => Math.random() * 0.07));
    // Check WebGPU
    setWebgpuOk('gpu' in navigator);
  }, []);

  // Staggered word reveal
  useEffect(() => {
    if (visibleWords < TITLE_WORDS.length) {
      const t = setTimeout(() => setVisibleWords(v => v + 1), 600);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => setSubtitleVisible(true), 700);
    const t2 = setTimeout(() => setBtnVisible(true), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [visibleWords]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">

      {/* Text overlay — pointer-events-none so canvas receives mouse events */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-start justify-center px-12 md:px-20 gap-5">
        <div className="text-[clamp(3rem,8vw,7rem)] font-black uppercase leading-none tracking-tight">
          <div className="flex flex-col gap-1 text-white">
            {TITLE_WORDS.map((word, i) => (
              <span
                key={i}
                className={i < visibleWords ? 'hero-fade-in' : 'opacity-0'}
                style={{ animationDelay: `${i * 0.13 + (delays[i] ?? 0)}s` }}
              >
                {word}
              </span>
            ))}
          </div>
        </div>

        <p className="text-base md:text-xl font-medium text-white/60 tracking-widest uppercase">
          <span className={subtitleVisible ? 'hero-fade-in' : 'opacity-0'}>
            {SUBTITLE}
          </span>
        </p>
      </div>

      {/* Enter button — pointer-events-auto explicitly */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={onEnter}
          className={`hero-enter-btn ${btnVisible ? 'hero-fade-in' : 'opacity-0'}`}
          aria-label="Enter the platform"
        >
          Enter
          <span className="hero-arrow-icon">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none" className="hero-arrow-svg">
              <path d="M11 5V17" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M6 12L11 17L16 12" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </span>
        </button>
      </div>

      {/* ChainIQ badge top-left */}
      <div className="absolute top-6 left-8 z-20 flex items-center gap-2.5 opacity-0 hero-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-indigo-900/50">
          C
        </div>
        <span className="text-white/70 text-sm font-semibold tracking-widest uppercase">ChainIQ</span>
      </div>

      {/* WebGPU Canvas — shown only on supported browsers */}
      {webgpuOk === false ? (
        <StaticFallback />
      ) : (
        <Canvas
          flat
          className="absolute inset-0 z-0"
          gl={async (props) => {
            const renderer = new (THREE as never as Record<string, new (p: object) => never>).WebGPURenderer(props as object);
            await (renderer as never as { init: () => Promise<void> }).init();
            return renderer as never;
          }}
        >
          <PostProcessing fullScreenEffect />
          <Suspense fallback={null}>
            <SceneMesh />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
