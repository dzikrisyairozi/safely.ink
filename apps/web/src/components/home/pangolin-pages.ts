import * as THREE from 'three';

// A pangolin rolled up in defence (volvation), made of document pages. The
// curled back is a ball: pages lie on it in rows across the spine, like scales,
// each with its far edge lifted towards the tail. The tail wraps over the
// outside as a raised band that tapers to a tip, hiding the tucked-in head.
export const R = 1.55;

// Lifts a page's far edge: a turn about its own short axis.
const EDGE = new THREE.Vector3(1, 0, 0);

export type Page = {
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
export const rand = (i: number, k: number) => {
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
    .multiply(new THREE.Quaternion().setFromAxisAngle(EDGE, lift));
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

export function layPages(size: { w: number; l: number }): Page[] {
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
export function pageTexture() {
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
