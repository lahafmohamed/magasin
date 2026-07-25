type TestDatabaseEnvironment = {
  NODE_ENV?: string;
  DB_NAME?: string;
};

const APPROVED_CI_DATABASES = new Set(['magasin_ci']);

/**
 * Local integration databases must use an explicit `_test` suffix. CI uses
 * the dedicated `magasin_ci` PostgreSQL service database.
 */
export function isApprovedTestDatabaseName(databaseName: string): boolean {
  const normalizedName = databaseName.trim().toLowerCase();
  return normalizedName.endsWith('_test') || APPROVED_CI_DATABASES.has(normalizedName);
}

/**
 * Fail before a test file can import the application and issue a database
 * query. This deliberately refuses ambiguous, development, and production
 * database names.
 */
export function assertSafeTestDatabase(
  environment: TestDatabaseEnvironment = process.env
): string {
  if (environment.NODE_ENV !== 'test') {
    throw new Error(
      'Tests backend refusés: NODE_ENV doit être exactement "test".'
    );
  }

  const databaseName = environment.DB_NAME?.trim();
  if (!databaseName) {
    throw new Error(
      'Tests backend refusés: DB_NAME doit désigner explicitement une base de test.'
    );
  }

  if (!isApprovedTestDatabaseName(databaseName)) {
    throw new Error(
      `Tests backend refusés: la base "${databaseName}" n'est pas autorisée. ` +
        'Utilisez une base locale se terminant par "_test" ou la base CI "magasin_ci".'
    );
  }

  return databaseName;
}
