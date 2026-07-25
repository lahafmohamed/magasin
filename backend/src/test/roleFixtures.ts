import bcrypt from 'bcrypt';
import pool from '../db/connection';

export const SUPPORTED_TEST_ROLES = [
  'admin',
  'manager',
  'caissier',
  'magasin_staff',
  'depot_staff',
  'viewer',
] as const;

export type SupportedTestRole = typeof SUPPORTED_TEST_ROLES[number];

export interface RoleFixture {
  id: number;
  role: SupportedTestRole;
  username: string;
  password: string;
}

export async function createRoleFixtures(): Promise<RoleFixture[]> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const password = 'RoleSmoke1234';
  const passwordHash = await bcrypt.hash(password, 12);
  const fixtures: RoleFixture[] = [];

  for (const role of SUPPORTED_TEST_ROLES) {
    const username = `role-smoke-${role}-${suffix}`;
    const { rows } = await pool.query(
      `INSERT INTO utilisateurs
         (username, email, password_hash, nom_complet, role_id, actif, must_change_password)
       SELECT $1, $2, $3, $4, r.id, true, false
       FROM roles r
       WHERE r.nom = $5
       RETURNING id`,
      [
        username,
        `${username}@test.local`,
        passwordHash,
        `Test ${role}`,
        role,
      ]
    );

    if (!rows[0]?.id) {
      throw new Error(`Le rôle de test "${role}" est absent de la base jetable.`);
    }

    fixtures.push({
      id: Number(rows[0].id),
      role,
      username,
      password,
    });
  }

  return fixtures;
}

export async function removeRoleFixtures(fixtures: RoleFixture[]): Promise<void> {
  const userIds = fixtures.map((fixture) => fixture.id);
  if (userIds.length === 0) return;

  await pool.query(
    `DELETE FROM audit_log
     WHERE user_id = ANY($1::int[])
        OR (table_name = 'utilisateurs' AND record_id = ANY($1::int[]))`,
    [userIds]
  );
  await pool.query('DELETE FROM user_location_roles WHERE utilisateur_id = ANY($1::int[])', [userIds]);
  await pool.query('DELETE FROM utilisateur_locations WHERE utilisateur_id = ANY($1::int[])', [userIds]);
  await pool.query('DELETE FROM user_sessions WHERE utilisateur_id = ANY($1::int[])', [userIds]);
  await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1::int[])', [userIds]);
}
