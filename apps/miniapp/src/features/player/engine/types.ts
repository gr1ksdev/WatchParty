import type { ControlAction, SourceKind, VideoSource } from '@watchparty/shared';

/** Estado normalizado, independente do provedor de mídia. */
export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export interface PlayerFailure {
  code: string;
  message: string;
}

export interface PlaybackState {
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  sourceKind: SourceKind | null;
  error?: PlayerFailure;
}

export type PlayerEventType =
  | 'statechange'
  | 'timeupdate'
  | 'ready'
  | 'buffering'
  | 'error'
  | 'ended'
  | 'seeked'
  | 'volumechange';

/**
 * Origem de cada ação. Usada para diferenciar comandos remotos, locais e
 * mudanças reais do adaptador — sem suprimir eventos indiscriminadamente.
 */
export type CommandOrigin =
  | 'host-local'
  | 'remote-sync'
  | 'internal'
  | 'drift-correction'
  | 'user-gesture';

export interface PlayerStateEvent {
  type: PlayerEventType;
  kind: 'state';
  state: PlaybackState;
  previous: PlaybackState;
  origin: CommandOrigin;
  at: number;
}

export interface PlayerCommandEvent {
  type: 'command';
  kind: 'command';
  action: ControlAction;
  position?: number;
  origin: CommandOrigin;
  at: number;
}

export type PlayerEvent = PlayerStateEvent | PlayerCommandEvent;

export interface PlayOptions {
  muted?: boolean;
  timeoutMs?: number;
}

export interface PauseOptions {
  timeoutMs?: number;
}

export interface AdapterEvent {
  type: PlayerEventType;
  at: number;
  detail?: string;
}

/** Contrato único implementado por todos os adaptadores. */
export interface PlayerAdapter {
  readonly kind: SourceKind | 'google-drive';
  load(source: VideoSource): Promise<void>;
  play(options?: PlayOptions): Promise<void>;
  pause(options?: PauseOptions): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number;
  getBuffered(): number;
  getPlaybackState(): PlaybackState;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  subscribe(listener: (event: AdapterEvent) => void): () => void;
  destroy(): void;
}

export interface AdapterContext {
  source: VideoSource;
  video: HTMLVideoElement | null;
  container: HTMLDivElement | null;
  /** HTML5 define `src`; HLS anexa a mídia via hls.js. */
  attachSource?: boolean;
  commandTimeoutMs: number;
}

export interface EngineOptions {
  commandTimeoutMs?: number;
  loadTimeoutMs?: number;
  timeupdateThrottleMs?: number;
  /** Permite injetar adaptadores em testes ou extensões sem alterar o motor. */
  adapterFactory?: (context: AdapterContext) => PlayerAdapter;
}

export interface RemotePlaybackState {
  playing: boolean;
  position: number;
  updatedAt: number;
  version: number;
}

export interface SocketTiming {
  rtt: number;
  clockOffset: number;
}

export function clampTime(value: number, duration: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return duration > 0 && Number.isFinite(duration) ? Math.min(value, duration) : value;
}

export class PlayerEngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlayerEngineError';
  }
}

/** YouTube pode levar alguns segundos para sair do buffering no primeiro play. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 8000;
export const DEFAULT_LOAD_TIMEOUT_MS = 15000;
export const DEFAULT_TIMEUPDATE_THROTTLE_MS = 250;
