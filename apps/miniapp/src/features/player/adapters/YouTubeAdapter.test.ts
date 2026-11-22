// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterContext } from '../engine/types';
import type { YouTubeNamespace, YouTubePlayerInstance } from '../../../types/youtube';
import { YouTubeAdapter } from './YouTubeAdapter';

type Events = {
  onReady?: (event: { target: YouTubePlayerInstance }) => void;
  onStateChange?: (event: { data: number }) => void;
  onError?: (event: { data: number }) => void;
};

class FakeYouTubePlayer implements YouTubePlayerInstance {
  static last: FakeYouTubePlayer | null = null;
  static events: Events | null = null;
  state = -1;
  currentTime = 0;
  calls: string[] = [];

  constructor(_element: HTMLElement, options: { events?: Events }) {
    FakeYouTubePlayer.last = this;
    FakeYouTubePlayer.events = options.events ?? null;
  }
  playVideo() {
    this.calls.push('play');
  }
  pauseVideo() {
    this.calls.push('pause');
  }
  seekTo(seconds: number) {
    this.calls.push('seek');
    this.currentTime = seconds;
  }
  getCurrentTime() {
    return this.currentTime;
  }
  getDuration() {
    return 120;
  }
  getPlayerState() {
    return this.state;
  }
  mute() {
    this.calls.push('mute');
  }
  unMute() {
    this.calls.push('unMute');
  }
  setVolume() {}
  getVideoLoadedFraction() {
    return 0.5;
  }
  destroy() {
    this.calls.push('destroy');
  }

  transition(state: number) {
    this.state = state;
    FakeYouTubePlayer.events?.onStateChange?.({ data: state });
  }
  ready() {
    FakeYouTubePlayer.events?.onReady?.({ target: this });
  }
}

function installYouTube() {
  window.YT = { Player: FakeYouTubePlayer } as unknown as YouTubeNamespace;
}

function context(): AdapterContext {
  return {
    source: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=abcdefghijk', videoId: 'abcdefghijk' },
    video: null,
    container: document.createElement('div'),
    commandTimeoutMs: 40,
  };
}

async function createReadyAdapter() {
  installYouTube();
  const adapter = new YouTubeAdapter(context());
  const loading = adapter.load();
  // A API é resolvia de forma assíncrona; espera o construtor do player fake.
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  FakeYouTubePlayer.last?.ready();
  await loading;
  return adapter;
}

afterEach(() => {
  delete window.YT;
});

describe('YouTubeAdapter', () => {
  it('só resolve play quando o estado real de reprodução é confirmado', async () => {
    const adapter = await createReadyAdapter();
    const player = FakeYouTubePlayer.last!;
    const playing = adapter.play({ timeoutMs: 200 });

    await Promise.resolve();
    expect(player.calls).toContain('play');
    player.transition(1);
    await expect(playing).resolves.toBeUndefined();
    expect(adapter.getPlaybackState().status).toBe('playing');
  });

  it('só resolve pause quando o iframe confirma o estado pausado', async () => {
    const adapter = await createReadyAdapter();
    const player = FakeYouTubePlayer.last!;
    player.transition(1);
    const pausing = adapter.pause({ timeoutMs: 200 });

    await Promise.resolve();
    expect(player.calls).toContain('pause');
    player.transition(2);
    await expect(pausing).resolves.toBeUndefined();
    expect(adapter.getPlaybackState().status).toBe('paused');
  });

  it('rejeita com timeout se o provedor não confirmar play', async () => {
    const adapter = await createReadyAdapter();
    await expect(adapter.play({ timeoutMs: 30 })).rejects.toMatchObject({
      code: 'PLAY_CONFIRMATION_TIMEOUT',
    });
  });

  it('reafirma pause se o iframe notificar reprodução depois do comando', async () => {
    const adapter = await createReadyAdapter();
    const player = FakeYouTubePlayer.last!;
    const pausing = adapter.pause({ timeoutMs: 200 });
    player.transition(1);
    await Promise.resolve();
    expect(player.calls.filter((call) => call === 'pause')).toHaveLength(2);
    player.transition(2);
    await pausing;
  });

  it('usa autoplay sem som quando solicitado e reporta buffering', async () => {
    const adapter = await createReadyAdapter();
    const player = FakeYouTubePlayer.last!;
    const playing = adapter.play({ muted: true, timeoutMs: 200 });
    expect(player.calls).toContain('mute');
    player.transition(3);
    expect(adapter.getPlaybackState().status).toBe('buffering');
    player.transition(1);
    await playing;
    expect(adapter.getPlaybackState().sourceKind).toBe('youtube');
  });

  it('libera recursos no destroy', async () => {
    const adapter = await createReadyAdapter();
    const player = FakeYouTubePlayer.last!;
    adapter.destroy();
    expect(player.calls).toContain('destroy');
  });
});
