import type { SourceKind, VideoSource } from '@watchparty/shared';
import type { InlineButton, SendMessageOptions } from './api';
import { escapeHtml } from '../utils/strings';

export type CommandName = 'start' | 'help' | 'play';

export interface ParsedCommand {
  name: CommandName;
  argument: string;
}

const COMMAND_PATTERN = /^\/(start|help|play)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/;

/** Interpreta comandos enviados ao bot, incluindo `/comando@NomeDoBot`. */
export function parseCommand(text: string | undefined): ParsedCommand | null {
  if (!text) return null;
  const match = COMMAND_PATTERN.exec(text.trim());
  if (!match) return null;

  const name = match[1];
  if (name !== 'start' && name !== 'help' && name !== 'play') return null;

  return { name, argument: (match[2] ?? '').trim() };
}

const SOURCE_LABELS: Record<SourceKind, string> = {
  mp4: 'MP4 / WebM (link direto)',
  hls: 'HLS (.m3u8)',
  youtube: 'YouTube',
};

export function buildMiniAppUrl(miniAppUrl: string, roomId: string): string {
  return `${miniAppUrl.trim().replace(/\/+$/, '')}/?start_param=${encodeURIComponent(roomId)}`;
}

export function buildInviteUrl(botUsername: string, roomId: string): string {
  return `https://t.me/${encodeURIComponent(botUsername)}?startapp=${encodeURIComponent(roomId)}`;
}

function roomButtons(roomId: string, miniAppUrl: string, botUsername: string): SendMessageOptions {
  const buttons: InlineButton[][] = [
    [{ text: 'Abrir sala', web_app: { url: buildMiniAppUrl(miniAppUrl, roomId) } }],
  ];

  if (botUsername) {
    buttons.push([{ text: 'Convidar amigos', url: buildInviteUrl(botUsername, roomId) }]);
  }

  return { replyMarkup: { inline_keyboard: buttons }, disableWebPagePreview: true };
}

export function buildStartMessage(): string {
  return [
    '<b>Watch Party</b> 🎬',
    '',
    'Assista a vídeos com outras pessoas ao mesmo tempo, em uma sala sincronizada dentro do Telegram.',
    '',
    'Como começar:',
    '• Envie <code>/play &lt;link do vídeo&gt;</code> para criar uma sala.',
    '• Compartilhe o convite com seus amigos.',
    '• Abra a sala no Mini App para assistir.',
    '',
    'Use /help para ver os comandos disponíveis.',
  ].join('\n');
}

export function buildHelpMessage(): string {
  return [
    '<b>Comandos disponíveis</b>',
    '',
    '/start — Apresentar o bot',
    '/help — Mostrar esta ajuda',
    '/play &lt;link&gt; — Criar uma sala a partir de um link de vídeo',
    '',
    'Formatos aceitos: MP4/WebM, HLS (.m3u8) e YouTube.',
    'Exemplo: <code>/play https://example.com/video.mp4</code>',
    '',
    'Depois de criar a sala, use <b>Convidar amigos</b> para compartilhar o link. Quem cria a sala é o host e é o único que pode controlar a reprodução.',
  ].join('\n');
}

export function buildPlayUsageMessage(): string {
  return [
    '⚠️ <b>Uso do comando</b>',
    '',
    'Envie <code>/play</code> seguido de um link de vídeo.',
    'Exemplo: <code>/play https://example.com/video.mp4</code>',
  ].join('\n');
}

export function buildInvalidLinkMessage(reason: string): string {
  return `⚠️ <b>Link não aceito</b>\n\n${escapeHtml(reason)}\n\nUse /help para ver os formatos suportados.`;
}

export function buildRoomCardMessage(input: {
  roomId: string;
  source: VideoSource;
  miniAppUrl: string;
  botUsername: string;
}): { text: string; options: SendMessageOptions } {
  const { roomId, source, miniAppUrl, botUsername } = input;
  const text = [
    '✅ <b>Sala criada!</b>',
    '',
    `🎬 <b>Vídeo:</b> ${SOURCE_LABELS[source.kind]}`,
    `🆔 <b>Sala:</b> <code>${escapeHtml(roomId)}</code>`,
    '👑 <b>Host:</b> você',
    `🔗 <b>Fonte:</b> <a href="${escapeHtml(source.url)}">abrir link</a>`,
    '',
    'Use os botões abaixo para abrir a sala ou convidar amigos.',
  ].join('\n');

  return { text, options: roomButtons(roomId, miniAppUrl, botUsername) };
}

export function buildRoomJoinedMessage(input: {
  roomId: string;
  miniAppUrl: string;
  botUsername: string;
}): { text: string; options: SendMessageOptions } {
  const { roomId, miniAppUrl, botUsername } = input;
  const text = [
    '🎬 <b>Convite para Watch Party</b>',
    '',
    `🆔 <b>Sala:</b> <code>${escapeHtml(roomId)}</code>`,
    '',
    'Toque em <b>Abrir sala</b> para entrar na sala.',
  ].join('\n');

  return { text, options: roomButtons(roomId, miniAppUrl, botUsername) };
}
