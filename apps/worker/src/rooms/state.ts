import {
  newRoomInputSchema,
  roomStateSchema,
  type NewRoomInput,
  type RoomState,
} from '@watchparty/shared';

/** Subconjunto de DurableObjectStorage usado pela sala (facilita testes unitários). */
export interface RoomStorage {
  get<T = unknown>(key: string): Promise<T | null | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

export const ROOM_STATE_KEY = 'state';

/** Estado inicial: pausado, sem participantes e com controle restrito ao host. */
export function createRoomState(input: NewRoomInput, now: number = Date.now()): RoomState {
  return {
    id: input.id,
    source: input.source,
    hostId: input.hostId,
    playing: false,
    position: 0,
    updatedAt: now,
    version: 0,
    settings: { allowGuestControl: false },
    participants: [],
    chat: [],
  };
}

export class RoomStore {
  constructor(private readonly storage: RoomStorage) {}

  /** Inicializa uma sala uma única vez; chamadas repetidas são idempotentes. */
  async initialize(input: NewRoomInput, now?: number): Promise<RoomState> {
    const existing = await this.storage.get<unknown>(ROOM_STATE_KEY);
    if (existing !== null && existing !== undefined) {
      const parsed = roomStateSchema.safeParse(existing);
      if (!parsed.success) {
        throw new Error('Estado armazenado da sala é inválido');
      }
      return parsed.data;
    }

    const state = createRoomState(newRoomInputSchema.parse(input), now);
    await this.storage.put(ROOM_STATE_KEY, state);
    return state;
  }

  async read(): Promise<RoomState | null> {
    const stored = await this.storage.get<unknown>(ROOM_STATE_KEY);
    if (stored === null || stored === undefined) return null;
    const parsed = roomStateSchema.safeParse(stored);
    if (!parsed.success) {
      throw new Error('Estado armazenado da sala é inválido');
    }
    return parsed.data;
  }
}
