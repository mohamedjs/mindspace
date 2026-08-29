"""0001_baseline: squashed initial schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-08-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Enums definitions
note_type_enum = postgresql.ENUM(
    "idea",
    "task",
    "question",
    "decision",
    "reference",
    "thought",
    "summary",
    name="note_type",
    create_type=False,
)
rel_type_enum = postgresql.ENUM(
    "related",
    "depends_on",
    "supports",
    "contradicts",
    "derived_from",
    "child_of",
    name="rel_type",
    create_type=False,
)
source_type_enum = postgresql.ENUM("voice", "manual", "ai", name="source_type", create_type=False)
recording_status_enum = postgresql.ENUM(
    "recorded",
    "uploading",
    "transcribing",
    "transcribed",
    "failed",
    "extracting",
    "completed",
    name="recording_status",
    create_type=False,
)
ai_action_kind_enum = postgresql.ENUM(
    "extract_thoughts",
    "detect_relations",
    "thought_evolution",
    "weekly_digest",
    name="ai_action_kind",
    create_type=False,
)
ai_action_status_enum = postgresql.ENUM(
    "pending",
    "proposed",
    "accepted",
    "partially_accepted",
    "rejected",
    "undone",
    "failed",
    name="ai_action_status",
    create_type=False,
)
provider_id_enum = postgresql.ENUM(
    "openrouter",
    "openai",
    "google",
    "anthropic",
    "nvidia",
    "custom",
    name="provider_id",
    create_type=False,
)
model_kind_enum = postgresql.ENUM("chat", "transcribe", name="model_kind", create_type=False)
ledger_reason_enum = postgresql.ENUM(
    "signup_grant",
    "monthly_refill",
    "purchase",
    "usage",
    "refund",
    "reversal",
    "admin_adjust",
    name="ledger_reason",
    create_type=False,
)
payment_channel_enum = postgresql.ENUM(
    "google_pay", "apple_pay", "instapay", "test_pay", name="payment_channel", create_type=False
)
subscription_status_enum = postgresql.ENUM(
    "pending", "active", "cancelled", "expired", name="subscription_status", create_type=False
)


def upgrade() -> None:
    # 0. Extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # 1. Create Enums
    note_type_enum.create(op.get_bind(), checkfirst=True)
    rel_type_enum.create(op.get_bind(), checkfirst=True)
    source_type_enum.create(op.get_bind(), checkfirst=True)
    recording_status_enum.create(op.get_bind(), checkfirst=True)
    ai_action_kind_enum.create(op.get_bind(), checkfirst=True)
    ai_action_status_enum.create(op.get_bind(), checkfirst=True)
    provider_id_enum.create(op.get_bind(), checkfirst=True)
    model_kind_enum.create(op.get_bind(), checkfirst=True)
    ledger_reason_enum.create(op.get_bind(), checkfirst=True)
    payment_channel_enum.create(op.get_bind(), checkfirst=True)
    subscription_status_enum.create(op.get_bind(), checkfirst=True)

    # 2. Table: users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("encrypted_password", sa.Text(), nullable=True),
        sa.Column("email_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_anonymous", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "raw_user_meta_data",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("last_sign_in_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 3. Table: ai_models
    op.create_table(
        "ai_models",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column("provider", provider_id_enum, nullable=False),
        sa.Column("model_id", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("kind", model_kind_enum, nullable=False),
        sa.Column("input_price_m", sa.Numeric(10, 4), nullable=True),
        sa.Column("output_price_m", sa.Numeric(10, 4), nullable=True),
        sa.Column("price_per_min", sa.Numeric(10, 5), nullable=True),
        sa.Column(
            "credit_multiplier", sa.Numeric(6, 2), server_default=sa.text("1.0"), nullable=False
        ),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("byok_only", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("tier", sa.Text(), server_default=sa.text("'free'"), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("100"), nullable=False),
        sa.Column("price_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "provider", "model_id", "kind", name="uq_ai_models_provider_model_kind"
        ),
    )

    # 4. Table: profiles
    op.create_table(
        "profiles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("is_anonymous", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("credits_balance", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("credits_reserved", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("free_refill_at", sa.Date(), nullable=True),
        sa.Column(
            "chat_model_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ai_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "transcribe_model_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ai_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("timezone", sa.Text(), server_default=sa.text("'Africa/Cairo'"), nullable=False),
        sa.Column("locale", sa.Text(), server_default=sa.text("'en'"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("credits_balance >= 0", name="credits_non_negative"),
        sa.CheckConstraint("credits_reserved >= 0", name="reserved_non_negative"),
    )

    # 5. Table: refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    # 6. Table: password_reset_tokens
    op.create_table(
        "password_reset_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])

    # 7. Table: spaces
    op.create_table(
        "spaces",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("emoji", sa.Text(), server_default=sa.text("'💡'"), nullable=False),
        sa.Column(
            "canvas_zoom", sa.Float(precision=24), server_default=sa.text("1.0"), nullable=False
        ),
        sa.Column(
            "canvas_x", sa.Float(precision=24), server_default=sa.text("0.0"), nullable=False
        ),
        sa.Column(
            "canvas_y", sa.Float(precision=24), server_default=sa.text("0.0"), nullable=False
        ),
        sa.Column("note_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_spaces_user_activity",
        "spaces",
        ["user_id", sa.text("last_activity_at desc")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_spaces_user_id", "spaces", ["user_id"])

    # 8. Table: recordings
    op.create_table(
        "recordings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_path", sa.Text(), nullable=True),
        sa.Column("local_only", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.Text(), server_default=sa.text("'audio/m4a'"), nullable=False),
        sa.Column(
            "status", recording_status_enum, server_default=sa.text("'recorded'"), nullable=False
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_recordings_user_id", "recordings", ["user_id"])
    op.create_index(
        "ix_recordings_space_created", "recordings", ["space_id", sa.text("created_at desc")]
    )

    # 9. Table: transcripts
    op.create_table(
        "transcripts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recording_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recordings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("language", sa.Text(), nullable=True),
        sa.Column("provider", provider_id_enum, nullable=False),
        sa.Column("model_id", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_transcripts_user_id", "transcripts", ["user_id"])
    op.create_index("ix_transcripts_recording", "transcripts", ["recording_id"])

    # 10. Table: sticky_notes
    op.create_table(
        "sticky_notes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("type", note_type_enum, server_default=sa.text("'idea'"), nullable=False),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column("x", sa.Float(precision=24), nullable=False),
        sa.Column("y", sa.Float(precision=24), nullable=False),
        sa.Column("width", sa.Float(precision=24), server_default=sa.text("180.0"), nullable=False),
        sa.Column(
            "height", sa.Float(precision=24), server_default=sa.text("120.0"), nullable=False
        ),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sticky_notes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("z_index", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "source_type", source_type_enum, server_default=sa.text("'manual'"), nullable=False
        ),
        sa.Column(
            "recording_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recordings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "transcript_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transcripts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("span_start", sa.Integer(), nullable=True),
        sa.Column("span_end", sa.Integer(), nullable=True),
        sa.Column("ai_action_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sticky_notes_user_id", "sticky_notes", ["user_id"])
    op.create_index(
        "ix_sticky_notes_space_live",
        "sticky_notes",
        ["space_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_sticky_notes_space_xy", "sticky_notes", ["space_id", "x", "y"])
    op.create_index("ix_sticky_notes_parent", "sticky_notes", ["parent_id"])
    op.create_index("ix_sticky_notes_recording", "sticky_notes", ["recording_id"])
    op.create_index(
        "ix_sticky_notes_space_due",
        "sticky_notes",
        ["space_id", "due_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # 11. Table: relationships
    op.create_table(
        "relationships",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sticky_notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "to_note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sticky_notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", rel_type_enum, server_default=sa.text("'related'"), nullable=False),
        sa.Column("created_by", sa.Text(), server_default=sa.text("'user'"), nullable=False),
        sa.Column("ai_action_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("from_note_id <> to_note_id", name="no_self_link"),
    )
    op.create_index("ix_relationships_user_id", "relationships", ["user_id"])
    op.create_index(
        "rel_unique",
        "relationships",
        ["from_note_id", "to_note_id", "type"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # 12. Table: note_groups
    op.create_table(
        "note_groups",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("x", sa.Float(precision=24), nullable=False),
        sa.Column("y", sa.Float(precision=24), nullable=False),
        sa.Column("width", sa.Float(precision=24), server_default=sa.text("460.0"), nullable=False),
        sa.Column(
            "height", sa.Float(precision=24), server_default=sa.text("360.0"), nullable=False
        ),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_note_groups_user_id", "note_groups", ["user_id"])
    op.create_index(
        "ix_note_groups_space_live",
        "note_groups",
        ["space_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # 13. Table: ai_actions
    op.create_table(
        "ai_actions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", ai_action_kind_enum, nullable=False),
        sa.Column(
            "status", ai_action_status_enum, server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column(
            "recording_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recordings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "transcript_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transcripts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("provider", provider_id_enum, nullable=False),
        sa.Column("model_id", sa.Text(), nullable=False),
        sa.Column("prompt_version", sa.Text(), nullable=False),
        sa.Column("billed_to", sa.Text(), server_default=sa.text("'credits'"), nullable=False),
        sa.Column("credits_charged", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("raw_cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_ai_actions_space_created", "ai_actions", ["space_id", sa.text("created_at desc")]
    )
    op.create_index(
        "ix_ai_actions_user_created", "ai_actions", ["user_id", sa.text("created_at desc")]
    )

    # 14. Table: ai_action_items
    op.create_table(
        "ai_action_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ai_action_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ai_actions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("operation", sa.Text(), nullable=False),
        sa.Column(
            "target_type", sa.Text(), server_default=sa.text("'sticky_note'"), nullable=False
        ),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("forward_patch", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("inverse_patch", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("accepted", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.create_index("ix_ai_action_items_user_id", "ai_action_items", ["user_id"])
    op.create_index(
        "ix_ai_action_items_action_sort", "ai_action_items", ["ai_action_id", "sort_order"]
    )

    # 15. Table: timeline_events
    op.create_table(
        "timeline_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("ref_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_timeline_events_user_id", "timeline_events", ["user_id"])
    op.create_index(
        "ix_timeline_events_space_created",
        "timeline_events",
        ["space_id", sa.text("created_at desc")],
    )

    # 16. Table: credit_packages
    op.create_table(
        "credit_packages",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("price_egp", sa.Integer(), nullable=False),
        sa.Column("base_credits", sa.Integer(), nullable=False),
        sa.Column("bonus_pct", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "total_credits",
            sa.Integer(),
            sa.Computed("base_credits + (base_credits * bonus_pct / 100)", persisted=True),
            nullable=False,
        ),
        sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("store_product_id_ios", sa.Text(), nullable=True),
        sa.Column("store_product_id_android", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("100"), nullable=False),
    )

    # 17. Table: credit_ledger
    op.create_table(
        "credit_ledger",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("reason", ledger_reason_enum, nullable=False),
        sa.Column("ai_action_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "package_id",
            sa.Text(),
            sa.ForeignKey("credit_packages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("payment_ref", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_credit_ledger_user_created", "credit_ledger", ["user_id", sa.text("created_at desc")]
    )

    # 18. Table: credit_reservations
    op.create_table(
        "credit_reservations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), server_default=sa.text("'held'"), nullable=False),
        sa.Column("ai_action_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now() + interval '10 minutes'"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_credit_reservations_amount_positive"),
    )
    op.create_index("ix_credit_reservations_user_id", "credit_reservations", ["user_id"])
    op.create_index(
        "ix_credit_reservations_status_expires", "credit_reservations", ["status", "expires_at"]
    )

    # 19. Table: user_ai_keys
    op.create_table(
        "user_ai_keys",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", provider_id_enum, nullable=False),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("encrypted_key", sa.LargeBinary(), nullable=False),
        sa.Column("key_hint", sa.Text(), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "user_id", "provider", "label", name="uq_user_ai_keys_user_provider_label"
        ),
    )
    op.create_index("ix_user_ai_keys_user_id", "user_ai_keys", ["user_id"])

    # 20. Table: subscription_plans
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("tagline", sa.Text(), nullable=True),
        sa.Column("price_egp", sa.Integer(), nullable=False),
        sa.Column("base_credits", sa.Integer(), nullable=False),
        sa.Column("bonus_pct", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "total_credits",
            sa.Integer(),
            sa.Computed("base_credits + (base_credits * bonus_pct / 100)", persisted=True),
            nullable=False,
        ),
        sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("100"), nullable=False),
        sa.Column(
            "max_recording_minutes", sa.Integer(), server_default=sa.text("5"), nullable=False
        ),
        sa.Column("is_byok", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("ai_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )

    # 21. Table: subscriptions
    op.create_table(
        "subscriptions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plan_id", sa.Text(), sa.ForeignKey("subscription_plans.id"), nullable=False),
        sa.Column(
            "status", subscription_status_enum, server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column("channel", payment_channel_enum, nullable=False),
        sa.Column("external_ref", sa.Text(), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_subscriptions_user_status", "subscriptions", ["user_id", "status"])
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])

    # 22. Table: payments
    op.create_table(
        "payments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.func.gen_random_uuid(),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "package_id",
            sa.Text(),
            sa.ForeignKey("credit_packages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subscriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("amount_egp", sa.Integer(), nullable=False),
        sa.Column("channel", sa.Text(), nullable=False),
        sa.Column("external_ref", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("raw_receipt", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("channel", "external_ref", name="uq_payments_channel_external_ref"),
    )
    op.create_index("ix_payments_user_id", "payments", ["user_id"])


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("subscriptions")
    op.drop_table("subscription_plans")
    op.drop_table("user_ai_keys")
    op.drop_table("credit_reservations")
    op.drop_table("credit_ledger")
    op.drop_table("credit_packages")
    op.drop_table("timeline_events")
    op.drop_table("ai_action_items")
    op.drop_table("ai_actions")
    op.drop_table("note_groups")
    op.drop_table("relationships")
    op.drop_table("sticky_notes")
    op.drop_table("transcripts")
    op.drop_table("recordings")
    op.drop_table("spaces")
    op.drop_table("password_reset_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("profiles")
    op.drop_table("ai_models")
    op.drop_table("users")

    subscription_status_enum.drop(op.get_bind(), checkfirst=True)
    payment_channel_enum.drop(op.get_bind(), checkfirst=True)
    ledger_reason_enum.drop(op.get_bind(), checkfirst=True)
    model_kind_enum.drop(op.get_bind(), checkfirst=True)
    provider_id_enum.drop(op.get_bind(), checkfirst=True)
    ai_action_status_enum.drop(op.get_bind(), checkfirst=True)
    ai_action_kind_enum.drop(op.get_bind(), checkfirst=True)
    recording_status_enum.drop(op.get_bind(), checkfirst=True)
    source_type_enum.drop(op.get_bind(), checkfirst=True)
    rel_type_enum.drop(op.get_bind(), checkfirst=True)
    note_type_enum.drop(op.get_bind(), checkfirst=True)
