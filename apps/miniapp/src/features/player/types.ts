import type { SourceKind } from '@watchparty/shared';

export interface PlayerError {
  code: string;
  message: string;
  source: SourceKind;
}

export interface PlaybackStatus {
  playing: boolean;
  currentTime: number;
  duration: number;
}

/** Interface comum a todos os adaptadores, independente da origem do vídeo. */
export interface PlayerController {
  play(): Promise<void> | void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

export interface AdapterOptions {
  source: { kind: SourceKind; url: string; videoId?: string };
  video: HTMLVideoElement | null;
  container: HTMLDivElement | null;
  onError: (error: PlayerError) => void;
  onStatus: (status: PlaybackStatus) => void;
  onReady?: () => void;
  /** hls.js anexa a mídia ao `<video>`; nesse caso não devemos definir `src` diretamente. */
  skipSrc?: boolean;
}

export function clampTime(value: number, duration: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return duration > 0 && Number.isFinite(duration) ? Math.min(value, duration) : value;
}
