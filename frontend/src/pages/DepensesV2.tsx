import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Link2, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Tag } from '@/components/ui/tag';
import { DocumentCode } from '@/components/ui/document-code';
import { Money } from '@/components/ui/money';
import { StatusBadge } from '@/components/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { QueryErrorState, QueryState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import { Pagination } from '@/components/ui/pagination';
import { ListSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { caisseService, depenseService } from '@/services/api';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { getErrorCode, getErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/utils/format';
import {
  PAYMENT_METHOD_OPTIONS,
  formatPaymentMethod,
  paymentMethodHue,
  type PaymentMethod,
} from '@/utils/paymentMethod';

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
  magasin_nom?: string;
  categorie_nom: string | null;
  montant: number | string;
  methode_paiement: string;
  date_depense: string;
  description: string;
  beneficiaire_libre: string | null;
  fournisseur_nom: string | null;
  session_caisse_id: number | null;
}

/** Date du jour en heure LOCALE (YYYY-MM-DD) — toISOString() renverrait la date UTC. */
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyForm = () => ({
  montant: '',
  categorie_id: '',
  description: '',
  methode_paiement: 'espece' as PaymentMethod,
  beneficiaire_libre: '',
  date_depense: todayLocal(),
});

type FormErrors = Partial<Record<'montant' | 'categorie_id' | 'description', string>>;

/** État de la caisse du magasin : `unknown` si la requête a échoué (jamais « fermée » par défaut). */
type CaisseState = 'loading' | 'open' | 'closed' | 'unknown';

function MethodTag({ method }: { method: string }) {
  return <Tag hue={paymentMethodHue(method)}>{formatPaymentMethod(method)}</Tag>;
}

export default function DepensesV2() {
  const confirm = useConfirm();
  const canOpen = useRouteAccess();
  const canOpenCaisse = canOpen('/caisse');

  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [magasinsLoading, setMagasinsLoading] = useState(true);
  const [magasinsError, setMagasinsError] = useState<unknown>(null);
  const [selectedMagasin, setSelectedMagasin] = useState<number | null>(null);

  const [caisse, setCaisse] = useState<CaisseState>('loading');

  const [categories, setCategories] = useState<CategorieDepense[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<unknown>(null);

  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const listReq = useRef(0);

  // Pagination (serveur)
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

  // Création
  const [searchParams] = useSearchParams();
  const patchParams = useSearchParamsPatch();
  const [openDialog, setOpenDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const montantRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  // ===== Chargements =====
  const loadMagasins = useCallback(async () => {
    setMagasinsLoading(true);
    setMagasinsError(null);
    try {
      const rows = (await caisseService.getMagasins()) as Magasin[];
      setMagasins(rows);
      setSelectedMagasin((current) => current ?? (rows.length === 1 ? rows[0].id : null));
    } catch (err) {
      setMagasinsError(err);
    } finally {
      setMagasinsLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      setCategories((await depenseService.getCategories()) as CategorieDepense[]);
    } catch (err) {
      setCategoriesError(err);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const loadCaisse = useCallback(async (magasinId: number) => {
    setCaisse('loading');
    try {
      const session = await caisseService.getSessionActive(magasinId);
      setCaisse(session ? 'open' : 'closed');
    } catch {
      setCaisse('unknown');
    }
  }, []);

  const loadDepenses = useCallback(async () => {
    if (!selectedMagasin) return;
    const req = ++listReq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await depenseService.getAll({
        magasin_id: selectedMagasin,
        page,
        limit,
        search: debouncedSearch || undefined,
        categorie_id: filterCategorie ? Number(filterCategorie) : undefined,
        date_debut: dateDebut || undefined,
        date_fin: dateFin || undefined,
      });
      if (req !== listReq.current) return;
      const rows = (res.data ?? []) as Depense[];
      setDepenses(rows);
      setTotal(res.pagination?.total ?? rows.length);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      if (req !== listReq.current) return;
      setDepenses([]);
      setError(err);
    } finally {
      if (req === listReq.current) setLoading(false);
    }
  }, [selectedMagasin, page, limit, debouncedSearch, filterCategorie, dateDebut, dateFin]);

  useEffect(() => {
    void loadMagasins();
    void loadCategories();
  }, [loadMagasins, loadCategories]);

  useEffect(() => {
    if (selectedMagasin) void loadCaisse(selectedMagasin);
  }, [selectedMagasin, loadCaisse]);

  useEffect(() => {
    void loadDepenses();
  }, [loadDepenses]);

  // Recherche serveur (n° de dépense, description), différée.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const hasFilters = !!(search || filterCategorie || dateDebut || dateFin);
  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFilterCategorie('');
    setDateDebut('');
    setDateFin('');
    setPage(1);
  };

  // ===== Création =====
  const openCreate = () => {
    setFormData(emptyForm());
    setFormErrors({});
    setOpenDialog(true);
  };

  // `?nouvelle=1` : « Nouvelle dépense » depuis la sortie de caisse (P-M3) —
  // le formulaire s'ouvre d'emblée, puis le paramètre est retiré de l'adresse.
  const wantsNew = searchParams.get('nouvelle') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    setFormData(emptyForm());
    setFormErrors({});
    setOpenDialog(true);
    patchParams({ nouvelle: null });
  }, [wantsNew, patchParams]);

  const isCashPayment = formData.methode_paiement === 'espece';
  const cashBlocked = isCashPayment && caisse === 'closed';
  const noCategories = !categoriesLoading && !categoriesError && categories.length === 0;

  const handleCreate = async () => {
    if (!selectedMagasin || saving) return;
    const montant = Number(formData.montant);
    const errors: FormErrors = {};
    if (!formData.montant || !(montant > 0)) errors.montant = 'Saisissez un montant supérieur à 0 FCFA.';
    if (!formData.categorie_id) errors.categorie_id = 'Choisissez la catégorie de la dépense.';
    if (!formData.description.trim()) errors.description = 'Saisissez la description de la dépense.';
    setFormErrors(errors);
    if (errors.montant) {
      montantRef.current?.focus();
      return;
    }
    if (errors.categorie_id) {
      document.getElementById('dep-categorie')?.focus();
      return;
    }
    if (errors.description) {
      descriptionRef.current?.focus();
      return;
    }
    if (cashBlocked) return;

    setSaving(true);
    try {
      await depenseService.create({
        magasin_id: selectedMagasin,
        montant,
        categorie_id: Number(formData.categorie_id),
        methode_paiement: formData.methode_paiement,
        description: formData.description.trim(),
        beneficiaire_libre: formData.beneficiaire_libre.trim() || undefined,
        date_depense: formData.date_depense,
      });
      toast.success(`Dépense de ${formatCurrency(montant)} enregistrée`);
      setOpenDialog(false);
      // La nouvelle dépense apparaît en tête de liste : retour en page 1.
      if (page !== 1) setPage(1);
      else void loadDepenses();
      void loadCaisse(selectedMagasin);
    } catch (err) {
      if (getErrorCode(err) === 'CAISSE_FERMEE') {
        setCaisse('closed');
        toast.error('La caisse de ce magasin est fermée : ouvrez-la avant d’enregistrer une dépense en espèces.');
      } else {
        toast.error(getErrorMessage(err, 'Impossible d’enregistrer la dépense. Réessayez.'));
      }
    } finally {
      setSaving(false);
    }
  };

  // ===== Suppression =====
  const handleDelete = async (depense: Depense) => {
    const montant = formatCurrency(depense.montant);
    const remiseEnCaisse = depense.methode_paiement === 'espece' && !!depense.session_caisse_id;
    const ok = await confirm({
      title: `Supprimer la dépense ${depense.numero_depense} ?`,
      description: remiseEnCaisse
        ? `La dépense de ${montant} sera supprimée. Comme elle a été payée en espèces, ce montant sera remis au solde de la caisse ouverte.`
        : `La dépense de ${montant} sera supprimée.`,
      confirmLabel: 'Supprimer la dépense',
      destructive: true,
    });
    if (!ok) return;

    try {
      await depenseService.delete(depense.id);
      toast.success(
        remiseEnCaisse
          ? `Dépense ${depense.numero_depense} supprimée : ${montant} remis en caisse`
          : `Dépense ${depense.numero_depense} supprimée`
      );
      if (depenses.length === 1 && page > 1) setPage(page - 1);
      else void loadDepenses();
      if (selectedMagasin) void loadCaisse(selectedMagasin);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de supprimer la dépense.'));
    }
  };

  // ===== Rendu =====
  const pageTotal = depenses.reduce((sum, d) => sum + (toNumber(d.montant) ?? 0), 0);

  const magasinPicker =
    magasins.length > 1 ? (
      <Select
        value={selectedMagasin !== null ? String(selectedMagasin) : ''}
        onValueChange={(v) => {
          setSelectedMagasin(Number(v));
          setDepenses([]);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-64" aria-label="Magasin">
          <SelectValue placeholder="Choisir un magasin" />
        </SelectTrigger>
        <SelectContent>
          {magasins.map((m) => (
            <SelectItem key={m.id} value={String(m.id)}>
              {m.code} — {m.nom}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  // Caisse ouverte = l'état normal : une pastille dans l'en-tête et une ligne
  // estompée, pas un bandeau vert pleine largeur. Seule la caisse fermée garde
  // son bandeau d'avertissement.
  const caisseOpen = selectedMagasin !== null && caisse === 'open';

  const shell = (children: ReactNode) => (
    <PageShell
      title="Dépenses"
      meta={caisseOpen ? <StatusBadge type="session_caisse" statut="ouverte" size="md" /> : undefined}
      description={
        caisseOpen ? (
          <>
            Sorties d’argent du magasin, hors achats fournisseurs
            <span className="block">Caisse ouverte : les dépenses en espèces en sont déduites</span>
          </>
        ) : (
          'Sorties d’argent du magasin, hors achats fournisseurs'
        )
      }
      actions={magasinPicker}
      primaryAction={
        selectedMagasin ? (
          <Button size="touch" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nouvelle dépense
          </Button>
        ) : undefined
      }
    >
      {children}
    </PageShell>
  );

  if (magasinsLoading) return shell(<ListSkeleton items={4} />);

  if (magasinsError) {
    return shell(
      <Card>
        <QueryErrorState
          error={magasinsError}
          title="Impossible de charger vos magasins"
          onRetry={() => void loadMagasins()}
        />
      </Card>
    );
  }

  if (magasins.length === 0) {
    return shell(
      <Card>
        <EmptyState
          icon={ReceiptText}
          title="Aucun magasin ne vous est affecté"
          description="Demandez à l’administrateur de vous affecter à un magasin pour enregistrer ses dépenses"
        />
      </Card>
    );
  }

  if (!selectedMagasin) {
    return shell(
      <Card>
        <EmptyState
          icon={ReceiptText}
          title="Choisissez un magasin"
          description="Sélectionnez en haut de la page le magasin dont vous voulez voir les dépenses"
        />
      </Card>
    );
  }

  const caisseBanner =
    caisse === 'loading' || caisse === 'open' ? null : caisse === 'closed' ? (
      <div className="flex flex-col gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Caisse fermée : ouvrez la caisse pour enregistrer des dépenses en espèces
        </span>
        {canOpenCaisse && (
          <Link to="/caisse" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Ouvrir la caisse
          </Link>
        )}
      </div>
    ) : (
      <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          État de la caisse indisponible : une dépense en espèces sera refusée si la caisse est fermée.{' '}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => void loadCaisse(selectedMagasin)}
          >
            Réessayer
          </button>
        </span>
      </div>
    );

  return shell(
    <>
      {caisseBanner}

      <Card>
        <CardContent inset="standalone" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[14rem]">
            <Label htmlFor="depense-search">Rechercher</Label>
            <Input
              id="depense-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="N° de dépense ou description…"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-56">
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
          <div className="flex flex-col gap-1.5 sm:w-44">
            <Label htmlFor="depense-date-debut">Du</Label>
            <DatePicker
              id="depense-date-debut"
              value={dateDebut}
              onChange={(v) => {
                setDateDebut(v);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-44">
            <Label htmlFor="depense-date-fin">Au</Label>
            <DatePicker
              id="depense-date-fin"
              value={dateFin}
              onChange={(v) => {
                setDateFin(v);
                setPage(1);
              }}
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              Effacer les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="standalone" className="max-md:p-0">
          <QueryState
            loading={loading && depenses.length === 0}
            error={error}
            errorTitle="Impossible de charger les dépenses"
            isEmpty={depenses.length === 0}
            onRetry={() => void loadDepenses()}
            skeleton={<TableSkeleton rows={8} columns={8} />}
            emptyIcon={ReceiptText}
            emptyTitle={hasFilters ? 'Aucune dépense ne correspond à ces filtres' : 'Aucune dépense enregistrée'}
            emptyDescription={
              hasFilters
                ? 'Élargissez la période ou effacez les filtres'
                : 'Enregistrez ici les sorties d’argent du magasin : transport, fournitures, entretien, factures d’eau ou d’électricité…'
            }
            emptyAction={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  Effacer les filtres
                </Button>
              ) : (
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Nouvelle dépense
                </Button>
              )
            }
          >
            {/* Le compte et la somme en une ligne estompée : deux tuiles à moitié
                vides pour deux chiffres de liste, c'était trop. La somme ne porte
                que sur la page affichée — elle le dit dès qu'il y en a plusieurs. */}
            <p className="mb-3 text-sm text-muted-foreground md:px-3">
              <span className="tabular-nums">{formatNumber(total)}</span> {total > 1 ? 'dépenses' : 'dépense'} ·{' '}
              <Money value={pageTotal} />
              {totalPages > 1 && ' sur cette page'}
            </p>
            <ResponsiveTable
              table={
                <Table aria-label="Dépenses du magasin">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Mode de paiement</TableHead>
                      <TableHead numeric>Montant</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depenses.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <DocumentCode>{d.numero_depense}</DocumentCode>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(d.date_depense)}</TableCell>
                        <TableCell>{d.categorie_nom || '—'}</TableCell>
                        <TableCell className="max-w-sm">
                          <p className="truncate" title={d.description}>
                            {d.description}
                          </p>
                          {(d.fournisseur_nom || d.beneficiaire_libre) && (
                            <p className="truncate text-xs text-muted-foreground">
                              Bénéficiaire : {d.fournisseur_nom || d.beneficiaire_libre}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <MethodTag method={d.methode_paiement} />
                          {d.session_caisse_id && (
                            <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">Déduite de la caisse</p>
                          )}
                        </TableCell>
                        <TableCell numeric>
                          <Money value={d.montant} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                            aria-label={`Supprimer la dépense ${d.numero_depense}`}
                            onClick={() => void handleDelete(d)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={depenses.map((d) => (
                <DataCard
                  key={d.id}
                  title={<DocumentCode>{d.numero_depense}</DocumentCode>}
                  badge={<MethodTag method={d.methode_paiement} />}
                  actions={
                    <Button
                      variant="outline"
                      size="icon-touch"
                      className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                      aria-label={`Supprimer la dépense ${d.numero_depense}`}
                      onClick={() => void handleDelete(d)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  }
                >
                  <DataCardRow label="Date" value={formatDate(d.date_depense)} />
                  <DataCardRow label="Catégorie" value={d.categorie_nom || '—'} />
                  <DataCardRow label="Bénéficiaire" value={d.fournisseur_nom || d.beneficiaire_libre || '—'} />
                  <DataCardRow label="Description" value={d.description} />
                  <DataCardRow label="Montant" value={<Money value={d.montant} />} numeric />
                  <DataCardRow label="Caisse" value={d.session_caisse_id ? 'Déduite de la caisse' : 'Hors espèces'} />
                </DataCard>
              ))}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(l) => {
                setLimit(l);
                setPage(1);
              }}
            />
          </QueryState>
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={(o) => !saving && setOpenDialog(o)}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Nouvelle dépense</DialogTitle>
              <DialogDescription>Les champs marqués d’un * sont obligatoires</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isCashPayment && caisse === 'closed' && (
                <div className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Caisse fermée</p>
                    <p>
                      Une dépense en espèces sort de la caisse : ouvrez-la d’abord, ou choisissez un autre mode de
                      paiement.{' '}
                      {canOpenCaisse && (
                        <Link
                          to="/caisse"
                          className="font-medium underline underline-offset-4"
                          onClick={() => setOpenDialog(false)}
                        >
                          Ouvrir la caisse
                        </Link>
                      )}
                    </p>
                  </div>
                </div>
              )}
              {isCashPayment && caisse === 'open' && (
                <div className="flex items-start gap-2 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-800">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>Payée en espèces, elle sera déduite des espèces attendues dans la caisse ouverte</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dep-date">
                    Date
                    <RequiredMark />
                  </Label>
                  <DatePicker
                    id="dep-date"
                    value={formData.date_depense}
                    onChange={(date_depense) => setFormData((f) => ({ ...f, date_depense }))}
                    required
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <Label htmlFor="dep-montant">
                    Montant
                    <RequiredMark />
                  </Label>
                  <MoneyInput
                    id="dep-montant"
                    ref={montantRef}
                    // Le montant d'abord : la date du jour est déjà remplie (P-m10).
                    autoFocus
                    value={formData.montant}
                    onChange={(v) => {
                      setFormData((f) => ({ ...f, montant: v }));
                      if (formErrors.montant) setFormErrors((e) => ({ ...e, montant: undefined }));
                    }}
                    placeholder="0"
                    className="mt-1"
                    {...fieldErrorProps('dep-montant', formErrors.montant)}
                  />
                  <FieldError id="dep-montant">{formErrors.montant}</FieldError>
                </div>
              </div>

              <div>
                <Label htmlFor="dep-categorie">
                  Catégorie
                  <RequiredMark />
                </Label>
                {categoriesError ? (
                  <p className="mt-1 text-sm text-danger-700">
                    Impossible de charger les catégories.{' '}
                    <button
                      type="button"
                      className="font-medium underline underline-offset-4"
                      onClick={() => void loadCategories()}
                    >
                      Réessayer
                    </button>
                  </p>
                ) : noCategories ? (
                  <p className="mt-1 text-sm text-warning-700">
                    Aucune catégorie de dépense n’est configurée. Demandez à l’administrateur d’en créer.
                  </p>
                ) : (
                  <Select
                    value={formData.categorie_id}
                    onValueChange={(v) => {
                      setFormData((f) => ({ ...f, categorie_id: v }));
                      if (formErrors.categorie_id) setFormErrors((e) => ({ ...e, categorie_id: undefined }));
                    }}
                  >
                    <SelectTrigger
                      id="dep-categorie"
                      className="mt-1"
                      {...fieldErrorProps('dep-categorie', formErrors.categorie_id)}
                    >
                      <SelectValue placeholder={categoriesLoading ? 'Chargement…' : 'Choisir une catégorie'} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {cat.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FieldError id="dep-categorie">{formErrors.categorie_id}</FieldError>
              </div>

              <div>
                <Label htmlFor="dep-methode">
                  Mode de paiement
                  <RequiredMark />
                </Label>
                <Select
                  value={formData.methode_paiement}
                  onValueChange={(v) => setFormData((f) => ({ ...f, methode_paiement: v as PaymentMethod }))}
                >
                  <SelectTrigger id="dep-methode" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.value === 'espece' ? 'Espèces (déduites de la caisse)' : o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="dep-beneficiaire">Bénéficiaire (facultatif)</Label>
                <Input
                  id="dep-beneficiaire"
                  value={formData.beneficiaire_libre}
                  onChange={(e) => setFormData((f) => ({ ...f, beneficiaire_libre: e.target.value }))}
                  placeholder="Ex. : Froid Service CI"
                  maxLength={255}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="dep-description">
                  Description
                  <RequiredMark />
                </Label>
                <Input
                  id="dep-description"
                  ref={descriptionRef}
                  value={formData.description}
                  onChange={(e) => {
                    setFormData((f) => ({ ...f, description: e.target.value }));
                    if (formErrors.description) setFormErrors((er) => ({ ...er, description: undefined }));
                  }}
                  placeholder="Ex. : réparation du climatiseur"
                  maxLength={2000}
                  className="mt-1"
                  {...fieldErrorProps('dep-description', formErrors.description)}
                />
                <FieldError id="dep-description">{formErrors.description}</FieldError>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)} disabled={saving}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving || cashBlocked || noCategories || !!categoriesError}>
                {saving ? (
                  <>
                    <Spinner className="mr-2" />
                    Enregistrement…
                  </>
                ) : (
                  'Créer la dépense'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}
