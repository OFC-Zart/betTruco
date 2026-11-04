// Gera os ícones do app a partir da arte do leque de cartas (scripts/arte/cartas.png).
// Uso: npm run icons
import sharp from "sharp";

const ARTE = "scripts/arte/cartas.png";

// recorta só o leque (com um pouco do brilho em volta), achando a área sem preto
const { info } = await sharp(ARTE).trim({ threshold: 40 }).toBuffer({ resolveWithObject: true });
const folga = 24;
const { width: W, height: H } = await sharp(ARTE).metadata();
const left = Math.max(0, -info.trimOffsetLeft - folga);
const top = Math.max(0, -info.trimOffsetTop - folga);
const leque = await sharp(ARTE)
  .extract({
    left,
    top,
    width: Math.min(W - left, info.width + folga * 2),
    height: Math.min(H - top, info.height + folga * 2),
  })
  .toBuffer();

/**
 * Leque centralizado num quadrado preto.
 * `largura`: quanto do quadrado o leque ocupa (o resto é margem).
 * Ícone comum ~84%; iPhone (cantos arredondados) ~78%; Android "maskable"
 * (o sistema corta em círculo/gota) ~66% pra caber na área segura.
 */
async function icone(tamanho, largura, arquivo) {
  const alvo = Math.round(tamanho * largura);
  const pedaco = await sharp(leque).resize({ width: alvo }).toBuffer();
  const { height: h } = await sharp(pedaco).metadata();
  await sharp({ create: { width: tamanho, height: tamanho, channels: 3, background: "#000000" } })
    .composite([{ input: pedaco, left: Math.round((tamanho - alvo) / 2), top: Math.round((tamanho - h) / 2) }])
    .png()
    .toFile(arquivo);
}

await icone(192, 0.84, "public/icons/icon-192.png");
await icone(512, 0.84, "public/icons/icon-512.png");
await icone(512, 0.66, "public/icons/maskable-512.png");
await icone(180, 0.78, "app/apple-icon.png");
await icone(64, 0.94, "app/icon.png");
// leque solto (fundo preto) pra usar na página inicial
await sharp(leque).resize({ width: 720 }).png({ quality: 90 }).toFile("public/marca/leque.png");
console.log("ícones gerados");
