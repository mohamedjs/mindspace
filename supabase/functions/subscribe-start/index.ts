import { HttpError, getUserOrThrow, json } from '../_shared/auth.ts';
import { adminClient } from '../_shared/supabase.ts';
import { paymentProviderFor, listProviders } from '../_shared/payments/factory.ts';
import { ProviderNotConfiguredError } from '../_shared/payments/types.ts';

/**
 * Opens a subscription attempt.
 *
 * Creates the subscription row as `pending` and hands back whatever the
 * chosen provider needs to put a payment sheet on screen. Nothing is granted
 * here — credits only move in subscribe-confirm, after verification.
 *
 * GET (no body) returns the channel list so the client can grey out the ones
 * this deployment has no credentials for.
 */
Deno.serve(async (req) => {
  try {
    const user = await getUserOrThrow(req);
    const admin = adminClient();

    if (req.method === 'GET') {
      return json({ providers: listProviders() });
    }

    const { planId, channel } = await req.json();
    if (!planId) throw new HttpError(400, 'missing_params');

    const { data: plan, error: planErr } = await admin
      .from('subscription_plans')
      .select('id, name, price_egp, total_credits, enabled, is_byok')
      .eq('id', planId)
      .single();

    if (planErr || !plan) throw new HttpError(404, 'plan_not_found');
    if (!plan.enabled) throw new HttpError(400, 'plan_disabled');

    // A free plan ("Your AI") has nothing to charge, so it never reaches a
    // payment provider. It also must not write a payments row: channel and
    // external_ref are NOT NULL there, and there is no payment to record.
    if (plan.price_egp === 0) {
      const start = new Date();
      const end = new Date(start);
      end.setFullYear(end.getFullYear() + 100); // effectively no expiry

      const { data: freeSub, error: freeErr } = await admin
        .from('subscriptions')
        .insert({
          user_id: user.id,
          plan_id: plan.id,
          status: 'active',
          channel: 'test_pay', // column is NOT NULL; nothing reads it for free plans
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
        })
        .select('id')
        .single();

      if (freeErr || !freeSub) {
        throw new HttpError(500, 'subscription_create_failed', freeErr?.message);
      }

      return json({
        subscriptionId: freeSub.id,
        free: true,
        plan: { id: plan.id, name: plan.name, priceEgp: 0, credits: 0 },
      });
    }

    if (!channel) throw new HttpError(400, 'missing_params');
    const provider = paymentProviderFor(channel);

    // The row exists before the payment sheet opens so a completed payment
    // always has somewhere to land, even if the app dies mid-flow.
    const { data: subscription, error: subErr } = await admin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        status: 'pending',
        channel,
      })
      .select('id')
      .single();

    if (subErr || !subscription) {
      throw new HttpError(500, 'subscription_create_failed', subErr?.message);
    }

    // Our own id for the attempt. Providers echo it back where they can, and
    // it is half of the (channel, external_ref) key that makes confirm
    // idempotent.
    const reference = `${subscription.id}`;

    const intent = await provider.createCharge({
      userId: user.id,
      planId: plan.id,
      amountEgp: plan.price_egp,
      reference,
    });

    return json({
      subscriptionId: subscription.id,
      reference,
      plan: { id: plan.id, name: plan.name, priceEgp: plan.price_egp, credits: plan.total_credits },
      intent,
    });
  } catch (err) {
    // A scaffolded provider surfaces as a clear 501 rather than a 500, so the
    // client can say "not available yet" instead of "something went wrong".
    if (err instanceof ProviderNotConfiguredError) {
      return json({ error: 'provider_not_configured', channel: err.channel, missing: err.missing }, 501);
    }
    if (err instanceof HttpError) return err.toResponse();
    console.error('[subscribe-start]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
