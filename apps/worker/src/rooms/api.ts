import {
  newRoomInputSchema,
  roomStateSchema,
  type RoomState,
  type VideoSource,
} from '@watchparty/shared';
import type { Env } from '../env';
import { generateRoomId } from '../utils/ids';

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
