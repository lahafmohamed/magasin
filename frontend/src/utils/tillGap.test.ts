import { describe, expect, it } from 'vitest';
import { TILL_GAP_TEXT_CLASS, tillGapTone } from './tillGap';

describe('écart de caisse', () => {
  it('nul (au franc près) → conforme', () => {
    expect(tillGapTone(0)).toBe('ok');
    expect(tillGapTone(0.4)).toBe('ok');
    expect(tillGapTone(-0.4)).toBe('ok');
  });

  it('moins de 5 000 FCFA → à surveiller, dans les deux sens', () => {
    expect(tillGapTone(-4999)).toBe('warning');
    expect(tillGapTone(1500)).toBe('warning');
  });

  it('5 000 FCFA ou plus → à expliquer', () => {
    expect(tillGapTone(-5000)).toBe('danger');
    expect(tillGapTone(12000)).toBe('danger');
  });

  it('texte : un step explicite, jamais une couleur pour un écart nul', () => {
    expect(TILL_GAP_TEXT_CLASS.ok).toBe('text-muted-foreground');
    expect(TILL_GAP_TEXT_CLASS.warning).toBe('text-warning-700');
    expect(TILL_GAP_TEXT_CLASS.danger).toBe('text-danger-700');
  });
});
