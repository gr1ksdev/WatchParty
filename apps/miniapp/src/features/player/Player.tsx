import { useEffect, useRef, useState } from 'react';
import type { VideoSource } from '@watchparty/shared';
import { createPlayerAdapter } from './factory';
import type { PlayerController, PlayerError, PlaybackStatus } from './types';

interface PlayerProps {
  source: VideoSource;
  onController: (controller: PlayerController | null) => void;
  onStatus: (status: PlaybackStatus) => void;
  onError: (error: PlayerError | null) => void;
}

/** Superfície do player + ciclo de vida do adaptador selecionado pela fonte. */
export function Player({ source, onController, onStatus, onError }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<PlayerError | null>(null);

  useEffect(() => {
    setError(null);
    onError(null);
    let controller: PlayerController | null = null;

    try {
      controller = createPlayerAdapter({
        source,
        video: videoRef.current,
        container: containerRef.current,
        onStatus,
        onError: (next) => {
          setError(next);
          onError(next);
        },
      });
      onController(controller);
    } catch (cause) {
      const next: PlayerError = {
        code: 'PLAYER_INIT_ERROR',
        message: cause instanceof Error ? cause.message : 'Não foi possível iniciar o player.',
        source: source.kind,
      };
      setError(next);
      onError(next);
    }

    return () => {
      onController(null);
      controller?.destroy();
    };
  }, [source, onController, onStatus, onError]);

  return (
    <div className="player">
      {source.kind === 'youtube' ? (
        <div ref={containerRef} className="player-youtube" aria-label="Player do YouTube" />
      ) : (
        <video
          ref={videoRef}
          className="player-video"
          playsInline
          preload="metadata"
          aria-label="Vídeo da sala"
        />
      )}

      {error && (
        <div className="player__overlay" role="alert">
          <span className="player__overlay-icon" aria-hidden="true">
            ⚠️
          </span>
          <p className="player__overlay-title">Não foi possível reproduzir o vídeo</p>
          <p className="player__overlay-message">{error.message}</p>
          <p className="player__overlay-hint">
            O vídeo é carregado diretamente da origem neste dispositivo. Links com login, DRM ou
            bloqueio de incorporação não podem ser reproduzidos.
          </p>
        </div>
      )}
    </div>
  );
}
