/** Constrói initData assinado para testes unitários (não é usado em produção). */
import { hmacSha256 } from '../auth/init-data';

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildSignedInitData(
  botToken: string,
  overrides: { user?: unknown; authDate?: number; startParam?: string; includeUser?: boolean } = {},
): Promise<string> {
  const params = new URLSearchParams();
  params.set('query_id', 'AAHquery');
  if (overrides.includeUser !== false) {
    params.set(
      'user',
      JSON.stringify(
        overrides.user ?? {
          id: 777,
          first_name: 'Ana',
          username: 'ana',
          photo_url: 'https://example.com/ana.png',
        },
      ),
    );
  }
  params.set('auth_date', String(overrides.authDate ?? Math.floor(Date.now() / 1000)));
  if (overrides.startParam) params.set('start_param', overrides.startParam);

  // O Telegram assina os valores decodificados (ex.: `user` como JSON puro).
  const pairs: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (key !== 'hash') pairs.push([key, value]);
  });
  pairs.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  const checkString = pairs.map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const hash = toHex(await hmacSha256(secretKey, checkString));
  return `${params.toString()}&hash=${hash}`;
}
