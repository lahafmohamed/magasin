import * as React from 'react';
import { cn } from '@/lib/utils';
import { Money, type MoneyTone } from '@/components/ui/money';

export interface DocumentTotalsLine {
  label: React.ReactNode;
  /** Montant ; `null` → « — » (jamais 0 par défaut). */
  value: number | string | null | undefined;
  tone?: MoneyTone;
  /** Ligne mise en avant (semi-gras) — ex. « Reste dû ». */
  emphasis?: boolean;
  /** Précision sous le libellé (« 2 paiements »). */
  hint?: React.ReactNode;
}

export interface DocumentTotalsProps {
  /** Lignes avant le total (sous-total, remise…). */
  rows?: DocumentTotalsLine[];
  /** Total du document : séparé par un filet, 18 px semi-gras. */
  total?: DocumentTotalsLine;
  /** Lignes après le total (déjà payé, reste dû…). */
  after?: DocumentTotalsLine[];
  className?: string;
  /** Nom de la liste pour les lecteurs d'écran (défaut « Totaux du document »). */
  'aria-label'?: string;
}

function Line({
  line,
  size,
  ruled = false,
  className,
}: {
  line: DocumentTotalsLine;
  size: 'row' | 'total';
  /** Filet au-dessus de la ligne : le total, quand des lignes le précèdent. */
  ruled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4',
        className,
        size === 'total' ? 'text-lg font-semibold' : 'text-sm',
        ruled && 'border-t pt-2'
      )}
    >
      <dt className={cn(size === 'row' && !line.emphasis && 'text-muted-foreground', line.emphasis && 'font-semibold')}>
        {line.label}
        {line.hint && <span className="block text-xs font-normal text-muted-foreground">{line.hint}</span>}
      </dt>
      <dd>
        <Money value={line.value} tone={line.tone} emphasis={line.emphasis || size === 'total'} />
      </dd>
    </div>
  );
}

/**
 * Pied de totaux d'un document (facture, devis, BL, avoir), sous la table des
 * lignes, aligné à droite. Remplace le pavé `bg-primary` (texte à 3,77:1 en
 * thème sombre, étiré à la hauteur de la carte voisine) et le total posé au-dessus
 * des lignes sur Devis et BL.
 *
 *   <DocumentTotals
 *     rows={[{ label: 'Sous-total', value: facture.sous_total }]}
 *     total={{ label: 'Total', value: facture.total }}
 *     after={[
 *       { label: 'Déjà payé', value: facture.montant_paye },
 *       { label: 'Reste dû', value: facture.remaining_due, tone: 'danger', emphasis: true },
 *     ]}
 *   />
 */
export function DocumentTotals({
  rows = [],
  total,
  after = [],
  className,
  'aria-label': ariaLabel = 'Totaux du document',
}: DocumentTotalsProps) {
  return (
    <dl aria-label={ariaLabel} className={cn('ms-auto mt-4 w-full space-y-2 border-t pt-4 sm:w-96', className)}>
      {rows.map((line, i) => (
        <Line key={i} line={line} size="row" />
      ))}
      {/* Un seul filet quand le total est seul : celui du pied, pas un second
          au-dessus de la ligne Total. */}
      {total && <Line line={total} size="total" ruled={rows.length > 0} />}
      {/* Pas de conteneur intermédiaire : un <dl> n'accepte que des <div> qui
          portent directement leurs <dt>/<dd>. */}
      {after.map((line, i) => (
        <Line key={`after-${i}`} line={line} size="row" className={i === 0 ? 'pt-2' : undefined} />
      ))}
    </dl>
  );
}
