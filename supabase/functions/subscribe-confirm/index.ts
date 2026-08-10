import { HttpError, getUserOrThrow, json } from '../_shared/auth.ts';
import { adminClient } from '../_shared/supabase.ts';
import { paymentProviderFor } from '../_shared/payments/factory.ts';
import { ProviderNotConfiguredError } from '../_shared/payments/types.ts';

/** A month from now. Nothing renews this yet — see the migration comment. */
function periodEnd(from: Date): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + 1);
  return end;
}

/**
 * Finishes a subscription attempt.
 *
 * Order matters and is the whole point of this function:
 *
 *   1. verify with the provider — only an explicit 'verified' continues
 *   2. claim the payment row, whose unique (channel, external_ref) is what
 *      makes a retry a no-op
 *   3. only then grant credits
 *
 * Granting before recording would let a retried confirm mint credits twice,
 * and credit_ledger is append-only, so that is not something you can tidy up
 * afterwards.
 */
Deno.serve(async (req) => {
  try {
    const user = await getUserOrThrow(req);
    const admin = adminClient();

    const { subscriptionId, receipt } = await req.json();
    if (!subscriptionId) throw new HttpError(400, 'missing_params');

    const { data: subscription, error: subErr } = await admin
      .from('subscriptions')
      .select('id, user_id, plan_id, status, channel')
      .eq('id', subscriptionId)
      .single();

    if (subErr || !subscription) throw new HttpError(404, 'subscription_not_found');
    if (subscription.user_id !== user.id) throw new HttpError(403, 'forbidden');

    // Already paid for — return the current state instead of charging again.
    if (subscription.status === 'active') {
      return json({ subscriptionId, status: 'active', creditsGranted: 0, alreadyActive: true });
    }

    const { data: plan, error: planErr } = await admin
      .from('subscription_plans')
      .select('id, name, price_egp, total_credits')
      .eq('id', subscription.plan_id)
      .single();

    if (planErr || !plan) throw new HttpError(404, 'plan_not_found');

    // 1. Verify. A provider either says 'verified' or it does not; there is
    //    no third state that quietly counts as paid.
    const provider = paymentProviderFor(subscription.channel);
    const verification = await provider.verify({
      reference: subscription.id,
      amountEgp: plan.price_egp,
      receipt,
    });

    if (verification.status !== 'verified') {
      return json({ error: 'payment_not_verified', reason: verification.reason }, 402);
    }

    // Never trust the amount the client round-tripped: charge what the plan
    // costs, not what the receipt claims it cost.
    if (verification.amountEgp !== plan.price_egp) {
      return json({ error: 'amount_mismatch' }, 402);
    }

    // 2. Claim the payment. The unique (channel, external_ref) index means a
    //    second confirm for the same provider reference loses this insert,
    //    and we stop before granting anything.
    const { error: paymentErr } = await admin.from('payments').insert({
      user_id: user.id,
      subscription_id: subscription.id,
      amount_egp: plan.price_egp,
      channel: subscription.channel,
      external_ref: verification.externalRef,
      status: 'verified',
      raw_receipt: verification.raw as Record<string, unknown>,
      verified_at: new Date().toISOString(),
    });

    if (paymentErr) {
      // 23505 = unique_violation: this payment was already banked.
      if (paymentErr.code === '23505') {
        return json({ subscriptionId, status: 'active', creditsGranted: 0, alreadyActive: true });
      }
      throw new HttpError(500, 'payment_record_failed', paymentErr.message);
    }

    // 3. Grant. Revoked from client roles, so only reachable from here.
    const { error: grantErr } = await admin.rpc('grant_credits', {
      p_user: user.id,
      p_amount: plan.total_credits,
      p_reason: 'purchase',
      p_package: null,
      p_payment_ref: verification.externalRef,
    });

    if (grantErr) throw new HttpError(500, 'grant_failed', grantErr.message);

    const start = new Date();
    await admin
      .from('subscriptions')
      .update({
        status: 'active',
        external_ref: verification.externalRef,
        current_period_start: start.toISOString(),
        current_period_end: periodEnd(start).toISOString(),
      })
      .eq('id', subscription.id);

    return json({
      subscriptionId: subscription.id,
      status: 'active',
      plan: { id: plan.id, name: plan.name },
      creditsGranted: plan.total_credits,
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return json({ error: 'provider_not_configured', channel: err.channel, missing: err.missing }, 501);
    }
    if (err instanceof HttpError) return err.toResponse();
    console.error('[subscribe-confirm]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
