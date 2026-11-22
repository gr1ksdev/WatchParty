import type { ControlAction, VideoSource } from '@watchparty/shared';
import { EventBus, type PlayerListener } from './eventBus';
import { createAdapter } from './registry';
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_LOAD_TIMEOUT_MS,
  DEFAULT_TIMEUPDATE_THROTTLE_MS,
  PlayerEngineError,
  type AdapterEvent,
  type CommandOrigin,
  type EngineOptions,
  type PauseOptions,
  type PlaybackState,
  type PlayerAdapter,
  type PlayOptions,
  type RemotePlaybackState,
  type SocketTiming,
} from './types';

const INITIAL_STATE: PlaybackState = {
  status: 'idle',
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  sourceKind: null,
};

interface Confirmation {
  statuses: PlaybackState['status'][];
  origin: CommandOrigin;
  resolve: () => void;
  reject: (error: PlayerEngineError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Motor de reprodução proprietário. Framework-agnóstico: não conhece React,
 * WebSocket nem a interface visual. Coordena adaptadores, comandos, eventos
 * normalizados e a reaplicação do estado autoritativo da sala.
 */
export class WatchPartyPlayer {
  private readonly bus = new EventBus();
  private readonly options: Required<EngineOptions>;
  private adapter: PlayerAdapter | null = null;
  private unsubscribeAdapter: (() => void) | null = null;
  private generation = 0;
  private loaded = false;
  private disposed = false;
  private state: PlaybackState = INITIAL_STATE;
  private authoritative: RemotePlaybackState | null = null;
  private timing: SocketTiming = { rtt: 0, clockOffset: 0 };
  private isHost = false;
  private confirmation: Confirmation | null = null;
  private readonly queue: Array<() => void> = [];
  private lastTimeupdate = 0;
  private lastStateKey = '';

  constructor(options: EngineOptions = {}) {
    this.options = {
      commandTimeoutMs: options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      loadTimeoutMs: options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
      timeupdateThrottleMs: options.timeupdateThrottleMs ?? DEFAULT_TIMEUPDATE_THROTTLE_MS,
      adapterFactory: options.adapterFactory ?? createAdapter,
    };
  }

  subscribe(listener: PlayerListener): () => void {
    return this.bus.subscribe(listener);
  }

  getState(): PlaybackState {
    return this.state;
  }

  getAdapterKind(): PlaybackState['sourceKind'] | 'google-drive' {
    return this.adapter?.kind ?? null;
  }

  isReady(): boolean {
    return this.loaded && this.adapter !== null;
  }

  setTiming(timing: SocketTiming): void {
    this.timing = timing;
  }

  setRole(isHost: boolean): void {
    this.isHost = isHost;
  }

  /** Carrega uma fonte, descartando carregamentos anteriores ainda pendentes. */
  async load(
    source: VideoSource,
    surface: { video: HTMLVideoElement | null; container: HTMLDivElement | null },
  ): Promise<void> {
    if (this.disposed) throw new PlayerEngineError('DESTROYED', 'Motor já destruído.');
    const generation = ++this.generation;
    this.loaded = false;
    this.clearConfirmation('LOAD_STARTED');
    this.disposeAdapter();
    this.state = { ...INITIAL_STATE, status: 'loading', sourceKind: source.kind };
    this.emitState('statechange', 'internal');

    const adapter = this.options.adapterFactory({
      source,
      video: surface.video,
      container: surface.container,
      commandTimeoutMs: this.options.commandTimeoutMs,
    });
    this.adapter = adapter;
    this.unsubscribeAdapter = adapter.subscribe((event) => this.onAdapterEvent(event));

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        adapter.load(source),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new PlayerEngineError('LOAD_TIMEOUT', 'Tempo esgotado ao carregar a mídia.')),
            this.options.loadTimeoutMs,
          );
        }),
      ]);
      if (generation !== this.generation || this.disposed) return;
      if (timer) clearTimeout(timer);
      this.loaded = true;
      this.syncState();
      this.emitState('ready', 'internal');
      // Ajuste 3: reaplica o estado autoritativo logo após o player carregar.
      this.applyDesired('remote-sync');
      this.flushQueue();
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      if (timer) clearTimeout(timer);
      const failure = this.toFailure(error);
      this.state = { ...this.state, status: 'error', error: failure };
      this.emitState('error', 'internal');
    }
  }

  /** Comando local do host: gera evento 'command' para a camada de sincronização enviar. */
  async play(options?: PlayOptions, origin: CommandOrigin = 'host-local'): Promise<void> {
    this.emitCommand('play', this.getCurrentTime(), origin);
    await this.enqueue(async () => {
      const adapter = this.requireAdapter();
      const timeoutMs = options?.timeoutMs ?? this.options.commandTimeoutMs;
      try {
        await adapter.play({ ...options, timeoutMs });
        await this.confirm(['playing'], origin, timeoutMs, 'PLAY');
      } catch (error) {
        this.reportFailure(error, origin);
        throw error;
      }
    });
  }

  async pause(options?: PauseOptions, origin: CommandOrigin = 'host-local'): Promise<void> {
    this.emitCommand('pause', this.getCurrentTime(), origin);
    await this.enqueue(async () => {
      const adapter = this.requireAdapter();
      const timeoutMs = options?.timeoutMs ?? this.options.commandTimeoutMs;
      try {
        await adapter.pause({ timeoutMs });
        await this.confirm(['paused', 'ended'], origin, timeoutMs, 'PAUSE');
      } catch (error) {
        this.reportFailure(error, origin);
        throw error;
      }
    });
  }

  async seekTo(seconds: number, origin: CommandOrigin = 'host-local'): Promise<void> {
    this.emitCommand('seek', seconds, origin);
    await this.enqueue(async () => {
      const adapter = this.requireAdapter();
      await adapter.seekTo(seconds);
      this.syncState();
      this.emitState('seeked', origin);
    });
  }

  setVolume(volume: number): void {
    this.adapter?.setVolume(volume);
    this.syncState();
    this.emitState('volumechange', 'user-gesture');
  }

  setMuted(muted: boolean): void {
    this.adapter?.setMuted(muted);
    this.syncState();
    this.emitState('volumechange', 'user-gesture');
  }

  /**
   * Estado vindo do servidor. Nunca emite evento 'command': um comando remoto
   * não pode ser reenviado como se fosse do host.
   */
  applyRemote(remote: RemotePlaybackState): void {
    this.authoritative = { ...remote };
    this.applyDesired('remote-sync');
  }

  /** Alias semântico usado em reconexão/entrada tardia. */
  restore(remote: RemotePlaybackState): void {
    this.applyRemote(remote);
  }

  getExpectedPosition(): number {
    if (!this.authoritative) return this.getCurrentTime();
    const nowServer = Date.now() + this.timing.clockOffset;
    const delta = Math.max(0, (nowServer - this.authoritative.updatedAt + this.timing.rtt / 2) / 1000);
    return this.authoritative.position + (this.authoritative.playing ? delta : 0);
  }

  /** Correção de deriva marcada como tal — nunca vira comando do host. */
  correctDrift(expected: number, threshold: number): boolean {
    if (!this.loaded || !this.adapter || !this.authoritative?.playing) return false;
    const actual = this.getCurrentTime();
    if (Math.abs(actual - expected) <= threshold) return false;
    void this.adapter.seekTo(Math.max(0, expected));
    this.syncState();
    this.emitState('seeked', 'drift-correction');
    return true;
  }

  getCurrentTime(): number {
    return this.adapter?.getCurrentTime() ?? this.state.currentTime;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.clearConfirmation('DESTROY');
    this.queue.length = 0;
    this.disposeAdapter();
    this.loaded = false;
    this.bus.clear();
  }

  private applyDesired(origin: CommandOrigin): void {
    if (!this.authoritative || !this.loaded || !this.adapter) return;
    const target = this.getExpectedPosition();
    void this.adapter
      .seekTo(target)
      .then(() =>
        this.authoritative?.playing
          ? this.adapter?.play({ muted: !this.isHost })
          : this.adapter?.pause(),
      )
      .then(() => {
        this.syncState();
        this.emitState('statechange', origin);
      })
      .catch((error) => {
        const failure = this.toFailure(error);
        this.state = { ...this.state, status: 'error', error: failure };
        this.emitState('error', origin);
      });
  }

  private onAdapterEvent(event: AdapterEvent): void {
    if (this.disposed || !this.adapter) return;
    // Origem do evento: comando pendente define a origem; caso contrário é uma
    // mudança real do adaptador (timeupdate, buffering, ended etc.).
    const origin: CommandOrigin = this.confirmation?.origin ?? 'internal';
    if (event.type === 'timeupdate' && Date.now() - this.lastTimeupdate < this.options.timeupdateThrottleMs) {
      return;
    }
    if (event.type === 'timeupdate') this.lastTimeupdate = Date.now();

    this.syncState();
    if (this.state.status === 'error') {
      this.settleConfirmation(
        false,
        new PlayerEngineError('ADAPTER_ERROR', this.state.error?.message ?? 'Erro do player.'),
      );
      this.emitState('error', origin);
      return;
    }
    if (this.confirmation && this.confirmation.statuses.includes(this.state.status)) {
      this.settleConfirmation(true);
    }
    this.emitState(event.type, origin);
  }

  private async enqueue(action: () => Promise<void>): Promise<void> {
    if (this.loaded && this.adapter) return action();
    return new Promise<void>((resolve, reject) => {
      this.queue.push(() => action().then(resolve, reject));
    });
  }

  private flushQueue(): void {
    while (this.queue.length > 0 && this.loaded) {
      const next = this.queue.shift();
      next?.();
    }
  }

  private requireAdapter(): PlayerAdapter {
    if (!this.adapter || !this.loaded) throw new PlayerEngineError('NOT_READY', 'Player ainda não está pronto.');
    return this.adapter;
  }

  private confirm(
    statuses: PlaybackState['status'][],
    origin: CommandOrigin,
    timeoutMs: number,
    action: string,
  ): Promise<void> {
    this.clearConfirmation('REPLACED');
    if (statuses.includes(this.state.status)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.confirmation = null;
        const error = new PlayerEngineError(
          `${action}_CONFIRMATION_TIMEOUT`,
          'O provedor não confirmou a mudança de estado a tempo.',
        );
        this.state = { ...this.state, error: { code: error.code, message: error.message } };
        this.emitState('error', origin);
        reject(error);
      }, timeoutMs);
      this.confirmation = { statuses, origin, resolve, reject, timer };
    });
  }

  private reportFailure(error: unknown, origin: CommandOrigin): void {
    const failure = this.toFailure(error);
    this.state = { ...this.state, error: failure };
    this.emitState('error', origin);
  }

  private settleConfirmation(ok: boolean, error?: PlayerEngineError): void {
    const current = this.confirmation;
    if (!current) return;
    clearTimeout(current.timer);
    this.confirmation = null;
    if (ok) current.resolve();
    else current.reject(error ?? new PlayerEngineError('COMMAND_FAILED', 'Comando não concluído.'));
  }

  private clearConfirmation(reason: string): void {
    if (!this.confirmation) return;
    clearTimeout(this.confirmation.timer);
    const current = this.confirmation;
    this.confirmation = null;
    current.reject(new PlayerEngineError('COMMAND_CANCELLED', `Confirmação cancelada: ${reason}`));
  }

  private emitCommand(action: ControlAction, position: number | undefined, origin: CommandOrigin): void {
    this.bus.emit({ type: 'command', kind: 'command', action, position, origin, at: Date.now() });
  }

  private emitState(type: AdapterEvent['type'], origin: CommandOrigin): void {
    const previous = this.state;
    const key = `${type}:${previous.status}:${Math.round(previous.currentTime * 2)}`;
    if (type === 'timeupdate' || type === 'statechange') {
      if (key === this.lastStateKey) return;
      this.lastStateKey = key;
    }
    this.state = { ...previous };
    this.bus.emit({ type, kind: 'state', state: this.state, previous, origin, at: Date.now() });
  }

  private syncState(): void {
    if (!this.adapter) return;
    this.state = this.adapter.getPlaybackState();
  }

  private toFailure(error: unknown): { code: string; message: string } {
    if (error instanceof PlayerEngineError) return { code: error.code, message: error.message };
    return { code: 'PLAYER_ERROR', message: error instanceof Error ? error.message : 'Erro inesperado no player.' };
  }

  private disposeAdapter(): void {
    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = null;
    this.adapter?.destroy();
    this.adapter = null;
  }
}
