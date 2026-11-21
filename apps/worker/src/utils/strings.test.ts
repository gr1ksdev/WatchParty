import { describe, expect, it } from 'vitest';
import { constantTimeEqual, escapeHtml } from './strings';

describe('escapeHtml', () => {
  it('escapa caracteres especiais usados no parse_mode HTML', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});

describe('constantTimeEqual', () => {
  it('compara segredos corretamente', () => {
    expect(constantTimeEqual('segredo', 'segredo')).toBe(true);
    expect(constantTimeEqual('segredo', 'outracoisa')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
