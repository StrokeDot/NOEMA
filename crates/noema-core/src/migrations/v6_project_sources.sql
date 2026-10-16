-- NOEMA v6: project-specific research roles and interpretation instructions.
-- Previous imports become Supporting sources. Belief frameworks remain distinct.
ALTER TABLE sources ADD COLUMN role TEXT NOT NULL DEFAULT 'Supporting'
  CHECK(role IN ('Supporting','Primary Reference','Critical Perspective','Background'));
ALTER TABLE sources ADD COLUMN use_guidance TEXT NOT NULL DEFAULT '';
PRAGMA user_version=6;
