// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AdapterEvent, PlaybackState, PlayerAdapter, RemotePlaybackState } from './types';
import { WatchPartyPlayer } from './WatchPartyPlayer';

const SOURCE = { kind: 'mp4' as const, url: 'https://example.com/video.mp4' };
const SURFACE = { video: document.createElement('video'), container: document.createElement('div') };

class FakeAdapter implements PlayerAdapter {
  readonly kind = 'mp4' as const;
  state: PlaybackState = {
    status: 'idle',
    currentTime: 0,
    duration: 120,
    buffered: 0,
    volume: 1,
    muted: false,
    sourceKind: 'mp4',
  };
  listeners = new Set<(event: AdapterEvent) => void>();
  async load() {
    this.state = { ...this.state, status: 'ready' };
    this.emit();
  }
  async play() {
    this.state = { ...this.state, status: 'playing' };
    this.emit();
  }
  async pause() {
    this.state = { ...this.state, status: 'paused' };
    this.emit();
  }
  async seekTo(seconds: number) {
    this.state = { ...this.state, currentTime: seconds };
    this.emit();
  }
  getCurrentTime() {
    return this.state.currentTime;
  }
  getDuration() {
    return this.state.duration;
  }
  getBuffered() {
    return this.state.buffered;
  }
  getPlaybackState() {
    return this.state;
  }
  setVolume() {}
  setMuted() {}
  subscribe(listener: (event: AdapterEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  destroy() {
    this.listeners.clear();
  }
  private emit() {
    const event: AdapterEvent = { type: 'statechange', at: Date.now() };
    for (const listener of [...this.listeners]) listener(event);
  }
}

function createEngine(): WatchPartyPlayer {
  return new WatchPartyPlayer({ adapterFactory: () => new FakeAdapter(), commandTimeoutMs: 50 });
}

/** Hub em memória que reproduz o comportamento autoritativo do RoomDO. */
function createHub(host: WatchPartyPlayer, guest: WatchPartyPlayer) {
  let state: RemotePlaybackState = { playing: false, position: 0, updatedAt: Date.now(), version: 1 };
  const broadcast = () => {
    guest.applyRemote(state);
    host.applyRemote(state);
  };
  host.subscribe((event) => {
    if (event.kind !== 'command' || event.origin !== 'host-local') return;
    state = {
      playing: event.action === 'play' ? true : event.action === 'pause' ? false : state.playing,
      position: event.position ?? state.position,
      updatedAt: Date.now(),
      version: state.version + 1,
    };
    // O host não recebe o próprio controle; apenas o convidado é notificado.
    guest.applyRemote(state);
  });
  guest.subscribe((event) => {
    if (event.kind === 'command' && event.origin === 'host-local') rejected.push(event.action);
  });
  const rejected: string[] = [];
  return {
    rejected,
    broadcast,
    getState: () => state,
  };
}

describe('integração de sincronização com dois participantes', () => {
  it('host comanda play, pause e seek; convidado executa e não reenvia comandos', async () => {
    const host = createEngine();
    const guest = createEngine();
    guest.setRole(false);
    host.setRole(true);
    await Promise.all([host.load(SOURCE, SURFACE), guest.load(SOURCE, SURFACE)]);
    const hub = createHub(host, guest);

    await host.play();
    expect(guest.getState().status).toBe('playing');

    await host.seekTo(45);
    expect(guest.getCurrentTime()).toBe(45);

    await host.pause();
    expect(guest.getState().status).toBe('paused');
    expect(hub.getState().playing).toBe(false);

    await guest.play();
    expect(hub.rejected).toHaveLength(1);
    expect(hub.getState().playing).toBe(false);

    host.destroy();
    guest.destroy();
  });

  it('reaplica o estado do servidor quando o convidado entra depois do play', async () => {
    const host = createEngine();
    const guest = createEngine();
    guest.setRole(false);
    await host.load(SOURCE, SURFACE);
    await host.play();

    const authoritative: RemotePlaybackState = {
      playing: true,
      position: 30,
      updatedAt: Date.now(),
      version: 7,
    };
    guest.applyRemote(authoritative);
    await guest.load(SOURCE, SURFACE);

    expect(guest.getState().status).toBe('playing');
    expect(guest.getCurrentTime()).toBeGreaterThanOrEqual(30);
    host.destroy();
    guest.destroy();
  });
});
