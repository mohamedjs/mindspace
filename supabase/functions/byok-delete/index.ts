import { HttpError, getUserOrThrow, json } from '../_shared/auth.ts';
import { adminClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  try {
    const user = await getUserOrThrow(req);
    const admin = adminClient();

    const { keyId } = await req.json();
    if (!keyId) throw new HttpError(400, 'missing_key_id');

    const { error } = await admin
      .from('user_ai_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (error) throw new HttpError(500, 'delete_failed', error.message);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return err.toResponse();
    console.error('[byok-delete]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
