import { useCallback, useRef, useState } from 'react';
import { MAX_CHAT_HISTORY, type Participant, type RoomState, type ServerMessage } from '@watchparty/shared';
import type { WatchPartyPlayer } from '../player/engine';
import { usePlaybackSync } from '../../hooks/usePlaybackSync';
import { useRoomSocket, type SocketTiming } from '../../hooks/useRoomSocket';
import { RoomView } from './RoomView';

interface RoomScreenProps {
  room: RoomState;
  isHost: boolean;
  viewerId: string;
  user: { id: string; firstName: string; username?: string; photoUrl?: string } | null;
  initData: string;
  ticket: string;
  platform?: string;
}

/** Container que liga WebSocket, motor de reprodução, presença e chat à tela. */
export function RoomScreen({ room, isHost, viewerId, user, initData, ticket, platform }: RoomScreenProps) {
  const [liveRoom, setLiveRoom] = useState(room);
  const [engine, setEngine] = useState<WatchPartyPlayer | null>(null);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const syncRef = useRef<ReturnType<typeof usePlaybackSync> | null>(null);

  const handleEngine = useCallback((next: WatchPartyPlayer | null) => setEngine(next), []);

  const onMessage = useCallback((message: ServerMessage, timing: SocketTiming) => {
    syncRef.current?.applyMessage(message, timing);

    switch (message.t) {
      case 'state':
        // Preserva a referência de `source` para não recriar o player à toa.
        setLiveRoom((current) => ({
          ...message.state,
          source:
            current.source.kind === message.state.source.kind &&
            current.source.url === message.state.source.url &&
            current.source.videoId === message.state.source.videoId
              ? current.source
              : message.state.source,
        }));
        break;
      case 'chat':
        setLiveRoom((current) => ({
          ...current,
          chat: [...current.chat, message.message].slice(-MAX_CHAT_HISTORY),
        }));
        setChatNotice(null);
        break;
      case 'participant':
        setLiveRoom((current) => {
          const others = current.participants.filter(
            (participant: Participant) => participant.userId !== message.user.userId,
          );
          return {
            ...current,
            participants: message.action === 'join' ? [...others, message.user] : others,
          };
        });
        break;
      case 'error':
        if (message.code === 'FORBIDDEN') setChatNotice('Somente o host pode controlar a reprodução.');
        else if (message.code === 'RATE_LIMITED') setChatNotice('Aguarde um instante antes de enviar outra mensagem.');
        else setChatNotice(message.message);
        break;
      default:
        break;
    }
  }, []);

  const socket = useRoomSocket({ roomId: room.id, initData, initialTicket: ticket, onMessage });
  const sync = usePlaybackSync({ engine, isHost, timing: socket.timing, send: socket.send });
  syncRef.current = sync;

  const sendChat = useCallback(
    (text: string) => {
      const ok = socket.send({ t: 'chat', text });
      setChatNotice(ok ? null : 'Chat indisponível no momento. Verifique a conexão.');
    },
    [socket.send],
  );

  const hostName = liveRoom.participants.find((participant) => participant.userId === room.hostId)?.firstName;

  return (
    <RoomView
      room={liveRoom}
      isHost={isHost}
      viewerId={viewerId}
      user={user}
      platform={platform}
      connectionStatus={socket.status}
      participants={liveRoom.participants}
      chatMessages={liveRoom.chat}
      onSendChat={sendChat}
      chatNotice={chatNotice}
      engine={engine}
      onEngine={handleEngine}
      hostLabel={hostName ?? `usuário ${room.hostId.slice(0, 4)}`}
    />
  );
}
