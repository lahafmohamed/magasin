import React from 'react';

interface PaymentStatusBarProps {
  montantPaye: number;
  remainingDue: number;
  total: number;
  statut: 'payee' | 'partielle' | 'en_attente' | 'annulee';
  onAddPayment?: () => void;
}

export const PaymentStatusBar: React.FC<PaymentStatusBarProps> = ({
  montantPaye,
  remainingDue,
  total,
  statut,
  onAddPayment,
}) => {
  const montantPayeNum = parseFloat(montantPaye as any) || 0;
  const remainingDueNum = parseFloat(remainingDue as any) || 0;
  const totalNum = parseFloat(total as any) || 0;
  
  const percentage = totalNum > 0 ? (montantPayeNum / totalNum) * 100 : 0;

  const getStatusConfig = () => {
    switch (statut) {
      case 'payee':
        return {
          color: 'text-success',
          bgColor: 'bg-success',
          label: 'Payée',
          icon: '✓',
        };
      case 'partielle':
        return {
          color: 'text-warning',
          bgColor: 'bg-warning',
          label: 'Partielle',
          icon: '◐',
        };
      case 'annulee':
        return {
          color: 'text-error',
          bgColor: 'bg-error',
          label: 'Annulée',
          icon: '✕',
        };
      default:
        return {
          color: 'text-error',
          bgColor: 'bg-error',
          label: 'Non payée',
          icon: '○',
        };
    }
  };

  const statusConfig = getStatusConfig();

  if (statut === 'annulee') {
    return (
      <div className="alert alert-error mb-4">
        <span className="text-2xl">{statusConfig.icon}</span>
        <span className="font-bold">Facture {statusConfig.label}</span>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-md mb-4">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-2xl ${statusConfig.color}`}>{statusConfig.icon}</span>
            <span className={`font-bold text-lg ${statusConfig.color}`}>
              Statut: {statusConfig.label}
            </span>
          </div>
          {onAddPayment && statut !== 'payee' && (
            <button className="btn btn-primary btn-sm" onClick={onAddPayment}>
              <span className="text-lg">+</span>
              Enregistrer un paiement
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-base-content/70">Progression du paiement</span>
            <span className="font-semibold">{percentage.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-base-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${statusConfig.bgColor}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Payment Details */}
        <div className="grid grid-cols-3 gap-4">
          <div className="stat-place-holder">
            <div className="text-sm text-base-content/60">Total</div>
            <div className="font-bold text-lg">{totalNum.toFixed(2)} XOF</div>
          </div>
          <div className="stat-place-holder">
            <div className="text-sm text-success">Payé</div>
            <div className="font-bold text-lg text-success">{montantPayeNum.toFixed(2)} XOF</div>
          </div>
          <div className="stat-place-holder">
            <div className="text-sm text-error">Reste dû</div>
            <div className="font-bold text-lg text-error">{remainingDueNum.toFixed(2)} XOF</div>
          </div>
        </div>
      </div>
    </div>
  );
};
