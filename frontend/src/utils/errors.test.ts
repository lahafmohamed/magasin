import { describe, it, expect } from 'vitest';
import {
  getErrorMessage,
  isCredentialError,
  BAD_CREDENTIALS_MESSAGE,
  WRONG_CURRENT_PASSWORD_MESSAGE,
  ACCOUNT_DISABLED_MESSAGE,
  LOGIN_RATE_LIMIT_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  FORBIDDEN_MESSAGE,
  NOT_FOUND_MESSAGE,
} from './errors';

const axiosError = (
  status: number | undefined,
  data?: unknown,
  message?: string,
  code?: string,
  url?: string
) => ({
  response: status === undefined ? undefined : { status, data },
  config: url ? { url } : undefined,
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
    expect(shown).toContain('Action refusée');
  });

  it('masque les autres fuites SQL', () => {
    for (const raw of [
      'duplicate key value violates unique constraint',
      'null value in column "montant" violates not-null constraint',
      'invalid input syntax for type numeric: "abc"',
      'relation "lots" does not exist',
      'column p.location_id does not exist',
    ]) {
      expect(getErrorMessage(axiosError(500, { error: raw }))).toContain('Action refusée');
    }
  });

  it('remplace les messages internes axios par le libellé métier', () => {
    expect(
      getErrorMessage(axiosError(500, {}, 'Request failed with status code 500'), 'Impossible d’enregistrer le paiement.')
    ).toBe('Impossible d’enregistrer le paiement.');
  });

  it('signale un serveur injoignable quand il n’y a pas de réponse', () => {
    expect(getErrorMessage(axiosError(undefined, undefined, 'Network Error', 'ERR_NETWORK'))).toBe(
      'Serveur injoignable. Vérifiez votre connexion.'
    );
  });

  it('mappe les statuts standards sans exposer le corps de réponse', () => {
    expect(getErrorMessage(axiosError(401, { error: 'jwt expired' }))).toBe(SESSION_EXPIRED_MESSAGE);
    expect(getErrorMessage(axiosError(403, { error: 'role_id 4 denied' }))).toBe(FORBIDDEN_MESSAGE);
    expect(getErrorMessage(axiosError(404, {}))).toBe(NOT_FOUND_MESSAGE);
    expect(getErrorMessage(axiosError(429, {}))).toBe('Trop de requêtes. Réessayez dans un instant.');
  });

  it('utilise le fallback fourni quand rien n’est exploitable', () => {
    expect(getErrorMessage({}, 'Impossible de charger les avoirs.')).toBe('Impossible de charger les avoirs.');
    expect(getErrorMessage(null, 'Impossible de charger la trésorerie.')).toBe(
      'Impossible de charger la trésorerie.'
    );
  });

  it('accepte une chaîne brute et la filtre aussi', () => {
    expect(getErrorMessage('Client introuvable')).toBe('Client introuvable');
    expect(getErrorMessage('violates check constraint "montant_positif"')).toContain('Action refusée');
    expect(getErrorMessage('statut is required', 'Impossible de changer le statut.')).toBe(
      'Impossible de changer le statut.'
    );
  });

  it('retombe sur data.message quand data.error est absent', () => {
    expect(getErrorMessage(axiosError(400, { message: 'Période comptable fermée.' }))).toBe(
      'Période comptable fermée.'
    );
  });

  // CP-S02 : un « Erreur serveur » nu ne doit pas écraser l'explication de la page.
  it('garde le libellé de la page quand le serveur ne dit que « Erreur serveur »', () => {
    const fallback = 'Impossible d’exécuter le transfert.';
    for (const generic of ['Erreur serveur', 'Erreur interne du serveur', 'Erreur', 'Internal Server Error', 'Erreur serveur.']) {
      expect(getErrorMessage(axiosError(500, { error: generic }), fallback)).toBe(fallback);
    }
  });

  it('ne laisse pas passer les messages de validation en anglais', () => {
    const fallback = 'Impossible de créer le bon de livraison.';
    for (const english of ['tiers_id and lignes are required', 'statut is required', 'Invalid statut', 'Route not found']) {
      expect(getErrorMessage(axiosError(400, { error: english }), fallback)).toBe(fallback);
    }
  });

  it('remonte le premier détail de validation quand il est en français', () => {
    expect(
      getErrorMessage(
        axiosError(400, {
          error: 'Données invalides',
          details: [{ field: 'raison_sociale', message: 'Raison sociale requise' }],
        }),
        'Impossible de créer le contact.'
      )
    ).toBe('Raison sociale requise');
    expect(
      getErrorMessage(
        axiosError(400, {
          error: 'Données invalides',
          details: [{ field: 'montant', message: 'Invalid input: expected number, received string' }],
        }),
        'Impossible d’enregistrer la dépense.'
      )
    ).toBe('Impossible d’enregistrer la dépense.');
  });

  // CP-S05 : jamais de texte d'exception JavaScript à l'écran.
  it('ne montre pas les erreurs d’exécution JavaScript', () => {
    const fallback = 'Impossible d’afficher la facture.';
    expect(getErrorMessage(new TypeError("Cannot read properties of undefined (reading 'map')"), fallback)).toBe(fallback);
    expect(getErrorMessage(new ReferenceError('foo is not defined'), fallback)).toBe(fallback);
    expect(getErrorMessage(new Error('Le montant dépasse le reste dû.'), fallback)).toBe(
      'Le montant dépasse le reste dû.'
    );
  });
});

// CP-S01 : un mot de passe mal saisi n'est pas une session expirée.
describe('erreurs d’authentification', () => {
  it('traduit un 401 de connexion en identifiants incorrects', () => {
    const err = axiosError(401, { error: 'Identifiants invalides' }, undefined, undefined, '/auth/login');
    expect(getErrorMessage(err, 'Connexion impossible.')).toBe(BAD_CREDENTIALS_MESSAGE);
    expect(isCredentialError(err)).toBe(true);
  });

  it('signale un compte désactivé et un excès de tentatives', () => {
    expect(getErrorMessage(axiosError(403, { error: 'Compte désactivé' }, undefined, undefined, '/auth/login'))).toBe(
      ACCOUNT_DISABLED_MESSAGE
    );
    expect(getErrorMessage(axiosError(429, {}, undefined, undefined, '/auth/login'))).toBe(LOGIN_RATE_LIMIT_MESSAGE);
  });

  it('distingue le mot de passe actuel incorrect d’une session expirée', () => {
    const wrong = axiosError(401, { error: 'Mot de passe actuel incorrect' }, undefined, undefined, '/auth/change-password');
    expect(getErrorMessage(wrong)).toBe(WRONG_CURRENT_PASSWORD_MESSAGE);
    expect(isCredentialError(wrong)).toBe(true);

    const expired = axiosError(401, { error: 'Token invalide' }, undefined, undefined, '/auth/change-password');
    expect(getErrorMessage(expired)).toBe(SESSION_EXPIRED_MESSAGE);
    expect(isCredentialError(expired)).toBe(false);
  });

  it('garde « Session expirée » pour tout autre 401', () => {
    const err = axiosError(401, { error: 'Non authentifié' }, undefined, undefined, '/factures');
    expect(getErrorMessage(err)).toBe(SESSION_EXPIRED_MESSAGE);
    expect(isCredentialError(err)).toBe(false);
  });
});
