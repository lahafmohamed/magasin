import { describe, expect, it } from 'vitest';
import { normalizeApiResponseBody } from './api';

describe('normalizeApiResponseBody', () => {
  it('conserve les lignes et la pagination dans un objet page', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const pagination = { page: 1, limit: 20, total: 9, totalPages: 1 };

    const result = normalizeApiResponseBody({
      success: true,
      data: rows,
      pagination,
    });

    expect(result).toEqual({ data: rows, pagination });
    expect(rows).not.toHaveProperty('pagination');
  });

  it('déplie une réponse non paginée', () => {
    expect(
      normalizeApiResponseBody({
        success: true,
        data: { id: 42, numero: 'CMD-42' },
      })
    ).toEqual({ id: 42, numero: 'CMD-42' });
  });

  it('conserve les réponses historiques sans enveloppe', () => {
    const legacy = [{ id: 1 }];
    expect(normalizeApiResponseBody(legacy)).toBe(legacy);
  });

  it('conserve une réponse message sans champ data', () => {
    const response = { success: true, message: 'Statut mis à jour' };
    expect(normalizeApiResponseBody(response)).toBe(response);
  });
});
