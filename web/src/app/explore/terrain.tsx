"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { type ComponentRef, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "@/lib/theme";
import type { Field } from "./field";
import styles from "./explore.module.css";

const SPAN = 10; // world units across the grid

// sRGB stops of ColorBrewer RdBu, matching pipeline/distill/deformation.py and the legend.
export const RAMP = [
  [178, 24, 43],
  [214, 96, 77],
  [244, 165, 130],
  [242, 240, 236],
  [146, 197, 222],
  [67, 147, 195],
  [33, 102, 172],
] as const;

const glslRamp = RAMP.map((c, i) => `vec3 c${i} = vec3(${c.map((v) => (v / 255).toFixed(4)).join(", ")});`).join("\n");

const vertexShader = /* glsl */ `
  uniform float uLift;
  uniform float uExaggeration;
  attribute float elev;
  attribute vec2 slope;
  attribute float disp;
  attribute float coh;
  varying vec3 vNormal;
  varying float vDisp;
  varying float vCoh;
  void main() {
    vec3 p = position;
    p.y = elev * uLift;
    vNormal = normalize(vec3(-slope.x * uExaggeration, 1.0, -slope.y * uExaggeration));
    vDisp = disp;
    vCoh = coh;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uBlend;
  uniform float uLimit;
  uniform float uMotion;
  uniform float uCohMin;
  varying vec3 vNormal;
  varying float vDisp;
  varying float vCoh;

  vec3 ramp(float x) {
    ${glslRamp}
    float t = clamp((x + 1.0) * 3.0, 0.0, 6.0);
    if (t < 1.0) return mix(c0, c1, t);
    if (t < 2.0) return mix(c1, c2, t - 1.0);
    if (t < 3.0) return mix(c2, c3, t - 2.0);
    if (t < 4.0) return mix(c3, c4, t - 3.0);
    if (t < 5.0) return mix(c4, c5, t - 4.0);
    return mix(c5, c6, t - 5.0);
  }

  void main() {
    vec3 light = normalize(vec3(-0.55, 0.75, -0.4));
    float shade = 0.6 + 0.4 * max(dot(normalize(vNormal), light), 0.0);
    vec3 ground = vec3(0.955, 0.952, 0.945);
    float trust = smoothstep(uCohMin - 0.05, uCohMin + 0.05, vCoh);
    vec3 motion = ramp(clamp(vDisp * uBlend / uLimit, -1.0, 1.0));
    vec3 color = mix(ground, motion, uMotion * mix(0.15, 1.0, trust));
    gl_FragColor = vec4(color * shade, 1.0);
  }
`;

type Props = {
  field: Field;
  exaggeration: number;
  blend: number;
  showMotion: boolean;
  resetKey: number;
};

function useGeometry(field: Field) {
  return useMemo(() => {
    const { size, pixel_m } = field.meta;
    const n = size * size;
    const position = new Float32Array(n * 3);
    const slope = new Float32Array(n * 2);
    const at = (r: number, c: number) => field.height[Math.min(size - 1, Math.max(0, r)) * size + Math.min(size - 1, Math.max(0, c))];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        position[i * 3] = (c / (size - 1) - 0.5) * SPAN;
        position[i * 3 + 2] = (r / (size - 1) - 0.5) * SPAN;
        slope[i * 2] = (at(r, c + 1) - at(r, c - 1)) / (2 * pixel_m);
        slope[i * 2 + 1] = (at(r + 1, c) - at(r - 1, c)) / (2 * pixel_m);
      }
    }
    const index = new Uint32Array((size - 1) * (size - 1) * 6);
    let k = 0;
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const a = r * size + c;
        index.set([a, a + size, a + 1, a + 1, a + size, a + size + 1], k);
        k += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(position, 3));
    g.setAttribute("elev", new THREE.BufferAttribute(field.height, 1));
    g.setAttribute("slope", new THREE.BufferAttribute(slope, 2));
    g.setAttribute("disp", new THREE.BufferAttribute(field.displacement, 1));
    g.setAttribute("coh", new THREE.BufferAttribute(field.coherence, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    return g;
  }, [field]);
}

/** World units per metre of height at 1x, so 1x keeps true proportions. */
function liftPerMetre(field: Field) {
  return SPAN / (field.meta.extent_km * 1000);
}

function Surface({ field, exaggeration, blend, showMotion }: Omit<Props, "resetKey">) {
  const geometry = useGeometry(field);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uLift: { value: 0 },
      uExaggeration: { value: 1 },
      uBlend: { value: 1 },
      uLimit: { value: field.meta.displacement.limit },
      uMotion: { value: 1 },
      uCohMin: { value: field.meta.coherence.threshold },
    }),
    [field],
  );

  useEffect(() => {
    const u = material.current?.uniforms;
    if (!u) return;
    u.uLift.value = liftPerMetre(field) * exaggeration;
    u.uExaggeration.value = exaggeration;
    u.uBlend.value = blend;
    u.uMotion.value = showMotion ? 1 : 0;
  }, [field, exaggeration, blend, showMotion]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
}

const STEM = 0.9;

function epicenterPoints(field: Field, exaggeration: number) {
  const { size } = field.meta;
  return field.meta.quakes.map((q) => {
    const ground = field.height[Math.round(q.row) * size + Math.round(q.col)] * liftPerMetre(field) * exaggeration;
    return new THREE.Vector3((q.col / (size - 1) - 0.5) * SPAN, ground, (q.row / (size - 1) - 0.5) * SPAN);
  });
}

function Epicenters({ points }: { points: THREE.Vector3[] }) {
  return points.map((p, i) => (
    <group key={i} position={p}>
      <mesh position={[0, STEM / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, STEM, 8]} />
        <meshBasicMaterial color="#2b2b2b" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.07, 0.1, 40]} />
        <meshBasicMaterial color="#2b2b2b" side={THREE.DoubleSide} />
      </mesh>
    </group>
  ));
}

/** Moves DOM labels to the projected stem tops every frame, without React renders. */
function LabelTracker({ points, labels }: { points: THREE.Vector3[]; labels: RefObject<(HTMLSpanElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    points.forEach((p, i) => {
      const el = labels.current[i];
      if (!el) return;
      v.set(p.x, p.y + STEM, p.z).project(camera);
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
      el.style.visibility = v.z < 1 ? "visible" : "hidden";
    });
  });
  return null;
}

const PAN_MIN = new THREE.Vector3(-SPAN / 2, 0, -SPAN / 2);
const PAN_MAX = new THREE.Vector3(SPAN / 2, 0, SPAN / 2);

export function Terrain({ field, exaggeration, blend, showMotion, resetKey }: Props) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const points = useMemo(() => epicenterPoints(field, exaggeration), [field, exaggeration]);
  const background = useTheme() === "dark" ? "#17181a" : "#ffffff";
  useEffect(() => {
    if (resetKey > 0) controls.current?.reset();
  }, [resetKey]);
  return (
    <>
      <Canvas camera={{ position: [0, 8.4, 12], fov: 38, near: 0.05, far: 200 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={[background]} />
        <Surface field={field} exaggeration={exaggeration} blend={blend} showMotion={showMotion} />
        <Epicenters points={points} />
        <LabelTracker points={points} labels={labels} />
        <OrbitControls
          ref={controls}
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          minDistance={3}
          maxDistance={18}
          minPolarAngle={0.05}
          maxPolarAngle={1.35}
          screenSpacePanning={false}
          onChange={(e) => e?.target.target.clamp(PAN_MIN, PAN_MAX)}
        />
      </Canvas>
      {field.meta.quakes.map((q, i) => (
        <span
          key={q.id}
          className={styles.pin}
          ref={(el) => {
            labels.current[i] = el;
          }}
        >
          M{q.magnitude.toFixed(1)} epicenter
        </span>
      ))}
    </>
  );
}
