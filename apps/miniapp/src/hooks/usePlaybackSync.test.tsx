// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ClientMessage, RoomState, ServerMessage } from '@watchparty/shared';
import { DRIFT_INTERVAL_MS, REMOTE_APPLY_WINDOW_MS } from '@watchparty/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerController } from '../features/player/types';
import { usePlaybackSync } from './usePlaybackSync';

const roomState: RoomState = {
  id: 'ABC12345',
  source: { kind: 'mp4', url: 'https://example.com/video.mp4' },
  hostId: '777',
  playing: false,
  position: 0,
  updatedAt: 0,
  version: 0,
  settings: { allowGuestControl: false },
  participants: [],
  chat: [],
};

const timing = { rtt: 0, clockOffset: 0 };

function fakePlayer(currentTime = 0): PlayerController {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: vi.fn(() => currentTime),
    getDuration: vi.fn(() => 120),
    destroy: vi.fn(),
  };
}

function renderSync(options: {
  player?: PlayerController;
  isHost?: boolean;
  send?: (message: unknown) => boolean;
  duration?: number;
} = {}) {
  const player = options.player ?? fakePlayer();
  const send = vi.fn((_message: ClientMessage) => (options.send ? options.send(_message) : true));
  const result = renderHook(() =>
    usePlaybackSync({
      controller: player,
      isHost: options.isHost ?? false,
      duration: options.duration ?? 120,
      timing,
      send,
    }),
  );
  return { player, send, ...result };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlaybackSync', () => {
  it('aplica o estado inicial calculando a posição esperada pelo relógio do servidor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { player, result } = renderSync();

    act(() => {
      result.current.applyMessage(
        { t: 'state', state: { ...roomState, playing: true, position: 10, updatedAt: 0 }, serverTime: 10_000 },
        timing,
      );
    });

    expect(player.seekTo).toHaveBeenCalledWith(20);
    expect(player.play).toHaveBeenCalledOnce();
    expect(result.current.syncState).toMatchObject({ playing: true, version: 0 });
  });

  it('aplica play/pause/seek e descarta versões antigas', () => {
    const { player, result } = renderSync();
    const control: ServerMessage = {
      t: 'control',
      action: 'seek',
      position: 30,
      playing: true,
      serverTime: Date.now(),
      version: 1,
      by: '777',
    };

    act(() => {
      result.current.applyMessage(control, timing);
      result.current.applyMessage(control, timing); // duplicata
      result.current.applyMessage(
        {
          t: 'control',
          action: 'pause',
          position: 30,
          playing: false,
          serverTime: Date.now(),
          version: 1,
          by: '777',
        },
        timing,
      );
    });

    expect(player.seekTo).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.pause).not.toHaveBeenCalled();
  });

  it('permite que apenas o host envie controles e aplica a ação localmente', () => {
    const host = renderSync({ isHost: true });
    act(() => {
      expect(host.result.current.sendControl('play', 15)).toBe(true);
    });
    expect(host.send).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'control', action: 'play', position: 15 }),
    );
    expect(host.player.play).toHaveBeenCalledOnce();

    const guest = renderSync({ isHost: false });
    act(() => {
      expect(guest.result.current.sendControl('play', 15)).toBe(false);
    });
    expect(guest.send).not.toHaveBeenCalled();
    expect(guest.player.play).not.toHaveBeenCalled();
  });

  it('corrige a deriva quando a diferença passa de 1,5 s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const player = fakePlayer(0);
    const { result } = renderSync({ player });

    act(() => {
      result.current.applyMessage(
        {
          t: 'state',
          state: { ...roomState, playing: true, position: 10, updatedAt: 0 },
          serverTime: 20_000,
        },
        timing,
      );
    });
    expect(player.seekTo).toHaveBeenCalledWith(30);

    act(() => {
      vi.advanceTimersByTime(DRIFT_INTERVAL_MS);
    });
    expect(vi.mocked(player.seekTo).mock.calls.length).toBeGreaterThan(1);
    const last = vi.mocked(player.seekTo).mock.calls.at(-1)?.[0] ?? 0;
    expect(last).toBeGreaterThan(34);
  });

  it('marca a janela anti-loop ao aplicar evento remoto', () => {
    vi.useFakeTimers();
    const { result } = renderSync();
    act(() => {
      result.current.applyMessage(
        { t: 'state', state: { ...roomState, playing: false }, serverTime: Date.now() },
        timing,
      );
    });
    expect(result.current.isApplyingRemote()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(REMOTE_APPLY_WINDOW_MS + 1);
    });
    expect(result.current.isApplyingRemote()).toBe(false);
  });
});
