import { NextResponse, type NextRequest } from "next/server";

// rotas abertas para quem ainda não entrou
const PUBLICAS = ["/entrar", "/convite", "/api"];

// Sem cookie de sessão → manda pra tela de entrada. (A sessão de verdade é
// conferida no banco por cada rota da API.)
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
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
    "/((?!_next/static|_next/image|icons/|sw.js|manifest.webmanifest|offline.html|icon.png|apple-icon.png|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
