import type { AdapterEvent, AdapterContext, PauseOptions, PlayOptions, PlaybackState, PlayerAdapter } from '../engine/types';
import { PlayerEngineError } from '../engine/types';

/**
 * Placeholder para Google Drive.
 *
 * Links compartilhados não são reproduzíveis de forma confiável no navegador:
 * arquivos privados exigem OAuth, links públicos podem exibir a página de aviso
 * de vírus do Google, CORS é restritivo e Range nem sempre é honrado. Não há
 * intenção de burlar essas restrições. Este adaptador existe apenas para
 * documentar a limitação e servir de ponto de extensão futuro.
 */
export class GoogleDriveAdapter implements PlayerAdapter {
  readonly kind = 'google-drive' as const;

  constructor(_context: AdapterContext) {}

  subscribe(_listener: (event: AdapterEvent) => void): () => void {
    return () => {};
  }

  async load(): Promise<void> {
    throw new PlayerEngineError(
      'GOOGLE_DRIVE_UNSUPPORTED',
      'Vídeos do Google Drive ainda não são suportados. Use um link direto MP4/HLS ou YouTube.',
    );
  }

  async play(_options?: PlayOptions): Promise<void> {
    this.unsupported();
  }
  async pause(_options?: PauseOptions): Promise<void> {
    this.unsupported();
  }
  async seekTo(_seconds: number): Promise<void> {
    this.unsupported();
  }
  getCurrentTime(): number {
    return 0;
  }
  getDuration(): number {
    return 0;
  }
  getBuffered(): number {
    return 0;
  }
  getPlaybackState(): PlaybackState {
    return {
      status: 'error',
      currentTime: 0,
      duration: 0,
      buffered: 0,
      volume: 1,
      muted: false,
      sourceKind: null,
      error: {
        code: 'GOOGLE_DRIVE_UNSUPPORTED',
        message: 'Google Drive não é suportado nesta versão.',
      },
    };
  }
  setVolume(_volume: number): void {}
  setMuted(_muted: boolean): void {}
  destroy(): void {}

  private unsupported(): never {
    throw new PlayerEngineError('GOOGLE_DRIVE_UNSUPPORTED', 'Google Drive não é suportado nesta versão.');
  }
}
