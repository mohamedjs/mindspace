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
  type PromptClock,
} from '../_shared/prompts/extractThoughts.ts';
import { colorForNote, parseExtraction, resolveParentId } from '../_shared/extraction.ts';
import { layoutNewNotes, placeChild, type Rect } from '../_shared/layout.ts';

/**
 * Today, as the speaker experiences it. Edge functions run in UTC, so a
 * recording made at 1am Cairo would otherwise resolve "tomorrow" off
 * yesterday's date.
 */
function buildClock(timezone: string): PromptClock {
  const now = new Date();
  const safeZone = (fn: (tz: string) => string) => {
    try {
      return fn(timezone);
    } catch {
      // An invalid IANA name from the profile shouldn't fail the extraction.
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

    // parentNoteId is set when the user recorded from inside a note to think
    // it through further — everything extracted then belongs under that note.
    const { transcriptId, spaceId, parentNoteId } = await req.json();
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

    // Existing notes give the model context (don't duplicate, and can nest a
    // new note under one of them) and the layout engine the occupied rects.
    // Only top-level notes occupy a grid slot — a child instead orbits its
    // parent's rect (see radialChildRect below).
    const { data: existingNotes } = await admin
      .from('sticky_notes')
      .select('id, title, content, type, x, y, width, height, parent_id')
      .eq('space_id', spaceId)
      .is('deleted_at', null);

    const existing = existingNotes ?? [];
    const existingTopLevel = existing.filter((n) => !n.parent_id);
    const existingIds = new Set(existing.map((n) => n.id));

    // Scoped to this space's live notes, so a bad/foreign id can't attach
    // notes to someone else's board — it just falls back to a normal extract.
    const focusNote = parentNoteId ? existing.find((n) => n.id === parentNoteId) : undefined;
    if (parentNoteId && !focusNote) throw new HttpError(404, 'parent_note_not_found');

    const provider = baseUrl ? createOpenAICompatibleProvider(baseUrl) : openrouter;

    // "tomorrow at 3" is unresolvable without the speaker's own date. Fall
    // back to the profiles default rather than letting the model guess.
    const { data: profile } = await admin
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .single();

    const clock = buildClock(profile?.timezone ?? 'Africa/Cairo');

    const completion = await provider.chat({
      apiKey,
      model: model.model_id,
      system: EXTRACT_THOUGHTS_SYSTEM,
      user: buildExtractUserPrompt(
        transcript.text,
        existing.map((n) => ({ id: n.id, title: n.title, content: n.content, type: n.type })),
        focusNote
          ? {
              id: focusNote.id,
              title: focusNote.title,
              content: focusNote.content,
              type: focusNote.type,
            }
          : null,
        clock
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

    // Ids are generated up front (instead of left to the DB default) so a
    // child note can point at its same-batch parent's id in a single INSERT —
    // the parent doesn't exist yet to look its id up otherwise.
    const ids = extraction.notes.map(() => crypto.randomUUID());
    const clientKeyToIndex = new Map(extraction.notes.map((n, i) => [n.clientKey, i]));
    const clientKeyToId = new Map(extraction.notes.map((n, i) => [n.clientKey, ids[i]]));

    // With a focus note, a thought the model left top-level still belongs to
    // the note the user was speaking into — that's the whole point of
    // recording from inside it. Nesting under a sibling in the batch is kept.
    const parentIds = extraction.notes.map((note, i) => {
      const resolved = resolveParentId(note, i, {
        batchIndex: clientKeyToIndex,
        batchIds: clientKeyToId,
        existingIds,
      });
      return resolved ?? focusNote?.id ?? null;
    });

    // Only top-level (parentless) notes claim a grid slot. A child instead
    // orbits its resolved parent — existing or same-batch — so the connector
    // line drawn between them on canvas is short and reads as a cluster.
    const topLevelIndices = parentIds
      .map((parentId, i) => (parentId === null ? i : -1))
      .filter((i) => i !== -1);
    const topLevelPositions = layoutNewNotes(
      topLevelIndices.length,
      existingTopLevel.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
    );

    const idToIndex = new Map(ids.map((id, i) => [id, i]));
    const rectByIndex = new Map<number, Rect>();
    topLevelIndices.forEach((i, slot) => rectByIndex.set(i, topLevelPositions[slot]));

    // Children are resolved to point at a parent emitted earlier (rule 7 +
    // resolveParentId's ordering check), so a single forward pass always has
    // the parent's rect ready — including a grandchild orbiting a child that
    // was itself just placed a few iterations earlier.
    const siblingCountByParent = new Map<string, number>();
    for (let i = 0; i < extraction.notes.length; i++) {
      if (rectByIndex.has(i)) continue;
      const parentId = parentIds[i]!;
      const siblingIndex = siblingCountByParent.get(parentId) ?? 0;
      siblingCountByParent.set(parentId, siblingIndex + 1);

      const parentRect = existingIds.has(parentId)
        ? existing.find((n) => n.id === parentId)!
        : rectByIndex.get(idToIndex.get(parentId)!)!;

      // Orbiting alone doesn't know about the rest of the board — check
      // against everything placed so far (existing notes and every rect
      // already assigned this batch) so a sibling can't land on an
      // unrelated note.
      const occupied = [...existing, ...rectByIndex.values()];
      rectByIndex.set(i, placeChild(parentRect, siblingIndex, occupied));
    }

    const rows = extraction.notes.map((note, i) => {
      const parentId = parentIds[i];
      const rect = rectByIndex.get(i)!;

      return {
        id: ids[i],
        user_id: user.id,
        space_id: spaceId,
        title: note.title ?? null,
        content: note.content,
        type: note.type,
        color: colorForNote(note.type, note.color),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        parent_id: parentId,
        due_at: note.dueAt ?? null,
        source_type: 'ai',
        recording_id: transcript.recording_id,
        transcript_id: transcript.id,
        span_start: note.spanStart ?? null,
        span_end: note.spanEnd ?? null,
        ai_action_id: action.id,
      };
    });

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

    // Relations reference note clientKeys; map them onto the real ids
    // (clientKeyToIndex/clientKeyToId already built above for parent_id).
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
