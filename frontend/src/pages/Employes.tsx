import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Download, Pencil, Plus, Search, UserCheck, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import { employeService } from '../services/api';
import { iconForPath } from '@/config/routeAccess';
import { PageShell } from '@/components/ui/page-shell';
import { MoneyInput } from '@/components/ui/money-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryState } from '@/components/ui/query-state';
import { Spinner } from '@/components/ui/loading';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { ListSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { RequiredMark } from '@/components/ui/required-mark';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { StatusBadge, getStatusOptions } from '@/components/StatusBadge';
import { useExportExcel } from '../hooks/useExportExcel';
import { formatDate, formatNumber, formatPercent, toNumber } from '../utils/format';
import { getErrorMessage } from '@/utils/errors';

interface Employe {
  id: number;
  utilisateur_id: number | null;
  username: string | null;
  matricule: string;
  nom_complet: string;
  poste: string | null;
  departement: string | null;
  date_embauche: string;
  date_naissance: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  salaire_base: string | null;
  commission_taux: string;
  actif: boolean;
  created_at: string;
}

interface CommissionSummary {
  total_ventes: number | string;
  total_montant_ventes: string;
  total_commissions: string;
  commissions_en_attente: number | string;
  commissions_payees: number | string;
}

/**
 * Une commission par facture émise. Les lignes sont créées automatiquement à la
 * facturation (trigger `trg_commission_vente`, migration 100) d'après le taux
 * de l'employé ; celles dont la facture a été annulée sont exclues côté serveur.
 */
interface CommissionLigne {
  id: number;
  facture_id: number;
  numero_facture: string | null;
  date_vente: string;
  montant_vente: string;
  taux_commission: string;
  montant_commission: string;
  statut: string;
}

interface EmployesPage {
  data?: Employe[];
  pagination?: { total?: number; totalPages?: number };
}

/** Suggestions tant qu'aucun employé n'a de département saisi. */
const DEPARTEMENTS = ['Vente', 'Magasin', 'Administration'];
const PAGE_SIZE = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmployeSortKey = 'matricule' | 'nom_complet' | 'departement';
type StatutFilter = 'all' | 'actif' | 'inactif';
type FormErrors = Partial<Record<'matricule' | 'nom_complet' | 'date_embauche' | 'email' | 'commission_taux', string>>;

const STATUT_OPTIONS = getStatusOptions('compte');

const blankForm = () => ({
  matricule: '',
  nom_complet: '',
  poste: '',
  departement: '',
  date_embauche: new Date().toISOString().split('T')[0],
  date_naissance: '',
  telephone: '',
  email: '',
  adresse: '',
  salaire_base: '',
  commission_taux: '0',
  actif: true,
});

const tauxText = (v: string | number | null | undefined) => formatPercent(toNumber(v) ?? 0, 2);

function mergeDepartements(current: string[], rows: Employe[]): string[] {
  const all = new Set(current);
  rows.forEach((r) => {
    const d = r.departement?.trim();
    if (d) all.add(d);
  });
  return all.size === current.length ? current : Array.from(all).sort((a, b) => a.localeCompare(b, 'fr'));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export default function Employes() {
  const confirm = useConfirm();
  const { exportToExcel } = useExportExcel();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const requestSeq = useRef(0);

  // filtres / pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterDepartement, setFilterDepartement] = useState('');
  const [filterStatut, setFilterStatut] = useState<StatutFilter>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState<SortState<EmployeSortKey> | null>({ key: 'nom_complet', dir: 'asc' });
  // Le département est un texte libre : la liste proposée réunit les valeurs
  // usuelles et celles déjà saisies (« Ventes », « Caisse »…), sans quoi le
  // filtre proposait des valeurs absentes des données et ne trouvait rien.
  const [knownDepartements, setKnownDepartements] = useState<string[]>([]);
  const departementOptions = knownDepartements.length > 0 ? knownDepartements : DEPARTEMENTS;

  // formulaire (création + modification)
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employe | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(blankForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // fiche
  const [detail, setDetail] = useState<Employe | null>(null);
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary | null>(null);
  const [commissionLignes, setCommissionLignes] = useState<CommissionLigne[]>([]);
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [commissionsError, setCommissionsError] = useState<unknown>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEmployes = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const actif = filterStatut === 'all' ? undefined : filterStatut === 'actif';
      const res = (await employeService.getAll(
        debouncedSearch || undefined,
        filterDepartement || undefined,
        actif,
        page,
        PAGE_SIZE,
        sort?.key,
        sort?.dir
      )) as EmployesPage | Employe[];
      if (seq !== requestSeq.current) return;
      const rows = Array.isArray(res) ? res : res?.data ?? [];
      setEmployes(rows);
      setKnownDepartements((prev) => mergeDepartements(prev, rows));
      setTotal(Array.isArray(res) ? rows.length : res?.pagination?.total ?? rows.length);
      setTotalPages(Array.isArray(res) ? 1 : res?.pagination?.totalPages ?? 1);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // Erreur gardée en état : « Impossible de charger » + « Réessayer », jamais une liste vide.
      setError(err);
      setEmployes([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [debouncedSearch, filterDepartement, filterStatut, page, sort]);

  useEffect(() => {
    void fetchEmployes();
  }, [fetchEmployes]);

  const hasFilters = !!debouncedSearch || !!filterDepartement || filterStatut !== 'all';
  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFilterDepartement('');
    setFilterStatut('all');
    setPage(1);
  };

  const loadCommissions = useCallback(async (employe: Employe) => {
    setCommissionSummary(null);
    setCommissionLignes([]);
    setCommissionsError(null);
    setCommissionsLoading(true);
    try {
      const dateDebut = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateFin = new Date().toISOString().split('T')[0];
      const [summary, lignes] = await Promise.all([
        employeService.getCommissionSummary(employe.id, dateDebut, dateFin),
        employeService.getCommissions(employe.id, dateDebut, dateFin),
      ]);
      setCommissionSummary((summary?.data ?? summary) as CommissionSummary);
      setCommissionLignes(asArray<CommissionLigne>(lignes?.data ?? lignes));
    } catch (err) {
      setCommissionsError(err);
    } finally {
      setCommissionsLoading(false);
    }
  }, []);

  const openDetail = (employe: Employe) => {
    setDetail(employe);
    void loadCommissions(employe);
  };

  const closeDetail = () => {
    setDetail(null);
    setCommissionSummary(null);
    setCommissionLignes([]);
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(blankForm());
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (e: Employe) => {
    setEditing(e);
    setFormErrors({});
    setFormData({
      matricule: e.matricule,
      nom_complet: e.nom_complet,
      poste: e.poste || '',
      departement: e.departement || '',
      date_embauche: e.date_embauche ? e.date_embauche.split('T')[0] : blankForm().date_embauche,
      date_naissance: e.date_naissance ? e.date_naissance.split('T')[0] : '',
      telephone: e.telephone || '',
      email: e.email || '',
      adresse: e.adresse || '',
      salaire_base: e.salaire_base ? String(Math.round(Number.parseFloat(e.salaire_base))) : '',
      commission_taux: e.commission_taux ?? '0',
      actif: e.actif,
    });
    setShowForm(true);
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const taux = Number.parseFloat(formData.commission_taux || '0');
    const errors: FormErrors = {};
    if (!formData.matricule.trim()) errors.matricule = 'Saisissez le matricule.';
    if (!formData.nom_complet.trim()) errors.nom_complet = 'Saisissez le nom complet.';
    if (!formData.date_embauche) errors.date_embauche = 'Choisissez la date d’embauche.';
    if (formData.email.trim() && !EMAIL_RE.test(formData.email.trim())) {
      errors.email = 'Saisissez une adresse e-mail valide (ex. : nom@entreprise.ci).';
    }
    if (!Number.isFinite(taux) || taux < 0 || taux > 100) errors.commission_taux = 'Saisissez un taux entre 0 et 100 %.';
    setFormErrors(errors);
    const first = (['matricule', 'nom_complet', 'date_embauche', 'email', 'commission_taux'] as const).find((k) => errors[k]);
    if (first) {
      const ids: Record<typeof first, string> = {
        matricule: 'emp-matricule',
        nom_complet: 'emp-nom',
        date_embauche: 'emp-embauche',
        email: 'emp-email',
        commission_taux: 'emp-com',
      };
      requestAnimationFrame(() => document.getElementById(ids[first])?.focus());
      return;
    }

    setSubmitting(true);
    try {
      const { actif, ...base } = formData;
      const payload = {
        ...base,
        matricule: base.matricule.trim(),
        nom_complet: base.nom_complet.trim(),
        email: base.email.trim(),
        salaire_base: base.salaire_base ? Number.parseFloat(base.salaire_base) : undefined,
        commission_taux: taux,
      };
      if (editing) {
        await employeService.update(editing.id, { ...payload, actif });
        toast.success('Employé modifié');
      } else {
        await employeService.create(payload);
        toast.success('Employé créé');
      }
      setShowForm(false);
      void fetchEmployes();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer l’employé. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActif = async (e: Employe) => {
    const next = !e.actif;
    if (
      !(await confirm(
        next
          ? {
              title: `Réactiver l’employé ${e.nom_complet} ?`,
              description: `${e.nom_complet} sera de nouveau inclus dans les prochains cycles de paie.`,
              confirmLabel: 'Réactiver l’employé',
            }
          : {
              title: `Désactiver l’employé ${e.nom_complet} ?`,
              description: `${e.nom_complet} ne sera plus inclus dans les prochains cycles de paie. Son historique est conservé.`,
              confirmLabel: 'Désactiver l’employé',
              destructive: true,
            }
      ))
    )
      return;
    try {
      await employeService.update(e.id, { actif: next });
      toast.success(next ? 'Employé réactivé' : 'Employé désactivé');
      void fetchEmployes();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de modifier le statut de l’employé.'));
    }
  };

  // Fonction de rendu (et non composant imbriqué) : un composant redéfini à
  // chaque rendu serait remonté, et le focus rendu par un dialogue se perdrait.
  const rowActions = (e: Employe, touch: boolean) => {
    const size = touch ? 'icon-touch' : 'icon';
    const variant = touch ? 'outline' : 'ghost';
    return (
      <>
        <Button variant={variant} size={size} onClick={() => openEdit(e)} aria-label={`Modifier l’employé ${e.nom_complet}`} title="Modifier">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant={variant}
          size={size}
          onClick={() => void toggleActif(e)}
          aria-label={e.actif ? `Désactiver l’employé ${e.nom_complet}` : `Réactiver l’employé ${e.nom_complet}`}
          title={e.actif ? 'Désactiver' : 'Réactiver'}
        >
          {e.actif ? <UserX className="h-4 w-4" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </>
    );
  };

  const handleSort = (key: EmployeSortKey) => {
    setSort((s) => toggleSort(s, key));
    setPage(1);
  };

  /** Clic sur la ligne = confort souris ; le nom est le vrai contrôle (clavier). */
  const onRowClick = (ev: MouseEvent<HTMLTableRowElement>, e: Employe) => {
    if ((ev.target as HTMLElement).closest('a,button,input,select,textarea,[role="checkbox"]')) return;
    openDetail(e);
  };

  const status = loading || error ? '' : total === 0 ? 'Aucun employé' : `${formatNumber(total)} ${total > 1 ? 'employés' : 'employé'}`;

  return (
    <PageShell
      title="Employés"
      description="Le personnel, son poste et son taux de commission, repris par la paie"
      actions={
        <Button
          variant="outline"
          size="touch"
          className="gap-2"
          onClick={() =>
            exportToExcel(
              employes.map((e) => ({
                ...e,
                statut: e.actif ? 'Actif' : 'Inactif',
                salaire_base: e.salaire_base ? Math.round(Number.parseFloat(e.salaire_base)) : '',
                commission_taux: toNumber(e.commission_taux) ?? 0,
              })),
              [
                { key: 'matricule', label: 'Matricule' },
                { key: 'nom_complet', label: 'Nom complet' },
                { key: 'poste', label: 'Poste' },
                { key: 'departement', label: 'Département' },
                { key: 'telephone', label: 'Téléphone' },
                { key: 'email', label: 'Adresse e-mail' },
                { key: 'salaire_base', label: 'Salaire de base (FCFA)' },
                { key: 'commission_taux', label: 'Taux de commission (%)' },
                { key: 'statut', label: 'Statut' },
              ],
              'employes'
            )
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Exporter en Excel
        </Button>
      }
      primaryAction={
        <Button size="touch" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel employé
        </Button>
      }
    >
      <p role="status" className="sr-only">
        {status}
      </p>

      {/* Recherche et filtres */}
      <Card>
        <CardContent inset="standalone" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              enterKeyHint="search"
              aria-label="Rechercher un employé"
              placeholder="Nom, matricule, poste…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={filterDepartement === '' ? '__all' : filterDepartement}
            onValueChange={(v) => {
              setFilterDepartement(v === '__all' ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-56" aria-label="Filtrer par département">
              <SelectValue placeholder="Tous les départements" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tous les départements</SelectItem>
              {departementOptions.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterStatut}
            onValueChange={(v) => {
              setFilterStatut(v as StatutFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {STATUT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="gap-1.5 self-start text-muted-foreground sm:self-auto">
              <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          <QueryState
            loading={loading}
            error={error}
            isEmpty={employes.length === 0}
            onRetry={() => void fetchEmployes()}
            skeleton={<ListSkeleton items={6} />}
            errorTitle="Impossible de charger les employés"
            emptyIcon={iconForPath('/employes')}
            emptyTitle={hasFilters ? 'Aucun employé ne correspond à ces filtres' : 'Aucun employé'}
            emptyDescription={
              hasFilters
                ? 'Vérifiez le nom, le matricule ou le département'
                : 'Ajoutez votre personnel pour calculer les commissions et générer la paie'
            }
            emptyAction={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters} className="gap-1.5">
                  <X className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
                </Button>
              ) : (
                <Button onClick={openCreate} className="gap-1.5">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel employé
                </Button>
              )
            }
          >
            <ResponsiveTable
              cards={employes.map((e) => (
                <DataCard
                  key={e.id}
                  onClick={() => openDetail(e)}
                  // Le poste est dans le titre : le nom du bouton le reprend.
                  linkLabel={`Voir la fiche de ${e.nom_complet}${e.poste ? `, ${e.poste}` : ''}`}
                  title={
                    <>
                      {e.nom_complet}
                      {e.poste && <span className="block text-xs font-normal text-muted-foreground">{e.poste}</span>}
                    </>
                  }
                  wrapTitle
                  badge={e.actif ? undefined : <StatusBadge type="compte" statut="inactif" />}
                  actions={rowActions(e, true)}
                >
                  <DataCardRow label="Matricule" value={<DocumentCode className="text-xs">{e.matricule}</DocumentCode>} />
                  <DataCardRow label="Département" value={e.departement || '—'} />
                  <DataCardRow label="Taux de commission" value={tauxText(e.commission_taux)} numeric />
                </DataCard>
              ))}
              table={
                <Table aria-label="Liste des employés">
                  <TableHeader>
                    <TableRow>
                      <SortableHeader columnKey="matricule" sort={sort} onSort={handleSort}>
                        Matricule
                      </SortableHeader>
                      <SortableHeader columnKey="nom_complet" sort={sort} onSort={handleSort}>
                        Nom
                      </SortableHeader>
                      <SortableHeader columnKey="departement" sort={sort} onSort={handleSort}>
                        Département
                      </SortableHeader>
                      <TableHead numeric>Taux de commission</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employes.map((e) => (
                      <TableRow key={e.id} className="cursor-pointer" onClick={(ev) => onRowClick(ev, e)}>
                        <TableCell className="text-xs">
                          <DocumentCode>{e.matricule}</DocumentCode>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => openDetail(e)}
                            className="rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {e.nom_complet}
                          </button>
                          {/* Le poste sous le nom, comme le prénom d'un contact : le
                              département reste la seule colonne d'attribut. */}
                          {e.poste && <div className="text-xs text-muted-foreground">{e.poste}</div>}
                        </TableCell>
                        <TableCell>{e.departement || '—'}</TableCell>
                        <TableCell numeric>{tauxText(e.commission_taux)}</TableCell>
                        {/* Pastille pour l'exception seulement : un employé actif est l'état normal. */}
                        <TableCell>{!e.actif && <StatusBadge type="compte" statut="inactif" />}</TableCell>
                        <TableCell className="w-px whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">
                            {rowActions(e, false)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          </QueryState>
        </CardContent>
      </Card>

      {!loading && !error && total > 0 && (
        <Pagination page={page} totalPages={totalPages} total={total} limit={PAGE_SIZE} announce={false} onPageChange={setPage} />
      )}

      {/* Création / modification */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier l’employé ${editing.nom_complet}` : 'Nouvel employé'}</DialogTitle>
            <DialogDescription>Les champs marqués d’un * sont obligatoires</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="emp-matricule">
                  Matricule <RequiredMark />
                </Label>
                <Input
                  id="emp-matricule"
                  value={formData.matricule}
                  onChange={(e) => {
                    setFormData({ ...formData, matricule: e.target.value });
                    setFormErrors((p) => ({ ...p, matricule: undefined }));
                  }}
                  {...fieldErrorProps('emp-matricule', formErrors.matricule)}
                />
                <FieldError id="emp-matricule">{formErrors.matricule}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-nom">
                  Nom complet <RequiredMark />
                </Label>
                <Input
                  id="emp-nom"
                  autoComplete="name"
                  value={formData.nom_complet}
                  onChange={(e) => {
                    setFormData({ ...formData, nom_complet: e.target.value });
                    setFormErrors((p) => ({ ...p, nom_complet: undefined }));
                  }}
                  {...fieldErrorProps('emp-nom', formErrors.nom_complet)}
                />
                <FieldError id="emp-nom">{formErrors.nom_complet}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-poste">Poste</Label>
                <Input id="emp-poste" value={formData.poste} onChange={(e) => setFormData({ ...formData, poste: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-dept">Département</Label>
                <Input
                  id="emp-dept"
                  list="emp-departements"
                  value={formData.departement}
                  onChange={(e) => setFormData({ ...formData, departement: e.target.value })}
                  placeholder="Ex. : Ventes"
                />
                <datalist id="emp-departements">
                  {departementOptions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-embauche">
                  Date d’embauche <RequiredMark />
                </Label>
                <DatePicker
                  id="emp-embauche"
                  value={formData.date_embauche}
                  onChange={(date_embauche) => {
                    setFormData({ ...formData, date_embauche });
                    setFormErrors((p) => ({ ...p, date_embauche: undefined }));
                  }}
                  required
                  className="w-full"
                  {...fieldErrorProps('emp-embauche', formErrors.date_embauche)}
                />
                <FieldError id="emp-embauche">{formErrors.date_embauche}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-naissance">Date de naissance</Label>
                <DatePicker
                  id="emp-naissance"
                  value={formData.date_naissance}
                  onChange={(date_naissance) => setFormData({ ...formData, date_naissance })}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-tel">Téléphone</Label>
                <Input
                  id="emp-tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-email">Adresse e-mail</Label>
                <Input
                  id="emp-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    setFormErrors((p) => ({ ...p, email: undefined }));
                  }}
                  {...fieldErrorProps('emp-email', formErrors.email)}
                />
                <FieldError id="emp-email">{formErrors.email}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-salaire">Salaire de base</Label>
                <MoneyInput
                  id="emp-salaire"
                  value={formData.salaire_base}
                  onChange={(v) => setFormData({ ...formData, salaire_base: v })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-com">Taux de commission (%)</Label>
                <Input
                  id="emp-com"
                  type="number"
                  inputMode="decimal"
                  value={formData.commission_taux}
                  onChange={(e) => {
                    setFormData({ ...formData, commission_taux: e.target.value });
                    setFormErrors((p) => ({ ...p, commission_taux: undefined }));
                  }}
                  step={0.01}
                  min={0}
                  max={100}
                  {...fieldErrorProps('emp-com', formErrors.commission_taux)}
                />
                <FieldError id="emp-com">{formErrors.commission_taux}</FieldError>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-adresse">Adresse</Label>
              <Textarea
                id="emp-adresse"
                value={formData.adresse}
                onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
              />
            </div>

            {editing && (
              <div className="space-y-1">
                <label htmlFor="emp-actif" className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox
                    id="emp-actif"
                    checked={formData.actif}
                    onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                    aria-describedby="emp-actif-help"
                  />
                  Employé actif
                </label>
                <p id="emp-actif-help" className="text-xs text-muted-foreground">
                  Seuls les employés actifs sont inclus dans les prochains cycles de paie
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting && <Spinner />}
                {submitting ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer l’employé'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Fiche employé */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                  {detail.nom_complet}
                  {!detail.actif && <StatusBadge type="compte" statut="inactif" />}
                </DialogTitle>
                <DialogDescription>Fiche de l’employé et ses commissions de l’année en cours</DialogDescription>
              </DialogHeader>

              <KeyValueList>
                <KeyValue label="Matricule">
                  <DocumentCode>{detail.matricule}</DocumentCode>
                </KeyValue>
                <KeyValue label="Poste">{detail.poste || '—'}</KeyValue>
                <KeyValue label="Département">{detail.departement || '—'}</KeyValue>
                <KeyValue label="Date d’embauche">{formatDate(detail.date_embauche)}</KeyValue>
                {detail.telephone && (
                  <KeyValue label="Téléphone">
                    <a href={`tel:${detail.telephone.replace(/\s+/g, '')}`} className="text-primary underline-offset-4 hover:underline">
                      {detail.telephone}
                    </a>
                  </KeyValue>
                )}
                {detail.email && (
                  <KeyValue label="Adresse e-mail">
                    <a href={`mailto:${detail.email}`} className="break-all text-primary underline-offset-4 hover:underline">
                      {detail.email}
                    </a>
                  </KeyValue>
                )}
                {detail.salaire_base && (
                  <KeyValue label="Salaire de base" numeric>
                    <Money value={detail.salaire_base} />
                  </KeyValue>
                )}
                <KeyValue label="Taux de commission" numeric>
                  {tauxText(detail.commission_taux)}
                </KeyValue>
              </KeyValueList>

              <section aria-labelledby="emp-commissions-title" className="space-y-3">
                <h3 id="emp-commissions-title" className="text-sm font-medium">
                  Commissions de l’année en cours
                </h3>
                <QueryState
                  loading={commissionsLoading}
                  error={commissionsError}
                  onRetry={() => void loadCommissions(detail)}
                  errorTitle="Impossible de charger les commissions"
                  className="py-4"
                  skeleton={<TableSkeleton rows={3} columns={3} />}
                >
                  {commissionSummary && (
                    <div className="space-y-3">
                      <StatGrid>
                        <StatTile
                          label="Ventes"
                          value={toNumber(commissionSummary.total_ventes) ?? 0}
                          hint={<Money value={commissionSummary.total_montant_ventes} />}
                        />
                        <StatTile
                          label="Commissions"
                          value={commissionSummary.total_commissions}
                          format="money"
                          hint={`${formatNumber(toNumber(commissionSummary.commissions_payees) ?? 0)} payées`}
                        />
                      </StatGrid>
                      {commissionLignes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Aucune vente commissionnée cette année. Une commission est enregistrée automatiquement à chaque
                          facture émise par cet employé, si son taux est supérieur à 0.
                        </p>
                      ) : (
                        <Table aria-label="Commissions de l’année" containerClassName="max-h-64 rounded-md border">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Facture</TableHead>
                              <TableHead numeric>Vente</TableHead>
                              <TableHead numeric>Taux</TableHead>
                              <TableHead numeric>Commission</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {commissionLignes.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell className="whitespace-nowrap">{formatDate(c.date_vente)}</TableCell>
                                <TableCell>
                                  {c.numero_facture ? <DocumentCode>{c.numero_facture}</DocumentCode> : '—'}
                                </TableCell>
                                <TableCell numeric>
                                  <Money value={c.montant_vente} />
                                </TableCell>
                                <TableCell numeric>{tauxText(c.taux_commission)}</TableCell>
                                <TableCell numeric>
                                  <Money value={c.montant_commission} />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </QueryState>
              </section>

              <DialogFooter>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const e = detail;
                    closeDetail();
                    openEdit(e);
                  }}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Modifier l’employé
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
