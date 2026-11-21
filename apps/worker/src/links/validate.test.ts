import { describe, expect, it } from 'vitest';
import { assertPublicUrl, validateVideoUrl, type ValidateOptions } from './validate';

interface HeadResponse {
  status: number;
  headers: Record<string, string>;
}

function fakeFetch(responses: Record<string, HeadResponse>): ValidateOptions {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const response = responses[url];
    if (!response) throw new Error(`Unexpected HEAD for ${url}`);
    return new Response(null, { status: response.status, headers: response.headers });
  }) as unknown as typeof fetch;

  return { fetchImpl };
}

describe('assertPublicUrl (anti-SSRF)', () => {
  it('aceita hosts públicos', () => {
    expect(assertPublicUrl(new URL('https://example.com/video.mp4'))).toBeNull();
    expect(assertPublicUrl(new URL('http://8.8.8.8/video.mp4'))).toBeNull();
  });

  it('bloqueia IPv4 privado, loopback, link-local e metadata', () => {
    for (const host of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.16.0.1', '169.254.169.254', '0.0.0.0']) {
      expect(assertPublicUrl(new URL(`http://${host}/video.mp4`))?.code).toBe('PRIVATE_ADDRESS');
    }
  });

  it('bloqueia IPv6 loopback, link-local, unique-local e IPv4-mapped privado', () => {
    for (const host of ['[::1]', '[::]', '[fe80::1]', '[fc00::1]', '[::ffff:127.0.0.1]']) {
      expect(assertPublicUrl(new URL(`http://${host}/video.mp4`))?.code).toBe('PRIVATE_ADDRESS');
    }
  });

  it('bloqueia nomes internos e credenciais na URL', () => {
    expect(assertPublicUrl(new URL('http://localhost/video.mp4'))?.code).toBe('PRIVATE_ADDRESS');
    expect(assertPublicUrl(new URL('http://api.internal/video.mp4'))?.code).toBe('PRIVATE_ADDRESS');
    expect(assertPublicUrl(new URL('https://u:p@example.com/video.mp4'))?.code).toBe(
      'CREDENTIALS_NOT_ALLOWED',
    );
  });
});

describe('validateVideoUrl', () => {
  it('usa HEAD e content-type para URLs sem extensão', async () => {
    const options = fakeFetch({
      'https://cdn.example.com/video/123': {
        status: 200,
        headers: { 'content-type': 'Video/Mp4; charset=utf-8' },
      },
    });
    const result = await validateVideoUrl('https://cdn.example.com/video/123', options);
    expect(result).toMatchObject({ ok: true, source: { kind: 'mp4' } });
  });

  it('reconhece HLS pelo content-type', async () => {
    const options = fakeFetch({
      'https://cdn.example.com/stream/9': {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      },
    });
    const result = await validateVideoUrl('https://cdn.example.com/stream/9', options);
    expect(result.ok && result.source.kind).toBe('hls');
  });

  it('rejeita content-type não suportado e falhas de HEAD', async () => {
    const html = fakeFetch({
      'https://cdn.example.com/page': { status: 200, headers: { 'content-type': 'text/html' } },
    });
    expect((await validateVideoUrl('https://cdn.example.com/page', html)).ok).toBe(false);
    expect(await validateVideoUrl('https://cdn.example.com/page', html)).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_CONTENT_TYPE',
    });

    const forbidden = fakeFetch({
      'https://cdn.example.com/private': { status: 403, headers: {} },
    });
    expect(await validateVideoUrl('https://cdn.example.com/private', forbidden)).toMatchObject({
      ok: false,
      code: 'HEAD_FAILED',
    });
  });

  it('segue redirecionamentos, mas bloqueia destinos internos', async () => {
    const safe = fakeFetch({
      'https://cdn.example.com/redirect': {
        status: 302,
        headers: { location: 'https://cdn.example.com/final/video' },
      },
      'https://cdn.example.com/final/video': {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      },
    });
    expect(await validateVideoUrl('https://cdn.example.com/redirect', safe)).toMatchObject({
      ok: true,
      source: { kind: 'mp4', url: 'https://cdn.example.com/final/video' },
    });

    const unsafe = fakeFetch({
      'https://cdn.example.com/redirect': {
        status: 302,
        headers: { location: 'http://127.0.0.1/video.mp4' },
      },
    });
    expect(await validateVideoUrl('https://cdn.example.com/redirect', unsafe)).toMatchObject({
      ok: false,
      code: 'PRIVATE_ADDRESS',
    });
  });

  it('bloqueia links diretos com IP privado antes de fazer HEAD', async () => {
    const result = await validateVideoUrl('http://10.0.0.5/video.mp4', fakeFetch({}));
    expect(result).toMatchObject({ ok: false, code: 'PRIVATE_ADDRESS' });
  });
});
