// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AdapterContext, AdapterEvent, PlaybackState, PlayerAdapter, PlayOptions, PauseOptions } from './types';
import { PlayerEngineError } from './types';
import { WatchPartyPlayer } from './WatchPartyPlayer';

const SOURCE = { kind: 'mp4' as const, url: 'https://example.com/video.mp4' };
const SURFACE = { video: document.createElement('video'), container: document.createElement('div') };

const emptyState = (): PlaybackState => ({
  status: 'idle',
  currentTime: 0,
  duration: 100,
  buffered: 0,
  volume: 1,
  muted: false,
  sourceKind: 'mp4',
});

class FakeAdapter implements PlayerAdapter {
  readonly kind = 'mp4' as const;
  state = emptyState();
  listeners = new Set<(event: AdapterEvent) => void>();
  load = vi.fn(async () => {
    this.state = { ...this.state, status: 'ready' };
    this.emit('ready');
  });
  play = vi.fn(async (_options?: PlayOptions) => {
    this.state = { ...this.state, status: 'playing' };
    this.emit('statechange');
  });
  pause = vi.fn(async (_options?: PauseOptions) => {
    this.state = { ...this.state, status: 'paused' };
    this.emit('statechange');
  });
  seekTo = vi.fn(async (seconds: number) => {
    this.state = { ...this.state, currentTime: seconds };
    this.emit('seeked');
  });
  getCurrentTime = () => this.state.currentTime;
  getDuration = () => this.state.duration;
  getBuffered = () => this.state.buffered;
  getPlaybackState = () => this.state;
  setVolume = vi.fn((volume: number) => {
    this.state = { ...this.state, volume };
  });
  setMuted = vi.fn((muted: boolean) => {
    this.state = { ...this.state, muted };
  });
  subscribe(listener: (event: AdapterEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  destroy = vi.fn(() => this.listeners.clear());
  emit(type: AdapterEvent['type']) {
    for (const listener of [...this.listeners]) listener({ type, at: Date.now() });
  }
}

function harness(adapter = new FakeAdapter(), options = {}) {
  const engine = new WatchPartyPlayer({
    commandTimeoutMs: 40,
    loadTimeoutMs: 100,
    timeupdateThrottleMs: 100,
    adapterFactory: (_context: AdapterContext) => adapter,
    ...options,
  });
  return { engine, adapter };
}

describe('WatchPartyPlayer', () => {
  it('carrega o adaptador e reaplica o estado autoritativo recebido antes do load', async () => {
    const { engine, adapter } = harness();
    const events: string[] = [];
    engine.subscribe((event) => events.push(event.type));
    engine.setRole(false);
    engine.applyRemote({ playing: true, position: 12, updatedAt: Date.now(), version: 3 });

    await engine.load(SOURCE, SURFACE);

    expect(events).toContain('ready');
    expect(adapter.seekTo).toHaveBeenCalled();
    expect(adapter.play).toHaveBeenCalledWith(expect.objectContaining({ muted: true }));
  });

  it('emite comandos locais e chama o adaptador para play/pause/seek', async () => {
    const { engine, adapter } = harness();
    await engine.load(SOURCE, SURFACE);
    const commands: string[] = [];
    engine.subscribe((event) => {
      if (event.kind === 'command' && event.origin === 'host-local') commands.push(event.action);
    });

    await engine.play();
    await engine.pause();
    await engine.seekTo(30);

    expect(commands).toEqual(['play', 'pause', 'seek']);
    expect(adapter.play).toHaveBeenCalled();
    expect(adapter.pause).toHaveBeenCalled();
    expect(adapter.seekTo).toHaveBeenCalledWith(30);
  });

  it('aplica comandos remotos sem gerar novos comandos', async () => {
    const { engine } = harness();
    await engine.load(SOURCE, SURFACE);
    const commands: string[] = [];
    engine.subscribe((event) => {
      if (event.kind === 'command') commands.push(event.origin);
    });

    engine.applyRemote({ playing: true, position: 5, updatedAt: Date.now(), version: 2 });
    expect(commands).toEqual([]);
  });

  it('falha com timeout configurável quando o provedor não confirma a mudança', async () => {
    const adapter = new FakeAdapter();
    adapter.play = vi.fn(async () => {
      // Não altera o estado: simula um provedor que não confirmou.
    });
    const { engine } = harness(adapter);
    await engine.load(SOURCE, SURFACE);

    await expect(engine.play(undefined, 'remote-sync')).rejects.toMatchObject({
      code: 'PLAY_CONFIRMATION_TIMEOUT',
    });
    expect(engine.getState().error?.code).toBe('PLAY_CONFIRMATION_TIMEOUT');
  });

  it('deduz eventos de tempo repetidos e mantém mudanças reais do adaptador', async () => {
    const { engine, adapter } = harness();
    await engine.load(SOURCE, SURFACE);
    const times: number[] = [];
    engine.subscribe((event) => {
      if (event.kind === 'state' && event.type === 'timeupdate') times.push(event.at);
    });

    adapter.state = { ...adapter.state, currentTime: 1 };
    adapter.emit('timeupdate');
    adapter.emit('timeupdate');
    expect(times).toHaveLength(1);

    adapter.state = { ...adapter.state, status: 'buffering' };
    adapter.emit('buffering');
    expect(engine.getState().status).toBe('buffering');
  });

  it('corrige deriva sem transformar a correção em comando do host', async () => {
    const { engine, adapter } = harness();
    await engine.load(SOURCE, SURFACE);
    engine.applyRemote({ playing: true, position: 10, updatedAt: Date.now(), version: 1 });
    const commands: string[] = [];
    engine.subscribe((event) => {
      if (event.kind === 'command') commands.push(event.origin);
    });

    expect(engine.correctDrift(50, 1.5)).toBe(true);
    expect(adapter.seekTo).toHaveBeenCalledWith(50);
    expect(commands).toEqual([]);
  });

  it('descarta carregamentos antigos e libera recursos no destroy', async () => {
    const slow = new FakeAdapter();
    slow.load = vi.fn(() => new Promise<void>(() => {}));
    const { engine, adapter } = harness(slow);
    const first = engine.load(SOURCE, SURFACE);
    await Promise.resolve();
    await engine.load(SOURCE, SURFACE);

    expect(adapter.load).toHaveBeenCalled();
    engine.destroy();
    expect(adapter.destroy).toHaveBeenCalled();
    await expect(first).resolves.toBeUndefined();
  });

  it('expõe erro de fonte não suportada sem quebrar o motor', async () => {
    const adapter = new FakeAdapter();
    adapter.load = vi.fn(async () => {
      throw new PlayerEngineError('GOOGLE_DRIVE_UNSUPPORTED', 'Não suportado.');
    });
    const { engine } = harness(adapter);
    await engine.load(SOURCE, SURFACE);
    expect(engine.getState().status).toBe('error');
    expect(engine.getState().error?.code).toBe('GOOGLE_DRIVE_UNSUPPORTED');
  });
});
