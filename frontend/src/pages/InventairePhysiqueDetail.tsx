import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, ScanBarcode, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  inventaireService,
  type Inventaire,
  type InventaireFiltreLignes,
  type InventaireLigne,
} from '@/services/api';
import { useAuth } from '@/lib/AuthContext';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/loading';
import { Money } from '@/components/ui/money';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState, QueryState } from '@/components/ui/query-state';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { StatsBar, type StatTile } from '@/components/ui/stats-bar';
import { ChoiceGroup, ToggleChip } from '@/components/ui/choice-chips';
import { DocumentCode } from '@/components/ui/document-code';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import { getErrorMessage } from '@/utils/errors';
import { downloadCsv } from '@/utils/csv';
import { MINUS, formatDate, formatDateTime, formatNumber, formatSignedCurrency } from '@/utils/format';

const LIMIT = 50;
const FILTRES: ReadonlyArray<{ value: InventaireFiltreLignes; label: string; ecarts?: boolean }> = [
  { value: 'tous', label: 'Tous' },
  { value: 'a_compter', label: 'À compter' },
  { value: 'comptes', label: 'Comptés' },
  { value: 'ecarts', label: 'Écarts', ecarts: true },
];

const isFiltre = (v: string | null): v is InventaireFiltreLignes => FILTRES.some((f) => f.value === v);

/** « +3 », « −3 », « 0 » — le signe porte le sens, pas seulement la couleur. */
function signed(n: number): string {
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `${MINUS}${formatNumber(Math.abs(n))}`;
  return '0';
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

function Ecart({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return <span className={value < 0 ? 'text-danger-700' : undefined}>{signed(value)}</span>;
}

/** Passe au champ de comptage visible suivant (tableau ou cartes). */
function focusNextCountInput(current: HTMLInputElement) {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-count-input]')).filter(
    (el) => el.offsetParent !== null
  );
  const next = inputs[inputs.indexOf(current) + 1];
  if (next) {
    next.focus();
    next.select();
  } else {
    current.blur();
  }
}

// ---------------------------------------------------------------------------
// Quantité comptée d'une ligne
// ---------------------------------------------------------------------------

function QuantiteComptee({
  ligne,
  onCompter,
  onEffacer,
}: {
  ligne: InventaireLigne;
  onCompter: (ligne: InventaireLigne, quantite: number) => Promise<boolean>;
  onEffacer: (ligne: InventaireLigne) => Promise<boolean>;
}) {
  const saved = ligne.quantite_comptee === null ? '' : String(ligne.quantite_comptee);
  const [text, setText] = useState(saved);
  const [saving, setSaving] = useState(false);

  // La ligne a changé côté serveur (scan, autre poste) : on reprend sa valeur.
  useEffect(() => {
    setText(saved);
  }, [saved]);

  const commit = async () => {
    const cleaned = text.replace(/\s/g, '');
    if (cleaned === saved) return;
    if (cleaned !== '' && !/^\d{1,7}$/.test(cleaned)) {
      toast.error('Saisissez une quantité entière, sans signe ni virgule.');
      setText(saved);
      return;
    }
    setSaving(true);
    const ok = cleaned === '' ? await onEffacer(ligne) : await onCompter(ligne, Number(cleaned));
    setSaving(false);
    if (!ok) setText(saved);
  };

  return (
    <Input
      data-count-input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      disabled={saving}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          focusNextCountInput(e.currentTarget);
        }
        if (e.key === 'Escape') setText(saved);
      }}
      aria-label={`Quantité comptée de ${ligne.produit_nom}`}
      placeholder="—"
      className="ms-auto h-11 w-24 text-right tabular-nums sm:h-9"
    />
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function ValiderDialog({
  inventaire,
  open,
  onOpenChange,
  onValidated,
}: {
  inventaire: Inventaire;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onValidated: () => void;
}) {
  const [nonComptes, setNonComptes] = useState<'ignorer' | 'zero'>('ignorer');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setNonComptes('ignorer');
  }, [open]);

  const restants = inventaire.nb_lignes - inventaire.nb_comptees;
  const rienAValider = inventaire.nb_comptees === 0 && (restants === 0 || nonComptes === 'ignorer');

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await inventaireService.valider(inventaire.id, nonComptes);
      toast.success(
        result.lignes_ajustees === 0
          ? `Inventaire ${result.numero} validé : aucun écart, le stock est inchangé`
          : `Inventaire ${result.numero} validé : ${plural(result.lignes_ajustees, 'produit ajusté', 'produits ajustés')}`
      );
      onOpenChange(false);
      onValidated();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de valider l’inventaire. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Valider l’inventaire {inventaire.numero} ?</DialogTitle>
          <DialogDescription>
            Chaque écart devient un ajustement de stock à {inventaire.location_nom}. La validation est
            définitive : l’inventaire ne pourra plus être modifié.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p>
            {plural(inventaire.nb_comptees, 'produit compté', 'produits comptés')} sur{' '}
            {formatNumber(inventaire.nb_lignes)}
            {inventaire.nb_ecarts !== undefined && (
              <>
                , {plural(inventaire.nb_ecarts, 'écart', 'écarts')} ({signed(inventaire.unites_en_plus ?? 0)} /{' '}
                {signed(-(inventaire.unites_en_moins ?? 0))} unités)
              </>
            )}
            {inventaire.valeur_ecart !== undefined && inventaire.nb_comptees > 0 && (
              <> — valeur de l’écart : {formatSignedCurrency(inventaire.valeur_ecart)}</>
            )}
          </p>

          {restants > 0 && (
            <div className="space-y-2">
              <ChoiceGroup
                label={`${plural(restants, 'produit non compté', 'produits non comptés')}`}
                value={nonComptes}
                onValueChange={setNonComptes}
                options={[
                  { value: 'ignorer', label: 'Garder leur stock' },
                  { value: 'zero', label: 'Les sortir du stock' },
                ]}
                aria-describedby="non-comptes-aide"
              />
              <p id="non-comptes-aide" className="text-xs text-muted-foreground">
                {nonComptes === 'zero'
                  ? 'Un produit non compté est tenu pour absent : tout son stock est sorti. À choisir seulement si tout l’emplacement a vraiment été compté.'
                  : 'Un produit non compté n’est pas ajusté : son stock reste tel quel.'}
              </p>
            </div>
          )}

          {rienAValider && (
            <p className="text-warning-700">Aucun produit n’est compté : il n’y a rien à valider.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="touch" onClick={() => onOpenChange(false)}>
            Continuer le comptage
          </Button>
          <Button
            type="button"
            size="touch"
            className="gap-2"
            disabled={submitting || rienAValider}
            onClick={() => void submit()}
          >
            {submitting && <Spinner />}
            Valider et ajuster le stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ScanFeedback = { kind: 'ok' | 'erreur'; text: string } | null;

export default function InventairePhysiqueDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { hasRole } = useAuth();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const patchParams = useSearchParamsPatch();

  // Mêmes rôles que l'API : valider et annuler reviennent au gérant et à l'administrateur.
  const responsable = hasRole('admin', 'manager');

  const [inventaire, setInventaire] = useState<Inventaire | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [lignes, setLignes] = useState<InventaireLigne[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [lignesLoading, setLignesLoading] = useState(true);
  const [lignesError, setLignesError] = useState<unknown>(null);

  const [validerOpen, setValiderOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // Filtre, recherche et page vivent dans l'adresse.
  const filtreParam = searchParams.get('filtre');
  const filtre: InventaireFiltreLignes = isFiltre(filtreParam) ? filtreParam : 'tous';
  const query = searchParams.get('q') ?? '';
  const pageParam = Number(searchParams.get('page'));
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

  const [searchText, setSearchText] = useState(query);
  useEffect(() => {
    setSearchText(query);
  }, [query]);
  useEffect(() => {
    if (searchText.trim() === query) return;
    const timer = window.setTimeout(() => patchParams({ q: searchText.trim(), page: null }), 300);
    return () => window.clearTimeout(timer);
  }, [searchText, query, patchParams]);

  const loadInventaire = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        setInventaire(await inventaireService.getById(id));
      } catch (err) {
        // Un rafraîchissement silencieux raté ne remplace pas la page par une erreur.
        if (!silent) setError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id]
  );

  // Une réponse lente ne remplace jamais celle d'une requête plus récente.
  const lignesSeq = useRef(0);
  const loadLignes = useCallback(
    async (silent = false) => {
      const seq = ++lignesSeq.current;
      if (!silent) {
        setLignesLoading(true);
        setLignesError(null);
      }
      try {
        const res = await inventaireService.getLignes(id, { search: query, filtre, page, limit: LIMIT });
        if (seq !== lignesSeq.current) return;
        setLignes(res.data ?? []);
        setTotal(res.pagination?.total ?? 0);
        setTotalPages(res.pagination?.totalPages ?? 0);
        setLignesError(null);
      } catch (err) {
        if (seq !== lignesSeq.current) return;
        if (!silent) setLignesError(err);
      } finally {
        if (seq === lignesSeq.current && !silent) setLignesLoading(false);
      }
    },
    [id, query, filtre, page]
  );

  useEffect(() => {
    void loadInventaire();
  }, [loadInventaire]);

  useEffect(() => {
    void loadLignes();
  }, [loadLignes]);

  const enCours = inventaire?.statut === 'en_cours';
  const voitEcarts = inventaire?.voit_ecarts === true;
  const voitValeurs = inventaire?.voit_valeurs === true;

  // ---- Comptage --------------------------------------------------------

  const applyLigne = (updated: InventaireLigne) =>
    setLignes((rows) => rows.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));

  const compter = async (ligne: InventaireLigne, quantite: number): Promise<boolean> => {
    try {
      applyLigne(await inventaireService.compter(id, { produit_id: ligne.produit_id, quantite, mode: 'fixer' }));
      void loadInventaire(true);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Le comptage n’a pas été enregistré. Réessayez.'));
      return false;
    }
  };

  const effacer = async (ligne: InventaireLigne): Promise<boolean> => {
    try {
      await inventaireService.effacerComptage(id, ligne.id);
      applyLigne({ ...ligne, quantite_comptee: null, ecart: null, valeur_ecart: null, compte_le: null });
      void loadInventaire(true);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Le comptage n’a pas été effacé. Réessayez.'));
      return false;
    }
  };

  const scanner = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value || scanning) return;
    setScanning(true);
    try {
      const ligne = await inventaireService.compter(id, { code: value, quantite: 1, mode: 'ajouter' });
      setFeedback({
        kind: 'ok',
        text: `${ligne.produit_nom} : ${plural(ligne.quantite_comptee ?? 0, 'compté', 'comptés')}${
          ligne.ajoutee_a_la_feuille ? ' — ajouté à la feuille' : ''
        }`,
      });
      setCode('');
      void loadInventaire(true);
      void loadLignes(true);
    } catch (err) {
      setFeedback({ kind: 'erreur', text: getErrorMessage(err, 'Le comptage n’a pas été enregistré. Réessayez.') });
      scanRef.current?.select();
    } finally {
      setScanning(false);
      scanRef.current?.focus();
    }
  };

  // ---- Actions d'en-tête ---------------------------------------------------

  const annuler = async () => {
    if (!inventaire) return;
    const ok = await confirm({
      title: `Annuler l’inventaire ${inventaire.numero} ?`,
      description: 'Les comptages saisis sont abandonnés. Le stock ne change pas.',
      confirmLabel: 'Annuler l’inventaire',
      cancelLabel: 'Garder l’inventaire',
      destructive: true,
    });
    if (!ok) return;
    try {
      await inventaireService.annuler(inventaire.id);
      toast.success(`Inventaire ${inventaire.numero} annulé`);
      void loadInventaire(true);
      void loadLignes(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’annuler l’inventaire. Réessayez.'));
    }
  };

  const exporter = async () => {
    if (!inventaire || exporting) return;
    setExporting(true);
    try {
      const rows: InventaireLigne[] = [];
      for (let p = 1; ; p++) {
        const res = await inventaireService.getLignes(inventaire.id, { page: p, limit: 100 });
        rows.push(...(res.data ?? []));
        if (p >= (res.pagination?.totalPages ?? 1)) break;
      }
      const headers = ['Produit', 'Référence', 'Code-barres', 'Compté'];
      if (voitEcarts) headers.push('Stock attendu', 'Écart');
      if (voitValeurs) headers.push('Coût unitaire', 'Valeur de l’écart');
      downloadCsv(
        `inventaire-${inventaire.numero}.csv`,
        headers,
        rows.map((l) => [
          l.produit_nom,
          l.reference,
          l.code_barre ?? '',
          l.quantite_comptee ?? '',
          ...(voitEcarts ? [l.quantite_theorique ?? '', l.ecart ?? ''] : []),
          ...(voitValeurs ? [l.cmp ?? '', l.valeur_ecart ?? ''] : []),
        ])
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'L’export a échoué. Réessayez.'));
    } finally {
      setExporting(false);
    }
  };

  // ---- Branches de rendu ---------------------------------------------------

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <PageShell title="Inventaire physique" backTo="/inventaire-physique" width="wide">
        <EmptyState icon={ClipboardCheck} title="Cet inventaire n’existe pas" />
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell title="Inventaire physique" backTo="/inventaire-physique" width="wide">
        <div aria-busy="true" className="space-y-4">
          <CardSkeleton lines={2} />
          <TableSkeleton rows={8} columns={4} />
        </div>
      </PageShell>
    );
  }

  if (error || !inventaire) {
    return (
      <PageShell title="Inventaire physique" backTo="/inventaire-physique" width="wide">
        <QueryErrorState
          error={error}
          title="Impossible de charger l’inventaire"
          onRetry={() => void loadInventaire()}
        />
      </PageShell>
    );
  }

  const restants = inventaire.nb_lignes - inventaire.nb_comptees;

  const tiles: StatTile[] = [
    {
      label: 'Produits comptés',
      value: `${formatNumber(inventaire.nb_comptees)} / ${formatNumber(inventaire.nb_lignes)}`,
      hint:
        inventaire.nb_lignes === 0
          ? undefined
          : restants > 0
            ? `${formatNumber(restants)} à compter`
            : 'Feuille complète',
    },
  ];
  if (voitEcarts) {
    tiles.push({
      label: 'Écarts',
      value: formatNumber(inventaire.nb_ecarts ?? 0),
      hint:
        (inventaire.nb_ecarts ?? 0) > 0
          ? `${signed(inventaire.unites_en_plus ?? 0)} / ${signed(-(inventaire.unites_en_moins ?? 0))} unités`
          : undefined,
    });
  }
  if (voitValeurs) {
    tiles.push({
      label: 'Valeur de l’écart',
      value: inventaire.nb_comptees > 0 ? formatSignedCurrency(inventaire.valeur_ecart) : '—',
      tone: (inventaire.valeur_ecart ?? 0) < 0 ? 'text-danger-700' : undefined,
    });
  }

  const description = [
    inventaire.location_nom,
    inventaire.categorie,
    `ouvert le ${formatDate(inventaire.created_at)}${inventaire.cree_par_nom ? ` par ${inventaire.cree_par_nom}` : ''}`,
    inventaire.statut === 'valide' && inventaire.date_validation
      ? `validé le ${formatDate(inventaire.date_validation)}${
          inventaire.valide_par_nom ? ` par ${inventaire.valide_par_nom}` : ''
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const columnCount = 2 + (voitEcarts ? 2 : 0) + (voitValeurs ? 1 : 0);

  const emptyTitle = query
    ? `Aucun produit ne correspond à « ${query} »`
    : filtre === 'a_compter'
      ? 'Tous les produits de la feuille sont comptés'
      : filtre === 'comptes'
        ? 'Aucun produit n’est encore compté'
        : filtre === 'ecarts'
          ? 'Aucun écart pour le moment'
          : 'La feuille est vide';
  const emptyDescription =
    !query && filtre === 'tous'
      ? enCours
        ? 'Aucun produit n’est en stock à cet emplacement. Scannez un article pour l’ajouter à la feuille'
        : undefined
      : query
        ? 'Vérifiez le nom, la référence ou le code-barres'
        : undefined;

  const produitCell = (l: InventaireLigne) => (
    <div className="min-w-0">
      <p className="break-words">{l.produit_nom}</p>
      <p className="text-xs text-muted-foreground">
        <DocumentCode>{l.reference}</DocumentCode>
      </p>
    </div>
  );

  const compteCell = (l: InventaireLigne) =>
    enCours ? (
      <QuantiteComptee ligne={l} onCompter={compter} onEffacer={effacer} />
    ) : l.quantite_comptee === null ? (
      <span className="text-muted-foreground">Non compté</span>
    ) : (
      formatNumber(l.quantite_comptee)
    );

  return (
    <PageShell
      title={inventaire.numero}
      documentTitle={`Inventaire ${inventaire.numero}`}
      backTo="/inventaire-physique"
      width="wide"
      meta={<StatusBadge type="inventaire" statut={inventaire.statut} size="md" />}
      description={description}
      actions={
        <Button variant="outline" onClick={() => void exporter()} disabled={exporting} className="gap-2">
          {exporting && <Spinner />}
          Exporter en CSV
        </Button>
      }
      primaryAction={
        responsable && enCours ? (
          <Button onClick={() => setValiderOpen(true)}>Valider l’inventaire</Button>
        ) : undefined
      }
      moreActions={[
        responsable && enCours && { label: 'Annuler l’inventaire', destructive: true, onSelect: () => void annuler() },
      ]}
    >
      <StatsBar tiles={tiles} />

      {inventaire.notes && <p className="max-w-prose text-sm text-muted-foreground">{inventaire.notes}</p>}

      {enCours && (
        <Card>
          <CardContent inset="standalone">
            <form onSubmit={scanner} className="space-y-2">
              <Label htmlFor="inventaire-scan">Scanner un article</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ScanBarcode
                    className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="inventaire-scan"
                    ref={scanRef}
                    autoFocus
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Code-barres ou référence"
                    aria-describedby="inventaire-scan-aide"
                    className="h-11 ps-9 font-mono sm:h-10"
                  />
                </div>
                <Button type="submit" variant="outline" size="touch" disabled={scanning || !code.trim()} className="gap-2">
                  {scanning && <Spinner />}
                  Compter 1
                </Button>
              </div>
              <p id="inventaire-scan-aide" className="text-xs text-muted-foreground">
                Chaque passage du lecteur ajoute une unité. Pour saisir une quantité entière, utilisez la colonne
                « Compté » de la feuille
                {inventaire.comptage_aveugle && !voitEcarts && ' — comptage à l’aveugle : le stock attendu est masqué'}
              </p>
              {feedback?.kind === 'ok' && (
                <p role="status" className="text-sm text-success-700">
                  {feedback.text}
                </p>
              )}
              {feedback?.kind === 'erreur' && (
                <p role="alert" className="text-sm text-danger-700">
                  {feedback.text}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent inset="standalone" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer la feuille">
              {FILTRES.filter((f) => !f.ecarts || voitEcarts).map((f) => (
                <ToggleChip
                  key={f.value}
                  pressed={filtre === f.value}
                  onPressedChange={() => patchParams({ filtre: f.value === 'tous' ? null : f.value, page: null })}
                >
                  {f.label}
                </ToggleChip>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Nom, référence ou code-barres"
                aria-label="Rechercher un produit dans la feuille"
                className="h-11 ps-9 sm:h-9"
              />
            </div>
          </div>

          <QueryState
            loading={lignesLoading}
            error={lignesError}
            onRetry={() => void loadLignes()}
            skeleton={<TableSkeleton rows={8} columns={columnCount} />}
            errorTitle="Impossible de charger la feuille de comptage"
            isEmpty={lignes.length === 0}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            emptyIcon={ClipboardCheck}
            compact
          >
            <ResponsiveTable
              table={
                <Table aria-label={`Feuille de comptage de l’inventaire ${inventaire.numero}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      {voitEcarts && <TableHead numeric>Stock attendu</TableHead>}
                      <TableHead numeric>Compté</TableHead>
                      {voitEcarts && <TableHead numeric>Écart</TableHead>}
                      {voitValeurs && <TableHead numeric>Valeur de l’écart</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lignes.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{produitCell(l)}</TableCell>
                        {voitEcarts && <TableCell numeric>{formatNumber(l.quantite_theorique ?? 0)}</TableCell>}
                        <TableCell numeric>{compteCell(l)}</TableCell>
                        {voitEcarts && (
                          <TableCell numeric>
                            <Ecart value={l.quantite_comptee === null ? null : l.ecart} />
                          </TableCell>
                        )}
                        {voitValeurs && (
                          <TableCell numeric>
                            {l.quantite_comptee === null || !l.ecart ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <Money value={l.valeur_ecart} tone="auto" signed />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={lignes.map((l) => (
                <DataCard
                  key={l.id}
                  title={l.produit_nom}
                  titleAs="h3"
                  wrapTitle
                  actions={enCours ? compteCell(l) : undefined}
                >
                  <DataCardRow label="Référence" value={<DocumentCode>{l.reference}</DocumentCode>} />
                  {voitEcarts && (
                    <DataCardRow label="Stock attendu" value={formatNumber(l.quantite_theorique ?? 0)} numeric />
                  )}
                  {!enCours && <DataCardRow label="Compté" value={compteCell(l)} numeric />}
                  {voitEcarts && (
                    <DataCardRow
                      label="Écart"
                      value={<Ecart value={l.quantite_comptee === null ? null : l.ecart} />}
                      numeric
                    />
                  )}
                </DataCard>
              ))}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={LIMIT}
              onPageChange={(p) => patchParams({ page: p === 1 ? null : p })}
            />
          </QueryState>

          {inventaire.statut === 'valide' && inventaire.date_validation && (
            <p className="text-xs text-muted-foreground">
              Écarts passés en ajustements de stock le {formatDateTime(inventaire.date_validation)}
            </p>
          )}
        </CardContent>
      </Card>

      {responsable && enCours && (
        <ValiderDialog
          inventaire={inventaire}
          open={validerOpen}
          onOpenChange={setValiderOpen}
          onValidated={() => {
            void loadInventaire(true);
            void loadLignes(true);
          }}
        />
      )}
    </PageShell>
  );
}
