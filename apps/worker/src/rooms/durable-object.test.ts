import { describe, expect, it } from 'vitest';
import type { NewRoomInput } from '@watchparty/shared';
import type { Env } from '../env';
import { RoomDO } from './durable-object';

class MemoryStorage {
  readonly data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | null | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

const input: NewRoomInput = {
  id: 'ABC12345',
  source: { kind: 'hls', url: 'https://example.com/live/stream.m3u8' },
  hostId: '777',
};

const env = {
  TELEGRAM_BOT_TOKEN: 'token',
  TELEGRAM_WEBHOOK_SECRET: 'secret',
  MINI_APP_URL: 'https://mini.pages.dev',
} as Env;

function createRoomDO(storage = new MemoryStorage()): { room: RoomDO; storage: MemoryStorage } {
  const state = { storage } as unknown as DurableObjectState;
  return { room: new RoomDO(state, env), storage };
}

function initRequest(body: unknown): Request {
  return new Request('https://room.internal/init', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('RoomDO', () => {
  it('cria e persiste uma sala com estado inicial pausado', async () => {
    const { room, storage } = createRoomDO();

    const response = await room.fetch(initRequest(input));
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: 'ABC12345',
      hostId: '777',
      source: { kind: 'hls' },
      playing: false,
      position: 0,
      version: 0,
      settings: { allowGuestControl: false },
      participants: [],
      chat: [],
    });
    expect(storage.data.has('state')).toBe(true);
  });

  it('é idempotente e permite ler o estado persistido', async () => {
    const { room } = createRoomDO();
    await room.fetch(initRequest(input));

    const second = await room.fetch(initRequest({ ...input, hostId: '999' }));
    expect(second.status).toBe(200);
    expect(((await second.json()) as { hostId: string }).hostId).toBe('777');

    const read = await room.fetch(new Request('https://room.internal/state'));
    expect(read.status).toBe(200);
    expect((await read.json()) as { id: string }).toMatchObject({ id: 'ABC12345' });
  });

  it('rejeita payloads inválidos e rotas desconhecidas', async () => {
    const { room } = createRoomDO();

    expect((await room.fetch(initRequest({ id: 'invalido' }))).status).toBe(400);
    expect((await room.fetch(new Request('https://room.internal/state'))).status).toBe(404);
    expect((await room.fetch(new Request('https://room.internal/other'))).status).toBe(404);
  });
});
