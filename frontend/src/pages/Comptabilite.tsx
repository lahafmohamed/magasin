import { useEffect, useState } from 'react';
import { comptabiliteService, generalLedgerService } from '../services/api';
import { formatCurrency } from '../utils/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Search, FileText, Scale, Calendar, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type Tab = 'journal' | 'grand-livre' | 'balance' | 'plan';

export default function ComptabilitePage() {
  const [tab, setTab] = useState<Tab>('journal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Journal
  const [journalData, setJournalData] = useState<any[]>([]);
  const [dateDebut, setDateDebut] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateFin, setDateFin] = useState(() => new Date().toISOString().slice(0, 10));
  const [journalFilter, setJournalFilter] = useState('');

  // Grand-livre
  const [compteSearch, setCompteSearch] = useState('');
  const [compteSelected, setCompteSelected] = useState('');
  const [grandLivreData, setGrandLivreData] = useState<any[]>([]);

  // Balance
  const [balanceData, setBalanceData] = useState<any[]>([]);

  // Plan comptable
  const [planData, setPlanData] = useState<any[]>([]);
  const [planClasse, setPlanClasse] = useState<number | undefined>();

  const loadJournal = async () => {
    setLoading(true); setError(null);
    try {
      const data = await comptabiliteService.getJournal({ date_debut: dateDebut, date_fin: dateFin, journal: journalFilter || undefined });
      setJournalData(data);
    } catch (e) { setError(e); toast.error('Erreur chargement journal'); }
    finally { setLoading(false); }
  };

  const loadBalance = async () => {
    setLoading(true); setError(null);
    try {
      const data = await comptabiliteService.getBalance(dateDebut, dateFin);
      setBalanceData(data?.filter((r: any) => Math.abs(parseFloat(r.total_debit)) > 0 || Math.abs(parseFloat(r.total_credit)) > 0));
    } catch (e) { setError(e); toast.error('Erreur chargement balance'); }
    finally { setLoading(false); }
  };

  const loadPlan = async () => {
    setLoading(true); setError(null);
    try {
      const data = await comptabiliteService.getPlanComptable(planClasse);
      setPlanData(data);
    } catch (e) { setError(e); toast.error('Erreur chargement plan comptable'); }
    finally { setLoading(false); }
  };

  const loadGrandLivre = async () => {
    if (!compteSelected) return;
    setLoading(true); setError(null);
    try {
      const data = await comptabiliteService.getGrandLivre(compteSelected, dateDebut, dateFin);
      setGrandLivreData(data);
    } catch (e) { setError(e); toast.error('Erreur chargement grand-livre'); }
    finally { setLoading(false); }
  };

  /** Recharge l'onglet actif — sert aussi de callback « Réessayer ». */
  const reload = () => {
    if (tab === 'journal') return loadJournal();
    if (tab === 'balance') return loadBalance();
    if (tab === 'plan') return loadPlan();
    return loadGrandLivre();
  };

  useEffect(() => {
    if (tab === 'journal') loadJournal();
    else if (tab === 'balance') loadBalance();
    else if (tab === 'plan') loadPlan();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateDebut, dateFin, journalFilter, planClasse]);

  useEffect(() => {
    if (tab === 'grand-livre' && compteSelected) {
      loadGrandLivre();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, compteSelected, dateDebut, dateFin]);

  const openBlob = (blob: Blob) => {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  };

  const exportBilan = async () => {
    try { openBlob(await generalLedgerService.exportBalanceSheetPdf(dateFin)); }
    catch { toast.error('Erreur lors de la génération du bilan'); }
  };

  const exportCompteResultat = async () => {
    try { openBlob(await generalLedgerService.exportIncomeStatementPdf(dateDebut, dateFin)); }
    catch { toast.error('Erreur lors de la génération du compte de résultat'); }
  };

  return (
    <div className="p-3 sm:p-6 w-full max-w-full">
      <div className="mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Comptabilité</h1>
            <p className="text-muted-foreground mt-1">OHADA / SYSCOHADA</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="space-y-4">
        {/* Tabs */}
        <TabsList>
          {[
            { id: 'journal' as Tab, label: 'Journal', icon: FileText },
            { id: 'grand-livre' as Tab, label: 'Grand-livre', icon: Search },
            { id: 'balance' as Tab, label: 'Balance', icon: Scale },
            { id: 'plan' as Tab, label: 'Plan comptable', icon: BookOpen },
          ].map(t => (
            <TabsTrigger key={t.id} value={t.id}>
              <t.icon className="h-4 w-4" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Filtres date */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportBilan} className="gap-1" title="Télécharger le bilan (PDF)">
              <FileDown className="h-4 w-4" /> Bilan PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportCompteResultat} className="gap-1" title="Télécharger le compte de résultat (PDF)">
              <FileDown className="h-4 w-4" /> Compte de résultat PDF
            </Button>
          </div>
          {tab === 'journal' && (
            <Select value={journalFilter || '__all'} onValueChange={v => setJournalFilter(v === '__all' ? '' : v)}>
              <SelectTrigger className="w-auto min-w-[200px] h-auto py-1.5 text-sm" aria-label="Filtrer par journal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Tous les journaux</SelectItem>
                <SelectItem value="VE">VE — Ventes</SelectItem>
                <SelectItem value="BQ">BQ — Banque</SelectItem>
                <SelectItem value="OD">OD — Opérations diverses</SelectItem>
                <SelectItem value="VT">VT — Ventilation</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === 'plan' && (
            <Select value={planClasse ? String(planClasse) : '__all'} onValueChange={v => setPlanClasse(v === '__all' ? undefined : parseInt(v))}>
              <SelectTrigger className="w-auto min-w-[180px] h-auto py-1.5 text-sm" aria-label="Filtrer par classe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Toutes les classes</SelectItem>
                {[1,2,3,4,5,6,7,8,9].map(c => <SelectItem key={c} value={String(c)}>Classe {c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <>
            {/* JOURNAL */}
            <TabsContent value="journal">
              <QueryState
                loading={loading}
                error={error}
                isEmpty={journalData.length === 0}
                onRetry={reload}
                skeleton={<TableSkeleton rows={8} columns={7} />}
                emptyTitle="Aucune écriture"
                emptyDescription="Aucune écriture sur la période sélectionnée."
                emptyIcon={FileText}
              >
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>N° pièce</TableHead>
                        <TableHead>Journal</TableHead>
                        <TableHead>Compte</TableHead>
                        <TableHead>Libellé</TableHead>
                        <TableHead className="text-right">Débit</TableHead>
                        <TableHead className="text-right">Crédit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journalData.map((e: any) => (
                        <TableRow key={e.id} className="text-sm">
                          <TableCell className="text-xs">{new Date(e.date_ecriture).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell className="font-mono text-xs">{e.numero_piece}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{e.journal}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{e.compte_numero} {e.compte_intitule && <span className="text-muted-foreground">— {e.compte_intitule}</span>}</TableCell>
                          <TableCell className="max-w-[250px] truncate">{e.libelle}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{parseFloat(e.debit) > 0 ? formatCurrency(e.debit) : ''}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{parseFloat(e.credit) > 0 ? formatCurrency(e.credit) : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              </QueryState>
            </TabsContent>

            {/* GRAND-LIVRE */}
            <TabsContent value="grand-livre">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="Chercher un compte (numéro ou intitulé)..."
                    value={compteSearch}
                    onChange={e => setCompteSearch(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button onClick={() => { setCompteSelected(compteSearch); loadGrandLivre(); }} variant="outline" className="gap-2">
                    <Search className="h-4 w-4" /> Voir
                  </Button>
                </div>
                {compteSelected && (
                  <p className="text-sm text-muted-foreground">Compte sélectionné : <strong>{compteSelected}</strong></p>
                )}
                {compteSelected && (
                  <QueryState
                    loading={loading}
                    error={error}
                    isEmpty={grandLivreData.length === 0}
                    onRetry={loadGrandLivre}
                    skeleton={<TableSkeleton rows={6} columns={6} />}
                    emptyTitle="Aucun mouvement"
                    emptyDescription="Aucun mouvement pour ce compte sur la période."
                    emptyIcon={Search}
                  >
                  <Card>
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>N° pièce</TableHead>
                            <TableHead>Libellé</TableHead>
                            <TableHead className="text-right">Débit</TableHead>
                            <TableHead className="text-right">Crédit</TableHead>
                            <TableHead className="text-right">Solde cumulé</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            let solde = 0;
                            return grandLivreData.map((e: any) => {
                              solde += parseFloat(e.debit || 0) - parseFloat(e.credit || 0);
                              return (
                                <TableRow key={e.id} className="text-sm">
                                  <TableCell className="text-xs">{new Date(e.date_ecriture).toLocaleDateString('fr-FR')}</TableCell>
                                  <TableCell className="font-mono text-xs">{e.numero_piece}</TableCell>
                                  <TableCell>{e.libelle}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{parseFloat(e.debit) > 0 ? formatCurrency(e.debit) : ''}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{parseFloat(e.credit) > 0 ? formatCurrency(e.credit) : ''}</TableCell>
                                  <TableCell className="text-right font-mono text-xs font-semibold">{formatCurrency(solde)}</TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  </QueryState>
                )}
              </div>
            </TabsContent>

            {/* BALANCE */}
            <TabsContent value="balance">
              <QueryState
                loading={loading}
                error={error}
                isEmpty={balanceData.length === 0}
                onRetry={reload}
                skeleton={<TableSkeleton rows={8} columns={6} />}
                emptyTitle="Aucun mouvement"
                emptyDescription="Aucun mouvement sur la période sélectionnée."
                emptyIcon={Scale}
              >
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead>Intitulé</TableHead>
                        <TableHead>Classe</TableHead>
                        <TableHead className="text-right">Total débit</TableHead>
                        <TableHead className="text-right">Total crédit</TableHead>
                        <TableHead className="text-right">Solde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balanceData.map((r: any) => {
                        const solde = parseFloat(r.solde);
                        const className = parseFloat(r.type_compte) === 1 || r.type_compte === 'actif' || r.type_compte === 'charge'
                          ? (solde > 0 ? 'text-success-700' : 'text-destructive')
                          : (solde > 0 ? 'text-destructive' : 'text-success-700');
                        return (
                          <TableRow key={r.numero} className="text-sm">
                            <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                            <TableCell>{r.intitule}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">Cl. {r.classe}</Badge></TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatCurrency(r.total_debit)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatCurrency(r.total_credit)}</TableCell>
                            <TableCell className={`text-right font-mono text-xs font-semibold ${className}`} title={solde >= 0 ? 'Solde débiteur' : 'Solde créditeur'}><span className="mr-1 not-italic font-bold">{solde >= 0 ? 'D' : 'C'}</span>{formatCurrency(solde)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              </QueryState>
            </TabsContent>

            {/* PLAN COMPTABLE */}
            <TabsContent value="plan">
              <QueryState
                loading={loading}
                error={error}
                isEmpty={planData.length === 0}
                onRetry={reload}
                skeleton={<TableSkeleton rows={8} columns={5} />}
                emptyTitle="Plan comptable vide"
                emptyDescription="Aucun compte pour ce filtre."
                emptyIcon={BookOpen}
              >
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N°</TableHead>
                        <TableHead>Intitulé</TableHead>
                        <TableHead>Classe</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Niveau</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planData.map((c: any) => (
                        <TableRow key={c.id} className="text-sm">
                          <TableCell className="font-mono text-xs font-semibold">{c.numero}</TableCell>
                          <TableCell>{c.intitule}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">Classe {c.classe}</Badge></TableCell>
                          <TableCell className="text-xs capitalize">{c.type_compte}</TableCell>
                          <TableCell className="text-xs">{c.niveau}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              </QueryState>
            </TabsContent>
          </>
        </Tabs>
      </div>
    </div>
  );
}
