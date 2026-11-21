import { useEffect, useMemo } from 'react';
import { ErrorView, LoadingView } from './components/StateViews';
import { RoomScreen } from './features/room/RoomScreen';
import { useRoomSession } from './hooks/useRoomSession';
import { useTelegram } from './hooks/useTelegram';
import { buildFakeInitData, getFakeIdentity } from './lib/devSession';
import { normalizeStartParam } from './lib/room';
import { applyTelegramTheme } from './lib/theme';

export default function App() {
  const telegram = useTelegram();
  const fakeIdentity = useMemo(() => getFakeIdentity(), []);
  const initData = telegram.initData || (fakeIdentity ? buildFakeInitData(fakeIdentity) : '');
  const startParam = normalizeStartParam(telegram.startParam ?? fakeIdentity?.startParam ?? undefined);
  const session = useRoomSession(initData || null, startParam);

  useEffect(() => {
    applyTelegramTheme(telegram.webApp);
  }, [telegram.webApp]);

  if (session.phase === 'idle' || session.phase === 'loading') {
    return <LoadingView />;
  }

  if (session.phase === 'error' || !session.data) {
    const isMissingTelegram = session.error?.code === 'NO_TELEGRAM';
    return (
      <ErrorView
        title={isMissingTelegram ? 'Abra pelo Telegram' : 'Não foi possível abrir a sala'}
        message={session.error?.message ?? 'Tente novamente em instantes.'}
        onRetry={initData ? session.retry : undefined}
      />
    );
  }

  if (!session.ticket) {
    return <ErrorView title="Sessão expirada" message="Feche e abra a sala novamente." onRetry={session.retry} />;
  }

  return (
    <RoomScreen
      room={session.data.room}
      isHost={session.data.viewer.isHost}
      viewerId={session.data.viewer.userId}
      user={session.user}
      platform={telegram.platform}
      initData={initData}
      ticket={session.ticket}
    />
  );
}
