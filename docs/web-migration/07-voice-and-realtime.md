# 07 — Voice capture, the pipeline, and live status

The voice flow is the product. Everything else is note management.

## 7.1 The full sequence

```
  user taps mic
      ↓
  getUserMedia({ audio })                       ← permission prompt
      ↓
  MediaRecorder.start(), timer + level meter running
      ↓
  user taps stop  (or the plan's max-minutes cap fires)
      ↓
  1. createRecordingRow({ spaceId, durationMs })     → recordings row, status 'recorded'
  2. uploadRecording({ localUri, userId, spaceId, recordingId })
       → Supabase Storage `recordings/{userId}/{spaceId}/{recordingId}.{ext}`
       → then UPDATE recordings SET local_only=false, storage_path=…, status='uploading'
  3. navigate to /?recordingId=<id>                  → live status banner appears
  4. runThinkingPipeline(recordingId, spaceId, parentNoteId, fillNoteId)
         a. findTranscriptId(recordingId)            ← reuse, never transcribe twice
         b. invoke 'transcribe'      → { transcriptId, text, language }
         c. invoke 'ai-extract'      → { aiActionId, noteIds, creditsCharged }
            …or 'ai-note-write' when fillNoteId is set
         d. markCompleted(recordingId)
      ↓
  Realtime UPDATE on the recordings row drives the banner the whole way
      ↓
  notes query invalidated → new sticky notes appear
```

**Step 1 before step 2 is not stylistic.** The row is a durable checkpoint: if
the upload dies, the row survives and the audio can be retried instead of
silently lost.

**Step (a) is not an optimisation.** On the free plan the transcribe function
*deletes the audio* once text exists. A retry after a failed *extraction* would
call transcribe with no object in Storage, get `recording_not_uploaded`, and
strand a perfectly good transcript. Reusing the transcript also means a retry
only pays for the step that actually failed.

`pipeline.ts` implements all of this and **ports verbatim** — it only talks to
ports.

## 7.2 Recording with `MediaRecorder`

Replaces `expo-audio`. `recorder.ts` is deleted, but keep its two exported
product constants.

```ts
// web/src/features/voice/services/recorder.ts
export const FREE_MAX_RECORDING_MIN = 5;
export const FREE_MAX_RECORDING_SEC = FREE_MAX_RECORDING_MIN * 60;

/** Metering cadence. Feeds an imperative level meter, never React state. */
export const METERING_INTERVAL_MS = 60;

/**
 * Mono, modest bitrate — small enough to upload on Egyptian mobile data, which
 * is the same reason native records 64 kbps AAC mono.
 */
export const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

/**
 * Container choice is the browser's, not ours. Safari does not produce webm;
 * Chrome and Firefox do. Pick the first supported type and let audioFormat.ts
 * derive the extension from whatever the resulting Blob reports — the
 * transcribe function parses that extension back off storage_path to tell the
 * model how to decode the audio, so a wrong extension breaks transcription.
 */
const PREFERRED = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',            // Safari
  'audio/ogg;codecs=opus',
];

export function pickMimeType(): string | undefined {
  return PREFERRED.find((t) => MediaRecorder.isTypeSupported(t));
}
```

Recorder shape:

```ts
const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
const recorder = new MediaRecorder(stream, {
  mimeType: pickMimeType(),
  audioBitsPerSecond: 64_000,
});

const chunks: Blob[] = [];
recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: recorder.mimeType });
  const localUri = URL.createObjectURL(blob);   // what uploadRecording() fetches
  // …
};
recorder.start();
```

**Always** `stream.getTracks().forEach(t => t.stop())` when finished, or the
browser keeps showing the recording indicator and holds the microphone.

**Always** `URL.revokeObjectURL(localUri)` after the upload resolves.

### Permission handling

The web has no `expo-audio` permission API. `getUserMedia` throws:

| Error `name` | Meaning | UI |
|---|---|---|
| `NotAllowedError` | User denied, or the page is not on HTTPS | "MindSpace needs your microphone." Explain how to re-enable it in site settings — **you cannot re-prompt once denied** |
| `NotFoundError` | No microphone | "No microphone found." |
| `NotReadableError` | Device busy | "Your microphone is in use by another app." |

**`getUserMedia` requires a secure context.** `localhost` works; any other
non-HTTPS origin does not. If you test from a phone on the LAN, you need HTTPS
or the microphone will silently fail.

### Recording caps

`RecordScreen` computes `maxRecordingSec = (activePlan?.maxRecordingMinutes ?? FREE_MAX_RECORDING_MIN) * 60`
and **fails closed to the free 5-minute cap whenever the plan is unknown**. Keep
that fallback direction — an unknown plan must not get 120 minutes.

Auto-stop at the cap and tell the user why.

> Note for your summary: this cap is **client-side only** on both platforms. A
> modified client can exceed its tier. It is a known revenue gap already logged
> in the project README, not something the port introduces — and not something
> you should fix here, because the fix belongs in an edge function.

## 7.3 The waveform

`Waveform.tsx` shows a live level meter. On the web:

```ts
const ctx = new AudioContext();
const source = ctx.createMediaStreamSource(stream);
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser);
// requestAnimationFrame → getByteFrequencyData → RMS → bar heights
```

Write bar heights **imperatively** (`style.height` or a `<canvas>`) at ~60 Hz.
Do not put the level in React state — `METERING_INTERVAL_MS = 60` exists
precisely because the RN version feeds a Reanimated shared value, never state.

`AudioContext` may start `suspended` until a user gesture; call `ctx.resume()`
inside the click handler that starts recording. Close it on stop.

## 7.4 Live status — Realtime

`useRecordingStatus(recordingId)` subscribes through `RealtimePort.watchRecording`
and works **unchanged** in the browser (Supabase Realtime is WebSockets).

Status values, in pipeline order:

```
recorded → uploading → transcribing → transcribed → extracting → completed
                                                              ↘ failed
```

The banner shows for everything except `completed` and `failed`.
**`transcribed` is mid-pipeline** (extraction still to run) so it stays on the
banner — the terminal states are what clear it.

Add one web-only concern: the socket drops when a laptop sleeps or a tab is
backgrounded for a long time. On `visibilitychange → visible`, refetch the
recording status once rather than trusting the socket to have caught up.

## 7.5 Error handling

`pipelineErrors.ts` maps twelve machine-readable codes to
`{ title, message, action }`. **Port it verbatim.**

| Code | Action |
|---|---|
| `insufficient_credits` | `buy_credits` |
| `byok_required` | `add_key` |
| `no_platform_key` | `settings` |
| `unsupported_provider` | `settings` |
| `no_model_available` | `settings` |
| `provider_timeout` | `retry` |
| `provider_error` | `retry` |
| `recording_not_uploaded` | `retry` |
| `transcript_not_found` | `retry` |
| `notes_insert_failed` | `retry` |
| `note_update_failed` | `retry` |
| `provider_not_configured` | (payments) |

`FailureAction = 'retry' | 'buy_credits' | 'add_key' | 'settings' | 'none'`.
Each action must be a real button in the error UI that navigates or retries —
`buy_credits` → `/plans`, `add_key` → `/keys`, `settings` → `/settings`.

Two entry points:
- `describeFailure(err)` — for an error thrown right now.
- `describeStoredFailure(errorString)` — for the `error` column on a recording
  row read back later.

Codes are preserved end to end by `PipelineError` (`src/core/errors.ts`) and the
`FunctionsPort` adapter (`infrastructure/supabase/functions.ts`), which
translates a non-2xx edge response into a `PipelineError` **with its code
intact**. Both port unchanged. If you rewrite `functions.ts` and lose the code,
every error becomes "something went wrong" and this whole table is dead.

## 7.6 Reminders — the one genuine capability gap

The RN app uses `expo-notifications` to schedule a **local** notification at a
note's `dueAt`, with:

- A stable identifier per note: `note-due-${noteId}`, so re-syncing replaces
  rather than stacks.
- Idempotent `syncNoteReminders(notes)` on every notes refetch: cancel anything
  ours not in the current due set, then cancel-and-reschedule each due note.
- Past dates skipped rather than fired immediately.
- No re-prompting a user who already declined.

**The web has no equivalent to "schedule a local notification for next
Thursday" that survives the tab being closed.** `setTimeout` dies with the page.
The Notification Triggers API is not broadly available.

Three options, in order of preference:

| Option | How | Trade-off |
|---|---|---|
| **A. Service worker + Web Push** | Register a SW, subscribe with `PushManager`, store the subscription server-side, and add a scheduled job that pushes at `due_at` | Works when the tab is closed. **Requires a backend change** (a push table + a cron), so it is out of scope for this port — log it and build B now |
| **B. In-app scheduling while open** | On notes load, `setTimeout` for any `dueAt` within the next N hours; show a `Notification` (permission granted) or an in-app toast | Zero backend change. Only fires while a tab is open. Honest and shippable |
| **C. Nothing** | Calendar shows due dates; no alerts | Loses a shipped feature |

**Do B for parity-now, and write A into `10-open-questions.md`.** Keep the same
idempotence discipline: a stable key per note, cancel before reschedule, skip
past dates, never re-prompt after a denial.

`Notification.requestPermission()` must be called from a user gesture. Ask when
the user first creates a note with a due date, not on page load.

> Note for your summary: the native app's reminders **also** do not currently
> work in Expo Go — `expo-notifications` needs a native dev build. So on the web
> option B is arguably a step forward for most users, not a regression. Say so
> plainly rather than claiming full parity.

## 7.7 Web-only wins worth taking

Cheap, and they make the web version better than the native one:

- **`beforeunload` guard** while a recording is in progress or uploading.
- **Drag-and-drop / file-picker audio upload.** The pipeline takes a Blob; it
  does not care that a microphone produced it. Skip step 1's duration
  measurement by reading it from an `<audio>` element.
- **Keyboard shortcut** to start/stop recording (space bar when not in a text
  field).
- **Tab title** shows the pipeline stage while processing, so a backgrounded tab
  still reports progress.
