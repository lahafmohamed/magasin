import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ReceiptText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Paiement, type FactureComplete, type PaiementReport } from '../types';
import { Button } from './ui/button';
import { DocumentCode } from './ui/document-code';
import { EmptyState } from './ui/empty-state';
import { Spinner } from './ui/loading';
import { Money } from './ui/money';
import { Tag, type TagHue } from './ui/tag';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from './ui/responsive-table';
import { formatCurrency, formatDate, formatDateTime, formatDayMonth, toNumber } from '../utils/format';
import { formatPaymentMethod, paymentMethodHue, paymentMethodPhrase } from '../utils/paymentMethod';
import { paiementService } from '../services/api';
import { getErrorMessage } from '@/utils/errors';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { cn } from '@/lib/utils';

/** Reports entre factures renvoyés par `GET /factures/:id` (E1-R1). */
export type PaymentReports = Pick<FactureComplete, 'excedent_reporte' | 'recu_par_report' | 'excedent_non_affecte'>;

interface PaymentHistoryProps {
  paiements: Paiement[];
  /**
   * Suppression d'un paiement. À ne passer qu'aux rôles que l'API autorise
   * (administrateur) : un bouton refusé en 403 n'a rien à faire à l'écran.
   */
  onDelete?: (paiement: Paiement) => void;
  /**
   * E1-R1 : argent passé d'une facture à l'autre. Expliqué sous la liste, pour
   * que paiements listés − reportés + reçus = montant payé sur chaque page.
   */
  reports?: PaymentReports;
  /** Facture annulée : ses paiements sont reportés parce qu'elle n'est plus due. */
  factureAnnulee?: boolean;
}

/** Date courte d'un paiement : « 23 oct. » cette année, « 23 oct. 2025 » sinon. */
function datePaiement(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() === new Date().getFullYear() ? formatDayMonth(d) : formatDate(d);
}

/**
 * E1-R1 — sous la liste des paiements, ce qui n'y apparaît pas tel quel :
 * l'excédent parti sur une autre facture, celui qui ne règle aucune facture,
 * et ce qui est arrivé d'une autre facture. Sans ces phrases, une facture
 * « Payée 267 000 FCFA » listait 316 400 FCFA de paiements et la facture qui
 * recevait l'excédent affichait « Payé 76 000 FCFA » au-dessus d'un seul
 * paiement de 26 600 FCFA (FAC-2026-00113 / FAC-2026-00079).
 */
function ReportNotes({
  reports,
  factureAnnulee,
  hasPayments,
}: {
  reports?: PaymentReports;
  factureAnnulee: boolean;
  hasPayments: boolean;
}) {
  const canOpen = useRouteAccess();
  const sortants = reports?.excedent_reporte ?? [];
  const entrants = reports?.recu_par_report ?? [];
  const nonAffecte = toNumber(reports?.excedent_non_affecte) ?? 0;
  if (sortants.length === 0 && entrants.length === 0 && nonAffecte <= 0) return null;

  // Un numéro de facture ne se coupe jamais à ses tirets (mono, comme tout
  // numéro de pièce), une date jamais entre jour et mois.
  const facture = (r: PaiementReport) =>
    canOpen(`/factures/${r.facture_id}`) ? (
      <Link to={`/factures/${r.facture_id}`} className="text-primary underline-offset-4 hover:underline">
        <DocumentCode>{r.numero_facture}</DocumentCode>
      </Link>
    ) : (
      <DocumentCode>{r.numero_facture}</DocumentCode>
    );
  const raison = factureAnnulee ? 'cette facture est annulée' : 'cette facture était déjà soldée';
  const paiement = (r: PaiementReport) => {
    const date = datePaiement(r.date_paiement);
    return (
      <>
        paiement {paymentMethodPhrase(r.methode_paiement)}
        {date && (
          <>
            {' '}du <span className="whitespace-nowrap">{date}</span>
          </>
        )}
      </>
    );
  };

  return (
    <ul
      aria-label="Paiements reportés entre factures"
      className={cn('space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm', hasPayments && 'mt-3')}
    >
      {sortants.map((r) => (
        <li key={`sortant-${r.paiement_id}-${r.facture_id}`} className="flex items-start gap-2">
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            Dont <Money value={r.montant} /> reportés sur {facture(r)} : {raison}.
          </span>
        </li>
      ))}
      {nonAffecte > 0 && (
        <li className="flex items-start gap-2">
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            Dont <Money value={nonAffecte} /> payés en trop : aucune autre facture de ce client n’était ouverte à la
            date du paiement.
          </span>
        </li>
      )}
      {entrants.map((r) => (
        <li key={`entrant-${r.paiement_id}-${r.facture_id}`} className="flex items-start gap-2">
          <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {hasPayments ? (
            <span>
              Dont <Money value={r.montant} /> reportés depuis {facture(r)} ({paiement(r)}).
            </span>
          ) : (
            <span>
              <Money value={r.montant} /> reportés depuis {facture(r)} ({paiement(r)}) règlent cette facture.
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

type SourceKey = 'direct' | 'acompte_application' | 'reversal';

/** Origine d'un paiement : une catégorie, pas un statut. */
const SOURCE: Record<SourceKey, { label: string; hue: TagHue | null }> = {
  direct: { label: 'Paiement direct', hue: null },
  acompte_application: { label: 'Acompte', hue: 4 },
  reversal: { label: 'Annulation', hue: 6 },
};

const sourceOf = (paiement: Paiement): SourceKey =>
  paiement.source === 'acompte_application' || paiement.source === 'reversal' ? paiement.source : 'direct';

/**
 * Le cas courant (paiement direct) en texte atténué ; seules les exceptions —
 * acompte appliqué, annulation — portent une pastille.
 */
function SourceLabel({ paiement }: { paiement: Paiement }) {
  const source = SOURCE[sourceOf(paiement)];
  return source.hue === null ? (
    <span className="whitespace-nowrap text-muted-foreground">{source.label}</span>
  ) : (
    <Tag hue={source.hue}>{source.label}</Tag>
  );
}

/** Mode de paiement : pastille + texte, dessiné comme partout ailleurs (caisse, tableau de bord). */
function MethodLabel({ methode }: { methode: string }) {
  return <Tag hue={paymentMethodHue(methode)}>{formatPaymentMethod(methode)}</Tag>;
}

/**
 * Paiements d'une facture : tableau sur ordinateur, cartes sur téléphone (le
 * tableau de 7 colonnes cachait référence, notes et actions à 390 px).
 */
export function PaymentHistory({ paiements, onDelete, reports, factureAnnulee = false }: PaymentHistoryProps) {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const downloadRecu = async (id: number) => {
    setDownloadingId(id);
    try {
      await paiementService.downloadRecu(id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de générer le reçu. Réessayez.'));
    } finally {
      setDownloadingId(null);
    }
  };

  if (!paiements || paiements.length === 0) {
    const hasReports =
      (reports?.recu_par_report?.length ?? 0) > 0 ||
      (reports?.excedent_reporte?.length ?? 0) > 0 ||
      (toNumber(reports?.excedent_non_affecte) ?? 0) > 0;
    // Réglée seulement par un report : la phrase remplace l'état vide, qui
    // promettait des paiements à venir sur une facture déjà payée.
    if (hasReports) return <ReportNotes reports={reports} factureAnnulee={factureAnnulee} hasPayments={false} />;
    return (
      <EmptyState
        compact
        icon={ReceiptText}
        title="Aucun paiement enregistré"
        description="Les paiements reçus pour cette facture apparaîtront ici"
      />
    );
  }

  // Un paiement issu d'un acompte se défait depuis l'acompte, pas d'ici ; le
  // serveur signale aussi les autres refus (caisse ou période clôturée).
  const canDelete = (p: Paiement) =>
    !!onDelete && p.source !== 'acompte_application' && p.supprimable !== false;

  const table = (
    <Table aria-label="Paiements de la facture">
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Origine</TableHead>
          <TableHead>Mode de paiement</TableHead>
          <TableHead numeric>Montant</TableHead>
          <TableHead>Référence</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="w-[1%]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {paiements.map((paiement) => {
          const amountLabel = formatCurrency(paiement.montant);
          return (
            <TableRow key={paiement.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(paiement.date_paiement)}</TableCell>
              <TableCell>
                <SourceLabel paiement={paiement} />
              </TableCell>
              <TableCell>
                <MethodLabel methode={paiement.methode_paiement} />
              </TableCell>
              <TableCell numeric className="font-medium">
                <Money value={paiement.montant} />
              </TableCell>
              <TableCell className="text-muted-foreground">{paiement.reference || '—'}</TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground" title={paiement.notes || undefined}>
                {paiement.notes || '—'}
              </TableCell>
              <TableCell>
                {/* Cellule toujours rendue : les colonnes ne se décalent pas d'une ligne à l'autre. */}
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadRecu(paiement.id)}
                    disabled={downloadingId === paiement.id}
                    aria-label={`Télécharger le reçu du paiement de ${amountLabel}`}
                    title="Télécharger le reçu (PDF)"
                  >
                    {downloadingId === paiement.id ? <Spinner /> : <ReceiptText className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                  {canDelete(paiement) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                      onClick={() => onDelete?.(paiement)}
                      aria-label={`Supprimer le paiement de ${amountLabel}`}
                      title="Supprimer le paiement"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  // Carte : le montant en titre (500, comme tout titre de carte), les actions en
  // texte seul ; « Supprimer » reste gris tant qu'on ne le survole pas.
  const cards = paiements.map((paiement) => (
    <DataCard
      key={paiement.id}
      title={<Money value={paiement.montant} />}
      badge={<SourceLabel paiement={paiement} />}
      actions={
        <>
          <Button
            variant="outline"
            size="touch"
            onClick={() => downloadRecu(paiement.id)}
            disabled={downloadingId === paiement.id}
            className="gap-2"
          >
            {downloadingId === paiement.id && <Spinner />}
            Télécharger le reçu
          </Button>
          {canDelete(paiement) && (
            <Button
              variant="outline"
              size="touch"
              onClick={() => onDelete?.(paiement)}
              className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
            >
              Supprimer le paiement
            </Button>
          )}
        </>
      }
    >
      <DataCardRow label="Date" value={formatDateTime(paiement.date_paiement)} />
      <DataCardRow label="Mode de paiement" value={<MethodLabel methode={paiement.methode_paiement} />} />
      {paiement.reference && <DataCardRow label="Référence" value={paiement.reference} />}
      {paiement.notes && <DataCardRow label="Notes" value={paiement.notes} />}
    </DataCard>
  ));

  return (
    <>
      <ResponsiveTable table={table} cards={cards} />
      <ReportNotes reports={reports} factureAnnulee={factureAnnulee} hasPayments />
    </>
  );
}
