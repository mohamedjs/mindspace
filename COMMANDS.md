# Running MindSpace

Two apps share one Supabase backend and one repo:

```
apps/mobile   Expo / React Native  → iPhone, Android, Expo Go
apps/web      Next.js 16           → browser
supabase      Postgres, Auth, Storage, Edge Functions — shared, not per-app
```

**Run everything from the repo root.** The scripts below forward to the right
workspace, so you never need to `cd` first, and `npm install` at the root
installs for both.

---

## Mobile (Expo)

| Command | What it does |
|---|---|
| `npm run mobile` | Start the dev server. Same Wi-Fi only |
| `npm run mobile:tunnel` | **Start with a tunnel** — works from any network, any phone |
| `npm run mobile:lan` | Force LAN mode when the tunnel is slow |
| `npm run mobile:clear` | Start with the Metro cache wiped. First thing to try when something looks stale |
| `npm run mobile:ios` | Start and open the iOS simulator |
| `npm run mobile:android` | Start and open an Android emulator |
| `npm run mobile:web` | Run the *Expo* app in a browser (not the Next.js app) |

```bash
npm run mobile:tunnel
```

Scan the QR it prints with the **iPhone Camera app**, not from inside Expo Go —
Expo Go 56 has no field to paste a URL into. The tunnel hostname changes on every
start, so always scan the QR from the run you just started.

## Web (Next.js)

| Command | What it does |
|---|---|
| `npm run web` | Dev server on http://localhost:3000 |
| `npm run web:build` | Production build |
| `npm run web:start` | Serve the production build |

```bash
npm run web
```

## Public links — testing from outside your network

```bash
npm run tunnel:all
```

Starts the web app, a public tunnel to it, and the Expo tunnel together. Two
links come out:

- **Web** — a `https://….loca.lt` URL printed by the tunnel line.
- **Mobile** — the `exp://….exp.direct` QR printed by Expo. Scan it with the
  **iPhone Camera app**.

Web only:

```bash
npm run web:tunnel
```

> **Why localtunnel and not ngrok.** There is an ngrok authtoken on this machine,
> but Expo issued it and its ACL only permits binding `*.exp.direct` — it powers
> `expo start --tunnel` and refuses any other hostname with `ERR_NGROK_316`. To
> use ngrok for the web app you need your own token from
> dashboard.ngrok.com: run `ngrok config add-authtoken <token>` once, then
> `ngrok http 3000` alongside `npm run web`. localtunnel needs no account, which
> is why it is the default here.

> **localtunnel shows an interstitial** the first time a browser opens the link,
> asking for a "tunnel password" — that is your network's public IP, which
> `curl https://loca.lt/mytunnelpassword` prints. Click through once per device.

Both tunnel hostnames change on every start.

## Both at once

```bash
npm run dev
```

```bash
npm run dev:tunnel
```

`dev` runs web + mobile side by side with prefixed, colour-coded output;
`dev:tunnel` does the same with the mobile tunnel. Ctrl-C stops both.

## Checks

| Command | What it does |
|---|---|
| `npm test` | Every test in both apps |
| `npm run typecheck` | TypeScript across both apps |
| `npm run check` | Both of the above — run this before committing |

```bash
npm run check
```

---

## Environment

Each app reads its own file, and the prefix differs — this is the usual reason
one app works and the other shows a blank screen.

```bash
# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

```bash
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

Both keys are public by design — row-level security is the boundary, not key
secrecy. **A service-role key must never appear in either file.**

### Feature flags

Optional, and off/on by sensible default. Mobile uses `EXPO_PUBLIC_FF_*`.

| Flag | Default | Effect |
|---|---|---|
| `EXPO_PUBLIC_FF_BYOK` | off | Show the "Your AI" plan and the API-keys screen |
| `EXPO_PUBLIC_FF_WEBVIEW_PLANS` | on | Subscription page as a styled web page. Set `0` for the native cards |

Name them **exactly** — Metro inlines these by scanning for the literal text, so
a typo silently leaves the flag at its default rather than erroring.

---

## When something is wrong

| Symptom | Try |
|---|---|
| Stale code after an edit | `npm run mobile:clear` |
| `ngrok: limited to 1 simultaneous session` | An old tunnel is still alive: `pkill -f ngrok`, then start again |
| Port 8081 busy | `pkill -f "expo start"` |
| QR does nothing | Use the **Camera app**, not Expo Go's scanner, and check the phone is off VPN |
| Blank screen in the app | Check the env file above — wrong prefix, or missing entirely |
| Web plans page blank | `EXPO_PUBLIC_FF_WEBVIEW_PLANS=0` falls back to native cards |

## Supabase

Shared by both apps. Changing it changes both.

```bash
npx supabase db push
```

```bash
npx supabase functions deploy
```
