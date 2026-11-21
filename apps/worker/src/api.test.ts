import { describe, expect, it } from 'vitest';
import type { RoomState } from '@watchparty/shared';
import { handleApiRequest } from './api';
import type { Env } from './env';
import worker from './index';
import { buildFakeInitData } from './auth/fake';
import { issueTicket } from './auth/ticket';
import { buildSignedInitData } from './test/init-data';
import { json } from './utils/json';

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

function createEnv(roomState: RoomState | null = room, overrides: Partial<Env> = {}): Env {
  const rooms = {
    idFromName: () => 'room-id',
    get: () => ({
      async fetch() {
        return roomState ? json(roomState) : json({ ok: false, error: 'room_not_found' }, 404);
      },
    }),
  } as unknown as Env['ROOMS'];

  return {
    ROOMS: rooms,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
    MINI_APP_URL: 'https://mini.pages.dev',
    ...overrides,
  } as Env;
}

async function createSessionRequest(initData: string): Promise<Request> {
  return new Request('https://worker.example/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
}

function roomRequest(ticket: string | null, roomId = ROOM_ID): Request {
  return new Request(`https://worker.example/api/rooms/${roomId}`, {
    headers: ticket ? { authorization: `Bearer ${ticket}` } : {},
  });
}

describe('API do Mini App', () => {
  it('troca initData válido por ticket e dados do usuário', async () => {
    const env = createEnv();
    const response = await handleApiRequest(
      await createSessionRequest(await buildSignedInitData(BOT_TOKEN, { startParam: ROOM_ID })),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      startParam: ROOM_ID,
      user: { id: '777', firstName: 'Ana', photoUrl: 'https://example.com/ana.png' },
    });
    expect(typeof body.ticket).toBe('string');
  });

  it('rejeita initData inválido e corpo malformado', async () => {
    const env = createEnv();
    expect((await handleApiRequest(await createSessionRequest('invalido'), env)).status).toBe(401);
    expect(
      (await handleApiRequest(new Request('https://worker.example/api/session', { method: 'POST', body: 'x' }), env))
        .status,
    ).toBe(400);
  });

  it('exige ticket para ler a sala e marca o papel do visitante', async () => {
    const env = createEnv();
    expect((await handleApiRequest(roomRequest(null), env)).status).toBe(401);

    const { ticket } = await issueTicket({ userId: '777', firstName: 'Ana' }, env);
    const response = await handleApiRequest(roomRequest(ticket), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      room: { id: ROOM_ID, hostId: '777' },
      viewer: { userId: '777', isHost: true },
    });

    const guest = await issueTicket({ userId: '999', firstName: 'Bia' }, env);
    const guestResponse = await handleApiRequest(roomRequest(guest.ticket), env);
    expect(await guestResponse.json()).toMatchObject({ viewer: { isHost: false } });
  });

  it('trata ticket expirado, ID inválido e sala inexistente', async () => {
    const now = Math.floor(Date.now() / 1000) - 120;
    const env = createEnv();
    const { ticket } = await issueTicket({ userId: '777', firstName: 'Ana' }, env, now);

    const expired = await handleApiRequest(roomRequest(ticket), env);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ error: 'TICKET_EXPIRED' });

    const validTicket = (await issueTicket({ userId: '777', firstName: 'Ana' }, env)).ticket;
    const invalid = await handleApiRequest(roomRequest(validTicket, 'invalido'), env);
    expect(invalid.status).toBe(400);

    const missing = await handleApiRequest(roomRequest((await issueTicket({ userId: '777', firstName: 'Ana' }, env)).ticket), createEnv(null));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: 'room_not_found' });
  });

  it('cria sala no modo dev apenas com a flag habilitada', async () => {
    const disabled = await handleApiRequest(
      new Request('https://worker.example/api/dev/rooms', { method: 'POST', body: '{}' }),
      createEnv(),
    );
    expect(disabled.status).toBe(404);

    const env = createEnv(room, { ALLOW_FAKE_INIT_DATA: '1' });
    const response = await handleApiRequest(
      new Request('https://worker.example/api/dev/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          initData: buildFakeInitData({ userId: 777, firstName: 'Dev' }),
          source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
        }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, roomId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{8}$/) });
  });

  it('aplica CORS apenas às origens permitidas e responde ao preflight', async () => {
    const env = createEnv();
    const fetchHandler = worker.fetch as (request: Request, env: Env) => Promise<Response>;
    const allowed = new Request('https://worker.example/api/rooms/ABC12345', {
      headers: { origin: 'https://mini.pages.dev' },
    });
    const response = await fetchHandler(allowed, env);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mini.pages.dev');

    const denied = new Request('https://worker.example/api/rooms/ABC12345', {
      headers: { origin: 'https://evil.example' },
    });
    expect((await fetchHandler(denied, env)).headers.get('access-control-allow-origin')).toBeNull();

    const preflight = new Request('https://worker.example/api/session', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    });
    const preflightResponse = await fetchHandler(preflight, env);
    expect(preflightResponse.status).toBe(204);
    expect(preflightResponse.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});
