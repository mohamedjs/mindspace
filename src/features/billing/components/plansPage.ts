import type { Palette } from '../../../shared/theme';
import type { SubscriptionPlan, ActiveSubscription } from '../api/billing.api';
import { creditsToRecordingLabel, creditsToTranscriptionLabel } from '../api/billing.api';

/**
 * The subscription page, as a self-contained HTML document.
 *
 * Rendered in a WebView rather than in native views so pricing, copy and layout
 * can change without an app-store release — the part of the product most likely
 * to be rewritten by someone who is not shipping a build that week.
 *
 * The document is generated here and handed to the WebView as a string, so
 * there is no server, no network fetch, and no offline failure: plan data comes
 * from the same `listPlans()` call the rest of the app uses. Theme colours are
 * injected from the native palette, so the page follows light/dark and the
 * user's accent exactly.
 *
 * Everything the user can press posts a message back over `ReactNativeWebView`;
 * the page itself never talks to Supabase, never sees a token, and cannot
 * navigate anywhere.
 */

/** Blocks the whole class of injection where a plan name contains markup. */
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

interface PlansPageInput {
  plans: SubscriptionPlan[];
  subscription: ActiveSubscription | null;
  colors: Palette;
  fontFamily?: string;
}

/** What a plan gives you, in the user's terms rather than the schema's. */
function benefits(plan: SubscriptionPlan): string[] {
  if (!plan.aiEnabled) {
    return [
      'Unlimited notes, sub-notes and boards',
      'Infinite canvas, groups and connections',
      'List and calendar views',
      'Reminders for anything with a date',
      'No voice recording or AI writing',
    ];
  }

  if (plan.isByok) {
    return [
      'Sticky notes written on your own GPT / Claude / Gemini key',
      `${plan.totalCredits.toLocaleString()} credits for voice → text (${creditsToTranscriptionLabel(plan.totalCredits)})`,
      `Recordings up to ${plan.maxRecordingMinutes} minutes`,
      'Everything in Free',
    ];
  }

  return [
    `${plan.totalCredits.toLocaleString()} credits a month`,
    `${creditsToRecordingLabel(plan.totalCredits)}`,
    `Recordings up to ${plan.maxRecordingMinutes} minutes`,
    'Everything in Free',
  ];
}

export function buildPlansPage({
  plans,
  subscription,
  colors,
  fontFamily = 'system-ui',
}: PlansPageInput): string {
  const cards = plans
    .map((plan) => {
      const isCurrent = plan.id === (subscription?.planId ?? 'free');
      const price = plan.priceEgp === 0 ? 'Free' : `${plan.priceEgp}`;

      return `
      <article class="card${plan.isFeatured ? ' featured' : ''}${isCurrent ? ' current' : ''}">
        <header>
          <div class="row">
            <h2>${esc(plan.name)}</h2>
            ${plan.isFeatured && !isCurrent ? '<span class="pill">Popular</span>' : ''}
            ${isCurrent ? '<span class="pill current-pill">Current plan</span>' : ''}
          </div>
          <p class="tagline">${esc(plan.tagline)}</p>
          <p class="price">
            <strong>${esc(price)}</strong>${plan.priceEgp === 0 ? '' : '<span> EGP / month</span>'}
          </p>
        </header>

        <ul>
          ${benefits(plan)
            .map(
              (b) => `<li><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg><span>${esc(b)}</span></li>`
            )
            .join('')}
        </ul>

        <button type="button" ${isCurrent ? 'disabled' : ''} data-plan="${esc(plan.id)}">
          ${isCurrent ? 'Your current plan' : plan.priceEgp === 0 ? 'Switch to Free' : `Choose ${esc(plan.name)}`}
        </button>
      </article>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
  :root {
    --board: ${colors.board};
    --surface: ${colors.surface};
    --ink: ${colors.ink};
    --muted: ${colors.muted};
    --accent: ${colors.accent};
    --on-accent: ${colors.onAccent};
    --line: ${colors.line};
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0;
    padding: 24px 18px 48px;
    background: var(--board);
    color: var(--ink);
    font-family: ${esc(fontFamily)}, system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-size: 28px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.5px; }
  .lede { color: var(--muted); font-size: 15px; line-height: 1.5; margin: 0 0 28px; }

  .card {
    background: var(--surface);
    border: 1.5px solid var(--line);
    border-radius: 22px;
    padding: 22px 20px;
    margin-bottom: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,.10);
  }
  .card.featured { border-color: var(--accent); box-shadow: 0 12px 32px rgba(0,0,0,.16); }
  .card.current  { opacity: .92; }

  .row { display: flex; align-items: center; gap: 8px; }
  h2 { font-size: 19px; margin: 0; letter-spacing: -0.2px; }
  .pill {
    font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px;
    padding: 3px 8px; border-radius: 999px; background: var(--accent); color: var(--on-accent);
  }
  .current-pill { background: transparent; color: var(--accent); border: 1.5px solid var(--accent); }
  .tagline { color: var(--muted); font-size: 13px; margin: 6px 0 0; line-height: 1.45; }
  .price { margin: 16px 0 4px; }
  .price strong { font-size: 34px; letter-spacing: -1px; }
  .price span  { color: var(--muted); font-size: 13px; font-weight: 600; }

  ul { list-style: none; margin: 18px 0 22px; padding: 0; display: grid; gap: 11px; }
  li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.45; }
  li svg { width: 17px; height: 17px; flex: none; margin-top: 1px; fill: none;
           stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }

  button {
    width: 100%; padding: 14px; border: 0; border-radius: 16px;
    background: var(--accent); color: var(--on-accent);
    font-size: 15px; font-weight: 700; font-family: inherit;
    cursor: pointer; transition: transform .1s ease, opacity .1s ease;
  }
  button:active { transform: scale(.985); opacity: .9; }
  button:disabled { background: transparent; color: var(--muted);
                    border: 1.5px solid var(--line); cursor: default; }

  .footnote { color: var(--muted); font-size: 12px; line-height: 1.6; margin-top: 26px; }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
</head>
<body>
  <h1>Think out loud</h1>
  <p class="lede">
    Every board, note and reminder is free, forever. Paid plans add the part that
    listens: talk, and MindSpace writes your thinking down as sticky notes.
  </p>

  ${cards}

  <p class="footnote">
    Credits are only spent on AI. Turning voice into text costs 6 credits a minute;
    writing the notes costs about 8 per recording. A recording that fails is never charged.
  </p>

<script>
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-plan]');
    if (!btn || btn.disabled) return;
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'choose-plan', planId: btn.dataset.plan })
    );
  });
</script>
</body>
</html>`;
}
