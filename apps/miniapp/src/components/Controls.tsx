import { formatTime } from '../lib/format';

interface ControlsProps {
  isHost: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  disabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
}

/** Controles locais. Convidados veem os botões bloqueados: apenas o host controla. */
export function Controls({
  isHost,
  playing,
  currentTime,
  duration,
  disabled = false,
  onPlay,
  onPause,
  onSeek,
}: ControlsProps) {
  const canControl = isHost && !disabled;
  const max = duration > 0 ? duration : 0;
  const value = max > 0 ? Math.min(Math.max(currentTime, 0), max) : 0;

  return (
    <section className="controls" aria-label="Controles de reprodução">
      <div className="controls__row">
        <button
          type="button"
          className="button button--primary"
          onClick={onPlay}
          disabled={!canControl || playing}
          aria-label="Reproduzir"
        >
          ▶ Reproduzir
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
      </div>

      <div className="controls__timeline">
        <span className="controls__time">{formatTime(value)}</span>
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
        <span className="controls__time">{formatTime(duration)}</span>
      </div>

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
