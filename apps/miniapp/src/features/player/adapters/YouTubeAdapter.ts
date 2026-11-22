import type { AdapterEvent, AdapterContext, PauseOptions, PlayOptions, PlaybackState, PlayerAdapter } from '../engine/types';
import { PlayerEngineError } from '../engine/types';
import type { YouTubeNamespace, YouTubePlayerInstance } from '../../../types/youtube';

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_CUED = 5;

const YOUTUBE_ERROR_MESSAGES: Record<number, string> = {
  2: 'Parâmetros inválidos ao abrir o vídeo do YouTube.',
  5: 'O player do YouTube não conseguiu reproduzir este vídeo neste dispositivo.',
  100: 'Vídeo não encontrado, privado ou removido do YouTube.',
  101: 'O dono do vídeo não permitiu incorporá-lo no YouTube.',
  150: 'O dono do vídeo não permitiu incorporá-lo no YouTube.',
};

let apiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('YouTube API requer um navegador.'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
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

interface StateWaiter {
  states: number[];
  resolve: () => void;
  reject: (error: PlayerEngineError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Adaptador oficial da YouTube IFrame API, com confirmação por estado real. */
export class YouTubeAdapter implements PlayerAdapter {
  readonly kind = 'youtube' as const;
  private readonly listeners = new Set<(event: AdapterEvent) => void>();
  private readonly waiters = new Set<StateWaiter>();
  private player: YouTubePlayerInstance | null = null;
  private destroyed = false;
  private lastState = -1;
  private desiredPlaying = false;
  private muted = false;
  private volume = 1;
  private desiredTime = 0;
  private failure: { code: string; message: string } | undefined;
  private poll: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly context: AdapterContext) {}

  subscribe(listener: (event: AdapterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(type: AdapterEvent['type'], detail?: string): void {
    if (this.destroyed) return;
    const event: AdapterEvent = { type, at: Date.now(), detail };
    for (const listener of [...this.listeners]) listener(event);
  }

  private resolveWaiters(state: number): void {
    for (const waiter of [...this.waiters]) {
      if (!waiter.states.includes(state)) continue;
      clearTimeout(waiter.timer);
      this.waiters.delete(waiter);
      waiter.resolve();
    }
  }

  private waitForState(states: number[], timeoutMs: number, code: string, message: string): Promise<void> {
    if (states.includes(this.lastState)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter: StateWaiter = {
        states,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new PlayerEngineError(code, message));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  private stopPoll(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private startPoll(): void {
    this.stopPoll();
    this.poll = setInterval(() => {
      if (!this.destroyed && this.player?.getPlayerState() === YT_PLAYING) this.emit('timeupdate');
    }, 500);
  }

  async load(): Promise<void> {
    if (this.destroyed) throw new PlayerEngineError('DESTROYED', 'Adaptador já destruído.');
    const container = this.context.container;
    if (!container) throw new PlayerEngineError('NO_SURFACE', 'Container do YouTube não disponível.');
    if (!this.context.source.videoId) {
      throw new PlayerEngineError('NO_VIDEO_ID', 'ID de vídeo do YouTube ausente.');
    }

    let YT: YouTubeNamespace;
    try {
      YT = await loadYouTubeApi();
    } catch {
      throw new PlayerEngineError('YOUTUBE_API_UNAVAILABLE', 'Não foi possível carregar a API do YouTube.');
    }
    if (this.destroyed) throw new PlayerEngineError('DESTROYED', 'Adaptador já destruído.');

    const mount = document.createElement('div');
    mount.className = 'player-youtube__mount';
    container.appendChild(mount);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new PlayerEngineError('YOUTUBE_READY_TIMEOUT', 'O player do YouTube demorou para ficar pronto.')), this.context.commandTimeoutMs);
      this.player = new YT.Player(mount, {
        videoId: this.context.source.videoId!,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            this.player = event.target;
            clearTimeout(timer);
            if (this.desiredTime > 0) this.player.seekTo(this.desiredTime, true);
            this.lastState = YT_CUED;
            this.emit('ready');
            resolve();
          },
          onStateChange: (event) => this.onStateChange(event.data),
          onError: (event) => {
            this.failure = {
              code: `YOUTUBE_${event.data}`,
              message: YOUTUBE_ERROR_MESSAGES[event.data] ?? 'Não foi possível reproduzir este vídeo do YouTube.',
            };
            this.emit('error', this.failure.message);
          },
        },
      });
    });
  }

  private onStateChange(state: number): void {
    this.lastState = state;
    this.resolveWaiters(state);
    // O estado real prevalece sobre a intenção: se o iframe voltou a tocar
    // enquanto o estado autoritativo é pausado, reafirma o pause.
    if (state === YT_PLAYING && !this.desiredPlaying) {
      this.player?.pauseVideo();
    }
    if (state === YT_PLAYING) {
      this.startPoll();
      this.emit('statechange');
    } else if (state === YT_PAUSED || state === YT_ENDED || state === YT_CUED) {
      this.stopPoll();
      this.emit(state === YT_ENDED ? 'ended' : 'statechange');
    } else if (state === YT_BUFFERING) {
      this.emit('buffering');
    }
  }

  async play(options?: PlayOptions): Promise<void> {
    if (!this.player || this.destroyed) throw new PlayerEngineError('NOT_READY', 'Player do YouTube não está pronto.');
    this.desiredPlaying = true;
    if (options?.muted) this.muted = true;
    if (this.muted) this.player.mute();
    this.player.playVideo();
    await this.waitForState(
      [YT_PLAYING],
      options?.timeoutMs ?? this.context.commandTimeoutMs,
      'PLAY_CONFIRMATION_TIMEOUT',
      'O YouTube não confirmou o início da reprodução. Toque para tentar novamente.',
    );
  }

  async pause(options?: PauseOptions): Promise<void> {
    if (!this.player || this.destroyed) return;
    this.desiredPlaying = false;
    this.player.pauseVideo();
    await this.waitForState(
      [YT_PAUSED, YT_ENDED, YT_CUED],
      options?.timeoutMs ?? this.context.commandTimeoutMs,
      'PAUSE_CONFIRMATION_TIMEOUT',
      'O YouTube não confirmou a pausa. Toque para tentar novamente.',
    );
  }

  async seekTo(seconds: number): Promise<void> {
    if (!this.player || this.destroyed) return;
    const duration = this.player.getDuration() || 0;
    this.desiredTime = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
    this.player.seekTo(this.desiredTime, true);
    this.emit('seeked');
  }

  getCurrentTime(): number {
    return this.player?.getCurrentTime() ?? this.desiredTime;
  }

  getDuration(): number {
    return this.player?.getDuration() ?? 0;
  }

  getBuffered(): number {
    const fraction = this.player?.getVideoLoadedFraction?.() ?? 0;
    return fraction * this.getDuration();
  }

  getPlaybackState(): PlaybackState {
    let status: PlaybackState['status'];
    if (this.failure) status = 'error';
    else if (this.lastState === YT_PLAYING) status = 'playing';
    else if (this.lastState === YT_PAUSED || this.lastState === YT_CUED) status = 'paused';
    else if (this.lastState === YT_ENDED) status = 'ended';
    else if (this.lastState === YT_BUFFERING) status = 'buffering';
    else status = 'loading';

    return {
      status,
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
      buffered: this.getBuffered(),
      volume: this.volume,
      muted: this.muted,
      sourceKind: 'youtube',
      ...(this.failure ? { error: this.failure } : {}),
    };
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.player?.setVolume(Math.round(this.volume * 100));
    if (this.volume > 0) this.muted = false;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.player?.mute();
    else this.player?.unMute();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopPoll();
    for (const waiter of [...this.waiters]) {
      clearTimeout(waiter.timer);
      waiter.reject(new PlayerEngineError('DESTROYED', 'Player destruído.'));
    }
    this.waiters.clear();
    this.listeners.clear();
    try {
      this.player?.destroy();
    } catch {
      // O iframe pode já ter sido removido.
    }
    this.player = null;
    if (this.context.container) this.context.container.innerHTML = '';
  }
}

export { loadYouTubeApi };
