import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.modules.credits.jobs import (
    run_expire_stale_reservations_job,
    run_monthly_refills_job,
)

logger = logging.getLogger("app.scheduler")

scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    # 1. Expire stale reservations every 1 minute
    scheduler.add_job(
        run_expire_stale_reservations_job,
        trigger=IntervalTrigger(minutes=1),
        id="expire_stale_reservations",
        replace_existing=True,
    )

    # 2. Monthly refills daily at midnight UTC
    scheduler.add_job(
        run_monthly_refills_job,
        trigger=CronTrigger(hour=0, minute=0),
        id="monthly_refills",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler initialized with recurring credit jobs")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
