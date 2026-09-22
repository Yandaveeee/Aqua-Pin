-- ==========================================
-- Step 11: Repair registered staff full names
-- Safe to rerun.
-- ==========================================

BEGIN;

ALTER TABLE public.public_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Auth metadata is the authoritative value submitted by the registration form.
-- Existing profile values are retained only when the user has no registered name.
UPDATE public.public_profiles AS profile
SET full_name = COALESCE(
      NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(profile.full_name), ''),
      INITCAP(
        REPLACE(
          REPLACE(SPLIT_PART(profile.email, '@', 1), '.', ' '),
          '_',
          ' '
        )
      )
    ),
    updated_at = NOW()
FROM auth.users AS auth_user
WHERE auth_user.id = profile.id
  AND profile.full_name IS DISTINCT FROM COALESCE(
    NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(profile.full_name), ''),
    INITCAP(
      REPLACE(
        REPLACE(SPLIT_PART(profile.email, '@', 1), '.', ' '),
        '_',
        ' '
      )
    )
  );

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
      INITCAP(
        REPLACE(
          REPLACE(SPLIT_PART(new.email, '@', 1), '.', ' '),
          '_',
          ' '
        )
      )
    ),
    'field_staff',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(
        submitted_full_name,
        NULLIF(BTRIM(public.public_profiles.full_name), ''),
        EXCLUDED.full_name
      ),
      updated_at = NOW();

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX IF NOT EXISTS idx_public_profiles_full_name
  ON public.public_profiles (full_name);

COMMIT;
