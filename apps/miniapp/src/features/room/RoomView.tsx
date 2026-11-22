import type { ChatMessage, Participant, RoomState } from '@watchparty/shared';
import { Chat } from '../../components/Chat';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { InviteCard } from '../../components/InviteCard';
import { Participants } from '../../components/Participants';
import { SOURCE_LABELS } from '../../lib/format';
import type { SocketStatus } from '../../hooks/useRoomSocket';
import type { WatchPartyPlayer } from '../player/engine';
import { PlayerView } from '../player/PlayerView';

interface RoomViewProps {
  room: RoomState;
  isHost: boolean;
  viewerId: string;
  user: { id: string; firstName: string; username?: string; photoUrl?: string } | null;
  platform?: string;
  connectionStatus?: SocketStatus;
  participants?: Participant[];
  chatMessages?: ChatMessage[];
  onSendChat?: (text: string) => void;
  chatNotice?: string | null;
  engine?: WatchPartyPlayer | null;
  onEngine?: (engine: WatchPartyPlayer | null) => void;
  hostLabel?: string;
}

/** Tela da sala. Toda a lógica de mídia fica encapsulada no PlayerView. */
export function RoomView({
  room,
  isHost,
  viewerId,
  user,
  platform,
  connectionStatus = 'connected',
  participants = room.participants,
  chatMessages = room.chat,
  onSendChat,
  chatNotice,
  engine = null,
  onEngine = () => {},
  hostLabel,
}: RoomViewProps) {
  const host = hostLabel ?? `usuário ${room.hostId.slice(0, 4)}`;

  return (
    <div className="room">
      <header className="room__topbar">
        <span className="room__brand">
          <span aria-hidden="true">🎬</span> Watch Party
        </span>
        <ConnectionBadge status={connectionStatus} />
      </header>

      <main className="room__main">
        <section className="room__stage" aria-label="Vídeo da sala">
          <PlayerView
            source={room.source}
            engine={engine}
            onEngine={onEngine}
            isHost={isHost}
            connectionStatus={connectionStatus}
            hostLabel={host}
          />

          <div className="room__meta">
            <div>
              <p className="room__eyebrow">Sala</p>
              <h1 className="room__title">
                <code>{room.id}</code>
              </h1>
            </div>
            <div className={`room-role ${isHost ? 'room-role--host' : ''}`}>
              {isHost ? '👑 Você é o host' : `👑 Host: ${host}`}
            </div>
          </div>

          <p className="room__source">{SOURCE_LABELS[room.source.kind]}</p>
        </section>

        <div className="room__side">
          <InviteCard roomId={room.id} />
          <Participants
            participants={participants}
            hostId={room.hostId}
            currentUserId={viewerId}
            photoUrl={user?.photoUrl}
          />
          <Chat
            messages={chatMessages}
            currentUserId={viewerId}
            participants={participants}
            onSend={onSendChat}
            disabled={connectionStatus !== 'connected'}
            notice={chatNotice}
          />
        </div>
      </main>

      <footer className="room__footer">
        <span>
          Sessão de {user?.firstName ?? `usuário ${viewerId}`} · {platform}
        </span>
        <span>Reprodução sincronizada em tempo real</span>
      </footer>
    </div>
  );
}
