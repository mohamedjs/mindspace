from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.db import engine
from app.core.exception_handlers import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.modules.ai.router import ai_router
from app.modules.auth.router import account_router, auth_router
from app.modules.billing.router import billing_router
from app.modules.byok.router import byok_router
from app.modules.credits.router import credits_router
from app.modules.notes.router import notes_router
from app.modules.recordings.router import recordings_router
from app.modules.spaces.router import spaces_router
from app.modules.storage.router import storage_router
from app.modules.timeline.router import timeline_router

logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.api_log_level)
    logger.info("Starting MindSpace API (env=%s)", settings.api_env)

    # APScheduler start if enabled
    if settings.run_scheduler:
        try:
            from app.scheduler import start_scheduler, stop_scheduler

            start_scheduler()
            logger.info("APScheduler started")
        except Exception as e:
            logger.warning("Could not start APScheduler: %s", e)

    yield

    if settings.run_scheduler:
        try:
            from app.scheduler import stop_scheduler

            stop_scheduler()
            logger.info("APScheduler stopped")
        except Exception:
            pass

    await engine.dispose()
    logger.info("MindSpace API stopped")


app = FastAPI(
    title="MindSpace API",
    version="0.1.0",
    lifespan=lifespan,
)

# Exception handlers
register_exception_handlers(app)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router)
app.include_router(account_router)
app.include_router(spaces_router)
app.include_router(notes_router)
app.include_router(timeline_router)
app.include_router(credits_router)
app.include_router(byok_router)
app.include_router(storage_router)
app.include_router(recordings_router)
app.include_router(ai_router)
app.include_router(billing_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready() -> dict[str, Any]:
    db_status = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e}"

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "storage": "ok",
    }
