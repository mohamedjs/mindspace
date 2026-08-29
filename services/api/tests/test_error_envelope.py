import pytest
from httpx import ASGITransport, AsyncClient

from app.core.errors import ForbiddenError, InsufficientCreditsError, NotFoundError
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_404_error_envelope():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/non-existent-route")
        assert resp.status_code == 404
        body = resp.json()
        assert "error" in body
        assert "message" in body
        assert body["error"] == "not_found"


@pytest.mark.asyncio
async def test_custom_app_error_envelope():
    # Register a temporary route to test custom AppError subclasses
    @app.get("/test-error/not-found")
    async def _route_404():
        raise NotFoundError("recording_not_found", "Recording not found")

    @app.get("/test-error/forbidden")
    async def _route_403():
        raise ForbiddenError("You cannot access this")

    @app.get("/test-error/credits")
    async def _route_402():
        raise InsufficientCreditsError("need 10, available 5")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.get("/test-error/not-found")
        assert r1.status_code == 404
        assert r1.json() == {"error": "recording_not_found", "message": "Recording not found"}

        r2 = await client.get("/test-error/forbidden")
        assert r2.status_code == 403
        assert r2.json() == {"error": "forbidden", "message": "You cannot access this"}

        r3 = await client.get("/test-error/credits")
        assert r3.status_code == 402
        assert r3.json() == {"error": "insufficient_credits", "message": "need 10, available 5"}
