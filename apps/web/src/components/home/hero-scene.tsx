'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// A pangolin rolled up in defence (volvation), made of document pages. The
// curled back is a ball: pages lie on it in rows across the spine, like scales,
// each with its far edge lifted towards the tail. The tail wraps over the
// outside as a raised band that tapers to a tip, hiding the tucked-in head.
const R = 1.55;
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

type Page = {
  target: THREE.Vector3;
  turn: THREE.Quaternion;
  from: THREE.Vector3;
  fromTurn: THREE.Quaternion;
  /** Seconds after mount at which this page starts flying in. */
  delay: number;
  drift: number;
  phase: number;
};

/** A stable pseudo-random number in [0, 1) for page i, channel k. */
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Adds a page at (u, v) on a ball of radius `r`: u runs along the curled
 * spine, v across it. The long side follows the spine, tip towards the tail.
 */
function place(pages: Page[], u: number, v: number, r: number, lift: number) {
  const normal = new THREE.Vector3(
    Math.cos(v) * Math.cos(u),
    Math.cos(v) * Math.sin(u),
    Math.sin(v),
  );
  const along = new THREE.Vector3(-Math.sin(u), Math.cos(u), 0);
  const across = new THREE.Vector3().crossVectors(along, normal);
  const turn = new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, along, normal))
    .multiply(new THREE.Quaternion().setFromAxisAngle(scratch.axis, lift));
  const i = pages.length;
  // Before assembling, each page is somewhere in a loose cloud around the ball.
  const cloud = new THREE.Vector3(
    rand(i, 1) - 0.5,
    rand(i, 2) - 0.5,
    rand(i, 3) - 0.5,
  )
    .normalize()
    .multiplyScalar(R * (1.6 + rand(i, 11) * 1.4));
  pages.push({
    target: normal.clone().multiplyScalar(r),
    turn,
    from: cloud,
    fromTurn: new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rand(i, 4) * 6, rand(i, 5) * 6, rand(i, 6) * 6),
    ),
    delay: (u / (Math.PI * 2)) * 1.1 + rand(i, 7) * 0.6,
    drift: 0.8 + rand(i, 8) * 2,
    phase: rand(i, 9) * Math.PI * 2,
  });
}

function layPages(size: { w: number; l: number }): Page[] {
  const pages: Page[] = [];
  // The back: rows across the spine all the way round the ball. Towards the
  // flanks the rows crowd together, so some are left out there.
  const du = (size.l * 0.62) / R;
  const dv = (size.w * 0.7) / R;
  const rows = Math.round((Math.PI * 2) / du);
  for (let row = 0; row < rows; row++) {
    const u = (row / rows) * Math.PI * 2;
    for (let v = -Math.PI / 2 + dv; v < Math.PI / 2 - dv / 2; v += dv) {
      const vv = v + (row % 2) * (dv / 2);
      const keepEvery = Math.max(
        1,
        Math.round(1 / Math.max(Math.cos(vv), 0.2)),
      );
      if (row % keepEvery) continue;
      place(pages, u, vv, R + row * 0.0004, 0.34);
    }
  }
  // The tail: a band over the outside along the spine, narrowing to a tip.
  const start = 0.2 * Math.PI;
  const span = 0.95 * Math.PI;
  const tailRows = Math.round(span / (du * 1.05));
  for (let row = 0; row <= tailRows; row++) {
    const k = row / tailRows;
    const half = (0.42 - 0.34 * k) * R;
    const count = Math.max(1, Math.round((2 * half) / (size.w * 0.8)));
    for (let c = 0; c < count; c++) {
      const offset = count === 1 ? 0 : -half + (c / (count - 1)) * 2 * half;
      place(pages, start + k * span, offset / R, R * 1.17 + row * 0.0006, 0.4);
    }
  }
  return pages;
}

/** A page: paper, a darker edge, a heading bar and lines of text. */
function pageTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 96, 128);
  ctx.strokeStyle = '#9095a5';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 93, 125);
  ctx.fillStyle = '#7d8292';
  ctx.fillRect(12, 14, 46, 7);
  ctx.fillStyle = '#c3c6cf';
  for (let y = 32; y < 116; y += 9) ctx.fillRect(12, y, 72 - ((y * 7) % 22), 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

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
