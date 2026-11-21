import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  newRoomInputSchema,
  roomStateSchema,
  serverMessageSchema,
  type RoomState,
} from './index';

const validState: RoomState = {
  id: 'ABC12345',
  source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
  hostId: '12345',
  playing: false,
  position: 0,
  updatedAt: 1_700_000_000_000,
  version: 0,
  settings: { allowGuestControl: false },
  participants: [],
  chat: [],
};

describe('contratos compartilhados', () => {
  it('valida os dados de inicialização de uma sala', () => {
    const input = newRoomInputSchema.parse({
      id: 'ABC12345',
      source: { kind: 'hls', url: 'https://example.com/stream.m3u8' },
      hostId: '42',
    });
    expect(input.id).toBe('ABC12345');
    expect(newRoomInputSchema.safeParse({ ...input, id: 'abc' }).success).toBe(false);
  });

  it('rejeita um estado de sala com configuração de controle inválida', () => {
    expect(roomStateSchema.safeParse(validState).success).toBe(true);
    expect(
      roomStateSchema.safeParse({
        ...validState,
        settings: { allowGuestControl: true },
      }).success,
    ).toBe(false);
  });

  it('aceita e rejeita mensagens de cliente conforme o protocolo', () => {
    expect(clientMessageSchema.safeParse({ t: 'control', action: 'play' }).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ t: 'control', action: 'play', position: -1 }).success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ t: 'chat', text: 'Olá' }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ t: 'chat', text: '' }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: 'ping', ts: 10 }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ t: 'control', action: 'seek' }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: 'control', action: 'seek', position: 12 }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ t: 'unknown' }).success).toBe(false);
  });

  it('aceita e rejeita mensagens de servidor conforme o protocolo', () => {
    expect(
      serverMessageSchema.safeParse({ t: 'state', state: validState, serverTime: 1_700_000_000_000 }).success,
    ).toBe(true);
    expect(serverMessageSchema.safeParse({ t: 'state', state: validState }).success).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        t: 'control',
        action: 'seek',
        position: 12,
        playing: true,
        serverTime: 1_700_000_000_000,
        version: 3,
        by: '42',
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        t: 'control',
        action: 'seek',
        position: 12,
        serverTime: 1_700_000_000_000,
        version: 3,
        by: '42',
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({ t: 'error', code: 'FORBIDDEN', message: 'Negado' }).success,
    ).toBe(true);
  });
});
