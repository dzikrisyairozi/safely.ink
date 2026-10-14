'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const RADIUS = 1.55;
// Reused every frame instead of allocating 260 matrices 60 times a second.
const scratch = { matrix: new THREE.Matrix4(), offset: new THREE.Vector3() };
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** One scale: a shield with its tip along +y, centred on the origin. */
function scaleGeometry(width: number, length: number) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.quadraticCurveTo(-width / 2, length * 0.75, 0, length);
  s.quadraticCurveTo(width / 2, length * 0.75, width / 2, 0);
  s.quadraticCurveTo(0, -length * 0.25, -width / 2, 0);
  const geometry = new THREE.ShapeGeometry(s, 6);
  geometry.translate(0, -length / 2, 0);
  return geometry;
}

/** Faint ruled lines, so each scale reads as a scrap of a page. */
function clauseTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#b8b8b8';
  for (let y = 30; y < 110; y += 16) ctx.fillRect(26, y, 76 - (y % 3) * 8, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cssColor(name: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return new THREE.Color(value || '#14182b');
}

type Placement = { dir: THREE.Vector3; basis: THREE.Matrix4; drift: number };

/** Scales spread evenly over a sphere, tips pointing down towards the tail. */
function placements(count: number): Placement[] {
  const down = new THREE.Vector3(0, -1, 0);
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const dir = new THREE.Vector3(
      Math.cos(i * GOLDEN_ANGLE) * r,
      y,
      Math.sin(i * GOLDEN_ANGLE) * r,
    );
    const tangent = down.clone().sub(dir.clone().multiplyScalar(down.dot(dir)));
    if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
    tangent.normalize();
    const x = new THREE.Vector3().crossVectors(tangent, dir);
    const basis = new THREE.Matrix4()
      .makeBasis(x, tangent, dir)
      // Lift the tip off the surface, like a pine cone.
      .multiply(new THREE.Matrix4().makeRotationX(-0.38));
    return { dir, basis, drift: 0.15 + ((i * 7919) % 100) / 180 };
  });
}

function Ball({
  count,
  progress,
}: {
  count: number;
  progress: React.RefObject<number>;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const items = useMemo(() => placements(count), [count]);
  const geometry = useMemo(() => scaleGeometry(0.5, 0.58), []);
  const texture = useMemo(() => clauseTexture(), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.65,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    [texture],
  );
  // The trap: the scale that faces the viewer, in the reviewer's red.
  const trap = useMemo(() => {
    const view = new THREE.Vector3(0.35, 0.2, 1).normalize();
    return items.reduce(
      (best, item, i) =>
        item.dir.dot(view) > items[best]!.dir.dot(view) ? i : best,
      0,
    );
  }, [items]);

  useEffect(() => {
    const paint = () => {
      const ink = cssColor('--foreground');
      const faded = cssColor('--muted-foreground');
      const red = cssColor('--destructive');
      const color = new THREE.Color();
      for (let i = 0; i < count; i++) {
        // Each scale a little lighter or darker, so the tiles separate.
        color.copy(ink).lerp(faded, ((i * 37) % 100) / 260);
        mesh.current?.setColorAt(i, i === trap ? red : color);
      }
      if (mesh.current?.instanceColor) {
        mesh.current.instanceColor.needsUpdate = true;
      }
    };
    paint();
    // Repaint when the theme class on <html> changes.
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', move);
    };
  }, [count, trap]);

  useFrame((_, delta) => {
    if (!mesh.current || !group.current) return;
    const p = progress.current ?? 0;
    const g = group.current;
    g.rotation.y += delta * (0.12 + pointer.current.x * 0.4);
    g.rotation.x = THREE.MathUtils.lerp(
      g.rotation.x,
      pointer.current.y * 0.25 + p * 0.6,
      0.05,
    );
    for (let i = 0; i < items.length; i++) {
      const { dir, basis, drift } = items[i]!;
      // Scrolling unrolls the ball: scales lift away, each at its own pace.
      scratch.offset.copy(dir).multiplyScalar(RADIUS + p * drift);
      scratch.matrix.copy(basis).setPosition(scratch.offset);
      mesh.current.setMatrixAt(i, scratch.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    (mesh.current.material as THREE.Material).opacity = 1 - p * 0.7;
  });

  return (
    <group ref={group} rotation={[0.25, 0, 0.1]}>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, count]}
        frustumCulled={false}
      />
    </group>
  );
}

export default function HeroScene({ onReady }: { onReady: () => void }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  // Nothing is rendered while the hero is scrolled out of view.
  const [inView, setInView] = useState(true);
  const mobile = useMemo(
    () => window.matchMedia('(max-width: 767px)').matches,
    [],
  );

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const onScroll = () => {
      const hero = el.closest('section');
      const height = hero?.offsetHeight ?? window.innerHeight;
      progress.current = Math.min(Math.max(window.scrollY / height, 0), 1);
    };
    const io = new IntersectionObserver(([entry]) => {
      setInView(entry?.isIntersecting ?? true);
    });
    io.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div ref={wrapper} className="pointer-events-none absolute inset-0">
      <Canvas
        dpr={[1, mobile ? 1.5 : 2]}
        camera={{ position: [0, 0, 6], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={() => onReady()}
        frameloop={inView ? 'always' : 'never'}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 4, 5]} intensity={3.2} />
        <directionalLight position={[-4, -2, -3]} intensity={0.6} />
        <Ball count={mobile ? 140 : 260} progress={progress} />
      </Canvas>
    </div>
  );
}
