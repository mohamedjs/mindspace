# 09 Meeting extension

## Goal
A Chrome MV3 extension in `apps/extension` records a meeting and produces a space of notes. Read "Meeting mode" in ARCHITECTURE.md.

## Structure
`manifest.json`, `src/background.ts`, `src/offscreen.ts`, `src/popup.tsx`, `src/parts-store.ts`, `src/uploader.ts`, built with Vite.
Permissions only: `tabCapture`, `offscreen`, `storage`, `activeTab`, and host permission for the API origin from build-time `VITE_API_URL`.

## Logic
- Works in any tab, tested with Google Meet, Zoom web and Teams web URLs. No DOM scraping.
- Starting needs a click, which `tabCapture` requires. The first use shows a notice: everyone in the meeting must know they are being recorded, and the user is responsible for local consent law. The user must accept it. A red badge shows the elapsed time throughout.
- Offscreen document: captures tab audio, keeps it audible to the user, mixes the microphone through `AudioContext` when permission is granted, and continues tab-only when it is refused.
- A new `MediaRecorder` every 5 minutes with `audio/webm;codecs=opus`. Each part goes to IndexedDB, then uploads with retry. It is deleted only after a 2xx.
- On stop or tab close, finish after remaining parts upload. A pending recording resumes on browser start.
- Sign-in by email and password in the popup, tokens in `chrome.storage.session` for access and `local` for refresh. Popup links to the finished space.

## Acceptance checks
Unit tests for part rotation, upload retry, resume and order. `npm run build -w @mindspace/extension` outputs a loadable folder and a zip. `manifest.json` validates as MV3. State in `notes` what needs a human test in a real meeting.

## Out of scope
Firefox, Safari, store submission.

## Decisions
