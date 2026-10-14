# AquaPin Field - Mobile App

Offline-first mobile data collection app for aquaculture field staff.

## Features

### ✅ Step 7: Authentication & Protected Navigation
- **AuthContext**: Supabase authentication with persistent sessions
- **Protected Routes**: Automatic redirect to login when not authenticated
- **Login Screen**: Sign in / Sign up flow with persistent sessions
- **Tab Navigation**: Bottom tab bar with Map, Data, Reports, Sync, Profile

### ✅ Step 8: Geospatial Map & Pin Creation
- **Map Screen**: Interactive map with react-native-maps
- **GPS Location**: Real-time user location with permission handling
- **Pond Markers**: Display existing ponds as pins on the map
- **Tap to Create**: Tap anywhere on map to place a new pond marker
- **Drag to Adjust**: Drag markers to fine-tune pond location
- **Pond Form**: Modal form to name and save pond with coordinates

### ✅ Step 9: Syncing & Data Entry Workflows
- **Offline Database**: WatermelonDB with SQLite for local storage
- **Data Entry Screen**: Multiple entry types (mortality, harvest, feeding, water quality)
- **Pond Selection**: Horizontal scrollable pond selector
- **Sync Screen**: Network status monitoring, pending items count, manual sync button
- **Auto-sync**: Automatic sync when connection restored

### ✅ Step 10: AI Reports & E2E Verification
- **AI Reports Screen**: Generate intelligent farm insights
- **Edge Functions**:
  - `ai-reports`: Analyzes farm data and generates recommendations
  - `verify-data`: E2E data integrity verification
- **Metrics Dashboard**: Mortality rate, harvest yield, efficiency scores
- **Action Items**: Prioritized recommendations with severity levels

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── DatabaseProvider.tsx
│   ├── NetworkStatus.tsx
│   └── SyncButton.tsx
├── contexts/            # React contexts
│   └── AuthContext.tsx  # Supabase auth
├── hooks/               # Custom hooks
│   └── useOfflineData.ts
├── navigation/          # Navigation setup
│   └── AppNavigator.tsx
├── screens/             # App screens
│   ├── LoginScreen.tsx
│   ├── MapScreen.tsx
│   ├── DataEntryScreen.tsx
│   ├── SyncScreen.tsx
│   ├── ReportScreen.tsx
│   └── ProfileScreen.tsx
├── db/                  # Database layer
│   ├── index.ts
│   ├── models.ts
│   ├── schema.ts
│   └── sync.ts
└── config/              # Configuration
    └── index.ts
```

## Environment Variables

Create `.env` file:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Optional. Defaults to aquapin://auth/callback for standalone email confirmation links.
EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL=aquapin://auth/callback
```

AI chat uses the authenticated Supabase `ai-chat` function and requires internet access. Set `GROQ_API_KEY` and optional `GROQ_MODEL` as Supabase secrets, then deploy `ai-chat`. Provider credentials must not be included in mobile environment variables. See the root README for setup and validation.

## Supabase Auth Email Redirects

For standalone signup confirmation links, configure Supabase Auth URL settings:

1. Set **Site URL** to your production web/app landing URL, not `http://localhost:3000`.
2. Add `aquapin://auth/callback` to **Redirect URLs**.
3. If you override `EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL`, add that exact value to **Redirect URLs** too.

## Standalone Map Troubleshooting

If the map works in Expo Go but shows a white screen in a standalone build, check:

1. **Google Cloud APIs**: Enable **Maps SDK for Android** (and **Maps SDK for iOS** if using Google provider on iOS).
2. **API key restrictions**: For Android app restrictions, add:
   - package name: `com.aquapin.mobile`
   - SHA-1 fingerprint used to sign the build (debug, EAS upload key, and Play App Signing key if published)
3. **Rebuild app** after key or restriction changes.

## Running the App

```bash
# Install dependencies
npm install

# Start Metro
npm start

# Start Metro for a native development client
npm run start:dev-client

# Regenerate native android/ios folders from app.json
npm run prebuild

# Clean and fully regenerate native folders
npm run prebuild:clean

# Run on Android
npm run android

# Run on iOS
npm run ios
```

## EAS Standalone Builds

This app is configured for Expo prebuild / CNG standalone builds.

- `ios/` and `android/` are treated as generated native folders.
- EAS uploads only the Expo app source and runs prebuild from `app.json`.
- `preview` and `production` produce standalone builds, not Expo Go bundles.

Use EAS from the mobile app workspace so the existing `apps/mobile/eas.json` profiles are applied.

```bash
# from repo root
npm run mobile:eas:build:android:preview

# Android production AAB
npm run mobile:eas:build:android:production

# iOS production build
npm run mobile:eas:build:ios:production
```

Or run directly inside `apps/mobile`:

```bash
npm run eas:build:android:preview
npm run eas:build:android:production
```

Notes:

1. Run `npx eas-cli login` first if you are not already authenticated to Expo/EAS.
2. `preview` builds an Android APK for testing and direct install.
3. `production` builds an Android App Bundle (`.aab`) for Play Store release.
4. `.easignore` is configured so EAS skips generated `ios/` and `android/` folders and uses Expo prebuild in the cloud.
5. If the build needs cloud env vars, define them in EAS or keep the required `EXPO_PUBLIC_*` values available to the build.

## Supabase Edge Functions

Deploy the edge functions:

```bash
# Deploy AI Reports function
supabase functions deploy ai-reports

# Deploy Verify Data function
supabase functions deploy verify-data
```

## Offline-First Architecture

1. **Local Database**: WatermelonDB with SQLite
2. **Sync Queue**: Changes queued locally when offline
3. **Conflict Resolution**: Server timestamp wins
4. **Background Sync**: Auto-sync when online

## Data Flow

```
Field Staff (Mobile)
    ↓
[Offline Storage] → WatermelonDB (SQLite)
    ↓
[Sync When Online] → Supabase
    ↓
[Admin Dashboard] → Real-time data
```
