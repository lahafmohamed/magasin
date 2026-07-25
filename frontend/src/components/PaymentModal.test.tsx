import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentModal } from './PaymentModal';

describe('PaymentModal validation', () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onSubmit.mockResolvedValue(undefined);
  });

  it('requires a French cheque reference inline before submitting', async () => {
    render(
      <PaymentModal
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        remainingDue={25000}
        total={50000}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chèque' }));
    const reference = screen.getByLabelText(/Référence \(requis\)/);
    expect(reference).toHaveAttribute('aria-required', 'true');
    expect(reference).not.toHaveAttribute('required');

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    expect(await screen.findByText('Saisissez le numéro du chèque.')).toBeInTheDocument();
    await waitFor(() => expect(reference).toHaveFocus());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a cheque payment once its reference is provided', async () => {
    render(
      <PaymentModal
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        remainingDue={25000}
        total={50000}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chèque' }));
    fireEvent.change(screen.getByLabelText(/Référence \(requis\)/), {
      target: { value: 'CHQ-2026-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      montant: 25000,
      methode_paiement: 'cheque',
      reference: 'CHQ-2026-001',
      notes: undefined,
    }));
    expect(onClose).toHaveBeenCalled();
  });
});
