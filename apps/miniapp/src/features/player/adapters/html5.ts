import { clampTime, type AdapterOptions, type PlayerController } from '../types';

const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: 'O carregamento do vídeo foi interrompido.',
  2: 'Não foi possível acessar o arquivo de vídeo. Verifique sua conexão ou o link.',
  3: 'Este dispositivo não consegue decodificar o formato do vídeo.',
  4: 'Não foi possível carregar o vídeo. O link pode estar indisponível, bloqueado ou o formato não é compatível com este dispositivo.',
};

/** Adaptador para MP4, M4V, WebM, OGV e fallback nativo de HLS. */
export function createHtml5Adapter(options: AdapterOptions): PlayerController {
  const video = options.video;
  if (!video) {
    throw new Error('Elemento <video> não disponível para o player HTML5.');
  }

  let destroyed = false;

  const emitStatus = () => {
    if (destroyed) return;
    options.onStatus({
      playing: !video.paused && !video.ended,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });
  };

  const reportError = (detail?: string) => {
    if (destroyed) return;
    const code = video.error?.code ?? 0;
    const message = detail ?? MEDIA_ERROR_MESSAGES[code] ?? 'Não foi possível reproduzir este vídeo.';
    options.onError({ code: `HTML5_MEDIA_ERROR_${code || 'UNKNOWN'}`, message, source: options.source.kind });
  };

  const onLoaded = () => {
    emitStatus();
    options.onReady?.();
  };

  const onErrorEvent = () => reportError();

  const onPlayFailure = (error: unknown) => {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError') {
      reportError('O navegador bloqueou a reprodução automática. Toque em play para começar.');
      return;
    }
    reportError('Não foi possível iniciar a reprodução.');
  };

  video.addEventListener('loadedmetadata', onLoaded);
  video.addEventListener('timeupdate', emitStatus);
  video.addEventListener('play', emitStatus);
  video.addEventListener('pause', emitStatus);
  video.addEventListener('ended', emitStatus);
  video.addEventListener('error', onErrorEvent);

  if (!options.skipSrc) {
    video.src = options.source.url;
    video.load();
  }

  return {
    play() {
      try {
        const result = video.play();
        if (result && typeof result.catch === 'function') result.catch(onPlayFailure);
      } catch (error) {
        onPlayFailure(error);
      }
    },
    pause() {
      video.pause();
    },
    seekTo(seconds) {
      video.currentTime = clampTime(seconds, Number.isFinite(video.duration) ? video.duration : 0);
      emitStatus();
    },
    getCurrentTime() {
      return Number.isFinite(video.currentTime) ? video.currentTime : 0;
    },
    getDuration() {
      return Number.isFinite(video.duration) ? video.duration : 0;
    },
    destroy() {
      destroyed = true;
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('timeupdate', emitStatus);
      video.removeEventListener('play', emitStatus);
      video.removeEventListener('pause', emitStatus);
      video.removeEventListener('ended', emitStatus);
      video.removeEventListener('error', onErrorEvent);
      video.removeAttribute('src');
      video.load();
    },
  };
}
