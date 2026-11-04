import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// No modo dev, deixa abrir o site por 127.0.0.1 e pelo IP do PC na Wi-Fi
// (pra testar no celular). Não afeta a Vercel.
const ipsLocais = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4")
  .map((i) => i!.address);

const nextConfig: NextConfig = {
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
