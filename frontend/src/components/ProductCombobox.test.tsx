import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCombobox, type ProductOptionBase } from './ProductCombobox';

interface P extends ProductOptionBase {
  prix: number | null;
}

const souris: P = { id: 1, nom: 'Souris Logitech M185', reference: 'ACC-SOU-001', code_barre: '6001234500100', prix: 9500 };
const clavier: P = { id: 2, nom: 'Clavier Logitech K120', reference: 'ACC-CLA-001', code_barre: '6001234500101', prix: 7500 };
const sansPrix: P = { id: 3, nom: 'Câble HDMI 2 m', reference: 'ACC-HDM-002', code_barre: '6001234500102', prix: null };

function setup(search = vi.fn(async (q: string) => [souris, clavier, sansPrix].filter((p) => p.nom.toLowerCase().includes(q.toLowerCase()) || p.code_barre === q || p.reference === q))) {
  const onSelect = vi.fn();
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <label htmlFor="produit">Ajouter un produit</label>
      <ProductCombobox<P>
        id="produit"
        search={search}
        onSelect={onSelect}
        getDisabledReason={(p) => (p.prix === null ? 'Prix de vente non renseigné : corrigez la fiche produit.' : null)}
        renderOption={(p, { disabledReason }) => (
          <span>
            {p.nom} {disabledReason}
          </span>
        )}
      />
      <button type="submit">Créer le document</button>
    </form>
  );
  return { onSelect, onSubmit, search, user: userEvent.setup({ delay: null }) };
}

describe('ProductCombobox', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Entrée sur un code-barres exact : ajoute le produit, une seule recherche, aucun envoi du formulaire', async () => {
    const { onSelect, onSubmit, search, user } = setup();
    const input = screen.getByRole('combobox', { name: 'Ajouter un produit' });
    await user.type(input, `${souris.code_barre}{Enter}`);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(souris));
    expect(search).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('Entrée sur une référence exacte (casse ignorée) choisit ce produit parmi plusieurs résultats', async () => {
    const fuzzy = vi.fn(async () => [souris, clavier]);
    const { onSelect, user } = setup(fuzzy);
    await user.type(screen.getByRole('combobox', { name: 'Ajouter un produit' }), 'acc-cla-001{Enter}');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(clavier));
    expect(fuzzy).toHaveBeenCalledTimes(1);
  });

  it('plusieurs résultats : Entrée ouvre la liste sur la première option, une seconde Entrée l’ajoute', async () => {
    const { onSelect, onSubmit, user } = setup();
    const input = screen.getByRole('combobox', { name: 'Ajouter un produit' });
    await user.type(input, 'logitech{Enter}');
    const first = await screen.findByRole('option', { name: /Souris/ });
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', first.id));
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(souris);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('l’option active porte un anneau visible, pas seulement un fond (GV-01)', async () => {
    const { user } = setup();
    await user.type(screen.getByRole('combobox', { name: 'Ajouter un produit' }), 'logitech');
    await screen.findByRole('option', { name: /Clavier/ });
    await user.keyboard('{ArrowUp}');
    const active = screen.getByRole('option', { name: /Clavier/ });
    expect(active).toHaveAttribute('aria-selected', 'true');
    // `outline-2` sans `outline` ne dessinait rien en Tailwind 3 : l'anneau est un `ring`.
    expect(active).toHaveClass('ring-2', 'ring-inset', 'ring-ring');
    expect(screen.getByRole('option', { name: /Souris/ })).not.toHaveClass('ring-2');
  });

  it('flèches haut/bas bouclent, Échap ferme puis vide le champ', async () => {
    const { user } = setup();
    const input = screen.getByRole('combobox', { name: 'Ajouter un produit' });
    await user.type(input, 'logitech');
    await screen.findByRole('option', { name: /Clavier/ });
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /Clavier/ }).id);
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /Souris/ }).id);

    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('logitech');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('un produit sans prix n’est jamais ajouté : la raison est dite', async () => {
    const { onSelect, user } = setup();
    const input = screen.getByRole('combobox', { name: 'Ajouter un produit' });
    await user.type(input, `${sansPrix.code_barre}{Enter}`);
    const option = await screen.findByRole('option', { name: /Câble HDMI/ });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Câble HDMI 2 m : Prix de vente non renseigné');
  });

  it('une recherche en échec est signalée, jamais présentée comme « aucun produit »', async () => {
    const failing = vi.fn(async () => {
      throw { response: { status: 500, data: { success: false, error: 'Erreur serveur' } } };
    });
    const { user } = setup(failing);
    await user.type(screen.getByRole('combobox', { name: 'Ajouter un produit' }), 'souris');
    // Texte visible dans la liste + annonce de la région vivante.
    expect(await screen.findAllByText('La recherche de produits a échoué. Réessayez.')).toHaveLength(2);
    expect(screen.queryByText(/Aucun produit ne correspond/)).not.toBeInTheDocument();
  });

  it('un code-barres exact trouvé par la recherche différée est ajouté sans Entrée', async () => {
    const { onSelect, search, user } = setup();
    await user.type(screen.getByRole('combobox', { name: 'Ajouter un produit' }), clavier.code_barre as string);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(clavier));
    expect(search).toHaveBeenCalledTimes(1);
  });
});
