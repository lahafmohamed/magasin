import { Card, CardContent } from './ui/card';
import { Money } from './ui/money';
import { cn } from '@/lib/utils';
import { formatPercent, toNumber } from '../utils/format';

/** Rangée libellé à gauche / montant à droite sur téléphone, colonne au-delà. */
const ITEM = 'flex min-w-0 items-baseline justify-between gap-3 sm:block';
const AMOUNT = 'text-sm font-medium sm:mt-0.5 sm:text-base';

interface PaymentStatusBarProps {
  montantPaye: number | string | null | undefined;
  remainingDue: number | string | null | undefined;
  total: number | string | null | undefined;
  className?: string;
}

/**
 * Avancement du paiement d'une facture : payé, reste dû, barre de progression.
 *
 * Le statut en mots est porté par la pastille de l'en-tête de page : la carte
 * ne le répète plus (« Partiellement payée » au-dessus de « Statut : Partielle »).
 * « Enregistrer un paiement » est l'action principale de l'en-tête, plus un
 * petit bouton perdu dans la carte.
 *
 * Un seul état, une seule teinte : la barre reste dans la teinte « info » tant
 * que la facture n'est pas soldée et ne passe au vert qu'à 100 % ; le reste dû
 * est mis en avant par la graisse, pas par le rouge (la pastille bleue, la
 * barre verte et le montant rouge disaient la même chose en trois couleurs).
 */
export function PaymentStatusBar({ montantPaye, remainingDue, total, className }: PaymentStatusBarProps) {
  const paid = toNumber(montantPaye) ?? 0;
  const due = Math.max(0, toNumber(remainingDue) ?? 0);
  const totalNum = toNumber(total) ?? 0;
  const percentage = totalNum > 0 ? Math.min(100, Math.max(0, (paid / totalNum) * 100)) : 0;
  const percentLabel = `${formatPercent(Math.floor(percentage))} payé`;
  const settled = percentage >= 100;

  return (
    <Card className={className}>
      <CardContent inset="standalone" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-medium leading-snug">Paiement</h2>
          <p className="text-sm text-muted-foreground tabular-nums">{percentLabel}</p>
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Avancement du paiement"
          aria-valuenow={Math.floor(percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={percentLabel}
        >
          {/* `transform` et non `width` : l'avancement s'anime sans recalcul de la mise en page. */}
          <div
            className={cn(
              'h-full w-full origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none',
              settled ? 'bg-success-600' : 'bg-info-600'
            )}
            style={{ transform: `scaleX(${percentage / 100})` }}
          />
        </div>

        {/* Sous 640 px, une rangée libellé / montant par valeur : trois montants
            de sept chiffres côte à côte se collaient (« 1 788 000 FCFA1 788 000
            FCFA0 FCFA ») et se lisaient comme un seul nombre. */}
        <dl className="grid gap-2 sm:grid-cols-3 sm:gap-4">
          <div className={ITEM}>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className={AMOUNT}>
              <Money value={totalNum} />
            </dd>
          </div>
          <div className={ITEM}>
            <dt className="text-xs text-muted-foreground">Payé</dt>
            <dd className={AMOUNT}>
              <Money value={paid} />
            </dd>
          </div>
          <div className={ITEM}>
            <dt className="text-xs text-muted-foreground">Reste dû</dt>
            <dd className={AMOUNT}>
              <Money value={due} emphasis={due > 0} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
