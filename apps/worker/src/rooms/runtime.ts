import {
  CHAT_RATE_MS,
  clientMessageSchema,
  CONTROL_RATE_MAX,
  CONTROL_RATE_WINDOW_MS,
  MAX_CHAT_HISTORY,
  MAX_CHAT_TEXT_LENGTH,
  MAX_PARTICIPANTS,
  MAX_WS_MESSAGE_BYTES,
  PARTICIPANT_TIMEOUT_MS,
  type Participant,
  type ServerMessage,
} from '@watchparty/shared';
import { RoomStore } from './state';

/** Ponto de conexão abstrato: o RoomDO adapta WebSocket real para esta interface. */
export interface RoomConnection {
  readonly key: string;
  readonly userId: string;
  readonly firstName: string;
  readonly username?: string;
  send(message: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

interface InternalConnection extends RoomConnection {
  connectedAt: number;
  lastSeen: number;
  lastChatAt: number;
  controlTimes: number[];
}

const DUPLICATE_CONNECTION_CODE = 4000;
const ROOM_FULL_CODE = 4001;
const INVALID_CONNECTION_CODE = 1008;
/** Limite generoso contra valores absurdos (24 h). */
const MAX_POSITION_SECONDS = 24 * 60 * 60;

export function sanitizeChatText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHAT_TEXT_LENGTH);
}

function clampPosition(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, MAX_POSITION_SECONDS);
}

/**
 * Núcleo autoritativo da sala, independente da API WebSocket da Cloudflare.
 * O RoomDO é apenas o adaptador de transporte; toda decisão de estado está aqui.
 */
export class RoomRuntime {
  private readonly connections = new Map<string, InternalConnection>();
  private readonly byUser = new Map<string, string>();

  constructor(
    private readonly store: RoomStore,
    private readonly now: () => number = Date.now,
    private readonly randomId: () => string = () => crypto.randomUUID(),
  ) {}

  get connectionCount(): number {
    return this.connections.size;
  }

  /** Registra a conexão, devolve o snapshot inicial e avisa os demais participantes. */
  async connect(connection: RoomConnection): Promise<boolean> {
    const state = await this.store.read();
    if (!state) {
      connection.send({ t: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' });
      connection.close(INVALID_CONNECTION_CODE, 'room_not_found');
      return false;
    }

    const now = this.now();
    const previousKey = this.byUser.get(connection.userId);
    if (previousKey) {
      // Uma reconexão substitui a conexão antiga: mesma identidade, sem duplicar presença.
      const previous = this.connections.get(previousKey);
      this.remove(previousKey);
      previous?.close(DUPLICATE_CONNECTION_CODE, 'duplicate_connection');
    }
    if (state.participants.length >= MAX_PARTICIPANTS && !this.byUser.has(connection.userId)) {
      connection.send({ t: 'error', code: 'ROOM_FULL', message: 'Esta sala está cheia.' });
      connection.close(ROOM_FULL_CODE, 'room_full');
      return false;
    }

    const internal: InternalConnection = {
      key: connection.key,
      userId: connection.userId,
      firstName: connection.firstName,
      ...(connection.username ? { username: connection.username } : {}),
      send: (message) => connection.send(message),
      close: (code, reason) => connection.close(code, reason),
      connectedAt: now,
      lastSeen: now,
      lastChatAt: 0,
      controlTimes: [],
    };
    this.connections.set(internal.key, internal);
    this.byUser.set(internal.userId, internal.key);

    state.participants = this.toParticipants(state.hostId);
    state.version += 1;
    await this.store.save(state);

    connection.send({ t: 'state', state, serverTime: now });
    const joined = state.participants.find((participant) => participant.userId === connection.userId);
    if (joined) {
      this.broadcast({ t: 'participant', action: 'join', user: joined }, internal.key);
    }
    return true;
  }

  /** Remove a conexão e notifica a saída. */
  async disconnect(key: string): Promise<void> {
    const connection = this.connections.get(key);
    if (!connection) return;
    const currentState = await this.store.read();
    const participant = this.toParticipants(currentState?.hostId ?? '').find(
      (item) => item.userId === connection.userId,
    );
    this.remove(key);
    await this.persistParticipants();
    if (participant) {
      this.broadcast({ t: 'participant', action: 'leave', user: participant });
    }
  }

  /** Processa uma mensagem já recebida do cliente (string ou bytes). */
  async handleMessage(connection: RoomConnection, raw: string | ArrayBuffer): Promise<void> {
    const internal = this.connections.get(connection.key);
    if (!internal || internal.userId !== connection.userId) return;

    const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
    if (bytes > MAX_WS_MESSAGE_BYTES) {
      internal.send({ t: 'error', code: 'MESSAGE_TOO_LARGE', message: 'Mensagem muito grande.' });
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      internal.send({ t: 'error', code: 'INVALID_MESSAGE', message: 'Mensagem inválida.' });
      return;
    }
    const parsed = clientMessageSchema.safeParse(parsedJson);
    if (!parsed.success) {
      internal.send({ t: 'error', code: 'INVALID_MESSAGE', message: 'Mensagem inválida.' });
      return;
    }

    const now = this.now();
    internal.lastSeen = now;
    const state = await this.store.read();
    if (!state) {
      internal.send({ t: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' });
      internal.close(INVALID_CONNECTION_CODE, 'room_not_found');
      return;
    }

    switch (parsed.data.t) {
      case 'ping':
        internal.send({ t: 'pong', ts: parsed.data.ts });
        return;

      case 'chat': {
        if (now - internal.lastChatAt < CHAT_RATE_MS) {
          internal.send({ t: 'error', code: 'RATE_LIMITED', message: 'Aguarde um momento para enviar outra mensagem.' });
          return;
        }
        const text = sanitizeChatText(parsed.data.text);
        if (!text) {
          internal.send({ t: 'error', code: 'INVALID_MESSAGE', message: 'Mensagem vazia.' });
          return;
        }
        internal.lastChatAt = now;
        const message = {
          id: this.randomId(),
          userId: internal.userId,
          firstName: internal.firstName,
          text,
          createdAt: now,
        };
        state.chat = [...state.chat, message].slice(-MAX_CHAT_HISTORY);
        state.version += 1;
        await this.store.save(state);
        this.broadcast({ t: 'chat', message });
        return;
      }

      case 'control': {
        if (internal.userId !== state.hostId && !state.settings.allowGuestControl) {
          // Nenhuma mutação de estado: convidado nunca altera a reprodução.
          internal.send({ t: 'error', code: 'FORBIDDEN', message: 'Somente o host pode controlar a reprodução.' });
          return;
        }
        internal.controlTimes = internal.controlTimes.filter(
          (timestamp) => now - timestamp < CONTROL_RATE_WINDOW_MS,
        );
        if (internal.controlTimes.length >= CONTROL_RATE_MAX) {
          internal.send({ t: 'error', code: 'RATE_LIMITED', message: 'Muitos comandos em sequência.' });
          return;
        }
        internal.controlTimes.push(now);

        const requested = parsed.data.position ?? state.position;
        state.playing =
          parsed.data.action === 'play' ? true : parsed.data.action === 'pause' ? false : state.playing;
        state.position = clampPosition(requested);
        state.updatedAt = now;
        state.version += 1;
        await this.store.save(state);

        this.broadcast(
          {
            t: 'control',
            action: parsed.data.action,
            position: state.position,
            playing: state.playing,
            serverTime: now,
            version: state.version,
            by: internal.userId,
          },
          internal.key,
        );
        return;
      }
    }
  }

  /** Remove conexões sem atividade (heartbeat). Devolve quantas foram removidas. */
  async heartbeat(now: number = this.now()): Promise<number> {
    const stale = [...this.connections.values()].filter(
      (connection) => now - connection.lastSeen > PARTICIPANT_TIMEOUT_MS,
    );
    for (const connection of stale) {
      connection.close(4002, 'inactive');
      await this.disconnect(connection.key);
    }
    return stale.length;
  }

  private remove(key: string): void {
    const connection = this.connections.get(key);
    if (!connection) return;
    this.connections.delete(key);
    if (this.byUser.get(connection.userId) === key) this.byUser.delete(connection.userId);
  }

  private toParticipants(hostId: string): Participant[] {
    return [...this.connections.values()]
      .map((connection) => ({
        userId: connection.userId,
        firstName: connection.firstName,
        ...(connection.username ? { username: connection.username } : {}),
        role: connection.userId === hostId ? ('host' as const) : ('guest' as const),
        joinedAt: connection.connectedAt,
        lastSeen: connection.lastSeen,
      }))
      .sort((left, right) => left.joinedAt - right.joinedAt);
  }

  private async persistParticipants(): Promise<void> {
    const state = await this.store.read();
    if (!state) return;
    state.participants = this.toParticipants(state.hostId);
    state.version += 1;
    await this.store.save(state);
  }

  private broadcast(message: ServerMessage, excludeKey?: string): void {
    for (const connection of this.connections.values()) {
      if (connection.key === excludeKey) continue;
      try {
        connection.send(message);
      } catch {
        // Uma conexão morta será removida pelo close/heartbeat; não afeta as demais.
      }
    }
  }
}
