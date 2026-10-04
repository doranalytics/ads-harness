// App icons drawn from the same ring-and-dot mark the header uses
// (components/app-shell.tsx). Change BRAND to recolour; run `npm run assets`.
import sharp from 'sharp';
import fs from 'node:fs/promises';

export const BRAND = '#406cb8';
const PAPER = '#f8f4f0';

const svg = (size) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="${PAPER}"/>
  <circle cx="12" cy="12" r="6.5" fill="none" stroke="${BRAND}" stroke-width="1.8"/>
  <circle cx="12" cy="12" r="2.5" fill="${BRAND}"/>
</svg>`);

async function tile(size, out) {
  await sharp(svg(size)).png().toFile(out);
}

await fs.mkdir('public/icons', { recursive: true });
await tile(512, 'app/icon.png');
await tile(180, 'app/apple-icon.png');
await tile(192, 'public/icons/icon-192.png');
await tile(512, 'public/icons/icon-512.png');
console.log('icons written: app/icon.png, app/apple-icon.png, public/icons/{192,512}');
