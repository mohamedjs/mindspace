import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notes.models import StickyNote
from app.modules.spaces.models import Space
from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_note_crud_and_child_promotion(
    as_alice: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
):
    space_id = alice.space.id

    # 1. Create parent note
    p_resp = await as_alice.post(
        f"/spaces/{space_id}/notes",
        json={"content": "Parent Note", "type": "idea", "x": 100.0, "y": 200.0},
    )
    assert p_resp.status_code == 201
    parent = p_resp.json()
    parent_id = parent["id"]

    # 2. Create child note
    c_resp = await as_alice.post(
        f"/spaces/{space_id}/notes",
        json={
            "content": "Child Note",
            "type": "task",
            "x": 120.0,
            "y": 250.0,
            "parent_id": parent_id,
        },
    )
    assert c_resp.status_code == 201
    child = c_resp.json()
    child_id = child["id"]
    assert child["parent_id"] == parent_id

    # Check space note_count incremented
    space = await session.get(Space, space_id, populate_existing=True)
    assert space.note_count == 2

    # 3. Update note content
    patch_resp = await as_alice.patch(
        f"/notes/{parent_id}/content",
        json={"title": "Updated Parent", "content": "Updated Parent Content"},
    )
    assert patch_resp.status_code == 204

    # 4. Update note position (must not fail)
    pos_resp = await as_alice.patch(
        f"/notes/{parent_id}/position",
        json={"x": 500.0, "y": 600.0},
    )
    assert pos_resp.status_code == 204

    # 5. Move notes in bulk
    move_resp = await as_alice.post(
        "/notes/move",
        json={
            "moves": [
                {"id": parent_id, "x": 10.0, "y": 20.0},
                {"id": child_id, "x": 30.0, "y": 40.0},
            ]
        },
    )
    assert move_resp.status_code == 204

    # Verify positions
    n1 = await session.get(StickyNote, parent_id)
    n2 = await session.get(StickyNote, child_id)
    assert n1.x == 10.0
    assert n2.x == 30.0

    # 6. Delete parent note -> verify soft delete & child promotion
    del_resp = await as_alice.delete(f"/notes/{parent_id}")
    assert del_resp.status_code == 204

    # Check parent is soft deleted
    p_fresh = await session.get(StickyNote, parent_id, populate_existing=True)
    assert p_fresh.deleted_at is not None

    # Check child is promoted (parent_id = None) and still live
    c_fresh = await session.get(StickyNote, child_id, populate_existing=True)
    assert c_fresh.deleted_at is None
    assert c_fresh.parent_id is None

    # Check space note_count decremented
    space_after = await session.get(Space, space_id, populate_existing=True)
    assert space_after.note_count == 1


@pytest.mark.asyncio
async def test_notes_tenant_isolation(
    as_alice: AsyncClient,
    as_bob: AsyncClient,
    alice: UserCtx,
    bob: UserCtx,
):
    # Alice creates a note in her space
    resp = await as_alice.post(
        f"/spaces/{alice.space.id}/notes",
        json={"content": "Alice Secret Note", "x": 0.0, "y": 0.0},
    )
    note_id = resp.json()["id"]

    # Bob cannot view note
    get_resp = await as_bob.get(f"/notes/{note_id}")
    assert get_resp.status_code == 404

    # Bob cannot patch note
    patch_resp = await as_bob.patch(
        f"/notes/{note_id}/content",
        json={"content": "Bob Overwrite"},
    )
    assert patch_resp.status_code == 404

    # Bob cannot delete note
    del_resp = await as_bob.delete(f"/notes/{note_id}")
    assert del_resp.status_code == 404


@pytest.mark.asyncio
async def test_groups_crud(as_alice: AsyncClient, alice: UserCtx, session: AsyncSession):
    space_id = alice.space.id

    # Create group
    create_resp = await as_alice.post(
        f"/spaces/{space_id}/groups",
        json={
            "title": "Sprint 1",
            "x": 100.0,
            "y": 100.0,
            "width": 500.0,
            "height": 400.0,
            "color": "#ff0000",
        },
    )
    assert create_resp.status_code == 201
    group = create_resp.json()
    group_id = group["id"]
    assert group["title"] == "Sprint 1"

    # List groups
    list_resp = await as_alice.get(f"/spaces/{space_id}/groups")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # Patch group
    patch_resp = await as_alice.patch(f"/groups/{group_id}", json={"title": "Sprint 1 - Complete"})
    assert patch_resp.status_code == 204

    # Delete group
    del_resp = await as_alice.delete(f"/groups/{group_id}")
    assert del_resp.status_code == 204

    # Verify not in list
    list_resp2 = await as_alice.get(f"/spaces/{space_id}/groups")
    assert len(list_resp2.json()) == 0
