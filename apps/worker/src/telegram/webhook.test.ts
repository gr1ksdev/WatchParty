import { describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@watchparty/shared';
import type { Env } from '../env';
import type { CreateRoomInput } from '../rooms/api';
import type { SendMessageOptions, TelegramApiLike } from './api';
import { handleTelegramWebhook, type WebhookDeps } from './webhook';

const SECRET = 'webhook-secret';

const env: Env = {
  ROOMS: {} as Env['ROOMS'],
  TELEGRAM_BOT_TOKEN: '123:token',
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  MINI_APP_URL: 'https://mini.pages.dev',
};

const storedRoom: RoomState = {
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

interface SentMessage {
  chatId: number;
  text: string;
  options?: SendMessageOptions;
}

function createHarness() {
  const sent: SentMessage[] = [];
  const created: CreateRoomInput[] = [];
  const api: TelegramApiLike = {
    async sendMessage(chatId, text, options) {
      sent.push({ chatId, text, options });
    },
    async getMe() {
      return { id: 1, username: 'WatchPartyBot', first_name: 'Watch Party' };
    },
  };
  const deps: WebhookDeps = {
    createApi: () => api,
    createRoom: async (_env, input) => {
      created.push(input);
      return { ...storedRoom, source: input.source, hostId: input.hostId };
    },
  };
  return { sent, created, deps };
}

function update(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 99 },
      from: { id: 777, is_bot: false, first_name: 'Ana' },
      text,
    },
  };
}

function request(body: unknown, secret = SECRET): Request {
  return new Request('https://worker.example/webhook/telegram', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': secret,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('webhook do Telegram', () => {
  it('valida o segredo compartilhado e o corpo da requisição', async () => {
    const { sent, deps } = createHarness();

    expect((await handleTelegramWebhook(request(update('/start'), 'errado'), env, deps)).status).toBe(401);
    expect((await handleTelegramWebhook(request('{invalido'), env, deps)).status).toBe(400);
    expect((await handleTelegramWebhook(request({ update_id: 'abc' }), env, deps)).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('responde /start e /help', async () => {
    const { sent, created, deps } = createHarness();

    expect((await handleTelegramWebhook(request(update('/start')), env, deps)).status).toBe(200);
    expect(sent[0]?.text).toContain('Watch Party');
    expect(sent[0]?.text).toContain('/play');

    expect((await handleTelegramWebhook(request(update('/help')), env, deps)).status).toBe(200);
    expect(sent[1]?.text).toContain('Comandos disponíveis');
    expect(created).toHaveLength(0);
  });

  it('abre um convite quando /start recebe um ID de sala', async () => {
    const { sent, deps } = createHarness();

    await handleTelegramWebhook(request(update('/start ABC12345')), env, deps);

    const rows = sent[0]?.options?.replyMarkup?.inline_keyboard ?? [];
    const button = rows[0]?.[0];
    expect(button && 'web_app' in button ? button.web_app.url : '').toContain('start_param=ABC12345');
  });

  it('cria uma sala com /play e envia os botões de entrada e convite', async () => {
    const { sent, created, deps } = createHarness();

    const response = await handleTelegramWebhook(
      request(update('/play https://example.com/video.mp4')),
      env,
      deps,
    );

    expect(response.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ hostId: '777', source: { kind: 'mp4' } });

    const message = sent[0];
    expect(message?.text).toContain('Sala criada');
    expect(message?.text).toContain('ABC12345');
    const rows = message?.options?.replyMarkup?.inline_keyboard ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.[0]).toHaveProperty('web_app');
    expect(rows[1]?.[0]).toHaveProperty('url', 'https://t.me/WatchPartyBot?startapp=ABC12345');
  });

  it('não cria sala para links inválidos ou comando sem argumento', async () => {
    const { sent, created, deps } = createHarness();

    await handleTelegramWebhook(request(update('/play')), env, deps);
    await handleTelegramWebhook(request(update('/play ftp://example.com/video.mp4')), env, deps);

    expect(created).toHaveLength(0);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.text).toContain('Uso do comando');
    expect(sent[1]?.text).toContain('Link não aceito');
  });

  it('ignora atualizações sem texto de comando', async () => {
    const { sent, created, deps } = createHarness();

    const response = await handleTelegramWebhook(
      request({ update_id: 2, message: { message_id: 2, chat: { id: 99 }, text: 'oi' } }),
      env,
      deps,
    );
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('não propaga falhas de envio ao Telegram', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { created, deps } = createHarness();
    deps.createApi = () => ({
      async sendMessage() {
        throw new Error('timeout');
      },
      async getMe() {
        return { id: 1, first_name: 'Watch Party' };
      },
    });

    const response = await handleTelegramWebhook(request(update('/help')), env, deps);
    expect(response.status).toBe(200);
    expect(created).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
