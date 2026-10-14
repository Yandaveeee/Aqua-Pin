# Aquapin

Aquapin is an aquaculture management system built as a monorepo. It combines an offline-first mobile app for field operations, a web-based admin console, shared TypeScript models, and Supabase-backed authentication, data storage, and serverless functions.

## System Overview

The system is split into four main parts:

- `apps/mobile`: Expo React Native app for field staff
- `apps/web`: Next.js admin console
- `packages/shared`: shared TypeScript types used across apps
- `supabase`: SQL schema, RLS policies, templates, and edge functions

Core capabilities already represented in the codebase include:

- pond registration and geospatial location capture
- stocking, mortality, and harvest records
- pond history tracking
- offline data entry with local persistence
- sync queue monitoring and manual sync
- field staff authentication and role-based access control
- admin dashboard and typed settings management

## Implementation Milestones

### Step 1: Core Supabase schema and auth foundation

- creates `public_profiles`, `ponds`, `mortality_logs`, and `harvests`
- enables PostGIS for geospatial pond data
- sets up auth-triggered profile creation on signup
- adds initial RLS helpers and baseline access policies

### Step 2: Pond write-access fix

- fixes blocked pond inserts caused by RLS
- explicitly allows pond creation for authenticated field staff
- adds optional admin update/delete access for pond records

### Step 3: Advanced sync and farm-history schema upgrade

- adds pond metadata fields such as `boundary`, `is_active`, `current_species`, and `current_stock_count`
- adds enhanced harvest fields for species, partial harvests, and fish count
- creates `stocking_logs` and `pond_history`
- adds indexes, RLS policies, and realtime publication support for the new tables

### Step 4: Admin settings and audit tables

- creates `admin_settings` for structured configuration storage
- creates `admin_settings_audit` for change tracking
- adds admin-only policies for reading and writing settings

### Step 5: Admin RPC and audit foundation

- adds database RPC support for audited admin setting updates
- introduces admin access-audit infrastructure from the earlier backend rollout
- provides the privileged database layer used by admin configuration workflows

### Step 6: Profile repair and no-approval access flow

- repairs missing `public_profiles` rows for existing auth users
- ensures new signups automatically receive a usable field staff profile
- upgrades legacy pending staff records to approved
- removes approval dependency from the staff-access helper used by RLS
- allows safe self-repair profile inserts for authenticated users when triggers are incomplete

## Architecture

```text
Field Staff Mobile App
  -> local database / offline queue
  -> sync engine
  -> Supabase Postgres + Auth + RLS
  -> Admin Web Console

Shared package
  -> typed database and admin models reused by web code
```

## Repository Structure

```text
.
├── apps/
│   ├── mobile/          Expo mobile app for field operations
│   └── web/             Next.js admin console
├── packages/
│   └── shared/          Shared TypeScript types
├── supabase/
│   ├── functions/       Edge functions
│   ├── templates/       Auth/email templates
│   └── *.sql            Schema and policy scripts
└── package.json         Workspace scripts
```

## Main Modules

### Mobile app

The mobile application is designed for field use and local-first workflows. Current modules in the codebase include:

- authentication and protected navigation
- pond mapping and pond creation
- stocking, mortality, and harvest logging
- pond history and record review
- sync status and queue visibility
- profile, notification, security, and export settings
- AI assistant/reporting screens

Implementation notes:

- built with Expo and React Native
- uses WatermelonDB when available, with an AsyncStorage-backed mock fallback for Expo Go compatibility
- uses Supabase for auth and remote persistence

### Web admin console

The web app is a Next.js admin interface focused on system oversight and governance. Current pages and services include:

- landing page
- login and reset password flow
- admin dashboard with operational overview
- admin settings editor with audit trail

### Shared package

`packages/shared` exports database and admin types so the web app can work against a typed Supabase schema.

### Supabase backend

The `supabase/` directory contains:

- SQL schema setup scripts
- RLS and access-control updates
- admin settings RPC support
- email templates
- edge functions for AI reports and sync/data verification

## Prerequisites

- Node.js 20+ recommended
- npm with workspace support
- Expo CLI tooling through project scripts
- a Supabase project
- Android Studio and/or Xcode if you want native mobile builds

## Environment Variables

### Web app

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

The repository already includes `apps/web/.env.example` as a starting point.

### Mobile app

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_MAPS_API_KEY=your-maps-api-key
EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL=aquapin://auth/callback
```

Required mobile variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Optional mobile variables:

- `EXPO_PUBLIC_MAPS_API_KEY`
- `EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL`

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Set up your Supabase project and apply the SQL scripts in `supabase/`.

Recommended order:

1. `supabase/step1_schema.sql`
2. `supabase/step2_rls_policies_fix.sql`
3. `supabase/step3_schema_upgrade.sql`
4. `supabase/step4_settings_schema.sql`
5. `supabase/step5_admin_access_schema.sql`
6. `supabase/step6_profile_repair.sql`
7. `supabase/step7_account_scoped_rls.sql`

If you are using the consolidated setup script, review `supabase/full_setup_safe.sql`.

### 3. Run the web app

From the repo root:

```bash
npm run web:dev
```

Other web commands:

```bash
npm run web:build
npm run web:typecheck
npm run web:lint
```

### 4. Run the mobile app

From `apps/mobile`:

```bash
npm start
```

Useful mobile commands:

```bash
npm run android
npm run ios
npm run start:dev-client
npm run prebuild
npm run prebuild:clean
```

## EAS Build Commands

From the repo root:

```bash
npm run mobile:eas:build:android:preview
npm run mobile:eas:build:android:production
npm run mobile:eas:build:ios:production
```

## Supabase Edge Functions

Available functions:

- `supabase/functions/ai-reports`
- `supabase/functions/verify-data`

Deploy with:

```bash
supabase functions deploy ai-reports
supabase functions deploy verify-data
```

## Authentication and Access Model

The system uses Supabase Auth with profile and role data stored in `public_profiles`.

Roles in the current schema:

- `admin`
- `field_staff`

Admin-related backend support includes:

- typed admin settings storage
- admin settings audit history

## Offline-First Data Flow

The mobile app is structured around offline-first operation:

1. field staff records data locally
2. changes are queued when offline
3. the sync module retries when connectivity returns
4. Supabase becomes the shared source for cross-device/admin visibility

Tracked operational entities in the current codebase include:

- ponds
- stocking logs
- mortality logs
- harvests
- pond history

## Notes

- `apps/mobile/README.md` contains older mobile-specific implementation notes.
- Some repository areas still contain legacy naming or prototype logic, especially in marketing copy and edge-function internals. Treat this root README as the system-level guide to the current intended structure.

## AquaPin mobile improvements

Account Preferences now saves explicitly, disables unchanged or pending saves, and restores settings on restart. English and Filipino apply to supported navigation, preference, AI action, and sync labels; remaining legacy screen text stays in English. Preferences are device-local. AI conversations are stored locally under separate account keys, can be reopened, and are kept separate when starting a new chat.

The assistant reads an account-filtered snapshot of local pond, stocking, mortality, harvest and activity records, including offline changes. Each table is limited to 100 records with a truncation flag; it must not present a partial sample as a complete total. Its authenticated backend classifies topic scope before answering, uses conversation history for follow-ups, and explicitly prohibits invented AquaPin records. Model-based classification and grounding reduce mistakes but cannot guarantee perfect answers.

Deploy the new AI endpoint before distributing the updated mobile build:

```bash
# Configure GROQ_API_KEY using Supabase's secret manager.
# Optional server secret: GROQ_MODEL (default: openai/gpt-oss-20b).
supabase functions deploy ai-chat
```

The mobile app uses its existing Supabase URL, anon key and signed-in session. No database migration is required. The existing `ai-reports` function remains unchanged. A Groq key previously shipped in an `EXPO_PUBLIC_` variable should be replaced with a server-only key.

Existing mapped ponds open actions. Edit Boundary loads existing points and supports dragging, adding/removing points, moving the entire boundary, canceling and confirmed saving. Edit Location repositions the existing marker. Changes retain the pond ID and use the existing queue. A durable edit journal recovers interrupted local writes; creates retain a stable remote UUID through retries. The Recent Activities section includes creation, mapping, record and synchronization events. Clear Activities hides the displayed history on this device, preserving the underlying pond records and audit history.

Records also supports text search, oldest/newest sorting, and explicit details. Profile includes an editable display name through the existing authentication API.

Validation:

```bash
npm run typecheck -w apps/mobile
npm test -w apps/mobile
```

Tests cover account isolation, conversation restoration, off-topic refusal, backend error handling, native Markdown tables, invalid boundaries, interrupted mapping saves, stable sync IDs and activity idempotency, alongside existing authentication and offline-data regressions. Before release, test map dragging on Android/iOS, language restoration after restart, offline edit/reconnect, and the deployed AI endpoint on a signed-in device.
