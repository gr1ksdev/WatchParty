import type { SourceKind, VideoSource } from '@watchparty/shared';
import { parseVideoUrl, type LinkFailure } from './parse';

export type LinkValidation = { ok: true; source: VideoSource } | LinkFailure;

export interface ValidateOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
}

const KIND_BY_CONTENT_TYPE: Record<string, SourceKind> = {
  'video/mp4': 'mp4',
  'video/m4v': 'mp4',
  'video/webm': 'mp4',
  'application/vnd.apple.mpegurl': 'hls',
  'application/x-mpegurl': 'hls',
  'application/mpegurl': 'hls',
  'video/mpegurl': 'hls',
  'audio/mpegurl': 'hls',
};

function failure(code: string, message: string): LinkFailure {
  return { ok: false, code, message };
}

function isPrivateIpv4(host: string): boolean {
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [a = 0, b = 0, c = 0] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Converte um IPv6 (com compressão `::` e IPv4 embutido) em um inteiro de 128 bits. */
function ipv6ToBigInt(host: string): bigint | null {
  let normalized = host.toLowerCase();

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    if (lastColon === -1) return null;
    const octets = normalized.slice(lastColon + 1).split('.').map(Number);
    if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
      return null;
    }
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    const high = ((a << 8) | b).toString(16);
    const low = ((c << 8) | d).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 && missing < 0) return null;

  const groups = halves.length === 1 ? left : [...left, ...Array<string>(missing).fill('0'), ...right];
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function isPrivateIpv6(host: string): boolean {
  const value = ipv6ToBigInt(host);
  if (value === null) return false;

  if (value === 0n || value === 1n) return true;
  if (((value >> 120n) & 0xfen) === 0xfcn) return true; // fc00::/7 (unique local)
  if ((value >> 118n) === 0x3fan) return true; // fe80::/10 (link-local)
  if ((value >> 120n) === 0xffn) return true; // ff00::/8 (multicast)
  if ((value >> 96n) === 0x20010db8n) return true; // documentação

  if ((value >> 32n) === 0xffffn) {
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = Number(value & 0xffffffffn);
    return isPrivateIpv4([
      (mapped >>> 24) & 0xff,
      (mapped >>> 16) & 0xff,
      (mapped >>> 8) & 0xff,
      mapped & 0xff,
    ].join('.'));
  }

  return false;
}

/** Bloqueia literais IP privados, loopback, link-local e nomes internos conhecidos. */
export function assertPublicUrl(url: URL): LinkFailure | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return failure('UNSUPPORTED_SCHEME', 'Apenas links http:// e https:// são aceitos.');
  }
  if (url.username || url.password) {
    return failure('CREDENTIALS_NOT_ALLOWED', 'Links com usuário ou senha não são aceitos.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    return failure('INVALID_URL', 'O link informado não possui um host válido.');
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    return failure('PRIVATE_ADDRESS', 'Endereços internos não são aceitos.');
  }

  if (hostname.includes(':')) {
    return isPrivateIpv6(hostname)
      ? failure('PRIVATE_ADDRESS', 'Endereços IPv6 privados ou de loopback não são aceitos.')
      : null;
  }

  return isPrivateIpv4(hostname)
    ? failure('PRIVATE_ADDRESS', 'Endereços IP privados, loopback ou link-local não são aceitos.')
    : null;
}

async function resolveByHead(initial: URL, options: ValidateOptions): Promise<LinkValidation> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3000;
  const maxRedirects = options.maxRedirects ?? 3;

  let current = initial;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const guard = assertPublicUrl(current);
    if (guard) return guard;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetchImpl(current.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      return failure('HEAD_FAILED', 'Não foi possível verificar o link. Verifique se a URL está acessível.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      if (hop === maxRedirects) {
        return failure('REDIRECT_LIMIT', 'O link redireciona muitas vezes.');
      }
      const location = response.headers.get('location');
      if (!location) {
        return failure('INVALID_REDIRECT', 'O redirecionamento não informou um destino.');
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return failure('INVALID_REDIRECT', 'O redirecionamento aponta para uma URL inválida.');
      }
      const redirectGuard = assertPublicUrl(next);
      if (redirectGuard) return redirectGuard;
      current = next;
      continue;
    }

    if (!response.ok) {
      return failure('HEAD_FAILED', `O servidor respondeu HTTP ${response.status} ao verificar o link.`);
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      ?.trim()
      .toLowerCase() ?? '';
    const kind = KIND_BY_CONTENT_TYPE[contentType];
    if (!kind) {
      return failure(
        'UNSUPPORTED_CONTENT_TYPE',
        `Tipo de conteúdo não suportado (${contentType || 'não informado'}). Use MP4, WebM ou HLS.`,
      );
    }

    return { ok: true, source: { kind, url: current.toString() } };
  }

  return failure('REDIRECT_LIMIT', 'O link redireciona muitas vezes.');
}

/** Valida e normaliza a URL informada, identificando o tipo de fonte. */
export async function validateVideoUrl(input: string, options: ValidateOptions = {}): Promise<LinkValidation> {
  const parsed = parseVideoUrl(input);
  if (!parsed.ok) return parsed;

  if (parsed.needsHead) {
    return resolveByHead(parsed.url, options);
  }

  if (parsed.source.kind !== 'youtube') {
    const guard = assertPublicUrl(new URL(parsed.source.url));
    if (guard) return guard;
  }

  return { ok: true, source: parsed.source };
}
