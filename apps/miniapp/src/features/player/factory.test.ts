// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPlayerAdapter, resolveAdapterKind } from './factory';
import type { AdapterOptions } from './types';

function options(overrides: Partial<AdapterOptions> = {}): AdapterOptions {
  const video = document.createElement('video');
  return {
    source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
    video,
    container: document.createElement('div'),
    onError: vi.fn(),
    onStatus: vi.fn(),
    ...overrides,
  };
}

describe('fábrica de players', () => {
  it('seleciona o adaptador pelo tipo de fonte', () => {
    expect(resolveAdapterKind({ kind: 'mp4', url: 'https://e.com/a.mp4' })).toBe('html5');
    expect(resolveAdapterKind({ kind: 'hls', url: 'https://e.com/a.m3u8' })).toBe('hls');
    expect(resolveAdapterKind({ kind: 'youtube', url: 'https://e.com', videoId: 'abcdefghijk' })).toBe(
      'youtube',
    );
  });

  it('carrega MP4 no elemento HTML5 e expõe as operações padronizadas', () => {
    const config = options();
    const controller = createPlayerAdapter(config);

    expect(config.video?.getAttribute('src')).toBe('https://example.com/video.mp4');
    expect(controller.getCurrentTime()).toBe(0);
    controller.play();
    controller.pause();
    controller.seekTo(12);
    expect(config.video?.currentTime).toBe(12);
    controller.destroy();
    expect(config.video?.getAttribute('src')).toBeNull();
  });

  it('reporta erros de mídia com uma mensagem clara', () => {
    const config = options();
    createPlayerAdapter(config);
    Object.defineProperty(config.video, 'error', { configurable: true, value: { code: 4 } });
    config.video?.dispatchEvent(new Event('error'));

    expect(config.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'HTML5_MEDIA_ERROR_4', source: 'mp4' }),
    );
  });

  it('falha com mensagem explícita quando não há elemento de vídeo', () => {
    expect(() => createPlayerAdapter(options({ video: null }))).toThrow(/<video>/);
  });
});
