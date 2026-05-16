import { useEffect, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Receipt, Plus, Trash2 } from 'lucide-react';
import { depenseService } from '@/services/api';
import { toast } from 'sonner';

interface Depense {
  id: number;
  numero_depense: string;
  description: string;
  montant: number;
  categorie_nom: string;
  methode_paiement: string;
  reference: string | null;
  date_depense: string;
  utilisateur_nom: string | null;
}

interface Categorie {
  id: number;
  nom: string;
}

export default function Depenses() {
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    montant: '',
    categorie_id: '',
    description: '',
    methode_paiement: 'espece',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    loadDepenses();
    loadCategories();
  }, []);

  const loadDepenses = async () => {
    try {
      setLoading(true);
      const data = await depenseService.getAll();
      setDepenses(data);
    } catch (error) {
      toast.error('Erreur lors du chargement des dépenses');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await depenseService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleCreate = async () => {
    if (!formData.montant || !formData.categorie_id || !formData.description) {
      toast.error('Veuillez remplir les champs obligatoires');
      return;
    }
    try {
      await depenseService.create({
        montant: parseFloat(formData.montant),
        categorie_id: parseInt(formData.categorie_id),
        description: formData.description,
        methode_paiement: formData.methode_paiement as any,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
      });
      toast.success('Dépense créée avec succès');
      setOpenDialog(false);
      setFormData({
        montant: '',
        categorie_id: '',
        description: '',
        methode_paiement: 'espece',
        reference: '',
        notes: '',
      });
      loadDepenses();
    } catch (error) {
      toast.error('Erreur lors de la création de la dépense');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) return;
    try {
      await depenseService.delete(id);
      toast.success('Dépense supprimée');
      loadDepenses();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const formatXOF = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(montant);
  };

  const filteredDepenses = depenses.filter(d =>
    d.numero_depense.toLowerCase().includes(search.toLowerCase()) ||
    d.description.toLowerCase().includes(search.toLowerCase())
  );

  const totalDepenses = filteredDepenses.reduce((sum, d) => sum + d.montant, 0);

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dépenses</h1>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle Dépense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une dépense</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Montant *</Label>
                <MoneyInput
                  value={formData.montant}
                  onChange={(v) => setFormData({ ...formData, montant: v })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Catégorie *</Label>
                <select
                  className="w-full p-2 border rounded"
                  value={formData.categorie_id}
                  onChange={(e) => setFormData({ ...formData, categorie_id: e.target.value })}
                >
                  <option value="">Sélectionner une catégorie</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Description *</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description de la dépense"
                />
              </div>
              <div>
                <Label>Méthode de paiement</Label>
                <select
                  className="w-full p-2 border rounded"
                  value={formData.methode_paiement}
                  onChange={(e) => setFormData({ ...formData, methode_paiement: e.target.value })}
                >
                  <option value="espece">Espèces</option>
                  <option value="carte">Carte</option>
                  <option value="cheque">Chèque</option>
                  <option value="virement">Virement</option>
                </select>
              </div>
              <div>
                <Label>Référence</Label>
                <Input
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  placeholder="Référence du paiement"
                />
              </div>
              <Button onClick={handleCreate} className="w-full">
                Créer la dépense
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm text-muted-foreground">Total dépenses</p>
              <p className="text-2xl font-bold">{formatXOF(totalDepenses)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div>
            <p className="text-sm text-muted-foreground">Nombre de dépenses</p>
            <p className="text-2xl font-bold">{filteredDepenses.length}</p>
          </div>
        </Card>
        <Card className="p-4">
          <div>
            <p className="text-sm text-muted-foreground">Dépense moyenne</p>
            <p className="text-2xl font-bold">
              {filteredDepenses.length > 0
                ? formatXOF(totalDepenses / filteredDepenses.length)
                : '0 XOF'}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative">
            <Receipt className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numéro</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Chargement...
                </TableCell>
              </TableRow>
            ) : filteredDepenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Aucune dépense trouvée
                </TableCell>
              </TableRow>
            ) : (
              filteredDepenses.map((depense) => (
                <TableRow key={depense.id}>
                  <TableCell className="font-medium">{depense.numero_depense}</TableCell>
                  <TableCell>{depense.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{depense.categorie_nom}</Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(depense.date_depense).toLocaleDateString('fr-FR')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{depense.methode_paiement}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium text-red-600">
                    -{formatXOF(depense.montant)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(depense.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
