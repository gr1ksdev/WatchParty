# Watch Party

Bot do Telegram + Mini App para assistir a vídeos em salas sincronizadas.

**Status:** Etapas 1, 2 e 3 implementadas. Bot, autenticação via `initData`, API REST,
Mini App React, players MP4/HLS/YouTube e salas sincronizadas em tempo real via
WebSocket/Durable Objects (controle do host, chat, presença e reconexão).
A especificação completa está em [`PLANO.md`](PLANO.md).

---

## Pré-requisitos

- Node.js 20+ (testado com Node 24) e npm 11+.
- Conta Cloudflare com Wrangler autenticado (`npx wrangler login`).
- Bot criado no BotFather, com username definido e token em mãos.

## Instalação

```bash
npm install
```

## Estrutura

```text
WatchParty/
├── apps/
│   ├── worker/     # Cloudflare Worker: webhook, comandos, API e Durable Objects
│   └── miniapp/    # Mini App React + Vite (Cloudflare Pages)
├── packages/
│   └── shared/     # tipos e contratos (zod) compartilhados
├── scripts/        # set-webhook.mjs
├── docs/           # arquitetura, decisões, setup e testes
├── PLANO.md
└── README.md
```

## Configuração

### 1. Variáveis locais

```bash
cp .dev.vars.example .dev.vars
```

Edite `.dev.vars`:

```dotenv
TELEGRAM_BOT_TOKEN=123456789:AA...seu_token
TELEGRAM_WEBHOOK_SECRET=<string aleatória>
TELEGRAM_BOT_USERNAME=SeuBot
WORKER_URL=https://watchparty-worker.<sua-conta>.workers.dev
```

Para gerar o segredo do webhook: `openssl rand -hex 32`.

> Nunca compartilhe o token nem commite `.dev.vars`.

### 2. Segredos do Worker

```bash
cd apps/worker
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Use exatamente o mesmo `TELEGRAM_WEBHOOK_SECRET` do `.dev.vars`.

### 3. URL do Mini App

Em `apps/worker/wrangler.toml`, ajuste `MINI_APP_URL` para a URL do Pages.
O botão **Abrir sala** usa `MINI_APP_URL/?start_param=<id>`.

### 4. Variáveis do Mini App

Copie `apps/miniapp/.env.example` para `apps/miniapp/.env`:

```dotenv
VITE_WORKER_URL=https://watchparty-worker.<conta>.workers.dev
VITE_BOT_USERNAME=SeuBot
```

Em desenvolvimento local, deixe `VITE_WORKER_URL` vazio: o Vite faz proxy de
`/api` e `/ws` para `http://localhost:8787`. O modo simulado sem Telegram está em
[`apps/miniapp/README.md`](apps/miniapp/README.md) e exige opt-in explícito
tanto no Vite quanto no Worker (`ALLOW_FAKE_INIT_DATA`, apenas em `.dev.vars`).

## Executar localmente

```bash
npm run dev
```

O Worker sobe em `http://localhost:8787` e o Mini App em `http://localhost:5173`, com:

- `GET /health` → `{"status":"ok","service":"watchparty-bot"}`
- `POST /webhook/telegram` → comandos do bot
- `POST /api/session` → valida `initData` e devolve ticket assinado
- `GET /api/rooms/:id` → lê a sala com o ticket (header `Authorization: Bearer`)
- `GET /ws/:id?ticket=...` → upgrade autenticado para o Durable Object da sala
- `POST /api/dev/rooms` → **somente dev**, cria sala sem Telegram (exige `ALLOW_FAKE_INIT_DATA=1`)

Roteiro de teste com duas sessões: [`docs/04-roteiro-etapa3.md`](docs/04-roteiro-etapa3.md).

Para testar com o Telegram real, exponha a porta 8787 por um túnel HTTPS e
configure o webhook com a URL pública (incluindo `/webhook/telegram`).

## Webhook

Após o deploy (ou com o túnel ativo):

```bash
npm run webhook:set
```

O script usa `WORKER_URL` (ambiente ou `.dev.vars`), envia o `secret_token` e
imprime apenas o resultado — nunca o token.

## Deploy

```bash
npm run build   # verificação de tipos, vite build e dry run do Wrangler
npm run deploy  # wrangler deploy (apenas o Worker)
```

O build do Pages é feito a partir de `apps/miniapp` (`vite build` → `dist/`).
Não faça deploy sem autorização.

## Comandos do bot

| Comando | Resposta esperada |
|---|---|
| `/start` | Apresentação do bot e orientação para `/play` |
| `/help` | Lista de comandos, formatos aceitos e explicação do convite |
| `/play <link>` | Confirmação da sala, ID, tipo de vídeo e botões **Abrir sala** / **Convidar amigos** |
| `/start <ID>` | Botão para entrar na sala recebida por convite |

Exemplo:

```text
/play https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
```

Resposta (resumida):

```text
✅ Sala criada!
🎬 Vídeo: MP4 / WebM (link direto)
🆔 Sala: A1B2C3D4
👑 Host: você
🔗 Fonte: abrir link
[ Abrir sala ] [ Convidar amigos ]
```

Links aceitos: MP4/M4V/WebM/OGV diretos, HLS `.m3u8` e YouTube
(`watch`, `youtu.be`, `embed`, `live`, `shorts`). URLs sem extensão passam por
`HEAD` e só são aceitas se o `content-type` permitir. Não há bypass de DRM,
autenticação ou bloqueios de provedores.

## Quality checks

```bash
npm run check   # TypeScript em todos os workspaces
npm test        # Vitest
npm run build   # dry run do Worker + check
```

## Documentação

- [`docs/01-arquitetura.md`](docs/01-arquitetura.md)
- [`docs/02-decisoes-tecnicas.md`](docs/02-decisoes-tecnicas.md)
- [`docs/03-setup-e-testes.md`](docs/03-setup-e-testes.md)

## Pronto para a Etapa 4

Os recursos principais do MVP estão implementados. A Etapa 4 (conforme o `PLANO.md`)
cobre convites/permissões adicionais e melhorias de UI/UX — não iniciada aqui.
