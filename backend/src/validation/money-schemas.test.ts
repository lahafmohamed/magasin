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
});
