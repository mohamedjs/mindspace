import pytest
from httpx import AsyncClient

from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_timeline_recording_and_no_event_on_position_change(
    as_alice: AsyncClient,
    alice: UserCtx,
):
    space_id = alice.space.id

    # Check initial timeline
    t0 = await as_alice.get(f"/spaces/{space_id}/timeline")
    assert t0.status_code == 200
    initial_count = len(t0.json())

    # 1. Create a note -> emits "note_created"
    resp = await as_alice.post(
        f"/spaces/{space_id}/notes",
        json={"content": "Important Discovery", "x": 50.0, "y": 50.0},
    )
    note_id = resp.json()["id"]

    t1 = await as_alice.get(f"/spaces/{space_id}/timeline")
    assert len(t1.json()) == initial_count + 1
    assert t1.json()[0]["type"] == "note_created"
    assert t1.json()[0]["summary"] == "Important Discovery"

    # 2. Update position -> MUST NOT emit timeline event!
    await as_alice.patch(f"/notes/{note_id}/position", json={"x": 200.0, "y": 300.0})

    t2 = await as_alice.get(f"/spaces/{space_id}/timeline")
    assert len(t2.json()) == initial_count + 1  # No increase!

    # 3. Update content -> emits "note_updated"
    await as_alice.patch(
        f"/notes/{note_id}/content",
        json={"title": "New Title", "content": "Updated Content"},
    )

    t3 = await as_alice.get(f"/spaces/{space_id}/timeline")
    assert len(t3.json()) == initial_count + 2
    assert t3.json()[0]["type"] == "note_updated"
    assert t3.json()[0]["summary"] == "New Title"

    # 4. Delete note -> emits "note_deleted"
    await as_alice.delete(f"/notes/{note_id}")

    t4 = await as_alice.get(f"/spaces/{space_id}/timeline")
    assert len(t4.json()) == initial_count + 3
    assert t4.json()[0]["type"] == "note_deleted"
