import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Download, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { tiersService } from '../services/api';
import type { Tiers } from '../types';
import { useAuth } from '@/lib/AuthContext';
import { iconForPath } from '@/config/routeAccess';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { MoneyInput } from '@/components/ui/money-input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { QueryState } from '@/components/ui/query-state';
import { ToggleChip } from '@/components/ui/choice-chips';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { RequiredMark } from '@/components/ui/required-mark';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TiersRoleBadge, TIERS_ROLE_LABEL } from '@/components/TiersRoleBadge';
import { useExportExcel } from '../hooks/useExportExcel';
import { getErrorMessage } from '@/utils/errors';
import { formatCurrency, formatNumber, toNumber } from '@/utils/format';
import { balanceDirection } from '@/utils/ledger';

type RoleFilter = 'all' | 'client' | 'fournisseur' | 'mixte';
type TiersSortKey = 'code' | 'raison_sociale' | 'solde_client_actuel' | 'solde_fournisseur_actuel';
type ContactFormErrors = Partial<Record<'raison_sociale' | 'email' | 'credit_max' | 'roles', string>>;

/** Plafond maximal accepté par le serveur (`createTiersSchema.credit_max`). */
const CREDIT_MAX_LIMIT = 15_000_000;

const PAGE_SIZE = 20;
/** L'export parcourt la liste filtrée par pages de 100 (maximum du serveur). */
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_PAGES = 30;

const ROLE_FILTERS: ReadonlyArray<{ value: RoleFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'client', label: 'Clients' },
  { value: 'fournisseur', label: 'Fournisseurs' },
  { value: 'mixte', label: 'Clients et fournisseurs' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactRow = Tiers & {
  solde_client_live?: number | string | null;
  solde_fournisseur_live?: number | string | null;
  solde_net?: number | string | null;
};

interface ContactsPage {
  data?: ContactRow[];
  pagination?: { total?: number; totalPages?: number };
}

const BLANK_FORM = {
  raison_sociale: '',
  prenom: '',
  telephone: '',
  email: '',
  adresse: '',
  nif: '',
  rccm: '',
  est_client: true,
  est_fournisseur: false,
  credit_max: '0',
  delai_livraison: 7,
  notes: '',
};

function soldeClientOf(t: ContactRow): number {
  return toNumber(t.solde_client_live ?? t.solde_client_actuel) ?? 0;
}
function soldeFournOf(t: ContactRow): number {
  return toNumber(t.solde_fournisseur_live ?? t.solde_fournisseur_actuel) ?? 0;
}
function soldeNetOf(t: ContactRow): number {
  return toNumber(t.solde_net) ?? soldeClientOf(t) - soldeFournOf(t);
}
function contactName(t: ContactRow): string {
  return `${t.raison_sociale}${t.prenom ? ` ${t.prenom}` : ''}`;
}
function roleText(t: ContactRow): string {
  if (t.est_client && t.est_fournisseur) return TIERS_ROLE_LABEL.mixte;
  if (t.est_fournisseur) return TIERS_ROLE_LABEL.fournisseur;
  return TIERS_ROLE_LABEL.client;
}

/** Solde net en mots : montant sans signe + « Il vous doit » / « Vous lui devez » / « Compte soldé ». */
function NetBalance({ t, align = 'end' }: { t: ContactRow; align?: 'end' | 'inline' }) {
  if (!t.est_client && !t.est_fournisseur) return <span className="text-muted-foreground">—</span>;
  const d = balanceDirection(soldeNetOf(t), 'net');
  if (align === 'inline') {
    return (
      <span>
        <Money value={d.amount} /> <span className="text-muted-foreground">· {d.label}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end">
      <Money value={d.amount} className="font-medium" />
      <span className="text-xs text-muted-foreground">{d.label}</span>
    </span>
  );
}

function RoleTags({ t }: { t: ContactRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {t.est_client && <TiersRoleBadge role="client" />}
      {t.est_fournisseur && <TiersRoleBadge role="fournisseur" />}
    </span>
  );
}

export default function TiersPage() {
  const confirm = useConfirm();
  const { hasRole } = useAuth();
  const canDelete = hasRole('admin');
  const { exportToExcel } = useExportExcel();

  const [tiers, setTiers] = useState<ContactRow[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState<SortState<TiersSortKey> | null>({ key: 'raison_sociale', dir: 'asc' });
  const [exporting, setExporting] = useState(false);
  const requestSeq = useRef(0);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<ContactFormErrors>({});
  const [formData, setFormData] = useState(BLANK_FORM);

  // Recherche débouncée ; revenir en page 1 dans le même rendu (pas de double chargement).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadTiers = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = (await tiersService.getAll({
        search: debouncedSearch,
        role,
        page,
        limit: PAGE_SIZE,
        sort: sort?.key,
        order: sort?.dir,
      })) as ContactsPage | ContactRow[];
      if (seq !== requestSeq.current) return;
      const rows = Array.isArray(res) ? res : res?.data ?? [];
      setTiers(rows);
      setTotal(Array.isArray(res) ? rows.length : res?.pagination?.total ?? rows.length);
      setTotalPages(Array.isArray(res) ? 1 : res?.pagination?.totalPages ?? 1);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // Erreur gardée en état : la page dit « Impossible de charger » + « Réessayer »,
      // jamais une liste vide qui ressemblerait à « 0 contact ».
      setError(err);
      setTiers([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [debouncedSearch, role, page, sort]);

  useEffect(() => {
    void loadTiers();
  }, [loadTiers]);

  const changeRole = (value: RoleFilter) => {
    setRole(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setRole('all');
    setPage(1);
  };

  const handleSort = (key: TiersSortKey) => {
    setSort((s) => toggleSort(s, key));
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all: ContactRow[] = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p++) {
        const res = (await tiersService.getAll({
          search: debouncedSearch,
          role,
          page: p,
          limit: EXPORT_PAGE_SIZE,
          sort: sort?.key,
          order: sort?.dir,
        })) as ContactsPage | ContactRow[];
        const rows = Array.isArray(res) ? res : res?.data ?? [];
        all.push(...rows);
        const pages = Array.isArray(res) ? 1 : res?.pagination?.totalPages ?? 1;
        if (p >= pages || rows.length === 0) break;
      }
      exportToExcel(
        all.map((t) => ({
          code: t.code,
          raison_sociale: t.raison_sociale,
          prenom: t.prenom ?? '',
          type: roleText(t),
          telephone: t.telephone ?? '',
          email: t.email ?? '',
          adresse: t.adresse ?? '',
          solde_client: t.est_client ? Math.round(soldeClientOf(t)) : '',
          solde_fournisseur: t.est_fournisseur ? Math.round(soldeFournOf(t)) : '',
          solde_net: Math.round(soldeNetOf(t)),
        })),
        [
          { key: 'code', label: 'Code' },
          { key: 'raison_sociale', label: 'Nom ou raison sociale' },
          { key: 'prenom', label: 'Prénom ou personne à contacter' },
          { key: 'type', label: 'Type' },
          { key: 'telephone', label: 'Téléphone' },
          { key: 'email', label: 'Adresse e-mail' },
          { key: 'adresse', label: 'Adresse' },
          { key: 'solde_client', label: 'Solde client (FCFA)' },
          { key: 'solde_fournisseur', label: 'Solde fournisseur (FCFA)' },
          { key: 'solde_net', label: 'Solde net (FCFA)' },
        ],
        'contacts'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’exporter les contacts. Réessayez.'));
    } finally {
      setExporting(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(BLANK_FORM);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (t: ContactRow) => {
    setEditing(t);
    setFormErrors({});
    setFormData({
      raison_sociale: t.raison_sociale,
      prenom: t.prenom || '',
      telephone: t.telephone || '',
      email: t.email || '',
      adresse: t.adresse || '',
      nif: t.nif || '',
      rccm: t.rccm || '',
      est_client: t.est_client,
      est_fournisseur: t.est_fournisseur,
      credit_max: String(Math.round(toNumber(t.credit_max) ?? 0)),
      delai_livraison: t.delai_livraison || 7,
      notes: t.notes || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const creditMax = Number.parseInt(formData.credit_max || '0', 10) || 0;
    const nextErrors: ContactFormErrors = {};
    if (!formData.raison_sociale.trim()) {
      nextErrors.raison_sociale = 'Saisissez le nom ou la raison sociale du contact.';
    }
    if (formData.email.trim() && !EMAIL_RE.test(formData.email.trim())) {
      nextErrors.email = 'Saisissez une adresse e-mail valide (ex. : nom@entreprise.ci).';
    }
    if (formData.est_client && (creditMax < 0 || creditMax > CREDIT_MAX_LIMIT)) {
      nextErrors.credit_max = `Le plafond doit être compris entre 0 et ${formatCurrency(CREDIT_MAX_LIMIT)}.`;
    }
    if (!formData.est_client && !formData.est_fournisseur) {
      nextErrors.roles = 'Cochez au moins un type : client ou fournisseur.';
    }

    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstInvalidId = nextErrors.raison_sociale
        ? 'tiers-raison-sociale'
        : nextErrors.email
          ? 'tiers-email'
          : nextErrors.credit_max
            ? 'tiers-credit-max'
            : 'tiers-role-client';
      requestAnimationFrame(() => document.getElementById(firstInvalidId)?.focus());
      return;
    }

    const payload = {
      ...formData,
      raison_sociale: formData.raison_sociale.trim(),
      email: formData.email.trim(),
      credit_max: formData.est_client ? creditMax : 0,
    };

    setSaving(true);
    try {
      if (editing) await tiersService.update(editing.id, payload);
      else await tiersService.create(payload);
      toast.success(editing ? 'Contact modifié' : 'Contact créé');
      setShowForm(false);
      void loadTiers();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer le contact. Réessayez.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: ContactRow) => {
    if (
      !(await confirm({
        title: `Supprimer le contact «\u00A0${contactName(t)}\u00A0» ?`,
        description:
          'Il disparaîtra des listes et des recherches. Ses factures, paiements et acomptes existants sont conservés.',
        confirmLabel: 'Supprimer le contact',
        destructive: true,
      }))
    )
      return;
    try {
      await tiersService.delete(t.id);
      toast.success('Contact supprimé');
      void loadTiers();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer ce contact.'));
    }
  };

  const hasFilters = !!debouncedSearch || role !== 'all';
  const status = loading || error ? '' : total === 0 ? 'Aucun contact' : `${formatNumber(total)} ${total > 1 ? 'contacts' : 'contact'}`;

  const rowActions = (t: ContactRow, touch: boolean) => (
    <>
      <Button
        variant={touch ? 'outline' : 'ghost'}
        size={touch ? 'icon-touch' : 'icon'}
        onClick={() => openEdit(t)}
        aria-label={`Modifier le contact ${contactName(t)}`}
        title="Modifier"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={touch ? 'outline' : 'ghost'}
              size={touch ? 'icon-touch' : 'icon'}
              aria-label={`Plus d’actions pour ${contactName(t)}`}
              title="Plus d’actions"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className={touch ? 'min-h-11 gap-2 text-danger-700 focus:text-danger-800' : 'gap-2 text-danger-700 focus:text-danger-800'}
              onSelect={() => void handleDelete(t)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Supprimer le contact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  const emptyTitle = debouncedSearch
    ? `Aucun contact ne correspond à «\u00A0${debouncedSearch}\u00A0»`
    : role !== 'all'
      ? 'Aucun contact de ce type'
      : 'Aucun contact pour le moment';
  const emptyDescription = debouncedSearch
    ? 'Cherchez par nom, téléphone, NIF ou code'
    : role !== 'all'
      ? 'Aucun contact ne correspond au type choisi'
      : 'Ajoutez vos clients et fournisseurs pour les facturer et suivre leur solde';
  const emptyAction = hasFilters ? (
    <Button variant="outline" onClick={clearFilters} className="gap-1.5">
      <X className="h-4 w-4" aria-hidden="true" /> {debouncedSearch ? 'Effacer la recherche' : 'Afficher tous les contacts'}
    </Button>
  ) : (
    <Button onClick={openCreate} className="gap-1.5">
      <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau contact
    </Button>
  );

  return (
    <PageShell
      title="Contacts"
      description="Vos clients et fournisseurs, leurs coordonnées et leur solde"
      actions={
        <Button variant="outline" size="touch" className="gap-2" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? <Spinner /> : <Download className="h-4 w-4" aria-hidden="true" />}
          Exporter en Excel
        </Button>
      }
      primaryAction={
        <Button size="touch" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau contact
        </Button>
      }
    >
      <p role="status" className="sr-only">
        {status}
      </p>

      {/* Recherche et type — une seule ligne dès 1024 px : les puces suivent la
          recherche au lieu de laisser une demi-carte vide. */}
      <Card>
        <CardContent inset="standalone" className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 sm:max-w-md lg:flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              enterKeyHint="search"
              aria-label="Rechercher un contact"
              placeholder="Nom, téléphone, NIF, code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par type de contact">
            {ROLE_FILTERS.map((f) => (
              <ToggleChip key={f.value} pressed={role === f.value} onPressedChange={() => changeRole(f.value)}>
                {f.label}
              </ToggleChip>
            ))}
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="gap-1.5 self-start text-muted-foreground lg:ms-auto lg:self-auto">
              <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Liste — sous 768 px la carte s'efface : les cartes de ligne portent la surface. */}
      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          <QueryState
            loading={loading}
            error={error}
            isEmpty={tiers.length === 0}
            onRetry={() => void loadTiers()}
            skeleton={<ListSkeleton items={6} />}
            errorTitle="Impossible de charger les contacts"
            emptyIcon={iconForPath('/tiers')}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            emptyAction={emptyAction}
          >
            <ResponsiveTable
              table={
                <Table aria-label="Liste des contacts">
                  <TableHeader>
                    <TableRow>
                      <SortableHeader columnKey="code" sort={sort} onSort={handleSort}>
                        Code
                      </SortableHeader>
                      <SortableHeader columnKey="raison_sociale" sort={sort} onSort={handleSort}>
                        Nom
                      </SortableHeader>
                      <TableHead>Coordonnées</TableHead>
                      <TableHead>Type</TableHead>
                      <SortableHeader columnKey="solde_client_actuel" sort={sort} onSort={handleSort} numeric>
                        Solde client
                      </SortableHeader>
                      <SortableHeader columnKey="solde_fournisseur_actuel" sort={sort} onSort={handleSort} numeric>
                        Solde fournisseur
                      </SortableHeader>
                      <TableHead numeric>Solde net</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          <DocumentCode>{t.code}</DocumentCode>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/tiers/${t.id}`}
                            className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t.raison_sociale}
                          </Link>
                          {t.prenom && <div className="text-xs text-muted-foreground">{t.prenom}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="whitespace-nowrap">{t.telephone || '—'}</div>
                          {t.email && (
                            <div className="max-w-[12rem] truncate text-xs text-muted-foreground" title={t.email}>
                              {t.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <RoleTags t={t} />
                        </TableCell>
                        <TableCell numeric>
                          {t.est_client ? <Money value={soldeClientOf(t)} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell numeric>
                          {t.est_fournisseur ? <Money value={soldeFournOf(t)} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell numeric>
                          <NetBalance t={t} />
                        </TableCell>
                        <TableCell className="w-px whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">{rowActions(t, false)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={tiers.map((t) => (
                <DataCard
                  key={t.id}
                  href={`/tiers/${t.id}`}
                  linkLabel={`Ouvrir la fiche de ${contactName(t)}`}
                  title={contactName(t)}
                  badge={<RoleTags t={t} />}
                  actions={rowActions(t, true)}
                >
                  <DataCardRow label="Code" value={<DocumentCode className="text-xs">{t.code}</DocumentCode>} />
                  <DataCardRow label="Coordonnées" value={t.telephone || t.email || '—'} />
                  <DataCardRow label="Solde net" value={<NetBalance t={t} align="inline" />} numeric />
                </DataCard>
              ))}
            />
          </QueryState>
        </CardContent>
      </Card>

      {!loading && !error && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={PAGE_SIZE}
          announce={false}
          onPageChange={setPage}
        />
      )}

      {/* Création / modification */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle>
            <DialogDescription>Les champs marqués d’un * sont obligatoires</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="tiers-raison-sociale">
                Nom ou raison sociale <RequiredMark />
              </Label>
              <Input
                id="tiers-raison-sociale"
                value={formData.raison_sociale}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, raison_sociale: e.target.value }));
                  setFormErrors((p) => ({ ...p, raison_sociale: undefined }));
                }}
                autoComplete="organization"
                {...fieldErrorProps('tiers-raison-sociale', formErrors.raison_sociale)}
              />
              <FieldError id="tiers-raison-sociale">{formErrors.raison_sociale}</FieldError>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tiers-prenom">Prénom ou personne à contacter</Label>
                <Input
                  id="tiers-prenom"
                  value={formData.prenom}
                  onChange={(e) => setFormData((p) => ({ ...p, prenom: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tiers-telephone">Téléphone</Label>
                <Input
                  id="tiers-telephone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={formData.telephone}
                  onChange={(e) => setFormData((p) => ({ ...p, telephone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tiers-email">Adresse e-mail</Label>
              <Input
                id="tiers-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, email: e.target.value }));
                  setFormErrors((p) => ({ ...p, email: undefined }));
                }}
                {...fieldErrorProps('tiers-email', formErrors.email)}
              />
              <FieldError id="tiers-email">{formErrors.email}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tiers-adresse">Adresse</Label>
              <Input
                id="tiers-adresse"
                value={formData.adresse}
                onChange={(e) => setFormData((p) => ({ ...p, adresse: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tiers-nif">NIF</Label>
                <Input id="tiers-nif" value={formData.nif} onChange={(e) => setFormData((p) => ({ ...p, nif: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tiers-rccm">RCCM</Label>
                <Input id="tiers-rccm" value={formData.rccm} onChange={(e) => setFormData((p) => ({ ...p, rccm: e.target.value }))} />
              </div>
            </div>

            <fieldset className="space-y-2" aria-describedby={formErrors.roles ? 'tiers-roles-error' : undefined}>
              <legend className="text-sm font-medium">
                Type de contact <RequiredMark />
              </legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label htmlFor="tiers-role-client" className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    id="tiers-role-client"
                    checked={formData.est_client}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, est_client: e.target.checked }));
                      setFormErrors((p) => ({ ...p, roles: undefined }));
                    }}
                    aria-invalid={formErrors.roles ? true : undefined}
                  />
                  Client
                </label>
                <label htmlFor="tiers-role-fournisseur" className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    id="tiers-role-fournisseur"
                    checked={formData.est_fournisseur}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, est_fournisseur: e.target.checked }));
                      setFormErrors((p) => ({ ...p, roles: undefined }));
                    }}
                    aria-invalid={formErrors.roles ? true : undefined}
                  />
                  Fournisseur
                </label>
              </div>
              <FieldError id="tiers-roles">{formErrors.roles}</FieldError>
            </fieldset>

            {formData.est_client && (
              <div className="space-y-1.5">
                <Label htmlFor="tiers-credit-max">Plafond de crédit (FCFA)</Label>
                <MoneyInput
                  id="tiers-credit-max"
                  value={formData.credit_max}
                  onChange={(v) => {
                    setFormData((p) => ({ ...p, credit_max: v }));
                    setFormErrors((p) => ({ ...p, credit_max: undefined }));
                  }}
                  placeholder="0"
                  aria-invalid={formErrors.credit_max ? true : undefined}
                  aria-describedby={
                    formErrors.credit_max ? 'tiers-credit-max-help tiers-credit-max-error' : 'tiers-credit-max-help'
                  }
                />
                <p id="tiers-credit-max-help" className="text-xs text-muted-foreground">
                  Laissez 0 pour ne fixer aucune limite. Au-delà du plafond, les bons de livraison et factures à crédit de ce
                  client sont refusés. Maximum : {formatCurrency(CREDIT_MAX_LIMIT)}.
                </p>
                <FieldError id="tiers-credit-max">{formErrors.credit_max}</FieldError>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tiers-notes">Notes</Label>
              <Textarea
                id="tiers-notes"
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer le contact'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
