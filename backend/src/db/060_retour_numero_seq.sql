-- Migration 060: dedicated sequence for return (retour) numbers.
-- Replaces the race-prone MAX(numero_retour)+1 generation in ReturnService,
-- which produced duplicate numbers under concurrent returns.

CREATE SEQUENCE IF NOT EXISTS retour_numero_seq START 1;

-- Continue numbering from the highest existing return number.
SELECT setval(
  'retour_numero_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(numero_retour FROM '[0-9]+$') AS INTEGER)) FROM retours), 0) + 1,
  false
);
