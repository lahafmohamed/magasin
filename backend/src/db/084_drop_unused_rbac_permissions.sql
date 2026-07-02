-- ============================================================
-- 084_drop_unused_rbac_permissions.sql
-- RBAC consolidation: the app now authorizes exclusively through the single
-- `authorize(roles)` mechanism (role string on the JWT, sourced from roles.nom).
--
-- The DB-driven permission system (056/057/058) is removed: it was consulted by
-- exactly one route group (admin-users) and had ZERO per-user overrides in practice
-- (user_permissions was always empty, no user ever set customiser_permissions).
--
-- KEPT: `roles` — still the source of the role string via utilisateurs.role_id.
-- DROPPED: the permission catalog + role/user permission maps + the per-user
--          override flag. Order respects FKs (child maps before parent catalog).
-- ============================================================

ALTER TABLE utilisateurs DROP COLUMN IF EXISTS customiser_permissions;

DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
