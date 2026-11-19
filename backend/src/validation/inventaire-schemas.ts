import { z } from 'zod';

// ── Inventaire physique (migration 111) ─────────────────────────────────────

// POST /inventaires — ouvre un comptage sur un emplacement.
export const createInventaireSchema = z.object({
  location_id: z.coerce.number().int().positive('Emplacement requis'),
  categorie: z.string().trim().max(100).optional().or(z.literal('')),
  comptage_aveugle: z.boolean().optional(),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

// POST /inventaires/:id/comptages — une quantité comptée, par produit ou par code scanné.
export const compterInventaireSchema = z
  .object({
    produit_id: z.coerce.number().int().positive().optional(),
    code: z.string().trim().min(1).max(50).optional(),
    quantite: z.coerce.number().int('Quantité entière requise').min(0, 'Quantité négative').max(1_000_000),
    mode: z.enum(['fixer', 'ajouter']).default('fixer'),
  })
  .refine((d) => d.produit_id !== undefined || Boolean(d.code), {
    message: 'Produit ou code requis',
    path: ['produit_id'],
  })
  .refine((d) => d.mode !== 'ajouter' || d.quantite > 0, {
    message: 'Quantité à ajouter doit être > 0',
    path: ['quantite'],
  });

// POST /inventaires/:id/valider
export const validerInventaireSchema = z.object({
  non_comptes: z.enum(['ignorer', 'zero']).default('ignorer'),
});

// GET /inventaires/:id/lignes
export const inventaireLignesQuerySchema = z.object({
  search: z.string().max(100).optional(),
  filtre: z.enum(['tous', 'a_compter', 'comptes', 'ecarts']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
