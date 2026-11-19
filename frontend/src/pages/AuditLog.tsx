import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText, X } from 'lucide-react';
import { auditService } from '../services/api';
import { PageShell } from '@/components/ui/page-shell';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { DocumentCode } from '@/components/ui/document-code';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDateTime, formatNumber } from '@/utils/format';

/** Ligne de `GET /admin/audit`. */
interface AuditEntry {
  id: number;
  action: string;
  table_name: string;
  record_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user_id: number | null;
  user_nom: string | null;
}

type SortKey = 'date' | 'element' | 'action' | 'user';

const PAGE_SIZE = 50;

/**
 * Nom de chaque type d'élément journalisé (tables écrites par `logAudit`,
 * `AuditService` et l'authentification). Un nom de table inconnu reste lisible.
 */
const ELEMENT_LABELS: Record<string, string> = {
  attachments: 'Pièce jointe',
  bons_livraison: 'Bon de livraison',
  commandes_fournisseur: 'Commande fournisseur',
  company_settings: 'Paramètres de l’entreprise',
  demandes_reapprovisionnement: 'Demande de réapprovisionnement',
  depenses: 'Dépense',
  devis: 'Devis',
  ecritures_comptables: 'Écriture',
  employes: 'Employé',
  factures: 'Facture',
  factures_avoir: 'Avoir',
  factures_fournisseur: 'Facture fournisseur',
  paiements: 'Paiement',
  paiements_fournisseur: 'Paiement fournisseur',
  payroll_cotisations: 'Cotisation de paie',
  payroll_runs: 'Cycle de paie',
  payslips: 'Bulletin de paie',
  produits: 'Produit',
  receptions: 'Réception',
  retours: 'Retour',
  sessions_caisse: 'Session de caisse',
  shifts_employes: 'Horaire d’employé',
  stock_locations: 'Emplacement',
  stock_transfers: 'Transfert de stock',
  tiers: 'Contact',
  utilisateur_locations: 'Emplacements d’un utilisateur',
  utilisateurs: 'Utilisateur',
};

/** Options du filtre « Élément », triées par libellé. */
const ELEMENT_OPTIONS = Object.entries(ELEMENT_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

/**
 * Type d'action : une catégorie, pas un statut — un libellé en texte simple.
 * Les pastilles vertes, bleues et rouges peignaient le journal comme une liste
 * d'alertes (une suppression n'est pas une erreur).
 */
const ACTION_LABELS: Record<string, { label: string }> = {
  create: { label: 'Création' },
  update: { label: 'Modification' },
  delete: { label: 'Suppression' },
  login: { label: 'Connexion' },
  update_statut: { label: 'Changement de statut' },
  cancel: { label: 'Annulation' },
  deactivate: { label: 'Désactivation' },
  send: { label: 'Envoi' },
  execute: { label: 'Exécution' },
  complete: { label: 'Exécution' },
  close: { label: 'Clôture' },
  approuvee: { label: 'Approbation' },
  partiellement_approuvee: { label: 'Approbation partielle' },
  refusee: { label: 'Refus' },
  apply_to_facture: { label: 'Imputation sur une facture' },
  convert_to_facture: { label: 'Conversion en facture' },
  create_from_retour: { label: 'Création depuis un retour' },
  update_assignments: { label: 'Modification des emplacements' },
};

function humanize(code: string | null | undefined): string {
  if (!code) return '—';
  const readable = code.replace(/_/g, ' ').trim().toLocaleLowerCase('fr-FR');
  return readable ? readable.charAt(0).toLocaleUpperCase('fr-FR') + readable.slice(1) : '—';
}

const elementLabel = (table: string | null | undefined) => (table ? ELEMENT_LABELS[table] ?? humanize(table) : '—');

function actionConfig(action: string | null | undefined): { label: string } {
  const key = (action ?? '').toLowerCase();
  return ACTION_LABELS[key] ?? { label: humanize(action) };
}

/** « utilisateur n° 5 », pour un nom de bouton ; sans numéro, l'élément seul. */
const elementText = (l: Pick<AuditEntry, 'table_name' | 'record_id'>) =>
  `${elementLabel(l.table_name)}${l.record_id != null ? ` n° ${l.record_id}` : ''}`;

/**
 * « Utilisateur n° 5 » : l'élément et son identifiant dans une seule cellule —
 * le numéro, seul dans sa colonne, se collait à « Action ». Identifiant en mono,
 * jamais séparé de « n° ».
 */
function ElementRef({ entry }: { entry: Pick<AuditEntry, 'table_name' | 'record_id'> }) {
  return (
    <>
      {elementLabel(entry.table_name)}
      {entry.record_id != null && (
        <>
          {' n°\u00A0'}
          <DocumentCode>{entry.record_id}</DocumentCode>
        </>
      )}
    </>
  );
}

/** Valeur d'un champ, lisible : texte tel quel, objet en JSON, vide « — ». */
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Lignes Champ · Avant · Après ; une modification ne montre que les champs qui ont changé. */
function diffRows(entry: AuditEntry): Array<{ field: string; before: string; after: string }> {
  const before = entry.old_values ?? {};
  const after = entry.new_values ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const rows = keys.map((field) => ({ field, before: displayValue(before[field]), after: displayValue(after[field]) }));
  const changed = rows.filter((r) => r.before !== r.after);
  return entry.old_values && entry.new_values && changed.length > 0 ? changed : rows;
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filterTable, setFilterTable] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const requestSeq = useRef(0);

  const loadLogs = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await auditService.getLogs({
        table: filterTable || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (seq !== requestSeq.current) return;
      setLogs(result.data as AuditEntry[]);
      setTotal(result.total);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // Erreur gardée en état : « Réessayer » au lieu d'un journal vide.
      setError(err);
      setLogs([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filterTable, filterDateFrom, filterDateTo, page]);

  // Les filtres s'appliquent dès qu'ils changent : plus de bouton « Filtrer ».
  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const hasFilters = !!filterTable || !!filterDateFrom || !!filterDateTo;
  const clearFilters = () => {
    setFilterTable('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Tri appliqué à la page affichée (la pagination reste côté serveur).
  const sortedLogs = useMemo(() => {
    if (!sort) return logs;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const pick = (l: AuditEntry) =>
      sort.key === 'date'
        ? l.created_at
        : sort.key === 'element'
          ? elementLabel(l.table_name)
          : sort.key === 'action'
            ? actionConfig(l.action).label
            : l.user_nom || '';
    return [...logs].sort((a, b) => {
      if (sort.key === 'date') return (new Date(pick(a)).getTime() - new Date(pick(b)).getTime()) * dir;
      const byText = pick(a).localeCompare(pick(b), 'fr');
      // Même élément : par numéro, puisqu'il s'affiche dans la même cellule.
      if (byText !== 0 || sort.key !== 'element') return byText * dir;
      return ((a.record_id ?? -1) - (b.record_id ?? -1)) * dir;
    });
  }, [logs, sort]);

  const handleSort = (key: SortKey) => setSort((s) => toggleSort(s, key));
  const hasValues = (l: AuditEntry) => !!(l.old_values || l.new_values);

  const detailButton = (l: AuditEntry, touch: boolean) =>
    hasValues(l) ? (
      // Bureau : bouton discret (une colonne de boutons encadrés pesait plus que
      // les lignes) ; carte mobile : cible tactile encadrée.
      <Button
        variant={touch ? 'outline' : 'ghost'}
        size={touch ? 'touch' : 'default'}
        onClick={() => setDetail(l)}
        aria-label={`Voir le détail : ${actionConfig(l.action).label.toLowerCase()} ${elementText(l).toLowerCase()}`}
      >
        Voir le détail
      </Button>
    ) : null;

  const rows = detail ? diffRows(detail) : [];

  return (
    <PageShell
      title="Journal d’audit"
      description="Qui a modifié quoi, et quand"
    >
      {/* Filtres */}
      <Card>
        <CardContent inset="standalone">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_auto_auto_auto] lg:justify-start">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-table">Élément</Label>
              <Select
                value={filterTable === '' ? '__all' : filterTable}
                onValueChange={(v) => {
                  setFilterTable(v === '__all' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="audit-table" className="w-full">
                  <SelectValue placeholder="Tous les éléments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Tous les éléments</SelectItem>
                  {ELEMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-date-from">Du</Label>
              <DatePicker
                id="audit-date-from"
                value={filterDateFrom}
                onChange={(v) => {
                  setFilterDateFrom(v);
                  setPage(1);
                }}
                className="w-full lg:w-44"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-date-to">Au</Label>
              <DatePicker
                id="audit-date-to"
                value={filterDateTo}
                onChange={(v) => {
                  setFilterDateTo(v);
                  setPage(1);
                }}
                className="w-full lg:w-44"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters} className="gap-1.5 justify-self-start text-muted-foreground">
                <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardHeader className="max-md:px-0">
          <CardTitle>Activité</CardTitle>
          <CardDescription role="status">
            {loading
              ? 'Chargement…'
              : error
                ? 'Journal indisponible'
                : total > 0
                  ? `${formatNumber(total)} ${total > 1 ? 'événements enregistrés' : 'événement enregistré'}`
                  : 'Aucun événement'}
          </CardDescription>
        </CardHeader>
        <CardContent inset="flush">
          <QueryState
            loading={loading}
            error={error}
            isEmpty={logs.length === 0}
            onRetry={() => void loadLogs()}
            skeleton={<TableSkeleton rows={8} columns={5} />}
            errorTitle="Impossible de charger le journal d’audit"
            emptyIcon={ScrollText}
            emptyTitle={hasFilters ? 'Aucun événement trouvé' : 'Aucun événement enregistré'}
            emptyDescription={
              hasFilters
                ? 'Aucun événement ne correspond à ce type d’élément et à ces dates'
                : 'Les créations, modifications et connexions apparaîtront ici'
            }
            emptyAction={
              hasFilters ? (
                <Button variant="outline" className="gap-1.5" onClick={clearFilters}>
                  <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
                </Button>
              ) : undefined
            }
          >
            <ResponsiveTable
              table={
                <Table aria-label="Activité enregistrée">
                  <TableHeader>
                    <TableRow>
                      <SortableHeader columnKey="date" sort={sort} onSort={handleSort}>
                        Date
                      </SortableHeader>
                      <SortableHeader columnKey="element" sort={sort} onSort={handleSort}>
                        Élément
                      </SortableHeader>
                      <SortableHeader columnKey="action" sort={sort} onSort={handleSort}>
                        Action
                      </SortableHeader>
                      <SortableHeader columnKey="user" sort={sort} onSort={handleSort}>
                        Utilisateur
                      </SortableHeader>
                      <TableHead>
                        <span className="sr-only">Détail</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLogs.map((log) => {
                      const action = actionConfig(log.action);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">{formatDateTime(log.created_at)}</TableCell>
                          <TableCell>
                            <ElementRef entry={log} />
                          </TableCell>
                          <TableCell className="text-sm">{action.label}</TableCell>
                          <TableCell>{log.user_nom || '—'}</TableCell>
                          <TableCell className="w-px whitespace-nowrap text-right">{detailButton(log, false)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              }
              cards={sortedLogs.map((log) => {
                const action = actionConfig(log.action);
                return (
                  <DataCard
                    key={log.id}
                    title={<ElementRef entry={log} />}
                    badge={<span className="text-sm text-muted-foreground">{action.label}</span>}
                    actions={detailButton(log, true)}
                  >
                    <DataCardRow label="Date" value={formatDateTime(log.created_at)} />
                    <DataCardRow label="Utilisateur" value={log.user_nom || '—'} />
                  </DataCard>
                );
              })}
            />
          </QueryState>
        </CardContent>
      </Card>

      {!loading && !error && total > PAGE_SIZE && (
        <Pagination page={page} totalPages={totalPages} total={total} limit={PAGE_SIZE} onPageChange={setPage} />
      )}

      {/* Détail d'une modification : champ par champ, plus de JSON tronqué. */}
      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader className="space-y-1.5 border-b p-4 pr-12 sm:p-6 sm:pr-14">
                <SheetTitle>
                  {actionConfig(detail.action).label} · <ElementRef entry={detail} />
                </SheetTitle>
                <SheetDescription>
                  {formatDateTime(detail.created_at)}
                  {detail.user_nom ? ` par ${detail.user_nom}` : ''}
                </SheetDescription>
              </SheetHeader>
              <div className="p-4 sm:p-6">
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune valeur enregistrée pour cette action</p>
                ) : (
                  <Table aria-label="Valeurs avant et après" className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Champ</TableHead>
                        <TableHead>Avant</TableHead>
                        <TableHead>Après</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.field}>
                          <TableCell className="break-words align-top font-mono text-xs">{r.field}</TableCell>
                          <TableCell className="break-words align-top text-muted-foreground">{r.before}</TableCell>
                          <TableCell className="break-words align-top">{r.after}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
