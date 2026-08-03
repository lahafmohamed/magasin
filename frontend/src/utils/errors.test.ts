import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errors';

const axiosError = (status: number | undefined, data?: unknown, message?: string, code?: string) => ({
  response: status === undefined ? undefined : { status, data },
  message,
  code,
});

describe('getErrorMessage', () => {
  it('renvoie le message métier du serveur', () => {
    expect(getErrorMessage(axiosError(400, { error: 'Le stock est insuffisant.' }))).toBe(
      'Le stock est insuffisant.'
    );
  });

  it('masque les erreurs de contrainte Postgres', () => {
    const pg = 'update or delete on table "tiers" violates foreign key constraint "factures_client_id_fkey"';
    const shown = getErrorMessage(axiosError(500, { error: pg }));
    expect(shown).not.toContain('constraint');
    expect(shown).not.toContain('tiers');
    expect(shown).toContain('Opération refusée');
  });

  it('masque les autres fuites SQL', () => {
    for (const raw of [
      'duplicate key value violates unique constraint',
      'null value in column "montant" violates not-null constraint',
      'invalid input syntax for type numeric: "abc"',
      'relation "lots" does not exist',
    ]) {
      expect(getErrorMessage(axiosError(500, { error: raw }))).toContain('Opération refusée');
    }
  });

  it('remplace les messages internes axios par le libellé métier', () => {
    expect(
      getErrorMessage(axiosError(500, {}, 'Request failed with status code 500'), 'Erreur lors du paiement')
    ).toBe('Erreur lors du paiement');
  });

  it('signale un serveur injoignable quand il n’y a pas de réponse', () => {
    expect(getErrorMessage(axiosError(undefined, undefined, 'Network Error', 'ERR_NETWORK'))).toBe(
      'Serveur injoignable. Vérifiez votre connexion.'
    );
  });

  it('mappe les statuts standards sans exposer le corps de réponse', () => {
    expect(getErrorMessage(axiosError(401, { error: 'jwt expired' }))).toBe(
      'Session expirée. Reconnectez-vous.'
    );
    expect(getErrorMessage(axiosError(403, { error: 'role_id 4 denied' }))).toBe(
      "Vous n'avez pas les droits pour cette action."
    );
    expect(getErrorMessage(axiosError(404, {}))).toBe('Ressource introuvable.');
    expect(getErrorMessage(axiosError(429, {}))).toBe('Trop de requêtes. Réessayez dans un instant.');
  });

  it('utilise le fallback fourni quand rien n’est exploitable', () => {
    expect(getErrorMessage({}, 'Erreur lors du chargement des avoirs')).toBe(
      'Erreur lors du chargement des avoirs'
    );
    expect(getErrorMessage(null, 'Erreur de trésorerie')).toBe('Erreur de trésorerie');
  });

  it('accepte une chaîne brute et la filtre aussi', () => {
    expect(getErrorMessage('Client introuvable')).toBe('Client introuvable');
    expect(getErrorMessage('violates check constraint "montant_positif"')).toContain(
      'Opération refusée'
    );
  });

  it('retombe sur data.message quand data.error est absent', () => {
    expect(getErrorMessage(axiosError(400, { message: 'Période comptable fermée.' }))).toBe(
      'Période comptable fermée.'
    );
  });
});
