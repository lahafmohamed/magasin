import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilePlus, Search, Eye } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { formatXOF } from '@/utils/format';
import { creditNoteService } from '@/services/api';
import { toast } from 'sonner';

interface Avoir {
  id: number;
  numero_avoir: string;
  tiers_id: number;
  client_id?: number;
  client_nom: string;
  date_avoir: string;
  statut: 'brouillon' | 'valide' | 'utilise' | 'annule' | string;
  total: number;
  avoir_type: string;
  notes: string | null;
}

export default function Avoirs() {
  const navigate = useNavigate();
  const [avoirs, setAvoirs] = useState<Avoir[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadAvoirs();
  }, []);

  const loadAvoirs = async () => {
    try {
      setLoading(true);
      const data = await creditNoteService.getAll();
      setAvoirs(data);
    } catch (error) {
      toast.error('Erreur lors du chargement des avoirs');
    } finally {
      setLoading(false);
    }
  };



  const filteredAvoirs = avoirs.filter(a =>
    a.numero_avoir.toLowerCase().includes(search.toLowerCase()) ||
    a.client_nom.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Avoirs</h1>
        <Button onClick={() => navigate('/avoirs/nouveau')}>
          <FilePlus className="h-4 w-4 mr-2" />
          Nouvel Avoir
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par numéro ou client..."
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
              <TableHead>Client</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Raison</TableHead>
              <TableHead>Statut</TableHead>
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
            ) : filteredAvoirs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Aucun avoir trouvé
                </TableCell>
              </TableRow>
            ) : (
              filteredAvoirs.map((avoir) => (
                <TableRow key={avoir.id}>
                  <TableCell className="font-medium">{avoir.numero_avoir}</TableCell>
                  <TableCell>{avoir.client_nom}</TableCell>
                  <TableCell>{new Date(avoir.date_avoir).toLocaleDateString('fr-FR')}</TableCell>
                  <TableCell>{avoir.avoir_type || '-'}</TableCell>
                  <TableCell><StatusBadge type="avoir" statut={avoir.statut} /></TableCell>
                  <TableCell className="text-right font-medium">
                    {formatXOF(avoir.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/avoirs/${avoir.id}`)}
                    >
                      <Eye className="h-4 w-4" />
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
