import type { Participant } from '@watchparty/shared';
import { Avatar } from './Avatar';

interface ParticipantsProps {
  participants: Participant[];
  hostId: string;
  currentUserId?: string;
  photoUrl?: string;
}

/** Lista de presença enviada pelo Durable Object via WebSocket. */
export function Participants({ participants, hostId, currentUserId, photoUrl }: ParticipantsProps) {
  const items = [...participants].sort(
    (left, right) => Number(right.userId === hostId) - Number(left.userId === hostId),
  );

  return (
    <section className="panel" aria-label="Participantes">
      <div className="panel__header">
        <h2 className="panel__title">Participantes</h2>
        <span className="panel__count">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="panel__empty">Ninguém conectado ainda.</p>
      ) : (
        <ul className="participants">
          {items.map((participant) => {
            const isCurrent = participant.userId === currentUserId;
            return (
              <li className="participant" key={participant.userId}>
                <Avatar
                  name={participant.firstName}
                  photoUrl={isCurrent ? photoUrl : undefined}
                />
                <span className="participant__name">
                  {participant.firstName}
                  {isCurrent && <span className="participant__you">você</span>}
                </span>
                {participant.userId === hostId && (
                  <span className="participant__host" title="Host da sala">
                    👑 host
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="panel__note">A lista é atualizada em tempo real.</p>
    </section>
  );
}
