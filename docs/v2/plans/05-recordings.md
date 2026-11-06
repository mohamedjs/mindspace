# 05 Recordings, parts, queue, transcription, SSE

## Goal
Audio of any length becomes a stored transcript, surviving crashes. Read "Concurrency model", "Meeting mode" and "Speech to text" in ARCHITECTURE.md. Port `supabase/functions/transcribe`. Closes H3, H4, M10, P3, P6.

## Routes
- `POST /spaces/:id/recordings` `{kind, process_mode, target_note_id?, parent_note_id?}`, verifying every id belongs to the caller.
- `PUT /recordings/:id/parts/:idx`: streamed to `AUDIO_DIR/{user}/{recording}/{idx}.{ext}`. Idempotent. Enforces size and allowed containers from `.webm .m4a .mp4 .mp3 .wav .ogg`, by magic bytes, not by the client's header.
- `POST /recordings/:id/finish`: sets `queued` and publishes `pipeline:wake`. Idempotent.
- `GET /recordings/:id/events`: SSE. Sends current status first, heartbeat every 20 seconds. Falls back to polling if Redis is down.
- Existing status and list routes from the contract.

## Worker
- Claim with `FOR UPDATE SKIP LOCKED`, sets `claimed_at`, increments `attempts`. Sweep requeues a job idle for 15 minutes; after 3 attempts mark `failed`, releasing any reservation.
- Steps: `ffprobe` every part for real duration, and reject when the plan's cap is exceeded through an `Entitlements` port (default allow until phase 07). Split any part over 5 minutes with ffmpeg into new parts. Reserve credits from the server-measured duration, 6 per minute times multiplier. Transcribe pending parts with `p-limit(STT_CONCURRENCY)`, each saved as it finishes, so a retry skips finished parts. Join by `idx` into `transcripts`. Settle in the same transaction as the transcript.
- Failed provider calls retry 3 times with exponential backoff and jitter on 429 and 5xx, 120-second deadline.
- Install ffmpeg in the worker image. Read audio by stream and base64 per part, never all parts at once.
- After transcription, hand off through an `Extractor` port, a no-op until phase 06.
- Audio retention follows the existing free-plan rule, removed after the transcript is saved.

## Acceptance checks
Standard check, with a fake provider covering: 3 parts complete out of order and join correctly; a killed worker's job resumes without re-transcribing; a foreign user gets 404 on every route; a spoofed client duration has no effect; a fake `.webm` is rejected. Use a generated tone from ffmpeg as test audio.

## Out of scope
Extraction.

## Decisions
