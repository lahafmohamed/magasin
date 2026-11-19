import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatSignedCurrency, NBSP, toNumber } from '@/utils/format';

/**
 * Couleur d'un montant. La couleur ne remplace jamais les mots (« Reste dû »,
 * « Il vous doit ») : elle souligne seulement.
 * - `neutral` (défaut) : couleur du texte parent, même à zéro.
 * - `muted` : texte secondaire.
 * - `auto` : zéro estompé, négatif en rouge, positif neutre (soldes, écarts).
 * - `delta` : variation signée « +/− » — positif vert, négatif rouge, zéro estompé
 *   (marges, écarts de caisse, évolutions). Réservé à ce cas.
 * - `danger` / `warning` / `success` : appliqué seulement si le montant ≠ 0 ;
 *   un zéro est toujours neutre (pas de « 0 FCFA » rouge).
 */
export type MoneyTone = 'neutral' | 'muted' | 'auto' | 'delta' | 'danger' | 'warning' | 'success';

export interface MoneyProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Montant (nombre ou chaîne NUMERIC de l'API). `null`/invalide → « — », jamais 0. */
  value: number | string | null | undefined;
  tone?: MoneyTone;
  /** Semi-gras (totaux, montant principal d'une ligne). */
  emphasis?: boolean;
  /**
   * Affichage de l'unité : `inline` (défaut) « 1 234 FCFA » ; `subtle` : unité
   * plus petite et estompée (tuiles KPI — économise la largeur sur téléphone) ;
   * `none` : chiffres seuls (colonne dont l'en-tête porte déjà « FCFA »).
   */
  unit?: 'inline' | 'subtle' | 'none';
  /** Force le signe « + » sur un positif (implicite avec `tone="delta"`). */
  signed?: boolean;
  /** Libellé de devise des paramètres société ; « XOF » est toujours affiché « FCFA ». */
  devise?: string | null;
  /** Rendu quand la valeur est absente (défaut « — », annoncé « Montant indisponible »). */
  fallback?: React.ReactNode;
}

const TONE_CLASS: Record<'danger' | 'warning' | 'success', string> = {
  danger: 'text-danger-700',
  warning: 'text-warning-700',
  success: 'text-success-700',
};

function toneClass(tone: MoneyTone, rounded: number): string | undefined {
  if (tone === 'neutral') return undefined;
  if (tone === 'muted') return 'text-muted-foreground';
  if (rounded === 0) return tone === 'auto' || tone === 'delta' ? 'text-muted-foreground' : undefined;
  if (tone === 'auto') return rounded < 0 ? 'text-danger-700' : undefined;
  if (tone === 'delta') return rounded < 0 ? 'text-danger-700' : 'text-success-700';
  return TONE_CLASS[tone];
}

/**
 * Montant en FCFA : chiffres tabulaires, jamais coupé (U+00A0 entre les groupes
 * et avant l'unité), « − » typographique pour un négatif.
 *
 *   <Money value={facture.total} />
 *   <Money value={reste} tone="danger" emphasis />      // rouge seulement si ≠ 0
 *   <Money value={marge} tone="delta" />                 // « +12 500 FCFA » vert
 *   <Money value={stats?.ca ?? null} unit="subtle" />    // « — » si indisponible
 */
export const Money = React.forwardRef<HTMLSpanElement, MoneyProps>(
  (
    { value, tone = 'neutral', emphasis = false, unit = 'inline', signed = false, devise, fallback, className, ...props },
    ref
  ) => {
    const n = toNumber(value);
    if (n === null) {
      return (
        <span ref={ref} className={cn('whitespace-nowrap text-muted-foreground', className)} {...props}>
          {fallback ?? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">Montant indisponible</span>
            </>
          )}
        </span>
      );
    }

    const rounded = Math.round(n);
    const text = signed || tone === 'delta' ? formatSignedCurrency(n, devise) : formatCurrency(n, devise);
    const cut = text.lastIndexOf(NBSP);
    const digits = cut > 0 ? text.slice(0, cut) : text;
    const label = cut > 0 ? text.slice(cut + 1) : '';

    return (
      <span
        ref={ref}
        className={cn('whitespace-nowrap tabular-nums', emphasis && 'font-semibold', toneClass(tone, rounded), className)}
        {...props}
      >
        {unit === 'inline' && text}
        {unit === 'none' && digits}
        {unit === 'subtle' && (
          <>
            {digits}
            {/* L'insécable reste DANS l'unité : pas de coupure possible, et le
                lecteur d'écran lit « 500 FCFA » et non « 500FCFA ». */}
            <span className="text-[0.7em] font-medium text-muted-foreground">{NBSP + label}</span>
          </>
        )}
      </span>
    );
  }
);
Money.displayName = 'Money';
