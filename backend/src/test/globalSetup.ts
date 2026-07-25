import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertSafeTestDatabase } from './databaseGuard';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
assertSafeTestDatabase();

function resetDisposableDatabase(): void {
  const result = spawnSync(
    process.execPath,
    [path.resolve(process.cwd(), 'scripts/ci-db-setup.mjs'), '--reset-test-db'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`La réinitialisation de la base de test a échoué (code ${result.status ?? 'inconnu'}).`);
  }
}

export default function globalSetup(): () => void {
  resetDisposableDatabase();

  return () => {
    resetDisposableDatabase();
  };
}
