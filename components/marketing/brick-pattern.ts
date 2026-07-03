/* ── Premium CSS brick wall pattern ── */
/* Uses box-shadow to paint individual bricks with 3D shading */
/* No external images, works in all themes */

const BRICK_W = 104;
const BRICK_H = 38;
const BRICK_R = 3;
const MORTAR = 4;
const PALETTE = [
  "#A84732", "#B85C3E", "#C1624A", "#C87956",
  "#D48665", "#953A2A", "#6B3A2A", "#8B4A3A",
];

function makeTile(w: number, h: number): { css: string; w: number; h: number } {
  const bw = BRICK_W, bh = BRICK_H, mg = MORTAR;
  const half = Math.round((bw + mg) / 2); // offset for running bond

  // Collect all brick positions in one tile
  type B = { x: number; y: number; fill: string };
  const bricks: B[] = [];

  // Row 1
  const c1 = Math.ceil(w / (bw + mg)) + 1;
  for (let i = 0; i < c1; i++) {
    bricks.push({ x: mg + i * (bw + mg), y: mg, fill: PALETTE[i % PALETTE.length] });
  }
  // Row 2 (offset)
  const c2 = Math.ceil((w + half) / (bw + mg)) + 1;
  for (let i = 0; i < c2; i++) {
    bricks.push({ x: mg + i * (bw + mg) - half, y: mg + bh + mg, fill: PALETTE[(i + 3) % PALETTE.length] });
  }

  // Each brick generates 6 box-shadow entries:
  // 1. main rect
  // 2. top bevel highlight
  // 3. mid highlight
  // 4. bottom shadow
  // 5. deep bottom shadow
  // 6. colored corner accent (adds depth)

  // We use box-shadow because we can generate all shadows from a single
  // zero-size pseudo element — the browser handles it efficiently.

  // Start with "transparent" base so box-shadow renders
  const shadows: string[] = [];

  for (const b of bricks) {
    // Clamp to tile boundaries for visibility
    if (b.x + bw < 0 || b.x > w) continue;

    const rx = b.x, ry = b.y;

    // Main brick body
    shadows.push(`${rx}px ${ry}px 0 0 ${b.fill}`);

    // Top bevel highlight (lighter strip on top)
    shadows.push(`${rx + 2}px ${ry + 2}px 0 0 rgba(255,255,255,0.09)`);

    // Bottom bevel shadow
    shadows.push(`${rx + 2}px ${ry + bh - 8}px 0 0 rgba(0,0,0,0.18)`);

    // Deep bottom edge
    shadows.push(`${rx + 2}px ${ry + bh - 3}px 0 0 rgba(0,0,0,0.07)`);

    // Inner shadow effect: darker left edge
    shadows.push(`${rx}px ${ry + 4}px 3px -2px rgba(0,0,0,0.06)`);
  }

  return {
    css: shadows.join(","),
    w,
    h,
  };
}

const TILE = makeTile(320, 88);

export const BRICK_CSS = TILE.css;
export const BRICK_TILE = { w: TILE.w, h: TILE.h };
