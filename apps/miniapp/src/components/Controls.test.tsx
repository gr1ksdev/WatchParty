// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Controls } from './Controls';

function renderControls(overrides: Partial<Parameters<typeof Controls>[0]> = {}) {
  const callbacks = {
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onSeek: vi.fn(),
  };
  render(
    <Controls
      isHost
      playing={false}
      currentTime={10}
      duration={100}
      {...callbacks}
      {...overrides}
    />,
  );
  return callbacks;
}

describe('controles de reprodução', () => {
  it('permite que o host reproduza, pause e busque uma posição', () => {
    const callbacks = renderControls();
    const play = screen.getByRole('button', { name: 'Reproduzir' });
    const pause = screen.getByRole('button', { name: 'Pausar' });

    expect(play).not.toBeDisabled();
    expect(pause).toBeDisabled();
    fireEvent.click(play);
    expect(callbacks.onPlay).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole('slider', { name: 'Posição do vídeo' }), { target: { value: '42' } });
    expect(callbacks.onSeek).toHaveBeenCalledWith(42);
  });

  it('bloqueia todos os controles para convidados', () => {
    renderControls({ isHost: false, playing: true });
    expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Posição do vídeo' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(/Apenas o host/);
  });

  it('também bloqueia quando o player não está pronto', () => {
    renderControls({ disabled: true });
    expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeDisabled();
  });
});
