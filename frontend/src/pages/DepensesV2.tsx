import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDateShort } from '../utils/format';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Receipt,
  Plus,
  Trash2,
  Store,
  AlertCircle,
  Link as LinkIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errors';
import { useAuth } from '@/lib/AuthContext';
import { api } from '../services/api';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { PAYMENT_METHODS, formatPaymentMethod } from '../utils/paymentMethod';

interface Magasin {
  id: number;
  code: string;
  nom: string;
}

interface CategorieDepense {
  id: number;
  code: string;
  nom: string;
}

interface Depense {
  id: number;
  numero_depense: string;
  magasin_id: number;
  magasin_nom: string;
  categorie_nom: string;
  montant: number;
  methode_paiement: string;
  date_depense: string;
  description: string;
  beneficiaire_libre: string | null;
  fournisseur_nom: string | null;
  username: string;
  session_caisse_id: number | null;
}

interface SessionCaisse {
  id: number;
  statut: 'ouverte' | 'cloturee';
}

// Palette catégorielle : distingue les méthodes entre elles, sans valeur de
// statut (donc pas les rampes success/warning/danger). Les tokens `chart-*`
// sont déjà réglés par thème dans index.css — aucune variante `dark:` à écrire.
const METHOD_BADGE_CLASSES: Record<string, string> = {
  espece: 'bg-chart-7/15 text-chart-7',
  carte: 'bg-chart-1/15 text-chart-1',
  cheque: 'bg-chart-6/15 text-chart-6',
  virement: 'bg-chart-4/15 text-chart-4',
  mobile_money: 'bg-chart-5/15 text-chart-5',
  orange_money: 'bg-chart-6/15 text-chart-6',
  mtn_money: 'bg-chart-2/15 text-chart-2',
  wave: 'bg-chart-3/15 text-chart-3',
};

// Libellés : formatPaymentMethod est la source partagée ; seul « Espèces »
// porte ici une précision propre au formulaire de dépense.
const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m, formatPaymentMethod(m)])
);

/** Date du jour en heure LOCALE (YYYY-MM-DD) — toISOString() renverrait la date UTC. */
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DepensesV2() {
  useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [selectedMagasin, setSelectedMagasin] = useState<number | null>(null);
  const [sessionActive, setSessionActive] = useState<SessionCaisse | null>(null);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [categories, setCategories] = useState<CategorieDepense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [totalDepenses, setTotalDepenses] = useState(0);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filtres de liste (appliqués côté serveur)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  // Dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    montant: '',
    categorie_id: '',
    description: '',
    methode_paiement: 'espece',
    beneficiaire_libre: '',
    fournisseur_id: '',
    date_depense: todayLocal(),
  });

  // Load magasins and categories on mount
  useEffect(() => {
    loadMagasins();
    loadCategories();
  }, []);

  // Load session and depenses when magasin / page / limit / filtres changent
  useEffect(() => {
    if (selectedMagasin) {
      loadSessionActive(selectedMagasin);
      loadDepenses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMagasin, page, limit, debouncedSearch, filterCategorie, dateDebut, dateFin]);

  // Recherche serveur (n° de dépense, description), débouncée.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadMagasins = async () => {
    try {
      const { data } = await api.get('/caisse/magasins');
      setMagasins(data || []);
      if (data && data.length === 1) {
        setSelectedMagasin(data[0].id);
      } else {
        // More than one magasin — user must pick one; stop spinner
        setLoading(false);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des magasins'));
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data } = await api.get('/depenses/categories/list');
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadSessionActive = async (magasinId: number) => {
    try {
      const { data } = await api.get(`/caisse/session-active?magasin_id=${magasinId}`);
      setSessionActive(data);
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const loadDepenses = async () => {
    if (!selectedMagasin) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        magasin_id: String(selectedMagasin),
        page: String(page),
        limit: String(limit),
      });
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (filterCategorie) params.append('categorie_id', filterCategorie);
      if (dateDebut) params.append('date_debut', dateDebut);
      if (dateFin) params.append('date_fin', dateFin);
      const { data } = await api.get(`/depenses?${params}`);
      const rows: Depense[] = Array.isArray(data) ? data : [];
      setDepenses(rows);
      // Number() défensif : NUMERIC Postgres peut arriver en string selon l'endpoint
      setTotalDepenses(rows.reduce((sum: number, d: Depense) => sum + Number(d.montant || 0), 0));
      const pagination = (data as { pagination?: { total: number; totalPages: number } })
        ?.pagination;
      setTotal(pagination?.total ?? rows.length);
      setTotalPages(pagination?.totalPages ?? 1);
    } catch (err) {
      setError(err);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des dépenses'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedMagasin) {
      toast.error('Sélectionnez un magasin');
      return;
    }

    const montantNum = parseFloat(formData.montant);
    if (!formData.montant || Number.isNaN(montantNum) || montantNum <= 0) {
      toast.error('Montant invalide — il doit être supérieur à 0');
      return;
    }
    if (!formData.categorie_id || !formData.description.trim()) {
      toast.error('Veuillez remplir les champs obligatoires');
      return;
    }

    // Check caisse if paying by cash
    if (formData.methode_paiement === 'espece' && !sessionActive) {
      toast.error(
        <div className="flex flex-col gap-2">
          <span>Caisse fermée — ouvrez la caisse du magasin avant d'enregistrer cette dépense.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/caisse')}
            className="w-fit"
          >
            Ouvrir la caisse →
          </Button>
        </div>,
        { duration: 5000 }
      );
      return;
    }

    setSaving(true);
    try {
      await api.post('/depenses', {
        magasin_id: selectedMagasin,
        montant: montantNum,
        categorie_id: parseInt(formData.categorie_id),
        methode_paiement: formData.methode_paiement,
        description: formData.description.trim(),
        beneficiaire_libre: formData.beneficiaire_libre.trim() || undefined,
        date_depense: formData.date_depense
      });

      toast.success('Dépense créée avec succès');
      setOpenDialog(false);
      resetForm();
      if (page !== 1) {
        // La nouvelle dépense apparaît en tête de liste — revenir page 1
        // (l'effet [page] recharge liste + session)
        setPage(1);
      } else {
        loadDepenses();
        // Refresh session to update balance
        loadSessionActive(selectedMagasin);
      }
    } catch (error: any) {
      const data = error.response?.data;
      if (error.response?.status === 422 && data?.code === 'CAISSE_FERMEE') {
        toast.error(
          <div className="flex flex-col gap-2">
            <span>{getErrorMessage(error, 'Caisse fermée — ouvrez la caisse du magasin.')}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/caisse')}
              className="w-fit"
            >
              Ouvrir la caisse →
            </Button>
          </div>,
          { duration: 5000 }
        );
      } else {
        toast.error(getErrorMessage(error, 'Erreur lors de la création de la dépense'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: 'Supprimer cette dépense ?', description: 'Cette action est irréversible.', confirmLabel: 'Supprimer', destructive: true }))) return;

    try {
      await api.delete(`/depenses/${id}`);
      toast.success('Dépense supprimée');
      if (depenses.length === 1 && page > 1) {
        // Dernière ligne de la page supprimée — reculer d'une page
        // (l'effet [page] recharge liste + session)
        setPage(page - 1);
      } else {
        loadDepenses();
        if (selectedMagasin) {
          loadSessionActive(selectedMagasin);
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la suppression de la dépense'));
    }
  };

  const resetForm = () => {
    setFormData({
      montant: '',
      categorie_id: '',
      description: '',
      methode_paiement: 'espece',
      beneficiaire_libre: '',
      fournisseur_id: '',
      date_depense: todayLocal(),
    });
  };


  const getMethodBadge = (methode: string) => (
    <Badge className={METHOD_BADGE_CLASSES[methode] || 'bg-muted text-muted-foreground'}>
      {METHOD_LABELS[methode] || methode}
    </Badge>
  );

  const isCashPayment = formData.methode_paiement === 'espece';

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <PageHeader
        title="Dépenses"
        icon={Receipt}
        description="Gestion des dépenses par magasin"
        className="mb-6"
        actions={
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedMagasin !== null ? String(selectedMagasin) : ''}
              onValueChange={(v) => {
                setSelectedMagasin(parseInt(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-auto min-w-[220px] max-w-full" aria-label="Magasin">
                <SelectValue placeholder="Sélectionner un magasin" />
              </SelectTrigger>
              <SelectContent>
                {magasins.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.code} - {m.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Caisse status alert */}
      {selectedMagasin && (
        <Card className={`p-4 mb-6 ${sessionActive ? 'bg-success-50 border-success-200' : 'bg-warning-50 border-warning-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {sessionActive ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-success-500" />
                  <span className="text-success-800 font-medium">
                    Caisse ouverte — Les dépenses en espèces seront enregistrées
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-warning-600" />
                  <span className="text-warning-800 font-medium">
                    Caisse fermée — Ouvrez la caisse pour enregistrer des dépenses en espèces
                  </span>
                </>
              )}
            </div>
            {!sessionActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/caisse')}
              >
                Ouvrir la caisse
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* KPI */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-danger-600" />
            <div>
              <p className="text-sm text-muted-foreground">Total dépenses (page)</p>
              <p className="text-2xl font-bold">{formatCurrency(totalDepenses)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div>
            <p className="text-sm text-muted-foreground">Nombre de dépenses</p>
            <p className="text-2xl font-bold">{total}</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex justify-end">
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <Button onClick={() => setOpenDialog(true)} disabled={!selectedMagasin}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle dépense
              </Button>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Créer une dépense</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Cash warning */}
                  {isCashPayment && !sessionActive && (
                    <div className="bg-warning-50 border border-warning-200 p-3 rounded-lg flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-warning-600 mt-0.5" />
                      <div>
                        <p className="text-warning-800 font-medium">Caisse fermée</p>
                        <p className="text-warning-700 text-sm">
                          La caisse de ce magasin n'est pas ouverte.
                          <Button
                            variant="link"
                            className="p-0 h-auto text-warning-800 underline"
                            onClick={() => { setOpenDialog(false); navigate('/caisse'); }}
                          >
                            Ouvrir la caisse →
                          </Button>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Cash info */}
                  {isCashPayment && sessionActive && (
                    <div className="bg-success-50 border border-success-200 p-3 rounded-lg flex items-start gap-2">
                      <LinkIcon className="h-5 w-5 text-success-600 mt-0.5" />
                      <div>
                        <p className="text-success-800 font-medium">Cette dépense sera liée à la caisse</p>
                        <p className="text-success-700 text-sm">
                          Elle sera déduite du solde de la caisse ouverte du magasin.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="dep-date">Date *</Label>
                      <DatePicker
                        id="dep-date"
                        value={formData.date_depense}
                        onChange={(date_depense) => setFormData({ ...formData, date_depense })}
                        required
                        aria-label="Date de dépense"
                      />
                    </div>
                    <div>
                      <Label htmlFor="dep-montant">Montant *</Label>
                      <MoneyInput
                        id="dep-montant"
                        value={formData.montant}
                        onChange={(v) => setFormData({...formData, montant: v})}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="dep-categorie">Catégorie *</Label>
                    <Select
                      value={formData.categorie_id}
                      onValueChange={(v) => setFormData({ ...formData, categorie_id: v })}
                    >
                      <SelectTrigger id="dep-categorie" aria-label="Catégorie">
                        <SelectValue placeholder="Sélectionner une catégorie" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            {cat.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="dep-methode">Mode de paiement *</Label>
                    <Select
                      value={formData.methode_paiement}
                      onValueChange={(v) => setFormData({ ...formData, methode_paiement: v })}
                    >
                      <SelectTrigger id="dep-methode" aria-label="Mode de paiement">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m === 'espece' ? 'Espèces (déduites de la caisse)' : formatPaymentMethod(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="dep-beneficiaire">Bénéficiaire</Label>
                    <Input
                      id="dep-beneficiaire"
                      value={formData.beneficiaire_libre}
                      onChange={(e) => setFormData({...formData, beneficiaire_libre: e.target.value})}
                      placeholder="Nom du bénéficiaire (optionnel)"
                      maxLength={255}
                    />
                  </div>

                  <div>
                    <Label htmlFor="dep-description">Description *</Label>
                    <Input
                      id="dep-description"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Description de la dépense"
                      maxLength={2000}
                    />
                  </div>

                  <Button
                    onClick={handleCreate}
                    className="w-full"
                    disabled={saving || (isCashPayment && !sessionActive)}
                  >
                    {saving ? (
                      <>
                        <Spinner className="mr-2" />
                        Création…
                      </>
                    ) : (
                      'Créer la dépense'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </Card>
      </div>

      {/* Filtres de liste */}
      {selectedMagasin && (
        <Card className="p-4 mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[220px] space-y-1.5">
              <Label htmlFor="depense-search">Rechercher</Label>
              <Input
                id="depense-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="N° de dépense ou description…"
              />
            </div>
            <div className="w-full sm:w-56 space-y-1.5">
              <Label htmlFor="depense-filtre-categorie">Catégorie</Label>
              <Select
                value={filterCategorie === '' ? '__all' : filterCategorie}
                onValueChange={(v) => {
                  setFilterCategorie(v === '__all' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="depense-filtre-categorie">
                  <SelectValue placeholder="Toutes les catégories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Toutes les catégories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-44 space-y-1.5">
              <Label htmlFor="depense-date-debut">Du</Label>
              <Input
                id="depense-date-debut"
                type="date"
                value={dateDebut}
                onChange={(e) => { setDateDebut(e.target.value); setPage(1); }}
              />
            </div>
            <div className="w-full sm:w-44 space-y-1.5">
              <Label htmlFor="depense-date-fin">Au</Label>
              <Input
                id="depense-date-fin"
                type="date"
                value={dateFin}
                onChange={(e) => { setDateFin(e.target.value); setPage(1); }}
              />
            </div>
            {(search || filterCategorie || dateDebut || dateFin) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setFilterCategorie('');
                  setDateDebut('');
                  setDateFin('');
                  setPage(1);
                }}
              >
                Effacer les filtres
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Depenses list */}
      <Card>
        <QueryState
          loading={loading}
          error={error}
          isEmpty={depenses.length === 0}
          onRetry={loadDepenses}
          skeleton={<TableSkeleton rows={8} columns={9} />}
          emptyIcon={Receipt}
          emptyTitle={
            !selectedMagasin
              ? 'Sélectionnez un magasin'
              : search || filterCategorie || dateDebut || dateFin
              ? 'Aucune dépense ne correspond aux filtres'
              : 'Aucune dépense trouvée'
          }
          emptyDescription={
            !selectedMagasin
              ? 'Choisissez un magasin pour afficher ses dépenses.'
              : search || filterCategorie || dateDebut || dateFin
              ? 'Élargissez la période ou effacez les filtres.'
              : undefined
          }
        >
          <ResponsiveTable
            table={
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Bénéficiaire</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-center">Caisse</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depenses.map((depense) => (
                      <TableRow key={depense.id}>
                        <TableCell className="font-medium">{depense.numero_depense}</TableCell>
                        <TableCell>{formatDateShort(depense.date_depense)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{depense.categorie_nom}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {depense.fournisseur_nom || depense.beneficiaire_libre || '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {depense.description}
                        </TableCell>
                        <TableCell>{getMethodBadge(depense.methode_paiement)}</TableCell>
                        <TableCell className="text-right font-medium text-danger-600">
                          -{formatCurrency(depense.montant)}
                        </TableCell>
                        <TableCell className="text-center">
                          {depense.session_caisse_id ? (
                            <LinkIcon className="h-4 w-4 text-success-600 mx-auto" aria-label="Liée à la caisse" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Supprimer la dépense"
                            onClick={() => handleDelete(depense.id)}
                          >
                            <Trash2 className="h-4 w-4 text-danger-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            cards={depenses.map((depense) => (
              <DataCard
                key={depense.id}
                title={depense.numero_depense}
                badge={getMethodBadge(depense.methode_paiement)}
              >
                <DataCardRow label="Date" value={formatDateShort(depense.date_depense)} />
                <DataCardRow label="Catégorie" value={depense.categorie_nom} />
                <DataCardRow
                  label="Bénéficiaire"
                  value={depense.fournisseur_nom || depense.beneficiaire_libre || '-'}
                />
                <DataCardRow label="Description" value={depense.description} />
                <DataCardRow
                  label="Montant"
                  value={
                    <span className="font-medium text-danger-600">
                      -{formatCurrency(depense.montant)}
                    </span>
                  }
                />
                <DataCardRow
                  label="Caisse"
                  value={depense.session_caisse_id ? 'Liée à la caisse' : '-'}
                />
                <DataCardRow
                  label="Actions"
                  value={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Supprimer la dépense"
                      onClick={() => handleDelete(depense.id)}
                    >
                      <Trash2 className="h-4 w-4 text-danger-600" />
                    </Button>
                  }
                />
              </DataCard>
            ))}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
          />
        </QueryState>
      </Card>
    </div>
  );
}
