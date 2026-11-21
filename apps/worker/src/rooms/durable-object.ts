import { DurableObject } from 'cloudflare:workers';
import { newRoomInputSchema } from '@watchparty/shared';
import type { Env } from '../env';
import { json } from '../utils/json';
import { RoomStore } from './state';

/**
 * Uma instância por sala. Nesta etapa expõe apenas a inicialização e uma leitura
 * interna de estado; WebSocket, chat e sincronização pertencem à Etapa 3.
 */
export class RoomDO extends DurableObject<Env> {
  private readonly store: RoomStore;

  constructor(private readonly state: DurableObjectState, env: Env) {
    super(state, env);
    this.store = new RoomStore(state.storage);
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

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
}
