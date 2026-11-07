# Run v2 for testing on a phone on the same network

For Argon after phase 08, or for the owner. The laptop is `192.168.1.10`.

1. Confirm phase 08 is complete: run its Acceptance checks. If any fail, fix them first and report.
2. API: `docker compose up -d --wait api worker`, then `curl -fsS localhost:18080/health/ready`. `CORS_ORIGINS` in `.env` already includes `http://192.168.1.10:3000`.
3. Web: read `apps/web/.env.example` for the API URL variable that phase 08 introduced, set it to `http://192.168.1.10:18080` in `apps/web/.env.local`, then run `npm run build -w @mindspace/web` and `npx next start -H 0.0.0.0 -p 3000` inside `apps/web`. If `web` is in Compose, run that service instead.
4. From the laptop open `http://192.168.1.10:3000`. Sign up, create a note, group two notes, delete one, and undo.
5. Microphone: phone browsers only allow it on HTTPS. For voice, expose the web with an HTTPS tunnel, using the repo's `npm run web:tunnel`, `cloudflared tunnel --url http://localhost:3000`, or Caddy with `tls internal` and an accepted certificate. Add the tunnel origin to `CORS_ORIGINS` and restart `api`.
6. Report the URLs that work and any step that failed. Do not change production systems.
