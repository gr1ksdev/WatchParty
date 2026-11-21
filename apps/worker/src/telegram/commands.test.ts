import { describe, expect, it } from 'vitest';
import {
  buildHelpMessage,
  buildInvalidLinkMessage,
  buildMiniAppUrl,
  buildRoomCardMessage,
  buildRoomJoinedMessage,
  buildStartMessage,
  parseCommand,
} from './commands';
import type { InlineButton } from './api';

describe('parseCommand', () => {
  it('interpreta /start, /help e /play com argumentos', () => {
    expect(parseCommand('/start')).toEqual({ name: 'start', argument: '' });
    expect(parseCommand('/help')).toEqual({ name: 'help', argument: '' });
    expect(parseCommand('/play   https://example.com/video.mp4')).toEqual({
      name: 'play',
      argument: 'https://example.com/video.mp4',
    });
  });

  it('aceita comandos sufixados com o nome do bot', () => {
    expect(parseCommand('/play@WatchPartyBot https://example.com/v.mp4')).toEqual({
      name: 'play',
      argument: 'https://example.com/v.mp4',
    });
  });

  it('ignora texto que não é comando', () => {
    expect(parseCommand('olá bot')).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
    expect(parseCommand('/unknown')).toBeNull();
  });
});

describe('mensagens do bot', () => {
  const source = { kind: 'mp4' as const, url: 'https://example.com/v.mp4?a=1&b=2' };

  it('apresenta o bot e explica o uso', () => {
    expect(buildStartMessage()).toContain('Watch Party');
    expect(buildStartMessage()).toContain('/play');
    expect(buildHelpMessage()).toContain('/help');
    expect(buildHelpMessage()).toContain('Convidar amigos');
  });

  it('escapa caracteres HTML em mensagens de erro e links', () => {
    expect(buildInvalidLinkMessage('Use <https> & http')).toContain('&lt;https&gt; &amp; http');
    const card = buildRoomCardMessage({
      roomId: 'ABC12345',
      source,
      miniAppUrl: 'https://mini.pages.dev/',
      botUsername: 'WatchPartyBot',
    });
    expect(card.text).toContain('a=1&amp;b=2');
  });

  it('monta botões de abrir sala e convidar amigos', () => {
    const card = buildRoomCardMessage({
      roomId: 'ABC12345',
      source,
      miniAppUrl: 'https://mini.pages.dev/',
      botUsername: 'WatchPartyBot',
    });

    expect(card.text).toContain('ABC12345');
    expect(card.text).toContain('MP4 / WebM');
    const rows = card.options.replyMarkup?.inline_keyboard ?? [];
    expect(rows).toHaveLength(2);

    const openButton = rows[0]?.[0] as Extract<InlineButton, { web_app: unknown }>;
    const inviteButton = rows[1]?.[0] as Extract<InlineButton, { url: unknown }>;
    expect(openButton.web_app.url).toBe('https://mini.pages.dev/?start_param=ABC12345');
    expect(inviteButton.url).toBe('https://t.me/WatchPartyBot?startapp=ABC12345');
  });

  it('gera mensagem de entrada para um convite', () => {
    const joined = buildRoomJoinedMessage({
      roomId: 'ABC12345',
      miniAppUrl: 'https://mini.pages.dev',
      botUsername: 'WatchPartyBot',
    });
    expect(joined.text).toContain('ABC12345');
    expect(buildMiniAppUrl('https://mini.pages.dev/', 'ABC12345')).toBe(
      'https://mini.pages.dev/?start_param=ABC12345',
    );
  });
});
