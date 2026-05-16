import React from 'react';
import { Paiement, METHODES_PAIEMENT } from '../types';

interface PaymentHistoryProps {
  paiements: Paiement[];
  onDelete?: (id: number) => void;
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({ paiements, onDelete }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMethodeConfig = (methode: string) => {
    return METHODES_PAIEMENT[methode as keyof typeof METHODES_PAIEMENT] || {
      label: methode,
      color: 'bg-gray-500',
      icon: '💰',
    };
  };

  if (!paiements || paiements.length === 0) {
    return (
      <div className="alert alert-info">
        <span>Aucun paiement enregistré pour cette facture</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>Date</th>
            <th>Source</th>
            <th>Méthode</th>
            <th>Montant</th>
            <th>Référence</th>
            <th>Notes</th>
            {onDelete && <th className="w-20">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {paiements.map((paiement) => {
            const methodeConfig = getMethodeConfig(paiement.methode_paiement);
            const montant = parseFloat(paiement.montant as any) || 0;
            
            return (
              <tr key={paiement.id}>
                <td className="text-sm">
                  {formatDate(paiement.date_paiement)}
                </td>
                <td className="text-sm">
                  {paiement.source === 'acompte_application' ? (
                    <span className="badge badge-info badge-sm">Acompte</span>
                  ) : paiement.source === 'reversal' ? (
                    <span className="badge badge-warning badge-sm">Annulation</span>
                  ) : (
                    <span className="badge badge-ghost badge-sm">Direct</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{methodeConfig.icon}</span>
                    <span className={`badge ${methodeConfig.color} text-white badge-sm`}>
                      {methodeConfig.label}
                    </span>
                  </div>
                </td>
                <td className="font-semibold text-success">
                  {montant.toFixed(2)} XOF
                </td>
                <td className="text-sm">
                  {paiement.reference || '-'}
                </td>
                <td className="text-sm max-w-xs truncate">
                  {paiement.notes || '-'}
                </td>
                {onDelete && paiement.source !== 'acompte_application' && (
                  <td>
                    <button
                      className="btn btn-error btn-xs"
                      onClick={() => onDelete?.(paiement.id)}
                      title="Supprimer ce paiement"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
