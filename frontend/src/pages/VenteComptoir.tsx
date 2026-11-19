import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Minus, Plus, Printer, ScanBarcode, X } from 'lucide-react';
import { caisseService, factureService, tiersService, ventesService, type VenteComptoirResult } from '@/services/api';
import { ProductCombobox } from '@/components/ProductCombobox';
import { NumericField } from '@/components/NumericField';
import { TiersPicker, type TiersPickerValue } from '@/components/TiersPicker';
import {
  InlineNotice,
  SalesLocationField,
  SalesProductOption,
  type SalesSearchProduct,
} from '@/components/SalesFormParts';
import { defaultLocationId, useLocationStock, useSalesLocations } from '@/components/useSalesStock';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { PageShell } from '@/components/ui/page-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChoiceGroup } from '@/components/ui/choice-chips';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DocumentCode } from '@/components/ui/document-code';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { MoneyInput } from '@/components/ui/money-input';
import { Spinner } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';
import { formatCurrency, toNumber } from '@/utils/format';
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from '@/utils/paymentMethod';
import { getValidSalePrice, saleDisabledReason } from '@/utils/salesPrice';
import { insufficientStockMessage, lineFieldLabel, plural } from '@/validation/salesForms';
import { printTicket } from '@/utils/ticket';
import { montantsProposes } from '@/utils/caisseComptoir';

/** Code du client de passage (`GET /tiers/comptoir`). */
const COMPTOIR_CODE = 'PASS';
/** Préférence du poste : l'imprimante est branchée sur ce poste, pas sur un autre. */
const AUTO_PRINT_KEY = 'vente-comptoir:impression-auto';

const ID = {
  search: 'comptoir-produit-search',
  searchHint: 'comptoir-produit-aide',
  location: 'comptoir-location',
  client: 'comptoir-client',
  recu: 'comptoir-especes-recues',
  quantite: (i: number) => `comptoir-ligne-${i}-quantite`,
};

interface Ligne {
  produit_id: number;
  nom: string;
  reference: string;
  prix: number;
  quantite: number;
}

type CaisseState =
  | { status: 'loading' }
  | { status: 'ouverte' }
  | { status: 'fermee'; magasinNom: string | null }
  | { status: 'inconnue' };

interface VenteTerminee {
  result: VenteComptoirResult;
  especesRecues: number | null;
}

function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return `comptoir-${c.randomUUID()}`;
  return `comptoir-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function readAutoPrint(): boolean {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAutoPrint(value: boolean) {
  try {
    localStorage.setItem(AUTO_PRINT_KEY, value ? '1' : '0');
  } catch {
    /* stockage indisponible : la préférence vaut pour la session seulement */
  }
}

function focusScan() {
  window.setTimeout(() => document.getElementById(ID.search)?.focus(), 0);
}

export default function VenteComptoir() {
  const canOpen = useRouteAccess();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [client, setClient] = useState<TiersPickerValue | null>(null);
  const [comptoir, setComptoir] = useState<TiersPickerValue | null>(null);
  const [changerClient, setChangerClient] = useState(false);
  const [methode, setMethode] = useState<PaymentMethod>('espece');
  const [recu, setRecu] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [vente, setVente] = useState<VenteTerminee | null>(null);
  const [printing, setPrinting] = useState(false);
  const [autoPrint, setAutoPrint] = useState(readAutoPrint);
  const [caisse, setCaisse] = useState<CaisseState>({ status: 'loading' });
  const [announce, setAnnounce] = useState('');
  const idempotencyKey = useRef(newIdempotencyKey());

  // --- Emplacement, stock, caisse -------------------------------------------
  const sales = useSalesLocations((list) => setLocationId((current) => defaultLocationId(list, current)));
  const stock = useLocationStock(locationId);

  const loadCaisse = useCallback(async () => {
    if (!locationId) return;
    setCaisse({ status: 'loading' });
    try {
      const magasins = await caisseService.getMagasins();
      const magasin = magasins.find((m) => Number(m.location_id) === locationId);
      if (!magasin) {
        setCaisse({ status: 'inconnue' });
        return;
      }
      const session = await caisseService.getSessionActive(magasin.id);
      setCaisse(session ? { status: 'ouverte' } : { status: 'fermee', magasinNom: magasin.nom ?? null });
    } catch {
      // Inconnue : le serveur tranchera (409 si la caisse est fermée).
      setCaisse({ status: 'inconnue' });
    }
  }, [locationId]);

  useEffect(() => {
    void loadCaisse();
  }, [loadCaisse]);

  // --- Client comptoir par défaut -------------------------------------------
  useEffect(() => {
    let cancelled = false;
    tiersService
      .getComptoir()
      .then((c) => {
        if (cancelled || !c) return;
        setComptoir(c);
        setClient((current) => current ?? c);
      })
      .catch(() => {
        /* pas de client comptoir : le caissier choisit le client */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    focusScan();
  }, []);

  // --- Lignes ------------------------------------------------------------------
  const searchProducts = useCallback(
    async (q: string): Promise<SalesSearchProduct[]> => {
      const rows = await ventesService.searchFuzzy(q, 20, locationId ?? undefined);
      return Array.isArray(rows) ? (rows as SalesSearchProduct[]) : [];
    },
    [locationId]
  );

  const addProduit = (p: SalesSearchProduct) => {
    const prix = getValidSalePrice(p.prix_vente);
    if (prix === null) return;
    setLignes((current) => {
      const index = current.findIndex((l) => l.produit_id === p.id);
      if (index >= 0) {
        return current.map((l, i) => (i === index ? { ...l, quantite: l.quantite + 1 } : l));
      }
      return [...current, { produit_id: p.id, nom: p.nom, reference: p.reference ?? '', prix, quantite: 1 }];
    });
  };

  const setQuantite = (index: number, quantite: number) =>
    setLignes((current) => current.map((l, i) => (i === index ? { ...l, quantite } : l)));

  const retirer = (index: number) => {
    const nom = lignes[index]?.nom;
    setLignes((current) => current.filter((_, i) => i !== index));
    if (nom) setAnnounce(`${nom} retiré de la vente.`);
    focusScan();
  };

  const total = useMemo(
    () => Math.round(lignes.reduce((acc, l) => acc + (Number.isFinite(l.quantite) ? l.quantite : 0) * l.prix, 0) * 100) / 100,
    [lignes]
  );
  const articles = lignes.reduce((acc, l) => acc + (Number.isFinite(l.quantite) ? l.quantite : 0), 0);
  const quantitesValides = lignes.every((l) => Number.isInteger(l.quantite) && l.quantite > 0);
  const surStock = lignes.some((l) => stock.state === 'ready' && l.quantite > stock.stockOf(l.produit_id, null));

  const recuNum = recu ? toNumber(recu) ?? 0 : null;
  const especesRecues = methode === 'espece' ? recuNum ?? total : null;
  const monnaie = methode === 'espece' && especesRecues !== null ? especesRecues - total : 0;
  const recuInsuffisant = methode === 'espece' && recuNum !== null && recuNum < total;
  const especesBloquees = methode === 'espece' && caisse.status === 'fermee';

  const peutEncaisser =
    lignes.length > 0 && quantitesValides && total > 0 && !recuInsuffisant && !especesBloquees && !submitting;

  // --- Encaissement ------------------------------------------------------------
  const nouvelleVente = () => {
    setLignes([]);
    setRecu('');
    setMethode('espece');
    setClient(comptoir);
    setChangerClient(false);
    setVente(null);
    idempotencyKey.current = newIdempotencyKey();
    void stock.reload();
    focusScan();
  };

  const imprimer = async (v: VenteTerminee) => {
    setPrinting(true);
    try {
      await printTicket(v.result.facture_id, {
        especesRecues: v.especesRecues,
        monnaieRendue: v.especesRecues !== null ? v.result.monnaie_rendue : null,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’imprimer le ticket. Vous pouvez le réimprimer depuis la facture.'));
    } finally {
      setPrinting(false);
    }
  };

  const encaisser = async () => {
    if (!peutEncaisser) {
      if (lignes.length === 0) {
        toast.error('Scannez au moins un article avant d’encaisser.');
        focusScan();
      }
      return;
    }
    setSubmitting(true);
    try {
      const result = await factureService.createVenteComptoir({
        tiers_id: client && client.code !== COMPTOIR_CODE ? client.id : undefined,
        location_id: locationId ?? undefined,
        lignes: lignes.map((l) => ({ produit_id: l.produit_id, quantite: l.quantite, prix_unitaire: l.prix })),
        paiements: [{ methode_paiement: methode }],
        especes_recues: methode === 'espece' ? especesRecues ?? undefined : undefined,
        idempotency_key: idempotencyKey.current,
      });
      const terminee: VenteTerminee = { result, especesRecues: methode === 'espece' ? especesRecues : null };
      setVente(terminee);
      setAnnounce(result.message);
      if (autoPrint) void imprimer(terminee);
    } catch (err) {
      toast.error(getErrorMessage(err, 'La vente n’a pas été enregistrée. Vérifiez les articles puis réessayez.'));
      // Caisse peut-être fermée entre-temps : l'état affiché se met à jour.
      void loadCaisse();
    } finally {
      setSubmitting(false);
    }
  };

  // --- Rendu -------------------------------------------------------------------
  const estComptoir = client?.code === COMPTOIR_CODE;
  const caisseHref = canOpen('/caisse') ? '/caisse' : null;

  return (
    // Pas de description sous le titre : sur un portable de caisse (1366 × 768)
    // chaque ligne repousse « Encaisser » sous le pli.
    <PageShell title="Vente comptoir" width="wide">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        {/* Articles */}
        <Card>
          <CardHeader>
            <CardTitle>Articles</CardTitle>
            <CardDescription id={ID.searchHint}>
              Scannez un code-barres ou tapez le nom, puis Entrée. Facture, stock et caisse sont mis à jour à
              l’encaissement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={ID.search}>Ajouter un article</Label>
              <ProductCombobox<SalesSearchProduct>
                id={ID.search}
                search={searchProducts}
                searchKey={locationId}
                onSelect={addProduit}
                describedBy={ID.searchHint}
                getDisabledReason={saleDisabledReason}
                addedMessage={(p) => `${p.nom} ajouté.`}
                noResultsHint="Seuls les produits en stock dans ce magasin sont proposés. Vérifiez le code-barres."
                renderOption={(p, { disabledReason }) => (
                  <SalesProductOption product={p} stock={stock.stockOf(p.id, p.stock)} disabledReason={disabledReason} />
                )}
              />
            </div>

            <SalesLocationField
              id={ID.location}
              label="Magasin"
              locations={sales.locations}
              state={sales.state}
              error={sales.error}
              onRetry={() => void sales.reload()}
              value={locationId}
              onChange={setLocationId}
            />

            <p role="status" className="sr-only">
              {announce}
            </p>

            {lignes.length === 0 ? (
              <div className="rounded-md bg-muted/40">
                <EmptyState compact icon={ScanBarcode} title="Aucun article scanné" />
              </div>
            ) : (
              <ul aria-label="Articles de la vente" className="divide-y rounded-md border">
                {lignes.map((l, i) => {
                  const dispo = stock.state === 'ready' ? stock.stockOf(l.produit_id, null) : null;
                  const manque = dispo !== null && l.quantite > dispo;
                  return (
                    <li key={l.produit_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="font-medium">{l.nom}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.reference && <DocumentCode>{l.reference}</DocumentCode>}
                          {l.reference && ' · '}
                          <Money value={l.prix} /> l’unité
                        </p>
                        {manque && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-warning-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            {insufficientStockMessage(dispo ?? 0)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={lineFieldLabel('Diminuer la quantité', l.nom)}
                          disabled={!(l.quantite > 1)}
                          onClick={() => setQuantite(i, Math.max(1, l.quantite - 1))}
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <NumericField
                          id={ID.quantite(i)}
                          mode="integer"
                          value={l.quantite}
                          onValueChange={(v) => setQuantite(i, v)}
                          aria-label={lineFieldLabel('Quantité', l.nom)}
                          aria-invalid={!(Number.isInteger(l.quantite) && l.quantite > 0) ? true : undefined}
                          className="h-9 w-14 px-2 text-center"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={lineFieldLabel('Augmenter la quantité', l.nom)}
                          onClick={() => setQuantite(i, (Number.isFinite(l.quantite) ? l.quantite : 0) + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                      <Money
                        value={(Number.isFinite(l.quantite) ? l.quantite : 0) * l.prix}
                        className="w-28 text-right font-medium"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
                        aria-label={`Retirer ${l.nom} de la vente`}
                        title="Retirer de la vente"
                        onClick={() => retirer(i)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Encaissement */}
        {/* Sans en-tête : le total EST le titre de cette colonne, et chaque ligne
            gagnée garde « Encaisser » au-dessus du pli sur un portable 1366 × 768. */}
        <Card className="lg:sticky lg:top-4" aria-labelledby="comptoir-encaissement-titre">
          <CardContent inset="standalone" className="space-y-5">
            <div>
              <h2 id="comptoir-encaissement-titre" className="flex justify-between gap-2 text-sm text-muted-foreground">
                <span>Total à payer</span>
                <span>
                  {lignes.length === 0
                    ? 'Aucun article'
                    : `${plural(lignes.length, 'ligne', 'lignes')} · ${plural(articles, 'article', 'articles')}`}
                </span>
              </h2>
              <Money value={total} emphasis className="block text-4xl" aria-live="polite" />
            </div>

            <div className="space-y-2">
              {changerClient || !client ? (
                <>
                  <p className="text-sm font-medium" id={`${ID.client}-label`}>
                    Client
                  </p>
                  <TiersPicker
                    id={ID.client}
                    role="client"
                    value={client}
                    onChange={(t) => {
                      setClient(t ?? comptoir);
                      if (t) setChangerClient(false);
                    }}
                    aria-labelledby={`${ID.client}-label`}
                  />
                </>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Client : </span>
                    {client.raison_sociale}
                    {client.prenom ? ` ${client.prenom}` : ''}
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setChangerClient(true)}>
                    {estComptoir ? 'Nommer le client' : 'Changer de client'}
                  </Button>
                </div>
              )}
            </div>

            <ChoiceGroup<PaymentMethod>
              label="Mode de paiement"
              value={methode}
              onValueChange={(m) => {
                setMethode(m);
                if (m !== 'espece') setRecu('');
              }}
              options={PAYMENT_METHOD_OPTIONS.filter((o) => o.value !== 'cheque' && o.value !== 'virement')}
              layout="grid-2"
              shape="tile"
              size="touch"
            />

            {especesBloquees && (
              <InlineNotice tone="warning">
                <span>
                  La caisse{caisse.status === 'fermee' && caisse.magasinNom ? ` de ${caisse.magasinNom}` : ''} est fermée :
                  ouvrez-la pour encaisser des espèces.
                  {caisseHref && (
                    <>
                      {' '}
                      <Link to={caisseHref} className="font-medium underline underline-offset-4">
                        Ouvrir la caisse
                      </Link>
                    </>
                  )}
                </span>
              </InlineNotice>
            )}

            {methode === 'espece' && (
              <div className="space-y-2">
                <Label htmlFor={ID.recu}>Espèces reçues</Label>
                <MoneyInput
                  id={ID.recu}
                  value={recu}
                  onChange={setRecu}
                  placeholder={total > 0 ? formatCurrency(total).replace(/\s?FCFA$/, '') : ''}
                  aria-invalid={recuInsuffisant ? true : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void encaisser();
                    }
                  }}
                  className="h-11 text-lg"
                />
                {total > 0 && (
                  <div className="flex flex-wrap gap-2" aria-label="Montants reçus courants" role="group">
                    {montantsProposes(total).map((m) => (
                      <Button key={m} type="button" variant="outline" size="sm" onClick={() => setRecu(String(m))}>
                        <Money value={m} />
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-sm">{recuInsuffisant ? 'Il manque' : 'Monnaie à rendre'}</span>
                  <Money
                    value={Math.abs(monnaie)}
                    className={recuInsuffisant ? 'text-2xl text-danger-700' : 'text-2xl'}
                  />
                </div>
              </div>
            )}

            {surStock && (
              <p className="flex items-start gap-1 text-xs text-warning-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Une quantité dépasse le stock du magasin : la vente sera refusée.
              </p>
            )}

            <Button
              type="button"
              size="touch"
              className="w-full gap-2 text-base"
              disabled={!peutEncaisser}
              onClick={() => void encaisser()}
            >
              {submitting ? <Spinner /> : null}
              {submitting ? 'Encaissement…' : total > 0 ? `Encaisser ${formatCurrency(total)}` : 'Encaisser'}
            </Button>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoPrint}
                onChange={(e) => {
                  setAutoPrint(e.target.checked);
                  writeAutoPrint(e.target.checked);
                }}
                className="h-4 w-4 accent-primary"
              />
              Imprimer le ticket après chaque vente sur ce poste
            </label>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={vente !== null}
        onOpenChange={(open) => {
          if (!open) nouvelleVente();
        }}
      >
        <DialogContent>
          {vente && (
            <>
              <DialogHeader>
                <DialogTitle>Vente enregistrée</DialogTitle>
                <DialogDescription>
                  Ticket <DocumentCode>{vente.result.numero_facture}</DocumentCode> ·{' '}
                  <Money value={vente.result.total} />
                </DialogDescription>
              </DialogHeader>
              {vente.especesRecues !== null && (
                <div className="rounded-md bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">Monnaie à rendre</p>
                  <Money value={vente.result.monnaie_rendue} emphasis className="block text-4xl" />
                  <p className="mt-1 text-sm text-muted-foreground">
                    sur <Money value={vente.especesRecues} /> reçus
                  </p>
                </div>
              )}
              <DialogFooter className="gap-2 sm:justify-between">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={printing}
                    onClick={() => void imprimer(vente)}
                  >
                    {printing ? <Spinner /> : <Printer className="h-4 w-4" aria-hidden="true" />}
                    Imprimer le ticket
                  </Button>
                  {canOpen(`/factures/${vente.result.facture_id}`) && (
                    <Link
                      to={`/factures/${vente.result.facture_id}`}
                      className={buttonVariants({ variant: 'ghost' })}
                    >
                      Voir la facture
                    </Link>
                  )}
                </div>
                <Button type="button" autoFocus onClick={nouvelleVente}>
                  Nouvelle vente
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
