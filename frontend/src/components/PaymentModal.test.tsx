import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PaymentModal } from './PaymentModal';

type ModalProps = Partial<React.ComponentProps<typeof PaymentModal>>;

describe('PaymentModal', () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  const renderModal = (props: ModalProps = {}) =>
    render(
      <MemoryRouter>
        <PaymentModal
          isOpen
          onClose={onClose}
          onSubmit={onSubmit}
          remainingDue={25000}
          total={50000}
          numeroFacture="FAC-2026-00110"
          {...props}
        />
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    onSubmit.mockResolvedValue(undefined);
  });

  it('exposes the payment method as a radio group (a11y S03)', () => {
    renderModal();
    expect(screen.getByRole('radiogroup', { name: 'Mode de paiement' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Espèces' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Chèque' })).toHaveAttribute('aria-checked', 'false');
  });

  it('requires the cheque number inline before submitting', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Chèque' }));
    const reference = screen.getByLabelText(/Numéro du chèque/);
    expect(reference).toHaveAttribute('aria-required', 'true');
    expect(reference).not.toHaveAttribute('required');

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    expect(await screen.findByText('Saisissez le numéro du chèque.')).toBeInTheDocument();
    await waitFor(() => expect(reference).toHaveFocus());
    expect(reference).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a cheque payment once its reference is provided', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Chèque' }));
    fireEvent.change(screen.getByLabelText(/Numéro du chèque/), {
      target: { value: 'CHQ-2026-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        montant: 25000,
        methode_paiement: 'cheque',
        reference: 'CHQ-2026-001',
        notes: undefined,
        idempotency_key: expect.stringMatching(/^paiement-/),
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('records exactly the amount typed, never more (D3)', async () => {
    renderModal({ acomptesDisponibles: 30000 });

    // Un acompte disponible est signalé, jamais consommé d'office.
    expect(screen.getByText(/Ce paiement ne l’utilise pas/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Montant du paiement'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ montant: 10000, methode_paiement: 'espece' });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('appliquer_acomptes');
  });

  it('refuses an amount above the remaining due without calling the API', async () => {
    renderModal();

    const amount = screen.getByLabelText('Montant du paiement');
    fireEvent.change(amount, { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    expect(await screen.findByText(/Le montant dépasse le reste dû/)).toBeInTheDocument();
    await waitFor(() => expect(amount).toHaveFocus());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the change to give back for a cash payment', () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Montant reçu du client/), { target: { value: '30000' } });
    const change = screen.getByText('À rendre').closest('p');
    expect(change?.textContent?.replace(/\s/g, ' ')).toMatch(/5 000 FCFA/);
  });

  it('blocks a cash payment when the customer handed over less than the amount (P-M1)', async () => {
    renderModal();

    const received = screen.getByLabelText(/Montant reçu du client/);
    fireEvent.change(received, { target: { value: '20000' } });
    // Entrée dans « Montant reçu » : le geste naturel de la caissière.
    fireEvent.submit(received.closest('form')!);

    const error = await screen.findByText(/Le client a donné 20\s000\sFCFA, moins que le paiement de 25\s000\sFCFA\./);
    expect(error).toHaveAttribute('id', 'payment-received-error');
    expect(received).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(received).toHaveFocus());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('records only the cash received when the cashier chooses it (P-M1)', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Montant reçu du client/), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    fireEvent.click(await screen.findByRole('button', { name: /Enregistrer 20\s000\sFCFA seulement/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ montant: 20000, methode_paiement: 'espece' });
    expect(onClose).toHaveBeenCalled();
  });

  it('lets a non-cash payment through whatever was typed as received cash', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Montant reçu du client/), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Carte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ montant: 25000, methode_paiement: 'carte' });
  });

  it('warns upfront that the till is closed for cash, with a link to open it (U-23)', () => {
    renderModal({ cashTill: 'closed', caisseHref: '/caisse' });

    expect(screen.getByText('La caisse est fermée : ouvrez-la pour encaisser des espèces.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la caisse' })).toHaveAttribute('href', '/caisse');

    // Un paiement par carte ne passe pas par le tiroir : plus d'avertissement.
    fireEvent.click(screen.getByRole('radio', { name: 'Carte' }));
    expect(screen.queryByText(/La caisse est fermée/)).not.toBeInTheDocument();
  });

  it('hides the till link when the role cannot open the till page', () => {
    renderModal({ cashTill: 'closed', caisseHref: null });

    expect(screen.getByText(/La caisse est fermée/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ouvrir la caisse' })).not.toBeInTheDocument();
  });

  it('turns a CAISSE_FERMEE refusal into the closed-till guidance, not a raw error', async () => {
    onSubmit.mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          error: 'La caisse de ce magasin est fermée : ouvrez-la avant d’encaisser des espèces.',
          code: 'CAISSE_FERMEE',
        },
      },
    });
    renderModal({ caisseHref: '/caisse' });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La caisse est fermée : ouvrez-la pour encaisser des espèces.');
    expect(screen.getByRole('link', { name: 'Ouvrir la caisse' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps one idempotency key for retries within the same opening', async () => {
    onSubmit.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(undefined);
    renderModal({ cashTill: 'open' });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[0][0].idempotency_key).toBe(onSubmit.mock.calls[1][0].idempotency_key);
  });
});
