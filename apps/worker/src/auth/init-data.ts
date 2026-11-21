import { z } from 'zod';
import { constantTimeEqual } from '../utils/strings';

/** Subconjunto de `WebAppUser` necessário para a interface e a sessão. */
export const telegramInitUserSchema = z.object({
  id: z.number().int(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
});
export type TelegramInitUser = z.infer<typeof telegramInitUserSchema>;

export interface ValidatedInitData {
  user: TelegramInitUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
  raw: string;
}

export const INIT_DATA_MAX_AGE_SECONDS = 10 * 60;
export const INIT_DATA_FUTURE_TOLERANCE_SECONDS = 30;

export class InitDataError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InitDataError';
  }
}

const encoder = new TextEncoder();
const HASH_PATTERN = /^[0-9a-f]{64}$/i;

export async function hmacSha256(key: CryptoKey | Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey =
    key instanceof Uint8Array
      ? await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      : key;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return new Uint8Array(signature);
}

async function hex(value: Uint8Array): Promise<string> {
  const words: string[] = [];
  for (const byte of value) {
    words.push(byte.toString(16).padStart(2, '0'));
  }
  return words.join('');
}

function parsePairs(raw: string): Array<[string, string]> {
  // O Telegram assina os VALORES DECODIFICADOS (por exemplo, `user` como JSON),
  // não os valores percent-encoded da query string.
  const params = new URLSearchParams(raw);
  const pairs: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (key && key !== 'hash') pairs.push([key, value]);
  });
  return pairs;
}

function toDataCheckString(pairs: Array<[string, string]>, sorted: boolean): string {
  const ordered = sorted
    ? [...pairs].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    : pairs;
  return ordered.map(([key, value]) => `${key}=${value}`).join('\n');
}

/**
 * Valida o `initData` do Telegram Web App: HMAC-SHA256 com chave derivada do token,
 * janela de `auth_date` e presença de usuário autenticado.
 *
 * A ordem alfabética dos campos é o formato documentado atualmente. A ordem original
 * também é aceita para compatibilidade com versões antigas dos clientes do Telegram;
 * ambas usam valores decodificados e a mesma chave secreta.
 */
export async function validateInitData(raw: string, botToken: string, nowSeconds?: number): Promise<ValidatedInitData> {
  if (!raw || raw.length > 8192) {
    throw new InitDataError('INVALID_INIT_DATA', 'initData ausente ou muito grande.');
  }

  const providedHash = new URLSearchParams(raw).get('hash') ?? '';
  if (!HASH_PATTERN.test(providedHash)) {
    throw new InitDataError('INVALID_INIT_DATA', 'Hash do initData inválido.');
  }

  const pairs = parsePairs(raw);
  if (pairs.length === 0) {
    throw new InitDataError('INVALID_INIT_DATA', 'initData não contém campos assinados.');
  }

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const candidates = [toDataCheckString(pairs, true), toDataCheckString(pairs, false)];
  let hashMatches = false;
  for (const candidate of candidates) {
    const expected = await hex(await hmacSha256(secretKey, candidate));
    if (constantTimeEqual(expected, providedHash.toLowerCase())) {
      hashMatches = true;
      break;
    }
  }
  if (!hashMatches) {
    throw new InitDataError('INVALID_INIT_DATA', 'Assinatura do initData inválida.');
  }

  const decoded = new URLSearchParams(raw);
  const authDate = Number(decoded.get('auth_date'));
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new InitDataError('INVALID_INIT_DATA', 'auth_date inválido.');
  }
  if (authDate > now + INIT_DATA_FUTURE_TOLERANCE_SECONDS) {
    throw new InitDataError('INIT_DATA_EXPIRED', 'initData com data no futuro.');
  }
  if (now - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    throw new InitDataError('INIT_DATA_EXPIRED', 'initData expirado.');
  }

  const rawUser = decoded.get('user');
  if (!rawUser) {
    throw new InitDataError('INVALID_INIT_DATA', 'initData não contém usuário autenticado.');
  }

  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(rawUser);
  } catch {
    throw new InitDataError('INVALID_INIT_DATA', 'Dados do usuário inválidos.');
  }
  const user = telegramInitUserSchema.safeParse(parsedUser);
  if (!user.success) {
    throw new InitDataError('INVALID_INIT_DATA', 'Dados do usuário inválidos.');
  }

  return {
    user: user.data,
    authDate,
    queryId: decoded.get('query_id') ?? undefined,
    startParam: decoded.get('start_param') ?? undefined,
    raw,
  };
}
