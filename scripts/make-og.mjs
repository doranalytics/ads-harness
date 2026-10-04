// The share card: app/opengraph-image.png (1200×630). Set BRAND_NAME in the
// environment to put your name on it; run `npm run assets`.
import sharp from 'sharp';

const BRAND = '#406cb8';
const DEEP = '#10233c';
const NAME = (process.env.NEXT_PUBLIC_BRAND_NAME || 'harness').replace(/[<&>"]/g, '');

const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND}" stop-opacity="0.7"/>
      <stop offset="1" stop-color="${DEEP}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="${DEEP}"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1030" cy="315" r="90" fill="none" stroke="#fff9f2" stroke-width="24"/>
  <circle cx="1030" cy="315" r="34" fill="#fff9f2"/>
  <text x="120" y="300" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="104" fill="#fff9f2">${NAME}</text>
  <text x="122" y="372" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#e6edf7">instagram → ads, one feed</text>
  <text x="122" y="428" font-family="Helvetica, Arial, sans-serif" font-size="27" fill="#c7d6ee" opacity="0.85">every post, its numbers, and a button that runs it on Meta</text>
</svg>`);

await sharp(svg).png().toFile('app/opengraph-image.png');
console.log('app/opengraph-image.png written (1200×630)');
