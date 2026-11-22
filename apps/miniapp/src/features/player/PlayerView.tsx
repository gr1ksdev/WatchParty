import { useEffect, useRef, useState } from 'react';
import type { VideoSource } from '@watchparty/shared';
import { Controls } from '../../components/Controls';
import type { SocketStatus } from '../../hooks/useRoomSocket';
import { Player } from './Player';
import type { PlaybackState, WatchPartyPlayer } from './engine';

interface PlayerViewProps {
  source: VideoSource;
  engine: WatchPartyPlayer | null;
  onEngine: (engine: WatchPartyPlayer | null) => void;
  isHost: boolean;
  connectionStatus: SocketStatus;
  hostLabel: string;
}

const INITIAL: PlaybackState = {
  status: 'idle',
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  sourceKind: null,
};

/** Única interface visual do player — nenhum componente conhece o provedor. */
export function PlayerView({ source, engine, onEngine, isHost, connectionStatus, hostLabel }: PlayerViewProps) {
  const [state, setState] = useState<PlaybackState>(INITIAL);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine) {
      setState(INITIAL);
      return;
    }
    setState(engine.getState());
    return engine.subscribe((event) => {
      if (event.kind === 'state') setState(event.state);
    });
  }, [engine]);

  const loading = state.status === 'loading' || state.status === 'buffering';
  const paused = state.status !== 'playing';

  return (
    <div className="wp-player" ref={wrapperRef}>
      <Player source={source} onEngine={onEngine} />

      {loading && (
        <div className="player__status" role="status">
          <span className="player__spinner" aria-hidden="true" />
          {state.status === 'buffering' ? 'Carregando vídeo…' : 'Preparando player…'}
        </div>
      )}

      {state.status === 'error' && (
        <div className="player__overlay" role="alert">
          <span className="player__overlay-icon" aria-hidden="true">⚠️</span>
          <p className="player__overlay-title">Não foi possível reproduzir o vídeo</p>
          <p className="player__overlay-message">{state.error?.message ?? 'Erro desconhecido.'}</p>
          {(state.error?.code.includes('CONFIRMATION_TIMEOUT') || state.error?.code === 'AUTOPLAY_BLOCKED') && (
            <button
              type="button"
              className="button button--primary"
              onClick={() => void engine?.play(undefined, 'user-gesture')}
            >
              Tocar novamente
            </button>
          )}
          <p className="player__overlay-hint">
            O vídeo vem diretamente da origem para este dispositivo. Nenhum byte passa pelo Worker.
          </p>
        </div>
      )}

      <Controls
        isHost={isHost}
        playing={!paused}
        currentTime={state.currentTime}
        duration={state.duration}
        buffered={state.buffered}
        volume={state.volume}
        muted={state.muted}
        loading={loading}
        disabled={!engine?.isReady() || connectionStatus !== 'connected'}
        onPlay={() => void engine?.play()}
        onPause={() => void engine?.pause()}
        onSeek={(seconds) => void engine?.seekTo(seconds)}
        onVolume={(volume) => engine?.setVolume(volume)}
        onMute={() => engine?.setMuted(!state.muted)}
        onFullscreen={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void wrapperRef.current?.requestFullscreen?.();
        }}
        onEnableSound={() => engine?.setMuted(false)}
        controllingLabel={isHost ? 'Você está controlando a reprodução' : `Host: ${hostLabel}`}
      />
    </div>
  );
}
