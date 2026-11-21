import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, Participant } from '@watchparty/shared';
import { MAX_CHAT_TEXT_LENGTH } from '@watchparty/shared';

interface ChatProps {
  messages: ChatMessage[];
  currentUserId?: string;
  participants?: Participant[];
  onSend?: (text: string) => void;
  disabled?: boolean;
  notice?: string | null;
}

function senderName(message: ChatMessage, participants: Participant[], currentUserId?: string): string {
  if (message.userId === currentUserId) return 'Você';
  return participants.find((participant) => participant.userId === message.userId)?.firstName ?? message.firstName;
}

function messageTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Chat em tempo real. Texto é sempre renderizado como texto (nunca HTML). */
export function Chat({ messages, currentUserId, participants = [], onSend, disabled = false, notice }: ChatProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || disabled || !onSend) return;
    onSend(text);
    setDraft('');
  }

  return (
    <section className="panel" aria-label="Chat da sala">
      <div className="panel__header">
        <h2 className="panel__title">Chat</h2>
        <span className="panel__count">{messages.length}</span>
      </div>

      {messages.length === 0 ? (
        <p className="panel__empty">Nenhuma mensagem ainda. Digite um olá! 👋</p>
      ) : (
        <ul className="chat" ref={listRef}>
          {messages.map((message) => (
            <li className="chat__message" key={message.id}>
              <span className="chat__meta">
                <strong>{senderName(message, participants, currentUserId)}</strong>
                <time dateTime={new Date(message.createdAt).toISOString()}>
                  {messageTime(message.createdAt)}
                </time>
              </span>
              <span>{message.text}</span>
            </li>
          ))}
        </ul>
      )}

      <form className="chat__composer" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          maxLength={MAX_CHAT_TEXT_LENGTH}
          placeholder={disabled ? 'Conectando ao chat…' : 'Escreva uma mensagem'}
          disabled={disabled || !onSend}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Mensagem"
        />
        <button type="submit" className="button" disabled={disabled || !onSend || !draft.trim()}>
          Enviar
        </button>
      </form>
      {notice && (
        <p className="chat__notice" role="status">
          {notice}
        </p>
      )}
      <p className="panel__note">Mensagens são visíveis para todos os participantes da sala.</p>
    </section>
  );
}
