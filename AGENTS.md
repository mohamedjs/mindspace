# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Porting this app to the web

If the task is the **Next.js 16 migration**, read `docs/web-migration/README.md`
first and follow the numbered files in order. It is written to be executed
without further context, and it is authoritative over anything you remember
about this codebase.

Do not change anything under `supabase/` as part of that port.

# What already exists

Before changing the canvas, billing, or the gesture layer, read
`docs/IMPLEMENTATION_REFERENCE.md`. It catalogues what is built in both apps and
the invariants that are easy to break by accident — worklet declaration order,
rendered-vs-stored note geometry, cycle guards, fail-closed entitlements, and
literal-only feature-flag env names. Each has already caused a bug once.

Commands for running either app: `COMMANDS.md`.
