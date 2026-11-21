# Mini App do WatchParty

Frontend da sala Watch Party dentro do Telegram Web App: React + TypeScript + Vite,
CSS próprio, SDK oficial do Telegram e `hls.js`. Publicado no Cloudflare Pages.

A sala usa WebSocket autenticado para sincronizar reprodução, chat e presença.
O indicador do topo mostra sempre o estado real da conexão.

## Estrutura

```text
src/
├── components/        # Avatar, Controls, Chat, Participants, InviteCard, estados
├── features/
│   ├── player/        # Player + adaptadores (HTML5, HLS, YouTube) + fábrica
│   └── room/          # RoomView (tela da sala)
├── hooks/             # useTelegram, useRoomSession, useRoomSocket, usePlaybackSync
├── lib/               # api, config, theme, devSession, ws, formatação
├── styles/            # global.css e room.css
└── types/             # tipos locais (Telegram, respostas da API, YouTube)
```

## Executar localmente

```bash
# na raiz do monorepo
npm install
npm run dev
```

- Vite: `http://localhost:5173` (proxy de `/api` para `http://localhost:8787`).
- Worker: `http://localhost:8787`.

Variáveis em `apps/miniapp/.env` (veja `.env.example`):

| Nome | Uso |
|---|---|
| `VITE_WORKER_URL` | URL pública do Worker. Vazio em dev (usa o proxy `/api`). |
| `VITE_BOT_USERNAME` | Monta o link **Convidar amigos**. |
| `VITE_ENABLE_FAKE_TELEGRAM` | Modo de desenvolvimento sem Telegram (`1` para ativar). |

### Modo de desenvolvimento sem Telegram

1. No Worker: `ALLOW_FAKE_INIT_DATA=1` em `.dev.vars` (nunca em `wrangler.toml`).
2. No Mini App: `VITE_ENABLE_FAKE_TELEGRAM=1` em `apps/miniapp/.env`.
3. Abra `http://localhost:5173/?start_param=<ID da sala>`.

O `initData` simulado é explícito (`fake:...`) e só é aceito com as duas flags
acima. Em produção, nenhuma das duas deve estar definida. O fluxo continua
passando por `POST /api/session`, ou seja, a autenticação não é duplicada.

Para criar uma sala sem Telegram em desenvolvimento, use `POST /api/dev/rooms`
no Worker (também exige `ALLOW_FAKE_INIT_DATA=1`). Veja
[`docs/04-roteiro-etapa3.md`](../../docs/04-roteiro-etapa3.md).

## Player

- **MP4/M4V/WebM/OGV** — `<video>` HTML5.
- **HLS** — `hls.js` (MSE), com fallback nativo quando indisponível.
- **YouTube** — IFrame Player API injetada por script, sem pacote extra.

Todos expõem `play`, `pause`, `seekTo`, `getCurrentTime`, `getDuration` e
`destroy`. O vídeo é buscado diretamente na origem pelo dispositivo; o Worker
nunca retransmite bytes. Falhas de mídia, CORS, DRM ou incorporação são
apresentadas em um overlay com mensagem clara — sem tentativas de burla.

## Sincronização

- `useRoomSocket` abre `/ws/:roomId?ticket=...`, envia `ping` a cada 20 s,
  renova o ticket e reconecta com backoff (1→2→4→…→10 s).
- `usePlaybackSync` aplica `state`/`control` ao adaptador ativo, usa os
  timestamps do servidor para calcular a posição esperada, ignora versões
  antigas, mantém a janela anti-loop e corrige derivas acima de 1,5 s.
- Apenas eventos de controle são enviados — nunca `timeupdate` contínuo.
- Chat e participantes vêm do Durable Object e são atualizados em tempo real.

## Permissões

O `viewer.isHost` devolvido pelo Worker controla a interface: host vê os
controles habilitados; convidados veem os controles bloqueados e o aviso
"🔒 Apenas o host pode reproduzir, pausar e avançar o vídeo". O Durable Object
valida novamente cada comando e responde `FORBIDDEN` a não-hosts.

## Comandos

```bash
npm run check   # tsc
npm test        # vitest (na raiz)
npm run build   # tsc + vite build
npm run preview # serve o build local
```
