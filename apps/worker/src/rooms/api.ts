import {
  newRoomInputSchema,
  roomStateSchema,
  type RoomState,
  type VideoSource,
} from '@watchparty/shared';
import type { Env } from '../env';
import { generateRoomId, isValidRoomId } from '../utils/ids';

export interface CreateRoomInput {
  source: VideoSource;
  hostId: string;
}

/** Cria a sala no Durable Object correspondente ao ID gerado. */
export async function createRoom(env: Env, input: CreateRoomInput): Promise<RoomState> {
  const payload = newRoomInputSchema.parse({
    id: generateRoomId(),
    source: input.source,
    hostId: input.hostId,
  });

  const stub = env.ROOMS.get(env.ROOMS.idFromName(payload.id));
  const response = await stub.fetch(
    new Request('https://room.internal/init', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );

  if (!response.ok) {
    throw new Error(`Falha ao criar sala no Durable Object: HTTP ${response.status}`);
  }

  return roomStateSchema.parse(await response.json());
}

/** Lê o estado publicável de uma sala; `null` significa sala inexistente. */
export async function getRoom(env: Env, roomId: string): Promise<RoomState | null> {
  if (!isValidRoomId(roomId)) return null;

  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  const response = await stub.fetch(new Request('https://room.internal/state'));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Falha ao ler sala no Durable Object: HTTP ${response.status}`);
  }
  return roomStateSchema.parse(await response.json());
}
