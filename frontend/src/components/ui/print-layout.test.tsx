import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const settings = vi.hoisted(() => ({
  current: {
    id: 1,
    nom: 'Boutique Plateau',
    adresse: 'Abidjan',
    telephone: null,
    email: null,
    site_web: null,
    nif: null,
    rc: null,
    ai: null,
    cb: null,
    devise: 'XOF',
    logo_url: null as string | null,
    taux_conversion: 1,
    modules_desactives: [],
    type_activite: 'general',
    ticket_message: null,
  },
}));
vi.mock('../../services/api', () => ({
  companySettingsService: { get: vi.fn(async () => settings.current) },
}));

import { DocumentPrint } from './print-layout';

const NBSP = ' ';
const lignes = [{ produit_nom: 'Logitech B100', quantite: 2, prix_unitaire: 50000 }];

describe('DocumentPrint — logo (GV-07)', () => {
  beforeEach(() => {
    settings.current = { ...settings.current, logo_url: null };
  });

  it('sans logo enregistré : aucune image (plus de logo livré sur damier)', async () => {
    render(<DocumentPrint docType="facture" numero="FAC-2026-00022" lignes={lignes} />);
    await waitFor(() => expect(screen.getByText('Boutique Plateau')).toBeInTheDocument());
    expect(document.querySelector('img')).toBeNull();
  });

  it('le `/logo.png` livré par défaut n’est jamais imprimé', async () => {
    settings.current = { ...settings.current, logo_url: '/logo.png' };
    render(<DocumentPrint docType="devis" numero="DEV-2026-00007" lignes={lignes} />);
    await waitFor(() => expect(screen.getByText('Boutique Plateau')).toBeInTheDocument());
    expect(document.querySelector('img')).toBeNull();
  });

  it('le logo du client est imprimé, décoratif à côté du nom', async () => {
    settings.current = { ...settings.current, logo_url: '/uploads/logo-plateau.png' };
    render(<DocumentPrint docType="bl" numero="BL-2026-00006" lignes={lignes} />);
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    expect(document.querySelector('img')).toHaveAttribute('src', '/uploads/logo-plateau.png');
    expect(document.querySelector('img')).toHaveAttribute('alt', '');
  });
});

describe('DocumentPrint — facture en partie payée (GV-07)', () => {
  it('non payée : « Total à payer » = total', async () => {
    render(<DocumentPrint docType="facture" numero="FAC-2026-00022" lignes={lignes} montantPaye={0} />);
    await waitFor(() => expect(screen.getByText('Boutique Plateau')).toBeInTheDocument());
    expect(screen.getByText('Total à payer').nextElementSibling?.textContent).toBe(`100${NBSP}000${NBSP}FCFA`);
    expect(screen.queryByText('Reste à payer')).toBeNull();
  });

  it('en partie payée : total, déjà payé et « Reste à payer » = ce qui reste dû', async () => {
    render(<DocumentPrint docType="facture" numero="FAC-2026-00022" lignes={lignes} montantPaye="30000" />);
    await waitFor(() => expect(screen.getByText('Boutique Plateau')).toBeInTheDocument());
    expect(screen.queryByText('Total à payer')).toBeNull();
    expect(screen.getByText('Total de la facture').nextElementSibling?.textContent).toBe(`100${NBSP}000${NBSP}FCFA`);
    expect(screen.getByText('Déjà payé').nextElementSibling?.textContent).toBe(`30${NBSP}000${NBSP}FCFA`);
    expect(screen.getByText('Reste à payer').nextElementSibling?.textContent).toBe(`70${NBSP}000${NBSP}FCFA`);
  });

  it('le reste dû du serveur l’emporte (remise globale)', async () => {
    render(
      <DocumentPrint docType="facture" numero="FAC-2026-00022" lignes={lignes} montantPaye={30000} resteAPayer={65000} />
    );
    await waitFor(() => expect(screen.getByText('Reste à payer')).toBeInTheDocument());
    expect(screen.getByText('Reste à payer').nextElementSibling?.textContent).toBe(`65${NBSP}000${NBSP}FCFA`);
  });

  it('un avoir garde son libellé même si un montant payé est passé', async () => {
    render(<DocumentPrint docType="avoir" numero="AV-2026-00003" lignes={lignes} montantPaye={30000} />);
    await waitFor(() => expect(screen.getByText('Montant de l’avoir')).toBeInTheDocument());
    expect(screen.queryByText('Reste à payer')).toBeNull();
  });
});
