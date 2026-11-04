"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export class ErroApi extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** POST em JSON para as rotas do app; erro vira ErroApi com mensagem legível. */
export async function postar<T = unknown>(url: string, corpo: unknown = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi("Sem conexão. Confere a internet e tenta de novo.", 0);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(j.erro ?? "Não deu certo. Tenta de novo.", r.status);
  return j as T;
}

/**
 * Dados de uma tela "ao vivo": busca e repete a cada `intervalo` ms enquanto
 * a aba está aberta e visível. O servidor responde vazio (204) se nada mudou,
 * então é leve. `recarregar()` busca na hora (use depois de uma ação).
 */
export function useTela<T>(url: string | null, intervalo = 2500) {
  const router = useRouter();
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const versao = useRef<number | null>(null);
  const ocupado = useRef(false);
  const urlAtual = useRef(url);

  const buscar = useCallback(
    async (forcar = false) => {
      if (!url || (ocupado.current && !forcar)) return;
      ocupado.current = true;
      try {
        const sep = url.includes("?") ? "&" : "?";
        const v = !forcar && versao.current !== null ? `${sep}v=${versao.current}` : "";
        const r = await fetch(url + v, { cache: "no-store" });
        if (urlAtual.current !== url) return; // trocou de tela no meio
        if (r.status === 204) return;
        if (r.status === 401) {
          router.replace("/entrar");
          return;
        }
        const j = await r.json().catch(() => null);
        if (!r.ok || !j) {
          setErro(j?.erro ?? "Não deu pra carregar");
          return;
        }
        versao.current = j.versao;
        setErro(null);
        setDados(j.dados as T);
      } catch {
        // sem internet: tenta de novo no próximo ciclo
      } finally {
        ocupado.current = false;
      }
    },
    [url, router],
  );

  useEffect(() => {
    urlAtual.current = url;
    versao.current = null;
    setDados(null);
    buscar(true);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") buscar();
    }, intervalo);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [url, intervalo, buscar]);

  const recarregar = useCallback(() => buscar(true), [buscar]);
  return { dados, erro, recarregar };
}
