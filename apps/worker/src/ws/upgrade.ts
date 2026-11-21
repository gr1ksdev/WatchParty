import { TicketError, verifyTicket } from '../auth/ticket';
import type { Env } from '../env';
import { getRoom } from '../rooms/api';
import { isValidRoomId } from '../utils/ids';
import { json } from '../utils/json';

/**
 * Gateway WebSocket: valida o ticket, verifica a sala e encaminha ao Durable Object
 * com a identidade injetada em headers. O ticket nunca é registrado em logs.
 */
export async function handleWebSocketUpgrade(
  request: Request,
  env: Env,
  roomId: string,
): Promise<Response> {
  if (!isValidRoomId(roomId)) {
    return json({ ok: false, error: 'invalid_room_id', message: 'ID de sala inválido.' }, 400);
  }
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return json({ ok: false, error: 'expected_websocket', message: 'Upgrade WebSocket necessário.' }, 400);
  }

  const ticket = new URL(request.url).searchParams.get('ticket');
  if (!ticket) {
    return json({ ok: false, error: 'MISSING_TICKET', message: 'Ticket ausente.' }, 401);
  }

  let claims;
  try {
    claims = await verifyTicket(ticket, env);
  } catch (error) {
    if (error instanceof TicketError) {
      return json({ ok: false, error: error.code, message: error.message }, 401);
    }
    return json({ ok: false, error: 'auth_unavailable', message: 'Não foi possível autenticar.' }, 500);
  }

  let room;
  try {
    room = await getRoom(env, roomId);
  } catch (error) {
    console.error('[ws] falha ao verificar sala', error);
    return json({ ok: false, error: 'room_read_failed', message: 'Não foi possível carregar a sala.' }, 500);
  }
  if (!room) {
    return json({ ok: false, error: 'room_not_found', message: 'Sala não encontrada.' }, 404);
  }

  // Copia os headers do handshake (Sec-WebSocket-Key etc.) e substitui a identidade.
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('authorization');
  headers.set('x-user-id', claims.userId);
  headers.set('x-user-first-name', claims.firstName);
  if (claims.username) headers.set('x-user-username', claims.username);
  else headers.delete('x-user-username');

  const internalRequest = new Request(`https://room.internal/ws?room=${encodeURIComponent(roomId)}`, {
    headers,
  });
  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  return stub.fetch(internalRequest);
}
