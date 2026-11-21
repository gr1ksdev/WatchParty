import type { VideoSource } from '@watchparty/shared';

export interface LinkFailure {
  ok: false;
  code: string;
  message: string;
}

export type ParseResult =
  | { ok: true; needsHead: false; source: VideoSource }
  | { ok: true; needsHead: true; url: URL }
  | LinkFailure;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const FILE_PATTERN = /\.(mp4|m4v|webm|ogv)$/i;
const HLS_PATTERN = /\.m3u8$/i;

function failure(code: string, message: string): LinkFailure {
  return { ok: false, code, message };
}

function extractYouTubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const candidate = segments[0] ?? '';
    return YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
  }

  if (segments[0] === 'embed' || segments[0] === 'live' || segments[0] === 'shorts') {
    const candidate = segments[1] ?? '';
    return YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
  }

  if (segments[0] === 'watch') {
    const candidate = url.searchParams.get('v') ?? '';
    return YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
  }

  return null;
}

/**
 * Identificação síncrona da fonte. Links ambíguos são marcados com
 * `needsHead` e resolvidos em `validate.ts` via HEAD + content-type.
 */
export function parseVideoUrl(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return failure('EMPTY_URL', 'Informe um link de vídeo após o comando /play.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return failure('INVALID_URL', 'O link informado não é uma URL válida.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return failure('UNSUPPORTED_SCHEME', 'Apenas links http:// e https:// são aceitos.');
  }

  if (url.username || url.password) {
    return failure('CREDENTIALS_NOT_ALLOWED', 'Links com usuário ou senha não são aceitos.');
  }

  if (YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return failure(
        'UNSUPPORTED_YOUTUBE_URL',
        'Link do YouTube não reconhecido. Use youtube.com/watch?v=..., youtu.be/..., /embed/, /live/ ou /shorts/.',
      );
    }
    return {
      ok: true,
      needsHead: false,
      source: {
        kind: 'youtube',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoId,
      },
    };
  }

  if (HLS_PATTERN.test(url.pathname)) {
    return { ok: true, needsHead: false, source: { kind: 'hls', url: url.toString() } };
  }

  if (FILE_PATTERN.test(url.pathname)) {
    return { ok: true, needsHead: false, source: { kind: 'mp4', url: url.toString() } };
  }

  return { ok: true, needsHead: true, url };
}
