import type { YouTubeNamespace, YouTubePlayerInstance } from '../../../types/youtube';
import { clampTime, type AdapterOptions, type PlayerController } from '../types';

const YOUTUBE_PLAYING = 1;

const YOUTUBE_ERROR_MESSAGES: Record<number, string> = {
  2: 'Parâmetros inválidos ao abrir o vídeo do YouTube.',
  5: 'O player do YouTube não conseguiu reproduzir este vídeo neste dispositivo.',
  100: 'Vídeo não encontrado, privado ou removido do YouTube.',
  101: 'O dono do vídeo não permitiu incorporá-lo no YouTube.',
  150: 'O dono do vídeo não permitiu incorporá-lo no YouTube.',
};

let apiPromise: Promise<YouTubeNamespace> | null = null;

/** Carrega a IFrame Player API uma única vez, sem dependência npm adicional. */
export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API requer um navegador.'));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT?.Player) resolve(window.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Falha ao carregar a API do YouTube.'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

/** Adaptador YouTube. Respeita limitações de incorporação e erros da API. */
export function createYouTubeAdapter(options: AdapterOptions): PlayerController {
  const container = options.container;
  const videoId = options.source.videoId;
  if (!container) {
    throw new Error('Elemento de container não disponível para o player do YouTube.');
  }
  if (!videoId) {
    throw new Error('ID de vídeo do YouTube ausente.');
  }

  const mount = document.createElement('div');
  mount.className = 'player-youtube__mount';
  container.appendChild(mount);

  let player: YouTubePlayerInstance | null = null;
  let destroyed = false;
  let desiredPlaying = false;
  let mutedDesired = false;
  let desiredTime = 0;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  const pending: Array<() => void> = [];

  const startPlayback = () => {
    if (!player) return;
    // Autoplay com áudio é bloqueado: convidados iniciam sem som.
    if (mutedDesired) player.mute();
    player.playVideo();
  };

  const stopStatusTimer = () => {
    if (statusTimer !== null) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  };

  const startStatusTimer = () => {
    stopStatusTimer();
    statusTimer = setInterval(() => {
      if (!destroyed && player?.getPlayerState() === YOUTUBE_PLAYING) emitStatus(true);
    }, 500);
  };

  const emitStatus = (playing: boolean, currentTime?: number) => {
    if (destroyed) return;
    options.onStatus({
      playing,
      currentTime: currentTime ?? player?.getCurrentTime() ?? desiredTime,
      duration: player?.getDuration() ?? 0,
    });
  };

  void loadYouTubeApi()
    .then((YT) => {
      if (destroyed) return;
      player = new YT.Player(mount, {
        videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            player = event.target;
            if (desiredTime > 0) player.seekTo(desiredTime, true);
            if (desiredPlaying) startPlayback();
            options.onReady?.();
            emitStatus(desiredPlaying);
            if (desiredPlaying) startStatusTimer();
            while (pending.length > 0) pending.shift()?.();
          },
          onStateChange: (event) => {
            // Reafirma o estado autoritativo: um pauseVideo() enviado antes do
            // player ficar pronto pode ser ignorado pelo iframe do YouTube.
            if (event.data === YOUTUBE_PLAYING && !desiredPlaying) {
              player?.pauseVideo();
            }
            // -1 (não iniciado) e 3 (buffering) não mudam o estado lógico.
            if (event.data === YOUTUBE_PLAYING) {
              emitStatus(true);
              startStatusTimer();
            } else if (event.data === 0 || event.data === 2 || event.data === 5) {
              emitStatus(false);
              stopStatusTimer();
            }
          },
          onError: (event) => {
            options.onError({
              code: `YOUTUBE_${event.data}`,
              message:
                YOUTUBE_ERROR_MESSAGES[event.data] ??
                'Não foi possível reproduzir este vídeo do YouTube.',
              source: 'youtube',
            });
          },
        },
      });
    })
    .catch(() => {
      if (destroyed) return;
      options.onError({
        code: 'YOUTUBE_API_UNAVAILABLE',
        message: 'Não foi possível carregar o player do YouTube. Verifique sua conexão.',
        source: 'youtube',
      });
    });

  const whenReady = (action: () => void) => {
    if (player) action();
    else pending.push(action);
  };

  return {
    play(playOptions) {
      desiredPlaying = true;
      if (playOptions?.muted) mutedDesired = true;
      whenReady(() => startPlayback());
    },
    pause() {
      desiredPlaying = false;
      whenReady(() => player?.pauseVideo());
    },
    seekTo(seconds) {
      desiredTime = clampTime(seconds, player?.getDuration() ?? 0);
      whenReady(() => player?.seekTo(desiredTime, true));
      emitStatus(desiredPlaying, desiredTime);
    },
    getCurrentTime() {
      return player?.getCurrentTime() ?? desiredTime;
    },
    getDuration() {
      return player?.getDuration() ?? 0;
    },
    setMuted(muted) {
      mutedDesired = muted;
      whenReady(() => {
        if (muted) player?.mute();
        else player?.unMute();
      });
    },
    destroy() {
      destroyed = true;
      stopStatusTimer();
      pending.length = 0;
      try {
        player?.destroy();
      } catch {
        // O iframe pode já ter sido removido pelo próprio YouTube.
      }
      container.innerHTML = '';
      player = null;
    },
  };
}
