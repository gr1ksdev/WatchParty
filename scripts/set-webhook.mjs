#!/usr/bin/env node
/**
 * Configura o webhook do Telegram a partir de variáveis de ambiente locais.
 * Nunca imprime o token do bot.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadDotVars() {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    console.error('Não foi possível ler .dev.vars:', error.message);
    process.exit(1);
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotVars();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const workerUrl = process.env.WORKER_URL;

if (!token || !secret || !workerUrl) {
  console.error(
    'Defina TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e WORKER_URL no ambiente ou em .dev.vars.',
  );
  process.exit(1);
}

const url = `${workerUrl.replace(/\/+$/, '')}/webhook/telegram`;
const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function call(method, payload) {
  const response = await fetch(api(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`${method} falhou: ${data.description ?? `HTTP ${response.status}`}`);
  }
  return data.result;
}

try {
  const result = await call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
  });
  console.log('Webhook configurado com sucesso.');
  console.log(`URL: ${url}`);
  console.log(`Resultado: ${result}`);

  const info = await call('getWebhookInfo', {});
  console.log(`Webhook atual: ${info.url}`);
  console.log(`Atualizações pendentes: ${info.pending_update_count ?? 0}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
