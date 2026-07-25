import { describe, expect, it } from 'vitest';
import {
  assertSafeTestDatabase,
  isApprovedTestDatabaseName,
} from './databaseGuard';

describe('databaseGuard', () => {
  it.each(['magasin_ci', 'hitek_test', 'erp_local_test'])(
    'autorise une base jetable explicite: %s',
    (databaseName) => {
      expect(isApprovedTestDatabaseName(databaseName)).toBe(true);
      expect(
        assertSafeTestDatabase({
          NODE_ENV: 'test',
          DB_NAME: databaseName,
        })
      ).toBe(databaseName);
    }
  );

  it.each(['pbdsarl', 'magasin_db', 'production', 'test_hitek'])(
    'refuse une base ambiguë ou métier: %s',
    (databaseName) => {
      expect(isApprovedTestDatabaseName(databaseName)).toBe(false);
      expect(() =>
        assertSafeTestDatabase({
          NODE_ENV: 'test',
          DB_NAME: databaseName,
        })
      ).toThrow(/n'est pas autorisée/);
    }
  );

  it('refuse un environnement autre que test', () => {
    expect(() =>
      assertSafeTestDatabase({
        NODE_ENV: 'development',
        DB_NAME: 'hitek_test',
      })
    ).toThrow(/NODE_ENV/);
  });

  it('refuse un nom de base absent', () => {
    expect(() => assertSafeTestDatabase({ NODE_ENV: 'test' })).toThrow(
      /DB_NAME/
    );
  });
});
