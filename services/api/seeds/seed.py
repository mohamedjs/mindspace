import asyncio
import logging

from app.core.db import async_session_factory, engine
from seeds.ai_models import seed_ai_models
from seeds.packages import seed_packages
from seeds.plans import seed_plans

logger = logging.getLogger("seeds.seed")


async def run_seed() -> None:
    logging.basicConfig(level=logging.INFO)
    logger.info("Running database seed...")

    async with async_session_factory() as session:
        async with session.begin():
            logger.info("Seeding credit packages...")
            await seed_packages(session)
            logger.info("Seeding subscription plans...")
            await seed_plans(session)
            logger.info("Seeding AI models...")
            await seed_ai_models(session)

    await engine.dispose()
    logger.info("Database seed complete.")


def main() -> None:
    asyncio.run(run_seed())


if __name__ == "__main__":
    main()
