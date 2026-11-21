// @vitest-environment jsdom
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeNamespace, YouTubePlayerInstance } from '../../../types/youtube';
import type { AdapterOptions } from '../types';
import { createYouTubeAdapter } from './youtube';

interface FakeOptions {
  events?: {
    onReady?: (event: { target: YouTubePlayerInstance }) => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
  playerVars?: Record<string, string | number | boolean>;
}

class FakeYouTubePlayer implements YouTubePlayerInstance {
  static instances: FakeYouTubePlayer[] = [];
  static lastOptions: FakeOptions | null = null;
  playing = false;
  time = 0;
  destroyed = false;

  constructor(
    _element: HTMLElement,
    options: FakeOptions,
  ) {
    FakeYouTubePlayer.instances.push(this);
    FakeYouTubePlayer.lastOptions = options;
    queueMicrotask(() => options.events?.onReady?.({ target: this }));
  }

  playVideo() {
    this.playing = true;
  }
  pauseVideo() {
    this.playing = false;
  }
  seekTo(seconds: number) {
    this.time = seconds;
  }
  getCurrentTime() {
    return this.time;
  }
  getDuration() {
    return 120;
  }
  getPlayerState() {
    return this.playing ? 1 : 2;
  }
  mute = vi.fn();
  unMute = vi.fn();
  destroy() {
    this.destroyed = true;
  }
}

function options(overrides: Partial<AdapterOptions> = {}): AdapterOptions {
  return {
    source: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=abcdefghijk', videoId: 'abcdefghijk' },
    video: null,
    container: document.createElement('div'),
    onError: vi.fn(),
    onStatus: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  delete window.YT;
  document
    .querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')
    .forEach((element) => element.remove());
  FakeYouTubePlayer.instances = [];
  FakeYouTubePlayer.lastOptions = null;
});

describe('adaptador YouTube', () => {
  it('cria o player via IFrame API e aplica comandos enviados antes do ready', async () => {
    window.YT = { Player: FakeYouTubePlayer } as unknown as YouTubeNamespace;
    const config = options();
    const controller = createYouTubeAdapter(config);

    controller.play();
    controller.seekTo(30);

    await waitFor(() => expect(FakeYouTubePlayer.instances).toHaveLength(1));
    const player = FakeYouTubePlayer.instances[0];
    expect(player?.playing).toBe(true);
    expect(player?.time).toBe(30);
    expect(config.onStatus).toHaveBeenCalled();
    expect(controller.getDuration()).toBe(120);
    expect(FakeYouTubePlayer.lastOptions?.playerVars?.playsinline).toBe(1);

    controller.destroy();
    expect(player?.destroyed).toBe(true);
  });

  it('inicia sem som quando o autoplay com áudio é bloqueado', async () => {
    window.YT = { Player: FakeYouTubePlayer } as unknown as YouTubeNamespace;
    const controller = createYouTubeAdapter(options());
    controller.play({ muted: true });

    await waitFor(() => expect(FakeYouTubePlayer.instances).toHaveLength(1));
    const player = FakeYouTubePlayer.instances[0];
    expect(player?.mute).toHaveBeenCalled();
    expect(player?.playing).toBe(true);
    controller.destroy();
  });

  it('reafirma o pause se o iframe notificar reprodução depois do comando', async () => {
    window.YT = { Player: FakeYouTubePlayer } as unknown as YouTubeNamespace;
    const controller = createYouTubeAdapter(options());
    controller.play();
    await waitFor(() => expect(FakeYouTubePlayer.instances).toHaveLength(1));
    const player = FakeYouTubePlayer.instances[0];
    const pauseSpy = vi.spyOn(player!, 'pauseVideo');

    controller.pause();
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    FakeYouTubePlayer.lastOptions?.events?.onStateChange?.({ data: 1 });
    expect(pauseSpy).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('traduz erros de incorporação da API', async () => {
    window.YT = { Player: FakeYouTubePlayer } as unknown as YouTubeNamespace;
    const config = options();
    createYouTubeAdapter(config);
    await waitFor(() => expect(FakeYouTubePlayer.instances).toHaveLength(1));

    FakeYouTubePlayer.lastOptions?.events?.onError?.({ data: 150 });
    expect(config.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'YOUTUBE_150', source: 'youtube' }),
    );
    const message = vi.mocked(config.onError).mock.calls[0]?.[0]?.message ?? '';
    expect(message).toContain('incorporá-lo');
  });

  it('reporta falha ao carregar a API', async () => {
    delete window.YT;
    const config = options();
    const controller = createYouTubeAdapter(config);
    // Sem window.YT o adaptador injeta o script; simulamos a falha de carregamento.
    const apiScript = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    apiScript?.dispatchEvent(new Event('error'));

    await waitFor(() => expect(config.onError).toHaveBeenCalled());
    expect(vi.mocked(config.onError).mock.calls[0]?.[0]?.code).toBe('YOUTUBE_API_UNAVAILABLE');
    controller.destroy();
    apiScript?.remove();
  });
});
