import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  MoreHorizontal,
  Plus,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { commandeService } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { TiersPicker } from '../components/TiersPicker';
import { CommandeLinesEditor, type CommandeLigneDraft } from '../components/CommandeProductPicker';
import type { Tiers } from '../types';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { DocumentListPage, useDocumentList, type DocumentColumn } from '@/components/DocumentListPage';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Money } from '@/components/ui/money';
import { Spinner } from '@/components/ui/loading';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { formatDate, formatDateNumeric, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';

interface Commande {
  id: number;
  numero_commande: string;
  tiers_id: number;
  fournisseur_nom: string | null;
  date_commande: string;
  date_livraison_prevue: string | null;
  sous_total: number | string;
  statut: string;
}

/** `GET /commandes/stats` : nombre de commandes par statut (toutes, sans filtre). */
interface CommandeStats {
  en_attente?: number | string;
  validee?: number | string;
  expediee?: number | string;
  livree?: number | string;
  annulee?: number | string;
}

type Transition = 'validee' | 'expediee' | 'annulee';

/** Statuts encore modifiables : l'annulation n'a plus de sens une fois reçue. */
const CANCELLABLE = ['en_attente', 'validee', 'expediee'];
/** Statuts proposés à la réception (`/receptions/pending`). */
const RECEIVABLE = ['validee', 'expediee'];

/**
 * Créer, modifier ou faire avancer une commande fournisseur : gérant et
 * administrateur (E2, 2026-10-24 — miroir de `POST/PUT /commandes`).
 */
const WRITE_ROLES = ['admin', 'manager'];

/** Date du jour au format `AAAA-MM-JJ`, heure locale. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isLate(c: Commande): boolean {
  if (!c.date_livraison_prevue || !CANCELLABLE.includes(c.statut)) return false;
  return c.date_livraison_prevue.slice(0, 10) < todayIso();
}

/** Date de livraison prévue + « En retard » en mots (icône statique, jamais la couleur seule). */
function LivraisonPrevue({ commande }: { commande: Commande }) {
  if (!commande.date_livraison_prevue) return <span className="text-muted-foreground">—</span>;
  const late = isLate(commande);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 whitespace-nowrap md:justify-start">
      {formatDate(commande.date_livraison_prevue)}
      {late && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-danger-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          En retard
        </span>
      )}
    </span>
  );
}

const CSV_HEADERS = ['N° de commande', 'Fournisseur', 'Date', 'Montant (FCFA)', 'Livraison prévue', 'Statut'];
const csvRow = (c: Commande) => [
  c.numero_commande,
  c.fournisseur_nom ?? '',
  formatDateNumeric(c.date_commande),
  toNumber(c.sous_total) ?? 0,
  c.date_livraison_prevue ? formatDateNumeric(c.date_livraison_prevue) : '',
  getStatusLabel('commande', c.statut),
];

/** Toutes les commandes des filtres courants (pages de 200, le maximum du serveur). */
async function fetchAllCommandes(search: string, statut: string | undefined): Promise<Commande[]> {
  const all: Commande[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await commandeService.getAll(search || undefined, statut, page, 200, 'date', 'desc');
    all.push(...((res?.data ?? []) as Commande[]));
    if (page >= (res?.pagination?.totalPages ?? 1)) break;
  }
  return all;
}

function useCommandeActions(onDone: () => void) {
  const confirm = useConfirm();

  const changeStatut = async (c: Commande, statut: Transition) => {
    const opts =
      statut === 'annulee'
        ? {
            title: `Annuler la commande ${c.numero_commande} ?`,
            description: 'Elle ne pourra plus être réceptionnée.',
            confirmLabel: 'Annuler la commande',
            cancelLabel: 'Garder la commande',
            destructive: true,
          }
        : statut === 'validee'
          ? {
              title: `Valider la commande ${c.numero_commande} ?`,
              description:
                'Une fois validée, la commande ne peut plus être modifiée. Elle pourra être réceptionnée à l’arrivée des produits.',
              confirmLabel: 'Valider la commande',
            }
          : {
              title: `Marquer la commande ${c.numero_commande} comme expédiée ?`,
              description: 'Le fournisseur a envoyé les produits : vous les réceptionnerez à leur arrivée.',
              confirmLabel: 'Marquer comme expédiée',
            };
    if (!(await confirm(opts))) return;
    try {
      await commandeService.updateStatut(c.id, statut);
      const done = statut === 'annulee' ? 'annulée' : statut === 'validee' ? 'validée' : 'marquée comme expédiée';
      toast.success(`Commande ${c.numero_commande} ${done}`);
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de mettre à jour la commande. Réessayez.'));
    }
  };

  const downloadPdf = async (c: Commande) => {
    try {
      await commandeService.downloadPdf(c.id, c.numero_commande);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de télécharger le bon de commande. Réessayez.'));
    }
  };

  return { changeStatut, downloadPdf };
}

function CommandesList({ canWrite, onCreate }: { canWrite: boolean; onCreate: () => void }) {
  const navigate = useNavigate();
  const canOpen = useRouteAccess();

  const list = useDocumentList<Commande, CommandeStats>({
    defaultSortKey: 'date',
    fetchList: (search, statut, page, limit, sortKey, sortDir) =>
      commandeService.getAll(search || undefined, statut, page, limit, sortKey, sortDir),
    fetchStats: () => commandeService.getStats(),
    loadErrorMessage: 'Impossible de charger les commandes fournisseur.',
  });

  const { changeStatut, downloadPdf } = useCommandeActions(() => {
    void list.reload();
    list.reloadStats();
  });

  // Décomptes serveur, tous statuts confondus — jamais la somme de la page
  // affichée. Chaque nombre va dans sa puce de statut : une rangée de tuiles
  // « À valider 1 · Reçues 4 » ne faisait que répéter les puces.
  const chipCounts = (s: CommandeStats) => {
    const byStatus = {
      en_attente: toNumber(s.en_attente),
      validee: toNumber(s.validee),
      expediee: toNumber(s.expediee),
      livree: toNumber(s.livree),
      annulee: toNumber(s.annulee),
    };
    // Les cinq statuts sont tous ceux qu'admet la base : leur somme est le total.
    const values = Object.values(byStatus);
    const all = values.every((v) => v !== null) ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;
    return { all, ...byStatus };
  };

  // Texte seul, même largeur minimale : « Valider » et « Réceptionner » d'une
  // ligne à l'autre commencent au même bord.
  const rowActions = (c: Commande) => {
    const receivable = canWrite && RECEIVABLE.includes(c.statut) && canOpen('/receptions');
    return (
      <div className="flex items-center justify-end gap-1.5">
        {canWrite && c.statut === 'en_attente' && (
          <Button
            variant="outline"
            size="touch"
            className="sm:min-w-32"
            onClick={() => void changeStatut(c, 'validee')}
            aria-label={`Valider la commande ${c.numero_commande}`}
          >
            Valider
          </Button>
        )}
        {receivable && (
          <Button
            variant="outline"
            size="touch"
            className="sm:min-w-32"
            onClick={() => navigate(`/receptions?commande_id=${c.id}`)}
            aria-label={`Réceptionner la commande ${c.numero_commande}`}
          >
            Réceptionner
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-touch" aria-label={`Plus d’actions pour ${c.numero_commande}`}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {canWrite && c.statut === 'validee' && (
              <DropdownMenuItem className="gap-2" onSelect={() => void changeStatut(c, 'expediee')}>
                <Truck className="h-4 w-4" aria-hidden="true" />
                Marquer comme expédiée
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="gap-2" onSelect={() => void downloadPdf(c)}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Télécharger le bon de commande
            </DropdownMenuItem>
            {canWrite && CANCELLABLE.includes(c.statut) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-danger-700 focus:bg-danger-50 focus:text-danger-800"
                  onSelect={() => void changeStatut(c, 'annulee')}
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Annuler la commande
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const columns: DocumentColumn<Commande>[] = [
    {
      header: 'N° de commande',
      sortKey: 'numero',
      primary: true,
      render: (c) => c.numero_commande,
    },
    { header: 'Fournisseur', render: (c) => c.fournisseur_nom || '—' },
    { header: 'Date', sortKey: 'date', cellClassName: 'whitespace-nowrap', render: (c) => formatDate(c.date_commande) },
    {
      header: 'Montant',
      sortKey: 'montant',
      align: 'right',
      numeric: true,
      render: (c) => <Money value={c.sous_total} />,
    },
    { header: 'Livraison prévue', sortKey: 'livraison', render: (c) => <LivraisonPrevue commande={c} /> },
    { header: 'Statut', card: 'badge', render: (c) => <StatusBadge type="commande" statut={c.statut} /> },
    {
      header: 'Actions',
      card: 'actions',
      stopPropagation: true,
      headClassName: 'text-right',
      cellClassName: 'text-right',
      render: rowActions,
    },
  ];

  const createButton = canWrite ? (
    <Button size="touch" className="gap-2" onClick={onCreate}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      Nouvelle commande
    </Button>
  ) : null;

  return (
    <DocumentListPage
      list={list}
      title="Commandes fournisseur"
      subtitle="Suivez vos commandes fournisseur, de l’envoi à la réception"
      createButton={createButton}
      chipCounts={chipCounts}
      searchPlaceholder="N° ou fournisseur…"
      searchLabel="Rechercher une commande fournisseur"
      statusChips={[{ value: 'all', label: 'Toutes' }, ...getStatusOptions('commande')]}
      shortcuts={{ newRoute: '/commandes?nouvelle=1', newDescription: 'Nouvelle commande fournisseur' }}
      csv={{
        filenamePrefix: 'commandes_fournisseur',
        headers: CSV_HEADERS,
        row: csvRow,
        fetchAll: fetchAllCommandes,
      }}
      columns={columns}
      detailPath={(c) => `/commandes/${c.id}`}
      selectable={false}
      itemNoun={{ one: 'commande', many: 'commandes' }}
      emptyState={{
        icon: ShoppingCart,
        title: 'Aucune commande fournisseur',
        description: 'Commandez des produits à un fournisseur, puis réceptionnez-les à leur arrivée',
        filteredTitle: 'Aucune commande ne correspond à ces filtres',
        filteredDescription: 'Vérifiez le numéro ou le fournisseur, ou changez de statut',
        createAction: createButton,
      }}
    />
  );
}

/** Une touche Entrée dans un champ ne doit jamais envoyer la commande. */
function blockImplicitSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
  const target = e.target as HTMLElement;
  if (e.key !== 'Enter' || !e.currentTarget.contains(target)) return;
  if (target.tagName === 'INPUT') e.preventDefault();
}

function NouvelleCommande({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [fournisseur, setFournisseur] = useState<Tiers | null>(null);
  const [lignes, setLignes] = useState<CommandeLigneDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [dateLivraison, setDateLivraison] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ fournisseur?: string; lignes?: string }>({});

  // Une commande en cours de saisie ne se perd pas sur une fermeture d'onglet.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (lignes.length > 0 && !submitting) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [lignes.length, submitting]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Le formulaire d'un dialogue (rendu en portail) remonte ici dans l'arbre React.
    if (e.target !== e.currentTarget) return;
    const next: { fournisseur?: string; lignes?: string } = {};
    if (!fournisseur) next.fournisseur = 'Choisissez le fournisseur.';
    if (lignes.length === 0) next.lignes = 'Ajoutez au moins un produit à la commande.';
    setErrors(next);
    if (next.fournisseur) {
      document.getElementById('cmd-fournisseur')?.focus();
      return;
    }
    if (next.lignes) {
      document.getElementById('cmd-new-produit')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const result = await commandeService.create({
        tiers_id: fournisseur!.id,
        lignes: lignes.map((l) => ({ produit_id: l.produit_id, quantite: l.quantite, prix_unitaire: l.prix_unitaire })),
        notes: notes.trim() || undefined,
        date_livraison_prevue: dateLivraison || undefined,
      });
      toast.success(`Commande ${result.numero_commande} créée`);
      navigate(`/commandes/${result.id}`, { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer la commande fournisseur. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitButton = (
    <Button type="submit" form="commande-form" size="touch" disabled={submitting} className="gap-2">
      {submitting ? <Spinner /> : <CheckCircle className="h-4 w-4" aria-hidden="true" />}
      Créer la commande
    </Button>
  );

  return (
    <PageShell
      title="Nouvelle commande fournisseur"
      description="Commandez des produits à un fournisseur ; vous les réceptionnerez à leur arrivée"
      width="wide"
      onBack={onClose}
      backLabel="Commandes fournisseur"
      focusOnMount
      actions={
        <Button type="button" variant="outline" size="touch" onClick={onClose}>
          Annuler
        </Button>
      }
      primaryAction={submitButton}
    >
      <form id="commande-form" onSubmit={submit} onKeyDown={blockImplicitSubmit} noValidate className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
          <div className="space-y-4 sm:space-y-6 md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Fournisseur</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cmd-fournisseur">
                    Fournisseur <RequiredMark />
                  </Label>
                  <TiersPicker
                    id="cmd-fournisseur"
                    role="fournisseur"
                    value={fournisseur}
                    onChange={(t) => {
                      setFournisseur(t);
                      if (t) setErrors((prev) => ({ ...prev, fournisseur: undefined }));
                    }}
                    {...fieldErrorProps('cmd-fournisseur', errors.fournisseur)}
                  />
                  <FieldError id="cmd-fournisseur">{errors.fournisseur}</FieldError>
                </div>
                {fournisseur && (fournisseur.telephone || fournisseur.email || fournisseur.adresse) && (
                  <KeyValueList columns={1} className="rounded-md border bg-muted/40 p-3">
                    {fournisseur.telephone && <KeyValue label="Téléphone">{fournisseur.telephone}</KeyValue>}
                    {fournisseur.email && <KeyValue label="Adresse e-mail">{fournisseur.email}</KeyValue>}
                    {fournisseur.adresse && <KeyValue label="Adresse">{fournisseur.adresse}</KeyValue>}
                  </KeyValueList>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Livraison et notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cmd-date-livraison">Date de livraison prévue</Label>
                  <DatePicker id="cmd-date-livraison" value={dateLivraison} onChange={setDateLivraison} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmd-notes">Notes</Label>
                  <Textarea
                    id="cmd-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Instructions de livraison, références…"
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            <CommandeLinesEditor
              idPrefix="cmd-new"
              lignes={lignes}
              onChange={(next) => {
                setLignes(next);
                if (next.length > 0) setErrors((prev) => ({ ...prev, lignes: undefined }));
              }}
              error={errors.lignes}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="touch" onClick={onClose}>
            Annuler
          </Button>
          {submitButton}
        </div>
      </form>
    </PageShell>
  );
}

export default function Commandes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const canWrite = WRITE_ROLES.includes(user?.role ?? '');
  const creating = canWrite && params.get('nouvelle') === '1';

  // Ouverte depuis la liste : le retour revient aux mêmes filtres.
  const openCreate = () => navigate('/commandes?nouvelle=1', { state: { fromList: true } });
  const closeCreate = () => {
    if ((location.state as { fromList?: boolean } | null)?.fromList) navigate(-1);
    else navigate('/commandes', { replace: true });
  };

  if (creating) return <NouvelleCommande onClose={closeCreate} />;
  return <CommandesList canWrite={canWrite} onCreate={openCreate} />;
}
