import { HttpError, getUserOrThrow, json } from '../_shared/auth.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { releaseCredits, reserveCredits, settleCredits } from '../_shared/credits.ts';
import { resolveModel } from '../_shared/models.ts';
import { resolveApiKey } from '../_shared/keys.ts';
import { createOpenAICompatibleProvider } from '../_shared/providers/openaiCompatible.ts';
import { openrouter } from '../_shared/providers/openrouter.ts';
import {
  WRITE_NOTE_SYSTEM,
  WRITE_NOTE_VERSION,
  buildWriteNotePrompt,
} from '../_shared/prompts/writeNote.ts';
import { extractJsonBlock } from '../_shared/extraction.ts';
import { z } from 'zod';

/**
 * Speaking into one note, rather than onto the board. ai-extract fans a
 * transcript out into many notes; this writes a single note's own title and
 * body. Same helpers (model, key, credits, provider), different shape in and
 * out — an UPDATE of one row instead of an insert-many.
 */

/** Cheaper than an extraction: one note out, no relations, no layout. */
const BASE_WRITE_CREDITS = 4;
const USD_PER_CREDIT = 0.01 / 10;

const writtenNoteSchema = z.object({
  title: z.string().max(80).nullable().optional(),
  content: z.string(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional().catch(null),
});

function buildClock(timezone: string) {
  const now = new Date();
  const safeZone = (fn: (tz: string) => string) => {
    try {
      return fn(timezone);
    } catch {
      return fn('UTC');
    }
  };
  return {
    today: safeZone((tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)),
    weekday: safeZone((tz) =>
      new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now)
    ),
    timezone,
  };
}

Deno.serve(async (req) => {
  let reservationId: string | null = null;
  let db: ReturnType<typeof userClient> | null = null;
  const admin = adminClient();

  try {
    const user = await getUserOrThrow(req);
    db = userClient(req);

    const { transcriptId, noteId } = await req.json();
    if (!transcriptId || !noteId) throw new HttpError(400, 'missing_params');

    const { data: transcript, error: txErr } = await admin
      .from('transcripts')
      .select('id, user_id, text, recording_id')
      .eq('id', transcriptId)
      .single();

    if (txErr || !transcript) throw new HttpError(404, 'transcript_not_found');
    if (transcript.user_id !== user.id) throw new HttpError(403, 'forbidden');

    const { data: note, error: noteErr } = await admin
      .from('sticky_notes')
      .select('id, user_id, space_id, title, content')
      .eq('id', noteId)
      .is('deleted_at', null)
      .single();

    if (noteErr || !note) throw new HttpError(404, 'note_not_found');
    if (note.user_id !== user.id) throw new HttpError(403, 'forbidden');

    const model = await resolveModel(admin, 'chat', user.id);
    const { apiKey, usesPlatformKey, baseUrl } = await resolveApiKey(
      admin,
      user.id,
      model.provider,
      model.byok_only
    );

    const estimated = Math.ceil(BASE_WRITE_CREDITS * Number(model.credit_multiplier));
    if (usesPlatformKey) {
      reservationId = await reserveCredits(db, estimated, 'usage');
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .single();

    const provider = baseUrl ? createOpenAICompatibleProvider(baseUrl) : openrouter;
    const completion = await provider.chat({
      apiKey,
      model: model.model_id,
      system: WRITE_NOTE_SYSTEM,
      user: buildWriteNotePrompt(
        transcript.text,
        { title: note.title, content: note.content },
        buildClock(profile?.timezone ?? 'Africa/Cairo')
      ),
      jsonMode: true,
    });

    const written = writtenNoteSchema.parse(JSON.parse(extractJsonBlock(completion.text)));

    const rawCostUsd =
      (completion.inputTokens / 1_000_000) * Number(model.input_price_m ?? 0) +
      (completion.outputTokens / 1_000_000) * Number(model.output_price_m ?? 0);

    const actual = rawCostUsd
      ? Math.max(1, Math.ceil((rawCostUsd / USD_PER_CREDIT) * Number(model.credit_multiplier)))
      : estimated;

    const { data: action } = await admin
      .from('ai_actions')
      .insert({
        user_id: user.id,
        space_id: note.space_id,
        kind: 'extract_thoughts',
        status: 'applied',
        recording_id: transcript.recording_id,
        transcript_id: transcript.id,
        provider: model.provider,
        model_id: model.model_id,
        prompt_version: WRITE_NOTE_VERSION,
        billed_to: usesPlatformKey ? 'credits' : 'byok',
        credits_charged: usesPlatformKey ? actual : 0,
        input_tokens: completion.inputTokens,
        output_tokens: completion.outputTokens,
        raw_cost_usd: rawCostUsd || null,
        raw_response: { text: completion.text },
      })
      .select('id')
      .single();

    const newText = written.content.trim();

    // Nothing worth writing (silence, a mic test) — leave the note alone and
    // don't bill for it. Same contract as an empty extraction.
    if (!newText) {
      if (reservationId && db) {
        await settleCredits(db, reservationId, 0, action?.id ?? null);
        reservationId = null;
      }
      return json({ noteId, changed: false, creditsCharged: 0 });
    }

    // Append rather than overwrite: note content has no undo, and silently
    // destroying a paragraph the user typed is unrecoverable. A note that is
    // still empty or untouched from the "add note" button gets replaced.
    const previous = note.content?.trim() ?? '';
    const isPlaceholder = !previous || previous === 'New note';
    const content = isPlaceholder ? newText : `${previous}\n\n${newText}`;

    const { error: updateErr } = await admin
      .from('sticky_notes')
      .update({
        content,
        // Only let the model name an untitled note, or retitle a placeholder.
        title: note.title?.trim() ? note.title : written.title ?? null,
        ...(written.dueAt ? { due_at: written.dueAt } : {}),
      })
      .eq('id', noteId);

    if (updateErr) throw new HttpError(500, 'note_update_failed', updateErr.message);

    if (reservationId && db) {
      await settleCredits(db, reservationId, actual, action?.id ?? null);
      reservationId = null;
    }

    return json({ noteId, changed: true, creditsCharged: usesPlatformKey ? actual : 0 });
  } catch (err) {
    if (reservationId && db) await releaseCredits(db, reservationId);

    if (err instanceof HttpError) return err.toResponse();
    console.error('[ai-note-write]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
