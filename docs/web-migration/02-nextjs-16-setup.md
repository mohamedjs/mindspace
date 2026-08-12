# 02 — Next.js 16 setup

> Everything in §2.1 was verified against the official Next.js 16 upgrade guide
> (`nextjs.org/docs/app/guides/upgrading/version-16`, docs version **16.3.0**,
> last updated 2026-08-03). **Your training data probably predates this.** Read
> the version-matched docs in `node_modules/next/dist/docs/` before writing
> Next-specific code.

## 2.1 Next.js 16 facts that will bite you

| Area | The Next.js 16 rule |
|---|---|
| **Node** | Minimum **20.9.0**. Node 18 unsupported. |
| **TypeScript** | Minimum **5.1**. This repo is on 6.0.3 — fine. |
| **React** | **19.2** (canary channel for App Router). Repo is on 19.2.3 — fine. |
| **Browsers** | Chrome/Edge/Firefox 111+, Safari 16.4+. |
| **Turbopack** | **Default** for `next dev` *and* `next build`. Drop `--turbopack` flags. A custom `webpack` config makes `next build` **fail**; opt out with `--webpack` if you truly need it. Config moved from `experimental.turbopack` to top-level `turbopack`. |
| **Async request APIs** | `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` are **async only**. The Next 15 sync compatibility shim is gone. Always `await`. |
| **`middleware` → `proxy`** | `middleware.ts` is deprecated; rename to `proxy.ts` and export `proxy()`. **`proxy` runs on the Node runtime only — edge is not supported there.** Config flags renamed (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`). |
| **`revalidateTag`** | Now requires a second argument (a `cacheLife` profile), e.g. `revalidateTag('notes', 'max')`. Single-arg form is a TypeScript error. New `updateTag()` gives read-your-writes inside Server Actions; new `refresh()` refreshes the client router from a Server Action. |
| **`cacheLife` / `cacheTag`** | Stable — drop the `unstable_` prefix. |
| **PPR** | `experimental.ppr` and `experimental_ppr` removed. Opt in via top-level `cacheComponents: true`. **Do not enable it** for this port (see §2.6). |
| **Removed** | `next lint` (use ESLint/Biome directly; `next build` no longer lints), `serverRuntimeConfig` / `publicRuntimeConfig`, AMP, `experimental.dynamicIO`, `experimental.useCache`, `unstable_rootParams`. |
| **`next/image`** | `minimumCacheTTL` default 60s → **4h**; `qualities` default now `[75]` only; `16` removed from `imageSizes`; local IPs blocked unless `dangerouslyAllowLocalIP`; max 3 redirects; `images.domains` deprecated in favour of `remotePatterns`. |
| **Parallel routes** | Every slot now needs an explicit `default.js`, or the build fails. |
| **`dev` / `build`** | Separate output dirs (`next dev` → `.next/dev`), so they can run concurrently; a lockfile prevents two `next dev` on one project. |
| **Scroll** | Next no longer overrides your `scroll-behavior` during navigation. Add `data-scroll-behavior="smooth"` on `<html>` if you want the old behaviour. |
| **ESLint** | `@next/eslint-plugin-next` defaults to flat config. |

### Agent docs setup — do this first

```bash
npx @next/codemod@canary agents-md
```

This writes an `AGENTS.md` block pointing at the bundled version-matched docs
in `node_modules/next/dist/docs/`. **This repo already has an `AGENTS.md`**
(currently containing the Expo docs pointer) — the codemod block should be
added, and the Expo line removed once the port is done, not before.

## 2.2 Repository layout decision

**Recommendation: a sibling directory in the same repo.**

```
mindspace/
├── src/            ← existing Expo app, left running until parity is reached
├── web/            ← new Next.js 16 app
├── supabase/       ← SHARED. Neither app owns it.
└── docs/web-migration/
```

Rationale: the Supabase project, migrations and edge functions are shared, and
during the port you will constantly diff web behaviour against native
behaviour. Deleting `src/` before parity removes your reference implementation.

Do **not** attempt a monorepo with a shared `packages/core` on the first pass.
Copy `core/` into `web/src/core/`, get to parity, and only then consider
extracting a shared package. A workspace refactor mid-port turns every failure
into a build-tooling question.

## 2.3 Scaffold

```bash
npx create-next-app@latest web --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*"
```

Then:

```bash
cd web && npx @next/codemod@canary agents-md
```

## 2.4 Dependencies

### Install

```bash
npm i @supabase/supabase-js @supabase/ssr @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister zustand zod lucide-react sonner date-fns clsx tailwind-merge
```

```bash
npm i -D @types/node typescript jest ts-jest @types/jest
```

### Direct replacements

| Expo / RN package | Web replacement | Notes |
|---|---|---|
| `expo-router` | Next.js App Router | File-based, but different conventions — see `04` |
| `react-native` primitives | DOM + Tailwind | `05` |
| `nativewind` | Tailwind CSS directly | Same class names, mostly |
| `react-native-reanimated` | CSS transitions + Web Animations API; **no library needed** | `06` explains why |
| `react-native-gesture-handler` | Pointer Events (`pointerdown`/`move`/`up`) + `setPointerCapture` | `06` |
| `react-native-svg` | Native `<svg>` | Nearly identical JSX |
| `lucide-react-native` | `lucide-react` | Same icon names, `size`/`strokeWidth`/`color` props identical |
| `react-native-toast-message` | `sonner` | 10 call sites |
| `@gorhom/bottom-sheet` | A `<dialog>`-based sheet, or Radix Dialog | 4 sheets; see `05` §5.6 |
| `expo-audio` | `MediaRecorder` | `07` |
| `expo-file-system` | `Blob` / `fetch` — **already the web branch** in `platform.ts` | `03` |
| `expo-notifications` | `Notification` API + service worker | `07` §7.6 |
| `expo-secure-store` | Not used for tokens; `@supabase/ssr` cookie storage | `03` |
| `@react-native-async-storage/async-storage` | `localStorage` | 4 call sites |
| `react-native-safe-area-context` | CSS `env(safe-area-inset-*)` | Only matters for installed PWA |
| `@expo-google-fonts/*` | `next/font/google` | Same two families |
| `reanimated-color-picker` | A plain swatch grid | See `05` §5.7 — the app only ever picks from a fixed palette |
| `@shopify/react-native-skia` | **Nothing** | Declared but unused in `src/`; do not port |
| `expo-haptics` | `navigator.vibrate()` where supported, else no-op | Cosmetic |

### Explicitly do not install

- Any React Native web compatibility layer (`react-native-web`, `nativewind`).
  A half-ported app that renders `<View>` through a shim is harder to finish
  than a clean rewrite, and it defeats every performance reason for going to
  the web.
- An animation library. See `06` §6.7.
- A canvas/diagram library (React Flow, Konva, tldraw). The canvas is ~400
  lines of transform maths that **already exists and is unit-tested** in
  `coords.ts`. Adopting a library means rewriting `layout.ts`, the connectors,
  the group frames and the drag-cluster semantics to fit its model.

## 2.5 `next.config.ts`

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack is the default in 16; this block is only for options.
  turbopack: {},

  images: {
    remotePatterns: [
      // Supabase Storage signed URLs, if you ever render audio artwork.
      { protocol: 'https', hostname: '<project-ref>.supabase.co' },
    ],
  },

  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
```

Do **not** set `cacheComponents`, `reactCompiler`, or a `webpack` block on the
first pass. Each one changes build semantics and will muddy your first failure.

## 2.6 Rendering strategy — decide once, here

**Every screen in MindSpace is authenticated, personal, and live. There is
nothing to statically render.**

The rule for this port:

- `app/layout.tsx` — Server Component, renders `<html>`, fonts, and the client
  provider tree.
- **Every page is a thin Server Component that renders one `'use client'`
  component.** Data fetching stays in React Query on the client, exactly as it
  is today.
- **Do not** move data fetching to Server Components on the first pass. The app
  has optimistic updates, offline-first React Query config, realtime
  subscriptions, and a 7-day persisted cache. Reproducing that through RSC +
  Server Actions is a redesign, not a port.
- **Do not** enable `cacheComponents` / PPR. There is no cacheable content.

Server-side rendering earns its keep in exactly two places, both optional
follow-ups: the sign-in page, and a server-side session check in `proxy.ts` so
signed-out users never download the app shell. Both are listed in
`10-open-questions.md`.

## 2.7 `package.json` scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  }
}
```

No `--turbopack` flag (default in 16). No `next lint` (removed in 16).

## 2.7a Jest — needed for Phase 0, not optional

Phase 0's exit gate is *"tests pass with the architecture test green"*, so the
test runner has to work before any application code exists. The RN project's
config is `{"preset": "jest-expo"}`, which is useless here.

`architecture.test.ts` walks the filesystem, so it needs `fs`, `path` and
`__dirname` — i.e. the Node environment and CommonJS transform, plus Node types.

```js
// web/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
```

```jsonc
// web/tsconfig.json — add
{
  "compilerOptions": {
    "types": ["jest", "node"]
  }
}
```

**Where the boundary walk roots.** With `--src-dir`, routes live at `src/app/`,
which is *inside* `src/` — so the existing walk over `src/**` already covers
pages and layouts with no change. That is the outcome you want: a page importing
Supabase directly must fail the test.

Every one of the eight ported suites is pure logic with no DOM, so
`testEnvironment: 'node'` is enough. Only add `jsdom` if you later write
component tests, and then set it per-file with a docblock rather than globally.

## 2.8 Environment variables

`serverRuntimeConfig` / `publicRuntimeConfig` are **removed in 16**. Use env
vars directly.

```bash
# web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

Both are public by design — RLS is the security boundary, not key secrecy.
**There is no service-role key in the client, ever.** Anything needing one
belongs in an edge function, which already has it.

Read the existing Expo values from the current app's `.env` (they use the
`EXPO_PUBLIC_` prefix) and re-prefix them.

## 2.9 Tailwind and the theme

The RN app uses NativeWind with a `global.css` defining CSS variables, plus a
JS mirror of the palette in `src/shared/theme/index.tsx` (needed because RN
props like `shadowColor` take colour values, not class names).

On the web, **the CSS variables become the single source of truth** and the JS
mirror becomes a convenience for the few places that still need a value
(SVG `fill`, inline gradients).

`app/globals.css`:

```css
@import "tailwindcss";

:root {
  --canvas:  #F5EDE3;  --board:   #EFE4D6;  --surface: #FBF6F0;
  --ink:     #2C1E14;  --muted:   #7A6552;  --accent:  <copy from palettes.light>;
  --on-accent: <…>;    --line:    <…>;      --warning: <…>;
  --grid: rgba(0,0,0,0.03);
  --scrim: <…>;        --overlay: <…>;
}

:root[data-theme="dark"] {
  --canvas:  #202124;  --board:   #17181A;  --surface: #292A2D;
  --ink:     #F8F9FA;  --muted:   #9AA0A6;  --accent:  #8AB4F8;
  --on-accent: #202124; --line:   #3C4043;  --warning: #FDE293;
  --grid: rgba(255,255,255,0.025);
  --scrim: rgba(0,0,0,0.65);
  --overlay: rgba(41,42,45,0.94);
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-board: var(--board);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-line: var(--line);
  --color-warning: var(--warning);
}
```

Copy the exact hex values from `palettes` in `src/shared/theme/index.tsx` —
both light and dark are defined there in full. `text-ink`, `bg-board`,
`bg-surface`, `text-muted` etc. then work as class names exactly as they do in
the RN app, which means large parts of `className` strings port unchanged.

**Theme switching**: the RN app stores `'light' | 'dark' | 'system'` under
`mindspace:theme`. On the web, resolve `system` via
`matchMedia('(prefers-color-scheme: dark)')` and stamp `data-theme` on
`document.documentElement`. Add an inline script in `<head>` that reads
`localStorage` before first paint, or the app will flash the wrong theme.

## 2.10 Fonts

Two families, both on Google Fonts:

| Family | Weights used | Role |
|---|---|---|
| **Architects Daughter** | 400 | The "hand-drawn" toggle |
| **Baloo Bhaijaan 2** | 400, 500, 600, 700 | Default UI face; also carries **Arabic** |

```ts
// app/fonts.ts
import { Architects_Daughter, Baloo_Bhaijaan_2 } from 'next/font/google';

export const architectsDaughter = Architects_Daughter({
  weight: '400', subsets: ['latin'], variable: '--font-hand', display: 'swap',
});

export const baloo = Baloo_Bhaijaan_2({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'arabic'],
  variable: '--font-ui',
  display: 'swap',
});
```

**Do not drop the `arabic` subset.** MindSpace transcribes and writes Arabic;
the extraction prompt explicitly preserves the speaker's language. Losing the
Arabic subset means every Arabic note renders in a fallback face.

The RN app gates first render on `useFonts()`. On the web use
`display: 'swap'` and do not block — `next/font` self-hosts and preloads, so
there is no FOUT worth blocking for.

`src/shared/theme/fonts.ts` (which has tests) maps the hand-drawn toggle to a
family name; port it and keep `fonts.test.ts` green.
