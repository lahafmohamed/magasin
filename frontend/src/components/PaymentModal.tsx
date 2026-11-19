import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Info, Lock } from 'lucide-react';
import { METHODES_PAIEMENT } from '../types';
import { MoneyInput } from './ui/money-input';
import { Button } from './ui/button';
import { DocumentCode } from './ui/document-code';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Spinner } from './ui/loading';
import { Textarea } from './ui/textarea';
import { Money } from './ui/money';
import { ChoiceGroup } from './ui/choice-chips';
import { FieldError, fieldErrorProps } from './ui/field-error';
import { RequiredMark } from './ui/required-mark';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { formatCurrency, toNumber } from '../utils/format';
import { getErrorCode, getErrorMessage } from '../utils/errors';
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from '../utils/paymentMethod';

/** Ce que la fenêtre transmet à l'appelant, qui l'envoie tel quel à l'API. */
export interface PaymentModalSubmit {
  /** Montant saisi : c'est exactement ce qui sera enregistré (D3). */
  montant: number;
  methode_paiement: PaymentMethod;
  reference?: string;
  notes?: string;
  /** Une clé par ouverture de la fenêtre : un double envoi n'encaisse qu'une fois. */
  idempotency_key: string;
}

/** État de la caisse du magasin de la facture, vérifié à l'ouverture. */
export type CashTillState = 'open' | 'closed' | 'unknown';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Enregistre le paiement ; doit relancer l'erreur de l'API (`CAISSE_FERMEE`…) pour qu'elle s'affiche ici. */
  onSubmit: (paiement: PaymentModalSubmit) => Promise<void>;
  remainingDue: number;
  total: number;
  /** Numéro de la facture, repris dans la description de la fenêtre. */
  numeroFacture?: string;
  /**
   * Acomptes encore disponibles du client (somme). Ils ne sont JAMAIS pris
   * d'office : le paiement enregistre le montant saisi, rien d'autre (D3).
   */
  acomptesDisponibles?: number;
  /**
   * Caisse du magasin de la facture : `closed` affiche l'avertissement dès que
   * « Espèces » est choisi ; `unknown` (non vérifiable) laisse le serveur
   * trancher (`CAISSE_FERMEE`).
   */
  cashTill?: CashTillState;
  /** Lien « Ouvrir la caisse » — absent quand le rôle ne peut pas ouvrir la page Caisse. */
  caisseHref?: string | null;
}

const DEFAULT_ERROR = 'Impossible d’enregistrer le paiement. Vérifiez votre connexion puis réessayez.';

const METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS.map((o) => ({ ...o, icon: METHODES_PAIEMENT[o.value].Icon }));

function newIdempotencyKey(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `paiement-${random}`;
}

/** Montant arrondi au franc, en chiffres seuls (format attendu par `MoneyInput`). */
const toDigits = (value: number) => String(Math.max(0, Math.round(value)));

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  remainingDue,
  total,
  numeroFacture,
  acomptesDisponibles = 0,
  cashTill = 'unknown',
  caisseHref,
}) => {
  const due = Math.max(0, toNumber(remainingDue) ?? 0);
  const totalNum = toNumber(total) ?? 0;

  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState<PaymentMethod>('espece');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [recu, setRecu] = useState('');
  const [loading, setLoading] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [receivedError, setReceivedError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [closedByServer, setClosedByServer] = useState(false);

  // Renouvelée à chaque ouverture (effet ci-dessous) : un double clic ou un
  // renvoi après coupure réseau ne crée pas un second paiement.
  const keyRef = useRef('');
  const amountRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const tillNoteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMontant(toDigits(due));
    setMethode('espece');
    setReference('');
    setNotes('');
    setRecu('');
    setAmountError(null);
    setReceivedError(null);
    setReferenceError(null);
    setFormError(null);
    setClosedByServer(false);
    keyRef.current = newIdempotencyKey();
  }, [isOpen, due]);

  const needsReference = methode === 'cheque' || methode === 'virement';
  const tillClosed = cashTill === 'closed' || closedByServer;
  const showTillWarning = methode === 'espece' && tillClosed;

  const montantNum = montant ? Number(montant) : 0;
  const recuNum = recu ? Number(recu) : 0;
  const change = recuNum - montantNum;
  /** Espèces remises inférieures au paiement : le tiroir serait court à la clôture (P-M1). */
  const cashShort = methode === 'espece' && recuNum > 0 && recuNum < montantNum;

  /** Envoie le paiement ; les erreurs de l'API restent affichées dans la fenêtre. */
  const submit = async (amount: number) => {
    setLoading(true);
    try {
      await onSubmit({
        montant: amount,
        methode_paiement: methode,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotency_key: keyRef.current,
      });
      onClose();
    } catch (err) {
      if (getErrorCode(err) === 'CAISSE_FERMEE') {
        setClosedByServer(true);
        requestAnimationFrame(() => tillNoteRef.current?.focus());
      } else {
        setFormError(getErrorMessage(err, DEFAULT_ERROR));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);

    let nextAmountError: string | null = null;
    if (!montant || !Number.isFinite(montantNum) || montantNum <= 0) {
      nextAmountError = 'Saisissez un montant supérieur à 0 FCFA.';
    } else if (montantNum > due + 0.005) {
      nextAmountError = `Le montant dépasse le reste dû (${formatCurrency(due)}).`;
    }
    // Entrée dans « Montant reçu » ne doit jamais enregistrer plus que ce que
    // le client a remis : le paiement est bloqué, la caissière choisit.
    const nextReceivedError =
      !nextAmountError && cashShort
        ? `Le client a donné ${formatCurrency(recuNum)}, moins que le paiement de ${formatCurrency(montantNum)}.`
        : null;
    const nextReferenceError =
      needsReference && !reference.trim()
        ? methode === 'cheque'
          ? 'Saisissez le numéro du chèque.'
          : 'Saisissez la référence du virement.'
        : null;

    setAmountError(nextAmountError);
    setReceivedError(nextReceivedError);
    setReferenceError(nextReferenceError);
    if (nextAmountError) {
      requestAnimationFrame(() => amountRef.current?.focus());
      return;
    }
    if (nextReceivedError) {
      requestAnimationFrame(() => receivedRef.current?.focus());
      return;
    }
    if (nextReferenceError) {
      requestAnimationFrame(() => referenceRef.current?.focus());
      return;
    }

    await submit(montantNum);
  };

  /** « Enregistrer 30 000 FCFA seulement » : le paiement prend la somme réellement remise. */
  const recordReceivedOnly = () => {
    if (loading || !(recuNum > 0) || recuNum > due + 0.005) return;
    setMontant(toDigits(recuNum));
    setAmountError(null);
    setReceivedError(null);
    setFormError(null);
    void submit(recuNum);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enregistrer un paiement</DialogTitle>
          <DialogDescription>
            {numeroFacture && (
              <>
                Facture <DocumentCode>{numeroFacture}</DocumentCode> ·{' '}
              </>
            )}
            Reste dû : {formatCurrency(due)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="payment-amount">Montant du paiement</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMontant(toDigits(due));
                  setAmountError(null);
                }}
              >
                Saisir le reste dû ({formatCurrency(due)})
              </Button>
            </div>
            <MoneyInput
              id="payment-amount"
              ref={amountRef}
              autoFocus
              value={montant}
              onChange={(v) => {
                setMontant(v);
                setAmountError(null);
              }}
              placeholder="0"
              {...fieldErrorProps('payment-amount', amountError)}
              aria-describedby={['payment-amount-help', amountError ? 'payment-amount-error' : null]
                .filter(Boolean)
                .join(' ')}
            />
            <p id="payment-amount-help" className="text-xs text-muted-foreground tabular-nums">
              Total de la facture : {formatCurrency(totalNum)} · Déjà payé : {formatCurrency(Math.max(0, totalNum - due))}
            </p>
            <FieldError id="payment-amount">{amountError}</FieldError>
          </div>

          {acomptesDisponibles > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-info-200 bg-info-50 p-3 text-sm text-info-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                Ce client a {formatCurrency(acomptesDisponibles)} d’acompte disponible. Ce paiement ne l’utilise pas :
                pour le déduire, utilisez « Appliquer » dans la carte « Acomptes disponibles ».
              </p>
            </div>
          )}

          <ChoiceGroup
            label="Mode de paiement"
            value={methode}
            onValueChange={(value) => {
              setMethode(value);
              setReferenceError(null);
              setFormError(null);
            }}
            options={METHOD_OPTIONS}
            layout="grid-2"
            shape="tile"
            size="touch"
            // Sous 360 px, une colonne : « Orange Money » ne devient pas « Orange … ».
            className="max-[359px]:[&_[role=radiogroup]]:grid-cols-1"
            aria-describedby={showTillWarning ? 'payment-till-closed' : undefined}
          />

          {showTillWarning && (
            <div
              id="payment-till-closed"
              ref={tillNoteRef}
              tabIndex={-1}
              role={closedByServer ? 'alert' : 'status'}
              className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <p>La caisse est fermée : ouvrez-la pour encaisser des espèces.</p>
                {caisseHref && (
                  <Link
                    to={caisseHref}
                    className="inline-flex min-h-6 items-center font-medium underline underline-offset-4 hover:text-warning-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Ouvrir la caisse
                  </Link>
                )}
              </div>
            </div>
          )}

          {methode === 'espece' && (
            <div className="space-y-1.5">
              <Label htmlFor="payment-received">
                Montant reçu du client <span className="font-normal text-muted-foreground">(facultatif)</span>
              </Label>
              <MoneyInput
                id="payment-received"
                ref={receivedRef}
                value={recu}
                onChange={(v) => {
                  setRecu(v);
                  setReceivedError(null);
                }}
                placeholder="0"
                {...fieldErrorProps('payment-received', receivedError)}
                aria-describedby={
                  receivedError ? 'payment-received-error' : recuNum > 0 ? 'payment-change' : undefined
                }
              />
              {receivedError ? (
                <div className="space-y-2">
                  <FieldError id="payment-received">{receivedError}</FieldError>
                  {recuNum <= due + 0.005 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={recordReceivedOnly}
                      disabled={loading}
                    >
                      Enregistrer {formatCurrency(recuNum)} seulement
                    </Button>
                  )}
                </div>
              ) : (
                recuNum > 0 &&
                (change >= 0 ? (
                  <p
                    id="payment-change"
                    role="status"
                    className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md border bg-muted/40 px-3 py-2"
                  >
                    <span className="text-sm font-medium">À rendre</span>
                    <Money value={change} emphasis className="text-2xl" />
                  </p>
                ) : (
                  <p id="payment-change" role="status" className="text-sm">
                    Il manque <Money value={-change} emphasis tone="danger" /> : réduisez le montant du paiement ou
                    complétez la somme.
                  </p>
                ))
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="payment-reference">
              {methode === 'cheque' ? (
                <>
                  Numéro du chèque
                  <RequiredMark />
                </>
              ) : methode === 'virement' ? (
                <>
                  Référence du virement
                  <RequiredMark />
                </>
              ) : (
                <>
                  Référence <span className="font-normal text-muted-foreground">(facultatif)</span>
                </>
              )}
            </Label>
            <Input
              id="payment-reference"
              ref={referenceRef}
              type="text"
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setReferenceError(null);
              }}
              placeholder={methode === 'cheque' ? 'Ex. : 0012345' : methode === 'virement' ? 'Ex. : VIR-2026-118' : ''}
              aria-required={needsReference || undefined}
              {...fieldErrorProps('payment-reference', referenceError)}
            />
            <FieldError id="payment-reference">{referenceError}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">
              Notes <span className="font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Textarea
              id="payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Précision utile pour la caisse ou le client"
              rows={2}
            />
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <DialogFooter sticky className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="touch" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" size="touch" disabled={loading} aria-busy={loading || undefined} className="gap-2">
              {loading ? (
                <>
                  <Spinner />
                  Enregistrement…
                </>
              ) : (
                'Enregistrer le paiement'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
