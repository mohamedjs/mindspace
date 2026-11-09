/**
 * Build-time feature flags.
 *
 * Each variable is named **literally**, never built by concatenation.
 */

export interface Features {
  byok: boolean;
  webviewPlans: boolean;
}

const RAW: Record<keyof Features, string | undefined> = {
  byok: process.env.NEXT_PUBLIC_FF_BYOK ?? process.env.EXPO_PUBLIC_FF_BYOK,
  webviewPlans:
    process.env.NEXT_PUBLIC_FF_WEBVIEW_PLANS ?? process.env.EXPO_PUBLIC_FF_WEBVIEW_PLANS,
};

const flag = (name: keyof Features, fallback: boolean) => {
  const raw = RAW[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
};

export const features: Features = {
  byok: flag('byok', false),
  webviewPlans: flag('webviewPlans', true),
};
