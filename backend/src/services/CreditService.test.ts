import { describe, it, expect, vi } from 'vitest';
import { CreditService } from './CreditService';

const service = new CreditService();

/**
 * Build a fake pg client whose first query returns the tiers row and second
 * returns the outstanding sum. Mirrors assertWithinCreditLimit's query order.
 */
function fakeClient(tiersRow: any | null, encours: number) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: tiersRow ? [tiersRow] : [] })
    .mockResolvedValueOnce({ rows: [{ encours }] });
  return { query } as any;
}

describe('CreditService.assertWithinCreditLimit', () => {
  it('throws 404 when tiers not found', async () => {
    const client = fakeClient(null, 0);
    await expect(service.assertWithinCreditLimit(client, 1, 100)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TIERS_NOT_FOUND',
    });
  });

  it('skips check when credit_max <= 0 (no limit configured)', async () => {
    const client = fakeClient({ raison_sociale: 'X', prenom: null, credit_max: '0' }, 999999);
    await expect(service.assertWithinCreditLimit(client, 1, 500000)).resolves.toBeUndefined();
    // outstanding query never runs when unlimited
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('allows when outstanding + amount stays within limit', async () => {
    const client = fakeClient({ raison_sociale: 'Acme', prenom: null, credit_max: '1000' }, 400);
    await expect(service.assertWithinCreditLimit(client, 1, 600)).resolves.toBeUndefined();
  });

  it('rejects with 422 when outstanding + amount exceeds limit', async () => {
    const client = fakeClient({ raison_sociale: 'Acme', prenom: null, credit_max: '1000' }, 400);
    await expect(service.assertWithinCreditLimit(client, 1, 601)).rejects.toMatchObject({
      statusCode: 422,
      code: 'CREDIT_LIMIT_EXCEEDED',
    });
  });

  it('rejects when a single amount alone exceeds the limit', async () => {
    const client = fakeClient({ raison_sociale: 'Acme', prenom: null, credit_max: '1000' }, 0);
    await expect(service.assertWithinCreditLimit(client, 1, 1500)).rejects.toMatchObject({
      code: 'CREDIT_LIMIT_EXCEEDED',
    });
  });
});
