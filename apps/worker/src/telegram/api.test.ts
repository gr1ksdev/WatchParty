import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramApi } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TelegramApi', () => {
  it('mantém o contexto global do fetch ao usar a implementação padrão', async () => {
    // Reproduz o erro de "Illegal invocation" do Workers quando fetch é chamado sem `this`.
    const strictFetch = function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, result: { id: 1, first_name: 'Bot', username: 'testbot' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    vi.stubGlobal('fetch', strictFetch);

    const api = new TelegramApi('token-de-teste');
    const getMe = await api.getMe();
    expect(getMe).toMatchObject({ username: expect.any(String) });
  });
});
