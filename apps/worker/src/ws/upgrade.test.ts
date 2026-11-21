import { describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@watchparty/shared';
import { issueTicket } from '../auth/ticket';
import type { Env } from '../env';
import { json } from '../utils/json';
import { handleWebSocketUpgrade } from './upgrade';

const BOT_TOKEN = '123456:token-de-teste';
const ROOM_ID = 'ABC12345';

const room: RoomState = {
  id: ROOM_ID,
  source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
  hostId: '777',
  playing: false,
  position: 0,
  updatedAt: 1_700_000_000_000,
  version: 0,
  settings: { allowGuestControl: false },
  participants: [],
  chat: [],
};

function harness(options: { room?: RoomState | null; failRead?: boolean } = {}) {
  const forwarded: Request[] = [];
  const state = options.room === null ? null : (options.room ?? room);
  const rooms = {
    idFromName: () => 'room-id',
    get: () => ({
      async fetch(request: Request) {
        if (request.url.includes('/state')) {
          if (options.failRead) return json({ ok: false }, 500);
          return state ? json(state) : json({ ok: false, error: 'room_not_found' }, 404);
        }
        forwarded.push(request);
        // Node não permite status 101 em Response; no Worker real o DO devolve 101.
        return new Response(null, { status: 200 });
      },
    }),
  } as unknown as Env['ROOMS'];
  const env = { ROOMS: rooms, TELEGRAM_BOT_TOKEN: BOT_TOKEN } as Env;
  return { env, forwarded };
}

function upgradeRequest(roomId = ROOM_ID, ticket?: string | null, upgrade = 'websocket'): Request {
  const query = ticket === undefined ? '' : `?ticket=${encodeURIComponent(ticket ?? '')}`;
  return new Request(`https://worker.example/ws/${roomId}${query}`, {
    headers: upgrade ? { upgrade } : {},
  });
}

describe('upgrade WebSocket', () => {
  it('valida ticket, verifica a sala e injeta a identidade no Durable Object', async () => {
    const { env, forwarded } = harness();
    const { ticket } = await issueTicket({ userId: '777', firstName: 'Ana', username: 'ana' }, env);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await handleWebSocketUpgrade(upgradeRequest(ROOM_ID, ticket), env, ROOM_ID);
    expect(response.status).toBe(200);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.headers.get('x-user-id')).toBe('777');
    expect(forwarded[0]?.headers.get('x-user-first-name')).toBe('Ana');
    expect(forwarded[0]?.headers.get('x-user-username')).toBe('ana');
    expect(forwarded[0]?.headers.get('upgrade')).toBe('websocket');
    expect(log.mock.calls.flat().join(' ')).not.toContain(ticket);
    log.mockRestore();
  });

  it('rejeita ticket ausente, inválido e expirado', async () => {
    const { env, forwarded } = harness();
    const missing = await handleWebSocketUpgrade(upgradeRequest(ROOM_ID), env, ROOM_ID);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: 'MISSING_TICKET' });

    const invalid = await handleWebSocketUpgrade(upgradeRequest(ROOM_ID, 'ticket-invalido'), env, ROOM_ID);
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toMatchObject({ error: 'INVALID_TICKET' });

    const now = Math.floor(Date.now() / 1000) - 120;
    const { ticket } = await issueTicket({ userId: '777', firstName: 'Ana' }, env, now);
    const expired = await handleWebSocketUpgrade(upgradeRequest(ROOM_ID, ticket), env, ROOM_ID);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ error: 'TICKET_EXPIRED' });
    expect(forwarded).toHaveLength(0);
  });

  it('rejeita ID inválido, pedido sem upgrade e sala inexistente', async () => {
    const { env } = harness();
    const { ticket } = await issueTicket({ userId: '777', firstName: 'Ana' }, env);

    expect((await handleWebSocketUpgrade(upgradeRequest('curto', ticket), env, 'curto')).status).toBe(400);
    expect((await handleWebSocketUpgrade(upgradeRequest(ROOM_ID, ticket, ''), env, ROOM_ID)).status).toBe(400);

    const missingRoom = harness({ room: null });
    const response = await handleWebSocketUpgrade(upgradeRequest(ROOM_ID, ticket), missingRoom.env, ROOM_ID);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'room_not_found' });
  });

  it('propaga falha de leitura da sala', async () => {
    const { env } = harness({ failRead: true });
    const { ticket } = await issueTicket({ userId: '777', firstName: 'Ana' }, env);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleWebSocketUpgrade(upgradeRequest(ROOM_ID, ticket), env, ROOM_ID);
    expect(response.status).toBe(500);
    spy.mockRestore();
  });
});
