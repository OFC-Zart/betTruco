"use client";

import { useEffect, useState } from "react";

/** "Agora" que se atualiza sozinho (contagens tipo "confirma em 3h"). */
export function useAgora(intervaloMs = 60_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}
