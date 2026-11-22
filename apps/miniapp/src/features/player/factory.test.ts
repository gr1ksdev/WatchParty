// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createAdapter, isGoogleDriveUrl } from './engine/registry';
import type { AdapterContext } from './engine/types';

function context(url: string, kind: 'mp4' | 'hls' | 'youtube' = 'mp4'): AdapterContext {
  return {
    source: { kind, url, ...(kind === 'youtube' ? { videoId: 'abcdefghijk' } : {}) },
    video: document.createElement('video'),
    container: document.createElement('div'),
    commandTimeoutMs: 50,
  };
}

describe('registro de adaptadores', () => {
  it('seleciona o adaptador pelo tipo de fonte', () => {
    expect(createAdapter(context('https://e.com/a.mp4')).kind).toBe('mp4');
    expect(createAdapter(context('https://e.com/a.m3u8', 'hls')).kind).toBe('hls');
    expect(createAdapter(context('https://youtube.com/watch?v=abcdefghijk', 'youtube')).kind).toBe(
      'youtube',
    );
  });

  it('detecta Google Drive e devolve adaptador não suportado', async () => {
    const url = 'https://drive.google.com/file/d/abc/view';
    expect(isGoogleDriveUrl(url)).toBe(true);
    const adapter = createAdapter(context(url));
    expect(adapter.kind).toBe('google-drive');
    await expect(
      adapter.load({ kind: 'mp4', url }),
    ).rejects.toMatchObject({ code: 'GOOGLE_DRIVE_UNSUPPORTED' });
  });
});
