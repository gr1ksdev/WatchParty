// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { HEARTBEAT_INTERVAL_MS, RECONNECT_BASE_MS } from '@watchparty/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@watchparty/shared';
import { useRoomSocket } from './useRoomSocket';

const roomState: RoomState = {
  id: 'ABC12345',
  source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
  hostId: '777',
  playing: false,
  position: 0,
  updatedAt: 1_700_000_000_000,
  version: 1,
  settings: { allowGuestControl: false },
  participants: [],
  chat: [],
};

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState === 0) {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
      }
    });
  }

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function sessionResponse(ticket: string) {
  return new Response(
    JSON.stringify({
      ok: true,
      ticket,
      expiresAt: 1_800_000_000,
      user: { id: '777', firstName: 'Ana' },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const options = (onMessage = vi.fn()) => ({
  roomId: 'ABC12345',
  initData: 'init-data',
  initialTicket: 'ticket-inicial',
  onMessage,
});

describe('useRoomSocket', () => {
  it('conecta com o ticket e informa o estado conectado', async () => {
    const { result } = renderHook(() => useRoomSocket(options()));
    await waitFor(() => expect(result.current.status).toBe('connected'));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toContain('/ws/ABC12345?ticket=ticket-inicial');
    expect(result.current.send({ t: 'ping', ts: 1 })).toBe(true);
    expect(JSON.parse(FakeWebSocket.instances[0]?.sent[0] ?? '{}')).toEqual({ t: 'ping', ts: 1 });
  });

  it('entrega mensagens validadas e calcula offset pelo serverTime', async () => {
    const onMessage = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const { result } = renderHook(() => useRoomSocket(options(onMessage)));
    await act(async () => {
      await Promise.resolve();
    });

    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket?.emit({ t: 'state', state: roomState, serverTime: 1_700_000_005_000 });
      socket?.emit({ t: 'lixo' });
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0]?.[0].t).toBe('state');
    expect(result.current.timing.clockOffset).toBeGreaterThanOrEqual(4900);
  });

  it('envia heartbeat e responde pong com RTT', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const { result } = renderHook(() => useRoomSocket(options()));
    await act(async () => {
      await Promise.resolve();
    });
    const socket = FakeWebSocket.instances[0];

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });
    const ping = JSON.parse(socket?.sent[0] ?? '{}');
    expect(ping.t).toBe('ping');

    act(() => {
      vi.advanceTimersByTime(25);
      socket?.emit({ t: 'pong', ts: ping.ts });
    });
    expect(result.current.timing.rtt).toBe(25);
  });

  it('reconecta com backoff e renova o ticket', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(sessionResponse('ticket-renovado'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRoomSocket(options()));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      FakeWebSocket.instances[0]?.close();
    });
    expect(result.current.status).toBe('reconnecting');
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(RECONNECT_BASE_MS);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toContain('ticket-renovado');
    expect(result.current.status).toBe('connected');
  });

  it('não reconecta após desmontagem', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useRoomSocket(options()));
    await act(async () => {
      await Promise.resolve();
    });
    const socket = FakeWebSocket.instances[0];
    unmount();

    act(() => {
      socket?.close();
      vi.advanceTimersByTime(RECONNECT_BASE_MS * 4);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
