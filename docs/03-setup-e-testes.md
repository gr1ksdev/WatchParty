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

## Testando os comandos no Telegram

- `/start` — deve apresentar o bot e orientar ao uso de `/play`.
- `/help` — deve listar os três comandos e os formatos aceitos.
- `/play https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`
  — deve responder com "Sala criada", o ID da sala e os botões **Abrir sala** e
  **Convidar amigos**.
- `/play https://example.com/pagina` — deve responder com erro quando o
  `content-type` não for de vídeo.
- `/start <ID da sala>` — deve responder com o botão de entrada na sala.

O botão **Abrir sala** leva a uma URL provisória até a Etapa 2.
