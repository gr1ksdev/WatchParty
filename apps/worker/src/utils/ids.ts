import { ROOM_ID_PATTERN } from '@watchparty/shared';

/** Base32 Crockford: evita ambiguidade visual entre I/1, L/1, O/0 e U/V. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ID_BYTES = 5; // 40 bits = exatamente 8 caracteres Base32

/** Gera um ID curto e único (40 bits de entropia) compatível com `startapp`. */
export function generateRoomId(random?: Uint8Array): string {
  const bytes = random ?? crypto.getRandomValues(new Uint8Array(ID_BYTES));
  if (bytes.length < ID_BYTES) {
    throw new Error('Entropia insuficiente para gerar o identificador da sala');
  }

  let output = '';
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < ID_BYTES; index += 1) {
    buffer = (buffer << 8) | (bytes[index] ?? 0);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += ALPHABET[(buffer >> bits) & 31];
    }
  }

  return output;
}

export function isValidRoomId(value: string): boolean {
  return ROOM_ID_PATTERN.test(value);
}
