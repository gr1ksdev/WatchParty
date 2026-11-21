interface StateViewProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function LoadingView() {
  return (
    <main className="state-view" aria-busy="true">
      <div className="state-view__spinner" aria-hidden="true" />
      <h1>Carregando a sala…</h1>
      <p>Validando sua sessão e buscando o vídeo.</p>
    </main>
  );
}

export function ErrorView({ title, message, onRetry }: StateViewProps) {
  return (
    <main className="state-view" role="alert">
      <span className="state-view__icon" aria-hidden="true">
        ⚠️
      </span>
      <h1>{title}</h1>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button button--primary" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </main>
  );
}

export function EmptyView({ title, message }: Omit<StateViewProps, 'onRetry'>) {
  return (
    <main className="state-view">
      <span className="state-view__icon" aria-hidden="true">
        🎬
      </span>
      <h1>{title}</h1>
      <p>{message}</p>
    </main>
  );
}
