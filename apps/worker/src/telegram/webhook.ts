import type { Env } from '../env';
import { validateVideoUrl } from '../links/validate';
import { createRoom } from '../rooms/api';
import { isValidRoomId } from '../utils/ids';
import { json } from '../utils/json';
import { constantTimeEqual } from '../utils/strings';
import type { TelegramApiLike } from './api';
import { TelegramApi } from './api';
import {
  buildHelpMessage,
  buildInvalidLinkMessage,
  buildPlayUsageMessage,
  buildRoomCardMessage,
  buildRoomJoinedMessage,
  buildStartMessage,
  parseCommand,
} from './commands';
import { updateSchema } from './types';

export interface WebhookDeps {
  createApi: (env: Env) => TelegramApiLike;
  createRoom: typeof createRoom;
}

export const defaultDeps: WebhookDeps = {
  createApi: (env) => new TelegramApi(env.TELEGRAM_BOT_TOKEN),
  createRoom,
};

async function resolveBotUsername(env: Env, api: TelegramApiLike): Promise<string> {
  if (env.TELEGRAM_BOT_USERNAME) return env.TELEGRAM_BOT_USERNAME;
  const me = await api.getMe();
  if (!me.username) {
    throw new Error('O bot não possui username; configure TELEGRAM_BOT_USERNAME');
  }
  return me.username;
}

async function dispatchCommand(
  env: Env,
  deps: WebhookDeps,
  command: NonNullable<ReturnType<typeof parseCommand>>,
  chatId: number,
  hostId: string,
): Promise<void> {
  const api = deps.createApi(env);

  switch (command.name) {
    case 'start': {
      if (isValidRoomId(command.argument)) {
        const message = buildRoomJoinedMessage({
          roomId: command.argument,
          miniAppUrl: env.MINI_APP_URL,
          botUsername: await resolveBotUsername(env, api),
        });
        await api.sendMessage(chatId, message.text, message.options);
        return;
      }
      await api.sendMessage(chatId, buildStartMessage());
      return;
    }

    case 'help': {
      await api.sendMessage(chatId, buildHelpMessage());
      return;
    }

    case 'play': {
      if (!command.argument) {
        await api.sendMessage(chatId, buildPlayUsageMessage());
        return;
      }

      const validation = await validateVideoUrl(command.argument);
      if (!validation.ok) {
        await api.sendMessage(chatId, buildInvalidLinkMessage(validation.message));
        return;
      }

      const room = await deps.createRoom(env, {
        source: validation.source,
        hostId,
      });
      const message = buildRoomCardMessage({
        roomId: room.id,
        source: room.source,
        miniAppUrl: env.MINI_APP_URL,
        botUsername: await resolveBotUsername(env, api),
      });
      await api.sendMessage(chatId, message.text, message.options);
      return;
    }
  }
}

/** Manipula o webhook do Telegram com validação do segredo compartilhado. */
export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  deps: WebhookDeps = defaultDeps,
): Promise<Response> {
  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || !constantTimeEqual(providedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const parsedUpdate = updateSchema.safeParse(rawBody);
  if (!parsedUpdate.success) {
    return json({ ok: false, error: 'invalid_update' }, 400);
  }

  const message = parsedUpdate.data.message ?? parsedUpdate.data.edited_message;
  if (!message?.text || !message.from || message.from.is_bot) {
    return json({ ok: true });
  }

  const command = parseCommand(message.text);
  if (!command) {
    return json({ ok: true });
  }

  try {
    await dispatchCommand(env, deps, command, message.chat.id, String(message.from.id));
  } catch (error) {
    // Responder 200 mesmo em falha de envio evita retries que criariam salas duplicadas.
    console.error('[telegram] falha ao processar comando', error);
  }

  return json({ ok: true });
}
