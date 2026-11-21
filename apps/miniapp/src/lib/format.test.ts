import { describe, expect, it } from 'vitest';
import { formatTime, initials, SOURCE_LABELS } from './format';

describe('formatação da interface', () => {
  it('formata segundos como relógio', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-10)).toBe('0:00');
  });

  it('gera iniciais e rótulos de fonte', () => {
    expect(initials('Ana Souza')).toBe('A');
    expect(initials('  ')).toBe('?');
    expect(SOURCE_LABELS.hls).toContain('HLS');
  });
});
