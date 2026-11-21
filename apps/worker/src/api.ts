import { videoSourceSchema } from '@watchparty/shared';
import { z } from 'zod';
import { isFakeAuthEnabled } from './auth/fake';
import { InitDataError } from './auth/init-data';
import { authenticateInitData } from './auth/session';
import { issueTicket, TicketError, verifyTicket } from './auth/ticket';
import type { Env } from './env';
import { createRoom, getRoom } from './rooms/api';
import { isValidRoomId } from './utils/ids';
import { json } from './utils/json';

const sessionBodySchema = z.object({
  initData: z.string().min(1).max(8192),
});

const ROOM_PATH = /^\/api\/rooms\/([^/]+)$/;
const DEV_ROOM_BODY = z.object({
  initData: z.string().min(1).max(8192),
  source: videoSourceSchema,
});

function unauthorized(code: string, message: string): Response {
  return json({ ok: false, error: code, message }, 401);
}

function readTicket(request: Request, url: URL): string | null {
  const header = request.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  return bearer?.[1]?.trim() || url.searchParams.get('ticket') || null;
}

/** API REST usada pelo Mini App para abrir uma sessão e ler os metadados da sala. */
export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // Apenas desenvolvimento: cria uma sala sem Telegram para testar o WebSocket.
  // Existe somente com ALLOW_FAKE_INIT_DATA=1 e reutiliza a autenticação padrão.
  if (pathname === '/api/dev/rooms' && request.method === 'POST' && isFakeAuthEnabled(env)) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }
    const parsed = DEV_ROOM_BODY.safeParse(body);
    if (!parsed.success) {
      return json({ ok: false, error: 'invalid_request' }, 400);
    }
    try {
      const identity = await authenticateInitData(parsed.data.initData, env);
      const room = await createRoom(env, { source: parsed.data.source, hostId: identity.userId });
      return json({ ok: true, roomId: room.id });
    } catch (error) {
      if (error instanceof InitDataError) return unauthorized(error.code, error.message);
      console.error('[api] falha ao criar sala de desenvolvimento', error);
      return json({ ok: false, error: 'dev_room_failed' }, 500);
    }
  }

  if (pathname === '/api/session' && request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'invalid_json', message: 'Corpo inválido.' }, 400);
    }
    const parsed = sessionBodySchema.safeParse(body);
    if (!parsed.success) {
      return json({ ok: false, error: 'invalid_request', message: 'initData é obrigatório.' }, 400);
    }

    let identity;
    try {
      identity = await authenticateInitData(parsed.data.initData, env);
    } catch (error) {
      if (error instanceof InitDataError) {
        return unauthorized(error.code, error.message);
      }
      console.error('[api] falha ao validar initData', error);
      return json({ ok: false, error: 'auth_unavailable', message: 'Não foi possível autenticar.' }, 500);
    }

    const { ticket, claims } = await issueTicket(identity, env);
    return json({
      ok: true,
      ticket,
      expiresAt: claims.expiresAt,
      user: {
        id: identity.userId,
        firstName: identity.firstName,
        ...(identity.username ? { username: identity.username } : {}),
        ...(identity.photoUrl ? { photoUrl: identity.photoUrl } : {}),
      },
      ...(identity.startParam ? { startParam: identity.startParam } : {}),
    });
  }

  const roomMatch = ROOM_PATH.exec(pathname);
  if (roomMatch && request.method === 'GET') {
    const ticket = readTicket(request, url);
    if (!ticket) {
      return unauthorized('MISSING_TICKET', 'Ticket ausente. Abra a sala novamente.');
    }

    let claims;
    try {
      claims = await verifyTicket(ticket, env);
    } catch (error) {
      if (error instanceof TicketError) {
        return unauthorized(error.code, error.message);
      }
      console.error('[api] falha ao verificar ticket', error);
      return json({ ok: false, error: 'auth_unavailable', message: 'Não foi possível autenticar.' }, 500);
    }

    const roomId = roomMatch[1];
    if (!roomId || !isValidRoomId(roomId)) {
      return json({ ok: false, error: 'invalid_room_id', message: 'ID de sala inválido.' }, 400);
    }

    let room;
    try {
      room = await getRoom(env, roomId);
    } catch (error) {
      console.error('[api] falha ao ler sala', error);
      return json({ ok: false, error: 'room_read_failed', message: 'Não foi possível carregar a sala.' }, 500);
    }
    if (!room) {
      return json({ ok: false, error: 'room_not_found', message: 'Sala não encontrada.' }, 404);
    }

    return json({
      ok: true,
      room,
      viewer: { userId: claims.userId, isHost: claims.userId === room.hostId },
    });
  }

  return json({ ok: false, error: 'not_found', message: 'Rota não encontrada.' }, 404);
}
