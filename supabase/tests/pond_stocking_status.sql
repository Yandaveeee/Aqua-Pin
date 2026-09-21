-- Run with psql -v ON_ERROR_STOP=1 in an EMPTY disposable database only.
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS integer LANGUAGE sql AS
  $$ SELECT current_setting('test.user_id')::integer $$;
CREATE FUNCTION public.is_approved_staff() RETURNS boolean LANGUAGE sql AS
  $$ SELECT true $$;
CREATE TABLE public.ponds (id integer PRIMARY KEY, created_by integer,
  is_active boolean DEFAULT false, current_species text, current_stock_count integer);
CREATE TABLE public.stocking_logs (pond_id integer, quantity integer, species text,
  status text DEFAULT 'active', created_at timestamptz);
CREATE TABLE public.harvests (pond_id integer, fish_count integer,
  is_partial boolean DEFAULT false, created_at timestamptz);
CREATE TABLE public.mortality_logs (pond_id integer, quantity integer, created_at timestamptz);
INSERT INTO ponds (id, created_by) VALUES (1, 1), (2, 2), (3, 1), (4, 1), (5, 1);
INSERT INTO stocking_logs (pond_id, quantity, species, created_at) VALUES
  (1, 100, 'Tilapia', '2026-01-01'),
  (2, 100, 'Tilapia', '2026-01-01'),
  (3, 100, 'Tilapia', '2026-01-01'),
  (3, 50, 'Milkfish', '2026-03-01'),
  (4, 100, 'Tilapia', '2026-01-01');
INSERT INTO harvests VALUES
  (1, 20, true, '2026-02-01'), (2, 100, false, '2026-02-01'),
  (3, 100, false, '2026-02-01');
INSERT INTO mortality_logs VALUES
  (1, 5, '2026-02-02'), (3, 10, '2026-01-02'), (4, 100, '2026-02-01');

\ir ../step10_pond_stocking_status_fix.sql

DO $$ BEGIN
  ASSERT (SELECT is_active AND current_stock_count = 75 AND current_species = 'Tilapia' FROM ponds WHERE id = 1), 'Stocking activates pond and subtracts losses';
  ASSERT (SELECT NOT is_active AND current_stock_count = 0 AND current_species IS NULL FROM ponds WHERE id = 2), 'Full harvest closes cycle';
  ASSERT (SELECT is_active AND current_stock_count = 50 AND current_species = 'Milkfish' FROM ponds WHERE id = 3), 'Restocking ignores previous cycle losses';
  ASSERT (SELECT NOT is_active AND current_stock_count = 0 FROM ponds WHERE id = 4), 'Total mortality deactivates pond';
  ASSERT (SELECT NOT is_active AND current_stock_count IS NULL FROM ponds WHERE id = 5), 'Unstocked pond unchanged';
END $$;

ALTER TABLE ponds ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own ON ponds FOR SELECT TO authenticated USING (created_by = auth.uid());
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT, UPDATE ON ponds TO authenticated;
SET ROLE authenticated;
SET test.user_id = '1';
UPDATE ponds SET current_stock_count = 80 WHERE id = 1;
UPDATE ponds SET current_stock_count = 999 WHERE id = 2;
DO $$ BEGIN
  BEGIN
    UPDATE ponds SET created_by = 2 WHERE id = 1;
    RAISE EXCEPTION 'Ownership transfer must be rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT current_stock_count = 80 FROM ponds WHERE id = 1), 'Owner update succeeds';
  ASSERT (SELECT current_stock_count = 0 FROM ponds WHERE id = 2), 'Other owner update blocked';
END $$;
