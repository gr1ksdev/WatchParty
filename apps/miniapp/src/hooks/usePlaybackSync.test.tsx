// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ClientMessage, RoomState } from '@watchparty/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerEvent, WatchPartyPlayer } from '../features/player/engine';
import { usePlaybackSync } from './usePlaybackSync';

const roomState: RoomState = {
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

const timing = { rtt: 10, clockOffset: 5 };

function fakeEngine() {
  const listeners = new Set<(event: PlayerEvent) => void>();
  return {
    setRole: vi.fn(),
    setTiming: vi.fn(),
    restore: vi.fn(),
    applyRemote: vi.fn(),
    correctDrift: vi.fn().mockReturnValue(false),
    getExpectedPosition: vi.fn().mockReturnValue(42),
    subscribe: vi.fn((listener: (event: PlayerEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit(event: PlayerEvent) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

function asEngine(fake: ReturnType<typeof fakeEngine>): WatchPartyPlayer {
  return fake as unknown as WatchPartyPlayer;
}

describe('usePlaybackSync', () => {
  let engine: ReturnType<typeof fakeEngine>;
  let sendCalls: ClientMessage[];
  let send: (message: ClientMessage) => boolean;

  beforeEach(() => {
    engine = fakeEngine();
    sendCalls = [];
    send = (message: ClientMessage) => {
      sendCalls.push(message);
      return true;
    };
  });

  it('entrega snapshots e controles do servidor ao motor', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line react-hooks/exhaustive-deps
      usePlaybackSync({ engine: asEngine(engine), isHost: false, timing, send }),
    );

    act(() => {
      result.current.applyMessage(
        { t: 'state', state: { ...roomState, playing: true, version: 2 }, serverTime: 123 },
        timing,
      );
      result.current.applyMessage(
        {
          t: 'control',
          action: 'play',
          position: 10,
          playing: true,
          serverTime: 130,
          version: 3,
          by: '777',
        },
        timing,
      );
    });

    expect(engine.restore).toHaveBeenCalledWith(
      expect.objectContaining({ playing: true, version: 2, updatedAt: 1_700_000_000_000 }),
    );
    expect(engine.applyRemote).toHaveBeenCalledWith(
      expect.objectContaining({ playing: true, position: 10, version: 3, updatedAt: 130 }),
    );
  });

  it('envia apenas comandos locais do host e descarta versões antigas', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line react-hooks/exhaustive-deps
      usePlaybackSync({ engine: asEngine(engine), isHost: true, timing, send }),
    );
    act(() => {
      result.current.applyMessage(
        { t: 'state', state: { ...roomState, version: 5 }, serverTime: 100 },
        timing,
      );
    });

    act(() => {
      engine.emit({ type: 'command', kind: 'command', action: 'play', position: 12, origin: 'host-local', at: 1 });
      engine.emit({
        type: 'command',
        kind: 'command',
        action: 'pause',
        origin: 'remote-sync',
        at: 2,
      });
    });

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toMatchObject({ t: 'control', action: 'play', position: 12, version: 5 });
  });

  it('reaplica o último estado remoto quando o motor aparece depois', () => {
    const initial = { engine: null as WatchPartyPlayer | null, isHost: false, timing, send };
    const { result, rerender } = renderHook((props: typeof initial) => usePlaybackSync(props), {
      initialProps: initial,
    });

    act(() => {
      result.current.applyMessage(
        { t: 'state', state: { ...roomState, playing: true, version: 4 }, serverTime: 10 },
        timing,
      );
    });
    rerender({ ...initial, engine: asEngine(engine) });

    expect(engine.restore).toHaveBeenCalledWith(expect.objectContaining({ version: 4, playing: true }));
  });

  it('usa a correção de deriva do motor', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      // eslint-disable-next-line react-hooks/exhaustive-deps
      usePlaybackSync({ engine: asEngine(engine), isHost: false, timing, send }),
    );
    act(() => {
      result.current.applyMessage(
        { t: 'state', state: { ...roomState, playing: true, version: 1 }, serverTime: 10 },
        timing,
      );
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(engine.correctDrift).toHaveBeenCalledWith(42, 1.5);
    vi.useRealTimers();
  });
});
