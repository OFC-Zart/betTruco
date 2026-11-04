import { NextResponse, type NextRequest } from "next/server";

// rotas abertas para quem ainda não entrou
const PUBLICAS = ["/entrar", "/convite", "/api"];

// Sem cookie de sessão → manda pra tela de entrada. (A sessão de verdade é
// conferida no banco por cada rota da API.)
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Ações (POST etc.) só aceitam pedidos vindos do próprio site: um site
  // malicioso não consegue apostar/apagar nada em nome de quem está logado.
  if (path.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD") {
    const origem = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let mesmoSite = false;
    try {
      mesmoSite = Boolean(origem && host && new URL(origem).host === host);
    } catch {}
    if (!mesmoSite) return NextResponse.json({ erro: "Pedido de origem não permitida" }, { status: 403 });
  }
  if (PUBLICAS.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse.next();
  if (!request.cookies.has("resenha_sessao")) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // tudo, menos estáticos, ícones, manifest e service worker
    "/((?!_next/static|_next/image|\\.well-known/|icons/|sw.js|robots.txt|manifest.webmanifest|offline.html|icon.png|apple-icon.png|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
