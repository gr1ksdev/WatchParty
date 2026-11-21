/**
 * Roteiro automatizado com duas sessões independentes (host + convidado).
 * Requer: wrangler dev com ALLOW_FAKE_INIT_DATA=1 em apps/worker/.dev.vars.
 * Uso: node scripts/e2e-ws.mjs   (ou WP_BASE_URL=https://... para outro alvo)
 * Sem dependências externas: usa fetch/WebSocket nativos do Node 20+.
 */
const BASE = (process.env.WP_BASE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fakeInit = (userId, firstName, startParam) =>
  'fake:' + Buffer.from(JSON.stringify({ userId, firstName, startParam })).toString('base64url');

async function post(path, body) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getRoom(roomId, ticket) {
  const response = await fetch(`${BASE}/api/rooms/${roomId}`, {
    headers: { authorization: `Bearer ${ticket}` },
  });
  return { status: response.status, body: await response.json() };
}

function client(label) {
  return {
    label,
    ws: null,
    messages: [],
    on(type) {
      return this.messages.find((message) => message.t === type);
    },
    send(message) {
      this.ws?.send(JSON.stringify(message));
    },
  };
}

async function connect(c, roomId, ticket) {
  c.ws = new WebSocket(`${WS_BASE}/ws/${roomId}?ticket=${encodeURIComponent(ticket)}`);
  c.ws.onmessage = (event) => {
    try {
      c.messages.push(JSON.parse(String(event.data)));
    } catch {
      // Ignora payloads inesperados.
    }
  };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${c.label}: timeout no open`)), 8000);
    c.ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    c.ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`${c.label}: falha no upgrade`));
    };
  });
}

async function waitFor(description, predicate, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(`Timeout: ${description}`);
}

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const source = { kind: 'mp4', url: 'https://example.com/video.mp4' };
const created = await post('/api/dev/rooms', { initData: fakeInit(777, 'Ana'), source });
check('sala criada com host 777', created.status === 200, JSON.stringify(created.body));
if (created.status !== 200) process.exit(1);
const roomId = created.body.roomId;

const hostSession = await post('/api/session', { initData: fakeInit(777, 'Ana', roomId) });
const guestSession = await post('/api/session', { initData: fakeInit(999, 'Bia', roomId) });
check('sessões emitidas para os dois usuários', hostSession.status === 200 && guestSession.status === 200);

const host = client('host');
const guest = client('guest');
await connect(host, roomId, hostSession.body.ticket);
await connect(guest, roomId, guestSession.body.ticket);
await waitFor('state inicial no host', () => host.on('state'));
await waitFor('state inicial no convidado', () => guest.on('state'));
check('ambos receberam o estado inicial', true, `versão=${host.on('state').state.version}`);
check('host identificado pelo servidor', host.on('state').state.hostId === '777');
check('dois participantes conectados', guest.on('state').state.participants.length === 2);

host.send({ t: 'control', action: 'play', position: 10 });
await waitFor('convidado recebeu play', () => guest.on('control'));
const play = guest.on('control');
check(
  'play do host distribuído',
  play.action === 'play' && play.position === 10 && play.by === '777',
);
check('originador não recebe próprio controle', !host.on('control'));

guest.send({ t: 'control', action: 'pause', position: 99 });
await waitFor('FORBIDDEN ao convidado', () => guest.on('error'));
check('controle de convidado rejeitado', guest.on('error').code === 'FORBIDDEN');
const persisted = await getRoom(roomId, hostSession.body.ticket);
check(
  'estado inalterado após FORBIDDEN',
  persisted.body.room.playing === true && persisted.body.room.position === 10,
);

guest.send({ t: 'chat', text: 'Olá <script>alert(1)</script> pessoal' });
await waitFor('chat no host', () => host.on('chat'));
await waitFor('chat no convidado', () => guest.on('chat'));
check('chat distribuído e sanitizado', host.on('chat').message.text === 'Olá alert(1) pessoal');
check('remetente identificado', host.on('chat').message.firstName === 'Bia');

host.send({ t: 'ping', ts: 4242 });
await waitFor('pong', () => host.on('pong'));
check('heartbeat respondido', host.on('pong').ts === 4242);

guest.ws.close();
await waitFor('leave no host', () =>
  host.messages.some((message) => message.t === 'participant' && message.action === 'leave'),
);
check('saída notificada aos demais', true);

const guestSession2 = await post('/api/session', { initData: fakeInit(999, 'Bia', roomId) });
await connect(guest, roomId, guestSession2.body.ticket);
guest.messages = [];
await waitFor('state após reconexão', () => guest.on('state'));
const recovered = guest.on('state').state;
check(
  'reconexão recupera estado atual',
  recovered.playing === true && recovered.position >= 10 && recovered.participants.length === 2,
  `position=${recovered.position.toFixed(1)}`,
);
check('histórico de chat preservado', recovered.chat.length === 1);

const badSocket = new WebSocket(`${WS_BASE}/ws/${roomId}?ticket=invalido`);
const rejected = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve('timeout'), 4000);
  badSocket.onopen = () => {
    clearTimeout(timer);
    resolve('open');
  };
  badSocket.onerror = () => {
    clearTimeout(timer);
    resolve('error');
  };
  badSocket.onclose = () => {
    clearTimeout(timer);
    resolve('close');
  };
});
check('ticket inválido rejeitado', rejected === 'error' || rejected === 'close', rejected);

host.ws.close();
guest.ws.close();
const failed = results.filter((result) => !result.ok);
console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length === 0 ? 0 : 1);
