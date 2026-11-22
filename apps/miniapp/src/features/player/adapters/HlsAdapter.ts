import Hls from 'hls.js';
import type { AdapterEvent, AdapterContext, PlayerAdapter, PlaybackState, PlayOptions, PauseOptions } from '../engine/types';
import { PlayerEngineError } from '../engine/types';
import { Html5Adapter } from './Html5Adapter';

/** HLS via hls.js (MSE), com fallback para HLS nativo do Safari/iOS. */
export class HlsAdapter implements PlayerAdapter {
  readonly kind = 'hls' as const;
  private readonly base: Html5Adapter;
  private readonly listeners = new Set<(event: AdapterEvent) => void>();
  private hls: Hls | null = null;
  private destroyed = false;
  private failed = false;

  private readonly native: boolean;

  constructor(private readonly context: AdapterContext) {
    this.native = !Hls.isSupported();
    this.base = new Html5Adapter({ ...context, attachSource: this.native }, 'hls');
    this.base.subscribe((event) => this.forward(event));
  }

  private forward(event: AdapterEvent): void {
    if (this.destroyed) return;
    for (const listener of [...this.listeners]) listener(event);
  }

  subscribe(listener: (event: AdapterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(source: import('@watchparty/shared').VideoSource): Promise<void> {
    if (this.destroyed) throw new PlayerEngineError('DESTROYED', 'Adaptador já destruído.');
    // Safari/iOS reproduzem HLS nativamente: o Html5Adapter já cuida de tudo.
    if (this.native) return this.base.load(source);

    this.failed = false;
    this.hls = new Hls({ enableWorker: true });
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => this.forward({ type: 'ready', at: Date.now() }));
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      this.failed = true;
      const isNetwork = data.type === Hls.ErrorTypes.NETWORK_ERROR;
      this.forward({
        type: 'error',
        at: Date.now(),
        detail: isNetwork
          ? 'Não foi possível carregar a stream HLS. Verifique o link e sua conexão.'
          : 'A stream HLS não pôde ser decodificada neste dispositivo.',
      });
    });

    try {
      this.hls.loadSource(source.url);
      if (this.context.video) this.hls.attachMedia(this.context.video);
    } catch {
      throw new PlayerEngineError('HLS_INIT_ERROR', 'Não foi possível iniciar o player HLS.');
    }
    await this.base.load(source);
  }

  async play(options?: PlayOptions): Promise<void> {
    return this.base.play(options);
  }
  async pause(options?: PauseOptions): Promise<void> {
    return this.base.pause();
  }
  async seekTo(seconds: number): Promise<void> {
    return this.base.seekTo(seconds);
  }
  getCurrentTime(): number {
    return this.base.getCurrentTime();
  }
  getDuration(): number {
    return this.base.getDuration();
  }
  getBuffered(): number {
    return this.base.getBuffered();
  }
  getPlaybackState(): PlaybackState {
    const state = this.base.getPlaybackState();
    if (this.failed && state.status !== 'error') {
      return {
        ...state,
        status: 'error',
        error: { code: 'HLS_FATAL_ERROR', message: 'Não foi possível reproduzir esta stream HLS.' },
      };
    }
    return state;
  }
  setVolume(volume: number): void {
    this.base.setVolume(volume);
  }
  setMuted(muted: boolean): void {
    this.base.setMuted(muted);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    this.hls?.destroy();
    this.hls = null;
    this.base.destroy();
  }
}
