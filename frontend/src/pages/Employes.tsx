import { useState, useEffect, useCallback } from 'react';
import { Plus, Users, Search, Download, Eye, Pencil, Power } from 'lucide-react';
import { employeService } from '../services/api';
import { toast } from 'sonner';
import { MoneyInput } from '../components/ui/money-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryState } from '@/components/ui/query-state';
import { Spinner } from '@/components/ui/loading';
import { SortableHeader, toggleSort, SortState } from '@/components/ui/sortable-header';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useExportExcel } from '../hooks/useExportExcel';
import { formatFCFA } from '../utils/format';
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
  total_ventes: number;
  total_montant_ventes: string;
  total_commissions: string;
  commissions_en_attente: number;
  commissions_payees: number;
}

const DEPARTEMENTS = ['Vente', 'Magasin', 'Administration'];

type EmployeSortKey = 'matricule' | 'nom_complet' | 'departement';

const blankForm = {
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
};

export default function Employes() {
  const confirm = useConfirm();
  const { exportToExcel } = useExportExcel();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // filters / paging
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterDepartement, setFilterDepartement] = useState('');
  const [filterActif, setFilterActif] = useState<'all' | 'true' | 'false'>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState<SortState<EmployeSortKey> | null>({ key: 'nom_complet', dir: 'asc' });
  const handleSort = (key: EmployeSortKey) => setSort((s) => toggleSort(s, key));

  // form (create + edit)
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employe | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(blankForm);

  // detail
  const [detail, setDetail] = useState<Employe | null>(null);
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, filterDepartement, filterActif]);

  const fetchEmployes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const actif = filterActif === 'all' ? undefined : filterActif === 'true';
      const res = await employeService.getAll(
        debouncedSearch || undefined,
        filterDepartement || undefined,
        actif,
        page,
        limit,
        sort?.key,
        sort?.dir,
      );
      const rows = res?.data ?? res ?? [];
      setEmployes(Array.isArray(rows) ? rows : []);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPages(res?.pagination?.totalPages ?? 0);
    } catch (err) {
      // Erreur conservée en état → QueryState propose « Réessayer ».
      setError(err);
      setEmployes([]);
      toast.error('Erreur chargement employés');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterDepartement, filterActif, page, limit, sort]);

  useEffect(() => { fetchEmployes(); }, [fetchEmployes]);

  const openDetail = async (employe: Employe) => {
    setDetail(employe);
    setCommissionSummary(null);
    try {
      const dateDebut = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateFin = new Date().toISOString().split('T')[0];
      const data = await employeService.getCommissionSummary(employe.id, dateDebut, dateFin);
      setCommissionSummary(data.data || data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur chargement commissions'));
    }
  };

  const openCreate = () => { setEditing(null); setFormData(blankForm); setShowForm(true); };
  const openEdit = (e: Employe) => {
    setEditing(e);
    setFormData({
      matricule: e.matricule,
      nom_complet: e.nom_complet,
      poste: e.poste || '',
      departement: e.departement || '',
      date_embauche: e.date_embauche ? e.date_embauche.split('T')[0] : blankForm.date_embauche,
      date_naissance: e.date_naissance ? e.date_naissance.split('T')[0] : '',
      telephone: e.telephone || '',
      email: e.email || '',
      adresse: e.adresse || '',
      salaire_base: e.salaire_base ? String(Math.round(parseFloat(e.salaire_base))) : '',
      commission_taux: e.commission_taux ?? '0',
      actif: e.actif,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { actif, ...base } = formData;
      const payload = {
        ...base,
        salaire_base: base.salaire_base ? parseFloat(base.salaire_base) : undefined,
        commission_taux: parseFloat(base.commission_taux),
      };
      if (editing) {
        await employeService.update(editing.id, { ...payload, actif });
        toast.success('Employé modifié');
      } else {
        await employeService.create(payload);
        toast.success('Employé créé');
      }
      setShowForm(false);
      fetchEmployes();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur enregistrement employé'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActif = async (e: Employe) => {
    const next = !e.actif;
    if (!(await confirm({
      title: next ? 'Réactiver cet employé ?' : 'Désactiver cet employé ?',
      description: `${e.nom_complet} sera marqué ${next ? 'actif' : 'inactif'}.`,
      confirmLabel: next ? 'Réactiver' : 'Désactiver',
      destructive: !next,
    }))) return;
    try {
      await employeService.update(e.id, { actif: next });
      toast.success(next ? 'Employé réactivé' : 'Employé désactivé');
      fetchEmployes();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Action impossible'));
    }
  };

  const StatutBadge = ({ actif }: { actif: boolean }) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      actif ? 'bg-success-100 text-success-700' : 'bg-muted text-muted-foreground'
    }`}>
      {actif ? 'Actif' : 'Inactif'}
    </span>
  );

  const RowActions = ({ e, size = 'sm' }: { e: Employe; size?: 'sm' | 'xs' }) => {
    const cls = size === 'sm' ? 'h-8 w-8' : 'h-7 w-7';
    const icon = size === 'sm' ? 'h-4 w-4' : 'h-3.5 w-3.5';
    return (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" className={cls} onClick={() => openDetail(e)} aria-label="Voir cet employé">
          <Eye className={icon} />
        </Button>
        <Button variant="ghost" size="icon" className={cls} onClick={() => openEdit(e)} aria-label="Modifier cet employé">
          <Pencil className={icon} />
        </Button>
        <Button variant="ghost" size="icon" className={cls} onClick={() => toggleActif(e)} aria-label={e.actif ? 'Désactiver' : 'Réactiver'}>
          <Power className={`${icon} ${e.actif ? 'text-success-600' : 'text-muted-foreground'}`} />
        </Button>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Employés</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} employé{total > 1 ? 's' : ''} au total</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="outline" className="gap-2" onClick={() => exportToExcel(employes, [
            { key: 'matricule', label: 'Matricule' },
            { key: 'nom_complet', label: 'Nom complet' },
            { key: 'poste', label: 'Poste' },
            { key: 'departement', label: 'Département' },
            { key: 'telephone', label: 'Téléphone' },
            { key: 'email', label: 'Email' },
            { key: 'salaire_base', label: 'Salaire de base' },
            { key: 'commission_taux', label: 'Taux commission' },
          ], 'employes')}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nouvel employé
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Filters */}
          <div className="p-4 border-b flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Nom, matricule, poste..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterDepartement === '' ? '__all' : filterDepartement} onValueChange={(v) => setFilterDepartement(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Filtrer par département">
                <SelectValue placeholder="Tous les départements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Tous les départements</SelectItem>
                {DEPARTEMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterActif} onValueChange={(v) => setFilterActif(v as any)}>
              <SelectTrigger className="h-9 w-full sm:w-36" aria-label="Filtrer par statut">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="true">Actifs</SelectItem>
                <SelectItem value="false">Inactifs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <QueryState
            loading={loading}
            error={error}
            isEmpty={employes.length === 0}
            onRetry={fetchEmployes}
            skeleton={<ListSkeleton items={6} />}
            emptyIcon={Users}
            emptyTitle="Aucun employé"
          >
          <ResponsiveTable
            cards={
              (
                employes.map((e) => (
                  <DataCard
                    key={e.id}
                    onClick={() => openDetail(e)}
                    title={<span>{e.nom_complet}</span>}
                    badge={<StatutBadge actif={e.actif} />}
                  >
                    <DataCardRow label="Matricule" value={<span className="font-mono text-xs">{e.matricule}</span>} />
                    <DataCardRow label="Poste" value={e.poste || '—'} />
                    <DataCardRow label="Département" value={e.departement || '—'} />
                    <DataCardRow label="Commission" value={<span className="num">{e.commission_taux}%</span>} />
                    <div className="mt-2" onClick={(ev) => ev.stopPropagation()}>
                      <RowActions e={e} />
                    </div>
                  </DataCard>
                ))
              )
            }
            table={
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader columnKey="matricule" sort={sort} onSort={handleSort}>Matricule</SortableHeader>
                      <SortableHeader columnKey="nom_complet" sort={sort} onSort={handleSort}>Nom</SortableHeader>
                      <TableHead>Poste</TableHead>
                      <SortableHeader columnKey="departement" sort={sort} onSort={handleSort}>Dépt.</SortableHeader>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employes.map((e) => (
                      <TableRow key={e.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(e)}>
                        <TableCell className="font-mono text-xs num">{e.matricule}</TableCell>
                        <TableCell className="font-medium">{e.nom_complet}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.poste || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs py-0">{e.departement || '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs num">{e.commission_taux}%</TableCell>
                        <TableCell><StatutBadge actif={e.actif} /></TableCell>
                        <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                          <RowActions e={e} size="xs" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
          />
          </QueryState>

          {totalPages > 1 && (
            <div className="p-4 border-t">
              <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l’employé' : 'Nouvel employé'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp-matricule">Matricule *</Label>
                <Input id="emp-matricule" value={formData.matricule} onChange={(e) => setFormData({ ...formData, matricule: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-nom">Nom complet *</Label>
                <Input id="emp-nom" value={formData.nom_complet} onChange={(e) => setFormData({ ...formData, nom_complet: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-poste">Poste</Label>
                <Input id="emp-poste" value={formData.poste} onChange={(e) => setFormData({ ...formData, poste: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-dept">Département</Label>
                <Select
                  value={formData.departement === '' ? '__none' : formData.departement}
                  onValueChange={(v) => setFormData({ ...formData, departement: v === '__none' ? '' : v })}
                >
                  <SelectTrigger id="emp-dept" className="h-9">
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sélectionner…</SelectItem>
                    {DEPARTEMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-embauche">Date d'embauche *</Label>
                <DatePicker id="emp-embauche" value={formData.date_embauche} onChange={(date_embauche) => setFormData({ ...formData, date_embauche })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-naissance">Date de naissance</Label>
                <DatePicker id="emp-naissance" value={formData.date_naissance} onChange={(date_naissance) => setFormData({ ...formData, date_naissance })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-tel">Téléphone</Label>
                <Input id="emp-tel" value={formData.telephone} onChange={(e) => setFormData({ ...formData, telephone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-email">Email</Label>
                <Input id="emp-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-salaire">Salaire de base</Label>
                <MoneyInput id="emp-salaire" value={formData.salaire_base} onChange={(v) => setFormData({ ...formData, salaire_base: v })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-com">Taux commission (%)</Label>
                <Input id="emp-com" type="number" value={formData.commission_taux} onChange={(e) => setFormData({ ...formData, commission_taux: e.target.value })} step={0.01} min={0} max={100} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-adresse">Adresse</Label>
              <Textarea id="emp-adresse" value={formData.adresse} onChange={(e) => setFormData({ ...formData, adresse: e.target.value })} />
            </div>

            {editing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.actif} onChange={(e) => setFormData({ ...formData, actif: e.target.checked })} className="rounded" />
                <span className="text-sm">Employé actif</span>
              </label>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (<><Spinner /> Enregistrement…</>) : editing ? 'Modifier' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setCommissionSummary(null); } }}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.nom_complet} <StatutBadge actif={detail.actif} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1 text-sm">
                <p>Matricule: <strong>{detail.matricule}</strong></p>
                <p>Poste: <strong>{detail.poste || '—'}</strong></p>
                <p>Département: <strong>{detail.departement || '—'}</strong></p>
                <p>Date d'embauche: <strong>{new Date(detail.date_embauche).toLocaleDateString('fr-FR')}</strong></p>
                {detail.telephone && <p>Téléphone: <strong>{detail.telephone}</strong></p>}
                {detail.email && <p>Email: <strong>{detail.email}</strong></p>}
                {detail.salaire_base && <p>Salaire de base: <strong className="num">{formatFCFA(detail.salaire_base)}</strong></p>}
                <p>Taux commission: <strong className="num">{detail.commission_taux}%</strong></p>
              </div>

              {commissionSummary && (
                <div className="mt-2">
                  <h3 className="font-semibold mb-2 text-sm">Commissions (année en cours)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-md border bg-muted/30 p-4">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Total ventes</div>
                      <div className="text-xl font-semibold num">{commissionSummary.total_ventes}</div>
                      <div className="text-xs text-muted-foreground num">{formatFCFA(commissionSummary.total_montant_ventes)}</div>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-4">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Total commissions</div>
                      <div className="text-xl font-semibold text-success-700 num">{formatFCFA(commissionSummary.total_commissions)}</div>
                      <div className="text-xs text-muted-foreground num">{commissionSummary.commissions_payees} payées</div>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { const e = detail; setDetail(null); setCommissionSummary(null); if (e) openEdit(e); }}>
                  <Pencil className="mr-1 h-4 w-4" /> Modifier
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
