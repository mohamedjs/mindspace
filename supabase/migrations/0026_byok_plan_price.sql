-- ============================================================
-- MindSpace Migration 0026: "Your AI" becomes a paid plan
-- ============================================================
-- It shipped at 0 EGP, which made it free to switch onto and free to sit on.
-- At 50 EGP it earns its keep: the user still pays their own AI provider for
-- inference, and this covers the rest of the app around it.
--
-- Consequence worth knowing: a non-zero price means it now goes through the
-- normal payment flow rather than subscribe-start's activate-immediately
-- branch. It still grants 0 credits — BYOK requests never touch them.

update subscription_plans
   set price_egp = 50
 where id = 'byok';
