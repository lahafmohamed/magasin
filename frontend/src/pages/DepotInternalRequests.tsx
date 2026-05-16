import { useEffect, useMemo, useState } from 'react';
import { internalStockRequestService, stockLocationService } from '../services/api';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, Package, RefreshCw, Check, X } from 'lucide-react';

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
  actif: boolean;
}

interface StockLevel {
  produit_id: number;
  produit_nom: string;
  reference: string;
  quantite: number;
  quantite_reservee: number;
  quantite_disponible: number;
}

interface RequestLine {
  id: number;
  produit_id: number;
  produit_nom: string;
  reference: string;
  quantite_demandee: number;
  quantite_validee: number | null;
  quantite_transferee: number;
}

interface InternalRequest {
  id: number;
  numero_demande: string;
  magasin_nom: string;
  depot_nom: string;
  statut: string;
  motif_refus?: string | null;
  numero_transfer?: string | null;
  notes?: string | null;
  created_at: string;
  lignes?: RequestLine[];
}

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  en_attente: { label: 'En attente', className: 'badge-warning', icon: Clock },
  validee: { label: 'Validée', className: 'badge-info', icon: CheckCircle },
  refusee: { label: 'Refusée', className: 'badge-error', icon: XCircle },
  executee: { label: 'Livrée', className: 'badge-success', icon: CheckCircle },
  annulee: { label: 'Annulée', className: 'badge-ghost', icon: X },
};

export default function DepotInternalRequests() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedDepotId, setSelectedDepotId] = useState<string>('');
  const [requests, setRequests] = useState<InternalRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<InternalRequest | null>(null);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<number[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const depots = useMemo(
    () => locations.filter((location) => location.est_principal && location.actif),
    [locations]
  );

  const filteredRequests = useMemo(() => {
    if (filterStatus === 'all') return requests;
    return requests.filter((r) => r.statut === filterStatus);
  }, [requests, filterStatus]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.statut === 'en_attente'),
    [requests]
  );

  const validatedRequests = useMemo(
    () => requests.filter((r) => r.statut === 'validee'),
    [requests]
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!selectedDepotId) return;
    void fetchRequests(parseInt(selectedDepotId, 10));
    void fetchDepotStock(parseInt(selectedDepotId, 10));
    setSelectedRequest(null);
    setSelectedForBatch([]);
  }, [selectedDepotId]);

  const initialize = async () => {
    try {
      setLoading(true);
      const locationsData = await stockLocationService.getAll();
      const allLocations: StockLocation[] = locationsData.data || locationsData;
      setLocations(allLocations);

      const depotPrincipal = allLocations.find((location) => location.est_principal && location.actif);
      if (depotPrincipal) {
        setSelectedDepotId(String(depotPrincipal.id));
      }
    } catch {
      toast.error('Erreur de chargement du module depot');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async (depotId: number) => {
    try {
      const response = await internalStockRequestService.getAll({ depot_id: depotId, limit: 100 });
      setRequests(response.data || response);
    } catch {
      toast.error('Erreur de chargement des demandes depot');
    }
  };

  const fetchDepotStock = async (depotId: number) => {
    try {
      const response = await stockLocationService.getStockLevels(depotId);
      setStockLevels(response.data || response);
    } catch {
      toast.error('Erreur de chargement du stock depot');
    }
  };

  const showRequestDetails = async (requestId: number) => {
    try {
      const response = await internalStockRequestService.getById(requestId);
      setSelectedRequest(response.data || response);
    } catch {
      toast.error('Erreur de chargement du detail');
    }
  };

  const refreshDepotData = async () => {
    if (!selectedDepotId) return;
    const depotId = parseInt(selectedDepotId, 10);
    await Promise.all([fetchRequests(depotId), fetchDepotStock(depotId)]);
  };

  const handleValidate = async (requestId: number) => {
    try {
      setActionLoadingId(requestId);
      await internalStockRequestService.validate(requestId);
      toast.success('Demande validee');
      await refreshDepotData();
      if (selectedRequest?.id === requestId) {
        await showRequestDetails(requestId);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur de validation');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (requestId: number) => {
    const reason = window.prompt('Motif de refus (optionnel) :');
    try {
      setActionLoadingId(requestId);
      await internalStockRequestService.reject(requestId, reason || undefined);
      toast.success('Demande refusee');
      await refreshDepotData();
      if (selectedRequest?.id === requestId) {
        await showRequestDetails(requestId);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur de refus');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExecute = async (requestId: number) => {
    try {
      setActionLoadingId(requestId);
      await internalStockRequestService.execute(requestId);
      toast.success('Demande executee et stock transfere');
      await refreshDepotData();
      if (selectedRequest?.id === requestId) {
        await showRequestDetails(requestId);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur d execution');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleBatchValidate = async () => {
    if (selectedForBatch.length === 0) {
      toast.error('Sélectionne au moins une demande');
      return;
    }
    try {
      setBatchLoading(true);
      let successCount = 0;
      for (const id of selectedForBatch) {
        try {
          await internalStockRequestService.validate(id);
          successCount++;
        } catch {
          // Continue with others
        }
      }
      toast.success(`${successCount}/${selectedForBatch.length} demande(s) validée(s)`);
      setSelectedForBatch([]);
      await refreshDepotData();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur batch');
    } finally {
      setBatchLoading(false);
    }
  };

  const toggleBatchSelect = (id: number) => {
    setSelectedForBatch((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des Demandes Dépôt</h1>
          <p className="text-sm opacity-70">Valider et exécuter les demandes des magasins</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="select select-bordered select-sm"
            value={selectedDepotId}
            onChange={(event) => setSelectedDepotId(event.target.value)}
          >
            {depots.map((location) => (
              <option key={location.id} value={location.id}>{location.nom}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => void refreshDepotData()}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <h2 className="card-title text-base">Demandes entrantes</h2>
              <div className="flex items-center gap-2">
                <select
                  className="select select-bordered select-sm"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">Toutes</option>
                  <option value="en_attente">En attente</option>
                  <option value="validee">Validées</option>
                  <option value="executee">Livrées</option>
                  <option value="refusee">Refusées</option>
                </select>
              </div>
            </div>

            {pendingRequests.length > 0 && (
              <div className="bg-warning/10 rounded-lg p-3 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  <span className="text-sm font-medium">{pendingRequests.length} demande(s) en attente</span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => {
                      setSelectedForBatch(pendingRequests.map((r) => r.id));
                    }}
                  >
                    Tout sélectionner
                  </button>
                </div>
              </div>
            )}

            {validatedRequests.length > 0 && filterStatus === 'all' && (
              <div className="bg-info/10 rounded-lg p-3 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-info" />
                  <span className="text-sm font-medium">{validatedRequests.length} demande(s) à exécuter</span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto max-h-[440px]">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-12">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selectedForBatch.length > 0 && selectedForBatch.length === filteredRequests.filter((r) => r.statut === 'en_attente' || r.statut === 'validee').length}
                        onChange={() => {
                          const actionable = filteredRequests.filter((r) => r.statut === 'en_attente' || r.statut === 'validee');
                          if (selectedForBatch.length === actionable.length) {
                            setSelectedForBatch([]);
                          } else {
                            setSelectedForBatch(actionable.map((r) => r.id));
                          }
                        }}
                      />
                    </th>
                    <th>Numéro</th>
                    <th>Magasin</th>
                    <th>Statut</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 opacity-70">Aucune demande</td>
                    </tr>
                  ) : filteredRequests.map((request) => (
                    <tr
                      key={request.id}
                      className={`${selectedRequest?.id === request.id ? 'bg-primary/10' : ''} ${selectedForBatch.includes(request.id) ? 'bg-success/10' : ''}`}
                    >
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={selectedForBatch.includes(request.id)}
                          onChange={() => toggleBatchSelect(request.id)}
                          disabled={request.statut !== 'en_attente' && request.statut !== 'validee'}
                        />
                      </td>
                      <td>
                        <button className="btn btn-link btn-xs p-0 font-medium" onClick={() => void showRequestDetails(request.id)}>
                          {request.numero_demande}
                        </button>
                      </td>
                      <td>{request.magasin_nom}</td>
                      <td>
                        <span className={`badge ${statusConfig[request.statut]?.className || 'badge-ghost'}`}>
                          {statusConfig[request.statut]?.label || request.statut}
                        </span>
                      </td>
                      <td>{new Date(request.created_at).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <div className="flex gap-1">
                          {request.statut === 'en_attente' && (
                            <>
                              <button
                                className="btn btn-success btn-xs"
                                disabled={actionLoadingId === request.id}
                                onClick={() => void handleValidate(request.id)}
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                className="btn btn-error btn-xs"
                                disabled={actionLoadingId === request.id}
                                onClick={() => void handleReject(request.id)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          )}
                          {request.statut === 'validee' && (
                            <button
                              className="btn btn-primary btn-xs"
                              disabled={actionLoadingId === request.id}
                              onClick={() => void handleExecute(request.id)}
                            >
                              <CheckCircle className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedForBatch.length > 0 && (
              <div className="mt-4 p-3 bg-base-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{selectedForBatch.length} sélectionnée(s)</span>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-sm btn-success gap-1"
                      onClick={() => void handleBatchValidate()}
                      disabled={batchLoading}
                    >
                      {batchLoading ? (
                        <span className="loading loading-spinner loading-xs"></span>
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Valider ({selectedForBatch.length})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title text-base">Détail de la demande</h2>
              {!selectedRequest ? (
                <div className="text-center py-8 opacity-70">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sélectionne une demande pour voir les détails</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-muted-foreground">Numéro:</span>
                      <p className="font-medium">{selectedRequest.numero_demande}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground">Magasin:</span>
                      <p className="font-medium">{selectedRequest.magasin_nom}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground">Statut:</span>
                      <span className={`badge ${statusConfig[selectedRequest.statut]?.className || 'badge-ghost'}`}>
                        {statusConfig[selectedRequest.statut]?.label || selectedRequest.statut}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground">Date:</span>
                      <p>{new Date(selectedRequest.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  {selectedRequest.notes && (
                    <div className="bg-base-200 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Notes:</p>
                      <p className="text-sm">{selectedRequest.notes}</p>
                    </div>
                  )}
                  {selectedRequest.motif_refus && (
                    <div className="bg-error/10 rounded-lg p-3">
                      <p className="text-xs text-error">Motif de refus:</p>
                      <p className="text-sm">{selectedRequest.motif_refus}</p>
                    </div>
                  )}
                  {selectedRequest.numero_transfer && (
                    <div className="bg-success/10 rounded-lg p-3">
                      <p className="text-xs text-success">Transfert:</p>
                      <p className="text-sm font-medium">{selectedRequest.numero_transfer}</p>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="table table-sm table-zebra">
                      <thead>
                        <tr>
                          <th>Produit</th>
                          <th>Ref</th>
                          <th className="text-right">Demandée</th>
                          <th className="text-right">Validée</th>
                          <th className="text-right">Transférée</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedRequest.lignes || []).map((line) => (
                          <tr key={line.id}>
                            <td>{line.produit_nom}</td>
                            <td className="font-mono text-xs">{line.reference}</td>
                            <td className="text-right">{line.quantite_demandee}</td>
                            <td className="text-right">{line.quantite_validee ?? '-'}</td>
                            <td className="text-right font-medium">{line.quantite_transferee}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <div className="flex items-center justify-between mb-2">
                <h2 className="card-title text-base">Stock dépôt</h2>
                <span className="text-xs opacity-60">{stockLevels.length} produits</span>
              </div>
              <div className="overflow-x-auto max-h-[250px]">
                <table className="table table-zebra table-xs">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="text-right">Dispo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLevels.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="text-center py-4 opacity-70">Aucun stock</td>
                      </tr>
                    ) : stockLevels.map((level) => (
                      <tr key={level.produit_id}>
                        <td>
                          <p className="text-sm truncate max-w-[200px]">{level.produit_nom}</p>
                          <p className="text-xs opacity-60">{level.reference}</p>
                        </td>
                        <td className={`text-right font-medium ${level.quantite_disponible <= 5 ? 'text-error' : ''}`}>
                          {level.quantite_disponible}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
