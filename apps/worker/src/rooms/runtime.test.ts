import { describe, expect, it } from 'vitest';
import type { NewRoomInput, RoomState, ServerMessage } from '@watchparty/shared';
import { MAX_CHAT_HISTORY, PARTICIPANT_TIMEOUT_MS } from '@watchparty/shared';
import { RoomRuntime, sanitizeChatText, type RoomConnection } from './runtime';
import { createRoomState, ROOM_STATE_KEY, RoomStore, type RoomStorage } from './state';

class MemoryStorage implements RoomStorage {
  readonly data = new Map<string, unknown>();
  async get<T = unknown>(key: string): Promise<T | null | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

class FakeConnection implements RoomConnection {
  readonly sent: ServerMessage[] = [];
  closed: { code: number; reason: string } | undefined;
  constructor(
    readonly key: string,
    readonly userId: string,
    readonly firstName: string,
    readonly username?: string,
  ) {}
  send(message: ServerMessage): void {
    this.sent.push(message);
  }
  close(code = 1000, reason = ''): void {
    this.closed = { code, reason };
  }
  messagesOfType(type: ServerMessage['t']): ServerMessage[] {
    return this.sent.filter((message) => message.t === type);
  }
}

const input: NewRoomInput = {
  id: 'ABC12345',
  source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
  hostId: '777',
};

function harness(start = 1_700_000_000_000) {
  const storage = new MemoryStorage();
  const store = new RoomStore(storage);
  storage.data.set(ROOM_STATE_KEY, createRoomState(input, start));
  let clock = start;
  let ids = 0;
  const runtime = new RoomRuntime(store, () => clock, () => `msg-${++ids}`);
  const state = () => (storage.data.get(ROOM_STATE_KEY) as RoomState) ?? null;
  const advance = (ms: number) => {
    clock += ms;
  };
  const host = new FakeConnection('socket-host', '777', 'Ana', 'ana');
  const guest = new FakeConnection('socket-guest', '999', 'Bia');
  return { storage, store, runtime, host, guest, state, advance, clock: () => clock };
}

describe('RoomRuntime — autoridade da sala', () => {
  it('envia o estado inicial ao conectar e avisa os participantes existentes', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    const hostState = h.host.messagesOfType('state')[0];
    expect(hostState).toMatchObject({
      t: 'state',
      serverTime: h.clock(),
      state: { id: 'ABC12345', version: 1, participants: [{ userId: '777', role: 'host' }] },
    });

    await h.runtime.connect(h.guest);
    expect(h.guest.messagesOfType('state')[0]).toMatchObject({
      state: { version: 2, participants: [{ userId: '777' }, { userId: '999', role: 'guest' }] },
    });
    expect(h.host.messagesOfType('participant')).toMatchObject([
      { t: 'participant', action: 'join', user: { userId: '999' } },
    ]);
    expect(h.runtime.connectionCount).toBe(2);
  });

  it('substitui a conexão duplicada sem duplicar presença', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    const sameUser = new FakeConnection('socket-host-2', '777', 'Ana');
    await h.runtime.connect(sameUser);

    expect(h.host.closed?.code).toBe(4000);
    expect(h.runtime.connectionCount).toBe(1);
    expect(h.state()?.participants).toHaveLength(1);
    expect(sameUser.messagesOfType('state')).toHaveLength(1);
  });

  it('rejeita controle de convidado sem alterar o estado', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    await h.runtime.connect(h.guest);
    const before = h.state();

    await h.runtime.handleMessage(h.guest, JSON.stringify({ t: 'control', action: 'play', position: 12 }));

    expect(h.guest.messagesOfType('error')).toMatchObject([
      { t: 'error', code: 'FORBIDDEN' },
    ]);
    expect(h.state()).toEqual(before);
    expect(h.host.messagesOfType('control')).toHaveLength(0);
  });

  it('aplica controles do host, incrementa a versão e distribui o evento', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    await h.runtime.connect(h.guest);
    const version = h.state()?.version ?? 0;

    await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'control', action: 'play', position: 5 }));

    const event = h.host.messagesOfType('control')[0];
    const received = h.guest.messagesOfType('control')[0];
    expect(event).toBeUndefined(); // originador não recebe o próprio controle
    expect(received).toMatchObject({
      t: 'control',
      action: 'play',
      position: 5,
      playing: true,
      by: '777',
      serverTime: h.clock(),
      version: version + 1,
    });
    expect(h.state()).toMatchObject({ playing: true, position: 5, version: version + 1, updatedAt: h.clock() });

    h.advance(1000);
    await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'control', action: 'seek', position: 120 }));
    expect(h.state()).toMatchObject({ position: 120, playing: true, version: version + 2 });

    h.advance(1000);
    await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'control', action: 'pause' }));
    expect(h.state()).toMatchObject({ playing: false, version: version + 3 });
  });

  it('limita a frequência de controles e aceita no máximo 5 por segundo', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    for (let index = 0; index < 5; index += 1) {
      await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'control', action: 'play' }));
    }
    await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'control', action: 'pause' }));
    expect(h.host.messagesOfType('error')).toMatchObject([{ code: 'RATE_LIMITED' }]);
  });

  it('distribui chat, remove HTML, limita frequência e mantém o histórico recente', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    await h.runtime.connect(h.guest);

    await h.runtime.handleMessage(
      h.guest,
      JSON.stringify({ t: 'chat', text: 'Olá <script>alert(1)</script> pessoal' }),
    );
    const message = h.host.messagesOfType('chat')[0];
    expect(message).toMatchObject({
      t: 'chat',
      message: { userId: '999', firstName: 'Bia', text: 'Olá alert(1) pessoal' },
    });
    expect(h.guest.messagesOfType('chat')).toHaveLength(1);

    await h.runtime.handleMessage(h.guest, JSON.stringify({ t: 'chat', text: 'segunda' }));
    expect(h.guest.messagesOfType('error')).toMatchObject([{ code: 'RATE_LIMITED' }]);

    for (let index = 0; index < MAX_CHAT_HISTORY + 10; index += 1) {
      h.advance(1001);
      await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'chat', text: `msg-${index}` }));
    }
    expect(h.state()?.chat).toHaveLength(MAX_CHAT_HISTORY);
    expect(h.state()?.chat.at(-1)?.text).toBe(`msg-${MAX_CHAT_HISTORY + 9}`);
  });

  it('responde ping com pong e rejeita mensagens inválidas ou grandes', async () => {
    const h = harness();
    await h.runtime.connect(h.host);

    await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'ping', ts: 123 }));
    expect(h.host.messagesOfType('pong')).toMatchObject([{ ts: 123 }]);

    await h.runtime.handleMessage(h.host, '{quebrado');
    await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'desconhecida' }));
    await h.runtime.handleMessage(h.host, 'x'.repeat(5000));
    expect(h.host.messagesOfType('error').map((message) => message.t === 'error' && message.code)).toEqual([
      'INVALID_MESSAGE',
      'INVALID_MESSAGE',
      'MESSAGE_TOO_LARGE',
    ]);
  });

  it('notifica saída e remove participantes inativos pelo heartbeat', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    await h.runtime.connect(h.guest);

    await h.runtime.disconnect(h.guest.key);
    expect(h.host.messagesOfType('participant').at(-1)).toMatchObject({
      action: 'leave',
      user: { userId: '999' },
    });
    expect(h.state()?.participants.map((p) => p.userId)).toEqual(['777']);

    h.advance(PARTICIPANT_TIMEOUT_MS + 1);
    expect(await h.runtime.heartbeat(h.clock())).toBe(1);
    expect(h.host.closed?.code).toBe(4002);
    expect(h.state()?.participants).toHaveLength(0);
    expect(h.runtime.connectionCount).toBe(0);
  });

  it('recupera o estado atual ao reconectar', async () => {
    const h = harness();
    await h.runtime.connect(h.host);
    await h.runtime.handleMessage(h.host, JSON.stringify({ t: 'control', action: 'play', position: 42 }));
    await h.runtime.disconnect(h.host.key);

    const returning = new FakeConnection('socket-return', '777', 'Ana');
    await h.runtime.connect(returning);
    expect(returning.messagesOfType('state')[0]).toMatchObject({
      state: { playing: true, position: 42, version: 4 },
    });
  });

  it('sanitiza texto de chat sem executar HTML', () => {
    expect(sanitizeChatText('  Olá <b>mundo</b>\n<script>x</script>  ')).toBe('Olá mundox');
    expect(sanitizeChatText('<img src=x>')).toBe('');
  });
});
