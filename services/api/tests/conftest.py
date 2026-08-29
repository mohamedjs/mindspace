from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.models  # noqa: F401
import app.modules.ai.models  # noqa: F401
import app.modules.billing.models  # noqa: F401
import app.modules.byok.models  # noqa: F401
import app.modules.credits.models  # noqa: F401
import app.modules.notes.models  # noqa: F401
import app.modules.recordings.models  # noqa: F401
import app.modules.spaces.models  # noqa: F401
import app.modules.timeline.models  # noqa: F401
from app.core.db import async_session_factory
from app.main import app as fastapi_app
from tests.factories import UserCtx, create_user_ctx


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as s:
        yield s


@pytest.fixture(autouse=True)
async def clean_db() -> None:
    async with async_session_factory() as session:
        async with session.begin():
            await session.execute(text("DELETE FROM users"))


@pytest.fixture
async def app_client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def alice() -> UserCtx:
    async with async_session_factory() as session:
        async with session.begin():
            return await create_user_ctx(session, email="alice@example.com", full_name="Alice")


@pytest.fixture
async def bob() -> UserCtx:
    async with async_session_factory() as session:
        async with session.begin():
            return await create_user_ctx(session, email="bob@example.com", full_name="Bob")


@pytest.fixture
async def as_alice(alice: UserCtx) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=alice.headers
    ) as client:
        yield client


@pytest.fixture
async def as_bob(bob: UserCtx) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=bob.headers
    ) as client:
        yield client
