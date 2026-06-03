-- Migrate legacy priority codes to canonical values (normal, important).
UPDATE "Job"
SET "priority" = 'important'
WHERE LOWER(TRIM("priority")) IN (
  'urgent',
  'high',
  'wysoki',
  'wazny',
  'ważny',
  'important'
);

UPDATE "Job"
SET "priority" = 'normal'
WHERE LOWER(TRIM("priority")) IN (
  'standard',
  'standardowy',
  'normalny',
  'normal'
);

-- Any remaining unrecognized values default to normal (safe fallback).
UPDATE "Job"
SET "priority" = 'normal'
WHERE LOWER(TRIM("priority")) NOT IN ('normal', 'important');
