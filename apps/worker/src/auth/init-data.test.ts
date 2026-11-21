import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { buildSignedInitData } from '../test/init-data';
import { buildFakeInitData } from './fake';
import { InitDataError, validateInitData } from './init-data';

const BOT_TOKEN = '123456:token-de-teste';
const buildInitData = (overrides: Parameters<typeof buildSignedInitData>[1] = {}) =>
  buildSignedInitData(BOT_TOKEN, overrides);

describe('validação do initData', () => {
  it('aceita initData assinado e devolve usuário, auth_date e start_param', async () => {
    const authDate = Math.floor(Date.now() / 1000);
    const result = await validateInitData(await buildInitData({ authDate, startParam: 'ABC12345' }), BOT_TOKEN);

    expect(result.user).toMatchObject({ id: 777, first_name: 'Ana', username: 'ana' });
    expect(result.authDate).toBe(authDate);
    expect(result.startParam).toBe('ABC12345');
    expect(result.queryId).toBe('AAHquery');
  });

  it('rejeita assinatura inválida e campos alterados', async () => {
    const valid = await buildInitData();
    const tampered = valid.replace('Ana', 'Bia');
    await expect(validateInitData(tampered, BOT_TOKEN)).rejects.toMatchObject({
      code: 'INVALID_INIT_DATA',
    });
    await expect(validateInitData(`${valid}x`, BOT_TOKEN)).rejects.toMatchObject({
      code: 'INVALID_INIT_DATA',
    });
  });

  it('rejeita token diferente', async () => {
    await expect(validateInitData(await buildInitData(), 'outro:token')).rejects.toBeInstanceOf(InitDataError);
  });

  it('rejeita initData expirado e com data no futuro', async () => {
    const now = 1_800_000_000;
    await expect(
      validateInitData(await buildInitData({ authDate: now - 601 }), BOT_TOKEN, now),
    ).rejects.toMatchObject({ code: 'INIT_DATA_EXPIRED' });
    await expect(
      validateInitData(await buildInitData({ authDate: now + 31 }), BOT_TOKEN, now),
    ).rejects.toMatchObject({ code: 'INIT_DATA_EXPIRED' });
  });

  it('rejeita initData sem usuário ou com usuário inválido', async () => {
    await expect(validateInitData(await buildInitData({ includeUser: false }), BOT_TOKEN)).rejects.toMatchObject({
      code: 'INVALID_INIT_DATA',
    });
    await expect(validateInitData(await buildInitData({ user: { first_name: 'Ana' } }), BOT_TOKEN)).rejects.toMatchObject({
      code: 'INVALID_INIT_DATA',
    });
  });

  it('aceita simulação apenas quando a flag de desenvolvimento está ligada', async () => {
    const env = { ALLOW_FAKE_INIT_DATA: '1' } as Env;
    const { parseFakeInitData } = await import('./fake');
    const fake = buildFakeInitData({ userId: 42, firstName: 'Dev', startParam: 'ABC12345' });

    expect(parseFakeInitData(fake, env)).toMatchObject({
      user: { id: 42, first_name: 'Dev' },
      startParam: 'ABC12345',
    });
    expect(parseFakeInitData(fake, {} as Env)).toBeNull();
    expect(parseFakeInitData(await buildInitData(), env)).toBeNull();
  });
});
