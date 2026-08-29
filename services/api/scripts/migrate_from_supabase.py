"""Supabase to native PostgreSQL ETL migration script.

Usage:
    python scripts/migrate_from_supabase.py --src-url "$SUPABASE_DB_URL" --dst-url "$DATABASE_URL"
"""

import argparse
import asyncio
import logging
import os
import sys

import asyncpg

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("etl_migrate")

CATALOGUE_TABLES = [
    "ai_models",
    "credit_packages",
    "subscription_plans",
]

DATA_TABLES = [
    "profiles",
    "spaces",
    "recordings",
    "transcripts",
    "sticky_notes",
    "relationships",
    "note_groups",
    "ai_actions",
    "ai_action_items",
    "timeline_events",
    "user_ai_keys",
    "credit_ledger",
    "credit_reservations",
    "subscriptions",
    "payments",
]


async def run_migration(src_url: str, dst_url: str) -> None:
    logger.info("Connecting to source (Supabase) and destination (PostgreSQL)...")
    src_conn = await asyncpg.connect(src_url)
    dst_conn = await asyncpg.connect(dst_url)

    try:
        # Step 0: Record source counts
        src_users_count = await src_conn.fetchval("SELECT count(*) FROM auth.users")
        src_notes_count = await src_conn.fetchval("SELECT count(*) FROM public.sticky_notes")
        src_credits_sum = await src_conn.fetchval(
            "SELECT coalesce(sum(credits_balance), 0) FROM public.profiles"
        )

        logger.info(
            "Source metrics: users=%d, sticky_notes=%d, sum(credits_balance)=%s",
            src_users_count,
            src_notes_count,
            src_credits_sum,
        )

        # Step 1: Migrate Catalogue Tables
        for table in CATALOGUE_TABLES:
            rows = await src_conn.fetch(f"SELECT * FROM public.{table}")
            logger.info("Migrating catalogue table '%s' (%d rows)...", table, len(rows))
            if rows:
                cols = list(rows[0].keys())
                # Exclude generated column total_credits if present
                insert_cols = [c for c in cols if c != "total_credits"]
                placeholders = ", ".join(f"${i + 1}" for i in range(len(insert_cols)))
                col_names = ", ".join(insert_cols)
                stmt = f"INSERT INTO public.{table} ({col_names}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
                records = [[r[c] for c in insert_cols] for r in rows]
                await dst_conn.executemany(stmt, records)

        # Step 2: Transform and Migrate auth.users -> users
        user_rows = await src_conn.fetch("""
            SELECT id, email, encrypted_password, email_confirmed_at,
                   coalesce(is_anonymous, false) as is_anonymous,
                   coalesce(raw_user_meta_data, '{}'::jsonb) as raw_user_meta_data,
                   created_at, updated_at, last_sign_in_at
            FROM auth.users
        """)
        logger.info("Migrating %d users from auth.users -> users...", len(user_rows))
        if user_rows:
            user_stmt = """
                INSERT INTO public.users (
                    id, email, encrypted_password, email_confirmed_at,
                    is_anonymous, raw_user_meta_data, created_at, updated_at, last_sign_in_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    encrypted_password = EXCLUDED.encrypted_password,
                    email_confirmed_at = EXCLUDED.email_confirmed_at,
                    is_anonymous = EXCLUDED.is_anonymous,
                    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
                    updated_at = EXCLUDED.updated_at,
                    last_sign_in_at = EXCLUDED.last_sign_in_at
            """
            user_records = [
                [
                    r["id"],
                    r["email"],
                    r["encrypted_password"],
                    r["email_confirmed_at"],
                    r["is_anonymous"],
                    r["raw_user_meta_data"],
                    r["created_at"],
                    r["updated_at"],
                    r["last_sign_in_at"],
                ]
                for r in user_rows
            ]
            await dst_conn.executemany(user_stmt, user_records)

        # Step 3: Migrate Owned Data Tables in Topological Order
        for table in DATA_TABLES:
            rows = await src_conn.fetch(f"SELECT * FROM public.{table}")
            logger.info("Migrating table '%s' (%d rows)...", table, len(rows))
            if rows:
                cols = list(rows[0].keys())
                insert_cols = [c for c in cols if c != "total_credits"]
                placeholders = ", ".join(f"${i + 1}" for i in range(len(insert_cols)))
                col_names = ", ".join(insert_cols)
                stmt = f"INSERT INTO public.{table} ({col_names}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
                records = [[r[c] for c in insert_cols] for r in rows]
                await dst_conn.executemany(stmt, records)

        # Step 4: Advance credit_ledger identity sequence
        await dst_conn.execute("""
            SELECT setval(
                pg_get_serial_sequence('credit_ledger', 'id'),
                coalesce((SELECT max(id) FROM credit_ledger), 1)
            )
        """)

        # Step 5: Verification
        dst_users_count = await dst_conn.fetchval("SELECT count(*) FROM public.users")
        dst_notes_count = await dst_conn.fetchval("SELECT count(*) FROM public.sticky_notes")
        dst_credits_sum = await dst_conn.fetchval(
            "SELECT coalesce(sum(credits_balance), 0) FROM public.profiles"
        )

        logger.info(
            "Destination metrics: users=%d (expected %d), sticky_notes=%d (expected %d), sum(credits_balance)=%s (expected %s)",
            dst_users_count,
            src_users_count,
            dst_notes_count,
            src_notes_count,
            dst_credits_sum,
            src_credits_sum,
        )

        assert dst_users_count >= src_users_count, (
            f"Users mismatch: {dst_users_count} < {src_users_count}"
        )
        assert dst_notes_count >= src_notes_count, (
            f"Sticky notes mismatch: {dst_notes_count} < {src_notes_count}"
        )
        assert dst_credits_sum >= src_credits_sum, (
            f"Credits balance mismatch: {dst_credits_sum} < {src_credits_sum}"
        )

        logger.info("Migration ETL verified and completed successfully!")

    finally:
        await src_conn.close()
        await dst_conn.close()


def main():
    parser = argparse.ArgumentParser(description="Migrate Supabase data to native PostgreSQL")
    parser.add_argument(
        "--src-url",
        default=os.getenv("SUPABASE_DB_URL"),
        help="Source Supabase PostgreSQL connection URL",
    )
    parser.add_argument(
        "--dst-url",
        default=os.getenv(
            "DATABASE_URL", "postgresql://mindspace:mindspace@localhost:5432/mindspace"
        ),
        help="Destination PostgreSQL connection URL",
    )
    args = parser.parse_args()

    if not args.src_url:
        logger.error("Missing source database URL (--src-url or SUPABASE_DB_URL)")
        sys.exit(1)

    clean_dst_url = args.dst_url.replace("postgresql+asyncpg://", "postgresql://")
    clean_src_url = args.src_url.replace("postgresql+asyncpg://", "postgresql://")

    asyncio.run(run_migration(clean_src_url, clean_dst_url))


if __name__ == "__main__":
    main()
