import { describe, expect, it } from 'vitest';
import { parseVideoUrl } from './parse';

describe('parseVideoUrl', () => {
  it('reconhece MP4 com query string', () => {
    const result = parseVideoUrl('https://cdn.example.com/videos/filme.mp4?token=abc');
    expect(result.ok).toBe(true);
    if (result.ok && !result.needsHead) {
      expect(result.source.kind).toBe('mp4');
      expect(result.source.url).toContain('filme.mp4?token=abc');
    }
  });

  it('reconhece WebM, M4V e HLS', () => {
    expect(parseVideoUrl('https://example.com/a.webm')).toMatchObject({ ok: true, needsHead: false });
    expect(parseVideoUrl('https://example.com/a.m4v')).toMatchObject({ ok: true, needsHead: false });
    const hls = parseVideoUrl('https://example.com/live/stream.m3u8');
    expect(hls.ok && !hls.needsHead && hls.source.kind).toBe('hls');
  });

  it('reconhece YouTube nos formatos suportados', () => {
    const cases = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
    ];

    for (const input of cases) {
      const result = parseVideoUrl(input);
      expect(result.ok && !result.needsHead && result.source.kind).toBe('youtube');
      if (result.ok && !result.needsHead) {
        expect(result.source.videoId).toBe('dQw4w9WgXcQ');
      }
    }
  });

  it('marca URLs sem extensão reconhecida para verificação via HEAD', () => {
    const result = parseVideoUrl('https://cdn.example.com/video/123');
    expect(result).toMatchObject({ ok: true, needsHead: true });
  });

  it('rejeita entradas vazias, inválidas e esquemas não suportados', () => {
    expect(parseVideoUrl('   ')).toMatchObject({ ok: false, code: 'EMPTY_URL' });
    expect(parseVideoUrl('isto nao é uma url')).toMatchObject({ ok: false, code: 'INVALID_URL' });
    expect(parseVideoUrl('ftp://example.com/video.mp4')).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_SCHEME',
    });
    expect(parseVideoUrl('https://user:pass@example.com/video.mp4')).toMatchObject({
      ok: false,
      code: 'CREDENTIALS_NOT_ALLOWED',
    });
  });

  it('rejeita links do YouTube sem um ID de vídeo reconhecível', () => {
    expect(parseVideoUrl('https://www.youtube.com/')).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_YOUTUBE_URL',
    });
    expect(parseVideoUrl('https://youtu.be/curto')).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_YOUTUBE_URL',
    });
  });
});
