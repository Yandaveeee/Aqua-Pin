-- Run in the Supabase SQL Editor on existing installations after step9.
-- Mobile stocking saves the record and updates the pond in separate requests.
-- Previously only admins could update ponds, so staff updates affected no rows.
BEGIN;

DROP POLICY IF EXISTS "Approved staff can update own ponds" ON public.ponds;
CREATE POLICY "Approved staff can update own ponds"
ON public.ponds
FOR UPDATE
TO authenticated
USING (public.is_approved_staff() AND created_by = auth.uid())
WITH CHECK (public.is_approved_staff() AND created_by = auth.uid());

-- Repair already-synced records using the same cycle rules as mobile pondState:
-- the latest full harvest ends a cycle; subsequent partial harvests and
-- mortalities reduce active stocking quantities. Leave unstocked ponds alone.
WITH cycles AS (
  SELECT p.id,
    COALESCE(MAX(h.created_at) FILTER (WHERE NOT h.is_partial),
      '-infinity'::timestamptz) AS ended_at
  FROM public.ponds p
  LEFT JOIN public.harvests h ON h.pond_id = p.id
  WHERE EXISTS (SELECT 1 FROM public.stocking_logs s WHERE s.pond_id = p.id)
  GROUP BY p.id
), totals AS (
  SELECT c.id,
    COALESCE((SELECT SUM(s.quantity) FROM public.stocking_logs s
      WHERE s.pond_id = c.id AND s.created_at > c.ended_at
        AND LOWER(BTRIM(COALESCE(NULLIF(s.status, ''), 'active'))) <> 'harvested'), 0)
    - COALESCE((SELECT SUM(h.fish_count) FROM public.harvests h
      WHERE h.pond_id = c.id AND h.created_at > c.ended_at), 0)
    - COALESCE((SELECT SUM(m.quantity) FROM public.mortality_logs m
      WHERE m.pond_id = c.id AND m.created_at > c.ended_at), 0) AS stock_count,
    (SELECT STRING_AGG(DISTINCT NULLIF(BTRIM(s.species), ''), ', ')
      FROM public.stocking_logs s
      WHERE s.pond_id = c.id AND s.created_at > c.ended_at
        AND LOWER(BTRIM(COALESCE(NULLIF(s.status, ''), 'active'))) <> 'harvested') AS species
  FROM cycles c
)
UPDATE public.ponds p
SET current_stock_count = GREATEST(0, t.stock_count),
    current_species = CASE WHEN t.stock_count > 0 THEN t.species ELSE NULL END,
    is_active = t.stock_count > 0 AND t.species IS NOT NULL
FROM totals t
WHERE p.id = t.id;

COMMIT;
