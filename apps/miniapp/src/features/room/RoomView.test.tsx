// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { Participant, RoomState } from '@watchparty/shared';
import { describe, expect, it } from 'vitest';
import { RoomView } from './RoomView';

const room: RoomState = {
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

const user = { id: '777', firstName: 'Ana', username: 'ana' };
const host: Participant = { userId: '777', firstName: 'Ana', role: 'host', joinedAt: 0 };

describe('RoomView', () => {
  it('mostra identificação da sala, host, player e conectividade', () => {
    render(
      <RoomView
        room={room}
        isHost
        viewerId="777"
        user={user}
        platform="android"
        participants={[host]}
      />,
    );

    expect(screen.getAllByText('ABC12345').length).toBeGreaterThan(0);
    expect(screen.getByText(/Você é o host/)).toBeInTheDocument();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Vídeo da sala').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Participantes')).toHaveTextContent('Ana');
    expect(screen.getByPlaceholderText('Escreva uma mensagem')).toBeDisabled();
  });

  it('mantém os controles bloqueados para convidados', () => {
    render(<RoomView room={room} isHost={false} viewerId="999" user={user} platform="ios" />);

    expect(screen.getAllByText(/Host:/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(/Apenas o host/);
  });

  it('mostra o estado real da conexão e a sincronização ativa', () => {
    render(<RoomView room={room} isHost viewerId="777" user={user} connectionStatus="reconnecting" />);
    expect(screen.getByText('Reconectando')).toBeInTheDocument();
    expect(screen.getByText(/Reprodução sincronizada em tempo real/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeDisabled();
  });
});
