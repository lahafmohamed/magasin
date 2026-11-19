import * as React from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { plural } from '@/validation/salesForms';

/** Champs minimaux d'un produit proposé (résultat de `searchFuzzy`). */
export interface ProductOptionBase {
  id: number;
  nom: string;
  reference?: string | null;
  code_barre?: string | null;
}

export interface ProductComboboxProps<P extends ProductOptionBase> {
  /** `id` du champ, pour le `<Label htmlFor>` de la page. */
  id: string;
  /**
   * Une recherche = une requête. Appelée après 250 ms de pause, ou tout de
   * suite sur Entrée. Lue au moment de l'appel : inutile de la mémoïser.
   */
  search: (query: string) => Promise<P[]>;
  /**
   * Clé des paramètres de recherche (emplacement de vente…) : quand elle
   * change, les résultats affichés sont périmés et la recherche est relancée.
   */
  searchKey?: string | number | null;
  /** Ajoute le produit au document. */
  onSelect: (product: P) => void;
  /** Contenu d'une option (nom, référence, stock, prix). */
  renderOption: (product: P, state: { disabledReason: string | null }) => React.ReactNode;
  /** Raison pour laquelle un produit ne peut pas être ajouté (prix manquant), sinon `null`. */
  getDisabledReason?: (product: P) => string | null;
  /** Message annoncé après l'ajout (« HP ProBook ajouté à la facture. »). */
  addedMessage?: (product: P) => string;
  placeholder?: string;
  /** Explication sous « Aucun produit ne correspond à … ». */
  noResultsHint?: string;
  /** Aide sous le champ, reliée par `aria-describedby`. */
  describedBy?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
  /** Nombre de caractères avant de chercher (défaut 2, comme le serveur). */
  minChars?: number;
  /** Pause de frappe avant la recherche (défaut 250 ms). */
  debounceMs?: number;
  className?: string;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

/** Correspondance sans ambiguïté : code-barres exact, puis référence exacte. */
function exactMatch<P extends ProductOptionBase>(results: P[], query: string): P | undefined {
  const q = query.trim();
  if (!q) return undefined;
  const byBarcode = results.find((p) => p.code_barre && p.code_barre === q);
  if (byBarcode) return byBarcode;
  const lower = q.toLocaleLowerCase('fr-FR');
  return results.find((p) => p.reference && p.reference.toLocaleLowerCase('fr-FR') === lower);
}

/**
 * Recherche de produit des documents de vente : combobox ARIA (flèches,
 * Entrée, Échap, option active annoncée), pensée pour la douchette.
 *
 * - Une requête par pause de frappe (250 ms), jamais une par caractère : un
 *   code EAN-13 scanné faisait 12 requêtes et épuisait la limite de l'API.
 * - Entrée ne soumet JAMAIS le formulaire parent. Elle ajoute le produit
 *   désigné : l'option surlignée, sinon le code-barres ou la référence exacts,
 *   sinon l'unique résultat ; sinon la liste s'ouvre pour choisir aux flèches.
 *   Sur un scan (code puis Entrée), la recherche part immédiatement : une seule
 *   requête par article.
 * - Un code-barres exact trouvé par la recherche différée est ajouté sans
 *   Entrée (douchettes réglées sans suffixe).
 * - Le focus reste dans le champ après l'ajout : on enchaîne les articles.
 */
export function ProductCombobox<P extends ProductOptionBase>({
  id,
  search,
  searchKey = null,
  onSelect,
  renderOption,
  getDisabledReason,
  addedMessage,
  placeholder = 'Nom, référence ou code-barres…',
  noResultsHint,
  describedBy,
  'aria-invalid': ariaInvalid,
  disabled = false,
  minChars = 2,
  debounceMs = 250,
  className,
}: ProductComboboxProps<P>) {
  const listId = `${id}-options`;
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<P[]>([]);
  const [resultsFor, setResultsFor] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<Status>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [announce, setAnnounce] = React.useState('');

  const searchRef = React.useRef(search);
  searchRef.current = search;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = React.useRef(0);
  const inflight = React.useRef<{ query: string; promise: Promise<P[] | null> } | null>(null);
  const resolving = React.useRef(false);
  const optionRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  // Dernière recherche aboutie, lue de façon synchrone par le gestionnaire d'Entrée.
  const lastResults = React.useRef<{ query: string; results: P[] } | null>(null);

  const reasonOf = (p: P) => (getDisabledReason ? getDisabledReason(p) : null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /** Rend périmée toute recherche en cours ou déjà reçue. */
  const invalidate = () => {
    clearTimer();
    requestSeq.current += 1;
    inflight.current = null;
    lastResults.current = null;
  };

  /** Lance UNE recherche ; ignore la réponse si une recherche plus récente est partie. */
  const runSearch = (q: string): Promise<P[] | null> => {
    if (inflight.current?.query === q) return inflight.current.promise;
    const seq = ++requestSeq.current;
    setStatus('loading');
    setError(null);
    setAnnounce('Recherche…');
    const promise = searchRef
      .current(q)
      .then((rows) => {
        if (seq !== requestSeq.current) return null;
        const list = Array.isArray(rows) ? rows : [];
        lastResults.current = { query: q, results: list };
        setResults(list);
        setResultsFor(q);
        setStatus('done');
        setActive(-1);
        setAnnounce(
          list.length === 0 ? 'Aucun produit trouvé' : plural(list.length, 'produit trouvé', 'produits trouvés')
        );
        return list;
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return null;
        const message = getErrorMessage(err, 'La recherche de produits a échoué. Réessayez.');
        setResults([]);
        setResultsFor(q);
        setStatus('error');
        setError(message);
        setAnnounce(message);
        return null;
      })
      .finally(() => {
        if (inflight.current?.query === q && inflight.current.promise === promise) inflight.current = null;
      });
    inflight.current = { query: q, promise };
    return promise;
  };

  const reset = () => {
    invalidate();
    setQuery('');
    setResults([]);
    setResultsFor(null);
    setStatus('idle');
    setError(null);
    setActive(-1);
    setOpen(false);
  };

  const pick = (product: P) => {
    const reason = reasonOf(product);
    if (reason) {
      // Produit non vendable (prix manquant) : on le montre, raison comprise.
      setOpen(true);
      const index = results.findIndex((p) => p.id === product.id);
      if (index >= 0) setActive(index);
      setAnnounce(`${product.nom} : ${reason}`);
      return;
    }
    onSelect(product);
    reset();
    setAnnounce(addedMessage ? addedMessage(product) : `${product.nom} ajouté.`);
  };

  // Paramètres de recherche changés (emplacement) : résultats périmés.
  const firstKey = React.useRef(true);
  React.useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    invalidate();
    setResultsFor(null);
    setStatus('idle');
    // `invalidate` ne touche qu'à des refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  // Recherche différée (frappe au clavier). Une saisie trop courte vide la liste.
  React.useEffect(() => {
    clearTimer();
    const q = query.trim();
    if (q.length < minChars) {
      invalidate();
      setResults([]);
      setResultsFor(null);
      setStatus('idle');
      setError(null);
      setActive(-1);
      return;
    }
    if (lastResults.current?.query === q || inflight.current?.query === q) return;
    setStatus('loading');
    timer.current = setTimeout(() => {
      timer.current = null;
      void runSearch(q);
    }, debounceMs);
    return clearTimer;
    // `runSearch` et `invalidate` lisent des refs ; `searchKey` relance la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, minChars, debounceMs, searchKey]);

  // Douchette sans suffixe Entrée : un code-barres exact arrivé par la
  // recherche différée est ajouté directement.
  React.useEffect(() => {
    if (status !== 'done' || resolving.current) return;
    const q = query.trim();
    if (resultsFor !== q) return;
    const match = results.find((p) => p.code_barre && p.code_barre === q);
    if (match && !reasonOf(match)) pick(match);
    // `pick` lit l'état courant ; seule l'arrivée de résultats doit déclencher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, resultsFor, status]);

  // Garde l'option active visible dans la liste défilante.
  React.useEffect(() => {
    if (active >= 0) optionRefs.current[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  React.useEffect(() => clearTimer, []);

  /** Entrée : ajoute le produit désigné sans jamais soumettre le formulaire. */
  const resolveEnter = async (raw: string) => {
    const q = raw.trim();
    if (q.length < minChars || resolving.current) return;
    if (open && active >= 0 && resultsFor === q && results[active]) {
      pick(results[active]);
      return;
    }
    clearTimer();
    resolving.current = true;
    try {
      const list = lastResults.current?.query === q ? lastResults.current.results : await runSearch(q);
      if (!list) return;
      const target = exactMatch(list, q) ?? (list.length === 1 ? list[0] : undefined);
      if (target) {
        pick(target);
        return;
      }
      setOpen(true);
      setActive(list.findIndex((p) => !reasonOf(p)));
    } finally {
      resolving.current = false;
    }
  };

  const move = (delta: 1 | -1) => {
    if (results.length === 0 || resultsFor !== query.trim()) return;
    setOpen(true);
    setActive((current) => {
      if (current < 0) return delta === 1 ? 0 : results.length - 1;
      return (current + delta + results.length) % results.length;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case 'Enter':
        // Toujours neutraliser : sinon Entrée (ou le scan) déclenchait la
        // soumission implicite du formulaire — une facture créée à moitié.
        e.preventDefault();
        void resolveEnter(e.currentTarget.value);
        break;
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Escape':
        if (open && (results.length > 0 || status !== 'idle')) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (query) {
          e.preventDefault();
          reset();
        }
        break;
      default:
        break;
    }
  };

  const trimmed = query.trim();
  const current = resultsFor === trimmed && trimmed.length >= minChars;
  const showList = open && current && results.length > 0;
  const showLoading = open && status === 'loading' && !showList && trimmed.length >= minChars;
  const showEmpty = open && current && status === 'done' && results.length === 0;
  const showError = open && current && status === 'error';
  const showPopup = showList || showLoading || showEmpty || showError;
  const activeId = showList && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <div
      className={cn('relative', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="pl-9 pr-9"
      />
      {status === 'loading' && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Spinner />
        </span>
      )}

      {/* Région vivante : nombre de résultats, ajout, erreur (routine → status). */}
      <p role="status" className="sr-only">
        {announce}
      </p>

      <div
        // Un clic dans la liste ne doit pas retirer le focus du champ.
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          'absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg',
          !showPopup && 'hidden'
        )}
      >
        <div
          id={listId}
          role="listbox"
          aria-label="Produits trouvés"
          hidden={!showList}
          className="max-h-80 overflow-y-auto py-1"
        >
          {showList &&
            results.map((p, i) => {
              const reason = reasonOf(p);
              const isActive = i === active;
              return (
                <div
                  key={p.id}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={reason ? true : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => {
                    if (active !== i) setActive(i);
                  }}
                  onClick={() => pick(p)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm',
                    isActive && 'bg-accent ring-2 ring-inset ring-ring',
                    reason && 'cursor-not-allowed'
                  )}
                >
                  {renderOption(p, { disabledReason: reason })}
                </div>
              );
            })}
        </div>

        {showLoading && (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Spinner /> Recherche…
          </p>
        )}
        {showEmpty && (
          <div className="px-3 py-4 text-sm">
            <p className="font-medium text-foreground">Aucun produit ne correspond à « {trimmed} ».</p>
            {noResultsHint && <p className="mt-1 text-muted-foreground">{noResultsHint}</p>}
          </div>
        )}
        {showError && (
          <p className="flex items-start gap-2 px-3 py-3 text-sm text-danger-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
