/**
 * Politique de mot de passe — miroir exact de `backend/src/utils/security.ts`
 * (`isStrongPassword`) : au moins 8 caractères, au moins une lettre et au
 * moins un chiffre. Garder les deux implémentations alignées, sinon le client
 * accepte des mots de passe que le serveur refuse.
 */
export const PASSWORD_POLICY_MESSAGE =
  'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.';

export interface PasswordRule {
  label: string;
  ok: boolean;
}

/** Règles individuelles, pour afficher une checklist pendant la saisie. */
export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: 'Au moins 8 caractères', ok: password.length >= 8 },
    { label: 'Au moins une lettre', ok: /[a-zA-Z]/.test(password) },
    { label: 'Au moins un chiffre', ok: /\d/.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return passwordRules(password).every((r) => r.ok);
}
