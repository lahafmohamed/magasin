import { useState, useEffect } from 'react';
import { generalLedgerService } from '../services/api';
import { toast } from 'sonner';

interface Compte {
  id: number;
  numero: string;
  intitule: string;
  type_compte: string;
  categorie: string | null;
  actif: boolean;
}

interface EcritureComptable {
  id: number;
  numero_piece: string | null;
  date_ecriture: string;
  journal: string;
  piece_id: number | null;
  piece_type: string | null;
  ligne_numero: number;
  compte_id: number;
  compte_numero: string;
  compte_intitule: string;
  debit: string;
  credit: string;
  description: string | null;
}

interface BalanceComptable {
  compte_id: number;
  compte_numero: string;
  compte_intitule: string;
  total_debit: string;
  total_credit: string;
  solde: string;
}

export default function GeneralLedger() {
  const [ecritures, setEcritures] = useState<EcritureComptable[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<Compte[]>([]);
  const [trialBalance, setTrialBalance] = useState<BalanceComptable[]>([]);
  const [activeTab, setActiveTab] = useState<'ecritures' | 'chart' | 'trial-balance'>('ecritures');
  const [loading, setLoading] = useState(true);
  const [filterJournal, setFilterJournal] = useState<string>('');
  const [dateDebut, setDateDebut] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (activeTab === 'ecritures') {
      fetchEcritures();
    } else if (activeTab === 'chart') {
      fetchChartOfAccounts();
    } else if (activeTab === 'trial-balance') {
      fetchTrialBalance();
    }
  }, [activeTab, filterJournal, dateDebut, dateFin]);

  const fetchEcritures = async () => {
    try {
      const data = await generalLedgerService.getAll(filterJournal, dateDebut, dateFin);
      setEcritures(data.data || data);
    } catch {
      toast.error('Erreur chargement écritures');
    } finally {
      setLoading(false);
    }
  };

  const fetchChartOfAccounts = async () => {
    try {
      const data = await generalLedgerService.getChartOfAccounts();
      setChartOfAccounts(data.data || data);
    } catch {
      toast.error('Erreur chargement plan comptable');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrialBalance = async () => {
    try {
      const data = await generalLedgerService.getTrialBalance(dateDebut, dateFin);
      setTrialBalance(data.data || data);
    } catch {
      toast.error('Erreur chargement balance comptable');
    } finally {
      setLoading(false);
    }
  };

  const getJournalBadge = (journal: string) => {
    const colors: Record<string, string> = {
      'ACHATS': 'badge-error',
      'VENTES': 'badge-success',
      'TRESORERIE': 'badge-info',
      'OD': 'badge-warning',
    };
    return colors[journal] || 'badge-ghost';
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'actif': 'badge-info',
      'passif': 'badge-warning',
      'capitaux_propres': 'badge-success',
      'charge': 'badge-error',
      'produit': 'badge-primary',
    };
    return colors[type] || 'badge-ghost';
  };

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Grand Livre Comptable</h1>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed mb-6">
        <a
          className={`tab ${activeTab === 'ecritures' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('ecritures')}
        >
          Écritures Comptables
        </a>
        <a
          className={`tab ${activeTab === 'chart' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          Plan Comptable
        </a>
        <a
          className={`tab ${activeTab === 'trial-balance' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('trial-balance')}
        >
          Balance Comptable
        </a>
      </div>

      {/* Filters */}
      <div className="card bg-base-100 shadow-xl p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Date Début</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Date Fin</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>

          {activeTab === 'ecritures' && (
            <div className="form-control">
              <label className="label">
                <span className="label-text">Journal</span>
              </label>
              <select
                className="select select-bordered"
                value={filterJournal}
                onChange={(e) => setFilterJournal(e.target.value)}
              >
                <option value="">Tous les journaux</option>
                <option value="ACHATS">ACHATS</option>
                <option value="VENTES">VENTES</option>
                <option value="TRESORERIE">TRESORERIE</option>
                <option value="OD">OD (Opérations Diverses)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Écritures Tab */}
      {activeTab === 'ecritures' && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Écritures Comptables</h2>
            {ecritures.length === 0 ? (
              <div className="alert alert-info">
                <span>Aucune écriture pour la période sélectionnée</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>N° Pièce</th>
                      <th>Date</th>
                      <th>Journal</th>
                      <th>Compte</th>
                      <th>Description</th>
                      <th>Débit</th>
                      <th>Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ecritures.map((ecriture) => (
                      <tr key={ecriture.id}>
                        <td className="font-medium text-xs">{ecriture.numero_piece}</td>
                        <td className="text-xs">{new Date(ecriture.date_ecriture).toLocaleDateString('fr-FR')}</td>
                        <td><span className={`badge ${getJournalBadge(ecriture.journal)}`}>{ecriture.journal}</span></td>
                        <td className="text-xs">{ecriture.compte_numero} - {ecriture.compte_intitule}</td>
                        <td className="text-xs">{ecriture.description || '-'}</td>
                        <td className="font-medium">{parseFloat(ecriture.debit).toFixed(2)}</td>
                        <td className="font-medium">{parseFloat(ecriture.credit).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chart of Accounts Tab */}
      {activeTab === 'chart' && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Plan Comptable</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Intitulé</th>
                    <th>Type</th>
                    <th>Catégorie</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {chartOfAccounts.map((compte) => (
                    <tr key={compte.id}>
                      <td className="font-medium">{compte.numero}</td>
                      <td>{compte.intitule}</td>
                      <td><span className={`badge ${getTypeBadge(compte.type_compte)}`}>{compte.type_compte}</span></td>
                      <td>{compte.categorie || '-'}</td>
                      <td>{compte.actif ? <span className="badge badge-success">Actif</span> : <span className="badge badge-ghost">Inactif</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Trial Balance Tab */}
      {activeTab === 'trial-balance' && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Balance Comptable</h2>
            {trialBalance.length === 0 ? (
              <div className="alert alert-info">
                <span>Aucune donnée pour la période sélectionnée</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Compte</th>
                      <th>Total Débit</th>
                      <th>Total Crédit</th>
                      <th>Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.map((balance) => (
                      <tr key={balance.compte_id}>
                        <td className="font-medium">{balance.compte_numero}</td>
                        <td>{balance.compte_intitule}</td>
                        <td className="font-medium">{parseFloat(balance.total_debit).toFixed(2)}</td>
                        <td className="font-medium">{parseFloat(balance.total_credit).toFixed(2)}</td>
                        <td className={`font-bold ${parseFloat(balance.solde) >= 0 ? 'text-success' : 'text-error'}`}>
                          {parseFloat(balance.solde).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
