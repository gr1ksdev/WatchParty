import { z } from 'zod';
import type { Env } from '../env';
import { fromBase64Url, toBase64Url } from '../utils/base64url';
import { constantTimeEqual } from '../utils/strings';
import { hmacSha256 } from './init-data';

/** Ticket de curta duração: substitui o initData nas chamadas REST e, depois, no WS. */
export const TICKET_TTL_SECONDS = 60;

const ticketClaimsSchema = z.object({
  userId: z.string().min(1),
  firstName: z.string().min(1),
  username: z.string().optional(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});
export type TicketClaims = z.infer<typeof ticketClaimsSchema>;

export class TicketError extends Error {
  constructor(
    readonly code: 'INVALID_TICKET' | 'TICKET_EXPIRED',
    message: string,
  ) {
    super(message);
    this.name = 'TicketError';
  }
}

export interface TicketIdentity {
  userId: string;
  firstName: string;
  username?: string;
}

async function signingKey(env: Env): Promise<Uint8Array> {
  // Chave derivada do token do bot: nenhum segredo adicional precisa ser configurado.
  // O token continua exclusivamente no Worker.
  return hmacSha256(new TextEncoder().encode('WatchPartyTicket'), env.TELEGRAM_BOT_TOKEN);
}

export async function issueTicket(
  identity: TicketIdentity,
  env: Env,
  nowSeconds?: number,
): Promise<{ ticket: string; claims: TicketClaims }> {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const claims: TicketClaims = {
    userId: identity.userId,
    firstName: identity.firstName,
    ...(identity.username ? { username: identity.username } : {}),
    issuedAt: now,
    expiresAt: now + TICKET_TTL_SECONDS,
  };
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = toBase64Url(await hmacSha256(await signingKey(env), payload));
  return { ticket: `${payload}.${signature}`, claims };
}

export async function verifyTicket(ticket: string, env: Env, nowSeconds?: number): Promise<TicketClaims> {
  const parts = ticket.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TicketError('INVALID_TICKET', 'Ticket inválido.');
  }
  const [payload, providedSignature] = parts as [string, string];
  const expectedSignature = toBase64Url(await hmacSha256(await signingKey(env), payload));
  if (!constantTimeEqual(expectedSignature, providedSignature)) {
    throw new TicketError('INVALID_TICKET', 'Assinatura do ticket inválida.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    throw new TicketError('INVALID_TICKET', 'Ticket ilegível.');
  }
  const claims = ticketClaimsSchema.safeParse(decoded);
  if (!claims.success) {
    throw new TicketError('INVALID_TICKET', 'Ticket inválido.');
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (now >= claims.data.expiresAt) {
    throw new TicketError('TICKET_EXPIRED', 'Ticket expirado.');
  }
  if (claims.data.issuedAt > now + 30) {
    throw new TicketError('INVALID_TICKET', 'Ticket com data de emissão inválida.');
  }
  return claims.data;
}
