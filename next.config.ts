import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const dev = process.env.NODE_ENV !== "production";

// No modo dev, deixa abrir o site por 127.0.0.1 e pelo IP do PC na Wi-Fi
// (pra testar no celular). Não afeta a Vercel.
const ipsLocais = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4")
  .map((i) => i!.address);

// Content-Security-Policy: o navegador só carrega scripts, estilos, imagens e
// conexões do próprio site. Bloqueia código injetado de fora e impede que o
// site seja aberto dentro de outro (clickjacking). 'unsafe-inline' é exigido
// pelos scripts de inicialização do Next nas páginas estáticas.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // (https já é forçado pela Vercel com HSTS; upgrade-insecure-requests quebraria o teste local)
].join("; ");

const segurancaGeral = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // app privado da turma: fora do Google e afins
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // não anuncia "Next.js" nas respostas
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  allowedDevOrigins: ["127.0.0.1", ...ipsLocais],
  // Postgres embutido (só usado no seu PC) roda no Node, sem empacotar
  serverExternalPackages: ["@electric-sql/pglite"],
  // as migrations (.sql) vão junto com as rotas da API na Vercel
  outputFileTracingIncludes: {
    "/api/**/*": ["./db/migracoes/**/*"],
  },
  async rewrites() {
    // verificação do app Android (TWA)
    return [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: segurancaGeral },
      {
        // respostas da API têm dados pessoais: nunca guardar em cache
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        // o service worker precisa ser sempre buscado de novo
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
