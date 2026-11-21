import type { SocketStatus } from '../hooks/useRoomSocket';

const LABELS: Record<SocketStatus, string> = {
  connecting: 'Conectando',
  connected: 'Conectado',
  reconnecting: 'Reconectando',
  disconnected: 'Desconectado',
};

/** Reflete o estado real do WebSocket — nunca exibe sincronização falsa. */
export function ConnectionBadge({ status }: { status: SocketStatus }) {
  return (
    <span className={`connection connection--${status}`} title="Conexão em tempo real com a sala">
      <span className="connection__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
