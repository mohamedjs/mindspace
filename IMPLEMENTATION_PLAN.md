# MindSpace — Implementation Plan for Executing Agent

> **Purpose**: Step-by-step instructions for an AI agent to build the MindSpace MVP.
> The database schema is already created (run `ALL_MIGRATIONS_COMBINED.sql` in Supabase first).
> Read `spec.md` and `tasks.md` alongside this plan — they are the source of truth.

---

## Pre-requisites (Human Must Do First)

1. **Run the SQL**: Go to Supabase SQL Editor → paste `supabase/ALL_MIGRATIONS_COMBINED.sql` → Run
2. **Create a new Supabase project** (or use existing) and note:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. **Set Edge Function secrets** in Supabase Dashboard → Edge Functions → Secrets:
   ```
   PLATFORM_OPENROUTER_KEY=sk-or-v1-...
   BYOK_MASTER_KEY=<base64 32 bytes>
   FX_EGP_PER_USD=50
   FX_BUFFER=1.15
   FREE_TIER_CREDITS=100
   FREE_MAX_RECORDING_SEC=180
   ```

---

## Phase 0: Project Scaffold (Epic 1 — MS-010, MS-011, MS-021)

### Step 0.1: Create Expo App
```bash
cd /var/www/html/old/mindspace
npx -y create-expo-app@latest . --template expo-template-blank-typescript
```

### Step 0.2: Install Dependencies
```bash
npx expo install expo-router react-native-safe-area-context react-native-screens \
  react-native-gesture-handler react-native-reanimated expo-audio expo-file-system \
  expo-secure-store expo-haptics expo-image expo-notifications \
  @shopify/react-native-skia @react-native-async-storage/async-storage \
  expo-in-app-purchases

npm i @supabase/supabase-js react-native-url-polyfill base64-arraybuffer \
  @tanstack/react-query @tanstack/react-query-persist-client \
  @tanstack/query-async-storage-persister zustand nativewind @gorhom/bottom-sheet zod

npm i -D supabase tailwindcss jest-expo @testing-library/react-native
```

### Step 0.3: Project Structure
Create this folder structure:
```
src/
  app/                          # Expo Router
    _layout.tsx
    index.tsx                   # Home screen
    space/[id]/
      index.tsx                 # Canvas screen
      note/[noteId].tsx         # Note detail
      ai-review.tsx             # AI review sheet
      timeline.tsx              # Timeline
    credits/
      index.tsx                 # Balance + history
      buy.tsx                   # Purchase packages
    settings/
      models.tsx                # Model picker (Phase B)
      keys.tsx                  # BYOK (Phase C)
    onboarding.tsx
  features/
    spaces/
      components/
      hooks/
      api/
      types/
    canvas/
      components/
        CanvasRoot.tsx
        ConnectionsLayer.tsx
      gestures/
        useCanvasGestures.ts
      hooks/
        useVisibleNotes.ts
        useNoteEntrance.ts
        useConnectMode.ts
      store/
        canvasStore.ts
      utils/
        coords.ts
    sticky-notes/
      components/
        StickyNoteItem.tsx
        AddNoteMenu.tsx
        NoteContextMenu.tsx
        ColorPicker.tsx
      hooks/
        useNotes.ts
        useNote.ts
        useNoteDrag.ts
      api/
        notes.api.ts
    voice/
      components/
        RecordScreen.tsx
        Waveform.tsx
        MicButton.tsx
        TranscriptSheet.tsx
        AudioPlayerRow.tsx
        TranscriptView.tsx
      services/
        recorder.ts
        upload.ts
      hooks/
        useRecordingStatus.ts
        useThinkingFlow.ts
      store/
        recordingStore.ts
    ai/
      components/
        AiReviewSheet.tsx
        InterpretationDiff.tsx
      hooks/
        useUndo.ts
      utils/
        estimateCost.ts
    credits/
      components/
        CreditChip.tsx
        OutOfCreditsSheet.tsx
        LedgerRow.tsx
      hooks/
        useCredits.ts
      api/
        credits.api.ts
    timeline/
      components/
      hooks/
    auth/
      components/
        LinkEmailSheet.tsx
  shared/
    components/
      Toast.tsx
      EmptyState.tsx
    hooks/
    utils/
    constants/
      tokens.ts
      errors.ts
    types/
  lib/
    supabase/
      client.ts
      database.types.ts
      storage.ts
    query-client/
      index.ts
      keys.ts
  providers/
    AuthProvider.tsx
    QueryProvider.tsx
```

### Step 0.4: Configure TypeScript Strict Mode
In `tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Step 0.5: Environment Variables
Create `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Phase 1: Core Client Infrastructure (Epic 1 — MS-019, MS-020, MS-021)

### Step 1.1: Supabase Client
**File**: `src/lib/supabase/client.ts`
```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

### Step 1.2: Generate Types
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/database.types.ts
```
Add to `package.json` scripts: `"types": "supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/database.types.ts"`

### Step 1.3: Auth Provider
**File**: `src/providers/AuthProvider.tsx`
- On mount: check for existing session
- If no session: `signInAnonymously()`
- Handle `AppState` changes for token refresh
- Export `useAuth()` hook with `{ user, session, isLoading }`

### Step 1.4: Query Client + Persistence
**File**: `src/lib/query-client/index.ts`
- `networkMode: 'offlineFirst'`
- `gcTime: 7 * 24 * 60 * 60 * 1000` (7 days)
- AsyncStorage persister from `@tanstack/query-async-storage-persister`

**File**: `src/lib/query-client/keys.ts`
- Centralized query key factory:
```typescript
export const queryKeys = {
  spaces: {
    all: ['spaces'] as const,
    detail: (id: string) => ['spaces', id] as const,
  },
  notes: {
    bySpace: (spaceId: string) => ['notes', spaceId] as const,
    detail: (id: string) => ['notes', 'detail', id] as const,
  },
  credits: {
    balance: ['credits', 'balance'] as const,
    ledger: ['credits', 'ledger'] as const,
  },
  recordings: {
    bySpace: (spaceId: string) => ['recordings', spaceId] as const,
  },
  models: {
    all: ['models'] as const,
  },
};
```

### Step 1.5: Design Tokens — Realistic Skeuomorphic Direction
**File**: `src/shared/constants/tokens.ts`

The entire app follows a **realistic, tactile, skeuomorphic** aesthetic.
The canvas is a cork board. Notes are physical paper. Connections are yarn/string.
This is a creative studio wall, not a flat digital interface.

```typescript
// === CANVAS ===
export const canvas = {
  // Dark warm cork board background
  bgColor: '#2C1E14',           // deep walnut brown
  bgTexture: 'cork-dark',       // tiled texture asset
  bgGrain: 0.15,                // subtle noise overlay opacity
  // Cork board particle specs (tiny dots scattered on the board)
  particles: {
    color: '#8B6914',
    density: 40,                // per 1000×1000px area
    sizeRange: [1, 3],
  },
};

// === STICKY NOTE PAPER COLORS ===
// These are the DEFAULT colors per note type.
// Users can override with any color from the color picker.
export const noteColors = {
  idea:       { bg: '#FFF9C4', border: '#F0E68C', text: '#5D4037', shadow: '#D4C36A' },
  task:       { bg: '#C8E6C9', border: '#A5D6A7', text: '#1B5E20', shadow: '#7CB342' },
  question:   { bg: '#BBDEFB', border: '#90CAF9', text: '#0D47A1', shadow: '#64B5F6' },
  decision:   { bg: '#F8BBD0', border: '#F48FB1', text: '#880E4F', shadow: '#EC407A' },
  reference:  { bg: '#D1C4E9', border: '#B39DDB', text: '#4A148C', shadow: '#9575CD' },
  thought:    { bg: '#FFE0B2', border: '#FFCC80', text: '#E65100', shadow: '#FFA726' },
  summary:    { bg: '#B2EBF2', border: '#80DEEA', text: '#006064', shadow: '#26C6DA' },
};

// === PUSH PIN (مسمار) ===
export const pushPin = {
  size: 18,                     // diameter in dp
  headColor: '#8B7355',         // metallic brass
  headHighlight: '#C4A35A',     // specular highlight
  shadowColor: 'rgba(0,0,0,0.4)',
  shadowOffset: { x: 1, y: 2 },
  // When dragging, pin "lifts" with a spring animation
  liftScale: 1.3,
  liftShadowBlur: 12,
};

// === PAPER EFFECTS ===
export const paper = {
  cornerCurl: true,             // bottom-right corner slightly curled
  curlSize: 14,                 // px
  // Random tilt per note (-3° to +3°)
  tiltRange: [-3, 3],
  // Realistic layered shadow
  shadow: {
    color: 'rgba(0,0,0,0.35)',
    offset: { x: 2, y: 4 },
    blur: 8,
    spread: 0,
  },
  // Lifted shadow (while dragging)
  liftedShadow: {
    color: 'rgba(0,0,0,0.5)',
    offset: { x: 4, y: 8 },
    blur: 20,
    spread: 2,
  },
};

// === CONNECTIONS (yarn/string) ===
export const connections = {
  // Realistic yarn/thread look, not digital lines
  strokeWidth: 2.5,
  color: {
    supports: '#C62828',        // red yarn
    related: '#5D4037',         // brown twine
    contradicts: '#E53935',     // bright red
    depends_on: '#37474F',      // dark thread
    derived_from: '#795548',    // leather cord
    child_of: '#8D6E63',       // light brown
  },
  // Slight curve/sag to mimic real string pinned between two points
  sagFactor: 0.15,              // catenary sag as ratio of distance
  opacity: 0.85,
};

// === COLOR PICKER ===
export const colorPicker = {
  presets: [
    '#FFF9C4', '#C8E6C9', '#BBDEFB', '#F8BBD0',
    '#D1C4E9', '#FFE0B2', '#B2EBF2', '#FFCDD2',
    '#F0F4C3', '#B3E5FC', '#FCE4EC', '#E1BEE7',
    '#DCEDC8', '#FFE0B2', '#CFD8DC', '#FFF3E0',
  ],
  wheelSize: 200,               // color wheel diameter
  showHexInput: true,
};

// === TYPOGRAPHY ===
export const typography = {
  // Handwriting-style font for note content
  noteFont: 'Caveat',           // Google Font — feels handwritten
  noteFontWeight: '500',
  noteFontSize: 16,
  // Title font slightly bolder
  titleFont: 'Caveat',
  titleFontWeight: '700',
  titleFontSize: 18,
  // UI chrome uses clean sans-serif
  uiFont: 'Inter',
  uiFontWeight: '400',
  uiFontSize: 14,
};

// === MOTION ===
export const motion = {
  pinDrop: { type: 'spring', damping: 12, stiffness: 180 },
  noteEntrance: { type: 'spring', damping: 15, stiffness: 200 },
  noteLift: { type: 'spring', damping: 20, stiffness: 300 },
  canvasSnap: { type: 'spring', damping: 25, stiffness: 120 },
};
```

### Step 1.6: Error Constants
**File**: `src/shared/constants/errors.ts`
```typescript
export const ErrorCodes = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  NEEDS_OWN_KEY: 'NEEDS_OWN_KEY',
  AI_SCHEMA_FAILED: 'AI_SCHEMA_FAILED',
  TRANSCRIBE_FAILED: 'TRANSCRIBE_FAILED',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
} as const;

export const errorMessages: Record<string, string> = {
  INSUFFICIENT_CREDITS: 'Not enough credits. Add more to continue.',
  NEEDS_OWN_KEY: 'This model requires your own API key.',
  AI_SCHEMA_FAILED: 'AI returned an unexpected format. Try again.',
  TRANSCRIBE_FAILED: 'Transcription failed. Your recording is safe.',
  PROVIDER_AUTH_FAILED: 'API key is no longer valid.',
};
```

---

## Phase 2: Credits Feature (Epic 2 — MS-033 to MS-036)

### Step 2.1: Credits API + Hooks
**File**: `src/features/credits/api/credits.api.ts`
- `fetchBalance()` → query profiles for credits_balance, credits_reserved
- `fetchLedger()` → query credit_ledger ordered by created_at desc

**File**: `src/features/credits/hooks/useCredits.ts`
- `useBalance()` — TanStack Query wrapping fetchBalance
- `useLedger()` — paginated TanStack Query
- `formatCredits(credits: number)` → `"340 credits · 34 EGP"`
- `estimateMinutes(credits: number)` → `Math.floor(credits / 8)` (at default rates)

### Step 2.2: Credit Chip Component
**File**: `src/features/credits/components/CreditChip.tsx`
- Shows `"340 · 34 EGP"`
- Color states: normal (default), amber (< 50 credits), red (0 credits)
- Taps navigate to `/credits`
- Renders in Home header and Canvas header

### Step 2.3: Credits Screen
**File**: `src/app/credits/index.tsx`
- Balance card with minutes estimate
- Package grid (visual only until payments in Phase 7)
- FlashList of ledger rows showing date, reason, delta, balance_after

### Step 2.4: Out of Credits Sheet
**File**: `src/features/credits/components/OutOfCreditsSheet.tsx`
- Bottom sheet explaining what's needed
- Shows exact credit cost of the blocked action
- CTA to buy credits

---

## Phase 3: Voice Capture & Transcription (Epic 3 — MS-041 to MS-048)

### Step 3.1: Recording Service
**File**: `src/features/voice/services/recorder.ts`
- Uses `expo-audio` for recording
- Format: m4a/AAC 44.1kHz mono 64kbps
- Permission flow with recovery message on denial
- Metering at 60ms intervals into a Reanimated `useSharedValue` (zero React re-renders)
- Writes recordings DB row immediately on stop (durable checkpoint)

**File**: `src/features/voice/store/recordingStore.ts` (Zustand)
- `isRecording`, `currentRecordingId`, `elapsedMs`, `meterLevel`

### Step 3.2: Recording Screen
**File**: `src/features/voice/components/RecordScreen.tsx`
- Full-screen near-black background
- Elapsed time counter
- Live waveform component (`Waveform.tsx`) driven by metering shared values at 60fps
- Stop button (`MicButton.tsx` with idle/recording/processing states)
- Hard-stop at 180s for free tier with clear message
- NO live transcript

### Step 3.3: Audio Upload Service
**File**: `src/features/voice/services/upload.ts`
- Uses `base64-arraybuffer` (NOT FormData — FormData uploads 0 bytes in RN)
- Path: `{userId}/{spaceId}/{recordingId}.m4a`
- Retry 3× with exponential backoff
- Signed resumable upload for files > 5MB
- Queue mechanism for offline → upload on reconnect

### Step 3.4: Edge Function — Transcribe
**File**: `supabase/functions/transcribe/index.ts`

Create the Edge Function with these shared modules first:

**File**: `supabase/functions/_shared/auth.ts`
```typescript
export async function getUserOrThrow(req: Request) {
  const authHeader = req.headers.get('Authorization')!;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  return user;
}
```

**File**: `supabase/functions/_shared/credits.ts`
- Wrapper functions calling the DB RPCs: `reserveCredits()`, `settleCredits()`, `releaseCredits()`

**File**: `supabase/functions/_shared/models.ts`
- `resolveModel(kind, userId)` → query ai_models, prefer user preference, fallback to is_default

**File**: `supabase/functions/_shared/providers/openaiCompatible.ts`
- Factory: `createOpenAICompatibleProvider(baseUrl)` → returns `ChatProvider` & `TranscribeProvider`
- Normalizes response into `ChatResult` / `TranscribeResult`

**File**: `supabase/functions/_shared/providers/openrouter.ts`
- 5-line instance of openaiCompatible with `https://openrouter.ai/api/v1`

The transcribe function itself follows the exact sequence from spec §11:
1. `getUserOrThrow(req)`
2. Resolve model from `ai_models`
3. Resolve API key (user key → platform key → reject)
4. If platform key: `reserveCredits(ceil(6 × minutes × multiplier))`
5. Update recording status to `transcribing`
6. Create signed URL for the audio file
7. Call provider's transcribe method
8. Insert transcript row
9. Update recording status to `transcribed`
10. `settleCredits()` on success, `releaseCredits()` on failure
11. Free plan: delete Storage object after success

### Step 3.5: Realtime Status Subscription
**File**: `src/features/voice/hooks/useRecordingStatus.ts`
- Subscribe to `postgres_changes` on the recordings row
- UI transitions: `recorded → transcribing → transcribed` without polling
- Clean up channel on unmount

### Step 3.6: Transcript Review Screen
**File**: `src/features/voice/components/TranscriptSheet.tsx`
- Bottom sheet showing transcript text
- Editable before extraction
- "Continue" CTA showing credit cost of extraction

---

## Phase 4: Canvas & Sticky Notes — REALISTIC CORK BOARD (Epic 4 — MS-050 to MS-061)

> **Design Direction**: The canvas is a real cork board. Notes are physical paper
> pinned with push pins (مسمار). Connections are yarn/string. Dragging a note
> "unpins" it (pin lifts, shadow deepens), then "re-pins" where you drop it.
> Users can change any note's color via a color picker wheel.
> This should feel like a creative studio wall — warm, tactile, alive.

### Step 4.1: Canvas Coordinate System
**File**: `src/features/canvas/utils/coords.ts`
```typescript
export function worldToScreen(wx: number, wy: number, offset: {x: number, y: number}, scale: number) {
  return { x: (wx + offset.x) * scale, y: (wy + offset.y) * scale };
}
export function screenToWorld(sx: number, sy: number, offset: {x: number, y: number}, scale: number) {
  return { x: sx / scale - offset.x, y: sy / scale - offset.y };
}
```

### Step 4.2: Canvas Root — Cork Board
**File**: `src/features/canvas/components/CanvasRoot.tsx`
- Single `Animated.View` carrying the transform
- Scale clamped 0.25–3.0
- **Background**: dark warm cork board texture (`#2C1E14` base color)
  - Tiled cork texture image as background (ship as an asset)
  - Subtle noise overlay at 15% opacity for grain
  - Tiny scattered particles (cork crumbs) as decorative Skia dots
- **Ambient feel**: very slight vignette darkening at edges
- Header bar is semi-transparent with blur, showing space name + credits chip

### Step 4.3: Pan + Pinch Gestures
**File**: `src/features/canvas/gestures/useCanvasGestures.ts`
- `Gesture.Simultaneous(pan, pinch)`
- Focal-point zoom (zoom keeps pinch focal point stationary)
- **Worklets only** — no React state during gesture
- Target: 60fps on mid-range Android
- Canvas pan has slight momentum/deceleration for organic feel

### Step 4.4: Canvas Store (Zustand)
**File**: `src/features/canvas/store/canvasStore.ts`
- `scale`, `offset` (synced on gesture end only)
- `selectedNoteIds`, `draggingNoteId`, `connectingFrom`
- `colorPickerNoteId` — which note has the color picker open
- All consumers must use `useShallow` selectors

### Step 4.5: Notes Data Layer
**File**: `src/features/sticky-notes/api/notes.api.ts`
- `fetchNotes(spaceId)` — explicitly select columns, NEVER `select('*')`, exclude embedding columns

**File**: `src/features/sticky-notes/hooks/useNotes.ts`
- `useNotes(spaceId)` — single query for all notes in space

**File**: `src/features/sticky-notes/hooks/useNote.ts`
- `useNote(id)` — narrows via TanStack Query `select` with `structuralSharing`
- Returns referentially stable object

### Step 4.6: StickyNoteItem Component — Physical Paper Note
**File**: `src/features/sticky-notes/components/StickyNoteItem.tsx`
- `React.memo`, receives **ONLY an id prop**
- Subscribes to its own row via narrowed `select`
- **CRITICAL**: Dragging note A must produce 0 renders of note B (profiler-verified)

**Visual specs for each note:**
- **Paper body**: Rounded rectangle with the note's color as background
- **Random tilt**: Each note gets a deterministic random rotation (-3° to +3°) seeded from its ID
- **Corner curl**: Bottom-right corner has a subtle CSS/Skia curl shadow effect
- **Push pin (مسمار)**: Rendered at top-center of the note
  - Small metallic circle (brass color `#8B7355`) with a specular highlight
  - Casts its own tiny shadow on the note paper
  - This is the "anchor" — the note hangs from this pin
- **Paper shadow**: Realistic multi-layer shadow on the cork board
  - Normal state: `offset(2,4) blur(8)` — paper flat against board
  - Dragging state: `offset(4,8) blur(20)` — paper lifted off the board
- **Text**: Uses `Caveat` font (handwriting style) for content, clean `Inter` for type badge
- **Type badge**: Small pill in bottom-left showing the note type (idea/task/question etc.)
- **LOD**: Below 0.5 scale, hide body text + shadow + curl (just colored rectangle + pin)

**Drag interaction (pin/unpin):**
1. User starts dragging → pin "lifts" with spring animation (scale 1.0 → 1.3)
2. Paper shadow deepens (flat → lifted)
3. Note slightly straightens (rotation → 0°)
4. Haptic feedback on grab
5. While dragging: note follows finger, slightly larger, deeper shadow
6. On drop: pin "pushes back in" with spring (scale 1.3 → 1.0)
7. Paper shadow returns to flat
8. Note gets a new random tilt at the new position
9. Haptic feedback on pin-down

### Step 4.7: Drag Persistence with Batching
**File**: `src/features/sticky-notes/hooks/useNoteDrag.ts`
- Calls `bulk_move_notes` RPC
- Debounce 250ms after gesture end
- Coalesce multiple moves into one call
- Optimistic update with rollback on error

### Step 4.8: Color Picker
**File**: `src/features/sticky-notes/components/ColorPicker.tsx`
- Appears as a floating popup below/beside the note when triggered
- **Color wheel** (HSL wheel, 200dp diameter) for full custom color
- **Preset grid**: 16 curated pastel colors in a 4×4 grid above the wheel
- **Hex input**: Optional text input for exact color codes
- Changing color:
  - Updates `sticky_notes.color` in DB (optimistic)
  - Overrides the default type-based color
  - Smooth color transition animation on the paper (300ms ease)
- Dismiss by tapping outside or swiping down

**How to open the color picker:**
- From the note context menu (long-press) → "Change Color" option
- Or: double-tap the push pin on any note

### Step 4.9: Manual Note Creation
**File**: `src/features/sticky-notes/components/AddNoteMenu.tsx`
- Long-press canvas background → radial menu appears at tap point
- Type picker: idea/task/question/decision/text (each shows its default color)
- New note appears at the exact world coordinate with a "pin drop" animation:
  - Note drops in from slightly above with a spring
  - Pin "pushes in" effect
  - Subtle paper rustle haptic
- Double-tap note for inline edit
- Costs 0 credits

### Step 4.10: Note Context Menu
**File**: `src/features/sticky-notes/components/NoteContextMenu.tsx`
- Long-press note → context menu slides up from the note:
  - 🎨 **Change Color** → opens ColorPicker
  - 🏷️ **Change Type** → type selector (idea/task/question/decision/reference/thought/summary)
  - 📋 **Duplicate** → creates copy offset by (20, 20) with pin-drop animation
  - 🗑️ **Remove** → note "unpins" and falls off the board (fall + fade animation), then soft-delete
- Haptic feedback on open
- Semi-transparent blurred backdrop behind menu

### Step 4.11: Connections Layer — Yarn/String (Skia)
**File**: `src/features/canvas/components/ConnectionsLayer.tsx`
- ONE `@shopify/react-native-skia` canvas drawing ALL connections
- **Looks like real yarn/string pinned between two push pins:**
  - Slight catenary sag (15% of distance) — string hangs naturally
  - Textured stroke (not a clean bezier — add slight roughness via noise)
  - Different colored yarn per relationship type:
    - `supports` → red yarn
    - `related` → brown twine
    - `contradicts` → bright red thread
    - `depends_on` → dark thread with arrow
    - `child_of` → light brown cord
  - Small pin-dot where the string meets each note's push pin
- Curves update live while a connected note is dragged
- String physics: when dragging a connected note, the yarn stretches taut then sags again on drop
- Zero React views per connection

### Step 4.12: Viewport Culling + Zoom to Fit
**File**: `src/features/canvas/hooks/useVisibleNotes.ts`
- Cull outside viewport × 1.5 when count > 150
- Recompute on gesture end, not per frame
- Two-finger double-tap → fit all notes
- Below 150 notes, culling bypassed

### Step 4.13: Home Screen + Spaces CRUD
**File**: `src/app/index.tsx`
- **Design**: Dark warm theme matching the cork board aesthetic
- Greeting (time-based, Arabic-aware: صباح الخير / مساء الخير based on locale)
- **Large mic button** — glowing warm amber, centered, reachable in one tap
- **Space list**: Each space is a card showing:
  - Space emoji + name
  - Note count and last activity time
  - Tiny preview of the cork board with miniature note colors
- Credit chip in header showing balance
- Create space → opens a sheet to name it + pick an emoji
- Creating a space navigates into its empty canvas
- **Empty canvas**: Shows the cork board with a centered message:
  - Push pin holding a card that says "Tap the mic to start thinking"
  - The card itself looks like a note, establishing the metaphor immediately

### Step 4.14: Assets Required
**File**: `src/assets/textures/`
- `cork-dark.png` — tileable cork board texture (512×512, dark warm brown)
- `cork-light.png` — alternative lighter cork for potential themes
- `paper-grain.png` — subtle paper texture overlay for notes (optional)
- `pin-shadow.png` — pre-rendered push pin shadow for performance

Use `generate_image` tool or source royalty-free textures. The cork texture is
the single most important visual asset — it sets the entire mood of the app.

---

## Phase 5: AI Extraction — THE CORE (Epic 5 — MS-070 to MS-078)

### Step 5.1: Context Builder
**File**: `supabase/functions/_shared/context.ts`
- Select up to 15 most relevant existing notes (recency + type weight + keyword overlap)
- Hard cap 2000 tokens
- Empty space → `"(this space is empty)"`
- Include note IDs so the model can reference them

### Step 5.2: Layout Engine
**File**: `supabase/functions/_shared/layout.ts`
- Build parent/child forest from AI output
- Radial root placement → children on arcs
- Force relaxation (120 iterations, 40ms cap)
- Translate near viewport center
- Must be deterministic: same input = identical output
- Must complete in < 50ms for 15 notes

### Step 5.3: Zod Schemas + JSON Repair
**File**: `supabase/functions/_shared/schemas.ts`
```typescript
import { z } from 'zod';

export const ExtractedNote = z.object({
  tempId: z.string(),
  type: z.enum(['idea','task','question','decision','reference','thought','summary']),
  title: z.string().min(1).max(80),
  content: z.string().min(1).max(400),
  parentTempId: z.string().optional(),
  spanStart: z.number().int().nonnegative().optional(),
  spanEnd: z.number().int().nonnegative().optional(),
  matchesExistingNoteId: z.string().uuid().optional(),
});

export const ExtractThoughtsSchema = z.object({
  summary: z.string().max(200),
  notes: z.array(ExtractedNote).min(1).max(8),
  relationships: z.array(z.object({
    fromTempId: z.string(),
    toTempId: z.string(),
    type: z.enum(['related','depends_on','supports','contradicts','derived_from','child_of']),
  })).max(16),
}).refine(
  d => d.notes.some(n => n.parentTempId),
  { message: 'output must contain at least one parent/child relationship' }
);
```

**File**: `supabase/functions/_shared/jsonRepair.ts`
- Strip markdown fences from AI output
- One repair pass feeding validation errors back to the model

### Step 5.4: Extract Thoughts Prompt
**File**: `supabase/functions/_shared/prompts/extract-thoughts.ts`
- System prompt with 8 hard constraint rules (see spec §12)
- `buildUser()` function composing context + transcript
- Version: `'1.0.0'`

### Step 5.5: Edge Function — ai-extract
**File**: `supabase/functions/ai-extract/index.ts`
Full sequence:
1. Auth → model → key → reserve credits
2. Build space context (≤2000 tokens)
3. Call chat provider with extract-thoughts prompt (temperature 0.3, maxTokens 1500, jsonMode true)
4. Validate with Zod — one repair attempt, then fail
5. Run layout engine to compute positions
6. Persist as `ai_actions(status='proposed')` + `ai_action_items` with forward_patch AND inverse_patch
7. Settle credits with actual amount

### Step 5.6: AI Review Sheet
**File**: `src/features/ai/components/AiReviewSheet.tsx`
- Per-item checkboxes with hierarchy indentation
- Inline title edit
- Credit cost shown at top
- Accept → calls `apply_ai_action` RPC with selected item IDs
- Reject → sets status='rejected', applies nothing
- Unchecking parent warns about orphaning children

### Step 5.7: Staggered Entry Animation
**File**: `src/features/canvas/hooks/useNoteEntrance.ts`
- New notes fade+scale in with 40ms stagger
- Capped at 400ms total
- Spring animation (not linear)
- Must run at 60fps

### Step 5.8: Undo Toast
**File**: `src/shared/components/Toast.tsx` + `src/features/ai/hooks/useUndo.ts`
- Shows `"AI added 5 notes [Undo]"` for 8 seconds
- Undo calls `undo_ai_action` RPC
- Also permanently accessible from Timeline

### Step 5.9: Full-Loop Wiring
**File**: `src/features/voice/hooks/useThinkingFlow.ts`
This is a state machine chaining the entire flow:
```
record → upload → transcribe → review transcript → extract → review proposal → apply → animate
```
- Single error surface
- Resumable if app is killed mid-flow
- Every failure path charges 0 credits

---

## Phase 6: Provenance (Epic 6 — MS-080 to MS-084)

### Step 6.1: Note Detail Screen
**File**: `src/app/space/[id]/note/[noteId].tsx`
- Bottom sheet on phone
- Title + content editable (optimistic saves)
- Type/color pickers
- Delete button
- Created/updated timestamps
- Editing AI content does NOT alter transcript or recording

### Step 6.2: Audio Player Component
**File**: `src/features/voice/components/AudioPlayerRow.tsx`
- Play/pause, scrub bar, duration, static waveform
- Prefers LOCAL file; falls back to signed Storage URL
- Two taps from any voice-sourced note to hearing audio

### Step 6.3: Transcript Span Highlight
**File**: `src/features/voice/components/TranscriptView.tsx`
- Renders full transcript with `span_start..span_end` highlighted
- Tapping highlight seeks player to that point
- Notes with no span show full transcript without crash

### Step 6.4: "What AI Changed" Diff
**File**: `src/features/ai/components/InterpretationDiff.tsx`
- Collapsed by default
- Shows original span vs AI interpretation
- Only visible on notes with `source_type='ai'`

### Step 6.5: Timeline Screen
**File**: `src/app/space/[id]/timeline.tsx`
- FlashList over timeline_events grouped by day
- Filter chips
- Rows deep-link to their subject
- Position-only drags produce no timeline rows
- AI action rows have undo option

---

## Phase 7: Payments (Epic 8 — MS-100 to MS-103)

### Step 7.1: Edge Function — verify-purchase
**File**: `supabase/functions/verify-purchase/index.ts`
- Apple App Store Server API verification
- Google Play Developer API verification
- Paymob HMAC callback verification
- Insert into `payments` (unique channel+external_ref → replay-safe)
- On first successful insert: `grant_credits(user, package.total_credits, 'purchase', ...)`
- **NEVER trust client-reported purchase**

### Step 7.2: Purchase Flow UI
**File**: `src/app/credits/buy.tsx`
- Uses `expo-in-app-purchases`
- Package grid with bonus badges, "Regular" featured
- Pending/success/failure states
- Balance updates within 5s of purchase

### Step 7.3: Paymob Web Checkout
**File**: `supabase/functions/paymob-checkout/index.ts` or static page
- Simple page: sign in, pick package, Paymob iframe
- HMAC callback verification
- **iOS app must NOT link to this page**

---

## Phase 8: Model Picker (Epic 9 — MS-110 to MS-113)

### Step 8.1: Models Sync Edge Function
**File**: `supabase/functions/models-sync/index.ts`
- Nightly `GET https://openrouter.ai/api/v1/models`
- Update prices → recompute multipliers
- Alert if any multiplier moved >25%
- Scheduled at 03:00 via pg_cron

### Step 8.2: Model Picker Screen
**File**: `src/app/settings/models.tsx`
- Separate chat and transcribe sections
- Credit cost per model shown inline
- Persists to `profiles.chat_model_id` / `transcribe_model_id`
- Free-tier users see paid models locked
- `byok_only` models show "Needs your own key"

### Step 8.3: Per-Model Cost Preview
**File**: `src/features/ai/utils/estimateCost.ts`
- Show "This will cost N credits" before every AI action
- Computed from selected model's multiplier

---

## Phase 9: BYOK (Epic 10 — MS-120 to MS-124)

### Step 9.1: Crypto Module
**File**: `supabase/functions/_shared/crypto.ts`
- AES-256-GCM seal/open with `BYOK_MASTER_KEY`
- Layout: `iv(12) || ciphertext+tag`
- Round-trip tested, tamper detection tested

### Step 9.2: BYOK Save Edge Function
**File**: `supabase/functions/byok-save/index.ts`
- Validate key with 1-token test call
- Encrypt → store with `key_hint` (last 4)
- Revoke SELECT on encrypted_key

### Step 9.3: Key Resolution + 0-Credit Routing
**File**: `supabase/functions/_shared/keys.ts`
- Resolution order: user key → platform key (OpenRouter only) → reject
- BYOK path: skip reserve/settle, set `billed_to='byok'`
- Provider 401 → set `is_active=false`, notify user

### Step 9.4: Google + Anthropic Adapters
**File**: `supabase/functions/_shared/providers/google.ts`
**File**: `supabase/functions/_shared/providers/anthropic.ts`
- Real request/response mapping (NOT OpenAI-compatible)
- Normalize to `ChatResult` including token usage

### Step 9.5: Keys Management Screen
**File**: `src/app/settings/keys.tsx`
- List providers with hints, add/remove
- "Calls with your own key cost 0 credits" copy
- Only last-4 hint ever displayed

---

## Phase 10: Polish & Launch (Epic 11 — MS-130 to MS-135)

### Step 10.1: Onboarding
**File**: `src/app/onboarding.tsx`
- Max 2 screens, skippable in one tap
- Lead straight into first recording
- Target: install → recording < 15 seconds

### Step 10.2: Empty States
**File**: `src/shared/components/EmptyState.tsx`
- Empty canvas → invite recording
- Empty space list, empty ledger, empty timeline

### Step 10.3: Email Linking
**File**: `src/features/auth/components/LinkEmailSheet.tsx`
- Prompt after 3rd recording
- `updateUser({ email })` + OTP
- Same user ID retained, zero data migration

---

## Non-Negotiable Rules for Implementation

1. **No `any` types.** No `console.log` in committed code.
2. **No API key in app bundle.** Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. **No `select('*')` on sticky_notes** — always explicit columns, exclude embeddings.
4. **StickyNoteItem receives ONLY an id prop.** Dragging note A = 0 renders of note B.
5. **All query keys from the factory.** None inline.
6. **Credits move ONLY through reserve → settle/release RPCs.** Never direct UPDATE.
7. **Failed AI calls charge 0 credits.** Always `releaseCredits()` in catch blocks.
8. **Max 6 notes per 60s of speech.** Enforced in both prompt and Zod schema (max 8 cap).
9. **Never lose the original recording.** Local file first, always.
10. **No clinical language.** No therapy/treatment/mental health terms anywhere.

---

## Verification Checklist (Run Before Each Milestone)

```bash
# Type check
npx tsc --noEmit

# Lint
npx eslint .

# Tests
npm test

# No secrets in bundle
npx expo export | grep -E 'sk-|AIza|sk-ant'  # must return nothing

# RLS check (run in Supabase SQL editor)
select tablename from pg_tables
 where schemaname = 'public'
   and tablename not in (
     select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relrowsecurity
   );
-- must return zero rows
```

---

## Database Schema Diagram

```mermaid
erDiagram
    auth_users ||--|| profiles : creates
    profiles ||--o| ai_models : chat_model
    profiles ||--o| ai_models : transcribe_model
    auth_users ||--o{ spaces : owns
    auth_users ||--o{ user_ai_keys : owns
    auth_users ||--o{ credit_ledger : owns
    auth_users ||--o{ credit_reservations : owns
    auth_users ||--o{ payments : owns
    spaces ||--o{ recordings : contains
    spaces ||--o{ sticky_notes : contains
    spaces ||--o{ relationships : contains
    spaces ||--o{ ai_actions : contains
    spaces ||--o{ timeline_events : contains
    recordings ||--o{ transcripts : produces
    sticky_notes ||--o| sticky_notes : parent
    sticky_notes ||--o{ relationships : from
    sticky_notes ||--o{ relationships : to
    ai_actions ||--o{ ai_action_items : contains
    payments }o--|| credit_packages : references
```

---

## Execution Order Summary

| # | What | Files | Depends On |
|---|------|-------|------------|
| 0 | Scaffold + deps | package.json, tsconfig, folder structure | — |
| 1 | Supabase client + auth + query + tokens | src/lib/*, src/providers/* | 0 |
| 2 | Credits hooks + UI | src/features/credits/* | 1 |
| 3 | Voice recording + upload + transcribe fn | src/features/voice/*, supabase/functions/transcribe | 1, 2 |
| 4 | Canvas + sticky notes + connections | src/features/canvas/*, src/features/sticky-notes/* | 1 |
| 5 | AI extraction + review + undo + full loop | supabase/functions/ai-extract, src/features/ai/* | 3, 4 |
| 6 | Provenance (note detail, audio, timeline) | src/app/space/[id]/note/*, timeline | 4, 3 |
| 7 | Payments (IAP + Paymob) | supabase/functions/verify-purchase, buy.tsx | 2 |
| 8 | Model picker + sync | settings/models.tsx, supabase/functions/models-sync | 5 |
| 9 | BYOK (crypto, adapters, keys UI) | supabase/functions/byok-save, settings/keys.tsx | 8 |
| 10 | Polish (onboarding, empty states, email) | onboarding.tsx, EmptyState.tsx | 7 |
