import { useCallback, useState } from 'react';
import {
  type ChatMessage,
  type ControlAction,
  type Participant,
  type RoomState,
} from '@watchparty/shared';
import { Chat } from '../../components/Chat';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { Controls } from '../../components/Controls';
import { InviteCard } from '../../components/InviteCard';
import { Participants } from '../../components/Participants';
import { SOURCE_LABELS } from '../../lib/format';
import type { SocketStatus } from '../../hooks/useRoomSocket';
import { Player } from '../player/Player';
import type { PlayerController, PlayerError, PlaybackStatus } from '../player/types';

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
  onControl?: (action: ControlAction, position?: number) => void;
  onEnableSound?: () => void;
  chatNotice?: string | null;
  onController?: (controller: PlayerController | null) => void;
  onStatus?: (status: PlaybackStatus) => void;
  onPlayerError?: (error: PlayerError | null) => void;
}

/** Tela da sala. O container RoomScreen fornece socket, presença, chat e sincronização. */
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
  onControl,
  onEnableSound,
  chatNotice,
  onController,
  onStatus,
  onPlayerError,
}: RoomViewProps) {
  const [controller, setController] = useState<PlayerController | null>(null);
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  const [playback, setPlayback] = useState<PlaybackStatus>({
    playing: false,
    currentTime: 0,
    duration: 0,
  });

  const handleController = useCallback(
    (next: PlayerController | null) => {
      setController(next);
      onController?.(next);
    },
    [onController],
  );
  const handleStatus = useCallback(
    (next: PlaybackStatus) => {
      setPlayback(next);
      onStatus?.(next);
    },
    [onStatus],
  );
  const handlePlayerError = useCallback(
    (next: PlayerError | null) => {
      setPlayerError(next);
      onPlayerError?.(next);
    },
    [onPlayerError],
  );

  const hostName = participants.find((participant) => participant.userId === room.hostId)?.firstName;
  const hostLabel = hostName ?? `usuário ${room.hostId.slice(0, 4)}`;

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
          <Player
            source={room.source}
            onController={handleController}
            onStatus={handleStatus}
            onError={handlePlayerError}
          />

          <div className="room__meta">
            <div>
              <p className="room__eyebrow">Sala</p>
              <h1 className="room__title">
                <code>{room.id}</code>
              </h1>
            </div>
            <div className={`room-role ${isHost ? 'room-role--host' : ''}`}>
              {isHost ? '👑 Você é o host' : `👑 Host: ${hostLabel}`}
            </div>
          </div>

          <p className="room__source">{SOURCE_LABELS[room.source.kind]}</p>

          <Controls
            isHost={isHost}
            playing={playback.playing}
            currentTime={playback.currentTime}
            duration={playback.duration}
            disabled={!controller || playerError !== null || connectionStatus !== 'connected'}
            onPlay={() => (onControl ? onControl('play') : void controller?.play())}
            onPause={() => (onControl ? onControl('pause') : controller?.pause())}
            onSeek={(seconds) => (onControl ? onControl('seek', seconds) : controller?.seekTo(seconds))}
            onEnableSound={onEnableSound}
          />
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
