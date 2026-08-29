from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.credits.models import CreditPackage

PACKAGES = [
    {
        "id": "starter_50",
        "name": "Starter 50",
        "price_egp": 50,
        "base_credits": 500,
        "bonus_pct": 0,
        "sort_order": 10,
        "is_featured": False,
        "enabled": True,
    },
    {
        "id": "regular_100",
        "name": "Regular 100",
        "price_egp": 100,
        "base_credits": 1000,
        "bonus_pct": 10,
        "sort_order": 20,
        "is_featured": True,
        "enabled": True,
    },
    {
        "id": "pro_250",
        "name": "Pro 250",
        "price_egp": 250,
        "base_credits": 2500,
        "bonus_pct": 25,
        "sort_order": 30,
        "is_featured": False,
        "enabled": True,
    },
    {
        "id": "max_500",
        "name": "Max 500",
        "price_egp": 500,
        "base_credits": 5000,
        "bonus_pct": 40,
        "sort_order": 40,
        "is_featured": False,
        "enabled": True,
    },
]


async def seed_packages(session: AsyncSession) -> None:
    for pkg in PACKAGES:
        stmt = (
            insert(CreditPackage)
            .values(**pkg)
            .on_conflict_do_update(
                index_elements=[CreditPackage.id],
                set_={
                    "name": pkg["name"],
                    "price_egp": pkg["price_egp"],
                    "base_credits": pkg["base_credits"],
                    "bonus_pct": pkg["bonus_pct"],
                    "sort_order": pkg["sort_order"],
                    "is_featured": pkg["is_featured"],
                    "enabled": pkg["enabled"],
                },
            )
        )
        await session.execute(stmt)
