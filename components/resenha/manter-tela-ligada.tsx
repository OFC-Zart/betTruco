"use client";

import { useEffect } from "react";

// vídeo silencioso de reserva (3,7 KB), do pacote nosleep.js (licença MIT)
const VIDEO = "/marca/tela-ligada.mp4";

/** iPhone/iPad antes do 18.4: o Wake Lock existe, mas não faz efeito no app instalado. */
function iosSemWakeLock() {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const v = ua.match(/OS (\d+)_(\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/);
  if (!v) return true;
  const [maior, menor] = [Number(v[1]), Number(v[2])];
  return maior < 18 || (maior === 18 && menor < 4);
}

/**
 * Não deixa a tela apagar enquanto o app está aberto.
 * 1ª camada: Wake Lock do navegador. 2ª camada: vídeo silencioso em repetição, para
 * aparelhos sem Wake Lock (o sistema não apaga a tela com vídeo tocando).
 * O sistema solta tudo quando o app sai da frente; por isso religa ao voltar e a cada
 * toque. O data-tela-ligada na tag <html> mostra qual camada está ativa.
 */
export function ManterTelaLigada() {
  useEffect(() => {
    const temNativo = "wakeLock" in navigator;
    const soVideo = !temNativo || iosSemWakeLock();
    let usarVideo = soVideo;
    let trava: WakeLockSentinel | null = null;
    let pedindo = false;
    let video: HTMLVideoElement | null = null;

    const marcar = (modo: string) => {
      document.documentElement.dataset.telaLigada = modo;
    };

    function tocarVideo() {
      if (!video) {
        const v = document.createElement("video");
        v.setAttribute("playsinline", "");
        v.setAttribute("title", "Tela ligada");
        v.src = VIDEO;
        v.addEventListener("loadedmetadata", () => {
          if (v.duration <= 1) v.loop = true;
          else {
            v.addEventListener("timeupdate", () => {
              if (v.currentTime > 0.5) v.currentTime = Math.random();
            });
          }
        });
        video = v;
      }
      // sem toque na tela o navegador pode recusar: tenta de novo no próximo toque
      if (video.paused) video.play().then(() => marcar("video"), () => {});
    }

    async function ligar(comToque: boolean) {
      if (document.visibilityState !== "visible") return;
      if (temNativo && !trava && !pedindo) {
        pedindo = true;
        try {
          const t = await navigator.wakeLock.request("screen");
          trava = t;
          t.addEventListener("release", () => {
            trava = null;
          });
          if (!soVideo) {
            usarVideo = false;
            video?.pause();
            marcar("nativo");
          }
        } catch {
          // recusar sem toque é normal; recusou mesmo com toque, parte pro vídeo
          if (comToque) usarVideo = true;
        } finally {
          pedindo = false;
        }
      }
      if (usarVideo && document.visibilityState === "visible") tocarVideo();
    }

    const aoTocar = () => void ligar(true);
    const aoVoltar = () => void ligar(false);
    document.addEventListener("click", aoTocar);
    document.addEventListener("touchend", aoTocar, { passive: true });
    document.addEventListener("visibilitychange", aoVoltar);
    aoVoltar();

    return () => {
      document.removeEventListener("click", aoTocar);
      document.removeEventListener("touchend", aoTocar);
      document.removeEventListener("visibilitychange", aoVoltar);
      void trava?.release();
      video?.pause();
    };
  }, []);

  return null;
}
