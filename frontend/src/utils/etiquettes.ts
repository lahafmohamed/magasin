import { barcodeSvg, encodeBarcode } from '@/utils/barcode';
import { formatCurrency } from '@/utils/format';

/**
 * Planches d'étiquettes code-barres (lot 3), imprimées par le navigateur.
 *
 * Deux familles :
 * - **planche A4** d'étiquettes autocollantes (imprimante de bureau) : la
 *   grille couvre toute la feuille, sans marge, comme les planches du
 *   commerce ; on peut commencer plus loin sur une planche entamée ;
 * - **rouleau** pour imprimante d'étiquettes thermique : une étiquette par
 *   page, la page faisant la taille de l'étiquette.
 */

export type FormatEtiquette = 'a4-3x8' | 'a4-4x10' | 'rouleau-50x30' | 'rouleau-40x25';

export interface FormatDef {
  value: FormatEtiquette;
  label: string;
  description: string;
  support: 'a4' | 'rouleau';
  /** Dimensions d'une étiquette, en millimètres. */
  largeur: number;
  hauteur: number;
  colonnes: number;
  lignes: number;
  /** Tailles de texte (pt) et hauteur des barres (mm). */
  nomPt: number;
  prixPt: number;
  codePt: number;
  barresMm: number;
}

export const FORMATS_ETIQUETTE: readonly FormatDef[] = [
  {
    value: 'a4-3x8',
    label: 'Planche A4 · 24 étiquettes',
    description: '3 × 8, étiquettes de 70 × 37 mm',
    support: 'a4',
    largeur: 70,
    hauteur: 37.125,
    colonnes: 3,
    lignes: 8,
    nomPt: 9,
    prixPt: 12,
    codePt: 7,
    barresMm: 13,
  },
  {
    value: 'a4-4x10',
    label: 'Planche A4 · 40 étiquettes',
    description: '4 × 10, étiquettes de 52,5 × 29,7 mm',
    support: 'a4',
    largeur: 52.5,
    hauteur: 29.7,
    colonnes: 4,
    lignes: 10,
    nomPt: 7.5,
    prixPt: 10,
    codePt: 6,
    barresMm: 10,
  },
  {
    value: 'rouleau-50x30',
    label: 'Rouleau 50 × 30 mm',
    description: 'Imprimante d’étiquettes thermique',
    support: 'rouleau',
    largeur: 50,
    hauteur: 30,
    colonnes: 1,
    lignes: 1,
    nomPt: 8,
    prixPt: 11,
    codePt: 6.5,
    barresMm: 11,
  },
  {
    value: 'rouleau-40x25',
    label: 'Rouleau 40 × 25 mm',
    description: 'Imprimante d’étiquettes thermique, petit format',
    support: 'rouleau',
    largeur: 40,
    hauteur: 25,
    colonnes: 1,
    lignes: 1,
    nomPt: 7,
    prixPt: 9,
    codePt: 6,
    barresMm: 9,
  },
];

export function formatEtiquette(value: string | null | undefined): FormatDef {
  return FORMATS_ETIQUETTE.find((f) => f.value === value) ?? FORMATS_ETIQUETTE[0];
}

export interface EtiquetteProduit {
  nom: string;
  code: string;
  /** `null` : prix non affiché (ou inconnu). */
  prix: number | null;
}

export interface PlancheOptions {
  format: FormatEtiquette;
  /** Aperçu à l'écran : la première étiquette seule, sans mise en page. */
  apercu?: boolean;
  /** Étiquettes déjà prises sur une planche A4 entamée : on commence à `debut` (1 = première case). */
  debut?: number;
}

/** Marge intérieure d'une étiquette, en mm (chaque côté). */
const PADDING_MM = 1.5;
/** Module plus fin que ça : une douchette ordinaire ne lit plus le code. */
export const MODULE_MIN_MM = 0.19;

/** Largeur d'un module de barre pour ce code sur ce format (mm). */
export function largeurModule(code: string, format: FormatEtiquette): number {
  const f = formatEtiquette(format);
  const { format: type, modules } = encodeBarcode(code);
  const silence = type === 'EAN13' ? 22 : 20;
  return (f.largeur - PADDING_MM * 2) / (modules.length + silence);
}

/** Le code tient-il lisiblement sur ce format ? */
export function codeLisible(code: string, format: FormatEtiquette): boolean {
  return largeurModule(code, format) >= MODULE_MIN_MM;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function etiquetteHtml(e: EtiquetteProduit): string {
  const prix = e.prix !== null ? `<p class="prix">${escapeHtml(formatCurrency(e.prix))}</p>` : '';
  return (
    `<div class="etiquette">` +
    `<p class="nom">${escapeHtml(e.nom)}</p>` +
    `<div class="barres">${barcodeSvg(e.code)}</div>` +
    `<p class="code">${escapeHtml(e.code)}</p>` +
    prix +
    `</div>`
  );
}

/** Document HTML complet de la planche, prêt à imprimer. */
export function buildEtiquettesHtml(etiquettes: EtiquetteProduit[], options: PlancheOptions): string {
  const f = formatEtiquette(options.format);
  const parPage = f.colonnes * f.lignes;
  const debut = f.support === 'a4' ? Math.min(Math.max(1, Math.floor(options.debut ?? 1)), parPage) : 1;
  const cases = [
    ...Array.from({ length: debut - 1 }, () => '<div class="etiquette vide"></div>'),
    ...etiquettes.map(etiquetteHtml),
  ];

  let corps: string;
  if (options.apercu) {
    corps = etiquettes.length > 0 ? etiquetteHtml(etiquettes[0]) : '';
  } else if (f.support === 'a4') {
    const pages: string[] = [];
    for (let i = 0; i < cases.length; i += parPage) pages.push(`<section class="page">${cases.slice(i, i + parPage).join('')}</section>`);
    corps = pages.join('');
  } else {
    corps = etiquettes.map((e) => `<section class="page">${etiquetteHtml(e)}</section>`).join('');
  }

  const page = options.apercu
    ? 'html, body { overflow: hidden; }'
    : f.support === 'a4'
      ? `@page { size: A4; margin: 0; }
  .page { width: 210mm; height: 297mm; display: grid; grid-template-columns: repeat(${f.colonnes}, ${f.largeur}mm); grid-template-rows: repeat(${f.lignes}, ${f.hauteur}mm); break-after: page; overflow: hidden; }`
      : `@page { size: ${f.largeur}mm ${f.hauteur}mm; margin: 0; }
  .page { width: ${f.largeur}mm; height: ${f.hauteur}mm; break-after: page; overflow: hidden; }`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Étiquettes</title>
<style>
  ${page}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page:last-child { break-after: auto; }
  p { margin: 0; }
  .etiquette { width: ${f.largeur}mm; height: ${f.hauteur}mm; padding: ${PADDING_MM}mm; display: flex; flex-direction: column; justify-content: center; align-items: stretch; text-align: center; overflow: hidden; }
  .nom { font-size: ${f.nomPt}pt; line-height: 1.15; max-height: ${(f.nomPt * 1.15 * 2 * 0.3528).toFixed(2)}mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  .barres { height: ${f.barresMm}mm; margin-top: 0.8mm; }
  .barres svg { display: block; width: 100%; height: 100%; }
  .code { font-family: Consolas, "Courier New", monospace; font-size: ${f.codePt}pt; letter-spacing: 0.04em; line-height: 1.2; }
  .prix { font-size: ${f.prixPt}pt; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>${corps}</body>
</html>`;
}

/** Étiquettes à imprimer : chaque produit répété `copies` fois, dans l'ordre de la liste. */
export function developperCopies<T extends { copies: number }>(lignes: T[]): T[] {
  return lignes.flatMap((l) => Array.from({ length: Math.max(0, Math.floor(l.copies)) }, () => l));
}
