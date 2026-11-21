import { z } from 'zod';
import type { Env } from '../env';
import { fromBase64Url } from '../utils/base64url';
import type { ValidatedInitData } from './init-data';

/** Autenticação simulada, restrita a desenvolvimento local. */
export const FAKE_INIT_DATA_PREFIX = 'fake:';

const fakePayloadSchema = z.object({
  userId: z.number().int().positive(),
  firstName: z.string().min(1).max(64),
  username: z.string().max(64).optional(),
  startParam: z.string().max(64).optional(),
});

export function isFakeAuthEnabled(env: Env): boolean {
  return env.ALLOW_FAKE_INIT_DATA === '1';
}

export function buildFakeInitData(payload: z.input<typeof fakePayloadSchema>): string {
  const parsed = fakePayloadSchema.parse(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `${FAKE_INIT_DATA_PREFIX}${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/**
 * Aceita apenas initData explicitamente marcado como simulado e somente quando a flag
 * `ALLOW_FAKE_INIT_DATA=1` está presente (nunca configurada em produção).
 */
export function parseFakeInitData(raw: string, env: Env, nowSeconds?: number): ValidatedInitData | null {
  if (!isFakeAuthEnabled(env) || !raw.startsWith(FAKE_INIT_DATA_PREFIX)) return null;

  let payload: unknown;
  try {
    const json = new TextDecoder().decode(fromBase64Url(raw.slice(FAKE_INIT_DATA_PREFIX.length)));
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = fakePayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  return {
    user: {
      id: parsed.data.userId,
      first_name: parsed.data.firstName,
      ...(parsed.data.username ? { username: parsed.data.username } : {}),
    },
    authDate: now,
    startParam: parsed.data.startParam,
    raw,
  };
}
