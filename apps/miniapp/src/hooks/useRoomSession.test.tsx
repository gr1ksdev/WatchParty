// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@watchparty/shared';
import { useRoomSession } from './useRoomSession';

const room: RoomState = {
  id: 'ABC12345',
  source: { kind: 'hls', url: 'https://example.com/stream.m3u8' },
  hostId: '777',
  playing: false,
  position: 0,
  updatedAt: 1_700_000_000_000,
  version: 0,
  settings: { allowGuestControl: false },
  participants: [],
  chat: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sessionBody(ticket = 'ticket-1', startParam?: string) {
  return {
    ok: true,
    ticket,
    expiresAt: 1_800_000_000,
    user: { id: '777', firstName: 'Ana' },
    ...(startParam ? { startParam } : {}),
  };
}

function mockFetch(options: {
  sessionTicket?: string;
  startParam?: string;
  roomStatus?: number;
  roomError?: string;
  expireFirstTicket?: boolean;
} = {}) {
  let sessionCalls = 0;
  let roomCalls = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/session')) {
      sessionCalls += 1;
      const ticket = options.expireFirstTicket && sessionCalls === 1 ? 'expirado' : options.sessionTicket ?? 'ticket-1';
      return jsonResponse(sessionBody(ticket, options.startParam));
    }
    roomCalls += 1;
    const authorization = 'ticket-1';
    if (options.expireFirstTicket && roomCalls === 1) {
      return jsonResponse({ ok: false, error: 'TICKET_EXPIRED', message: 'Expirado' }, 401);
    }
    if (options.roomStatus && options.roomStatus !== 200) {
      return jsonResponse({ ok: false, error: options.roomError ?? 'room_not_found', message: 'Erro' }, options.roomStatus);
    }
    void authorization;
    return jsonResponse({ ok: true, room, viewer: { userId: '777', isHost: true } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRoomSession', () => {
  it('executa o fluxo initData → sessão → sala', async () => {
    mockFetch();
    const { result } = renderHook(() => useRoomSession('init-data', 'ABC12345'));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.data?.room.id).toBe('ABC12345');
    expect(result.current.user?.firstName).toBe('Ana');
    expect(result.current.data?.viewer.isHost).toBe(true);
  });

  it('usa o startParam retornado pela sessão quando o SDK não informa um', async () => {
    mockFetch({ startParam: 'ABC12345' });
    const { result } = renderHook(() => useRoomSession('init-data', null));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
  });

  it('renova o ticket expirado uma vez', async () => {
    const fetchMock = mockFetch({ expireFirstTicket: true });
    const { result } = renderHook(() => useRoomSession('init-data', 'ABC12345'));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/session'))).toHaveLength(2);
  });

  it('mostra erro amigável para sala inexistente e sala não informada', async () => {
    mockFetch({ roomStatus: 404, roomError: 'room_not_found' });
    const missingRoom = renderHook(() => useRoomSession('init-data', 'ABC12345'));
    await waitFor(() => expect(missingRoom.result.current.phase).toBe('error'));
    expect(missingRoom.result.current.error?.code).toBe('room_not_found');
    expect(missingRoom.result.current.error?.message).toContain('não existe');

    mockFetch();
    const noStart = renderHook(() => useRoomSession('init-data', null));
    await waitFor(() => expect(noStart.result.current.phase).toBe('error'));
    expect(noStart.result.current.error?.code).toBe('missing_room');
  });

  it('permite tentar novamente', async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useRoomSession('init-data', 'ABC12345'));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    const before = fetchMock.mock.calls.length;

    result.current.retry();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});
