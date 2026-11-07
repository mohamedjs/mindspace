export const BYOK_PROVIDERS = ['openai', 'anthropic', 'google'] as const;

export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export function isByokProvider(value: unknown): value is ByokProvider {
  return typeof value === 'string' && (BYOK_PROVIDERS as readonly string[]).includes(value);
}

export const PROVIDER_BASE_URL: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

export interface UserKeySummary {
  id: string;
  provider: string;
  label: string | null;
  key_hint: string;
  is_active: boolean;
  last_error: string | null;
  created_at: string;
}

export interface ResolvedKey {
  apiKey: string;
  /** BYOK requests are free; platform-key requests reserve/settle credits. */
  usesPlatformKey: boolean;
  baseUrl: string;
}
