import { useState } from 'react';
import { formatTime } from '../lib/format';

interface ControlsProps {
  isHost: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered?: number;
  volume?: number;
  muted?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onVolume?: (volume: number) => void;
  onMute?: () => void;
  onFullscreen?: () => void;
  onEnableSound?: () => void;
  controllingLabel?: string;
}

/** Controles próprios e independentes do provedor de mídia. */
export function Controls({
  isHost,
  playing,
  currentTime,
  duration,
  buffered = 0,
  volume = 1,
  muted = false,
  loading = false,
  disabled = false,
  onPlay,
  onPause,
  onSeek,
  onVolume,
  onMute,
  onFullscreen,
  onEnableSound,
  controllingLabel,
}: ControlsProps) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const canControl = isHost && !disabled;
  const max = duration > 0 ? duration : 0;
  const value = max > 0 ? Math.min(Math.max(currentTime, 0), max) : 0;
  const bufferedValue = max > 0 ? Math.min(Math.max(buffered, 0), max) : 0;

  return (
    <section className="controls" aria-label="Controles de reprodução">
      <div className="controls__row">
        <button
          type="button"
          className="button button--primary"
          onClick={onPlay}
          disabled={!canControl || playing || loading}
          aria-label="Reproduzir"
        >
          {loading ? 'Carregando…' : playing ? '▶ Reproduzindo' : '▶ Reproduzir'}
        </button>
        <button
          type="button"
          className="button"
          onClick={onPause}
          disabled={!canControl || !playing}
          aria-label="Pausar"
        >
          ❚❚ Pausar
        </button>
        {!isHost && onEnableSound && !soundEnabled && (
          <button
            type="button"
            className="button"
            aria-label="Ativar som"
            onClick={() => {
              onEnableSound();
              setSoundEnabled(true);
            }}
          >
            🔊 Ativar som
          </button>
        )}
      </div>

      <div className="controls__timeline">
        <span className="controls__time">{formatTime(value)}</span>
        <div className="controls__track">
          <input
            type="range"
            min={0}
            max={max}
            step={0.1}
            value={value}
            disabled={!canControl || max === 0}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label="Posição do vídeo"
          />
          <div className="controls__buffered" style={{ width: `${max ? (bufferedValue / max) * 100 : 0}%` }} />
        </div>
        <span className="controls__time">{formatTime(duration)}</span>
      </div>

      <div className="controls__row controls__row--secondary">
        <button type="button" className="button button--small" onClick={onMute} aria-label="Mudo">
          {muted ? '🔇 Sem som' : '🔊 Som'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(event) => onVolume?.(Number(event.target.value))}
          aria-label="Volume"
        />
        <button type="button" className="button button--small" onClick={onFullscreen} aria-label="Tela cheia">
          ⛶ Tela cheia
        </button>
      </div>

      {controllingLabel && <p className="controls__controller">{controllingLabel}</p>}
      {!isHost ? (
        <p className="controls__hint" role="note">
          🔒 Apenas o host pode reproduzir, pausar e avançar o vídeo.
        </p>
      ) : (
        <p className="controls__hint" role="note">
          Controles sincronizados: todos os participantes acompanham esta reprodução.
        </p>
      )}
    </section>
  );
}
