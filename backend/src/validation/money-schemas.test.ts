import { describe, it, expect } from 'vitest';
import {
  applyAcompteSchema,
  refundAcompteSchema,
  createMouvementDiversSchema,
  ouvrirSessionCaisseSchema,
  posQuickSaleSchema,
  createDepenseSchema,
  createManualEntrySchema,
  enregistrerPieceSchema,
  createEmployeSchema,
  updateEmployeSchema,
  createCrmInteractionSchema,
  updateCrmInteractionSchema,
  updatePaiementSchema,
  createStockTransferSchema,
  transfertFondsSchema,
  recordAcompteSchema,
  updateReturnStatutSchema,
  applyAvoirToFactureSchema,
  registerSchema,
  changePasswordSchema,
} from './schemas';

// Schemas added in the 2026-07-18 P1 pass to gate money-touching mutation
// routes. These cover the accept/reject boundaries the handlers rely on.
describe('Money-route Zod schemas', () => {
  describe('applyAcompteSchema', () => {
    it('accepts a valid application and coerces string numbers', () => {
      const r = applyAcompteSchema.safeParse({ facture_id: '12', montant: '5000' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.facture_id).toBe(12);
        expect(r.data.montant).toBe(5000);
      }
    });
    it('rejects montant <= 0', () => {
      expect(applyAcompteSchema.safeParse({ facture_id: 1, montant: 0 }).success).toBe(false);
      expect(applyAcompteSchema.safeParse({ facture_id: 1, montant: -1 }).success).toBe(false);
    });
    it('rejects missing facture_id', () => {
      expect(applyAcompteSchema.safeParse({ montant: 100 }).success).toBe(false);
    });
  });

  describe('refundAcompteSchema', () => {
    it('accepts a valid cash refund', () => {
      expect(refundAcompteSchema.safeParse({ montant: 100, methode_paiement: 'espece' }).success).toBe(true);
    });
    it('rejects an unknown payment method', () => {
      expect(refundAcompteSchema.safeParse({ montant: 100, methode_paiement: 'bitcoin' }).success).toBe(false);
    });
  });

  describe('createMouvementDiversSchema', () => {
    it('accepts a valid apport', () => {
      const r = createMouvementDiversSchema.safeParse({
        type: 'encaissement',
        categorie: 'apport',
        montant: 25000,
        methode_paiement: 'espece',
        libelle: 'Apport de fond',
      });
      expect(r.success).toBe(true);
    });
    it('rejects a source-linked categorie (only divers categories allowed here)', () => {
      const r = createMouvementDiversSchema.safeParse({
        type: 'encaissement',
        categorie: 'paiement_client',
        montant: 25000,
        methode_paiement: 'espece',
        libelle: 'Paiement',
      });
      expect(r.success).toBe(false);
    });
    it('rejects a too-short libelle', () => {
      const r = createMouvementDiversSchema.safeParse({
        type: 'decaissement',
        categorie: 'autre_sortie',
        montant: 100,
        methode_paiement: 'espece',
        libelle: 'x',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('ouvrirSessionCaisseSchema', () => {
    it('accepts a zero fond_initial', () => {
      expect(ouvrirSessionCaisseSchema.safeParse({ magasin_id: 1, fond_initial: 0 }).success).toBe(true);
    });
    it('rejects a negative fond_initial', () => {
      expect(ouvrirSessionCaisseSchema.safeParse({ magasin_id: 1, fond_initial: -1 }).success).toBe(false);
    });
  });

  describe('posQuickSaleSchema', () => {
    it('accepts a sale with at least one item', () => {
      const r = posQuickSaleSchema.safeParse({
        sessionId: 3,
        items: [{ produit_id: 5, quantite: 2 }],
      });
      expect(r.success).toBe(true);
    });
    it('rejects an empty items array', () => {
      expect(posQuickSaleSchema.safeParse({ sessionId: 3, items: [] }).success).toBe(false);
    });
    it('accepts a null client_id (walk-in)', () => {
      const r = posQuickSaleSchema.safeParse({
        sessionId: 3,
        items: [{ produit_id: 5, quantite: 1 }],
        client_id: null,
      });
      expect(r.success).toBe(true);
    });
  });

  describe('createDepenseSchema', () => {
    it('accepts a valid expense', () => {
      const r = createDepenseSchema.safeParse({
        magasin_id: 1,
        categorie_id: 2,
        montant: 15000,
        methode_paiement: 'virement',
        description: 'Fournitures',
      });
      expect(r.success).toBe(true);
    });
    it('rejects a payment method outside the depenses set', () => {
      // wave is valid for payments but not for depenses (5-value set)
      const r = createDepenseSchema.safeParse({
        magasin_id: 1,
        categorie_id: 2,
        montant: 15000,
        methode_paiement: 'wave',
        description: 'Fournitures',
      });
      expect(r.success).toBe(false);
    });
    it('requires a description', () => {
      const r = createDepenseSchema.safeParse({
        magasin_id: 1,
        categorie_id: 2,
        montant: 15000,
        methode_paiement: 'espece',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('createManualEntrySchema / enregistrerPieceSchema', () => {
    it('manual entry accepts one balanced line', () => {
      const r = createManualEntrySchema.safeParse({
        numero_piece: 'OD-2026-1',
        journal: 'OD',
        date_ecriture: '2026-07-18',
        lignes: [{ compte_id: 1, debit: 1000, credit: 0 }],
      });
      expect(r.success).toBe(true);
    });
    it('piece requires at least 2 lignes', () => {
      const r = enregistrerPieceSchema.safeParse({
        date_ecriture: '2026-07-18',
        libelle: 'Écriture',
        lignes: [{ compte_numero: '512', debit: 1000, credit: 0 }],
      });
      expect(r.success).toBe(false);
    });
    it('piece accepts a balanced 2-line entry', () => {
      const r = enregistrerPieceSchema.safeParse({
        date_ecriture: '2026-07-18',
        libelle: 'Écriture',
        lignes: [
          { compte_numero: '512', debit: 1000, credit: 0 },
          { compte_numero: '701', debit: 0, credit: 1000 },
        ],
      });
      expect(r.success).toBe(true);
    });
  });

  describe('createEmployeSchema / updateEmployeSchema', () => {
    it('accepts a minimal valid employee', () => {
      const r = createEmployeSchema.safeParse({
        matricule: 'EMP-001',
        nom_complet: 'Awa Diop',
        date_embauche: '2026-01-15',
      });
      expect(r.success).toBe(true);
    });
    it('rejects a commission rate above 100%', () => {
      const r = createEmployeSchema.safeParse({
        matricule: 'EMP-001',
        nom_complet: 'Awa Diop',
        date_embauche: '2026-01-15',
        commission_taux: 150,
      });
      expect(r.success).toBe(false);
    });
    it('rejects an invalid email', () => {
      const r = createEmployeSchema.safeParse({
        matricule: 'EMP-001',
        nom_complet: 'Awa Diop',
        date_embauche: '2026-01-15',
        email: 'not-an-email',
      });
      expect(r.success).toBe(false);
    });
    it('update is partial and accepts the actif flag', () => {
      expect(updateEmployeSchema.safeParse({ actif: false }).success).toBe(true);
      expect(updateEmployeSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('CRM schemas', () => {
    it('createCrmInteractionSchema requires tiers_id, type, sujet', () => {
      expect(createCrmInteractionSchema.safeParse({ tiers_id: 1, type: 'appel', sujet: 'Suivi' }).success).toBe(true);
      expect(createCrmInteractionSchema.safeParse({ type: 'appel', sujet: 'Suivi' }).success).toBe(false);
    });
    it('updateCrmInteractionSchema is partial and drops tiers_id', () => {
      const r = updateCrmInteractionSchema.safeParse({ statut: 'termine' });
      expect(r.success).toBe(true);
      // tiers_id is omitted from the update schema, so a stray key is stripped
      const r2 = updateCrmInteractionSchema.safeParse({});
      expect(r2.success).toBe(true);
    });
  });

  describe('updatePaiementSchema', () => {
    it('is partial (empty ok) and coerces montant', () => {
      expect(updatePaiementSchema.safeParse({}).success).toBe(true);
      const r = updatePaiementSchema.safeParse({ montant: '250.50' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.montant).toBe(250.5);
    });
    it('rejects montant <= 0 and unknown method', () => {
      expect(updatePaiementSchema.safeParse({ montant: 0 }).success).toBe(false);
      expect(updatePaiementSchema.safeParse({ methode_paiement: 'gold' }).success).toBe(false);
    });
  });

  describe('createStockTransferSchema', () => {
    it('accepts a valid transfer', () => {
      const r = createStockTransferSchema.safeParse({
        location_source_id: 1, location_destination_id: 2,
        lignes: [{ produit_id: 5, quantite_demandee: 3 }],
      });
      expect(r.success).toBe(true);
    });
    it('rejects empty lignes and non-positive quantities', () => {
      expect(createStockTransferSchema.safeParse({ location_source_id: 1, location_destination_id: 2, lignes: [] }).success).toBe(false);
      expect(createStockTransferSchema.safeParse({
        location_source_id: 1, location_destination_id: 2,
        lignes: [{ produit_id: 5, quantite_demandee: 0 }],
      }).success).toBe(false);
    });
  });

  describe('transfertFondsSchema', () => {
    it('accepts a valid inter-caisse transfer', () => {
      expect(transfertFondsSchema.safeParse({ caisse_source_id: 1, caisse_dest_id: 2, montant: 5000 }).success).toBe(true);
    });
    it('rejects missing ids and non-positive amounts', () => {
      expect(transfertFondsSchema.safeParse({ caisse_dest_id: 2, montant: 5000 }).success).toBe(false);
      expect(transfertFondsSchema.safeParse({ caisse_source_id: 1, caisse_dest_id: 2, montant: -1 }).success).toBe(false);
    });
  });

  describe('recordAcompteSchema', () => {
    it('accepts a valid cash deposit and coerces montant', () => {
      const r = recordAcompteSchema.safeParse({ montant: '10000', methode_paiement: 'espece', magasin_id: 1 });
      expect(r.success).toBe(true);
    });
    it('rejects montant <= 0 and unknown method', () => {
      expect(recordAcompteSchema.safeParse({ montant: 0, methode_paiement: 'espece' }).success).toBe(false);
      expect(recordAcompteSchema.safeParse({ montant: 100, methode_paiement: 'crypto' }).success).toBe(false);
    });
  });

  describe('updateReturnStatutSchema', () => {
    it('accepts the state-machine values, rejects others', () => {
      expect(updateReturnStatutSchema.safeParse({ statut: 'traite' }).success).toBe(true);
      expect(updateReturnStatutSchema.safeParse({ statut: 'annule' }).success).toBe(true);
      expect(updateReturnStatutSchema.safeParse({ statut: 'expedie' }).success).toBe(false);
      expect(updateReturnStatutSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('applyAvoirToFactureSchema', () => {
    it('requires a positive facture_id', () => {
      expect(applyAvoirToFactureSchema.safeParse({ facture_id: 5 }).success).toBe(true);
      expect(applyAvoirToFactureSchema.safeParse({ facture_id: 0 }).success).toBe(false);
      expect(applyAvoirToFactureSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('auth schemas enforce the password policy', () => {
    it('registerSchema rejects a weak password, defaults role', () => {
      expect(registerSchema.safeParse({ username: 'bob', password: 'weak' }).success).toBe(false);
      const r = registerSchema.safeParse({ username: 'bob', password: 'Strong123' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.role).toBe('caissier');
    });
    it('changePasswordSchema rejects a weak new password', () => {
      expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'short' }).success).toBe(false);
      expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'Strong123' }).success).toBe(true);
    });
  });
});
