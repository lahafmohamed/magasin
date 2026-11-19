import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { AlertTriangle, FileBarChart, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  acompteFournisseurService,
  factureFournisseurService,
  receptionService,
} from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { TiersPicker } from '../components/TiersPicker';
import { CommandeProductPicker, type PurchasableProduct } from '../components/CommandeProductPicker';
import type { Tiers } from '../types';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { DocumentListPage, useDocumentList, type DocumentColumn } from '@/components/DocumentListPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { DatePicker } from '@/components/ui/date-picker';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { DocumentTotals } from '@/components/ui/document-totals';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { type StatsBarTile } from '@/components/ui/stats-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatCurrency, formatDate, formatDateNumeric, formatNumber, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { PAYMENT_METHOD_OPTIONS, formatPaymentMethod } from '@/utils/paymentMethod';

interface FactureFournisseur {
  id: number;
  tiers_id: number;
  commande_id: number | null;
  reception_id: number | null;
  numero_facture_fournisseur: string;
  numero_facture_interne: string;
  date_facture: string;
  date_echeance: string | null;
  total: number | string;
  montant_paye: number | string;
  reste_due: number | string;
  statut: string;
  condition_paiement: string | null;
  notes: string | null;
  fournisseur_nom: string | null;
  numero_reception?: string | null;
}

interface FactureLigne {
  id: number;
  produit_id: number | null;
  produit_nom: string | null;
  produit_reference: string | null;
  description: string | null;
  quantite: number | string;
  prix_unitaire: number | string;
  total_ligne: number | string;
}

interface FactureDetail extends FactureFournisseur {
  lignes: FactureLigne[];
}

/** `GET /factures-fournisseur/stats` — toutes factures confondues. */
interface FactureFournisseurStats {
  total_factures?: number | string;
  valeur_totale?: number | string;
  reste_du_total?: number | string;
  factures_en_attente?: number | string;
  factures_payees?: number | string;
}

interface AcompteDisponible {
  id: number;
  montant: number | string;
  montant_restant: number | string;
  date_acompte: string;
  methode_paiement: string;
}

interface ReceptionOption {
  id: number;
  numero_reception: string;
}

/** Ligne saisie : un produit du catalogue ou une désignation libre (transport, frais…). */
interface LigneSaisie {
  key: string;
  produit_id: number | null;
  libelle: string;
  quantite: number;
  prix_unitaire: number;
}

const MANAGE_ROLES = ['admin', 'manager'];
const CLOSED = ['payee', 'annulee'];

async function fetchAllFactures(search: string, statut: string | undefined): Promise<FactureFournisseur[]> {
  const all: FactureFournisseur[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await factureFournisseurService.getAll(search || undefined, statut, undefined, page, 200);
    all.push(...((res?.data ?? []) as FactureFournisseur[]));
    if (page >= (res?.pagination?.totalPages ?? 1)) break;
  }
  return all;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isOverdue(f: FactureFournisseur): boolean {
  return (
    !!f.date_echeance &&
    !CLOSED.includes(f.statut) &&
    (toNumber(f.reste_due) ?? 0) > 0 &&
    f.date_echeance.slice(0, 10) < todayIso()
  );
}

function Echeance({ facture }: { facture: FactureFournisseur }) {
  if (!facture.date_echeance) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 whitespace-nowrap md:justify-start">
      {formatDate(facture.date_echeance)}
      {isOverdue(facture) && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-danger-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Échue
        </span>
      )}
    </span>
  );
}

const CSV_HEADERS = [
  'N° interne',
  'N° fournisseur',
  'Fournisseur',
  'Date',
  'Échéance',
  'Total (FCFA)',
  'Payé (FCFA)',
  'Reste à payer (FCFA)',
  'Statut',
];
const csvRow = (f: FactureFournisseur) => [
  f.numero_facture_interne,
  f.numero_facture_fournisseur,
  f.fournisseur_nom ?? '',
  formatDateNumeric(f.date_facture),
  f.date_echeance ? formatDateNumeric(f.date_echeance) : '',
  toNumber(f.total) ?? 0,
  toNumber(f.montant_paye) ?? 0,
  toNumber(f.reste_due) ?? 0,
  getStatusLabel('facture_fournisseur', f.statut),
];

const isoToday = () => new Date().toISOString().split('T')[0];

// ============================================================ Création

interface CreateErrors {
  fournisseur?: string;
  numero?: string;
  date?: string;
  lignes?: string;
}

function NouvelleFactureDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: { id: number; numero_facture_interne?: string }) => void;
}) {
  const [fournisseur, setFournisseur] = useState<Tiers | null>(null);
  const [numero, setNumero] = useState('');
  const [dateFacture, setDateFacture] = useState(isoToday());
  const [dateEcheance, setDateEcheance] = useState('');
  const [receptionId, setReceptionId] = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [receptions, setReceptions] = useState<ReceptionOption[]>([]);
  const [receptionsError, setReceptionsError] = useState(false);

  const reset = () => {
    setFournisseur(null);
    setNumero('');
    setDateFacture(isoToday());
    setDateEcheance('');
    setReceptionId('');
    setCondition('');
    setNotes('');
    setLignes([]);
    setErrors({});
  };

  const loadReceptions = useCallback(() => {
    setReceptionsError(false);
    receptionService
      .getAll(undefined, 1, 100)
      .then((res: { data?: ReceptionOption[] } | ReceptionOption[]) => {
        setReceptions(Array.isArray(res) ? res : res?.data ?? []);
      })
      .catch(() => {
        setReceptions([]);
        setReceptionsError(true);
      });
  }, []);

  useEffect(() => {
    if (open) loadReceptions();
  }, [open, loadReceptions]);

  const productIds = useMemo(
    () => new Set(lignes.filter((l) => l.produit_id !== null).map((l) => l.produit_id as number)),
    [lignes]
  );

  const addProduct = (p: PurchasableProduct) => {
    if (productIds.has(p.id)) return;
    setLignes((prev) => [
      ...prev,
      { key: `p-${p.id}`, produit_id: p.id, libelle: p.nom, quantite: 1, prix_unitaire: toNumber(p.prix_achat) ?? 0 },
    ]);
    setErrors((prev) => ({ ...prev, lignes: undefined }));
  };

  const addFreeLine = () => {
    setLignes((prev) => [
      ...prev,
      { key: `l-${Date.now()}-${prev.length}`, produit_id: null, libelle: '', quantite: 1, prix_unitaire: 0 },
    ]);
    setErrors((prev) => ({ ...prev, lignes: undefined }));
  };

  const updateLine = (key: string, patch: Partial<LigneSaisie>) =>
    setLignes((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const total = lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire, 0);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: CreateErrors = {};
    if (!fournisseur) next.fournisseur = 'Choisissez le fournisseur.';
    if (!numero.trim()) next.numero = 'Saisissez le numéro de la facture du fournisseur.';
    if (!dateFacture) next.date = 'Choisissez la date de la facture.';
    if (lignes.length === 0) next.lignes = 'Ajoutez au moins une ligne à la facture.';
    else if (lignes.some((l) => l.produit_id === null && !l.libelle.trim()))
      next.lignes = 'Saisissez la désignation de chaque ligne libre.';
    setErrors(next);
    const firstInvalid = next.fournisseur
      ? 'ff-fournisseur'
      : next.numero
        ? 'ff-num'
        : next.date
          ? 'ff-date'
          : next.lignes
            ? 'ff-produit'
            : null;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const created = (await factureFournisseurService.create({
        tiers_id: fournisseur!.id,
        reception_id: receptionId ? parseInt(receptionId, 10) : undefined,
        numero_facture_fournisseur: numero.trim(),
        date_facture: dateFacture,
        date_echeance: dateEcheance || undefined,
        condition_paiement: condition.trim() || undefined,
        lignes: lignes.map((l) =>
          l.produit_id !== null
            ? { produit_id: l.produit_id, quantite: l.quantite, prix_unitaire: l.prix_unitaire }
            : { description: l.libelle.trim(), quantite: l.quantite, prix_unitaire: l.prix_unitaire }
        ),
        notes: notes.trim() || undefined,
      })) as { id: number; numero_facture_interne?: string };
      toast.success(
        created?.numero_facture_interne
          ? `Facture fournisseur ${created.numero_facture_interne} enregistrée`
          : 'Facture fournisseur enregistrée'
      );
      reset();
      onCreated(created);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer la facture fournisseur. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nouvelle facture fournisseur</DialogTitle>
          <DialogDescription>
            Enregistrez la facture reçue du fournisseur pour suivre ce que vous lui devez
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ff-fournisseur">
                Fournisseur <RequiredMark />
              </Label>
              <TiersPicker
                id="ff-fournisseur"
                role="fournisseur"
                value={fournisseur}
                onChange={setFournisseur}
                {...fieldErrorProps('ff-fournisseur', errors.fournisseur)}
              />
              <FieldError id="ff-fournisseur">{errors.fournisseur}</FieldError>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ff-num">
                N° de facture du fournisseur <RequiredMark />
              </Label>
              <Input
                id="ff-num"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                {...fieldErrorProps('ff-num', errors.numero)}
              />
              <FieldError id="ff-num">{errors.numero}</FieldError>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ff-date">
                Date de la facture <RequiredMark />
              </Label>
              <DatePicker
                id="ff-date"
                value={dateFacture}
                onChange={setDateFacture}
                required
                {...fieldErrorProps('ff-date', errors.date)}
              />
              <FieldError id="ff-date">{errors.date}</FieldError>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ff-ech">Date d’échéance</Label>
              <DatePicker id="ff-ech" value={dateEcheance} onChange={setDateEcheance} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ff-cond">Condition de paiement</Label>
              <Input
                id="ff-cond"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="Ex. : 30 jours"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ff-rec">Réception liée</Label>
              <Select value={receptionId === '' ? '__none' : receptionId} onValueChange={(v) => setReceptionId(v === '__none' ? '' : v)}>
                <SelectTrigger id="ff-rec" aria-describedby={receptionsError ? 'ff-rec-error' : undefined}>
                  <SelectValue placeholder="Aucune" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Aucune</SelectItem>
                  {receptions.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.numero_reception}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {receptionsError && (
                <p id="ff-rec-error" className="flex flex-wrap items-center gap-2 text-xs text-danger-700">
                  Impossible de charger les réceptions.
                  <button type="button" onClick={loadReceptions} className="font-medium underline underline-offset-2">
                    Réessayer
                  </button>
                </p>
              )}
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Lignes de la facture</legend>
            <div className="space-y-1.5">
              <Label htmlFor="ff-produit">Ajouter un produit</Label>
              <CommandeProductPicker
                id="ff-produit"
                selectedIds={productIds}
                onSelect={addProduct}
                alreadyAddedLabel="Déjà sur la facture"
              />
            </div>

            {lignes.length > 0 && (
              <div className="space-y-2">
                <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid" aria-hidden="true">
                  <span className="col-span-6">Produit ou désignation</span>
                  <span className="col-span-2 text-right">Quantité</span>
                  <span className="col-span-3 text-right">Prix unitaire</span>
                </div>
                <ul className="space-y-2" aria-label="Lignes saisies">
                  {lignes.map((l, index) => {
                    const nom = l.produit_id !== null ? l.libelle : l.libelle.trim() || `ligne libre ${index + 1}`;
                    return (
                      <li key={l.key} className="grid grid-cols-12 items-end gap-2 rounded-md border p-2 sm:items-center sm:border-0 sm:p-0">
                        <div className="col-span-12 sm:col-span-6">
                          {l.produit_id !== null ? (
                            <p className="truncate text-sm font-medium" title={l.libelle}>
                              {l.libelle}
                            </p>
                          ) : (
                            <>
                              <Label htmlFor={`ff-ligne-${l.key}`} className="text-xs text-muted-foreground sm:sr-only">
                                Désignation
                              </Label>
                              <Input
                                id={`ff-ligne-${l.key}`}
                                value={l.libelle}
                                onChange={(e) => updateLine(l.key, { libelle: e.target.value })}
                                placeholder="Ex. : frais de transport"
                              />
                            </>
                          )}
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <span className="block text-xs text-muted-foreground sm:hidden" aria-hidden="true">
                            Quantité
                          </span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={l.quantite}
                            onChange={(e) => updateLine(l.key, { quantite: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            aria-label={`Quantité — ${nom}`}
                            className="text-right tabular-nums"
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <span className="block text-xs text-muted-foreground sm:hidden" aria-hidden="true">
                            Prix unitaire
                          </span>
                          <MoneyInput
                            value={l.prix_unitaire ? String(Math.round(l.prix_unitaire)) : ''}
                            onChange={(v) => updateLine(l.key, { prix_unitaire: Number(v) || 0 })}
                            aria-label={`Prix unitaire — ${nom}`}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end sm:col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-touch"
                            onClick={() => setLignes((prev) => prev.filter((x) => x.key !== l.key))}
                            aria-label={`Retirer ${nom}`}
                            className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addFreeLine}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ajouter une ligne libre
            </Button>

            {errors.lignes && (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {errors.lignes}
              </p>
            )}
            {lignes.length > 0 && <DocumentTotals total={{ label: 'Total de la facture', value: total }} />}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="ff-notes">Notes</Label>
            <Textarea id="ff-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Spinner />}
              {submitting ? 'Enregistrement…' : 'Créer la facture'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ Paiement

function PaiementDialog({
  facture,
  open,
  onOpenChange,
  onDone,
}: {
  facture: FactureDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const reste = toNumber(facture.reste_due) ?? 0;
  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState('virement');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMontant(reste > 0 ? String(Math.round(reste)) : '');
      setMethode('virement');
      setReference('');
      setError(undefined);
    }
  }, [open, reste]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = Number(montant) || 0;
    if (value <= 0) {
      setError('Saisissez un montant supérieur à 0.');
      document.getElementById('ff-paiement-montant')?.focus();
      return;
    }
    if (value > reste + 0.005) {
      setError(`Le montant dépasse le reste à payer (${formatCurrency(reste)}).`);
      document.getElementById('ff-paiement-montant')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await factureFournisseurService.recordPayment(facture.id, {
        montant: value,
        methode_paiement: methode,
        reference: reference.trim() || undefined,
      });
      toast.success(`Paiement de ${formatCurrency(value)} enregistré`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer le paiement. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer un paiement</DialogTitle>
          <DialogDescription>
            Facture <DocumentCode>{facture.numero_facture_interne}</DocumentCode> · reste à payer <Money value={reste} />
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="ff-paiement-montant">
              Montant <RequiredMark />
            </Label>
            <MoneyInput
              id="ff-paiement-montant"
              value={montant}
              onChange={(v) => {
                setMontant(v);
                setError(undefined);
              }}
              {...fieldErrorProps('ff-paiement-montant', error)}
            />
            <FieldError id="ff-paiement-montant">{error}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-paiement-mode">
              Mode de paiement <RequiredMark />
            </Label>
            <Select value={methode} onValueChange={setMethode}>
              <SelectTrigger id="ff-paiement-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-paiement-ref">Référence</Label>
            <Input
              id="ff-paiement-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. : n° de virement ou de chèque"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Spinner />}
              Enregistrer le paiement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ Acompte

function AcompteDialog({
  facture,
  open,
  onOpenChange,
  onDone,
}: {
  facture: FactureDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const reste = toNumber(facture.reste_due) ?? 0;
  const [acomptes, setAcomptes] = useState<AcompteDisponible[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [acompteId, setAcompteId] = useState('');
  const [montant, setMontant] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = (await acompteFournisseurService.listForFournisseur(facture.tiers_id)) as AcompteDisponible[];
      setAcomptes(Array.isArray(list) ? list : []);
    } catch (err) {
      setAcomptes([]);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [facture.tiers_id]);

  useEffect(() => {
    if (open) {
      setAcompteId('');
      setMontant('');
      setError(undefined);
      void load();
    }
  }, [open, load]);

  const choose = (value: string) => {
    setAcompteId(value);
    setError(undefined);
    const acompte = acomptes.find((a) => String(a.id) === value);
    if (acompte) setMontant(String(Math.round(Math.min(toNumber(acompte.montant_restant) ?? 0, reste))));
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = Number(montant) || 0;
    const acompte = acomptes.find((a) => String(a.id) === acompteId);
    if (!acompte) {
      setError('Choisissez l’acompte à appliquer.');
      document.getElementById('ff-acompte')?.focus();
      return;
    }
    const max = Math.min(toNumber(acompte.montant_restant) ?? 0, reste);
    if (value <= 0 || value > max + 0.005) {
      setError(`Saisissez un montant entre 1 et ${formatCurrency(max)}.`);
      document.getElementById('ff-acompte-montant')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await acompteFournisseurService.apply(acompte.id, { facture_id: facture.id, montant: value });
      toast.success(`Acompte de ${formatCurrency(value)} appliqué`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’appliquer l’acompte. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Appliquer un acompte à la facture {facture.numero_facture_interne}</DialogTitle>
          <DialogDescription>
            L’acompte versé au fournisseur réduit le reste à payer de cette facture
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div aria-busy="true">
            <CardSkeleton lines={2} />
          </div>
        ) : loadError ? (
          <QueryErrorState error={loadError} title="Impossible de charger les acomptes" onRetry={() => void load()} />
        ) : acomptes.length === 0 ? (
          <>
            <EmptyState
              compact
              icon={Wallet}
              title="Aucun acompte disponible"
              description="Ce fournisseur n’a pas d’acompte en attente d’utilisation"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="ff-acompte">
                Acompte <RequiredMark />
              </Label>
              <Select value={acompteId} onValueChange={choose}>
                <SelectTrigger id="ff-acompte">
                  <SelectValue placeholder="Choisir un acompte…" />
                </SelectTrigger>
                <SelectContent>
                  {acomptes.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      Acompte du {formatDate(a.date_acompte)} — reste {formatCurrency(a.montant_restant)} (
                      {formatPaymentMethod(a.methode_paiement)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ff-acompte-montant">
                Montant à appliquer <RequiredMark />
              </Label>
              <MoneyInput
                id="ff-acompte-montant"
                value={montant}
                onChange={(v) => {
                  setMontant(v);
                  setError(undefined);
                }}
                {...fieldErrorProps('ff-acompte-montant', error)}
              />
              <FieldError id="ff-acompte-montant">{error}</FieldError>
              <p className="text-xs text-muted-foreground">
                Reste dû sur la facture : <Money value={reste} />
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting && <Spinner />}
                Appliquer l’acompte
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ Détail (tiroir)

function FactureSheet({
  factureId,
  canManage,
  onClose,
  onChanged,
}: {
  factureId: number | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<FactureDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [acompteOpen, setAcompteOpen] = useState(false);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      setDetail((await factureFournisseurService.getById(id)) as FactureDetail);
    } catch (err) {
      setDetail(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (factureId !== null) void load(factureId);
    else setDetail(null);
  }, [factureId, load]);

  const refresh = () => {
    if (factureId !== null) void load(factureId);
    onChanged();
  };

  const reste = toNumber(detail?.reste_due) ?? 0;
  const payable = !!detail && canManage && !CLOSED.includes(detail.statut) && reste > 0;

  return (
    <Sheet open={factureId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader className="space-y-2 border-b p-4 pr-14 sm:p-6 sm:pr-16">
          <SheetTitle>
            {detail ? `Facture ${detail.numero_facture_interne}` : 'Facture fournisseur'}
          </SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.fournisseur_nom ?? 'Fournisseur non renseigné'} · facture n° ${detail.numero_facture_fournisseur}`
              : loading
                ? 'Chargement de la facture…'
                : 'Détail de la facture fournisseur'}
          </SheetDescription>
          {detail && (
            <div>
              <StatusBadge type="facture_fournisseur" statut={detail.statut} size="md" />
            </div>
          )}
        </SheetHeader>

        {/* Zone défilante nommée et focusable : au clavier, le détail défile même
            quand il ne contient aucun lien ni bouton (axe scrollable-region-focusable). */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Détail de la facture"
          className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-6"
        >
          {loading ? (
            <div aria-busy="true" className="space-y-4">
              <CardSkeleton lines={4} />
              <TableSkeleton rows={3} columns={4} />
            </div>
          ) : error ? (
            <QueryErrorState
              error={error}
              title="Impossible de charger la facture"
              onRetry={() => factureId !== null && void load(factureId)}
            />
          ) : detail ? (
            <>
              <KeyValueList>
                <KeyValue label="Fournisseur">{detail.fournisseur_nom ?? '—'}</KeyValue>
                <KeyValue label="N° de facture du fournisseur">
                  <DocumentCode>{detail.numero_facture_fournisseur}</DocumentCode>
                </KeyValue>
                <KeyValue label="Date de la facture">{formatDate(detail.date_facture)}</KeyValue>
                <KeyValue label="Échéance">
                  <Echeance facture={detail} />
                </KeyValue>
                {detail.numero_reception && (
                  <KeyValue label="Réception liée">
                    <DocumentCode>{detail.numero_reception}</DocumentCode>
                  </KeyValue>
                )}
                {detail.condition_paiement && (
                  <KeyValue label="Condition de paiement">{detail.condition_paiement}</KeyValue>
                )}
              </KeyValueList>

              <section aria-labelledby="ff-lignes-titre" className="space-y-3">
                <h3 id="ff-lignes-titre" className="text-sm font-medium">
                  Lignes de la facture
                </h3>
                {detail.lignes.length === 0 ? (
                  <EmptyState compact icon={FileBarChart} title="Aucune ligne" description="Cette facture ne comporte aucune ligne" />
                ) : (
                  <ResponsiveTable
                    table={
                      <Table aria-label="Lignes de la facture" containerClassName="rounded-md border">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produit</TableHead>
                            <TableHead numeric>Quantité</TableHead>
                            <TableHead numeric>Prix unitaire</TableHead>
                            <TableHead numeric>Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.lignes.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell>{l.produit_nom || l.description || '—'}</TableCell>
                              <TableCell numeric>{formatNumber(toNumber(l.quantite) ?? 0, 2)}</TableCell>
                              <TableCell numeric>
                                <Money value={l.prix_unitaire} />
                              </TableCell>
                              <TableCell numeric>
                                <Money value={l.total_ligne} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    }
                    cards={detail.lignes.map((l) => (
                      <DataCard key={l.id} title={l.produit_nom || l.description || '—'}>
                        <DataCardRow label="Quantité" value={formatNumber(toNumber(l.quantite) ?? 0, 2)} numeric />
                        <DataCardRow label="Prix unitaire" value={<Money value={l.prix_unitaire} />} numeric />
                        <DataCardRow label="Total" value={<Money value={l.total_ligne} />} numeric />
                      </DataCard>
                    ))}
                  />
                )}
                <DocumentTotals
                  total={{ label: 'Total de la facture', value: detail.total }}
                  after={[
                    { label: 'Déjà payé', value: detail.montant_paye },
                    // Rouge seulement pour une facture échue : un reste dû à l'échéance n'est pas une alerte.
                    {
                      label: 'Reste à payer',
                      value: detail.reste_due,
                      tone: isOverdue(detail) ? 'danger' : 'neutral',
                      emphasis: true,
                    },
                  ]}
                />
              </section>

              {detail.notes && (
                <section aria-labelledby="ff-notes-titre" className="space-y-1">
                  <h3 id="ff-notes-titre" className="text-sm font-medium">
                    Notes
                  </h3>
                  <p className="whitespace-pre-wrap text-sm">{detail.notes}</p>
                </section>
              )}
            </>
          ) : null}
        </div>

        {payable && detail && (
          <div className="flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end sm:px-6">
            <Button variant="outline" size="touch" onClick={() => setAcompteOpen(true)}>
              Appliquer un acompte
            </Button>
            <Button size="touch" onClick={() => setPayOpen(true)}>
              Enregistrer un paiement
            </Button>
          </div>
        )}

        {detail && (
          <>
            <PaiementDialog facture={detail} open={payOpen} onOpenChange={setPayOpen} onDone={refresh} />
            <AcompteDialog facture={detail} open={acompteOpen} onOpenChange={setAcompteOpen} onDone={refresh} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================ Page

export default function FacturesFournisseur() {
  const { user } = useAuth();
  const canManage = MANAGE_ROLES.includes(user?.role ?? '');
  const [searchParams] = useSearchParams();
  const patchParams = useSearchParamsPatch();

  const factureParam = searchParams.get('facture');
  const factureId = factureParam && /^\d+$/.test(factureParam) ? Number(factureParam) : null;
  const creating = canManage && searchParams.get('nouvelle') === '1';

  const list = useDocumentList<FactureFournisseur, FactureFournisseurStats>({
    defaultSortKey: 'date_facture',
    fetchList: (search, statut, page, limit) =>
      factureFournisseurService.getAll(search || undefined, statut, undefined, page, limit),
    fetchStats: async () => (await factureFournisseurService.getStats()) as FactureFournisseurStats,
    loadErrorMessage: 'Impossible de charger les factures fournisseur.',
  });

  const setParam = (key: string, value: string | null) => patchParams({ [key]: value });

  const refreshAll = () => {
    void list.reload();
    list.reloadStats();
  };

  // Tuiles = montants seulement : les décomptes vont dans les puces de statut
  // (« Toutes 4 », « En attente 1 », « Payée 2 ») au lieu de les répéter.
  const statTiles = (s: FactureFournisseurStats | null): StatsBarTile[] => [
    {
      label: 'Reste à payer',
      value: s ? formatCurrency(toNumber(s.reste_du_total) ?? 0) : '—',
      size: 'lg',
    },
    {
      label: 'Valeur des factures',
      value: s ? formatCurrency(toNumber(s.valeur_totale) ?? 0) : '—',
    },
  ];

  // Seuls les statuts que le serveur compte reçoivent un nombre : aucun
  // décompte deviné pour « Validée », « Partiellement payée » ou « Annulée ».
  const chipCounts = (s: FactureFournisseurStats) => ({
    all: toNumber(s.total_factures),
    en_attente: toNumber(s.factures_en_attente),
    payee: toNumber(s.factures_payees),
  });

  const columns: DocumentColumn<FactureFournisseur>[] = [
    {
      header: 'N° interne',
      primary: true,
      render: (f) => f.numero_facture_interne,
    },
    {
      header: 'Fournisseur',
      render: (f) => (
        <span className="block min-w-0">
          <span className="block">{f.fournisseur_nom ?? '—'}</span>
          <span className="block text-xs text-muted-foreground">
            Facture n° <DocumentCode>{f.numero_facture_fournisseur}</DocumentCode>
          </span>
        </span>
      ),
    },
    { header: 'Date', cellClassName: 'whitespace-nowrap', render: (f) => formatDate(f.date_facture) },
    { header: 'Échéance', render: (f) => <Echeance facture={f} /> },
    { header: 'Total', align: 'right', numeric: true, render: (f) => <Money value={f.total} /> },
    // Facture soldée : « 0 FCFA » estompé, le reste dû ressort seul.
    { header: 'Reste à payer', align: 'right', numeric: true, render: (f) => <Money value={f.reste_due} tone="auto" /> },
    {
      header: 'Statut',
      card: 'badge',
      render: (f) => <StatusBadge type="facture_fournisseur" statut={f.statut} />,
    },
  ];

  const detailPath = (f: FactureFournisseur) => {
    const p = new URLSearchParams(searchParams);
    p.delete('nouvelle');
    p.set('facture', String(f.id));
    return `/factures-fournisseur?${p.toString()}`;
  };

  const createButton = canManage ? (
    <Button size="touch" className="gap-2" onClick={() => setParam('nouvelle', '1')}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      Nouvelle facture fournisseur
    </Button>
  ) : null;

  return (
    <>
      <DocumentListPage
        list={list}
        title="Factures fournisseur"
        subtitle="Les factures reçues de vos fournisseurs et ce qu’il reste à leur payer"
        createButton={createButton}
        statTiles={statTiles}
        chipCounts={chipCounts}
        searchPlaceholder="N° de facture ou fournisseur…"
        searchLabel="Rechercher une facture fournisseur"
        statusChips={[{ value: 'all', label: 'Toutes' }, ...getStatusOptions('facture_fournisseur')]}
        shortcuts={{ newRoute: '/factures-fournisseur?nouvelle=1', newDescription: 'Nouvelle facture fournisseur' }}
        csv={{
          filenamePrefix: 'factures_fournisseur',
          headers: CSV_HEADERS,
          row: csvRow,
          fetchAll: fetchAllFactures,
        }}
        columns={columns}
        detailPath={detailPath}
        selectable={false}
        itemNoun={{ one: 'facture', many: 'factures' }}
        emptyState={{
          icon: FileBarChart,
          title: 'Aucune facture fournisseur',
          description: 'Enregistrez les factures reçues de vos fournisseurs pour suivre ce que vous leur devez',
          filteredTitle: 'Aucune facture ne correspond à ces filtres',
          filteredDescription: 'Vérifiez le numéro ou le fournisseur, ou changez de statut',
          createAction: createButton,
        }}
      />

      <FactureSheet
        factureId={factureId}
        canManage={canManage}
        onClose={() => setParam('facture', null)}
        onChanged={refreshAll}
      />

      {canManage && (
        <NouvelleFactureDialog
          open={creating}
          onOpenChange={(open) => setParam('nouvelle', open ? '1' : null)}
          onCreated={(created) => {
            refreshAll();
            patchParams({ nouvelle: null, facture: created?.id ?? null });
          }}
        />
      )}
    </>
  );
}
