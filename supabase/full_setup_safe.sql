-- ==========================================
-- AquaPin Full Supabase Setup (Safe to rerun)
-- ==========================================
-- Run this in the Supabase SQL Editor.
-- It combines step1-step4 and makes the setup idempotent.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'field_staff');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_status'
  ) THEN
    CREATE TYPE public.user_status AS ENUM ('pending', 'approved');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.public_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role public.user_role NOT NULL DEFAULT 'field_staff',
  status public.user_status NOT NULL DEFAULT 'approved',
  last_login_at TIMESTAMPTZ,
  latest_latitude DOUBLE PRECISION,
  latest_longitude DOUBLE PRECISION,
  location_accuracy_m DOUBLE PRECISION,
  location_label TEXT,
  municipality TEXT,
  barangay TEXT,
  region TEXT,
  location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.ponds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location extensions.geometry(Point, 4326) NOT NULL,
  created_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mortality_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  logged_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.harvests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
  yield_kg NUMERIC NOT NULL CHECK (yield_kg > 0),
  harvested_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ponds
  ADD COLUMN IF NOT EXISTS boundary TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS current_species TEXT,
  ADD COLUMN IF NOT EXISTS current_stock_count INTEGER;

ALTER TABLE public.harvests
  ADD COLUMN IF NOT EXISTS species TEXT,
  ADD COLUMN IF NOT EXISTS is_partial BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fish_count INTEGER;

CREATE TABLE IF NOT EXISTS public.stocking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  average_weight_g NUMERIC,
  source TEXT,
  stocked_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.pond_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  recorded_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_settings (
  section TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.public_profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_access_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES public.public_profiles(id) ON DELETE CASCADE,
  previous_status public.user_status NOT NULL,
  new_status public.user_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.public_profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT admin_access_audit_transition_check CHECK (previous_status <> new_status)
);

CREATE INDEX IF NOT EXISTS idx_stocking_logs_pond_id ON public.stocking_logs (pond_id);
CREATE INDEX IF NOT EXISTS idx_stocking_logs_created_at ON public.stocking_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pond_history_pond_id ON public.pond_history (pond_id);
CREATE INDEX IF NOT EXISTS idx_pond_history_created_at ON public.pond_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_settings_audit_section ON public.admin_settings_audit (section);
CREATE INDEX IF NOT EXISTS idx_admin_settings_audit_changed_at ON public.admin_settings_audit (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_audit_target_user ON public.admin_access_audit (target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_audit_changed_at ON public.admin_access_audit (changed_at DESC);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
      location_accuracy_m = CASE WHEN p_accuracy_m IS NULL THEN NULL ELSE GREATEST(0, p_accuracy_m) END,
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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.public_profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approved_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.public_profiles
    WHERE id = auth.uid()
      AND role = 'field_staff'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_pond(target_pond_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ponds
    WHERE id = target_pond_id
      AND created_by = auth.uid()
  );
$$;

-- Align existing installs with the no-approval flow.
UPDATE public.public_profiles AS profile
SET full_name = COALESCE(
      NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      INITCAP(REPLACE(REPLACE(SPLIT_PART(profile.email, '@', 1), '.', ' '), '_', ' '))
    ),
    updated_at = NOW()
FROM auth.users AS auth_user
WHERE auth_user.id = profile.id
  AND NULLIF(BTRIM(profile.full_name), '') IS NULL;

UPDATE public.public_profiles
SET status = 'approved',
    updated_at = NOW()
WHERE role = 'field_staff'
  AND status = 'pending';

ALTER TABLE public.public_profiles
ALTER COLUMN status SET DEFAULT 'approved';

CREATE OR REPLACE FUNCTION public.admin_approve_staff(target_user_id UUID, notes TEXT DEFAULT NULL)
RETURNS public.public_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  actor_profile public.public_profiles%ROWTYPE;
  target_profile public.public_profiles%ROWTYPE;
  updated_profile public.public_profiles%ROWTYPE;
BEGIN
  actor_id := auth.uid();

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO actor_profile
  FROM public.public_profiles
  WHERE id = actor_id;

  IF NOT FOUND OR actor_profile.role <> 'admin' OR actor_profile.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved admins can approve staff accounts';
  END IF;

  SELECT * INTO target_profile
  FROM public.public_profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  IF target_profile.role <> 'field_staff' THEN
    RAISE EXCEPTION 'Only field staff accounts can be approved';
  END IF;

  IF target_profile.status <> 'pending' THEN
    RAISE EXCEPTION 'Profile status is "%", expected "pending"', target_profile.status;
  END IF;

  UPDATE public.public_profiles
  SET status = 'approved',
      updated_at = NOW()
  WHERE id = target_profile.id
  RETURNING * INTO updated_profile;

  INSERT INTO public.admin_access_audit (
    target_user_id,
    previous_status,
    new_status,
    changed_by,
    changed_at,
    notes
  )
  VALUES (
    updated_profile.id,
    target_profile.status,
    updated_profile.status,
    actor_id,
    NOW(),
    NULLIF(BTRIM(notes), '')
  );

  RETURN updated_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_setting(p_section TEXT, p_value JSONB)
RETURNS public.admin_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  actor_profile public.public_profiles%ROWTYPE;
  previous_row public.admin_settings%ROWTYPE;
  updated_row public.admin_settings%ROWTYPE;
  had_previous BOOLEAN := FALSE;
BEGIN
  actor_id := auth.uid();

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO actor_profile
  FROM public.public_profiles
  WHERE id = actor_id;

  IF NOT FOUND OR actor_profile.role <> 'admin' OR actor_profile.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved admins can update settings';
  END IF;

  IF p_section NOT IN ('general', 'operations', 'notifications', 'integrations', 'security') THEN
    RAISE EXCEPTION 'Invalid settings section: %', p_section;
  END IF;

  IF p_value IS NULL THEN
    RAISE EXCEPTION 'Settings value cannot be null';
  END IF;

  SELECT * INTO previous_row
  FROM public.admin_settings
  WHERE section = p_section
  FOR UPDATE;
  had_previous := FOUND;

  IF had_previous THEN
    UPDATE public.admin_settings
    SET value = p_value,
        updated_by = actor_id,
        updated_at = NOW()
    WHERE section = p_section
    RETURNING * INTO updated_row;
  ELSE
    INSERT INTO public.admin_settings (section, value, updated_by, created_at, updated_at)
    VALUES (p_section, p_value, actor_id, NOW(), NOW())
    RETURNING * INTO updated_row;
  END IF;

  INSERT INTO public.admin_settings_audit (
    section,
    previous_value,
    new_value,
    changed_by,
    changed_at
  )
  VALUES (
    updated_row.section,
    CASE WHEN had_previous THEN previous_row.value ELSE NULL END,
    updated_row.value,
    actor_id,
    NOW()
  );

  RETURN updated_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_staff(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_staff(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_upsert_setting(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_setting(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.user_owns_pond(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_owns_pond(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.record_staff_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_session() TO authenticated;
REVOKE ALL ON FUNCTION public.update_staff_location(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_location(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END
$$;

ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mortality_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pond_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.public_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.public_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.public_profiles;

CREATE POLICY "Admins can view all profiles"
ON public.public_profiles
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can update profiles"
ON public.public_profiles
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own profile"
ON public.public_profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all ponds" ON public.ponds;
DROP POLICY IF EXISTS "Approved staff can view ponds" ON public.ponds;
DROP POLICY IF EXISTS "Approved staff can create ponds" ON public.ponds;
DROP POLICY IF EXISTS "Approved staff and admins can create ponds" ON public.ponds;
DROP POLICY IF EXISTS "Admins can update ponds" ON public.ponds;
DROP POLICY IF EXISTS "Admins can delete ponds" ON public.ponds;

CREATE POLICY "Admins can view all ponds"
ON public.ponds
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Approved staff can view ponds"
ON public.ponds
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND created_by = auth.uid()
);

CREATE POLICY "Approved staff and admins can create ponds"
ON public.ponds
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND created_by = auth.uid()
);

CREATE POLICY "Admins can update ponds"
ON public.ponds
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete ponds"
ON public.ponds
FOR DELETE
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all mortality logs" ON public.mortality_logs;
DROP POLICY IF EXISTS "Approved staff can view mortality logs" ON public.mortality_logs;
DROP POLICY IF EXISTS "Approved staff can create mortality logs" ON public.mortality_logs;

CREATE POLICY "Admins can view all mortality logs"
ON public.mortality_logs
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Approved staff can view mortality logs"
ON public.mortality_logs
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND logged_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create mortality logs"
ON public.mortality_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND logged_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

DROP POLICY IF EXISTS "Admins can view all harvests" ON public.harvests;
DROP POLICY IF EXISTS "Approved staff can view harvests" ON public.harvests;
DROP POLICY IF EXISTS "Approved staff can create harvests" ON public.harvests;

CREATE POLICY "Admins can view all harvests"
ON public.harvests
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Approved staff can view harvests"
ON public.harvests
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND harvested_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create harvests"
ON public.harvests
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND harvested_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

DROP POLICY IF EXISTS "Admins can view all stocking logs" ON public.stocking_logs;
DROP POLICY IF EXISTS "Approved staff can view stocking logs" ON public.stocking_logs;
DROP POLICY IF EXISTS "Approved staff can create stocking logs" ON public.stocking_logs;

CREATE POLICY "Admins can view all stocking logs"
ON public.stocking_logs
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Approved staff can view stocking logs"
ON public.stocking_logs
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND stocked_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create stocking logs"
ON public.stocking_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND stocked_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

DROP POLICY IF EXISTS "Admins can view all pond history" ON public.pond_history;
DROP POLICY IF EXISTS "Approved staff can view pond history" ON public.pond_history;
DROP POLICY IF EXISTS "Approved staff can create pond history" ON public.pond_history;

CREATE POLICY "Admins can view all pond history"
ON public.pond_history
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Approved staff can view pond history"
ON public.pond_history
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND recorded_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create pond history"
ON public.pond_history
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND recorded_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

DROP POLICY IF EXISTS "Admins can read settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can upsert settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can read settings audit" ON public.admin_settings_audit;
DROP POLICY IF EXISTS "Admins can insert settings audit" ON public.admin_settings_audit;
DROP POLICY IF EXISTS "Admins can read access audit" ON public.admin_access_audit;
DROP POLICY IF EXISTS "Admins can insert access audit" ON public.admin_access_audit;

CREATE POLICY "Admins can read settings"
ON public.admin_settings
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can upsert settings"
ON public.admin_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can read settings audit"
ON public.admin_settings_audit
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert settings audit"
ON public.admin_settings_audit
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND changed_by = auth.uid());

CREATE POLICY "Admins can read access audit"
ON public.admin_access_audit
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert access audit"
ON public.admin_access_audit
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND changed_by = auth.uid());

INSERT INTO public.admin_settings (section, value)
VALUES
  (
    'general',
    '{"organizationName":"AquaPin Operations","timezone":"Asia/Manila","units":"metric"}'::jsonb
  ),
  (
    'operations',
    '{"survivalThresholdPercent":84,"lowStockThreshold":1500,"defaultMapCenterLat":13.4104,"defaultMapCenterLng":122.5639}'::jsonb
  ),
  (
    'notifications',
    '{"inAppEnabled":true,"emailEnabled":true,"staleSyncMinutes":45,"criticalAlertsOnly":false}'::jsonb
  ),
  (
    'integrations',
    '{"googleMapsApiKey":"","webhookUrl":""}'::jsonb
  ),
  (
    'security',
    '{"sessionTimeoutMinutes":120,"enforceStrongPasswords":true,"requireMfaForAdmins":false}'::jsonb
  )
ON CONFLICT (section) DO NOTHING;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stocking_logs;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pond_history;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END
$$;

COMMIT;

-- ==========================================
-- Optional: Promote Your Admin Account
-- ==========================================
-- 1) Sign up once in the app so your profile row exists.
-- 2) Replace the email below and run the two statements.
--
-- UPDATE public.public_profiles
-- SET role = 'admin',
--     status = 'approved',
--     updated_at = NOW()
-- WHERE email = 'admin@aquapin.app';
--
-- SELECT id, email, role, status
-- FROM public.public_profiles
-- WHERE email = 'admin@aquapin.app';
