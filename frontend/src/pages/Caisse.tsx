import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Wallet, Plus, TrendingUp, TrendingDown, Receipt, CreditCard, Banknote, Building2 } from 'lucide-react';
import { caisseService } from '@/services/api';
import { toast } from 'sonner';

interface CaisseSession {
  id: number;
  caisse_nom?: string;
  utilisateur_nom: string;
  date_ouverture: string;
  date_fermeture: string | null;
  solde_ouverture: number;
  solde_fermeture: number | null;
  solde_theorique: number | null;
  ecart: number | null;
  statut: 'ouverte' | 'fermee';
  notes_ouverture?: string;
  notes_fermeture?: string;
}

interface Paiement {
  id: number;
  montant: number;
  methode_paiement: string;
  date_paiement: string;
  reference?: string;
  numero_facture?: string;
  client_nom?: string;
  client_prenom?: string;
}

export default function Caisse() {
  const [sessions, setSessions] = useState<CaisseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [paiementsDialog, setPaiementsDialog] = useState(false);
  const [soldeInitial, setSoldeInitial] = useState('');
  const [soldeFinal, setSoldeFinal] = useState('');
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [loadingPaiements, setLoadingPaiements] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await caisseService.getSessions();
      setSessions(response.data || response);
    } catch (error) {
      toast.error('Erreur lors du chargement des sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadPaiements = async (sessionId: number) => {
    try {
      setLoadingPaiements(true);
      const response = await caisseService.getSessionPaiements(sessionId);
      setPaiements(response.data?.paiements || response.paiements || []);
    } catch (error) {
      console.error('Erreur chargement paiements:', error);
    } finally {
      setLoadingPaiements(false);
    }
  };

  const handleViewPaiements = (sessionId: number) => {
    setSelectedSession(sessionId);
    loadPaiements(sessionId);
    setPaiementsDialog(true);
  };

  const getMethodIcon = (methode: string) => {
    switch (methode) {
      case 'espece': return <Banknote className="h-4 w-4 text-green-600" />;
      case 'carte': return <CreditCard className="h-4 w-4 text-blue-600" />;
      case 'cheque': return <Receipt className="h-4 w-4 text-orange-600" />;
      case 'virement': return <Building2 className="h-4 w-4 text-purple-600" />;
      default: return <CreditCard className="h-4 w-4" />;
    }
  };

  const getMethodLabel = (methode: string) => {
    switch (methode) {
      case 'espece': return 'Espèces';
      case 'carte': return 'Carte';
      case 'cheque': return 'Chèque';
      case 'virement': return 'Virement';
      default: return methode;
    }
  };

  const handleOpenSession = async () => {
    if (!soldeInitial) {
      toast.error('Veuillez entrer un solde initial');
      return;
    }
    try {
      await caisseService.openSession(parseFloat(soldeInitial));
      toast.success('Session ouverte avec succès');
      setOpenDialog(false);
      setSoldeInitial('');
      loadSessions();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || 'Erreur lors de l\'ouverture de la session');
    }
  };

  const handleCloseSession = async () => {
    if (!selectedSession) return;
    if (!soldeFinal) {
      toast.error('Veuillez entrer un solde final');
      return;
    }
    try {
      await caisseService.closeSession(selectedSession, parseFloat(soldeFinal));
      toast.success('Session fermée avec succès');
      setCloseDialog(false);
      setSoldeFinal('');
      setSelectedSession(null);
      loadSessions();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || 'Erreur lors de la fermeture de la session');
    }
  };

  const getStatusBadge = (statut: string) => {
    const variants: Record<string, string> = {
      ouverte: 'bg-green-100 text-green-800',
      fermee: 'bg-gray-100 text-gray-800',
    };
    const labels: Record<string, string> = {
      ouverte: 'Ouverte',
      fermee: 'Fermée',
    };
    return (
      <Badge className={variants[statut] || 'bg-gray-100 text-gray-800'}>
        {labels[statut] || statut}
      </Badge>
    );
  };

  const formatXOF = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(montant);
  };

  const openSessions = sessions.filter(s => s.statut === 'ouverte');
  const totalOuvert = openSessions.reduce((sum, s) => sum + (s.solde_ouverture || 0), 0);

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestion de Caisse</h1>
        <Button onClick={() => setOpenDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Ouvrir Session
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm text-muted-foreground">Sessions ouvertes</p>
              <p className="text-2xl font-bold">{openSessions.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm text-muted-foreground">Solde total ouvert</p>
              <p className="text-2xl font-bold">{formatXOF(totalOuvert)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-sm text-muted-foreground">Sessions fermées</p>
              <p className="text-2xl font-bold">
                {sessions.filter(s => s.statut === 'fermee').length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Caisse</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Date ouverture</TableHead>
              <TableHead>Solde initial</TableHead>
              <TableHead>Solde final</TableHead>
              <TableHead>Variance</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Chargement...
                </TableCell>
              </TableRow>
            ) : sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Aucune session trouvée
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">#{session.id}</TableCell>
                  <TableCell>{session.caisse_nom || '-'}</TableCell>
                  <TableCell>{session.utilisateur_nom || '-'}</TableCell>
                  <TableCell>
                    {new Date(session.date_ouverture).toLocaleString('fr-FR')}
                  </TableCell>
                  <TableCell>{formatXOF(session.solde_ouverture)}</TableCell>
                  <TableCell>
                    {session.solde_fermeture ? formatXOF(session.solde_fermeture) : '-'}
                  </TableCell>
                  <TableCell>
                    {session.ecart !== null && (
                      <span className={session.ecart >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {session.ecart >= 0 ? '+' : ''}{formatXOF(session.ecart)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(session.statut)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewPaiements(session.id)}
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        Paiements
                      </Button>
                      {session.statut === 'ouverte' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedSession(session.id);
                            setCloseDialog(true);
                          }}
                        >
                          Fermer
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Open Session Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ouvrir une session de caisse</DialogTitle>
            <DialogDescription>
              Entrez le solde initial pour démarrer une nouvelle session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Solde initial</Label>
              <MoneyInput
                value={soldeInitial}
                onChange={(v) => setSoldeInitial(v)}
                placeholder="0"
              />
            </div>
            <Button onClick={handleOpenSession} className="w-full">
              Ouvrir la session
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fermer la session</DialogTitle>
            <DialogDescription>
              Entrez le solde final pour clôturer la session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Solde final en caisse</Label>
              <MoneyInput
                value={soldeFinal}
                onChange={(v) => setSoldeFinal(v)}
                placeholder="0"
              />
            </div>
            <Button onClick={handleCloseSession} className="w-full">
              Fermer la session
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Paiements Dialog */}
      <Dialog open={paiementsDialog} onOpenChange={(open) => { if (!open) setPaiementsDialog(false); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paiements de la session #{selectedSession}</DialogTitle>
            <DialogDescription>
              Liste des paiements effectués aujourd'hui
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {loadingPaiements ? (
              <div className="text-center py-8">Chargement...</div>
            ) : paiements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucun paiement enregistré pour cette session
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-xl font-bold">{formatXOF(paiements.reduce((s, p) => s + p.montant, 0))}</p>
                  </div>
                  {['espece', 'carte', 'cheque', 'virement'].map(m => {
                    const total = paiements.filter(p => p.methode_paiement === m).reduce((s, p) => s + p.montant, 0);
                    return (
                      <div key={m} className="bg-muted p-3 rounded-lg">
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          {getMethodIcon(m)}
                          {getMethodLabel(m)}
                        </p>
                        <p className="text-lg font-semibold">{formatXOF(total)}</p>
                      </div>
                    );
                  })}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Heure</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Facture</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paiements.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{new Date(p.date_paiement).toLocaleTimeString('fr-FR')}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getMethodIcon(p.methode_paiement)}
                            {getMethodLabel(p.methode_paiement)}
                          </div>
                        </TableCell>
                        <TableCell>{p.numero_facture || '-'}</TableCell>
                        <TableCell>{p.client_prenom ? `${p.client_prenom} ${p.client_nom || ''}` : p.client_nom || '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatXOF(p.montant)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
