from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models import SubscriptionPlan

PLANS = [
    {
        "id": "free",
        "name": "Free",
        "tagline": "Essential voice notes with basic transcription",
        "price_egp": 0,
        "base_credits": 0,
        "bonus_pct": 0,
        "sort_order": 10,
        "max_recording_minutes": 5,
        "is_byok": False,
        "ai_enabled": False,
        "is_featured": False,
        "enabled": True,
    },
    {
        "id": "hobby",
        "name": "Hobby",
        "tagline": "Ideal for students and casual thinkers",
        "price_egp": 50,
        "base_credits": 500,
        "bonus_pct": 25,
        "sort_order": 20,
        "max_recording_minutes": 15,
        "is_byok": False,
        "ai_enabled": True,
        "is_featured": False,
        "enabled": True,
    },
    {
        "id": "plus",
        "name": "Plus",
        "tagline": "For active thinkers and daily note takers",
        "price_egp": 150,
        "base_credits": 1500,
        "bonus_pct": 35,
        "sort_order": 30,
        "max_recording_minutes": 30,
        "is_byok": False,
        "ai_enabled": True,
        "is_featured": True,
        "enabled": True,
    },
    {
        "id": "pro",
        "name": "Pro",
        "tagline": "For power users, researchers, and creators",
        "price_egp": 300,
        "base_credits": 3000,
        "bonus_pct": 50,
        "sort_order": 40,
        "max_recording_minutes": 60,
        "is_byok": False,
        "ai_enabled": True,
        "is_featured": False,
        "enabled": True,
    },
    {
        "id": "max",
        "name": "Max",
        "tagline": "Maximum limits for heavy voice workflows",
        "price_egp": 500,
        "base_credits": 5000,
        "bonus_pct": 60,
        "sort_order": 50,
        "max_recording_minutes": 120,
        "is_byok": False,
        "ai_enabled": True,
        "is_featured": False,
        "enabled": True,
    },
    {
        "id": "byok",
        "name": "BYOK",
        "tagline": "Bring your own API keys for unlimited usage",
        "price_egp": 50,
        "base_credits": 900,
        "bonus_pct": 0,
        "sort_order": 60,
        "max_recording_minutes": 120,
        "is_byok": True,
        "ai_enabled": True,
        "is_featured": False,
        "enabled": True,
    },
]


async def seed_plans(session: AsyncSession) -> None:
    for plan in PLANS:
        stmt = (
            insert(SubscriptionPlan)
            .values(**plan)
            .on_conflict_do_update(
                index_elements=[SubscriptionPlan.id],
                set_={
                    "name": plan["name"],
                    "tagline": plan["tagline"],
                    "price_egp": plan["price_egp"],
                    "base_credits": plan["base_credits"],
                    "bonus_pct": plan["bonus_pct"],
                    "sort_order": plan["sort_order"],
                    "max_recording_minutes": plan["max_recording_minutes"],
                    "is_byok": plan["is_byok"],
                    "ai_enabled": plan["ai_enabled"],
                    "is_featured": plan["is_featured"],
                    "enabled": plan["enabled"],
                },
            )
        )
        await session.execute(stmt)
