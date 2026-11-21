import { describe, expect, it } from 'vitest';
import { createRoomState, RoomStore, ROOM_STATE_KEY, type RoomStorage } from './state';
import type { NewRoomInput } from '@watchparty/shared';

class MemoryStorage implements RoomStorage {
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
  source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
  hostId: '777',
};

describe('criação e inicialização de salas', () => {
  it('cria o estado inicial pausado, sem participantes e com controle restrito ao host', () => {
    const state = createRoomState(input, 1_700_000_000_000);

    expect(state).toMatchObject({
      id: 'ABC12345',
      hostId: '777',
      playing: false,
      position: 0,
      version: 0,
      updatedAt: 1_700_000_000_000,
      settings: { allowGuestControl: false },
      participants: [],
      chat: [],
    });
  });

  it('persiste a sala e é idempotente em chamadas repetidas', async () => {
    const storage = new MemoryStorage();
    const store = new RoomStore(storage);

    const first = await store.initialize(input, 100);
    const second = await store.initialize(
      { ...input, hostId: 'outro-usuario' },
      999,
    );

    expect(second).toEqual(first);
    expect(storage.data.has(ROOM_STATE_KEY)).toBe(true);
    expect((await store.read())?.hostId).toBe('777');
  });

  it('rejeita estado armazenado corrompido', async () => {
    const storage = new MemoryStorage();
    storage.data.set(ROOM_STATE_KEY, { id: 'invalido' });
    const store = new RoomStore(storage);

    await expect(store.read()).rejects.toThrow('inválido');
    await expect(store.initialize(input)).rejects.toThrow('inválido');
  });

  it('retorna null quando a sala ainda não foi inicializada', async () => {
    expect(await new RoomStore(new MemoryStorage()).read()).toBeNull();
  });
});
