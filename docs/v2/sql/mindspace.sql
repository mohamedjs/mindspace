-- MindSpace v2: complete PostgreSQL schema and reference data.
-- Generated from apps/api/migrations and apps/api/seed. For PostgreSQL 18.
-- Load into an empty database:
--   createdb mindspace && psql -d mindspace -v ON_ERROR_STOP=1 -f mindspace.sql
-- The API's own migrator (apps/api/src/main.migrate.ts) remains the normal path.
--
-- PostgreSQL database dump
--

\restrict ZBMldbJESFkteg78AlvXtj6GpHgg5YvhHahDVULFFni0H3JSJWtrHfT7SGE23z0

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: ai_action_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_action_kind AS ENUM (
    'extract_thoughts',
    'detect_relations',
    'thought_evolution',
    'weekly_digest'
);


--
-- Name: ai_action_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_action_status AS ENUM (
    'pending',
    'proposed',
    'accepted',
    'partially_accepted',
    'rejected',
    'undone',
    'failed'
);


--
-- Name: ledger_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ledger_reason AS ENUM (
    'signup_grant',
    'monthly_refill',
    'purchase',
    'usage',
    'refund',
    'reversal',
    'admin_adjust'
);


--
-- Name: model_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.model_kind AS ENUM (
    'chat',
    'transcribe'
);


--
-- Name: note_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.note_type AS ENUM (
    'idea',
    'task',
    'question',
    'decision',
    'reference',
    'thought',
    'summary'
);


--
-- Name: payment_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_channel AS ENUM (
    'google_pay',
    'apple_pay',
    'instapay',
    'test_pay'
);


--
-- Name: provider_id; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.provider_id AS ENUM (
    'openrouter',
    'openai',
    'google',
    'anthropic',
    'nvidia',
    'custom'
);


--
-- Name: recording_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recording_status AS ENUM (
    'recorded',
    'uploading',
    'queued',
    'splitting',
    'transcribing',
    'transcribed',
    'extracting',
    'completed',
    'failed'
);


--
-- Name: rel_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rel_type AS ENUM (
    'related',
    'depends_on',
    'supports',
    'contradicts',
    'derived_from',
    'child_of'
);


--
-- Name: source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.source_type AS ENUM (
    'voice',
    'manual',
    'ai'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'pending',
    'active',
    'cancelled',
    'expired'
);


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_action_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_action_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ai_action_id uuid NOT NULL,
    operation text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    forward_patch jsonb NOT NULL,
    inverse_patch jsonb NOT NULL,
    accepted boolean DEFAULT true NOT NULL,
    applied_at timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: ai_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    space_id uuid NOT NULL,
    kind public.ai_action_kind NOT NULL,
    status public.ai_action_status DEFAULT 'pending'::public.ai_action_status NOT NULL,
    recording_id uuid,
    transcript_id uuid,
    provider public.provider_id NOT NULL,
    model_id text NOT NULL,
    prompt_version text NOT NULL,
    billed_to text DEFAULT 'credits'::text NOT NULL,
    credits_charged integer DEFAULT 0 NOT NULL,
    input_tokens integer,
    output_tokens integer,
    raw_cost_usd numeric(10,6),
    raw_response jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);


--
-- Name: ai_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider public.provider_id NOT NULL,
    model_id text NOT NULL,
    display_name text NOT NULL,
    kind public.model_kind NOT NULL,
    input_price_m numeric(10,4),
    output_price_m numeric(10,4),
    price_per_min numeric(10,5),
    credit_multiplier numeric(6,2) DEFAULT 1.0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    byok_only boolean DEFAULT false NOT NULL,
    tier text DEFAULT 'free'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    notes text,
    sort_order integer DEFAULT 100 NOT NULL,
    price_synced_at timestamp with time zone
);


--
-- Name: credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_ledger (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    delta integer NOT NULL,
    balance_after integer NOT NULL,
    reason public.ledger_reason NOT NULL,
    ai_action_id uuid,
    package_id text,
    payment_ref text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credit_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credit_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credit_ledger_id_seq OWNED BY public.credit_ledger.id;


--
-- Name: credit_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_packages (
    id text NOT NULL,
    name text NOT NULL,
    price_egp integer NOT NULL,
    base_credits integer NOT NULL,
    bonus_pct integer DEFAULT 0 NOT NULL,
    total_credits integer GENERATED ALWAYS AS ((base_credits + ((base_credits * bonus_pct) / 100))) STORED,
    is_featured boolean DEFAULT false NOT NULL,
    store_product_id_ios text,
    store_product_id_android text,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL
);


--
-- Name: credit_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'held'::text NOT NULL,
    ai_action_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    CONSTRAINT credit_reservations_amount_check CHECK ((amount > 0))
);


--
-- Name: note_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    space_id uuid NOT NULL,
    title text,
    x real NOT NULL,
    y real NOT NULL,
    width real DEFAULT 460 NOT NULL,
    height real DEFAULT 360 NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    package_id text,
    subscription_id uuid,
    amount_egp integer NOT NULL,
    channel text NOT NULL,
    external_ref text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    raw_receipt jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    is_anonymous boolean DEFAULT true NOT NULL,
    credits_balance integer DEFAULT 0 NOT NULL,
    credits_reserved integer DEFAULT 0 NOT NULL,
    free_refill_at date,
    chat_model_id uuid,
    transcribe_model_id uuid,
    timezone text DEFAULT 'Africa/Cairo'::text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credits_non_negative CHECK ((credits_balance >= 0)),
    CONSTRAINT reserved_non_negative CHECK ((credits_reserved >= 0))
);


--
-- Name: recording_parts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recording_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recording_id uuid NOT NULL,
    user_id uuid NOT NULL,
    idx integer NOT NULL,
    blob_key text NOT NULL,
    duration_ms integer,
    status text DEFAULT 'uploaded'::text NOT NULL,
    transcript_text text,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recordings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    space_id uuid NOT NULL,
    storage_path text,
    local_only boolean DEFAULT true NOT NULL,
    duration_ms integer NOT NULL,
    size_bytes integer,
    mime_type text DEFAULT 'audio/m4a'::text NOT NULL,
    status public.recording_status DEFAULT 'recorded'::public.recording_status NOT NULL,
    error text,
    claimed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    process_mode text,
    target_note_id uuid,
    parent_note_id uuid,
    kind text DEFAULT 'note'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    family_id uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    space_id uuid NOT NULL,
    from_note_id uuid NOT NULL,
    to_note_id uuid NOT NULL,
    type public.rel_type DEFAULT 'related'::public.rel_type NOT NULL,
    created_by text DEFAULT 'user'::text NOT NULL,
    ai_action_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT no_self_link CHECK ((from_note_id <> to_note_id))
);


--
-- Name: spaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    emoji text DEFAULT '💡'::text NOT NULL,
    canvas_zoom real DEFAULT 1 NOT NULL,
    canvas_x real DEFAULT 0 NOT NULL,
    canvas_y real DEFAULT 0 NOT NULL,
    note_count integer DEFAULT 0 NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sticky_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sticky_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    space_id uuid NOT NULL,
    title text,
    content text NOT NULL,
    type public.note_type DEFAULT 'idea'::public.note_type NOT NULL,
    color text,
    x real NOT NULL,
    y real NOT NULL,
    width real DEFAULT 180 NOT NULL,
    height real DEFAULT 120 NOT NULL,
    parent_id uuid,
    z_index integer DEFAULT 0 NOT NULL,
    source_type public.source_type DEFAULT 'manual'::public.source_type NOT NULL,
    recording_id uuid,
    transcript_id uuid,
    span_start integer,
    span_end integer,
    ai_action_id uuid,
    due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id text NOT NULL,
    name text NOT NULL,
    tagline text,
    price_egp integer NOT NULL,
    base_credits integer NOT NULL,
    bonus_pct integer DEFAULT 0 NOT NULL,
    total_credits integer GENERATED ALWAYS AS ((base_credits + ((base_credits * bonus_pct) / 100))) STORED,
    is_featured boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    max_recording_minutes integer DEFAULT 5 NOT NULL,
    is_byok boolean DEFAULT false NOT NULL,
    ai_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_id text NOT NULL,
    status public.subscription_status DEFAULT 'pending'::public.subscription_status NOT NULL,
    channel public.payment_channel NOT NULL,
    external_ref text,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone
);


--
-- Name: timeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    space_id uuid NOT NULL,
    type text NOT NULL,
    ref_id uuid,
    summary text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transcripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recording_id uuid NOT NULL,
    text text NOT NULL,
    language text,
    provider public.provider_id NOT NULL,
    model_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_ai_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider public.provider_id NOT NULL,
    label text,
    encrypted_key bytea NOT NULL,
    key_hint text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_used_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext,
    password_hash text,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger ALTER COLUMN id SET DEFAULT nextval('public.credit_ledger_id_seq'::regclass);


--
-- Data for Name: ai_action_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_action_items (id, user_id, ai_action_id, operation, target_type, target_id, forward_patch, inverse_patch, accepted, applied_at, sort_order) FROM stdin;
\.


--
-- Data for Name: ai_actions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_actions (id, user_id, space_id, kind, status, recording_id, transcript_id, provider, model_id, prompt_version, billed_to, credits_charged, input_tokens, output_tokens, raw_cost_usd, raw_response, error, created_at, resolved_at) FROM stdin;
\.


--
-- Data for Name: ai_models; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_models (id, provider, model_id, display_name, kind, input_price_m, output_price_m, price_per_min, credit_multiplier, is_default, byok_only, tier, enabled, notes, sort_order, price_synced_at) FROM stdin;
de7cecef-0432-436d-9579-77eeabcbe6d2	openrouter	deepseek/deepseek-v4-flash	DeepSeek V4 Flash	chat	0.1400	0.2800	\N	1.00	t	f	free	t	\N	10	\N
490cba29-d8d6-424a-bbd8-55ca6377143e	openrouter	qwen/qwen3.7-flash	Qwen 3.7 Flash	chat	0.0300	0.1300	\N	0.50	f	f	free	t	\N	20	\N
6bc5cc07-3ee9-487b-87d3-306354186fa5	openrouter	google/gemini-3.1-flash-lite-preview	Gemini 3.1 Flash Lite	chat	0.2500	1.5000	\N	1.50	f	f	free	t	\N	30	\N
a187c97b-abb3-4793-9fbf-62bf11729cf3	openrouter	moonshotai/kimi-k2.5	Kimi K2.5	chat	0.5700	2.8500	\N	3.00	f	f	paid	t	\N	40	\N
f7116ef0-8f67-45d8-adad-8ca16af4cd87	openrouter	z-ai/glm-5	GLM-5	chat	0.9500	2.5500	\N	3.00	f	f	paid	t	\N	50	\N
f2d2617a-9032-4e29-af1e-4325a2394a07	openrouter	google/gemini-2.5-flash	Gemini 2.5 Flash	transcribe	\N	\N	0.00100	1.00	t	f	free	t	\N	10	\N
ec7abcd1-13e5-4ea7-8248-d9a0d61a7b7b	openrouter	google/gemini-2.5-flash-lite	Gemini 2.5 Flash Lite (cheapest)	transcribe	\N	\N	0.00030	0.50	f	f	free	t	\N	20	\N
4fc84faf-13eb-4eb5-8014-e9305986da87	openrouter	google/gemini-3.1-flash-lite-preview	Gemini 3.1 Flash Lite	transcribe	\N	\N	0.00050	0.70	f	f	free	t	\N	30	\N
f724b929-5e22-442c-95b9-75d6f23f9745	openrouter	google/gemini-3-flash-preview	Gemini 3 Flash	transcribe	\N	\N	0.00100	1.00	f	f	free	t	\N	40	\N
85c58504-4037-4273-844c-29a428a52c27	openrouter	google/gemini-2.5-pro	Gemini 2.5 Pro (most accurate)	transcribe	\N	\N	0.00130	1.50	f	f	paid	t	\N	50	\N
22c686be-5f76-4015-be48-e21896fc94b6	anthropic	claude-opus-5	Claude Opus 5 (your key)	chat	5.0000	25.0000	\N	1.00	f	t	paid	t	\N	200	\N
8527f915-3f6f-4328-a477-b45651bb0b04	anthropic	claude-sonnet-5	Claude Sonnet 5 (your key)	chat	3.0000	15.0000	\N	1.00	f	t	paid	t	\N	210	\N
6cc49e77-4e88-434a-8dee-75fec56d8c1c	anthropic	claude-haiku-4-5	Claude Haiku 4.5 (your key)	chat	1.0000	5.0000	\N	1.00	f	t	paid	t	\N	220	\N
40f56c2f-721e-4d8d-9225-e527762d2db2	openai	gpt-5.2	GPT-5.2 (your key)	chat	1.2500	10.0000	\N	1.00	f	t	paid	t	\N	230	\N
0b955592-8e9a-4212-ba07-f96a6139bb04	openai	gpt-5.2-mini	GPT-5.2 mini (your key)	chat	0.2500	2.0000	\N	1.00	f	t	paid	t	\N	240	\N
1dda72b7-27dc-4ca7-acfb-73a619c7e1b0	google	gemini-3-pro	Gemini 3 Pro (your key)	chat	1.2500	10.0000	\N	1.00	f	t	paid	t	\N	250	\N
733fd094-7fa2-45f6-8af2-59668979c383	google	gemini-3-flash	Gemini 3 Flash (your key)	chat	0.3000	2.5000	\N	1.00	f	t	paid	t	\N	260	\N
c55cb91d-6283-473d-abe4-7c802bac2c57	openai	whisper-1	Whisper (your key)	transcribe	\N	\N	0.00600	1.00	f	t	paid	f	\N	200	\N
ea0f617e-a274-4f2c-911a-9094c62896bc	openai	gpt-4o-mini-transcribe	GPT-4o mini STT (your key)	transcribe	\N	\N	0.00300	1.00	f	t	paid	f	\N	210	\N
0e830987-7f44-4f7b-848e-44ab2362d8f8	google	gemini-3-flash	Gemini 3 Flash (your key)	transcribe	\N	\N	0.00200	1.00	f	t	paid	f	\N	220	\N
\.


--
-- Data for Name: credit_ledger; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.credit_ledger (id, user_id, delta, balance_after, reason, ai_action_id, package_id, payment_ref, meta, created_at) FROM stdin;
\.


--
-- Data for Name: credit_packages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.credit_packages (id, name, price_egp, base_credits, bonus_pct, is_featured, store_product_id_ios, store_product_id_android, enabled, sort_order) FROM stdin;
starter_50	Starter	50	500	10	f	\N	\N	t	10
regular_100	Regular	100	1000	20	t	\N	\N	t	20
pro_250	Pro	250	2500	30	f	\N	\N	t	30
max_500	Max	500	5000	40	f	\N	\N	t	40
\.


--
-- Data for Name: credit_reservations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.credit_reservations (id, user_id, amount, status, ai_action_id, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: note_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.note_groups (id, user_id, space_id, title, x, y, width, height, color, created_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, user_id, package_id, subscription_id, amount_egp, channel, external_ref, status, raw_receipt, created_at, verified_at) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, display_name, is_anonymous, credits_balance, credits_reserved, free_refill_at, chat_model_id, transcribe_model_id, timezone, locale, created_at) FROM stdin;
\.


--
-- Data for Name: recording_parts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recording_parts (id, recording_id, user_id, idx, blob_key, duration_ms, status, transcript_text, attempts, error, created_at) FROM stdin;
\.


--
-- Data for Name: recordings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recordings (id, user_id, space_id, storage_path, local_only, duration_ms, size_bytes, mime_type, status, error, claimed_at, attempts, process_mode, target_note_id, parent_note_id, kind, created_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, family_id, expires_at, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: relationships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.relationships (id, user_id, space_id, from_note_id, to_note_id, type, created_by, ai_action_id, created_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: spaces; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.spaces (id, user_id, name, emoji, canvas_zoom, canvas_x, canvas_y, note_count, last_activity_at, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: sticky_notes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sticky_notes (id, user_id, space_id, title, content, type, color, x, y, width, height, parent_id, z_index, source_type, recording_id, transcript_id, span_start, span_end, ai_action_id, due_at, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscription_plans (id, name, tagline, price_egp, base_credits, bonus_pct, is_featured, enabled, sort_order, max_recording_minutes, is_byok, ai_enabled) FROM stdin;
free	Free	Every board, every note — think it through yourself	0	0	0	f	t	5	0	f	f
hobby	Hobby	For the odd thought worth keeping	50	500	25	f	t	10	15	f	t
plus	Plus	A habit, not an experiment	150	1500	35	t	t	20	30	f	t
pro	Pro	Thinking out loud every day	300	3000	50	f	t	30	60	f	t
max	Max	Everything, all of it, no counting	500	5000	60	f	t	40	120	f	t
byok	Your AI	Your key for the thinking, our credits for the listening	50	900	0	f	t	50	120	t	t
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscriptions (id, user_id, plan_id, status, channel, external_ref, current_period_start, current_period_end, created_at, cancelled_at) FROM stdin;
\.


--
-- Data for Name: timeline_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.timeline_events (id, user_id, space_id, type, ref_id, summary, created_at) FROM stdin;
\.


--
-- Data for Name: transcripts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transcripts (id, user_id, recording_id, text, language, provider, model_id, created_at) FROM stdin;
\.


--
-- Data for Name: user_ai_keys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_ai_keys (id, user_id, provider, label, encrypted_key, key_hint, is_active, last_used_at, last_error, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, display_name, created_at, updated_at) FROM stdin;
\.


--
-- Name: credit_ledger_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.credit_ledger_id_seq', 1, false);


--
-- Name: ai_action_items ai_action_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_action_items
    ADD CONSTRAINT ai_action_items_pkey PRIMARY KEY (id);


--
-- Name: ai_actions ai_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_pkey PRIMARY KEY (id);


--
-- Name: ai_models ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_pkey PRIMARY KEY (id);


--
-- Name: ai_models ai_models_provider_model_id_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_provider_model_id_kind_key UNIQUE (provider, model_id, kind);


--
-- Name: credit_ledger credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: credit_packages credit_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_packages
    ADD CONSTRAINT credit_packages_pkey PRIMARY KEY (id);


--
-- Name: credit_reservations credit_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_reservations
    ADD CONSTRAINT credit_reservations_pkey PRIMARY KEY (id);


--
-- Name: note_groups note_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_groups
    ADD CONSTRAINT note_groups_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: payments payments_channel_external_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_channel_external_ref_key UNIQUE (channel, external_ref);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: recording_parts recording_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_parts
    ADD CONSTRAINT recording_parts_pkey PRIMARY KEY (id);


--
-- Name: recording_parts recording_parts_recording_id_idx_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_parts
    ADD CONSTRAINT recording_parts_recording_id_idx_key UNIQUE (recording_id, idx);


--
-- Name: recordings recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: spaces spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spaces
    ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);


--
-- Name: sticky_notes sticky_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT sticky_notes_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: timeline_events timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_events
    ADD CONSTRAINT timeline_events_pkey PRIMARY KEY (id);


--
-- Name: transcripts transcripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_pkey PRIMARY KEY (id);


--
-- Name: user_ai_keys user_ai_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_keys
    ADD CONSTRAINT user_ai_keys_pkey PRIMARY KEY (id);


--
-- Name: user_ai_keys user_ai_keys_user_id_provider_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_keys
    ADD CONSTRAINT user_ai_keys_user_id_provider_label_key UNIQUE (user_id, provider, label);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_ai_action_items_action_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_action_items_action_sort ON public.ai_action_items USING btree (ai_action_id, sort_order);


--
-- Name: ix_ai_actions_space_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_actions_space_created ON public.ai_actions USING btree (space_id, created_at DESC);


--
-- Name: ix_ai_actions_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_actions_user_created ON public.ai_actions USING btree (user_id, created_at DESC);


--
-- Name: ix_credit_ledger_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_credit_ledger_user_created ON public.credit_ledger USING btree (user_id, created_at DESC);


--
-- Name: ix_credit_reservations_status_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_credit_reservations_status_expires ON public.credit_reservations USING btree (status, expires_at);


--
-- Name: ix_note_groups_space_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_note_groups_space_live ON public.note_groups USING btree (space_id) WHERE (deleted_at IS NULL);


--
-- Name: ix_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: ix_recording_parts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_recording_parts_user_id ON public.recording_parts USING btree (user_id);


--
-- Name: ix_recordings_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_recordings_pending ON public.recordings USING btree (created_at) WHERE (status = 'queued'::public.recording_status);


--
-- Name: ix_recordings_space_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_recordings_space_created ON public.recordings USING btree (space_id, created_at DESC);


--
-- Name: ix_refresh_tokens_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_tokens_family_id ON public.refresh_tokens USING btree (family_id);


--
-- Name: ix_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: ix_spaces_user_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_spaces_user_activity ON public.spaces USING btree (user_id, last_activity_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: ix_sticky_notes_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sticky_notes_parent ON public.sticky_notes USING btree (parent_id);


--
-- Name: ix_sticky_notes_recording; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sticky_notes_recording ON public.sticky_notes USING btree (recording_id);


--
-- Name: ix_sticky_notes_space_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sticky_notes_space_due ON public.sticky_notes USING btree (space_id, due_at) WHERE (deleted_at IS NULL);


--
-- Name: ix_sticky_notes_space_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sticky_notes_space_live ON public.sticky_notes USING btree (space_id) WHERE (deleted_at IS NULL);


--
-- Name: ix_sticky_notes_space_xy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sticky_notes_space_xy ON public.sticky_notes USING btree (space_id, x, y);


--
-- Name: ix_subscriptions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_subscriptions_user_status ON public.subscriptions USING btree (user_id, status);


--
-- Name: ix_timeline_events_space_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_timeline_events_space_created ON public.timeline_events USING btree (space_id, created_at DESC);


--
-- Name: ix_transcripts_recording; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transcripts_recording ON public.transcripts USING btree (recording_id);


--
-- Name: rel_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rel_unique ON public.relationships USING btree (from_note_id, to_note_id, type) WHERE (deleted_at IS NULL);


--
-- Name: ux_user_ai_keys_active_per_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_user_ai_keys_active_per_provider ON public.user_ai_keys USING btree (user_id, provider) WHERE (is_active = true);


--
-- Name: sticky_notes t_notes_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_notes_touch BEFORE UPDATE ON public.sticky_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: spaces t_spaces_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_spaces_touch BEFORE UPDATE ON public.spaces FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: users t_users_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_users_touch BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: ai_action_items ai_action_items_ai_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_action_items
    ADD CONSTRAINT ai_action_items_ai_action_id_fkey FOREIGN KEY (ai_action_id) REFERENCES public.ai_actions(id) ON DELETE CASCADE;


--
-- Name: ai_action_items ai_action_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_action_items
    ADD CONSTRAINT ai_action_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_actions ai_actions_recording_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE SET NULL;


--
-- Name: ai_actions ai_actions_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: ai_actions ai_actions_transcript_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_transcript_id_fkey FOREIGN KEY (transcript_id) REFERENCES public.transcripts(id) ON DELETE SET NULL;


--
-- Name: ai_actions ai_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: credit_ledger credit_ledger_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.credit_packages(id);


--
-- Name: credit_ledger credit_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: credit_reservations credit_reservations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_reservations
    ADD CONSTRAINT credit_reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recordings fk_recordings_parent_note; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT fk_recordings_parent_note FOREIGN KEY (parent_note_id) REFERENCES public.sticky_notes(id) ON DELETE SET NULL;


--
-- Name: recordings fk_recordings_target_note; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT fk_recordings_target_note FOREIGN KEY (target_note_id) REFERENCES public.sticky_notes(id) ON DELETE SET NULL;


--
-- Name: note_groups note_groups_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_groups
    ADD CONSTRAINT note_groups_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: note_groups note_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_groups
    ADD CONSTRAINT note_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.credit_packages(id);


--
-- Name: payments payments_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_chat_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_chat_model_id_fkey FOREIGN KEY (chat_model_id) REFERENCES public.ai_models(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_transcribe_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_transcribe_model_id_fkey FOREIGN KEY (transcribe_model_id) REFERENCES public.ai_models(id);


--
-- Name: recording_parts recording_parts_recording_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_parts
    ADD CONSTRAINT recording_parts_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE CASCADE;


--
-- Name: recording_parts recording_parts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recording_parts
    ADD CONSTRAINT recording_parts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recordings recordings_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: recordings recordings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_from_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_from_note_id_fkey FOREIGN KEY (from_note_id) REFERENCES public.sticky_notes(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_to_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_to_note_id_fkey FOREIGN KEY (to_note_id) REFERENCES public.sticky_notes(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: spaces spaces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spaces
    ADD CONSTRAINT spaces_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sticky_notes sticky_notes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT sticky_notes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.sticky_notes(id) ON DELETE SET NULL;


--
-- Name: sticky_notes sticky_notes_recording_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT sticky_notes_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE SET NULL;


--
-- Name: sticky_notes sticky_notes_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT sticky_notes_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: sticky_notes sticky_notes_transcript_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT sticky_notes_transcript_id_fkey FOREIGN KEY (transcript_id) REFERENCES public.transcripts(id) ON DELETE SET NULL;


--
-- Name: sticky_notes sticky_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT sticky_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: timeline_events timeline_events_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_events
    ADD CONSTRAINT timeline_events_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: timeline_events timeline_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_events
    ADD CONSTRAINT timeline_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transcripts transcripts_recording_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE CASCADE;


--
-- Name: transcripts transcripts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_ai_keys user_ai_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_keys
    ADD CONSTRAINT user_ai_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ZBMldbJESFkteg78AlvXtj6GpHgg5YvhHahDVULFFni0H3JSJWtrHfT7SGE23z0

