import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = 'src/icons';

function svg(size, bg) {
  const fontSize = Math.round(size * 0.68);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${bg}"/>
    <text x="50%" y="50%" font-family="Helvetica, Arial, sans-serif" font-weight="700"
          font-size="${fontSize}" fill="#fff" text-anchor="middle"
          dominant-baseline="central">T</text>
  </svg>`;
}

async function buildOne(size, bg, suffix) {
  const buffer = Buffer.from(svg(size, bg));
  const filename = path.join(OUT_DIR, `icon-${size}${suffix}.png`);
  await sharp(buffer).png().toFile(filename);
  console.log(`  wrote ${filename}`);
}

await mkdir(OUT_DIR, { recursive: true });

console.log('Generating "ready" icons (red)...');
for (const size of SIZES) {
  await buildOne(size, '#ff0033', '');
}

console.log('Generating "disabled" icons (gray)...');
for (const size of SIZES) {
  await buildOne(size, '#808080', '-disabled');
}

console.log('Done.');
