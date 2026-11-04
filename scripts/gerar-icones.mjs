// Gera os ícones do PWA a partir de um SVG. Uso: npm run icons
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const espada =
  "M50 8 C50 8 88 40 88 60 C88 76 72 84 58 76 C60 84 64 90 70 94 L30 94 C36 90 40 84 42 76 C28 84 12 76 12 60 C12 40 50 8 50 8 Z";

// escala = quanto do quadro a arte ocupa (maskable precisa de margem)
function svg(escala, cantos) {
  const s = escala;
  const o = (1 - s) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${cantos}" fill="#0A0A0A"/>
  <g transform="translate(${o} ${o}) scale(${s})">
    <rect x="24" y="24" width="464" height="464" rx="96" fill="#151515" stroke="#39FF14" stroke-width="10"/>
    <g transform="translate(106 70) scale(3)">
      <path d="${espada}" fill="#39FF14"/>
    </g>
    <circle cx="372" cy="372" r="62" fill="#FFB31A" stroke="#0A0A0A" stroke-width="10"/>
    <circle cx="372" cy="372" r="36" fill="none" stroke="#0A0A0A" stroke-width="8" stroke-dasharray="14 10"/>
  </g>
</svg>`;
}

const normal = Buffer.from(svg(1, 112));
const maskable = Buffer.from(svg(0.78, 0));

await sharp(normal).resize(192).png().toFile("public/icons/icon-192.png");
await sharp(normal).resize(512).png().toFile("public/icons/icon-512.png");
await sharp(maskable).resize(512).png().toFile("public/icons/maskable-512.png");
await sharp(maskable).resize(180).png().toFile("app/apple-icon.png");
await sharp(normal).resize(64).png().toFile("app/icon.png");
writeFileSync("public/icons/icon.svg", normal);
console.log("ícones gerados");
