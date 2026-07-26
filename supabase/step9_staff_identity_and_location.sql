-- ==========================================
-- Step 9: Staff identity, activity, and latest location
-- Safe to rerun.
-- ==========================================

BEGIN;

ALTER TABLE public.public_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS latest_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS barangay TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

UPDATE public.public_profiles AS profile
SET full_name = COALESCE(
      NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      INITCAP(REPLACE(REPLACE(SPLIT_PART(profile.email, '@', 1), '.', ' '), '_', ' '))
    ),
    updated_at = NOW()
FROM auth.users AS auth_user
WHERE auth_user.id = profile.id
  AND NULLIF(BTRIM(profile.full_name), '') IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submitted_full_name TEXT;
BEGIN
  submitted_full_name := NULLIF(BTRIM(new.raw_user_meta_data ->> 'full_name'), '');

  INSERT INTO public.public_profiles (id, email, full_name, role, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      submitted_full_name,
      INITCAP(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ' '), '_', ' '))
    ),
    'field_staff',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.public_profiles.full_name),
      updated_at = NOW();

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_staff_session()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  recorded_at TIMESTAMPTZ := NOW();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.public_profiles
  SET last_login_at = recorded_at,
      updated_at = NOW()
  WHERE id = actor_id;

  RETURN recorded_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_location(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy_m DOUBLE PRECISION DEFAULT NULL,
  p_location_label TEXT DEFAULT NULL,
  p_municipality TEXT DEFAULT NULL,
  p_barangay TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  recorded_at TIMESTAMPTZ := NOW();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_latitude IS NULL OR p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;

  IF p_longitude IS NULL OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
  END IF;

  UPDATE public.public_profiles
  SET latest_latitude = p_latitude,
      latest_longitude = p_longitude,
      location_accuracy_m = CASE
        WHEN p_accuracy_m IS NULL THEN NULL
        ELSE GREATEST(0, p_accuracy_m)
      END,
      location_label = NULLIF(BTRIM(p_location_label), ''),
      municipality = NULLIF(BTRIM(p_municipality), ''),
      barangay = NULLIF(BTRIM(p_barangay), ''),
      region = NULLIF(BTRIM(p_region), ''),
      location_updated_at = recorded_at,
      updated_at = NOW()
  WHERE id = actor_id
    AND role = 'field_staff';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Field staff profile not found';
  END IF;

  RETURN recorded_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_staff_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_session() TO authenticated;

REVOKE ALL ON FUNCTION public.update_staff_location(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_location(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_public_profiles_full_name
  ON public.public_profiles (full_name);

CREATE INDEX IF NOT EXISTS idx_public_profiles_location_updated_at
  ON public.public_profiles (location_updated_at DESC);

COMMIT;
