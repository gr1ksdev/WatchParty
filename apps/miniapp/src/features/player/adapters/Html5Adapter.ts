import type { AdapterEvent, AdapterContext, PlayerAdapter, PlaybackState, PlayOptions, PauseOptions } from '../engine/types';
import { PlayerEngineError } from '../engine/types';

const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: 'O carregamento do vídeo foi interrompido.',
  2: 'Não foi possível acessar o arquivo de vídeo. Verifique sua conexão ou o link.',
  3: 'Este dispositivo não consegue decodificar o formato do vídeo.',
  4: 'Não foi possível carregar o vídeo. O link pode estar indisponível ou bloqueado.',
};

/** Adaptador para MP4, M4V, WebM, OGV e HLS nativo. */
export class Html5Adapter implements PlayerAdapter {
  readonly kind: 'mp4' | 'hls';
  private readonly listeners = new Set<(event: AdapterEvent) => void>();
  private readonly video: HTMLVideoElement;
  private readonly handlers: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [];
  private destroyed = false;
  private volume = 1;

  constructor(private readonly context: AdapterContext, kind: 'mp4' | 'hls' = 'mp4') {
    if (!context.video) throw new PlayerEngineError('NO_SURFACE', 'Elemento <video> não disponível.');
    this.video = context.video;
    this.kind = kind;
    this.attach();
  }

  private attach(): void {
    const listen = (name: keyof HTMLMediaElementEventMap, handler: EventListener) => {
      this.video.addEventListener(name, handler);
      this.handlers.push([name, handler]);
    };
    listen('loadedmetadata', () => this.emit('ready'));
    listen('canplay', () => this.emit('ready'));
    listen('play', () => this.emit('statechange'));
    listen('playing', () => this.emit('statechange'));
    listen('pause', () => this.emit('statechange'));
    listen('timeupdate', () => this.emit('timeupdate'));
    listen('seeked', () => this.emit('seeked'));
    listen('waiting', () => this.emit('buffering'));
    listen('stalled', () => this.emit('buffering'));
    listen('progress', () => this.emit('timeupdate'));
    listen('volumechange', () => this.emit('volumechange'));
    listen('ended', () => this.emit('ended'));
    listen('error', () => this.emit('error'));
  }

  private emit(type: AdapterEvent['type'], detail?: string): void {
    if (this.destroyed) return;
    const event: AdapterEvent = { type, at: Date.now(), detail };
    for (const listener of [...this.listeners]) listener(event);
  }

  subscribe(listener: (event: AdapterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(source: import('@watchparty/shared').VideoSource): Promise<void> {
    if (this.destroyed) throw new PlayerEngineError('DESTROYED', 'Adaptador já destruído.');
    if (this.context.attachSource !== false) {
      this.video.src = source.url;
      this.video.load();
    }
    if (this.video.readyState >= 2) {
      this.emit('ready');
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new PlayerEngineError('LOAD_TIMEOUT', 'Tempo esgotado ao carregar o vídeo.'));
      }, this.context.commandTimeoutMs);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new PlayerEngineError(
            `MEDIA_ERROR_${this.video.error?.code ?? 0}`,
            MEDIA_ERROR_MESSAGES[this.video.error?.code ?? 0] ?? 'Não foi possível carregar o vídeo.',
          ),
        );
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.video.removeEventListener('loadedmetadata', onReady);
        this.video.removeEventListener('error', onError);
      };
      this.video.addEventListener('loadedmetadata', onReady);
      this.video.addEventListener('error', onError);
    });
  }

  async play(options?: PlayOptions): Promise<void> {
    if (this.destroyed) throw new PlayerEngineError('DESTROYED', 'Adaptador já destruído.');
    if (options?.muted) this.video.muted = true;
    if (options?.timeoutMs !== undefined) {
      // O timeout é gerenciado pelo motor; apenas iniciamos a reprodução aqui.
    }
    try {
      await this.video.play();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError') {
        throw new PlayerEngineError(
          'AUTOPLAY_BLOCKED',
          'O navegador bloqueou o início automático. Toque para reproduzir.',
        );
      }
      throw new PlayerEngineError('PLAY_FAILED', 'Não foi possível iniciar a reprodução.');
    }
  }

  async pause(): Promise<void> {
    if (this.destroyed) return;
    this.video.pause();
  }

  async seekTo(seconds: number): Promise<void> {
    if (this.destroyed) return;
    const duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
    this.video.currentTime = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
  }

  getCurrentTime(): number {
    return Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0;
  }

  getDuration(): number {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }

  getBuffered(): number {
    const buffered = this.video.buffered;
    if (!buffered || buffered.length === 0) return 0;
    return buffered.end(buffered.length - 1);
  }

  getPlaybackState(): PlaybackState {
    const error = this.video.error;
    let status: PlaybackState['status'];
    if (error) status = 'error';
    else if (this.video.ended) status = 'ended';
    else if (!this.video.paused && this.video.readyState >= 2) status = 'playing';
    else if (this.video.networkState === HTMLMediaElement.NETWORK_LOADING && this.video.readyState < 3)
      status = 'buffering';
    else if (this.video.readyState >= 2) status = 'paused';
    else status = 'loading';

    return {
      status,
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
      buffered: this.getBuffered(),
      volume: this.volume,
      muted: this.video.muted,
      sourceKind: this.context.source.kind,
      ...(error
        ? {
            error: {
              code: `MEDIA_ERROR_${error.code}`,
              message: MEDIA_ERROR_MESSAGES[error.code] ?? 'Não foi possível reproduzir o vídeo.',
            },
          }
        : {}),
    };
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.video.volume = this.volume;
    if (this.volume > 0) this.video.muted = false;
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [name, handler] of this.handlers) this.video.removeEventListener(name, handler);
    this.handlers.length = 0;
    this.listeners.clear();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
