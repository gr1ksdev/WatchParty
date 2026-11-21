// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { Participant } from '@watchparty/shared';
import { describe, expect, it } from 'vitest';
import { Participants } from './Participants';

const participants: Participant[] = [
  { userId: '999', firstName: 'Bia', role: 'guest', joinedAt: 2 },
  { userId: '777', firstName: 'Ana', role: 'host', joinedAt: 1 },
];

describe('Participantes', () => {
  it('usa a lista enviada pelo servidor e destaca host e usuário atual', () => {
    render(<Participants participants={participants} hostId="777" currentUserId="777" />);

    const list = screen.getByLabelText('Participantes');
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(list.textContent).toContain('você');
    expect(list.textContent).toContain('host');
    expect(list.textContent).toContain('A lista é atualizada em tempo real.');
  });

  it('mostra estado vazio quando ninguém está conectado', () => {
    render(<Participants participants={[]} hostId="777" />);
    expect(screen.getByText(/Ninguém conectado/)).toBeInTheDocument();
  });
});
