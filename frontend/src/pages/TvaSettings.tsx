import { useState, useEffect } from 'react';
import { Loader2, Plus, Percent, Trash2 } from 'lucide-react';
import { tvaService, TauxTva } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function TvaSettings() {
  const [rates, setRates] = useState<TauxTva[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TauxTva | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    taux: '',
    description: '',
    actif: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const data = await tvaService.getAll();
      setRates(data);
    } catch {
      toast.error('Erreur lors du chargement des taux de TVA');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditing(null);
    setFormData({ code: '', taux: '', description: '', actif: true });
    setShowForm(true);
  };

  const handleOpenEdit = (rate: TauxTva) => {
    setEditing(rate);
    setFormData({
      code: rate.code,
      taux: String(rate.taux),
      description: rate.description || '',
      actif: rate.actif,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const taux = Number(formData.taux);
      if (editing) {
        await tvaService.update(editing.id, {
          taux,
          description: formData.description,
          actif: formData.actif,
        });
        toast.success('Taux TVA mis à jour');
      } else {
        await tvaService.create({
          code: formData.code,
          taux,
          description: formData.description,
          actif: formData.actif,
        });
        toast.success('Taux TVA créé');
      }
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de l'opération");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rate: TauxTva) => {
    if (!window.confirm(`Supprimer le taux "${rate.code}" (${rate.taux}%) ?`)) return;
    try {
      await tvaService.remove(rate.id);
      toast.success('Taux TVA supprimé');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Percent className="h-6 w-6 text-primary" />
            Taux de TVA
          </h1>
          <p className="text-muted-foreground text-sm">Configurez les taux de TVA appliqués aux factures</p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouveau taux
        </Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Taux</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Aucun taux de TVA configuré
                  </td>
                </tr>
              ) : (
                rates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{rate.code}</td>
                    <td className="px-4 py-3 font-semibold">{Number(rate.taux)}%</td>
                    <td className="px-4 py-3 text-muted-foreground">{rate.description || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        rate.actif ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {rate.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(rate)}>
                          Modifier
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(rate)} className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              {editing ? 'Modifier le taux de TVA' : 'Nouveau taux de TVA'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code <span className="text-red-500">*</span></Label>
              <Input
                id="code"
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value })}
                placeholder="TVA_19"
                required
                disabled={!!editing}
                className={editing ? 'bg-muted' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taux">Pourcentage (%) <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  id="taux"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={formData.taux}
                  onChange={e => setFormData({ ...formData, taux: e.target.value })}
                  placeholder="19"
                  required
                  className="pr-8"
                />
                <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Taux normal - 19%"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.actif}
                onChange={e => setFormData({ ...formData, actif: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium">{formData.actif ? 'Taux actif' : 'Taux inactif'}</span>
            </label>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enregistrement...</> : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
