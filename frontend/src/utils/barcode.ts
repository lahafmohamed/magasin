/**
 * Codes-barres des étiquettes (lot 3) — sans dépendance.
 *
 * - **EAN-13** pour un code de 13 chiffres dont la clé est juste : les codes
 *   des fabricants et les codes internes 20… (migration 110).
 * - **Code 128** pour tout le reste (référence saisie à la main, code
 *   fournisseur alphanumérique) : jeu C, plus dense, pour un nombre pair de
 *   chiffres, jeu B sinon.
 *
 * Le résultat est une suite de modules (`'1'` = barre, `'0'` = espace) rendue
 * en SVG : net à n'importe quelle taille, à l'écran comme à l'impression.
 */

export type BarcodeFormat = 'EAN13' | 'CODE128';

export interface EncodedBarcode {
  format: BarcodeFormat;
  /** Texte imprimé sous les barres. */
  text: string;
  /** Modules, sans les marges de silence. */
  modules: string;
}

// ---------- EAN-13 ----------
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
/** Parité des 6 chiffres de gauche, fixée par le premier chiffre. */
const EAN_PARITE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Clé de contrôle EAN-13 des 12 premiers chiffres (même calcul que le serveur). */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function encodeEan13(code: string): string {
  if (!isValidEan13(code)) throw new Error(`EAN-13 invalide : ${code}`);
  const d = code.split('').map(Number);
  const parite = EAN_PARITE[d[0]];
  let out = '101';
  for (let i = 1; i <= 6; i++) out += (parite[i - 1] === 'L' ? EAN_L : EAN_G)[d[i]];
  out += '01010';
  for (let i = 7; i <= 12; i++) out += EAN_R[d[i]];
  return out + '101';
}

// ---------- Code 128 ----------
/** Largeurs barre/espace des 107 symboles (valeurs 0 à 106, 106 = stop). */
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const START_C = 105;
const STOP = 106;

function widthsToModules(widths: string): string {
  let out = '';
  for (let i = 0; i < widths.length; i++) out += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]));
  return out;
}

/** Valeurs des symboles (départ, données, clé, arrêt). Exportée pour les tests. */
export function code128Values(text: string): number[] {
  if (!text) throw new Error('Code vide');
  const values: number[] = [];
  if (/^\d+$/.test(text) && text.length % 2 === 0) {
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    values.push(START_B);
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) throw new Error(`Caractère impossible à encoder en Code 128 : « ${ch} »`);
      values.push(c - 32);
    }
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, STOP);
  return values;
}

export function encodeCode128(text: string): string {
  return code128Values(text)
    .map((v) => widthsToModules(C128[v]))
    .join('');
}

/** Peut-on imprimer ce code ? (ASCII imprimable, 1 à 50 caractères) */
export function isPrintableBarcode(code: string | null | undefined): code is string {
  return !!code && code.length <= 50 && /^[\x20-\x7e]+$/.test(code);
}

export function encodeBarcode(code: string): EncodedBarcode {
  const text = code.trim();
  if (isValidEan13(text)) return { format: 'EAN13', text, modules: encodeEan13(text) };
  return { format: 'CODE128', text, modules: encodeCode128(text) };
}

/**
 * SVG du code-barres : barres seules (le texte est posé par l'étiquette, à sa
 * taille). Largeur libre (`preserveAspectRatio="none"`) : l'étirement est le
 * même pour chaque module, le code reste lisible. Marges de silence incluses
 * (11 modules en EAN-13, 10 en Code 128).
 */
export function barcodeSvg(code: string, options: { className?: string } = {}): string {
  const { format, modules } = encodeBarcode(code);
  const quiet = format === 'EAN13' ? 11 : 10;
  const total = modules.length + quiet * 2;
  let rects = '';
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      let w = 1;
      while (modules[i + w] === '1') w++;
      rects += `<rect x="${quiet + i}" y="0" width="${w}" height="1"/>`;
      i += w;
    } else {
      i++;
    }
  }
  const cls = options.className ? ` class="${options.className}"` : '';
  return `<svg${cls} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Code-barres ${code.replace(/[<>&"']/g, '')}"><rect width="${total}" height="1" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
