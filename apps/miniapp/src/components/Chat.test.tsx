// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChatMessage, Participant } from '@watchparty/shared';
import { describe, expect, it, vi } from 'vitest';
import { Chat } from './Chat';

const participants: Participant[] = [
  { userId: '777', firstName: 'Ana', role: 'host', joinedAt: 0 },
  { userId: '999', firstName: 'Bia', role: 'guest', joinedAt: 1 },
];

const messages: ChatMessage[] = [
  {
    id: 'm1',
    userId: '999',
    firstName: 'Bia',
    text: '<script>alert(1)</script> olá',
    createdAt: 1_700_000_000_000,
  },
];

describe('Chat em tempo real', () => {
  it('envia o texto digitado e limpa o campo', () => {
    const onSend = vi.fn();
    render(<Chat messages={[]} onSend={onSend} participants={participants} currentUserId="777" />);

    const input = screen.getByLabelText('Mensagem');
    fireEvent.change(input, { target: { value: 'Oi pessoal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSend).toHaveBeenCalledWith('Oi pessoal');
    expect(input).toHaveValue('');
  });

  it('mostra remetente e horário e nunca interpreta HTML', () => {
    const { container } = render(
      <Chat messages={messages} participants={participants} currentUserId="777" onSend={vi.fn()} />,
    );

    expect(screen.getByText('Bia')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script> olá');
    expect(container.querySelector('time')).toBeInTheDocument();
  });

  it('bloqueia o envio quando a conexão cai', () => {
    render(<Chat messages={[]} onSend={vi.fn()} disabled notice="Desconectado" />);
    expect(screen.getByLabelText('Mensagem')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Desconectado');
  });
});
