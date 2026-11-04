import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Servido em /.well-known/assetlinks.json (veja next.config.ts).
// Prova pro Android que o APK é deste site: aí o app abre em tela cheia,
// sem barra de endereço. Os dados vêm das variáveis da Vercel:
//   ANDROID_PACKAGE  ex.: app.vercel.semsumicu.twa
//   ANDROID_SHA256   a "SHA-256 fingerprint" da chave do APK (pode ter mais de uma, separadas por vírgula)
export function GET() {
  const pacote = process.env.ANDROID_PACKAGE?.trim();
  const digitais = (process.env.ANDROID_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!pacote || !digitais.length) return NextResponse.json([], { status: 404 });
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pacote, sha256_cert_fingerprints: digitais },
    },
  ]);
}
