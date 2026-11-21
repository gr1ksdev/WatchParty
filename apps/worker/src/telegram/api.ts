import { parseApiResponse } from './types';

export interface InlineButtonUrl {
  text: string;
  url: string;
}

export interface InlineButtonWebApp {
  text: string;
  web_app: { url: string };
}

export type InlineButton = InlineButtonUrl | InlineButtonWebApp;

export interface SendMessageOptions {
  replyMarkup?: { inline_keyboard: InlineButton[][] };
  disableWebPagePreview?: boolean;
}

export interface TelegramUserIdentity {
  id: number;
  username?: string;
  first_name: string;
}

/** Interface pequena para permitir testes sem acesso à rede. */
export interface TelegramApiLike {
  sendMessage(chatId: number, text: string, options?: SendMessageOptions): Promise<void>;
  getMe(): Promise<TelegramUserIdentity>;
}

export class TelegramApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

export class TelegramApi implements TelegramApiLike {
  private readonly baseUrl: string;

  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new TelegramApiError('NETWORK_ERROR', 'Falha de rede ao chamar a Telegram Bot API');
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new TelegramApiError('INVALID_RESPONSE', 'A Telegram Bot API retornou uma resposta inválida');
    }

    const parsed = parseApiResponse(data);
    if (!parsed.ok) {
      throw new TelegramApiError('API_ERROR', parsed.description);
    }
    return parsed.result as T;
  }

  async sendMessage(chatId: number, text: string, options: SendMessageOptions = {}): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: options.disableWebPagePreview ?? true,
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    });
  }

  async getMe(): Promise<TelegramUserIdentity> {
    return this.call<TelegramUserIdentity>('getMe', {});
  }
}
