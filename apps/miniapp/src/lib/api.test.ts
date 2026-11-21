// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@watchparty/shared';
import { ApiError, createSession, fetchRoom } from './api';

const room: RoomState = {
  id: 'ABC12345',
  source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
  hostId: '777',
  playing: false,
  position: 0,
  updatedAt: 1_700_000_000_000,
  version: 0,
  settings: { allowGuestControl: false },
  participants: [],
  chat: [],
};

const sessionBody = {
  ok: true,
  ticket: 'ticket-assinado',
  expiresAt: 1_800_000_000,
  user: { id: '777', firstName: 'Ana' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente da API', () => {
  it('envia initData e valida a resposta da sessão', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionBody));
    vi.stubGlobal('fetch', fetchMock);

    const session = await createSession('init-data-assinado');
    expect(session.ticket).toBe('ticket-assinado');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/session'),
      expect.objectContaining({ method: 'POST' }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({ initData: 'init-data-assinado' });
  });

  it('busca a sala com o ticket no cabeçalho', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, room, viewer: { userId: '777', isHost: true } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchRoom('ABC12345', 'ticket-assinado');
    expect(response.viewer.isHost).toBe(true);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.headers).toEqual({ authorization: 'Bearer ticket-assinado' });
  });

  it('propaga códigos de erro do Worker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'TICKET_EXPIRED', message: 'Expirado' }, 401)),
    );
    await expect(fetchRoom('ABC12345', 'ticket')).rejects.toMatchObject({
      code: 'TICKET_EXPIRED',
      status: 401,
    });
  });

  it('trata falha de rede e respostas inválidas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createSession('init')).rejects.toMatchObject({ code: 'network_error' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ inesperado: true })));
    await expect(createSession('init')).rejects.toBeInstanceOf(ApiError);
  });
});
