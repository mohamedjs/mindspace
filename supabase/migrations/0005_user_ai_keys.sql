-- ============================================================
-- MindSpace Migration 0005: User AI Keys (BYOK)
-- ============================================================
create table user_ai_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  provider      provider_id not null,
  label         text,
  encrypted_key bytea not null,
  key_hint      text not null,
  base_url      text,
  is_active     boolean not null default true,
  last_used_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (user_id, provider, label)
);

-- The client must NEVER be able to read the encrypted key blob
revoke select (encrypted_key) on user_ai_keys from authenticated;
