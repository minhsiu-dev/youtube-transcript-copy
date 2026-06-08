import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = 'src/icons';

const ENABLED_BG = '#FF0033';
const DISABLED_BG = '#808080';
const GLYPH = '#FFFFFF';

// All SVGs use a fixed 128-unit viewBox so geometry is defined once;
// sharp scales to the requested output size on rasterization.
//
// "CC" is drawn as two stroked SVG arc paths (no <text>, no font lookup),
// so output is identical across machines regardless of installed fonts.
//
// Arc-flag note: each "C" goes from a top-right endpoint to a bottom-right
// endpoint along the LONG arc (large-arc-flag = 1) going visually
// counter-clockwise — through the left side — to form the C bowl
// (sweep-flag = 0). If a C ever renders as a wedge on the right instead of
// a C on the left, flip sweep-flag from 0 to 1.

// Variant A — captions frame + "CC" (used for sizes 32, 48, 128).
// Frame: rect (24,34) 80x60, rx=12, stroke 8, white, no fill.
// CC: two C-arcs, centers (48, 64) and (80, 64), radius 14, stroke 6.
function svgWithFrame(size, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="23" fill="${bg}"/>
  <rect x="24" y="34" width="80" height="60" rx="12" fill="none" stroke="${GLYPH}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M 58.7 55 A 14 14 0 1 0 58.7 73" fill="none" stroke="${GLYPH}" stroke-width="6" stroke-linecap="round"/>
  <path d="M 90.7 55 A 14 14 0 1 0 90.7 73" fill="none" stroke="${GLYPH}" stroke-width="6" stroke-linecap="round"/>
</svg>`;
}

// Variant B — no frame, larger "CC" (used for size 16 only).
// At 16px output the frame outline crowds "CC" below legibility; the
// glyph alone reads better. Centers (36, 64) and (92, 64), radius 18,
// stroke 12, with a slightly smaller opening angle (~35°) for chunkier
// C shapes that survive 8x downscaling.
function svgPlain(size, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="23" fill="${bg}"/>
  <path d="M 50.7 53.7 A 18 18 0 1 0 50.7 74.3" fill="none" stroke="${GLYPH}" stroke-width="12" stroke-linecap="round"/>
  <path d="M 106.7 53.7 A 18 18 0 1 0 106.7 74.3" fill="none" stroke="${GLYPH}" stroke-width="12" stroke-linecap="round"/>
</svg>`;
}

function svgFor(size, bg) {
  return size === 16 ? svgPlain(size, bg) : svgWithFrame(size, bg);
}

async function buildOne(size, bg, suffix) {
  const buffer = Buffer.from(svgFor(size, bg));
  const filename = path.join(OUT_DIR, `icon-${size}${suffix}.png`);
  await sharp(buffer).png().toFile(filename);
  console.log(`  wrote ${filename}`);
}

await mkdir(OUT_DIR, { recursive: true });

console.log('Generating "ready" icons (red)...');
for (const size of SIZES) {
  await buildOne(size, ENABLED_BG, '');
}

console.log('Generating "disabled" icons (gray)...');
for (const size of SIZES) {
  await buildOne(size, DISABLED_BG, '-disabled');
}

console.log('Done.');
