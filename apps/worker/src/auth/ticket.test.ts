import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { issueTicket, TICKET_TTL_SECONDS, TicketError, verifyTicket } from './ticket';

const env = { TELEGRAM_BOT_TOKEN: '123456:token-de-teste' } as Env;
const identity = { userId: '777', firstName: 'Ana', username: 'ana' };

describe('ticket assinado', () => {
  it('emite e verifica um ticket com as Claims esperadas', async () => {
    const now = 1_800_000_000;
    const { ticket, claims } = await issueTicket(identity, env, now);

    expect(claims).toEqual({
      userId: '777',
      firstName: 'Ana',
      username: 'ana',
      issuedAt: now,
      expiresAt: now + TICKET_TTL_SECONDS,
    });
    expect(await verifyTicket(ticket, env, now + 1)).toMatchObject({ userId: '777', firstName: 'Ana' });
  });

  it('rejeita ticket adulterado, ilegível ou assinado com outro token', async () => {
    const { ticket } = await issueTicket(identity, env, 1_800_000_000);
    const [payload, signature] = ticket.split('.');

    await expect(verifyTicket(`${payload}.${signature}x`, env, 1_800_000_000)).rejects.toMatchObject({
      code: 'INVALID_TICKET',
    });
    await expect(verifyTicket('abc', env, 1_800_000_000)).rejects.toBeInstanceOf(TicketError);
    await expect(verifyTicket(ticket, { TELEGRAM_BOT_TOKEN: 'outro' } as Env, 1_800_000_000)).rejects.toMatchObject({
      code: 'INVALID_TICKET',
    });
  });

  it('rejeita ticket expirado', async () => {
    const now = 1_800_000_000;
    const { ticket } = await issueTicket(identity, env, now);
    await expect(verifyTicket(ticket, env, now + TICKET_TTL_SECONDS)).rejects.toMatchObject({
      code: 'TICKET_EXPIRED',
    });
  });
});
