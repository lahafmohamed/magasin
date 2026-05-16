import React, { useState, useEffect } from 'react';
import { METHODES_PAIEMENT } from '../types';
import { MoneyInput } from './ui/money-input';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (paiement: {
    montant: number;
    methode_paiement: 'espece' | 'carte' | 'cheque' | 'virement';
    reference?: string;
    notes?: string;
  }) => Promise<void>;
  remainingDue: number;
  total: number;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  remainingDue,
  total,
}) => {
  const [montant, setMontant] = useState('');
  const [methodePaiement, setMethodePaiement] = useState<'espece' | 'carte' | 'cheque' | 'virement'>('espece');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMontant(parseFloat(remainingDue as any).toFixed(2));
      setMethodePaiement('espece');
      setReference('');
      setNotes('');
      setError('');
    }
  }, [isOpen, remainingDue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const montantNum = parseFloat(montant);

    if (isNaN(montantNum) || montantNum <= 0) {
      setError('Le montant doit être supérieur à 0');
      return;
    }

    if (montantNum > remainingDue) {
      setError(`Le montant ne peut pas dépasser le reste dû (${remainingDue.toFixed(2)} XOF)`);
      return;
    }

    setLoading(true);

    try {
      await onSubmit({
        montant: montantNum,
        methode_paiement: methodePaiement,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Une erreur est survenue lors de l\'enregistrement du paiement');
    } finally {
      setLoading(false);
    }
  };

  const handleSetFullAmount = () => {
    setMontant(parseFloat(remainingDue as any).toFixed(2));
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h2 className="text-2xl font-bold mb-4">💳 Enregistrer un paiement</h2>

        <form onSubmit={handleSubmit}>
          {/* Amount */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text font-semibold">Montant du paiement</span>
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={handleSetFullAmount}
              >
                Payer le reste ({remainingDue.toFixed(2)} XOF)
              </button>
            </label>
            <MoneyInput
              value={montant}
              onChange={(v) => setMontant(v)}
              placeholder="0"
              required
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                Total facture: {total.toFixed(2)} XOF | Déjà payé: {(total - remainingDue).toFixed(2)} XOF
              </span>
            </label>
          </div>

          {/* Payment Method */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text font-semibold">Méthode de paiement</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(METHODES_PAIEMENT).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn ${
                    methodePaiement === key ? 'btn-primary' : 'btn-outline'
                  }`}
                  onClick={() => setMethodePaiement(key as any)}
                >
                  <span className="text-xl">{config.icon}</span>
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text font-semibold">
                Référence {methodePaiement === 'cheque' || methodePaiement === 'virement' ? '(requis)' : '(optionnel)'}
              </span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={
                methodePaiement === 'cheque'
                  ? 'N° du chèque'
                  : methodePaiement === 'virement'
                  ? 'Référence du virement'
                  : 'Référence (optionnel)'
              }
              required={methodePaiement === 'cheque' || methodePaiement === 'virement'}
            />
          </div>

          {/* Notes */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text font-semibold">Notes (optionnel)</span>
            </label>
            <textarea
              className="textarea textarea-bordered w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ajouter des notes ou commentaires..."
              rows={3}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="modal-action">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Enregistrement...
                </>
              ) : (
                'Enregistrer le paiement'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
