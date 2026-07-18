import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDateShort } from '../utils/format';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Link as LinkIcon,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { api } from '../services/api';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';

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

const METHOD_BADGE_CLASSES: Record<string, string> = {
  // Palette catégorielle (pas de vert : réservé aux statuts/succès)
  espece: 'bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-200',
  carte: 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200',
  cheque: 'bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-200',
  virement: 'bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-200',
  mobile_money: 'bg-pink-100 dark:bg-pink-500/20 text-pink-800 dark:text-pink-200',
};

const METHOD_LABELS: Record<string, string> = {
  espece: 'Espèces',
  carte: 'Carte',
  cheque: 'Chèque',
  virement: 'Virement',
  mobile_money: 'Mobile Money',
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
    date_depense: new Date().toISOString().split('T')[0],
  });

  // Load magasins and categories on mount
  useEffect(() => {
    loadMagasins();
    loadCategories();
  }, []);

  // Load session and depenses when magasin / page / limit change
  useEffect(() => {
    if (selectedMagasin) {
      loadSessionActive(selectedMagasin);
      loadDepenses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMagasin, page, limit]);

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
    } catch (error) {
      toast.error('Erreur lors du chargement des magasins');
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
      const { data } = await api.get(
        `/depenses?magasin_id=${selectedMagasin}&page=${page}&limit=${limit}`
      );
      const rows: Depense[] = Array.isArray(data) ? data : [];
      setDepenses(rows);
      setTotalDepenses(rows.reduce((sum: number, d: Depense) => sum + d.montant, 0));
      const pagination = (data as { pagination?: { total: number; totalPages: number } })
        ?.pagination;
      setTotal(pagination?.total ?? rows.length);
      setTotalPages(pagination?.totalPages ?? 1);
    } catch (err) {
      setError(err);
      toast.error('Erreur lors du chargement des dépenses');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedMagasin) {
      toast.error('Sélectionnez un magasin');
      return;
    }

    if (!formData.montant || !formData.categorie_id || !formData.description) {
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
        montant: parseFloat(formData.montant),
        categorie_id: parseInt(formData.categorie_id),
        methode_paiement: formData.methode_paiement,
        description: formData.description,
        beneficiaire_libre: formData.beneficiaire_libre || undefined,
        date_depense: formData.date_depense
      });

      toast.success('Dépense créée avec succès');
      setOpenDialog(false);
      resetForm();
      loadDepenses();
      // Refresh session to update balance
      loadSessionActive(selectedMagasin);
    } catch (error: any) {
      const data = error.response?.data;
      if (error.response?.status === 422 && data?.code === 'CAISSE_FERMEE') {
        toast.error(
          <div className="flex flex-col gap-2">
            <span>{data.error}</span>
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
        toast.error(data?.error || 'Erreur lors de la création');
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
      loadDepenses();
      if (selectedMagasin) {
        loadSessionActive(selectedMagasin);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression');
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
      date_depense: new Date().toISOString().split('T')[0],
    });
  };


  const getMethodBadge = (methode: string) => (
    <Badge className={METHOD_BADGE_CLASSES[methode] || 'bg-gray-100 dark:bg-muted'}>
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
              <SelectTrigger className="w-[220px]" aria-label="Magasin">
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
        <Card className={`p-4 mb-6 ${sessionActive ? 'bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/30' : 'bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {sessionActive ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-success-500" />
                  <span className="text-success-800 dark:text-success-200 font-medium">
                    Caisse ouverte — Les dépenses en espèces seront enregistrées
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-warning-600 dark:text-warning-300" />
                  <span className="text-warning-800 dark:text-warning-200 font-medium">
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
            <Receipt className="h-5 w-5 text-danger-600 dark:text-danger-300" />
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
                Nouvelle Dépense
              </Button>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Créer une dépense</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Cash warning */}
                  {isCashPayment && !sessionActive && (
                    <div className="bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 p-3 rounded-lg flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-warning-600 dark:text-warning-300 mt-0.5" />
                      <div>
                        <p className="text-warning-800 dark:text-warning-200 font-medium">Caisse fermée</p>
                        <p className="text-warning-700 dark:text-warning-300 text-sm">
                          La caisse de ce magasin n'est pas ouverte.
                          <Button
                            variant="link"
                            className="p-0 h-auto text-warning-800 dark:text-warning-200 underline"
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
                    <div className="bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 p-3 rounded-lg flex items-start gap-2">
                      <LinkIcon className="h-5 w-5 text-success-600 dark:text-success-300 mt-0.5" />
                      <div>
                        <p className="text-success-800 dark:text-success-200 font-medium">Cette dépense sera liée à la caisse</p>
                        <p className="text-success-700 dark:text-success-300 text-sm">
                          Elle décrémentera le solde de la caisse ouverte du magasin.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={formData.date_depense}
                        onChange={(e) => setFormData({...formData, date_depense: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Montant *</Label>
                      <MoneyInput
                        value={formData.montant}
                        onChange={(v) => setFormData({...formData, montant: v})}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Catégorie *</Label>
                    <Select
                      value={formData.categorie_id}
                      onValueChange={(v) => setFormData({ ...formData, categorie_id: v })}
                    >
                      <SelectTrigger aria-label="Catégorie">
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
                    <Label>Mode de paiement *</Label>
                    <Select
                      value={formData.methode_paiement}
                      onValueChange={(v) => setFormData({ ...formData, methode_paiement: v })}
                    >
                      <SelectTrigger aria-label="Mode de paiement">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="espece">Espèces (décrémente la caisse)</SelectItem>
                        <SelectItem value="carte">Carte bancaire</SelectItem>
                        <SelectItem value="cheque">Chèque</SelectItem>
                        <SelectItem value="virement">Virement</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Bénéficiaire</Label>
                    <Input
                      value={formData.beneficiaire_libre}
                      onChange={(e) => setFormData({...formData, beneficiaire_libre: e.target.value})}
                      placeholder="Nom du bénéficiaire (optionnel)"
                    />
                  </div>

                  <div>
                    <Label>Description *</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Description de la dépense"
                    />
                  </div>

                  <Button
                    onClick={handleCreate}
                    className="w-full"
                    disabled={saving || (isCashPayment && !sessionActive)}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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

      {/* Depenses list */}
      <Card>
        <QueryState
          loading={loading}
          error={error}
          isEmpty={depenses.length === 0}
          onRetry={loadDepenses}
          skeleton={<TableSkeleton rows={8} columns={9} />}
          emptyIcon={Receipt}
          emptyTitle={selectedMagasin ? 'Aucune dépense trouvée' : 'Sélectionnez un magasin'}
          emptyDescription={selectedMagasin ? undefined : 'Choisissez un magasin pour afficher ses dépenses.'}
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
                        <TableCell className="text-right font-medium text-danger-600 dark:text-danger-300">
                          -{formatCurrency(depense.montant)}
                        </TableCell>
                        <TableCell className="text-center">
                          {depense.session_caisse_id ? (
                            <LinkIcon className="h-4 w-4 text-success-600 dark:text-success-300 mx-auto" aria-label="Liée à la caisse" />
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
                            <Trash2 className="h-4 w-4 text-danger-600 dark:text-danger-300" />
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
                    <span className="font-medium text-danger-600 dark:text-danger-300">
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
                      <Trash2 className="h-4 w-4 text-danger-600 dark:text-danger-300" />
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
