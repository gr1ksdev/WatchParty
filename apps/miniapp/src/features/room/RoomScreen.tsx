import { useCallback, useRef, useState } from 'react';
import {
  MAX_CHAT_HISTORY,
  type Participant,
  type RoomState,
  type ServerMessage,
} from '@watchparty/shared';
import { usePlaybackSync } from '../../hooks/usePlaybackSync';
import { useRoomSocket, type SocketTiming } from '../../hooks/useRoomSocket';
import type { PlayerController, PlayerError, PlaybackStatus } from '../player/types';
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

/** Container que liga WebSocket, sincronização, presença e chat à tela da sala. */
export function RoomScreen({ room, isHost, viewerId, user, initData, ticket, platform }: RoomScreenProps) {
  const [liveRoom, setLiveRoom] = useState(room);
  const [controller, setController] = useState<PlayerController | null>(null);
  const [duration, setDuration] = useState(0);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const syncRef = useRef<ReturnType<typeof usePlaybackSync> | null>(null);

  const handleController = useCallback((next: PlayerController | null) => setController(next), []);
  const handleStatus = useCallback((status: PlaybackStatus) => {
    setDuration((current) => (current === status.duration ? current : status.duration));
  }, []);
  const handlePlayerError = useCallback((_error: PlayerError | null) => {}, []);

  const onMessage = useCallback((message: ServerMessage, timing: SocketTiming) => {
    syncRef.current?.applyMessage(message, timing);

    switch (message.t) {
      case 'state':
        setLiveRoom(message.state);
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

  const socket = useRoomSocket({
    roomId: room.id,
    initData,
    initialTicket: ticket,
    onMessage,
  });

  const sync = usePlaybackSync({
    controller,
    isHost,
    duration,
    timing: socket.timing,
    send: socket.send,
  });
  syncRef.current = sync;

  const sendChat = useCallback(
    (text: string) => {
      const ok = socket.send({ t: 'chat', text });
      setChatNotice(ok ? null : 'Chat indisponível no momento. Verifique a conexão.');
    },
    [socket.send],
  );

  const handleControl = useCallback(
    (action: 'play' | 'pause' | 'seek', position?: number) => {
      sync.sendControl(action, position);
    },
    [sync.sendControl],
  );

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
      onControl={handleControl}
      chatNotice={chatNotice}
      onController={handleController}
      onStatus={handleStatus}
      onPlayerError={handlePlayerError}
    />
  );
}
