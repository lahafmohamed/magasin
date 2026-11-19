import { describe, it, expect } from 'vitest';
import { buildEtiquettesHtml, codeLisible, developperCopies, largeurModule } from './etiquettes';

const robe = { nom: 'Robe <wax> M', code: '2000000000015', prix: 15000 };
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('planche d’étiquettes', () => {
  it('remplit une planche A4 3 × 8 en sautant les cases déjà prises', () => {
    const html = buildEtiquettesHtml(Array.from({ length: 20 }, () => robe), { format: 'a4-3x8', debut: 10 });
    expect(html).toContain('@page { size: A4; margin: 0; }');
    expect(html).toContain('grid-template-columns: repeat(3, 70mm)');
    // 9 cases vides + 20 étiquettes = 29 → 2 planches.
    expect(count(html, '<section class="page">')).toBe(2);
    expect(count(html, 'class="etiquette vide"')).toBe(9);
    expect(count(html, '<p class="nom">')).toBe(20);
  });

  it('borne la case de départ à la planche', () => {
    const html = buildEtiquettesHtml([robe], { format: 'a4-4x10', debut: 99 });
    expect(count(html, 'class="etiquette vide"')).toBe(39);
  });

  it('imprime une étiquette par page sur un rouleau, sans case de départ', () => {
    const html = buildEtiquettesHtml([robe, robe, robe], { format: 'rouleau-50x30', debut: 5 });
    expect(html).toContain('@page { size: 50mm 30mm; margin: 0; }');
    expect(count(html, '<section class="page">')).toBe(3);
    expect(html).not.toContain('etiquette vide');
  });

  it('échappe le nom, affiche le prix seulement s’il est demandé', () => {
    const avec = buildEtiquettesHtml([robe], { format: 'rouleau-50x30' });
    expect(avec).toContain('Robe &lt;wax&gt; M');
    expect(avec.split(String.fromCharCode(0xa0)).join(' ').split(String.fromCharCode(0x202f)).join(' ')).toContain('15 000 FCFA');
    const sans = buildEtiquettesHtml([{ ...robe, prix: null }], { format: 'rouleau-50x30' });
    expect(sans).not.toContain('class="prix"');
  });

  it('aperçu : une seule étiquette, sans mise en page', () => {
    const html = buildEtiquettesHtml([robe, robe], { format: 'a4-3x8', apercu: true });
    expect(html).not.toContain('@page');
    expect(count(html, '<p class="nom">')).toBe(1);
  });
});

describe('lisibilité', () => {
  it('un EAN-13 tient sur tous les formats', () => {
    expect(codeLisible('2000000000015', 'rouleau-40x25')).toBe(true);
    expect(largeurModule('2000000000015', 'a4-3x8')).toBeGreaterThan(0.5);
  });

  it('un long code alphanumérique ne tient pas sur une petite étiquette', () => {
    const long = 'REF-FOURNISSEUR-2026';
    expect(codeLisible(long, 'rouleau-40x25')).toBe(false);
    expect(codeLisible(long, 'a4-3x8')).toBe(true);
  });
});

describe('developperCopies', () => {
  it('répète chaque ligne selon ses copies, dans l’ordre', () => {
    const out = developperCopies([
      { id: 1, copies: 2 },
      { id: 2, copies: 0 },
      { id: 3, copies: 1 },
    ]);
    expect(out.map((l) => l.id)).toEqual([1, 1, 3]);
  });
});
