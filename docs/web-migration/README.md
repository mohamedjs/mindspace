# MindSpace → Next.js 16: migration brief

**Audience: the AI agent doing the port.** Read this file completely before
touching anything. Then read the numbered files in order.

---

## 0. What you are being asked to do

Port **MindSpace** — an Expo / React Native voice-to-sticky-notes app — to a
**Next.js 16 web application**, with **complete feature parity**, then add the
two web-only features in [`11-new-features.md`](11-new-features.md). The backend
(Supabase: Postgres, Auth, Storage, Edge Functions, Realtime) **does not
change**. You are replacing the client, not the system.

The current app is 10,337 lines of TypeScript across 108 files in `src/`, plus
2,510 lines of Deno across 25 files in `supabase/functions/`, plus 28 SQL
migrations.

---

## 1. The single most important fact

**This codebase went through a Repository-pattern refactor specifically so that
the storage and business layers do not know they are running inside React
Native.** There is an enforced architecture test (`src/core/architecture.test.ts`)
that fails the build if anything outside `src/infrastructure/` imports the
Supabase client.

The practical consequence for you:

| Layer | Files | Action |
|---|---|---|
| `src/core/**` | 5 | **Copy verbatim.** Zero changes. |
| `src/infrastructure/**` | 7 | **Copy, then patch 2 files** (see `03`). |
| `src/features/*/api/**` | 9 | **Copy verbatim.** Thin repository delegates. |
| `src/features/*/services/**` | 8 | **Copy 6 verbatim**, drop 2 (`recorder.ts`, `reminders.ts`). |
| `src/features/*/schemas/**` | 1 | **Copy verbatim.** |
| `src/features/*/hooks/**` | 10 | **Copy, add `'use client'`.** |
| `src/lib/**`, `src/shared/theme/{clay,color,fonts}.ts` | 5 | **Copy, small patches.** |
| `src/shared/utils/**`, `src/shared/constants/**` | 3 | **Copy verbatim.** |
| `src/features/*/components/**` | 31 | **Rewrite.** RN primitives → DOM. |
| `src/shared/{ui,theme}/*.tsx` | 5 | **Rewrite** (4 components + the theme provider). |
| `src/app/**` (9 routes) | 9 | **Rewrite** as App Router pages. |
| `src/providers/**` | 2 | **Rewrite** (thin — mostly `'use client'` + storage swap). |
| `supabase/**` | all | **Do not touch.** |

Roughly **60% of the TypeScript ports with no or trivial changes.** Do not
rewrite what already works. If you find yourself reimplementing
`src/features/ai/services/layout.ts` or `src/core/domain/index.ts`, stop — you
have gone wrong.

---

## 2. Non-negotiable rules

1. **Do not touch `supabase/`.** Not the migrations, not the edge functions, not
   the prompts. The web client calls the same functions with the same payloads.
   If you believe a backend change is required, write it down in
   `10-open-questions.md` and keep going — do not make it.

2. **Keep the architecture boundary.** Port `src/core/architecture.test.ts` and
   keep it passing. No page, component, or hook may import
   `@supabase/supabase-js` directly. Everything goes through
   `src/core/ports/index.ts`. This is the property that made *this* migration
   cheap; breaking it makes the next one expensive.

3. **Ports are the contract.** `src/core/ports/index.ts` defines 13 interfaces.
   The web app must satisfy exactly those. If a web implementation needs a new
   capability, add a method to the port — never bypass it.

4. **Feature parity means every item in `09-parity-checklist.md` is checked.**
   Not "the canvas mostly works". Every row.

5. **No new dependencies without justification.** The list in `02` is
   deliberate. Each one replaces something the RN app had.

6. **Preserve the comments.** This codebase explains *why* in comments — why
   `CHILD_DISTANCE` is 210, why transcription never runs on a user key, why
   payments claim the row before granting. Those comments encode decisions that
   cost real debugging. Carry them across.

---

## 3. Read these in order

| File | What it covers |
|---|---|
| [`01-architecture.md`](01-architecture.md) | The layering, the boundary test, what carries over file by file |
| [`02-nextjs-16-setup.md`](02-nextjs-16-setup.md) | Next.js 16 specifics, scaffold, config, deps, Tailwind, fonts |
| [`03-data-and-auth.md`](03-data-and-auth.md) | Supabase on the web, SSR cookies, the two adapter patches, RLS |
| [`04-routes-and-screens.md`](04-routes-and-screens.md) | Route-by-route mapping with each screen's exact behaviour |
| [`05-ui-mapping.md`](05-ui-mapping.md) | RN primitive → DOM, claymorphism in CSS, every component |
| [`06-canvas.md`](06-canvas.md) | The infinite canvas: pan, zoom, drag, connectors, groups |
| [`07-voice-and-realtime.md`](07-voice-and-realtime.md) | MediaRecorder, upload, pipeline, live status, errors |
| [`08-backend-contract.md`](08-backend-contract.md) | The Supabase surface you must call correctly — and not change |
| [`09-parity-checklist.md`](09-parity-checklist.md) | The definition of done |
| [`10-open-questions.md`](10-open-questions.md) | Decisions you must **not** make alone |
| [`11-new-features.md`](11-new-features.md) | **Two additions beyond parity**: the arrow tool, and the desktop sidebar |

---

## 4. Suggested order of work

Do it in vertical slices that are runnable at every step. Do not build all the
components first and wire them up at the end.

| Phase | Deliverable | Done when |
|---|---|---|
| **0** | Scaffold, **jest config** (`02` §2.7a), boundary test, copied `core/` and `infrastructure/` | `npm run test` passes with the architecture test green, `npm run typecheck` clean, `next build` succeeds |
| **1** | Auth: sign-in, sign-up, session, route protection | You can sign in and land on an empty page that knows your name |
| **2** | Data read path: spaces, notes, credits displayed as plain lists | The real notes from the real database render as text |
| **3** | List view + calendar tab | `04` §4.2 fully working |
| **4** | Canvas | `06` fully working |
| **5** | Voice pipeline | `07` fully working — record, transcribe, notes appear |
| **6** | Note editor, sub-notes, both microphones | `04` §4.3 |
| **7** | Settings, plans, credits, BYOK keys | `04` §§4.4–4.7 |
| **8** | Reminders, polish, parity sweep | `09` fully checked |
| **9** | **Arrow tool** — connect notes as parent/child | `11` §11.1.10 checked |
| **10** | **Desktop sidebar** | `11` §11.2.8 checked |

Phase 0 and 1 together are about 10% of the work and de-risk the other 90%.
Phase 4 is the single hardest piece — budget for it.

Phases 9 and 10 are **new features, not parity** — see `11`. Do not start them
before `09` is fully checked: both build directly on the canvas and the
navigation you will have just finished, and debugging a new feature on top of an
unfinished one is how a port stalls.

---

## 5. What "the app" actually is, in one paragraph

A signed-in user has **spaces** (boards). In a space they press a microphone
and talk. The audio uploads to Supabase Storage; an edge function transcribes
it; a second edge function reads the transcript, splits it into distinct ideas,
**rewrites each one as clean prose**, and writes them back as **sticky notes**
positioned on an infinite canvas. Notes can have **sub-notes** (recorded from
inside a parent note), are joined by **connectors**, can be gathered into
titled **group frames**, and can carry a **due date** the AI heard in speech —
which puts them on a **calendar** and fires a **reminder**. The same notes can
be read as a **list** instead of a canvas. Everything AI costs **credits**,
bought via **subscription plans**, unless the user is on the **BYOK plan** and
supplies their own OpenAI / Anthropic / Google key — in which case the writing
runs on their key but the **transcription still runs on ours**.

Every one of those nouns is a table, a port method, and a screen. They are all
enumerated in `09-parity-checklist.md`.
