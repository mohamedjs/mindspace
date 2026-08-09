import { HttpError, getUserOrThrow, json } from '../_shared/auth.ts';
import { adminClient } from '../_shared/supabase.ts';
import { encryptApiKey, keyHint } from '../_shared/crypto.ts';
import { openrouter } from '../_shared/providers/openrouter.ts';

/** Providers this MVP can validate with a live call before storing the key. */
const VALIDATABLE_PROVIDERS = new Set(['openrouter']);

Deno.serve(async (req) => {
  try {
    const user = await getUserOrThrow(req);
    const admin = adminClient();

    const { provider, apiKey, label, baseUrl } = await req.json();
    if (!provider || !apiKey) throw new HttpError(400, 'missing_params');
    if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      throw new HttpError(400, 'invalid_key_format');
    }

    // Cheapest real call that proves the key works, so a bad paste fails now
    // instead of on the user's next transcription.
    if (VALIDATABLE_PROVIDERS.has(provider)) {
      try {
        await openrouter.chat({
          apiKey,
          model: 'openai/gpt-oss-120b',
          system: 'Reply with the single word: ok',
          user: 'ok',
        });
      } catch {
        throw new HttpError(400, 'key_validation_failed', 'This key was rejected by the provider.');
      }
    }

    const encrypted = await encryptApiKey(apiKey);

    const { error } = await admin.from('user_ai_keys').upsert(
      {
        user_id: user.id,
        provider,
        label: label ?? null,
        encrypted_key: encrypted,
        key_hint: keyHint(apiKey),
        base_url: baseUrl ?? null,
        is_active: true,
        last_error: null,
      },
      { onConflict: 'user_id,provider,label' }
    );

    if (error) throw new HttpError(500, 'save_failed', error.message);

    return json({ ok: true, keyHint: keyHint(apiKey) });
  } catch (err) {
    if (err instanceof HttpError) return err.toResponse();
    console.error('[byok-save]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
