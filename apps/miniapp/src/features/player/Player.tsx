import { useEffect, useRef } from 'react';
import type { VideoSource } from '@watchparty/shared';
import { WatchPartyPlayer } from './engine';

interface PlayerProps {
  source: VideoSource;
  onEngine: (engine: WatchPartyPlayer | null) => void;
}

/** Host React mínimo: cria as superfícies e entrega o ciclo de vida ao motor. */
export function Player({ source, onEngine }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceKey = `${source.kind}:${source.url}:${source.videoId ?? ''}`;

  useEffect(() => {
    const engine = new WatchPartyPlayer();
    onEngine(engine);
    void engine.load(source, { video: videoRef.current, container: containerRef.current });
    return () => {
      engine.destroy();
      onEngine(null);
    };
    // A chave da fonte controla a recriação; o objeto source é preservado pela sala.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  return source.kind === 'youtube' ? (
    <div ref={containerRef} className="player-youtube" aria-label="Player do YouTube" />
  ) : (
    <video ref={videoRef} className="player-video" playsInline preload="metadata" aria-label="Vídeo da sala" />
  );
}
