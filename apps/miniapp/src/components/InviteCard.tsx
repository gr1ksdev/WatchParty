import { useState } from 'react';
import { buildInviteUrl } from '../lib/config';

interface InviteCardProps {
  roomId: string;
}

export function InviteCard({ roomId }: InviteCardProps) {
  const [feedback, setFeedback] = useState('');
  const inviteUrl = buildInviteUrl(roomId);

  async function copy(value: string, label: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement('textarea');
        field.value = value;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        field.remove();
      }
      setFeedback(`${label} copiado!`);
    } catch {
      setFeedback('Não foi possível copiar. Selecione o texto manualmente.');
    }
  }

  return (
    <section className="panel invite" aria-label="Convite">
      <div className="panel__header">
        <h2 className="panel__title">Convidar amigos</h2>
      </div>
      <p className="invite__label">ID da sala</p>
      <div className="invite__row">
        <code className="invite__code">{roomId}</code>
        <button type="button" className="button button--small" onClick={() => copy(roomId, 'ID')}>
          Copiar
        </button>
      </div>
      {inviteUrl && (
        <>
          <p className="invite__label">Link do bot</p>
          <div className="invite__row">
            <code className="invite__link">{inviteUrl}</code>
            <button
              type="button"
              className="button button--small"
              onClick={() => copy(inviteUrl, 'Link')}
            >
              Copiar
            </button>
          </div>
        </>
      )}
      {feedback && (
        <p className="invite__feedback" role="status">
          {feedback}
        </p>
      )}
    </section>
  );
}
