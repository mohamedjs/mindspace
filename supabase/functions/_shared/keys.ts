import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './auth.ts';
import { decryptApiKey } from './crypto.ts';

export interface ResolvedKey {
  apiKey: string;
  /** BYOK requests are free; platform-key requests reserve/settle credits. */
  usesPlatformKey: boolean;
  baseUrl: string | null;
}

/**
 * OpenAI-compatible base URL per provider. OpenRouter only implements
 * /chat/completions — it has no /audio/transcriptions — so transcription
 * models must be configured against a provider that actually serves speech-to-text.
 */
const PROVIDER_BASE_URL: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  nvidia: 'https://integrate.api.nvidia.com/v1',
};

/** Platform secret per provider, e.g. openai -> PLATFORM_OPENAI_KEY. */
function platformKeyEnv(provider: string) {
  return `PLATFORM_${provider.toUpperCase()}_KEY`;
}

/**
 * Key precedence: the user's own active key for the provider (free), then the
 * platform key (charged). byok_only models refuse to fall back.
 */
export async function resolveApiKey(
  admin: SupabaseClient,
  userId: string,
  provider: string,
  byokOnly: boolean
): Promise<ResolvedKey> {
  const { data: userKey } = await admin
    .from('user_ai_keys')
    .select('encrypted_key, base_url')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_active', true)
    .maybeSingle();

  if (userKey?.encrypted_key) {
    // bytea comes back as a \x-prefixed hex string over PostgREST.
    const hex = String(userKey.encrypted_key).replace(/^\\x/, '');
    const bytes = new Uint8Array(
      hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    return {
      apiKey: await decryptApiKey(bytes),
      usesPlatformKey: false,
      baseUrl: userKey.base_url ?? PROVIDER_BASE_URL[provider] ?? null,
    };
  }

  if (byokOnly) {
    throw new HttpError(400, 'byok_required', 'this model requires your own API key');
  }

  const envName = platformKeyEnv(provider);
  const platformKey = Deno.env.get(envName);
  if (!platformKey) {
    throw new HttpError(500, 'no_platform_key', `set the ${envName} edge function secret`);
  }

  const baseUrl = PROVIDER_BASE_URL[provider];
  if (!baseUrl) {
    throw new HttpError(500, 'unsupported_provider', `no base url configured for ${provider}`);
  }

  return { apiKey: platformKey, usesPlatformKey: true, baseUrl };
}
