import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import React, { useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface DotGlobeHeroProps {
  rotationSpeed?: number;
  globeRadius?: number;
  className?: string;
  children?: React.ReactNode;
}

const Globe: React.FC<{ rotationSpeed: number; radius: number }> = ({
  rotationSpeed,
  radius,
}) => {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed;
      groupRef.current.rotation.x += rotationSpeed * 0.3;
      groupRef.current.rotation.z += rotationSpeed * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer wireframe — red tint */}
      <mesh>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshBasicMaterial
          color="#dc2626"
          transparent
          opacity={0.12}
          wireframe
        />
      </mesh>
      {/* Inner glow sphere */}
      <mesh>
        <sphereGeometry args={[radius * 0.97, 24, 24]} />
        <meshBasicMaterial
          color="#ef4444"
          transparent
          opacity={0.04}
          wireframe={false}
        />
      </mesh>
    </group>
  );
};

export const DotGlobeHero = React.forwardRef<HTMLDivElement, DotGlobeHeroProps>(
  (
    {
      rotationSpeed = 0.005,
      globeRadius = 1,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative w-full h-screen bg-black overflow-hidden",
          className
        )}
        {...props}
      >
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          {children}
        </div>

        {/* Three.js Globe */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Canvas>
            <PerspectiveCamera makeDefault position={[0, 0, 3]} fov={75} />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <Globe rotationSpeed={rotationSpeed} radius={globeRadius} />
          </Canvas>
        </div>
      </div>
    );
  }
);

DotGlobeHero.displayName = "DotGlobeHero";
