import Hls from 'hls.js';
import type { AdapterOptions, PlayerController } from '../types';
import { createHtml5Adapter } from './html5';

/** HLS usa hls.js via Media Source Extensions; Safari/iOS usam o player nativo. */
export function createHlsAdapter(options: AdapterOptions): PlayerController {
  const video = options.video;
  if (!video) {
    throw new Error('Elemento <video> não disponível para o player HLS.');
  }
  if (!Hls.isSupported()) {
    return createHtml5Adapter(options);
  }

  const base = createHtml5Adapter({ ...options, skipSrc: true });
  const hls = new Hls({ enableWorker: true });

  hls.on(Hls.Events.MANIFEST_PARSED, () => options.onReady?.());
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    const isNetwork = data.type === Hls.ErrorTypes.NETWORK_ERROR;
    const isMedia = data.type === Hls.ErrorTypes.MEDIA_ERROR;
    options.onError({
      code: `HLS_${data.type.toUpperCase()}_${String(data.details ?? 'UNKNOWN').toUpperCase()}`,
      message: isNetwork
        ? 'Não foi possível carregar a stream HLS. Verifique o link e sua conexão.'
        : isMedia
          ? 'A stream HLS não pôde ser decodificada neste dispositivo.'
          : 'Não foi possível reproduzir esta stream HLS.',
      source: 'hls',
    });
  });

  try {
    hls.loadSource(options.source.url);
    hls.attachMedia(video);
  } catch {
    options.onError({
      code: 'HLS_INIT_ERROR',
      message: 'Não foi possível iniciar o player HLS.',
      source: 'hls',
    });
  }

  return {
    play: () => base.play(),
    pause: () => base.pause(),
    seekTo: (seconds) => base.seekTo(seconds),
    getCurrentTime: () => base.getCurrentTime(),
    getDuration: () => base.getDuration(),
    destroy() {
      hls.destroy();
      base.destroy();
    },
  };
}
