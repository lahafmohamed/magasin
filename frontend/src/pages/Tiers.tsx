import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tiersService } from '../services/api';
import { Tiers } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Plus, Search, Pencil, Trash2, Users, Truck, UserCheck, Eye, ArrowUpDown, ArrowUp, ArrowDown, Download, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { formatFCFA } from '@/utils/format';
import { useExportExcel } from '../hooks/useExportExcel';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/utils/errors';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { ListSkeleton } from '@/components/ui/skeleton';
import { QueryState } from '@/components/ui/query-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type RoleFilter = 'all' | 'client' | 'fournisseur' | 'mixte';
type ContactFormErrors = Partial<Record<'raison_sociale' | 'email' | 'credit_max' | 'roles', string>>;

const ROLE_TABS: { value: RoleFilter; label: string; icon: any }[] = [
  { value: 'all', label: 'Tous', icon: UserCheck },
  { value: 'client', label: 'Clients', icon: Users },
  { value: 'fournisseur', label: 'Fournisseurs', icon: Truck },
  { value: 'mixte', label: 'Mixtes', icon: UserCheck },
];

export default function TiersPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [tiers, setTiers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState('raison_sociale');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const { exportToExcel } = useExportExcel();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tiers | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<ContactFormErrors>({});

  const blankForm = {
    raison_sociale: '', prenom: '', telephone: '', email: '', adresse: '',
    nif: '', rccm: '', est_client: true, est_fournisseur: false,
    credit_max: 0, delai_livraison: 7, notes: '',
  };
  const [formData, setFormData] = useState(blankForm);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, role]);

  useEffect(() => { loadTiers(); }, [debouncedSearch, role, page, sort, order]);

  const loadTiers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tiersService.getAll({ search: debouncedSearch, role, page, limit, sort, order });
      const rows = res?.data ?? res ?? [];
      setTiers(Array.isArray(rows) ? rows : []);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPages(res?.pagination?.totalPages ?? 0);
    } catch (err) {
      // Erreur conservée en état → QueryState propose « Réessayer » au lieu de
      // laisser une liste vide derrière un toast qui disparaît.
      setError(err);
      setTiers([]);
      toast.error('Erreur chargement contacts');
    }
    finally { setLoading(false); }
  };

  const handleSort = (col: string) => {
    if (sort === col) setOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setOrder('asc'); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sort !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return order === 'asc'
      ? <ArrowUp className="h-3 w-3 opacity-100" />
      : <ArrowDown className="h-3 w-3 opacity-100" />;
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(blankForm);
    setFormErrors({});
    setShowForm(true);
  };
  const openEdit = (t: Tiers) => {
    setEditing(t);
    setFormErrors({});
    setFormData({
      raison_sociale: t.raison_sociale, prenom: t.prenom || '', telephone: t.telephone || '',
      email: t.email || '', adresse: t.adresse || '', nif: t.nif || '', rccm: t.rccm || '',
      est_client: t.est_client, est_fournisseur: t.est_fournisseur,
      credit_max: t.credit_max || 0, delai_livraison: t.delai_livraison || 7, notes: t.notes || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: ContactFormErrors = {};
    if (!formData.raison_sociale.trim()) {
      nextErrors.raison_sociale = 'Saisissez la raison sociale ou le nom du contact.';
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      nextErrors.email = 'Saisissez une adresse email valide.';
    }
    if (formData.credit_max < 0 || formData.credit_max > 15000000) {
      nextErrors.credit_max = 'Le plafond doit être compris entre 0 et 15 000 000 FCFA.';
    }
    if (!formData.est_client && !formData.est_fournisseur) {
      nextErrors.roles = 'Sélectionnez au moins un rôle.';
    }

    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstInvalidId =
        nextErrors.raison_sociale ? 'tiers-raison-sociale'
          : nextErrors.email ? 'tiers-email'
            : nextErrors.credit_max ? 'tiers-credit-max'
              : 'tiers-role-client';
      requestAnimationFrame(() => document.getElementById(firstInvalidId)?.focus());
      return;
    }

    setSaving(true);
    try {
      if (editing) await tiersService.update(editing.id, formData);
      else await tiersService.create(formData);
      toast.success(editing ? 'Contact modifié' : 'Contact créé');
      setShowForm(false);
      loadTiers();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur enregistrement'));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: 'Supprimer ce contact ?', confirmLabel: 'Supprimer', destructive: true }))) return;
    try {
      await tiersService.delete(id);
      toast.success('Contact supprimé');
      loadTiers();
    } catch { toast.error('Impossible de supprimer ce contact'); }
  };

  const soldeNetColor = (net: number) =>
    net > 0 ? 'text-danger-600' : net < 0 ? 'text-success-600' : 'text-muted-foreground';

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="h-6 w-6" /> Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} contacts au total</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="outline" onClick={() => exportToExcel(tiers, [
            { key: 'raison_sociale', label: 'Raison sociale' },
            { key: 'telephone', label: 'Téléphone' },
            { key: 'email', label: 'Email' },
            { key: 'adresse', label: 'Adresse' },
            { key: 'solde_client', label: 'Solde client' },
            { key: 'solde_fournisseur', label: 'Solde fournisseur' },
          ], 'tiers')} className="gap-2">
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nouveau contact
          </Button>
        </div>
      </div>

      {/* Role tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 rounded-lg p-1 w-fit">
        {ROLE_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => { setRole(tab.value); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${role === tab.value ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-3.5 w-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Nom, téléphone, NIF, code..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-10 sm:pl-10"
              />
            </div>
          </div>

          {/* Table */}
          <QueryState
            loading={loading}
            error={error}
            isEmpty={tiers.length === 0}
            onRetry={loadTiers}
            skeleton={<ListSkeleton items={6} />}
            emptyIcon={Users}
            emptyTitle="Aucun contact trouvé"
          >
          <ResponsiveTable
            cards={
              (
                tiers.map((t) => {
                  const soldeNet = (t.solde_net ?? (parseFloat(t.solde_client_live ?? 0) - parseFloat(t.solde_fournisseur_live ?? 0)));
                  return (
                    <DataCard
                      key={t.id}
                      onClick={() => navigate(`/tiers/${t.id}`)}
                      title={<span>{t.raison_sociale}</span>}
                      badge={
                        <div className="flex gap-1">
                          {t.est_client && <Badge variant="outline" className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-xs py-0">Client</Badge>}
                          {t.est_fournisseur && <Badge variant="outline" className="text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 text-xs py-0">Fourn.</Badge>}
                        </div>
                      }
                    >
                      <DataCardRow label="Code" value={<span className="font-mono text-xs">{t.code}</span>} />
                      <DataCardRow label="Contact" value={t.telephone || t.email || '—'} />
                      <DataCardRow label="Solde net" value={<span className={`num font-semibold ${soldeNetColor(soldeNet)}`}>{(t.est_client || t.est_fournisseur) ? formatFCFA(soldeNet) : '—'}</span>} />
                      <div className="mt-2 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => navigate(`/tiers/${t.id}`)} aria-label="Voir ce contact">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(t)} aria-label="Modifier ce contact">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Plus d’actions pour ce contact">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="min-h-11 gap-2 text-danger-700 focus:text-danger-700"
                              onSelect={() => void handleDelete(t.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </DataCard>
                  );
                })
              )
            }
            table={
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('code')} aria-sort={sort === 'code' ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <span className="flex items-center gap-1">Code <SortIcon col="code" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('raison_sociale')} aria-sort={sort === 'raison_sociale' ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <span className="flex items-center gap-1">Raison sociale <SortIcon col="raison_sociale" /></span>
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Rôles</TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('solde_client_actuel')} aria-sort={sort === 'solde_client_actuel' ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <span className="flex items-center justify-end gap-1">Solde client <SortIcon col="solde_client_actuel" /></span>
                </TableHead>
                <TableHead className="text-right">Solde fourn.</TableHead>
                <TableHead className="text-right font-semibold">Solde net</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map(t => {
                const soldeNet = (t.solde_net ?? (parseFloat(t.solde_client_live ?? 0) - parseFloat(t.solde_fournisseur_live ?? 0)));
                return (
                  <TableRow key={t.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.code}</TableCell>
                    <TableCell>
                      <div className="font-medium">{t.raison_sociale}</div>
                      {t.prenom && <div className="text-xs text-muted-foreground">{t.prenom}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{t.telephone || '—'}</div>
                      {t.email && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{t.email}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {t.est_client && <Badge variant="outline" className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-xs py-0">Client</Badge>}
                        {t.est_fournisseur && <Badge variant="outline" className="text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 text-xs py-0">Fourn.</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {t.est_client ? formatFCFA(t.solde_client_live ?? t.solde_client_actuel) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {t.est_fournisseur ? formatFCFA(t.solde_fournisseur_live ?? t.solde_fournisseur_actuel) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${soldeNetColor(soldeNet)}`}>
                      {(t.est_client || t.est_fournisseur) ? formatFCFA(soldeNet) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/tiers/${t.id}`)} aria-label="Voir ce contact">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)} aria-label="Modifier ce contact">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Plus d’actions pour ce contact">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="gap-2 text-danger-700 focus:text-danger-700"
                              onSelect={() => void handleDelete(t.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle>
            <DialogDescription className="sr-only">
              {editing
                ? 'Modifiez les informations, les rôles et les coordonnées du contact.'
                : 'Renseignez les informations, les rôles et les coordonnées du nouveau contact.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="tiers-raison-sociale">Raison sociale *</Label>
              <Input
                id="tiers-raison-sociale"
                value={formData.raison_sociale}
                onChange={e => {
                  setFormData(p => ({ ...p, raison_sociale: e.target.value }));
                  setFormErrors(p => ({ ...p, raison_sociale: undefined }));
                }}
                aria-invalid={!!formErrors.raison_sociale}
                aria-describedby={formErrors.raison_sociale ? 'tiers-raison-sociale-error' : undefined}
              />
              {formErrors.raison_sociale && (
                <p id="tiers-raison-sociale-error" role="alert" className="mt-1 text-xs text-danger-700">
                  {formErrors.raison_sociale}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tiers-prenom">Prénom / Contact</Label>
                <Input id="tiers-prenom" value={formData.prenom} onChange={e => setFormData(p => ({ ...p, prenom: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="tiers-telephone">Téléphone</Label>
                <Input id="tiers-telephone" value={formData.telephone} onChange={e => setFormData(p => ({ ...p, telephone: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="tiers-email">Email</Label>
              <Input
                id="tiers-email"
                type="email"
                value={formData.email}
                onChange={e => {
                  setFormData(p => ({ ...p, email: e.target.value }));
                  setFormErrors(p => ({ ...p, email: undefined }));
                }}
                aria-invalid={!!formErrors.email}
                aria-describedby={formErrors.email ? 'tiers-email-error' : undefined}
              />
              {formErrors.email && (
                <p id="tiers-email-error" role="alert" className="mt-1 text-xs text-danger-700">
                  {formErrors.email}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="tiers-adresse">Adresse</Label>
              <Input id="tiers-adresse" value={formData.adresse} onChange={e => setFormData(p => ({ ...p, adresse: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tiers-nif">NIF</Label>
                <Input id="tiers-nif" value={formData.nif} onChange={e => setFormData(p => ({ ...p, nif: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="tiers-rccm">RCCM</Label>
                <Input id="tiers-rccm" value={formData.rccm} onChange={e => setFormData(p => ({ ...p, rccm: e.target.value }))} />
              </div>
            </div>
            {formData.est_client && (
              <div>
                <Label htmlFor="tiers-credit-max">Plafond de crédit (max: 15 000 000 FCFA)</Label>
                <Input
                  id="tiers-credit-max"
                  type="number"
                  min="0"
                  max="15000000"
                  value={formData.credit_max}
                  onChange={e => {
                    setFormData(p => ({ ...p, credit_max: parseFloat(e.target.value) || 0 }));
                    setFormErrors(p => ({ ...p, credit_max: undefined }));
                  }}
                  placeholder="0"
                  aria-invalid={!!formErrors.credit_max}
                  aria-describedby={formErrors.credit_max ? 'tiers-credit-max-error' : 'tiers-credit-max-help'}
                />
                <p id="tiers-credit-max-help" className="text-xs text-muted-foreground mt-1">Maximum autorisé: 15 000 000 FCFA</p>
                {formErrors.credit_max && (
                  <p id="tiers-credit-max-error" role="alert" className="mt-1 text-xs text-danger-700">
                    {formErrors.credit_max}
                  </p>
                )}
              </div>
            )}
            <div>
              <Label className="mb-2 block">Rôles *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="tiers-role-client"
                    type="checkbox"
                    checked={formData.est_client}
                    onChange={e => {
                      setFormData(p => ({ ...p, est_client: e.target.checked }));
                      setFormErrors(p => ({ ...p, roles: undefined }));
                    }}
                    className="rounded"
                    aria-invalid={!!formErrors.roles}
                    aria-describedby={formErrors.roles ? 'tiers-roles-error' : undefined}
                  />
                  <span className="text-sm flex items-center gap-1"><Users className="h-3.5 w-3.5 text-blue-600" /> Client</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.est_fournisseur}
                    onChange={e => {
                      setFormData(p => ({ ...p, est_fournisseur: e.target.checked }));
                      setFormErrors(p => ({ ...p, roles: undefined }));
                    }}
                    className="rounded"
                    aria-invalid={!!formErrors.roles}
                    aria-describedby={formErrors.roles ? 'tiers-roles-error' : undefined}
                  />
                  <span className="text-sm flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-orange-600" /> Fournisseur</span>
                </label>
              </div>
              {formErrors.roles && (
                <p id="tiers-roles-error" role="alert" className="mt-1 text-xs text-danger-700">
                  {formErrors.roles}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="tiers-notes">Notes</Label>
              <Textarea id="tiers-notes" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Enregistrement...' : editing ? 'Modifier' : 'Créer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
