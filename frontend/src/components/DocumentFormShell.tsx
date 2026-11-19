import * as React from 'react';
import { History } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/utils/format';

export interface DocumentFormShellProps {
  /** Titre de la page (le seul `h1`) : « Nouvelle facture ». */
  title: string;
  documentTitle?: string;
  /** Ce que la création change (stock, compte client) — pas une redite du titre. */
  description?: React.ReactNode;
  /** Liste d'où l'on vient (« /factures ») : lien de retour au-dessus du titre. */
  backTo: string;
  backLabel?: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  /** Bandeaux au-dessus des sections (brouillon récupéré, préremplissage). */
  notice?: React.ReactNode;
  /** Sections du formulaire (cartes). */
  children: React.ReactNode;
  /** Contenu du récapitulatif (client, totaux), au-dessus de l'action. */
  summary: React.ReactNode;
  /** Total du document, repris dans la barre d'action mobile. `null` → « — ». */
  total: number | null | undefined;
  /** Libellé du total de la barre mobile (défaut « Total »). */
  totalLabel?: string;
  /** Libellé de l'action unique : verbe + objet (« Créer la facture »). */
  submitLabel: string;
  /** Libellé pendant l'envoi (« Création de la facture… »). */
  submittingLabel: string;
  submitting: boolean;
  /** Désactive l'envoi le temps d'un chargement indispensable (jamais pour « formulaire incomplet »). */
  submitDisabled?: boolean;
  /** Affiche, en deuxième ligne du sous-titre, la légende « Les champs marqués d’un * sont obligatoires ». */
  requiredLegend?: boolean;
}

/**
 * Soumission implicite neutralisée : Entrée dans un champ texte (quantité,
 * prix, recherche, douchette) ne crée jamais le document. Seul le bouton
 * d'action, ou Entrée sur ce bouton, soumet le formulaire.
 *
 * Les champs d'une fenêtre (création de client) vivent dans un portail : ils
 * remontent ici par l'arbre React mais pas par le DOM — on les laisse passer.
 */
function guardImplicitSubmit(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return;
  const target = e.target as HTMLElement;
  if (!e.currentTarget.contains(target)) return;
  if (target instanceof HTMLInputElement) {
    const passthrough = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image'];
    if (!passthrough.includes(target.type)) e.preventDefault();
  }
}

/**
 * Ctrl + Entrée (⌘ + Entrée sur Mac) enregistre le document depuis n'importe
 * quel champ — y compris la recherche produit de la douchette, qui garde
 * Entrée pour ajouter une ligne (P-M5). Écouté en phase de capture : le champ
 * qui neutralise Entrée ne le voit pas passer. Les champs d'une fenêtre
 * (portail) ne sont pas concernés.
 */
function isSubmitShortcut(e: React.KeyboardEvent<HTMLDivElement>): boolean {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.nativeEvent.isComposing) return false;
  return e.currentTarget.contains(e.target as Node);
}

function SubmitButton({
  label,
  submittingLabel,
  submitting,
  disabled,
  className,
}: {
  label: string;
  submittingLabel: string;
  submitting: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      size="touch"
      disabled={submitting || disabled}
      aria-keyshortcuts="Control+Enter"
      className={className}
    >
      {submitting ? (
        <>
          <Spinner className="mr-2" />
          {submittingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

/**
 * Cadre commun des quatre formulaires de document de vente (facture, devis,
 * bon de livraison, avoir).
 *
 * - Grand écran : deux colonnes ; à droite un récapitulatif collant (client,
 *   totaux, l'unique action principale).
 * - Mobile et tablette : sections empilées, puis le récapitulatif, et une barre
 *   collée en bas d'écran avec le total et l'action (44 px).
 * - Entrée dans un champ ne soumet jamais (U-04) ; la validation se fait au
 *   clic sur l'action, qui reste active jusqu'au départ de la requête.
 */
export function DocumentFormShell({
  title,
  documentTitle,
  description,
  backTo,
  backLabel,
  onSubmit,
  notice,
  children,
  summary,
  total,
  totalLabel = 'Total',
  submitLabel,
  submittingLabel,
  submitting,
  submitDisabled,
  requiredLegend = true,
}: DocumentFormShellProps) {
  const summaryTitleId = React.useId();

  const submitOnShortcut = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isSubmitShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
    // Envoi en cours ou chargement indispensable : comme le bouton, rien.
    if (submitting || submitDisabled) return;
    e.currentTarget.closest('form')?.requestSubmit();
  };

  // La légende des champs obligatoires est la deuxième ligne du sous-titre :
  // seule entre l'en-tête et la première carte, elle flottait sans attache.
  // `span` en bloc et non `p` : le sous-titre est déjà un paragraphe.
  const headerDescription = requiredLegend ? (
    <>
      {description}
      <span className={cn('block text-xs text-muted-foreground', description && 'mt-1')}>
        Les champs marqués d’un{' '}
        <span aria-hidden="true" className="text-danger-600">
          *
        </span>
        <span className="sr-only">astérisque</span> sont obligatoires
      </span>
    </>
  ) : (
    description
  );

  return (
    <PageShell
      as="form"
      noValidate
      onSubmit={onSubmit}
      width="wide"
      title={title}
      documentTitle={documentTitle}
      description={headerDescription}
      backTo={backTo}
      backLabel={backLabel}
    >
      {/* Sous 1024 px, la barre d'action collée en bas masquerait le champ qui
          reçoit le focus (WCAG 2.4.11) : marge de défilement sous chaque champ. */}
      <div
        onKeyDownCapture={submitOnShortcut}
        onKeyDown={guardImplicitSubmit}
        className="space-y-4 sm:space-y-6 max-lg:[&_button]:scroll-mb-36 max-lg:[&_input]:scroll-mb-36 max-lg:[&_textarea]:scroll-mb-36"
      >
        {notice && <div className="space-y-3">{notice}</div>}

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4 sm:space-y-6">{children}</div>

          <aside aria-labelledby={summaryTitleId} className="mt-4 sm:mt-6 lg:sticky lg:top-[4.5rem] lg:mt-0">
            <Card>
              <CardHeader>
                <CardTitle id={summaryTitleId}>Récapitulatif</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {summary}
                {/* Taille standard : sur ordinateur, l'action du récapitulatif n'a
                    pas à être plus grosse que les autres boutons de l'écran. */}
                <SubmitButton
                  label={submitLabel}
                  submittingLabel={submittingLabel}
                  submitting={submitting}
                  disabled={submitDisabled}
                  className="hidden w-full lg:inline-flex"
                />
                {/* Grand écran = clavier : le raccourci est rappelé sous l'action
                    (annoncé par `aria-keyshortcuts` sur le bouton). */}
                <p aria-hidden="true" className="hidden text-center text-xs text-muted-foreground lg:block">
                  ou <kbd className="rounded border bg-muted px-1 font-sans">Ctrl</kbd> +{' '}
                  <kbd className="rounded border bg-muted px-1 font-sans">Entrée</kbd>
                </p>
              </CardContent>
            </Card>
          </aside>

          {/* Barre d'action mobile : collée en bas de l'écran tant que le
              formulaire défile (sticky, pas fixed : le <main> animé porte une
              transformation qui casserait un `position: fixed`). */}
          <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6 lg:hidden">
            {/* Total et action sur une ligne ; si le libellé est long (« Créer le
                bon de livraison »), l'action passe dessous — un montant n'est
                jamais tronqué. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="shrink-0">
                <p className="text-xs text-muted-foreground">{totalLabel}</p>
                <Money value={total} emphasis className="text-lg" />
              </div>
              <SubmitButton
                label={submitLabel}
                submittingLabel={submittingLabel}
                submitting={submitting}
                disabled={submitDisabled}
                className="ms-auto shrink-0"
              />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/** Liste libellé / valeur du récapitulatif (une colonne, valeurs à droite). */
export function SummaryList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn('space-y-2 text-sm', className)}>{children}</dl>;
}

export function SummaryItem({
  label,
  children,
  numeric = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-right font-medium', numeric && 'tabular-nums')}>{children}</dd>
    </div>
  );
}

/**
 * Marge du document — réservée au gérant et à l'administrateur (U-26) : le
 * prix de revient ne s'affiche pas sur l'écran tourné vers le client.
 */
export function MarginSummary({
  margin,
  cost,
  marginPct,
}: {
  margin: number;
  cost: number;
  marginPct: number | null;
}) {
  return (
    <dl className="space-y-1.5 rounded-md border p-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-medium">Marge brute</dt>
        <dd>
          <Money value={margin} tone="delta" emphasis />
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <dt>Taux de marge</dt>
        <dd className="tabular-nums">{marginPct === null ? '—' : formatPercent(marginPct, 1)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <dt>Prix de revient</dt>
        <dd>
          <Money value={cost} tone="muted" />
        </dd>
      </div>
    </dl>
  );
}

/** Bandeau « brouillon récupéré » commun aux formulaires. */
export function DraftNotice({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-center gap-2">
        <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Un brouillon non enregistré a été récupéré
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onDiscard}>
          Supprimer le brouillon
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onRestore}>
          Restaurer le brouillon
        </Button>
      </div>
    </div>
  );
}
