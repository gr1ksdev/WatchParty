# Setup, testes e deploy (Etapa 1)

## Pré-requisitos

- Node.js 20 ou superior (testado com Node 24).
- npm 11 (ou superior).
- Conta Cloudflare e Wrangler autenticado (`npx wrangler login`).
- Bot criado no BotFather com username definido.

## Instalação

```bash
npm install
```

## Configuração local

```bash
cp .dev.vars.example .dev.vars
# edite .dev.vars com o token, o segredo do webhook, o username e a URL do Worker
```

`.dev.vars` é lido automaticamente pelo `wrangler dev` e pelo script de webhook.
Nunca versionar este arquivo.

## Segredos do Worker

```bash
cd apps/worker
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

O segredo do webhook pode ser gerado localmente, por exemplo:

```bash
openssl rand -hex 32
```

Use o mesmo valor em `.dev.vars` (`TELEGRAM_WEBHOOK_SECRET`) e no secret do Worker.

## Variáveis de ambiente

| Nome | Tipo | Descrição |
|---|---|---|
| `MINI_APP_URL` | var em `wrangler.toml` | URL base do Mini App (provisória até a Etapa 2) |
| `WORKER_URL` | var / `.dev.vars` | URL pública do Worker, usada pelo script de webhook |
| `TELEGRAM_BOT_USERNAME` | var opcional / `.dev.vars` | Evita uma chamada `getMe` a cada `/play` |
| `TELEGRAM_BOT_TOKEN` | secret | Token do BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | secret | Segredo compartilhado do webhook |
| `ALLOW_FAKE_INIT_DATA` | `.dev.vars` apenas | Habilita `initData` simulado no develop; **nunca** em produção |

### Variáveis do Mini App (Etapa 2)

Em `apps/miniapp/.env` (veja `.env.example`):

| Nome | Descrição |
|---|---|
| `VITE_WORKER_URL` | URL pública do Worker; vazio em dev usa o proxy `/api` → `localhost:8787` |
| `VITE_BOT_USERNAME` | Usado no botão **Convidar amigos** |
| `VITE_ENABLE_FAKE_TELEGRAM` | `1` ativa a identidade simulada (somente em build de dev) |

O modo simulado exige **as duas** flags (`VITE_ENABLE_FAKE_TELEGRAM=1` e
`ALLOW_FAKE_INIT_DATA=1`). Mesmo assim, o `initData` simulado passa por
`POST /api/session`: a autenticação continua centralizada no Worker.

## Executar localmente

```bash
npm run dev
# inicia o Worker em http://localhost:8787
```

Para receber updates do Telegram no Workers Dev, use um túnel HTTPS apontando para
a porta 8787 e configure o webhook com a URL pública resultante.

## Configurar o webhook

Após o deploy (ou com um túnel HTTPS ativo):

```bash
WORKER_URL=https://watchparty-worker.<conta>.workers.dev npm run webhook:set
```

O script lê também `.dev.vars` e chama `setWebhook` com `secret_token` e
`allowed_updates: ["message"]`. Ele nunca imprime o token.

## Deploy

```bash
npm run build
npm run deploy
```

O `npm run build` executa um *dry run* do Wrangler e a verificação de tipos de
todos os workspaces. O deploy usa `apps/worker/wrangler.toml`.

## Testes

```bash
npm run check
npm test
npm run build
```

Os testes cobrem:

- Identificação de MP4, WebM, HLS e YouTube (`parse.test.ts`).
- HEAD, content-type, redirecionamentos e bloqueios anti-SSRF (`validate.test.ts`).
- Interpretação de comandos e teclados inline (`commands.test.ts`).
- Webhook: segredo, payload inválido, `/start`, `/help`, `/play` (`webhook.test.ts`).
- Criação/idempotência de salas (`state.test.ts`).
- Geração de IDs e comparação de segredos (`ids.test.ts`, `strings.test.ts`).
- Contratos do protocolo (`protocol.test.ts`).
- HMAC do `initData`, janela de `auth_date` e modo simulado (`init-data.test.ts`).
- Emissão/verificação do ticket (`ticket.test.ts`).
- Rotas `/api/session` e `/api/rooms/:id`, erros e CORS (`api.test.ts`).
- Hook `useTelegram`, fluxo de sessão/sala, API client, fábrica de players,
  adaptadores HTML5/YouTube, controles e permissões visuais (`apps/miniapp`).
- Upgrade WebSocket: ticket ausente/inválido/expirado, sala inexistente,
  identidade injetada e CORS (`ws/upgrade.test.ts`).
- Autoridade da sala: estado inicial, entrada/saída, duplicidade, FORBIDDEN,
  incremento de versão, fan-out, chat, limites, heartbeat e reconexão
  (`rooms/runtime.test.ts`).
- Mini App: conexão/heartbeat/reconexão com backoff (`useRoomSocket.test.tsx`),
  aplicação de estado/controle, versões, anti-loop e deriva
  (`usePlaybackSync.test.tsx`), chat e participantes em tempo real.

## Testando os comandos no Telegram

- `/start` — deve apresentar o bot e orientar ao uso de `/play`.
- `/help` — deve listar os três comandos e os formatos aceitos.
- `/play https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`
  — deve responder com "Sala criada", o ID da sala e os botões **Abrir sala** e
  **Convidar amigos**.
- `/play https://example.com/pagina` — deve responder com erro quando o
  `content-type` não for de vídeo.
- `/start <ID da sala>` — deve responder com o botão de entrada na sala.

O botão **Abrir sala** leva ao Mini App em `MINI_APP_URL/?start_param=<id>`.
Em produção, configure `VITE_WORKER_URL` no build do Pages para que o Mini App
chame a API e o WebSocket do Worker (o CORS aceita a origem de `MINI_APP_URL`).

Para criar uma sala sem Telegram em desenvolvimento (endpoint isolado, desativado
em produção — exige `ALLOW_FAKE_INIT_DATA=1`):

```bash
curl -X POST http://localhost:8787/api/dev/rooms \
  -H 'content-type: application/json' \
  -d '{"initData":"fake:<base64url do payload>","source":{"kind":"mp4","url":"https://example.com/video.mp4"}}'
```

O `initData` simulado tem o formato `fake:` + base64url de
`{"userId":777,"firstName":"Ana","startParam":"<id da sala>"}`.
O roteiro completo com duas sessões está em [`04-roteiro-etapa3.md`](04-roteiro-etapa3.md).
