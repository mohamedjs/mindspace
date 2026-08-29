import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_space_crud(as_alice: AsyncClient, alice: UserCtx, session: AsyncSession):
    # List spaces
    resp = await as_alice.get("/spaces")
    assert resp.status_code == 200
    spaces = resp.json()
    assert len(spaces) >= 1
    assert spaces[0]["name"] == "My MindSpace"

    # Create new space
    create_resp = await as_alice.post("/spaces", json={"name": "Work Project", "emoji": "💼"})
    assert create_resp.status_code == 201
    new_space = create_resp.json()
    assert new_space["name"] == "Work Project"
    assert new_space["emoji"] == "💼"
    space_id = new_space["id"]

    # Rename space
    patch_resp = await as_alice.patch(f"/spaces/{space_id}", json={"name": "Renamed Project"})
    assert patch_resp.status_code == 204

    # Verify rename
    list_resp = await as_alice.get("/spaces")
    names = [s["name"] for s in list_resp.json()]
    assert "Renamed Project" in names

    # Delete space (soft delete)
    del_resp = await as_alice.delete(f"/spaces/{space_id}")
    assert del_resp.status_code == 204

    # Verify not in list
    list_resp2 = await as_alice.get("/spaces")
    names2 = [s["name"] for s in list_resp2.json()]
    assert "Renamed Project" not in names2


@pytest.mark.asyncio
async def test_space_tenant_isolation(
    as_alice: AsyncClient,
    as_bob: AsyncClient,
    alice: UserCtx,
    bob: UserCtx,
):
    # Alice creates a space
    resp = await as_alice.post("/spaces", json={"name": "Alice Private"})
    space_id = resp.json()["id"]

    # Bob cannot patch it
    patch_resp = await as_bob.patch(f"/spaces/{space_id}", json={"name": "Bob Hacked"})
    assert patch_resp.status_code == 404
    assert patch_resp.json()["error"] == "space_not_found"

    # Bob cannot delete it
    del_resp = await as_bob.delete(f"/spaces/{space_id}")
    assert del_resp.status_code == 404
    assert del_resp.json()["error"] == "space_not_found"
