import { describe, expect, it } from 'vitest';
import { generateRoomId, isValidRoomId } from './ids';

describe('generateRoomId', () => {
  it('gera IDs curtos no formato esperado', () => {
    const id = generateRoomId();
    expect(id).toHaveLength(8);
    expect(isValidRoomId(id)).toBe(true);
    expect(id).not.toMatch(/[ILOU]/);
  });

  it('gera IDs únicos em sequência', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateRoomId()));
    expect(ids.size).toBe(1000);
  });

  it('usa a entropia fornecida de forma determinística', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(generateRoomId(bytes)).toBe(generateRoomId(bytes));
    expect(() => generateRoomId(new Uint8Array(2))).toThrow();
  });

  it('valida o formato de IDs recebidos', () => {
    expect(isValidRoomId('ABC12345')).toBe(true);
    expect(isValidRoomId('abc12345')).toBe(false);
    expect(isValidRoomId('ABC1234')).toBe(false);
    expect(isValidRoomId('ABC123456')).toBe(false);
    expect(isValidRoomId('ABCI2345')).toBe(false);
  });
});
