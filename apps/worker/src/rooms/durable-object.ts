import { DurableObject } from 'cloudflare:workers';
import { newRoomInputSchema } from '@watchparty/shared';
import { z } from 'zod';
import type { Env } from '../env';
import { json } from '../utils/json';
import { RoomRuntime, type RoomConnection } from './runtime';
import { RoomStore } from './state';

const HEARTBEAT_ALARM_MS = 20_000;

/** Identidade injetada pelo Worker no upgrade — nunca lida do cliente. */
const wsIdentitySchema = z.object({
  userId: z.string().min(1),
  firstName: z.string().min(1),
  username: z.string().optional(),
});

/**
 * Uma instância por sala. Autoridade sobre estado, presença e chat.
 * O `RoomRuntime` concentra as regras; esta classe apenas adapta WebSocket/HTTP.
 */
export class RoomDO extends DurableObject<Env> {
  private readonly store: RoomStore;
  private runtime: RoomRuntime | null = null;
  private readonly sockets = new Map<WebSocket, RoomConnection>();

  constructor(private readonly state: DurableObjectState, env: Env) {
    super(state, env);
    this.store = new RoomStore(state.storage);
  }

  private get roomRuntime(): RoomRuntime {
    this.runtime ??= new RoomRuntime(this.store);
    return this.runtime;
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      return this.handleWebSocket(request);
    }

    if (pathname === '/init' && request.method === 'PUT') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: 'invalid_json' }, 400);
      }

      const parsed = newRoomInputSchema.safeParse(body);
      if (!parsed.success) {
        return json({ ok: false, error: 'invalid_room_input' }, 400);
      }

      try {
        const roomState = await this.store.initialize(parsed.data);
        return json(roomState);
      } catch (error) {
        console.error('[room-do] falha ao inicializar sala', error);
        return json({ ok: false, error: 'room_init_failed' }, 500);
      }
    }

    if (pathname === '/state' && request.method === 'GET') {
      try {
        const roomState = await this.store.read();
        return roomState ? json(roomState) : json({ ok: false, error: 'room_not_found' }, 404);
      } catch (error) {
        console.error('[room-do] falha ao ler sala', error);
        return json({ ok: false, error: 'room_read_failed' }, 500);
      }
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const identity = wsIdentitySchema.safeParse({
      userId: request.headers.get('x-user-id') ?? '',
      firstName: request.headers.get('x-user-first-name') ?? '',
      username: request.headers.get('x-user-username') ?? undefined,
    });
    if (!identity.success) {
      return json({ ok: false, error: 'missing_identity' }, 401);
    }
    if (!(await this.store.read())) {
      return json({ ok: false, error: 'room_not_found' }, 404);
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]] as [WebSocket, WebSocket];
    this.state.acceptWebSocket(server);

    const connection: RoomConnection = {
      key: crypto.randomUUID(),
      userId: identity.data.userId,
      firstName: identity.data.firstName,
      ...(identity.data.username ? { username: identity.data.username } : {}),
      send: (message) => server.send(JSON.stringify(message)),
      close: (code, reason) => server.close(code, reason),
    };
    server.serializeAttachment({ key: connection.key });
    this.sockets.set(server, connection);
    await this.roomRuntime.connect(connection);
    await this.scheduleAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const connection = this.sockets.get(ws);
    if (!connection) return;
    await this.roomRuntime.handleMessage(connection, message);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleSocketGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleSocketGone(ws);
  }

  /** Alarm periódico: remove participantes sem atividade por mais de 60 s. */
  async alarm(): Promise<void> {
    await this.roomRuntime.heartbeat(Date.now());
    await this.scheduleAlarm();
  }

  private async handleSocketGone(ws: WebSocket): Promise<void> {
    const connection = this.sockets.get(ws);
    if (!connection) return;
    this.sockets.delete(ws);
    await this.roomRuntime.disconnect(connection.key);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    if (this.roomRuntime.connectionCount === 0) return;
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_ALARM_MS);
  }
}
