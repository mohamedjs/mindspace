import { HttpError, getUserOrThrow, json } from '../_shared/auth.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { releaseCredits, reserveCredits, settleCredits } from '../_shared/credits.ts';
import { resolveModel } from '../_shared/models.ts';
import { resolveApiKey } from '../_shared/keys.ts';
import { createOpenAICompatibleProvider } from '../_shared/providers/openaiCompatible.ts';
import { openrouter } from '../_shared/providers/openrouter.ts';
import {
  EXTRACT_THOUGHTS_SYSTEM,
  EXTRACT_THOUGHTS_VERSION,
  buildExtractUserPrompt,
} from '../_shared/prompts/extractThoughts.ts';
import { colorForNote, parseExtraction } from '../_shared/extraction.ts';
import { layoutNewNotes } from '../_shared/layout.ts';

/** Flat estimate before the model multiplier; settled against real token usage. */
const BASE_EXTRACT_CREDITS = 8;
const USD_PER_CREDIT = 0.01 / 10; // 10 credits = 1 EGP ~= 0.01 USD at the seeded FX

Deno.serve(async (req) => {
  let reservationId: string | null = null;
  let db: ReturnType<typeof userClient> | null = null;
  const admin = adminClient();

  try {
    const user = await getUserOrThrow(req);
    db = userClient(req);

    const { transcriptId, spaceId } = await req.json();
    if (!transcriptId || !spaceId) throw new HttpError(400, 'missing_params');

    const { data: transcript, error: txErr } = await admin
      .from('transcripts')
      .select('id, user_id, text, recording_id')
      .eq('id', transcriptId)
      .single();

    if (txErr || !transcript) throw new HttpError(404, 'transcript_not_found');
    if (transcript.user_id !== user.id) throw new HttpError(403, 'forbidden');

    const model = await resolveModel(admin, 'chat', user.id);
    const { apiKey, usesPlatformKey, baseUrl } = await resolveApiKey(
      admin,
      user.id,
      model.provider,
      model.byok_only
    );

    const estimated = Math.ceil(BASE_EXTRACT_CREDITS * Number(model.credit_multiplier));
    if (usesPlatformKey) {
      reservationId = await reserveCredits(db, estimated, 'usage');
    }

    // Existing notes give the model context (don't duplicate) and the layout
    // engine the occupied rects.
    const { data: existingNotes } = await admin
      .from('sticky_notes')
      .select('title, content, type, x, y, width, height')
      .eq('space_id', spaceId)
      .is('deleted_at', null);

    const existing = existingNotes ?? [];
    const provider = baseUrl ? createOpenAICompatibleProvider(baseUrl) : openrouter;

    const completion = await provider.chat({
      apiKey,
      model: model.model_id,
      system: EXTRACT_THOUGHTS_SYSTEM,
      user: buildExtractUserPrompt(
        transcript.text,
        existing.map((n) => ({ title: n.title, content: n.content, type: n.type }))
      ),
      jsonMode: true,
    });

    const extraction = parseExtraction(completion.text);

    // True cost from token usage; fall back to the estimate if the provider
    // omitted usage so we never under-charge silently.
    const rawCostUsd =
      (completion.inputTokens / 1_000_000) * Number(model.input_price_m ?? 0) +
      (completion.outputTokens / 1_000_000) * Number(model.output_price_m ?? 0);

    const actual = rawCostUsd
      ? Math.max(1, Math.ceil((rawCostUsd / USD_PER_CREDIT) * Number(model.credit_multiplier)))
      : estimated;

    // Record the action first so every note can point back at it for undo.
    const { data: action, error: actionErr } = await admin
      .from('ai_actions')
      .insert({
        user_id: user.id,
        space_id: spaceId,
        kind: 'extract_thoughts',
        status: 'proposed',
        recording_id: transcript.recording_id,
        transcript_id: transcript.id,
        provider: model.provider,
        model_id: model.model_id,
        prompt_version: EXTRACT_THOUGHTS_VERSION,
        billed_to: usesPlatformKey ? 'credits' : 'byok',
        credits_charged: usesPlatformKey ? actual : 0,
        input_tokens: completion.inputTokens,
        output_tokens: completion.outputTokens,
        raw_cost_usd: rawCostUsd || null,
        raw_response: { text: completion.text },
      })
      .select('id')
      .single();

    if (actionErr || !action) throw new HttpError(500, 'action_insert_failed', actionErr?.message);

    const positions = layoutNewNotes(
      extraction.notes.length,
      existing.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
    );

    const rows = extraction.notes.map((note, i) => ({
      user_id: user.id,
      space_id: spaceId,
      title: note.title ?? null,
      content: note.content,
      type: note.type,
      color: colorForNote(note.type, note.color),
      x: positions[i].x,
      y: positions[i].y,
      width: positions[i].width,
      height: positions[i].height,
      source_type: 'ai',
      recording_id: transcript.recording_id,
      transcript_id: transcript.id,
      span_start: note.spanStart ?? null,
      span_end: note.spanEnd ?? null,
      ai_action_id: action.id,
    }));

    // An empty extraction is a valid outcome, not a failure — a silent or
    // test recording genuinely contains no thought. Skip the writes and don't
    // bill for it; the ai_actions row above still records that we looked.
    if (!rows.length) {
      if (reservationId && db) {
        await settleCredits(db, reservationId, 0, action.id);
        reservationId = null;
      }
      return json({ aiActionId: action.id, noteIds: [], creditsCharged: 0 });
    }

    const { data: inserted, error: insertErr } = await admin
      .from('sticky_notes')
      .insert(rows)
      .select('id');

    if (insertErr || !inserted) throw new HttpError(500, 'notes_insert_failed', insertErr?.message);

    // One reversible item per note — undo soft-deletes them in reverse order.
    await admin.from('ai_action_items').insert(
      inserted.map((row, i) => ({
        user_id: user.id,
        ai_action_id: action.id,
        operation: 'insert',
        target_type: 'sticky_note',
        target_id: row.id,
        forward_patch: rows[i],
        inverse_patch: { deleted_at: 'now()' },
        sort_order: i,
      }))
    );

    // Relations reference note clientKeys; map them onto the real ids.
    const clientKeyToIndex = new Map(extraction.notes.map((n, i) => [n.clientKey, i]));

    if (extraction.relations.length) {
      await admin.from('relationships').insert(
        extraction.relations.map((rel) => {
          const fromIndex = clientKeyToIndex.get(rel.from)!;
          const toIndex = clientKeyToIndex.get(rel.to)!;
          return {
            user_id: user.id,
            space_id: spaceId,
            from_note_id: inserted[fromIndex].id,
            to_note_id: inserted[toIndex].id,
            type: rel.type,
            created_by: 'ai',
            ai_action_id: action.id,
          };
        })
      );
    }

    if (reservationId && db) {
      await settleCredits(db, reservationId, actual, action.id);
      reservationId = null;
    }

    return json({
      aiActionId: action.id,
      noteIds: inserted.map((r) => r.id),
      creditsCharged: usesPlatformKey ? actual : 0,
    });
  } catch (err) {
    if (reservationId && db) await releaseCredits(db, reservationId);

    if (err instanceof HttpError) return err.toResponse();
    console.error('[ai-extract]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
