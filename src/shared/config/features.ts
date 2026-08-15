/**
 * Build-time feature flags.
 *
 * One place to switch a half-finished feature off without deleting it. A flag
 * here is a promise that the code behind it still compiles and still has its
 * tests — dead code that only survives because nobody runs it is worse than
 * deleted code.
 *
 * Read them through `features`, never `process.env` directly: the indirection
 * is what lets a test flip one, and what keeps the default in a single place
 * rather than scattered across `?? true` fallbacks.
 */

export interface Features {
  /**
   * "Your AI" — the plan where sticky notes run on the user's own OpenAI /
   * Anthropic / Google key.
   *
   * Off by default. The plan, the key screen, the model filtering and the
   * server-side split billing are all built, but no provider path has ever been
   * exercised with a live key, so shipping it would be selling something
   * unverified. Flip it on once each provider has been round-tripped for real.
   */
  byok: boolean;

  /**
   * Render the subscription screen as a styled web page instead of native
   * views, so pricing and copy can change without an app release.
   */
  webviewPlans: boolean;
}

/**
 * Each variable is named **literally**, never built by concatenation.
 *
 * Metro inlines `process.env.EXPO_PUBLIC_*` by scanning the source for exact
 * member expressions. `process.env[`EXPO_PUBLIC_FF_${name}`]` survives
 * type-checking and bundling and then reads `undefined` on device forever — the
 * flag silently sticks on its default and no amount of setting the variable
 * changes anything.
 */
const RAW: Record<keyof Features, string | undefined> = {
  byok: process.env.EXPO_PUBLIC_FF_BYOK,
  webviewPlans: process.env.EXPO_PUBLIC_FF_WEBVIEW_PLANS,
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
