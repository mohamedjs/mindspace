import { HttpError, getUserOrThrow, json } from '../_shared/auth.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { releaseCredits, reserveCredits, settleCredits } from '../_shared/credits.ts';
import { resolveModel } from '../_shared/models.ts';
import { resolveApiKey } from '../_shared/keys.ts';
import { createOpenAICompatibleProvider } from '../_shared/providers/openaiCompatible.ts';
import { openrouter } from '../_shared/providers/openrouter.ts';

/** 6 credits per minute of audio, before the model's multiplier. */
const CREDITS_PER_MINUTE = 6;
const BUCKET = 'recordings';

/**
 * There is no plan column on profiles — the paid signal is whether the user has
 * ever completed a purchase. Free users' audio is deleted server-side after
 * transcription; paid users keep it for provenance playback.
 */
async function isFreePlan(admin: ReturnType<typeof adminClient>, userId: string) {
  const { count } = await admin
    .from('credit_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reason', 'purchase');

  return (count ?? 0) === 0;
}

Deno.serve(async (req) => {
  let reservationId: string | null = null;
  let db: ReturnType<typeof userClient> | null = null;
  let recordingId: string | null = null;
  const admin = adminClient();

  try {
    // 1. Authenticate
    const user = await getUserOrThrow(req);
    db = userClient(req);

    const { recordingId: bodyRecordingId } = await req.json();
    if (!bodyRecordingId) throw new HttpError(400, 'missing_recording_id');
    recordingId = bodyRecordingId;

    const { data: recording, error: recErr } = await admin
      .from('recordings')
      .select('id, user_id, storage_path, duration_ms, status')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) throw new HttpError(404, 'recording_not_found');
    if (recording.user_id !== user.id) throw new HttpError(403, 'forbidden');
    if (!recording.storage_path) throw new HttpError(400, 'recording_not_uploaded');

    // 2. Resolve the transcription model
    const model = await resolveModel(admin, 'transcribe', user.id);

    // 3. Resolve the API key (user key -> platform key -> reject)
    const { apiKey, usesPlatformKey, baseUrl } = await resolveApiKey(
      admin,
      user.id,
      model.provider,
      model.byok_only
    );

    // 4. Reserve credits only when spending the platform key
    const minutes = recording.duration_ms / 60000;
    const estimated = Math.ceil(CREDITS_PER_MINUTE * minutes * Number(model.credit_multiplier));
    if (usesPlatformKey) {
      reservationId = await reserveCredits(db, estimated, 'usage');
    }

    // 5. Mark transcribing so the client's realtime subscription updates
    await admin.from('recordings').update({ status: 'transcribing' }).eq('id', recordingId);

    // 6. Signed URL for the audio
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(recording.storage_path, 600);
    if (signErr || !signed) throw new HttpError(500, 'signed_url_failed', signErr?.message);

    const audioRes = await fetch(signed.signedUrl);
    if (!audioRes.ok) throw new HttpError(500, 'audio_fetch_failed');
    const audio = await audioRes.blob();

    // 7. Transcribe. The container is whatever the client actually recorded —
    // m4a on native, webm/mp4 on web — and the extension on storage_path is the
    // only record of it, so both paths derive the format from there rather than
    // assuming m4a.
    //
    // OpenRouter exposes no /audio/transcriptions endpoint, so it transcribes
    // through chat with an input_audio part. Everything else (OpenAI, NVIDIA…)
    // uses the real Whisper-style endpoint.
    const provider = baseUrl ? createOpenAICompatibleProvider(baseUrl) : openrouter;
    const format = recording.storage_path.split('.').pop() ?? 'm4a';

    const result =
      model.provider === 'openrouter'
        ? await provider.transcribeViaChat({ apiKey, model: model.model_id, audio, format })
        : await provider.transcribe({
            apiKey,
            model: model.model_id,
            audio,
            fileName: `audio.${format}`,
          });

    // 8. Persist the transcript
    const { data: transcript, error: txErr } = await admin
      .from('transcripts')
      .insert({
        user_id: user.id,
        recording_id: recordingId,
        text: result.text,
        language: result.language,
        provider: model.provider,
        model_id: model.model_id,
      })
      .select('id')
      .single();
    if (txErr || !transcript) throw new HttpError(500, 'transcript_insert_failed', txErr?.message);

    // 9. Mark transcribed. Clear `error` too — a retried recording keeps the
    // message from its previous failure otherwise, and the client drives its
    // banner off that column.
    await admin
      .from('recordings')
      .update({ status: 'extracting', error: null })
      .eq('id', recordingId);

    // 10. Settle at the estimate — duration is known up front, so it is the actual cost
    if (reservationId && db) {
      await settleCredits(db, reservationId, estimated, null);
      reservationId = null;
    }

    // 11. Free plan keeps no server-side audio once the text exists; the device
    // keeps its local copy. Paid users retain the object so Phase 6 provenance
    // can replay audio against transcript spans.
    if (await isFreePlan(admin, user.id)) {
      await admin.storage.from(BUCKET).remove([recording.storage_path]);
      await admin.from('recordings').update({ local_only: true, storage_path: null }).eq('id', recordingId);
    }

    return json({ transcriptId: transcript.id, text: result.text, language: result.language });
  } catch (err) {
    // Never charge for a failed provider call.
    if (reservationId && db) await releaseCredits(db, reservationId);
    if (recordingId) {
      await admin
        .from('recordings')
        .update({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
        .eq('id', recordingId);
    }

    if (err instanceof HttpError) return err.toResponse();
    console.error('[transcribe]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
