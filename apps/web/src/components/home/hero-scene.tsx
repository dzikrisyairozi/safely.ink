'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { R, layPages, pageTexture, rand, type Page } from './pangolin-pages';

const FOV = 36;
const CAMERA_Z = 9;

// Reused every frame instead of allocating hundreds of objects 60 times a second.
const scratch = {
  matrix: new THREE.Matrix4(),
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  flutter: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  axis: new THREE.Vector3(1, 0, 0),
};

function cssColor(name: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return new THREE.Color(value || '#14182b');
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

const SIZES = {
  mobile: { w: 0.4, l: 0.5 },
  desktop: { w: 0.3, l: 0.38 },
};

/**
 * Centres and sizes the ball on the flat mark's box in the hero
 * (`[data-hero-anchor]`), so it sits in the layout like any other element.
 */
function useAnchor(group: React.RefObject<THREE.Group>, mark: Element) {
  const { size } = useThree();
  useEffect(() => {
    const host = mark.closest('section');
    if (!host || !group.current) return;
    const fit = () => {
      const box = mark.getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      const height = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
      const width = height * (frame.width / frame.height);
      const cx = (box.left + box.width / 2 - frame.left) / frame.width;
      const cy = (box.top + box.height / 2 - frame.top) / frame.height;
      group.current?.position.set((cx - 0.5) * width, (0.5 - cy) * height, 0);
      group.current?.scale.setScalar(
        ((box.width / frame.width) * width) / (2 * R * 1.35),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [group, mark, size]);
}

function RolledPangolin({
  mark,
  mobile,
  progress,
}: {
  mark: Element;
  mobile: boolean;
  progress: React.RefObject<number>;
}) {
  const pagesMesh = useRef<THREE.InstancedMesh>(null);
  const anchor = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const roll = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  // Our own clock: R3F resets its clock whenever the frameloop restarts, which
  // would replay the pages flying in each time the hero scrolls back into view.
  const elapsed = useRef(0);
  const size = SIZES[mobile ? 'mobile' : 'desktop'];
  const pages = useMemo(() => layPages(size), [size]);
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(size.w, size.l),
    [size],
  );
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: pageTexture(),
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [],
  );
  // R3F only disposes what it creates itself, not objects passed in as args.
  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // The trap: one page on the side facing the viewer, in the reviewer's red.
  const trap = useMemo(() => {
    const view = new THREE.Vector3(0.9, 0.3, 0.5).normalize();
    const score = (p: Page) => p.target.clone().normalize().dot(view);
    return pages.reduce(
      (best, p, i) => (score(p) > score(pages[best]!) ? i : best),
      0,
    );
  }, [pages]);

  useAnchor(anchor, mark);

  useEffect(() => {
    const paint = () => {
      const dark = document.documentElement.classList.contains('dark');
      // Pages are always paper: the light background, or the dark foreground.
      const paper = cssColor(dark ? '--foreground' : '--background');
      const red = paper.clone().lerp(cssColor('--destructive'), 0.85);
      const color = new THREE.Color();
      pages.forEach((_, i) => {
        color.copy(paper).multiplyScalar(0.88 + rand(i, 10) * 0.14);
        pagesMesh.current?.setColorAt(i, i === trap ? red : color);
      });
      if (pagesMesh.current?.instanceColor) {
        pagesMesh.current.instanceColor.needsUpdate = true;
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
  }, [pages, trap]);

  useFrame((_, frameDelta) => {
    const mesh = pagesMesh.current;
    if (!mesh || !tilt.current || !roll.current) return;
    // Capped, so the first frame after a hidden tab does not jump.
    const delta = Math.min(frameDelta, 0.25);
    const time = (elapsed.current += delta);
    const scatter = progress.current ?? 0;

    // The ball rolls slowly along its spine and leans towards the pointer.
    roll.current.rotation.z -= delta * 0.12;
    tilt.current.rotation.y = THREE.MathUtils.lerp(
      tilt.current.rotation.y,
      -1.4 + pointer.current.x * 0.35,
      0.05,
    );
    tilt.current.rotation.x = THREE.MathUtils.lerp(
      tilt.current.rotation.x,
      0.3 + pointer.current.y * 0.15,
      0.05,
    );

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]!;
      const arrive = easeOut((time - p.delay) / 1.3);
      // Scrolling the hero away blows the pages loose again.
      const leave = easeOut(scatter * p.drift);
      const settle = arrive * (1 - leave);
      scratch.position.lerpVectors(p.from, p.target, settle);
      scratch.quaternion.slerpQuaternions(p.fromTurn, p.turn, settle);
      // Settled pages breathe a little, like paper in a draught.
      scratch.flutter.setFromAxisAngle(
        scratch.axis,
        Math.sin(time * 1.6 + p.phase) * 0.06 * settle,
      );
      scratch.quaternion.multiply(scratch.flutter);
      // Pages grow as they arrive and shrink away as they leave, so none
      // reaches the edge of the section.
      scratch.scale.setScalar((0.3 + 0.7 * arrive) * (1 - leave) + 1e-4);
      scratch.matrix.compose(
        scratch.position,
        scratch.quaternion,
        scratch.scale,
      );
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={anchor}>
      <group ref={tilt}>
        <group ref={roll}>
          <instancedMesh
            ref={pagesMesh}
            args={[geometry, material, pages.length]}
            frustumCulled={false}
          />
        </group>
      </group>
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
  // The flat mark the ball sits on. Without it there is nowhere to put the
  // ball, so nothing renders and the mark stays.
  const mark = useMemo(() => document.querySelector('[data-hero-anchor]'), []);

  useEffect(() => {
    const el = wrapper.current;
    if (!el || !mark) return;
    let visible = true;
    // Pages start to blow away only once the ball's own box scrolls past
    // the top of the screen, so on a phone, where it sits below the text,
    // scrolling down to it does not break it up.
    const onScroll = () => {
      if (!visible) return;
      const box = mark.getBoundingClientRect();
      progress.current = Math.min(Math.max(-box.top / box.height, 0), 1);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      setInView(visible);
      onScroll();
    });
    io.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [mark]);

  if (!mark) return null;

  return (
    <div ref={wrapper} className="absolute inset-0">
      <Canvas
        dpr={[1, mobile ? 1.5 : 2]}
        camera={{ position: [0, 0, CAMERA_Z], fov: FOV }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={() => onReady()}
        frameloop={inView ? 'always' : 'never'}
      >
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 5, 6]} intensity={2.4} />
        <directionalLight position={[-5, -1, -3]} intensity={0.5} />
        <RolledPangolin mark={mark} mobile={mobile} progress={progress} />
      </Canvas>
    </div>
  );
}
