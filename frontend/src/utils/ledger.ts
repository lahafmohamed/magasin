export interface LedgerSource {
  source_type?: string | null;
  source_id?: number | null;
}

export function ledgerSourceHref(entry: LedgerSource): string | null {
  if (entry.source_type === 'facture' && entry.source_id) {
    return `/factures/${entry.source_id}`;
  }
  return null;
}
