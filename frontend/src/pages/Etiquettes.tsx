import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Barcode, Printer, X } from 'lucide-react';
import { produitService } from '@/services/api';
import { ProductCombobox } from '@/components/ProductCombobox';
import { NumericField } from '@/components/NumericField';
import { InlineNotice } from '@/components/SalesFormParts';
import { useOptionalAuth } from '@/lib/AuthContext';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChoiceGroup } from '@/components/ui/choice-chips';
import { DocumentCode } from '@/components/ui/document-code';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { Spinner } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';
import { formatNumber, toNumber } from '@/utils/format';
import { isPrintableBarcode } from '@/utils/barcode';
import {
  FORMATS_ETIQUETTE,
  buildEtiquettesHtml,
  codeLisible,
  developperCopies,
  formatEtiquette,
  type FormatEtiquette,
} from '@/utils/etiquettes';
import { printHtml } from '@/utils/print';
import { lineFieldLabel, plural } from '@/validation/salesForms';

/** Format choisi sur ce poste : l'imprimante est branchée ici. */
const FORMAT_KEY = 'etiquettes:format';
const COPIES_MAX = 500;
const TOTAL_MAX = 2000;

const ID = {
  search: 'etiquettes-produit-search',
  searchHint: 'etiquettes-produit-aide',
  debut: 'etiquettes-debut',
  prix: 'etiquettes-prix',
  copies: (i: number) => `etiquettes-ligne-${i}-copies`,
};

interface ProduitTrouve {
  id: number;
  nom: string;
  reference?: string | null;
  code_barre?: string | null;
  prix_vente?: number | string | null;
  stock?: number | string | null;
}

interface Ligne {
  id: number;
  nom: string;
  reference: string;
  code: string | null;
  prix: number | null;
  stock: number;
  copies: number;
}

function toLigne(p: ProduitTrouve, copies = 1): Ligne {
  const code = p.code_barre?.trim() || null;
  const prix = toNumber(p.prix_vente ?? null);
  return {
    id: p.id,
    nom: p.nom,
    reference: p.reference ?? '',
    code,
    prix: prix !== null && prix > 0 ? prix : null,
    stock: Math.max(0, Math.floor(toNumber(p.stock ?? null) ?? 0)),
    copies,
  };
}

function readFormat(): FormatEtiquette {
  try {
    return formatEtiquette(localStorage.getItem(FORMAT_KEY)).value;
  } catch {
    return FORMATS_ETIQUETTE[0].value;
  }
}

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
}

export default function Etiquettes() {
  const auth = useOptionalAuth();
  const canCreateCodes = !!auth?.hasRole('admin', 'manager');
  const [searchParams] = useSearchParams();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargementInitial, setChargementInitial] = useState(false);
  const [format, setFormat] = useState<FormatEtiquette>(readFormat);
  const [debut, setDebut] = useState(1);
  const [afficherPrix, setAfficherPrix] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [announce, setAnnounce] = useState('');

  const f = formatEtiquette(format);
  const parPage = f.colonnes * f.lignes;

  // Produits passés par l'inventaire (`/etiquettes?produits=1,2`).
  const idsUrl = searchParams.get('produits');
  useEffect(() => {
    const ids = parseIds(idsUrl);
    if (ids.length === 0) return;
    let cancelled = false;
    setChargementInitial(true);
    Promise.allSettled(ids.map((id) => produitService.getById(id)))
      .then((results) => {
        if (cancelled) return;
        const trouves = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [toLigne(r.value as ProduitTrouve)] : []));
        setLignes((current) => {
          const deja = new Set(current.map((l) => l.id));
          return [...current, ...trouves.filter((l) => !deja.has(l.id))];
        });
        const manquants = results.length - trouves.length;
        if (manquants > 0) {
          toast.error(
            manquants === 1
              ? 'Un produit n’a pas pu être chargé : ajoutez-le par la recherche.'
              : `${manquants} produits n’ont pas pu être chargés : ajoutez-les par la recherche.`
          );
        }
      })
      .finally(() => {
        if (!cancelled) setChargementInitial(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idsUrl]);

  const searchProducts = useCallback(async (q: string): Promise<ProduitTrouve[]> => {
    const rows = await produitService.searchFuzzy(q, 20);
    return Array.isArray(rows) ? (rows as ProduitTrouve[]) : [];
  }, []);

  const addProduit = (p: ProduitTrouve) => {
    setLignes((current) => {
      const index = current.findIndex((l) => l.id === p.id);
      if (index >= 0) return current.map((l, i) => (i === index ? { ...l, copies: Math.min(COPIES_MAX, l.copies + 1) } : l));
      return [...current, toLigne(p)];
    });
  };

  const setCopies = (index: number, copies: number) =>
    setLignes((current) => current.map((l, i) => (i === index ? { ...l, copies } : l)));

  const retirer = (index: number) => {
    const nom = lignes[index]?.nom;
    setLignes((current) => current.filter((_, i) => i !== index));
    if (nom) setAnnounce(`${nom} retiré de la liste.`);
    document.getElementById(ID.search)?.focus();
  };

  const unParArticle = () => setLignes((current) => current.map((l) => ({ ...l, copies: Math.min(COPIES_MAX, l.stock) })));

  // --- Contrôles ---------------------------------------------------------------
  const sansCode = lignes.filter((l) => !isPrintableBarcode(l.code));
  const illisibles = lignes.filter((l) => isPrintableBarcode(l.code) && !codeLisible(l.code, format));
  const imprimables = lignes.filter((l) => isPrintableBarcode(l.code) && codeLisible(l.code!, format));
  const copiesValides = lignes.every((l) => Number.isInteger(l.copies) && l.copies >= 0 && l.copies <= COPIES_MAX);
  const total = imprimables.reduce((acc, l) => acc + (Number.isInteger(l.copies) ? l.copies : 0), 0);
  const debutEffectif = f.support === 'a4' ? Math.min(Math.max(1, Number.isInteger(debut) ? debut : 1), parPage) : 1;
  const feuilles = f.support === 'a4' ? Math.ceil((total + debutEffectif - 1) / parPage) : total;

  const etiquettes = useMemo(
    () =>
      developperCopies(imprimables).map((l) => ({ nom: l.nom, code: l.code!, prix: afficherPrix ? l.prix : null })),
    [imprimables, afficherPrix]
  );
  const apercu = useMemo(() => {
    const premier = imprimables[0];
    if (!premier) return null;
    return buildEtiquettesHtml([{ nom: premier.nom, code: premier.code!, prix: afficherPrix ? premier.prix : null }], {
      format,
      apercu: true,
    });
  }, [imprimables, afficherPrix, format]);

  const peutImprimer = total > 0 && total <= TOTAL_MAX && copiesValides && !printing;

  // --- Actions -----------------------------------------------------------------
  const choisirFormat = (value: FormatEtiquette) => {
    setFormat(value);
    try {
      localStorage.setItem(FORMAT_KEY, value);
    } catch {
      /* préférence pour cette session seulement */
    }
  };

  const genererCodes = async () => {
    if (sansCode.length === 0) return;
    setGenerating(true);
    try {
      const { produits, message } = await produitService.genererCodesBarres(sansCode.map((l) => l.id));
      const parId = new Map(produits.map((p) => [p.produit_id, p.code_barre]));
      setLignes((current) => current.map((l) => (parId.has(l.id) ? { ...l, code: parId.get(l.id) ?? l.code } : l)));
      toast.success(message || 'Codes-barres créés.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer les codes-barres. Réessayez.'));
    } finally {
      setGenerating(false);
    }
  };

  const imprimer = async () => {
    if (!peutImprimer) return;
    setPrinting(true);
    try {
      await printHtml(buildEtiquettesHtml(etiquettes, { format, debut: debutEffectif }));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de lancer l’impression. Réessayez.'));
    } finally {
      setPrinting(false);
    }
  };

  const libelleImprimer =
    total === 0 ? 'Imprimer les étiquettes' : `Imprimer ${plural(total, 'étiquette', 'étiquettes')}`;

  return (
    <PageShell
      title="Étiquettes"
      description="Codes-barres à coller sur les articles, pour les passer à la douchette en caisse"
      width="wide"
      primaryAction={
        <Button size="touch" className="gap-2" disabled={!peutImprimer} onClick={() => void imprimer()}>
          {printing ? <Spinner /> : <Printer className="h-4 w-4" aria-hidden="true" />}
          {libelleImprimer}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Produits</CardTitle>
            <CardDescription id={ID.searchHint}>
              Cherchez par nom, référence ou code-barres. Un produit ajouté deux fois passe à 2 étiquettes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={ID.search}>Ajouter un produit</Label>
              <ProductCombobox<ProduitTrouve>
                id={ID.search}
                search={searchProducts}
                onSelect={addProduit}
                describedBy={ID.searchHint}
                addedMessage={(p) => `${p.nom} ajouté.`}
                noResultsHint="Vérifiez l’orthographe ou le code."
                renderOption={(p) => (
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.nom}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.code_barre ? <DocumentCode>{p.code_barre}</DocumentCode> : 'Sans code-barres'}
                      </span>
                    </span>
                    {toNumber(p.prix_vente ?? null) ? <Money value={p.prix_vente} className="shrink-0" /> : null}
                  </span>
                )}
              />
            </div>

            <p role="status" className="sr-only">
              {announce}
            </p>

            {sansCode.length > 0 && (
              <InlineNotice tone="warning">
                <span className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {sansCode.length === 1
                      ? '1 produit n’a pas de code-barres : il ne sera pas imprimé.'
                      : `${sansCode.length} produits n’ont pas de code-barres : ils ne seront pas imprimés.`}
                    {!canCreateCodes && ' Demandez à un gérant de les créer.'}
                  </span>
                  {canCreateCodes && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-2"
                      disabled={generating}
                      onClick={() => void genererCodes()}
                    >
                      {generating ? <Spinner /> : <Barcode className="h-4 w-4" aria-hidden="true" />}
                      {sansCode.length === 1 ? 'Créer le code-barres' : 'Créer les codes-barres'}
                    </Button>
                  )}
                </span>
              </InlineNotice>
            )}

            {chargementInitial && lignes.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Chargement des produits…
              </p>
            ) : lignes.length === 0 ? (
              <div className="rounded-md bg-muted/40">
                <EmptyState
                  compact
                  icon={Barcode}
                  title="Aucun produit à étiqueter"
                  description="Ajoutez des produits ici, ou depuis l’inventaire avec « Imprimer l’étiquette »"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{plural(lignes.length, 'produit', 'produits')}</p>
                  <Button type="button" variant="ghost" size="sm" onClick={unParArticle}>
                    Une étiquette par article en stock
                  </Button>
                </div>
                <ul aria-label="Produits à étiqueter" className="divide-y rounded-md border">
                  {lignes.map((l, i) => {
                    const lisible = isPrintableBarcode(l.code) && codeLisible(l.code, format);
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="font-medium">{l.nom}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.code ? <DocumentCode>{l.code}</DocumentCode> : 'Sans code-barres'}
                            {' · '}
                            {l.prix !== null ? <Money value={l.prix} /> : 'Sans prix'}
                            {' · '}
                            {formatNumber(l.stock)} en stock
                          </p>
                          {l.code && !lisible && (
                            <p className="mt-1 flex items-start gap-1 text-xs text-warning-700">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                              {isPrintableBarcode(l.code)
                                ? 'Code trop long pour ce format : choisissez une étiquette plus large.'
                                : 'Ce code contient des caractères impossibles à imprimer en code-barres.'}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={ID.copies(i)} className="text-xs text-muted-foreground">
                            Étiquettes
                          </Label>
                          <NumericField
                            id={ID.copies(i)}
                            mode="integer"
                            value={l.copies}
                            onValueChange={(v) => setCopies(i, v)}
                            aria-label={lineFieldLabel('Nombre d’étiquettes', l.nom)}
                            aria-invalid={
                              !(Number.isInteger(l.copies) && l.copies >= 0 && l.copies <= COPIES_MAX) ? true : undefined
                            }
                            className="h-9 w-16 px-2 text-center"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                          aria-label={`Retirer ${l.nom} de la liste`}
                          title="Retirer de la liste"
                          onClick={() => retirer(i)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>Format</CardTitle>
            <CardDescription>Retenu sur ce poste pour la prochaine fois</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ChoiceGroup<FormatEtiquette>
              label="Format d’étiquette"
              hideLabel
              value={format}
              onValueChange={choisirFormat}
              options={FORMATS_ETIQUETTE.map((fmt) => ({ value: fmt.value, label: fmt.label }))}
              layout="wrap"
              shape="tile"
              size="touch"
            />
            <p className="text-xs text-muted-foreground">{f.description}</p>

            {f.support === 'a4' && (
              <div className="space-y-1.5">
                <Label htmlFor={ID.debut}>Commencer à l’étiquette n°</Label>
                <NumericField
                  id={ID.debut}
                  mode="integer"
                  value={debut}
                  onValueChange={setDebut}
                  aria-describedby={`${ID.debut}-help`}
                  className="h-9 w-20"
                />
                <p id={`${ID.debut}-help`} className="text-xs text-muted-foreground">
                  Sur une planche entamée : de 1 à {parPage}, ligne par ligne
                </p>
              </div>
            )}

            <label htmlFor={ID.prix} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                id={ID.prix}
                type="checkbox"
                checked={afficherPrix}
                onChange={(e) => setAfficherPrix(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Imprimer le prix de vente
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium">Aperçu</p>
              {apercu ? (
                <div className="flex justify-center overflow-hidden rounded-md bg-muted/50 p-4">
                  <iframe
                    title="Aperçu de l’étiquette"
                    srcDoc={apercu}
                    tabIndex={-1}
                    scrolling="no"
                    // Agrandi jusqu'à ×1,5 pour l'écran, jamais plus large que la colonne ;
                    // l'impression reste à la taille réelle.
                    style={{ width: '100%', maxWidth: `${f.largeur * 1.5}mm`, aspectRatio: `${f.largeur} / ${f.hauteur}` }}
                    className="pointer-events-none rounded-sm bg-white shadow-sm ring-1 ring-black/[.08]"
                    onLoad={(e) => {
                      const frame = e.currentTarget;
                      const body = frame.contentDocument?.body;
                      const labelPx = (f.largeur * 96) / 25.4;
                      if (body && frame.clientWidth > 0) body.style.zoom = String(frame.clientWidth / labelPx);
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">L’aperçu apparaît avec le premier produit imprimable</p>
              )}
            </div>

            <div className="space-y-1 border-t pt-4 text-sm">
              <p>
                {total === 0
                  ? 'Rien à imprimer'
                  : f.support === 'a4'
                    ? `${plural(total, 'étiquette', 'étiquettes')} sur ${plural(feuilles, 'planche', 'planches')}`
                    : `${plural(total, 'étiquette', 'étiquettes')} sur le rouleau`}
              </p>
              {total > TOTAL_MAX && (
                <p className="text-warning-700">
                  {formatNumber(TOTAL_MAX)} étiquettes au plus par impression : réduisez les quantités.
                </p>
              )}
              {illisibles.length > 0 && (
                <p className="text-warning-700">
                  {plural(illisibles.length, 'produit ignoré', 'produits ignorés')} : code trop long pour ce format.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Dans la fenêtre d’impression : échelle 100&nbsp;% et marges «&nbsp;Aucune&nbsp;»
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
